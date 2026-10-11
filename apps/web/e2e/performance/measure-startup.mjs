// Lab measurement of JS transferred at startup against an isolated production build (e2e/period-and-import/start-web.mjs).
// All auth/DB/AI responses are synthetic browser routes. Usage: node e2e/performance/measure-startup.mjs <baseURL> [out.json] [samples]
import fs from 'node:fs';
import { chromium } from '@playwright/test';

const baseURL = process.argv[2];
const out = process.argv[3];
const SAMPLES = Number(process.argv[4] ?? 5);
if (!baseURL) throw new Error('baseURL required');

const TIME = '2026-09-30T00:00:00.000Z';
const USER_ID = 'd4d4d4d4-0000-4000-8000-00000000000d';
const DAILY = {
  id: 'perf-daily', title: '성능 일간', template: 'daily', category: 'daily', year: 2026, month: 9, day: 30, memo: '',
  todos: Array.from({ length: 20 }, (_, i) => ({ id: `perf-todo-${i}`, text: `가상 할 일 ${i}`, completed: false })),
  createdAt: TIME, updatedAt: TIME,
};
const POSITIONS = ['topLeft', 'top', 'topRight', 'left', 'center', 'right', 'bottomLeft', 'bottom', 'bottomRight'];
const MANDALART = {
  id: 'perf-mandalart', title: '성능 만다라트', template: 'mandalart', category: 'annual', year: 2026, createdAt: TIME, updatedAt: TIME,
  grids: POSITIONS.map((position) => ({ id: position, color: '#f1f5f9', cells: Array.from({ length: 9 }, (_, i) => ({ id: `${position}-${i}`, position: i, value: '' })) })),
};
const RECORDS = [['daily', DAILY], ['mandalart', MANDALART]].map(([kind, data]) => ({ kind, id: data.id, schemaVersion: 1, version: 1, deleted: false, data, updatedAt: TIME }));

const SCENARIOS = [
  { name: 'landing-anonymous', auth: false, path: '/', ready: (page) => page.getByRole('button', { name: 'Google 로그인' }).waitFor() },
  { name: 'workspace-home', auth: true, path: '/', ready: (page) => page.getByRole('heading', { name: '최근 작업' }).waitFor() },
  { name: 'workspace-daily-url', auth: true, path: '/?template=daily&plan=perf-daily', ready: (page) => page.getByText('가상 할 일 19').waitFor() },
  { name: 'workspace-mandalart-url', auth: true, path: '/?template=mandalart&plan=perf-mandalart', ready: (page) => page.locator('header input').first().waitFor() },
];

async function routes(context, auth) {
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname === '/api/runtime-config') return route.fulfill({ json: { authEnabled: true, backupEnabled: false } });
    if (url.pathname === '/api/v1/me') {
      return auth
        ? route.fulfill({ json: { authenticated: true, storageEnabled: true, user: { authProvider: 'google', externalSubject: 'perf', name: '가상 사용자', email: 'synthetic.perf@example.test', userId: USER_ID } } })
        : route.fulfill({ status: 401, json: { authenticated: false } });
    }
    if (url.pathname === '/api/v1/csrf') return route.fulfill({ json: { headerName: 'X-PERF-CSRF', token: 'perf' } });
    if (url.pathname === '/api/v1/planner') return route.fulfill({ json: { userId: USER_ID, records: RECORDS } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 503, json: { error: 'blocked_in_measurement' } });
    return route.continue();
  });
}

async function sample(browser, scenario) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, baseURL });
  await routes(context, scenario.auth);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const scripts = new Map();
  cdp.on('Network.responseReceived', (e) => { if (e.type === 'Script') scripts.set(e.requestId, { url: e.response.url, bytes: 0 }); });
  cdp.on('Network.loadingFinished', (e) => { const s = scripts.get(e.requestId); if (s) s.bytes = e.encodedDataLength; });
  const start = Date.now();
  await page.goto(scenario.path);
  await scenario.ready(page);
  const readyMs = Date.now() - start;
  await page.waitForLoadState('networkidle');
  const list = [...scripts.values()];
  await context.close();
  return { readyMs, scriptCount: list.length, scriptBytes: list.reduce((sum, s) => sum + s.bytes, 0), chunks: list.map((s) => new URL(s.url).pathname).sort() };
}

const median = (values) => { const v = [...values].sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
const browser = await chromium.launch();
const results = [];
for (const scenario of SCENARIOS) {
  const runs = [];
  for (let i = 0; i < SAMPLES; i++) runs.push(await sample(browser, scenario));
  results.push({
    scenario: scenario.name, samples: SAMPLES,
    scriptBytesMedian: median(runs.map((r) => r.scriptBytes)), scriptCountMedian: median(runs.map((r) => r.scriptCount)),
    readyMsMedian: median(runs.map((r) => r.readyMs)), readyMsMin: Math.min(...runs.map((r) => r.readyMs)), readyMsMax: Math.max(...runs.map((r) => r.readyMs)),
    chunks: runs[0].chunks,
  });
}
const output = { baseURL, browser: `chromium ${browser.version()} headless`, viewport: '1440x1000', results };
await browser.close();
if (out) fs.writeFileSync(out, JSON.stringify(output, null, 2));
console.log(JSON.stringify(results.map((r) => ({ ...r, chunks: r.chunks.length }))));
