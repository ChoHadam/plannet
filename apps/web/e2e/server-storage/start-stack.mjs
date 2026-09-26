// Isolated real PostgreSQL + real Spring OAuth/session/storage + production Web.
// No developer secrets, existing databases, or real external providers are used.
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startEdgeProxy } from '../support/edge-proxy.mjs';
import { startOidc, CLIENT_ID, CLIENT_SECRET } from './oidc.mjs';
import { DIST_DIR, HOST, ISSUER, ORIGIN, PORTS, READY_PATH } from './config.mjs';

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const root = path.resolve(webDir, '../..');
const container = `plannet-storage-e2e-${crypto.randomBytes(6).toString('hex')}`;
const databasePassword = crypto.randomBytes(24).toString('hex');
const image = 'postgres:18.6-bookworm';
const children = new Set();
let api;
let ownsContainer = false;
let closing = false;
let databaseName = 'plannet_storage_e2e';
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'plannet-storage-e2e-'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function baseEnv() {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(AUTH_|GOOGLE_|PLANNET_|OPENGATEWAY_|AI_|API_INTERNAL_URL|LOCAL_BACKUP|APP_ORIGINS|SPRING_|POSTGRES_|PGPASSWORD|DATABASE_|NEXT_DIST_DIR|NEXT_TSCONFIG_PATH)/.test(key)));
  return { ...env, __NEXT_PROCESSED_ENV: 'true', NEXT_TELEMETRY_DISABLED: '1', NEXT_DIST_DIR: DIST_DIR, NEXT_TSCONFIG_PATH: 'e2e/server-storage/tsconfig.json' };
}
function run(cmd, args, extra = {}) {
  const result = spawnSync(cmd, args, { cwd: root, env: baseEnv(), stdio: 'inherit', ...extra });
  if (result.status !== 0) throw new Error(`${cmd} failed (${result.status})`);
}
function child(cmd, args, extra = {}) {
  const process = spawn(cmd, args, { cwd: root, env: baseEnv(), stdio: 'inherit', ...extra });
  children.add(process);
  process.on('exit', () => children.delete(process));
  return process;
}
async function ready(url, timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* startup */ }
    await delay(200);
  }
  throw new Error(`Not ready: ${url}`);
}
async function startApi() {
  const libDir = path.join(root, 'apps/api/build/libs');
  const jar = fs.readdirSync(libDir).find(name => name.endsWith('.jar') && !name.endsWith('-plain.jar'));
  if (!jar) throw new Error('API boot jar missing');
  api = child('java', ['-jar', path.join(libDir, jar)], { env: {
    ...baseEnv(), SERVER_ADDRESS: HOST, SERVER_PORT: String(PORTS.api),
    PLANNET_STORAGE_ENABLED: 'true', PLANNET_DB_URL: `jdbc:postgresql://${HOST}:${PORTS.postgres}/${databaseName}`,
    PLANNET_DB_USERNAME: 'plannet_app', PLANNET_DB_PASSWORD: databasePassword,
    GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: `${ORIGIN}/login/oauth2/code/google`,
    PLANNET_AUTH_GOOGLE_PROVIDER_ISSUERURI: ISSUER,
    PLANNET_AUTH_GOOGLE_PROVIDER_AUTHORIZATIONURI: `${ISSUER}/authorize`,
    PLANNET_AUTH_GOOGLE_PROVIDER_TOKENURI: `${ISSUER}/token`,
    PLANNET_AUTH_GOOGLE_PROVIDER_JWKSETURI: `${ISSUER}/jwks`,
    PLANNET_AUTH_GOOGLE_PROVIDER_USERINFOURI: `${ISSUER}/userinfo`,
  } });
  await ready(`http://${HOST}:${PORTS.api}/api/v1/health`);
}
async function stopApi() {
  if (!api || api.exitCode !== null) return;
  const target = api;
  const stopped = new Promise(resolve => target.once('exit', resolve));
  target.kill('SIGTERM');
  const timer = setTimeout(() => target.kill('SIGKILL'), 5000);
  await stopped;
  clearTimeout(timer);
}
async function shutdown(code = 0) {
  if (closing) return;
  closing = true;
  for (const target of children) target.kill('SIGTERM');
  if (ownsContainer) spawnSync('docker', ['rm', '--force', '--volumes', container], { stdio: 'ignore' });
  fs.rmSync(scratch, { recursive: true, force: true });
  process.exit(code);
}

