import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs/promises';
import { planFixture } from './fixtures';
import { MAX_MANDALART_JSON_BYTES } from '../../src/lib/mandalartImport';

const STORAGE = 'plannet-mandalart';
const titleInput = (page: Page) => page.getByPlaceholder('나의 만다라트');
const readStore = (page: Page) => page.evaluate(key => localStorage.getItem(key), STORAGE);
async function menu(page: Page, name: string) {
  await page.getByRole('button', { name: '메뉴', exact: true }).click();
  await page.getByRole('button', { name, exact: true }).click();
}
async function importFile(page: Page, content: string) {
  const chooser = page.waitForEvent('filechooser');
  await menu(page, 'JSON 불러오기');
  await (await chooser).setFiles({ name: 'plan.json', mimeType: 'application/json', buffer: Buffer.from(content) });
}
async function downloadJSON(page: Page) {
  const download = page.waitForEvent('download');
  await menu(page, 'JSON 저장');
  const path = await (await download).path();
  return JSON.parse(await fs.readFile(path!, 'utf8'));
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(({ key, plan }) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify({ state: { mandalarts: [plan], currentId: plan.id }, version: 3 }));
  }, { key: STORAGE, plan: planFixture() });
  await page.reload();
  await expect(titleInput(page)).toHaveValue(planFixture().title);
});

test('JSON downloads and reimports every field; category/period travel with the file', async ({ page }) => {
  const original = await downloadJSON(page);
  expect(original).toEqual(planFixture());
  const imported = { ...original, id: 'from-file', title: '가져온 일간 계획', category: 'daily', year: 2028, month: 2, day: 29, futureOption: { enabled: true } };
  await importFile(page, JSON.stringify(imported));
  await expect(page.getByText('현재 플랜을 덮어쓰시겠습니까?')).toBeVisible();
  await page.getByRole('button', { name: '덮어쓰기', exact: true }).click();
  await expect(titleInput(page)).toHaveValue(imported.title);
  const restored = await downloadJSON(page);
  expect(restored).toEqual({ ...imported, id: original.id, updatedAt: restored.updatedAt });
  expect(Date.parse(restored.updatedAt)).toBeGreaterThan(Date.parse(original.updatedAt));
  await page.reload();
  expect(await downloadJSON(page)).toEqual(restored);
});

test('invalid/truncated/oversized imports and both cancellation paths keep the original byte-for-byte', async ({ page }) => {
  const original = await readStore(page);
  const invalidPlan = planFixture();
  invalidPlan.grids[0].cells[0].id = 'wrong-id';
  for (const content of ['{"grids":[', JSON.stringify(invalidPlan), ' '.repeat(MAX_MANDALART_JSON_BYTES + 1)]) {
    const dialog = page.waitForEvent('dialog');
    const importing = importFile(page, content);
    const alert = await dialog;
    expect(alert.type()).toBe('alert');
    await alert.accept();
    await importing;
    expect(await readStore(page)).toBe(original);
    await expect(page.getByText('현재 플랜을 덮어쓰시겠습니까?')).toHaveCount(0);
  }
  const chooser = page.waitForEvent('filechooser');
  await menu(page, 'JSON 불러오기');
  await chooser;
  await page.locator('input[type=file]').dispatchEvent('cancel');
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  expect(await readStore(page)).toBe(original);
  await importFile(page, JSON.stringify({ ...planFixture(), title: '취소할 변경' }));
  await page.getByRole('button', { name: '취소', exact: true }).click();
  expect(await readStore(page)).toBe(original);
});

test('sanitizes HTML and migrates legacy daily flag without losing schedule', async ({ page }) => {
  const input = JSON.parse(JSON.stringify(planFixture()));
  delete input.category;
  delete input.template;
  input.title = '<img src=x onerror="window.__xss=1">안전한 제목';
  input.grids[0].cells[0].value = '<script>window.__xss=1</script><b>안전한 내용</b>';
  input.grids[0].cells[0].isDaily = true;
  input.grids[0].cells[2].icon = '<img src=x onerror="window.__xss=1">🚀';
  input.grids[0].cells[6].isDaily = true;
  await importFile(page, JSON.stringify(input));
  await page.getByRole('button', { name: '덮어쓰기', exact: true }).click();
  await expect(titleInput(page)).toHaveValue('안전한 제목');
  const output = await downloadJSON(page);
  expect(output.category).toBe('annual');
  expect(output.template).toBe('mandalart');
  expect(output.grids[0].cells[0].value).toBe('안전한 내용');
  expect(output.grids[0].cells[0].schedule).toEqual({ repeat: 'daily' });
  expect(output.grids[0].cells[2].icon).toBe('🚀');
  expect(output.grids[0].cells[6].schedule).toEqual(input.grids[0].cells[6].schedule);
  expect(await page.evaluate(() => Reflect.get(window, '__xss'))).toBeUndefined();
});

