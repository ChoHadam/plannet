// Isolated source copy: Next cannot rewrite the developer's .next, next-env or tsconfig.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// ISOLATED_WEB_PORT: 다른 격리 스위트(ux-foundation 등)가 같은 빌드 절차를 다른 포트로 쓴다.
const port = process.env.ISOLATED_WEB_PORT || '3640';
const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'plannet-period-import-'));
for (const entry of ['src', 'public', 'package.json', 'next.config.ts', 'postcss.config.mjs']) {
  fs.cpSync(path.join(webDir, entry), path.join(tempDir, entry), { recursive: true });
}
// Use next start for this temporary copy: standalone tracing cannot package the external node_modules symlink.
const configPath = path.join(tempDir, 'next.config.ts');
fs.writeFileSync(configPath, fs.readFileSync(configPath, 'utf8').replace('output: "standalone",', ''));
fs.symlinkSync(path.resolve(webDir, '../../node_modules'), path.join(tempDir, 'node_modules'), 'dir');
const tsconfig = JSON.parse(fs.readFileSync(path.join(webDir, 'tsconfig.json'), 'utf8'));
tsconfig.include = ['next-env.d.ts', 'src/**/*.ts', 'src/**/*.tsx', '.next/types/**/*.ts'];
fs.writeFileSync(path.join(tempDir, 'tsconfig.json'), JSON.stringify(tsconfig));

const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  !/^(AUTH_|API_INTERNAL_URL|OPENGATEWAY_|AI_|LOCAL_BACKUP|APP_ORIGINS|NEXT_DIST_DIR|NEXT_TSCONFIG_PATH)/.test(key)));
Object.assign(env, {
  __NEXT_PROCESSED_ENV: 'true', NEXT_TELEMETRY_DISABLED: '1',
  AUTH_ENABLED: 'false', LOCAL_BACKUP_ENABLED: 'false',
});
const next = path.join(webDir, '../../node_modules/next/dist/bin/next');
const build = spawnSync(process.execPath, [next, 'build', '--webpack'], {
  cwd: tempDir, env, stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);

console.log(`[period-import] isolated build: ${tempDir}`);
const server = spawn(process.execPath, [next, 'start', '-H', '127.0.0.1', '-p', port], {
  cwd: tempDir, env, stdio: 'inherit',
});
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
server.on('exit', (code) => process.exit(code ?? 0));
