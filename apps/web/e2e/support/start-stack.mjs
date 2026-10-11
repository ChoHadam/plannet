/**
 * E2E 스택 실행기 (Playwright webServer에서 호출).
 *
 * 1. 인증 관련 환경변수 없이 프로덕션 빌드를 한 번 만든다.
 *    → 같은 빌드가 실행 시점 환경변수만으로 인증 UI를 켜고 끄는지 검증할 수 있다.
 * 2. 같은 빌드로 설정이 다른 Web 서버 4개, 모의 API, edge proxy를 전용 포트에 띄운다.
 *
 * 안전장치:
 * - .env* 파일을 읽지 않는다(__NEXT_PROCESSED_ENV). 개발자의 실제 AI 키가 섞이지 않는다.
 * - 모든 Web 서버의 AI 주소는 모의 서버로 고정한다. 외부 AI를 호출하지 않는다.
 * - 백업 디렉터리는 .next/e2e-local-backup 임시 경로를 쓴다. 실제 .local-backup을 건드리지 않는다.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEdgeProxy } from './edge-proxy.mjs';
import { startMockAuthApi } from './mock-auth-api.mjs';
import { E2E_DIST_DIR, HOST, MOCK_AI_PATH, PORTS, READY_PATH } from './stack.config.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const distDir = path.join(webDir, E2E_DIST_DIR);
// test-results는 Playwright가 실행 중 비우므로 빌드 디렉터리 옆(gitignore 대상)에 둔다.
const backupDir = path.join(webDir, '.next', 'e2e-local-backup');

// 부모 셸에서 들어온 인증·AI·백업 설정은 모두 버린다. 각 서버에 필요한 값만 명시한다.
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
    NEXT_DIST_DIR: E2E_DIST_DIR,
    NEXT_TSCONFIG_PATH: 'tsconfig.e2e.json',
  };
}

const MOCK_AI_ENV = {
  OPENGATEWAY_API_KEY: 'e2e-fake-key',
  OPENGATEWAY_BASE_URL: `http://${HOST}:${PORTS.mockApi}${MOCK_AI_PATH}`,
  OPENGATEWAY_MODEL: 'mock-model',
};

const WEB_SERVERS = [
  {
    name: 'web-local',
    port: PORTS.webLocal,
    env: { ...MOCK_AI_ENV, LOCAL_BACKUP_ENABLED: 'true', LOCAL_BACKUP_DIR: backupDir },
  },
  {
    name: 'web-public',
    port: PORTS.webPublic,
    env: {
      ...MOCK_AI_ENV,
      AUTH_ENABLED: 'true',
      API_INTERNAL_URL: `http://${HOST}:${PORTS.mockApi}`,
      AUTH_API_TIMEOUT_MS: '1000',
      AI_RATE_LIMIT_PER_MINUTE: '3',
      // 명시적으로 켜도 인증이 켜진 환경에서는 막혀야 한다.
      LOCAL_BACKUP_ENABLED: 'true',
      LOCAL_BACKUP_DIR: backupDir,
    },
  },
  { name: 'web-bare', port: PORTS.webBare, env: { ...MOCK_AI_ENV, LOCAL_BACKUP_DIR: backupDir } },
  {
    name: 'web-misconfigured',
    port: PORTS.webMisconfigured,
    env: { ...MOCK_AI_ENV, AUTH_ENABLED: 'true', LOCAL_BACKUP_DIR: backupDir },
  },
];

function log(message) {
  console.log(`[e2e-stack] ${message}`);
}

function build() {
  if (process.env.E2E_SKIP_BUILD === '1' && fs.existsSync(path.join(distDir, 'BUILD_ID'))) {
    log('reusing existing e2e build (E2E_SKIP_BUILD=1)');
    return;
  }
  log(`building into ${E2E_DIST_DIR} (no auth env)`);
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

/** Dockerfile과 같은 방식으로 static·public을 standalone 옆에 둔다. */
function prepareStandalone(serverJs) {
  const appDir = path.dirname(serverJs);
  fs.cpSync(path.join(distDir, 'static'), path.join(appDir, E2E_DIST_DIR, 'static'), { recursive: true });
  fs.cpSync(path.join(webDir, 'public'), path.join(appDir, 'public'), { recursive: true });
  // 빌드 중 복사됐을 수 있는 .env* 파일을 지운다. 실행 시 개발자 비밀값이 섞이지 않게 한다.
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

  // edge는 모든 서버가 준비된 뒤에 연다. Playwright는 edge의 ready 경로로 준비 완료를 판단한다.
  await startEdgeProxy({ port: PORTS.edge, webPort: PORTS.webPublic, apiPort: PORTS.mockApi, readyPath: READY_PATH });
  log(`edge on ${PORTS.edge} → web ${PORTS.webPublic} / api ${PORTS.mockApi}`);
}

main().catch((error) => {
  console.error('[e2e-stack] failed:', error);
  shutdown();
  process.exit(1);
});
