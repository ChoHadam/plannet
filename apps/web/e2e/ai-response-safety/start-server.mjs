/**
 * ai-response-safety 전용 Web 서버 (Playwright webServer에서 호출).
 *
 * - 현재 작업 트리의 apps/web을 비밀 파일 없이 별도 사본으로 복사해 빌드한다.
 *   (.env*·.local-backup·.next·test-results 제외, .env 자동 로드 끔)
 *   → 개발자의 .next·next-env.d.ts·tsconfig를 건드리지 않고, 다른 세션의 빌드와도 섞이지 않는다.
 * - 인증·AI는 서버에 설정하지 않는다. 테스트가 브라우저에서 /api/runtime-config·/api/v1/*·/api/chat을
 *   가로채 지연·실패를 제어한다. 외부 AI를 호출하지 않는다.
 *
 * 환경변수
 * - AIRS_WORK_DIR: 사본 위치 (기본: OS 임시 디렉터리/plannet-ai-response-safety)
 * - AIRS_SKIP_SYNC=1: 사본을 다시 복사하지 않는다 (사본을 직접 바꿔 대조 실행할 때)
 * - AIRS_SKIP_BUILD=1: 기존 빌드를 재사용한다
 * - AIRS_PORT: 기본 3520 대신 사용할 격리 포트
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AIRS_HOST, AIRS_PORT } from './server.config.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const repoDir = path.resolve(webDir, '../..');
const workDir = process.env.AIRS_WORK_DIR || path.join(os.tmpdir(), 'plannet-ai-response-safety');
const copyWebDir = path.join(workDir, 'apps', 'web');

const EXCLUDED = new Set(['.env', '.local-backup', '.next', 'test-results', 'node_modules', 'playwright-report']);
const isExcluded = (name) => EXCLUDED.has(name) || name.startsWith('.env') || name.endsWith('.tsbuildinfo');

function log(message) {
  console.log(`[ai-response-safety] ${message}`);
}

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (isExcluded(entry.name)) continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else if (entry.isFile()) fs.copyFileSync(source, target);
  }
}

function syncCopy() {
  if (process.env.AIRS_SKIP_SYNC === '1' && fs.existsSync(copyWebDir)) {
    log(`reusing copy at ${workDir} (AIRS_SKIP_SYNC=1)`);
    return;
  }
  log(`copying apps/web → ${copyWebDir}`);
  fs.rmSync(copyWebDir, { recursive: true, force: true });
  copyTree(webDir, copyWebDir);
  for (const file of ['package.json', 'package-lock.json']) {
    fs.copyFileSync(path.join(repoDir, file), path.join(workDir, file));
  }
  const modules = path.join(workDir, 'node_modules');
  if (!fs.existsSync(modules)) {
    // APFS clone(cp -c)은 공간을 거의 쓰지 않는다. 실패하면 일반 복사.
    log('cloning node_modules (first run only)');
    const cloned = spawnSync('cp', ['-c', '-R', path.join(repoDir, 'node_modules'), modules], { stdio: 'inherit' });
    if (cloned.status !== 0) fs.cpSync(path.join(repoDir, 'node_modules'), modules, { recursive: true });
  }
}

function env() {
  const base = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!/^(AUTH_|API_INTERNAL_URL|OPENGATEWAY_|AI_|LOCAL_BACKUP|APP_ORIGINS|NEXT_DIST_DIR|NEXT_TSCONFIG_PATH)/.test(key)) {
      base[key] = value;
    }
  }
  return { ...base, __NEXT_PROCESSED_ENV: 'true', NEXT_TELEMETRY_DISABLED: '1' };
}

function build() {
  const distDir = path.join(copyWebDir, '.next');
  if (process.env.AIRS_SKIP_BUILD === '1' && fs.existsSync(path.join(distDir, 'BUILD_ID'))) {
    log('reusing existing build (AIRS_SKIP_BUILD=1)');
    return;
  }
  log('building copy');
  const result = spawnSync('npx', ['next', 'build'], { cwd: copyWebDir, env: env(), stdio: 'inherit' });
  if (result.status !== 0) throw new Error('next build failed');
}

function prepareStandalone() {
  const distDir = path.join(copyWebDir, '.next');
  const candidates = [
    path.join(distDir, 'standalone', 'apps', 'web', 'server.js'),
    path.join(distDir, 'standalone', 'server.js'),
  ];
  const serverJs = candidates.find((candidate) => fs.existsSync(candidate));
  if (!serverJs) throw new Error('standalone server.js not found');
  const appDir = path.dirname(serverJs);
  fs.cpSync(path.join(distDir, 'static'), path.join(appDir, '.next', 'static'), { recursive: true });
  fs.cpSync(path.join(copyWebDir, 'public'), path.join(appDir, 'public'), { recursive: true });
  for (const entry of fs.readdirSync(appDir)) {
    if (entry.startsWith('.env')) fs.rmSync(path.join(appDir, entry));
  }
  return serverJs;
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

async function main() {
  syncCopy();
  build();
  const serverJs = prepareStandalone();
  const child = spawn(process.execPath, [serverJs], {
    cwd: path.dirname(serverJs),
    env: { ...env(), NODE_ENV: 'production', PORT: String(AIRS_PORT), HOSTNAME: AIRS_HOST },
    stdio: 'inherit',
  });
  const shutdown = () => {
    child.kill('SIGTERM');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  child.on('exit', (code) => {
    log(`web exited (${code})`);
    process.exit(code ?? 1);
  });
  await waitForHttp(`http://${AIRS_HOST}:${AIRS_PORT}/api/runtime-config`);
  log(`web on ${AIRS_HOST}:${AIRS_PORT}`);
}

main().catch((error) => {
  console.error('[ai-response-safety] failed:', error);
  process.exit(1);
});
