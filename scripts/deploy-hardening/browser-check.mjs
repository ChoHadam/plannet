// deploy-hardening 브라우저 확인: 보안 헤더가 붙은 Web 이미지에서 화면·PNG 내보내기·프레임 차단을 확인한다.
//
//   KEEP_WEB=1 scripts/deploy-hardening/verify.sh           # Web 컨테이너(기본 3510)를 남긴다
//   node scripts/deploy-hardening/browser-check.mjs         # BASE_URL=http://127.0.0.1:3510
//
// 테스트 데이터만 쓴다(빈 로컬 저장소에서 새 플랜 생성). 결과는 OUT_DIR에 스크린샷·PNG로 남긴다.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3510';
const OUT_DIR = process.env.OUT_DIR || join(process.env.TMPDIR || '/tmp', 'plannet-deploy-hardening', 'browser');
const FRAME_HOST_PORT = Number(process.env.FRAME_HOST_PORT || 3512); // 다른 origin에서 iframe 삽입 시도
mkdirSync(OUT_DIR, { recursive: true });

let passed = 0;
let failed = 0;
const check = (desc, ok, detail = '') => {
  ok ? passed++ : failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${desc}${detail ? ` (${detail})` : ''}`);
};

const browser = await chromium.launch();

async function watch(page) {
  const problems = [];
  page.on('dialog', async (d) => { problems.push(`dialog: ${d.message()}`); await d.dismiss(); });
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' || /Content Security Policy|Refused/i.test(m.text())) problems.push(`console: ${m.text()} ${m.location()?.url || ''}`);
  });
  return problems;
}

// 1. 데스크톱: 플랜 생성 → PNG 내보내기
{
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const problems = await watch(page);
  const res = await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  check('desktop / loads', res?.status() === 200, String(res?.status()));
  check('no X-Powered-By on document', !res?.headers()['x-powered-by']);

  await page.getByRole('button', { name: /연간 플랜.*(추가|만들기|새)|새 연간/ }).first().click()
    .catch(async () => page.locator('text=연간 플랜').locator('xpath=..').getByRole('button').first().click());
  await page.getByRole('button', { name: /만다라트/ }).first().click();
  await page.getByRole('button', { name: '확인' }).click();
  await page.getByRole('button', { name: '스킵하기' }).click({ timeout: 5000 }).catch(() => {});
  await page.screenshot({ path: join(OUT_DIR, 'desktop-mandalart.png') });

  await page.getByRole('main').getByRole('button', { name: '메뉴', exact: true }).click(); // Header의 Mandalart 메뉴
  const download = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    page.getByText('이미지 저장').click(),
  ]).then(([d]) => d).catch((e) => { problems.push(`download: ${e.message.split('\n')[0]}`); return null; });
  await page.screenshot({ path: join(OUT_DIR, 'desktop-after-export.png') });
  if (download) await download.saveAs(join(OUT_DIR, download.suggestedFilename()));
  check('PNG export produced a .png download', !!download?.suggestedFilename().endsWith('.png'), download?.suggestedFilename());
  check('desktop: no dialog/pageerror/CSP console errors', problems.length === 0, problems.join(' | '));
  await context.close();
}

// 2. 모바일 뷰포트: 첫 화면
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const problems = await watch(page);
  const res = await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.screenshot({ path: join(OUT_DIR, 'mobile-home.png') });
  check('mobile / loads', res?.status() === 200);
  check('mobile: no errors', problems.length === 0, problems.join(' | '));
  await context.close();
}

// 3. 다른 origin에서 iframe 삽입 → 차단 (X-Frame-Options DENY / frame-ancestors 'none')
{
  const { createServer } = await import('node:http');
  const server = createServer((_, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<iframe id="f" src="${BASE_URL}/" width="600" height="400"></iframe>`);
  });
  await new Promise((r) => server.listen(FRAME_HOST_PORT, '127.0.0.1', r));
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`http://localhost:${FRAME_HOST_PORT}/`);
  await page.waitForTimeout(2000);
  const frame = page.frames().find((f) => f !== page.mainFrame());
  const framedText = frame ? await frame.evaluate(() => document.body?.innerText || '').catch(() => '') : '';
  check('cross-origin iframe is blocked (no app content rendered)', !framedText.includes('Plannet'), framedText.slice(0, 40));
  await context.close();
  server.close();
}

await browser.close();
console.log(`\nresult: ${passed} passed, ${failed} failed (artifacts: ${OUT_DIR})`);
process.exit(failed === 0 ? 0 : 1);