async function restoreDatabase() {
  await stopApi();
  const source = databaseName;
  const target = `plannet_restored_${crypto.randomBytes(6).toString('hex')}`;
  const archive = path.join(scratch, `${target}.dump`);
  const fd = fs.openSync(archive, 'wx', 0o600);
  try {
    run('docker', ['exec', '--env', 'PGPASSWORD', container, 'pg_dump', '-h', '127.0.0.1', '-U', 'plannet_app', '-d', source, '--format=custom'], {
      env: { ...baseEnv(), PGPASSWORD: databasePassword }, stdio: ['ignore', fd, 'inherit'],
    });
  } finally { fs.closeSync(fd); }
  run('docker', ['exec', container, 'createdb', '-U', 'postgres', '--owner=plannet_app', target]);
  run('docker', ['exec', '-i', '--env', 'PGPASSWORD', container, 'pg_restore', '-h', '127.0.0.1', '-U', 'plannet_app', '-d', target, '--single-transaction', '--exit-on-error', '--no-owner', '--no-privileges'], {
    env: { ...baseEnv(), PGPASSWORD: databasePassword }, input: fs.readFileSync(archive), stdio: ['pipe', 'ignore', 'inherit'],
  });
  const digest = (database) => {
    const statements = ['plannet_user', 'planner_record', 'planner_commit_receipt', 'flyway_schema_history']
      .map(table => `SELECT md5(coalesce(string_agg(rowdata, E'\\n' ORDER BY rowdata), '')) FROM (SELECT to_jsonb(t)::text AS rowdata FROM ${table} t) s;`).join('\n');
    const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-At', '-v', 'ON_ERROR_STOP=1'], { input: statements, encoding: 'utf8' });
    if (result.status !== 0) throw new Error('Restored database comparison failed');
    return result.stdout;
  };
  if (digest(source) !== digest(target)) throw new Error('Restored database data differs');
  databaseName = target;
  await startApi();
}
async function main() {
  for (const port of Object.values(PORTS)) {
    const probe = net.createServer();
    await new Promise((resolve, reject) => probe.once('error', reject).listen(port, HOST, resolve));
    await new Promise(resolve => probe.close(resolve));
  }
  process.on('SIGTERM', () => { void shutdown(); });
  process.on('SIGINT', () => { void shutdown(); });
  run('docker', ['run', '--detach', '--name', container, '--publish', `${HOST}:${PORTS.postgres}:5432`, '--env', 'POSTGRES_PASSWORD', image], {
    env: { ...baseEnv(), POSTGRES_PASSWORD: databasePassword }, stdio: ['ignore', 'ignore', 'inherit'],
  });
  ownsContainer = true;
  for (let attempt = 0; ; attempt++) {
    if (spawnSync('docker', ['exec', container, 'pg_isready', '-U', 'postgres'], { stdio: 'ignore' }).status === 0) break;
    if (attempt > 100) throw new Error('PostgreSQL startup failed');
    await delay(200);
  }
  // Generated hex test password is passed on stdin, never printed or put in process args.
  run('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'], {
    input: `CREATE ROLE plannet_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${databasePassword}';\nCREATE DATABASE plannet_storage_e2e OWNER plannet_app;\n`,
    stdio: ['pipe', 'ignore', 'inherit'],
  });
  console.log('[storage-e2e] PostgreSQL ready with non-superuser application role');
  run('./gradlew', ['--no-daemon', '--console=plain', ':apps:api:bootJar']);
  run('npx', ['next', 'build'], { cwd: webDir });
  const standalone = path.join(webDir, DIST_DIR, 'standalone/apps/web');
  fs.cpSync(path.join(webDir, DIST_DIR, 'static'), path.join(standalone, DIST_DIR, 'static'), { recursive: true });
  fs.cpSync(path.join(webDir, 'public'), path.join(standalone, 'public'), { recursive: true });
  for (const entry of fs.readdirSync(standalone)) if (entry.startsWith('.env')) fs.rmSync(path.join(standalone, entry));
  await startOidc();
  await startApi();
  child(process.execPath, [path.join(standalone, 'server.js')], { cwd: standalone, env: {
    ...baseEnv(), NODE_ENV: 'production', HOSTNAME: HOST, PORT: String(PORTS.web),
    AUTH_ENABLED: 'true', API_INTERNAL_URL: `http://${HOST}:${PORTS.api}`,
    LOCAL_BACKUP_ENABLED: 'false', APP_ORIGINS: ORIGIN,
    OPENGATEWAY_API_KEY: 'unused-test-key', OPENGATEWAY_BASE_URL: `${ISSUER}/disabled-ai`, OPENGATEWAY_MODEL: 'test',
  } });
  await ready(`http://${HOST}:${PORTS.web}/api/runtime-config`);
  await startEdgeProxy({ port: PORTS.edge, apiPort: PORTS.api, webPort: PORTS.web });
  let restarting = false;
  http.createServer(async (req, res) => {
    if (req.url === '/restart-api' && req.method === 'POST' && !restarting) {
      restarting = true;
      try { await stopApi(); await startApi(); res.writeHead(200); res.end('restarted'); }
      catch { res.writeHead(500); res.end('restart failed'); }
      finally { restarting = false; }
      return;
    }
    if (req.url === '/restore-database' && req.method === 'POST' && !restarting) {
      restarting = true;
      try { await restoreDatabase(); res.writeHead(200); res.end('restored and compared all application tables'); }
      catch { res.writeHead(500); res.end('restore failed'); }
      finally { restarting = false; }
      return;
    }
    res.writeHead(req.url === READY_PATH ? 200 : 404);
    res.end('storage test stack');
  }).listen(PORTS.control, HOST);
  console.log('[storage-e2e] actual Spring + PostgreSQL + Web ready');
}
main().catch(error => { console.error('[storage-e2e]', error.message); void shutdown(1); });