test('editing while overwrite confirmation is open prevents stale import', async ({ page }) => {
  await importFile(page, JSON.stringify({ ...planFixture(), title: '오래된 가져오기' }));
  await expect(page.getByText('현재 플랜을 덮어쓰시겠습니까?')).toBeVisible();
  // The confirm is modal (keyboard focus stays inside), so change the plan without focusing the
  // background input, as another local editor would.
  await titleInput(page).evaluate((el: HTMLInputElement) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, '방금 수정한 제목');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.getByRole('button', { name: '덮어쓰기', exact: true }).click();
  await expect(titleInput(page)).toHaveValue('방금 수정한 제목');
});

test('editing while the file picker is pending prevents stale import', async ({ page }) => {
  const chooser = page.waitForEvent('filechooser');
  await menu(page, 'JSON 불러오기');
  const pending = await chooser;
  await titleInput(page).fill('파일 선택 중 수정한 제목');
  const edited = await readStore(page);
  await pending.setFiles({ name: 'plan.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...planFixture(), title: '오래된 파일' })) });
  await expect(page.locator('input[type=file]')).toHaveCount(0);
  await expect(page.getByText('현재 플랜을 덮어쓰시겠습니까?')).toHaveCount(0);
  expect(await readStore(page)).toBe(edited);
});

test('PNG download contains all 81 cells, content and colors under frame-denying CSP', async ({ page }, testInfo) => {
  await page.screenshot({ path: testInfo.outputPath('app.png'), fullPage: true });
  const response = await page.request.get('/');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  await expect(page.locator('[id="mandalart-grid"]')).toHaveCount(1);
  const before = await readStore(page);
  const download = page.waitForEvent('download');
  await menu(page, '이미지 저장');
  const imageDownload = await download;
  expect(imageDownload.suggestedFilename()).toMatch(/\.png$/);
  const pngPath = testInfo.outputPath('mandalart.png');
  await imageDownload.saveAs(pngPath);
  await testInfo.attach('full-81-cell-image', { path: pngPath, contentType: 'image/png' });
  const png = await fs.readFile(pngPath);
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const decoded = await page.evaluate(async ({ encoded, plan }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0);
    const cells = plan.grids.flatMap((grid, gridIndex) => grid.cells.map(cell => {
      const x = (24 + (gridIndex % 3) * 334 + 4 + (cell.position % 3) * 106) * 2;
      const y = (80 + Math.floor(gridIndex / 3) * 334 + 4 + Math.floor(cell.position / 3) * 106) * 2;
      const rgb = Array.from(ctx.getImageData(x + 8, y + 24, 1, 1).data).slice(0, 3);
      const pixels = ctx.getImageData(x + 16, y + 24, 176, 164).data;
      let ink = 0;
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i] < 150 && pixels[i + 1] < 150 && pixels[i + 2] < 170) ink++;
      return { rgb, ink };
    }));
    return { width: image.naturalWidth, height: image.naturalHeight, cells };
  }, { encoded: png.toString('base64'), plan: planFixture() });
  expect(decoded.width).toBe(2080);
  expect(decoded.height).toBe(2192);
  expect(decoded.cells).toHaveLength(81);
  const positions = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];
  for (const [index, cell] of decoded.cells.entries()) {
    const gridIndex = Math.floor(index / 9);
    const position = index % 9;
    const colorGrid = gridIndex === 4 && position !== 4 ? planFixture().grids.find(grid => grid.id === positions[position])! : planFixture().grids[gridIndex];
    const hex = colorGrid.color.slice(1);
    expect(cell.rgb).toEqual([0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16)));
    expect(cell.ink, `cell ${index + 1} text`).toBeGreaterThan(15);
  }
  expect(await readStore(page)).toBe(before);
});
