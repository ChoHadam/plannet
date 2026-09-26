/**
 * plan-library E2E 스택 실행기 (playwright.plan-library.config.ts의 webServer).
 * 공용 e2e/support/start-stack.mjs와 같은 안전장치를 쓰되 전용 포트·빌드 디렉터리를 쓴다.
 *
 * - .env* 파일을 읽지 않는다(__NEXT_PROCESSED_ENV). AI 주소는 모의 서버로 고정한다.
 * - 인증 off 서버만 서버 백업을 켜고, 백업 경로는 .next/plan-library-e2e-backup 임시 경로를 쓴다.
 * - 모의 인증 서버와 edge proxy는 공용 구현(e2e/support)을 읽기 전용으로 재사용한다.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEdgeProxy } from '../support/edge-proxy.mjs';
import { startMockAuthApi } from '../support/mock-auth-api.mjs';
import { DIST_DIR, HOST, MOCK_AI_PATH, PORTS, READY_PATH, TSCONFIG_PATH } from './stack.config.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const distDir = path.join(webDir, DIST_DIR);
// 기존 템플릿 회귀(templates.spec.ts)의 백업 복원 검사용. 실제 .local-backup을 건드리지 않는다.
const backupDir = path.join(webDir, '.next', 'plan-library-e2e-backup');

const SCRUBBED_ENV_PATTERN = /^(AUTH_|API_INTERNAL_URL|OPENGATEWAY_|AI_|LOCAL_BACKUP|APP_ORIGINS|NEXT_DIST_DIR|NEXT_TSCONFIG_PATH)/;

function baseEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!SCRUBBED_ENV_PATTERN.test(key)) env[key] = value;
  }
  return {
    ...env,
    __NEXT_PROCESSED_ENV: 'true',
    NEXT_TELEMETRY_DISABLED: '1',
    NEXT_DIST_DIR: DIST_DIR,
    NEXT_TSCONFIG_PATH: TSCONFIG_PATH,
  };
}

const MOCK_AI_ENV = {
  OPENGATEWAY_API_KEY: 'plan-library-e2e-fake-key',
  OPENGATEWAY_BASE_URL: `http://${HOST}:${PORTS.mockApi}${MOCK_AI_PATH}`,
  OPENGATEWAY_MODEL: 'mock-model',
};

const WEB_SERVERS = [
  {
    name: 'pl-web-local',
    port: PORTS.webLocal,
    env: { ...MOCK_AI_ENV, LOCAL_BACKUP_ENABLED: 'true', LOCAL_BACKUP_DIR: backupDir },
  },
  {
    name: 'pl-web-public',
    port: PORTS.webPublic,
    env: {
      ...MOCK_AI_ENV,
      AUTH_ENABLED: 'true',
      API_INTERNAL_URL: `http://${HOST}:${PORTS.mockApi}`,
      AUTH_API_TIMEOUT_MS: '1000',
    },
  },
];

function log(message) {
  console.log(`[plan-library-stack] ${message}`);
}

function build() {
  if (process.env.E2E_SKIP_BUILD === '1' && fs.existsSync(path.join(distDir, 'BUILD_ID'))) {
    log('reusing existing build (E2E_SKIP_BUILD=1)');
    return;
  }
  log(`building into ${DIST_DIR}`);
  const result = spawnSync('npx', ['next', 'build'], { cwd: webDir, env: baseEnv(), stdio: 'inherit' });
  if (result.status !== 0) throw new Error('next build failed');
}

function findStandaloneServer() {
  const candidates = [
    path.join(distDir, 'standalone', 'apps', 'web', 'server.js'),
    path.join(distDir, 'standalone', 'server.js'),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error(`standalone server.js not found under ${distDir}/standalone`);
  return found;
}

function prepareStandalone(serverJs) {
  const appDir = path.dirname(serverJs);
  fs.cpSync(path.join(distDir, 'static'), path.join(appDir, DIST_DIR, 'static'), { recursive: true });
  fs.cpSync(path.join(webDir, 'public'), path.join(appDir, 'public'), { recursive: true });
  for (const entry of fs.readdirSync(appDir)) {
    if (entry.startsWith('.env')) fs.rmSync(path.join(appDir, entry));
  }
}

const children = [];

function startWebServer(serverJs, { name, port, env }) {
  const child = spawn(process.execPath, [serverJs], {
    cwd: path.dirname(serverJs),
    env: { ...baseEnv(), ...env, NODE_ENV: 'production', PORT: String(port), HOSTNAME: HOST },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const prefix = (chunk) =>
    chunk
      .toString()
      .split('\n')
      .filter(Boolean)
      .forEach((line) => console.log(`[${name}] ${line}`));
  child.stdout.on('data', prefix);
  child.stderr.on('data', prefix);
  child.on('exit', (code) => log(`${name} exited (${code})`));
  children.push(child);
}

function waitForHttp(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() > deadline) reject(new Error(`timeout waiting for ${url}`));
        else setTimeout(attempt, 250);
      });
    };
    attempt();
  });
}

function shutdown() {
  for (const child of children) child.kill('SIGTERM');
  process.exit(0);
}

async function main() {
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  fs.rmSync(backupDir, { recursive: true, force: true });
  build();
  const serverJs = findStandaloneServer();
  prepareStandalone(serverJs);

  await startMockAuthApi(PORTS.mockApi);
  log(`mock api on ${PORTS.mockApi}`);
  for (const server of WEB_SERVERS) startWebServer(serverJs, server);
  await Promise.all(WEB_SERVERS.map(({ port }) => waitForHttp(`http://${HOST}:${port}/api/runtime-config`)));

  await startEdgeProxy({ port: PORTS.edge, webPort: PORTS.webPublic, apiPort: PORTS.mockApi, readyPath: READY_PATH });
  log(`edge on ${PORTS.edge} → web ${PORTS.webPublic} / api ${PORTS.mockApi}`);
}

main().catch((error) => {
  console.error('[plan-library-stack] failed:', error);
  shutdown();
  process.exit(1);
});
