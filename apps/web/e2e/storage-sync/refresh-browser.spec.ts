import { test, expect, Page } from '@playwright/test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { PlannerCommit, PlannerRecord, recordKey } from '../../src/lib/plannerSync';
import { GRID_POSITIONS } from '../../src/types/mandalart';
import { DEFAULT_COLORS } from '../../src/lib/constants';

/**
 * Safe cross-device refresh in the production build. Auth/DB are synthetic responses intercepted in this browser
 * context only; the plans and accounts below are fictional.
 */
const USER = '10000000-0000-4000-8000-0000000000aa';
const OTHER = '20000000-0000-4000-8000-0000000000bb';
const timestamp = '2026-10-04T00:00:00.000Z';
const base = { schemaVersion: 1 as const, version: 1, deleted: false, updatedAt: timestamp };
const daily = (id: string, title: string, memo = '', version = 1): PlannerRecord => ({ ...base, version, kind: 'daily', id, data: {
  id, template: 'daily', category: 'daily', title, year: 2026, month: 10, day: 4, todos: [], memo, createdAt: timestamp, updatedAt: timestamp,
} });
const monthly = (memo = '가상 메모', version = 1): PlannerRecord => ({ ...base, version, kind: 'monthly', id: 'monthly-one', data: {
  id: 'monthly-one', template: 'monthly', category: 'monthly', title: '가상 10월', year: 2026, month: 10, memo, goals: [],
  weeklyFocus: Array.from({ length: 5 }, (_, index) => ({ weekNumber: index + 1, text: '' })), createdAt: timestamp, updatedAt: timestamp,
} });
const mandalart = (): PlannerRecord => ({ ...base, kind: 'mandalart', id: 'mandalart-one', data: {
  id: 'mandalart-one', template: 'mandalart', category: 'annual', title: '가상 만다라트', createdAt: timestamp, updatedAt: timestamp,
  grids: GRID_POSITIONS.map((position) => ({ id: position, color: DEFAULT_COLORS[position], cells: Array.from({ length: 9 }, (_, index) => ({ id: `${position}-${index}`, position: index, value: '' })) })),
} });
const tombstone = (record: PlannerRecord, version: number): PlannerRecord => ({ ...record, version, deleted: true, data: null });

async function mockStorage(page: Page, initial: PlannerRecord[]) {
  const records = new Map(initial.map((record) => [recordKey(record), record]));
  const commits: PlannerCommit[] = [];
  const reads: { status: number }[] = [];
  let mode: 'ok' | 'offline' | 'unauthorized' | 'other-account' = 'ok';
  let commitGate: Promise<void> | null = null;
  const etag = () => `"synthetic-${createHash('sha256').update(JSON.stringify([...records.values()])).digest('hex').slice(0, 32)}"`;
  await page.route('**/api/runtime-config', (route) => route.fulfill({ json: { authEnabled: true, backupEnabled: false } }));
  await page.route('**/api/v1/me', (route) => route.fulfill({ json: {
    authenticated: true, storageEnabled: true, user: { authProvider: 'google', externalSubject: 'refresh-a', userId: USER, name: '가상 사용자', email: 'refresh.a@example.test' },
  } }));
  await page.route('**/api/v1/csrf', (route) => route.fulfill({ json: { headerName: 'X-CSRF-TOKEN', token: 'fake-csrf' } }));
  await page.route('**/api/v1/planner', async (route) => {
    if (mode === 'offline') { reads.push({ status: 0 }); return route.abort('failed'); }
    if (mode === 'unauthorized') { reads.push({ status: 401 }); return route.fulfill({ status: 401, json: { error: 'unauthorized' } }); }
    if (mode === 'other-account') {
      reads.push({ status: 200 });
      return route.fulfill({ json: { userId: OTHER, records: [daily('other-plan', 'B 계정의 플랜')] } });
    }
    const tag = etag();
    if (route.request().headers()['if-none-match'] === tag) {
      reads.push({ status: 304 });
      return route.fulfill({ status: 304, headers: { ETag: tag } });
    }
    reads.push({ status: 200 });
    await route.fulfill({ json: { userId: USER, records: [...records.values()] }, headers: { ETag: tag } });
  });
  await page.route('**/api/v1/planner/commit', async (route) => {
    const body = route.request().postDataJSON() as PlannerCommit;
    commits.push(body);
    if (commitGate) await commitGate;
    if (body.changes.some((change) => change.expectedVersion !== (records.get(recordKey(change))?.version ?? 0))) {
      return route.fulfill({ status: 409, json: { error: 'version_conflict', conflicts: [] } });
    }
    const result: PlannerRecord[] = body.changes.map((change) => ({ ...change, version: change.expectedVersion + 1, deleted: change.data === null, updatedAt: timestamp }));
    result.forEach((record) => records.set(recordKey(record), record));
    await route.fulfill({ json: { records: result } });
  });
  return {
    records, commits, reads,
    setMode: (value: typeof mode) => { mode = value; },
    gateCommits: () => {
      let open!: () => void;
      commitGate = new Promise<void>((resolve) => { open = resolve; });
      return () => { commitGate = null; open(); };
    },
  };
}

const status = (page: Page) => page.getByTestId('storage-sync-status');
const refreshStatus = (page: Page) => page.getByTestId('storage-sync-refresh-status');
const memo = (page: Page) => page.getByPlaceholder('오늘의 메모...');
const newTodo = (page: Page) => page.getByPlaceholder('할 일을 입력하세요...');
const sidebar = (page: Page) => page.locator('aside');
/** Tab return: the browser fires visibilitychange and focus together; repeat to simulate a burst. */
async function returnToTab(page: Page, times = 1) {
  await page.evaluate((count) => {
    for (let i = 0; i < count; i++) {
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('focus'));
    }
  }, times);
}
/** Waits past the refresh cooldown for exactly one new read. */
async function expectOneRead(api: Awaited<ReturnType<typeof mockStorage>>, before: number) {
  await expect.poll(() => api.reads.length, { timeout: 10_000 }).toBe(before + 1);
  await new Promise((resolve) => setTimeout(resolve, 600));
  expect(api.reads.length).toBe(before + 1);
}
async function storageKeys(page: Page) {
  return page.evaluate(() => ({
    local: Object.keys(localStorage).filter((key) => key.startsWith('plannet')),
    session: Object.keys(sessionStorage).filter((key) => key.startsWith('plannet')),
  }));
}
/** Leaves the editor without committing anything (no focusable target). */
async function blurAll(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

test.describe('safe cross-device refresh', () => {
  test('tab return applies remote edits/deletions once, keeps selection, URL and unsent input; a 304 is a no-op', async ({ page }) => {
    const api = await mockStorage(page, [daily('daily-one', '첫 플랜'), daily('daily-two', '두 번째 플랜')]);
    await page.goto('/?template=daily&plan=daily-one');
    await expect(memo(page)).toHaveValue('');
    await newTodo(page).fill('아직 추가하지 않은 할 일');
    await blurAll(page);
    await page.waitForTimeout(1_100);

    api.records.set('daily:daily-one', daily('daily-one', '첫 플랜', '다른 기기 메모', 2));
    api.records.set('daily:daily-two', tombstone(daily('daily-two', '두 번째 플랜'), 2));
    api.records.set('daily:daily-three', daily('daily-three', '세 번째 플랜'));
    const before = api.reads.length;
    await returnToTab(page, 3);
    await expectOneRead(api, before);
    await expect(memo(page)).toHaveValue('다른 기기 메모');
    await expect(refreshStatus(page)).toHaveText('다른 기기에서 바뀐 내용을 반영했어요.');
    await expect(sidebar(page).getByText('두 번째 플랜', { exact: true })).toHaveCount(0);
    await expect(sidebar(page).getByText('세 번째 플랜', { exact: true })).toBeVisible();
    await expect(newTodo(page)).toHaveValue('아직 추가하지 않은 할 일');
    expect(new URL(page.url()).search).toBe('?template=daily&plan=daily-one');
    await expect(status(page)).toHaveAttribute('data-phase', 'saved');

    // Unchanged: 304, no store/editor reset and no write.
    const again = api.reads.length;
    await returnToTab(page, 2);
    await expectOneRead(api, again);
    expect(api.reads.at(-1)).toEqual({ status: 304 });
    await expect(memo(page)).toHaveValue('다른 기기 메모');
    await expect(newTodo(page)).toHaveValue('아직 추가하지 않은 할 일');
    await page.waitForTimeout(900);
    expect(api.commits).toEqual([]);
    expect(await storageKeys(page)).toEqual({ local: [], session: [] });
  });

  test('remote deletion of the open plan waits while unsent text exists, then shows a safe empty workspace', async ({ page }) => {
    const api = await mockStorage(page, [daily('daily-one', '첫 플랜'), daily('daily-two', '두 번째 플랜')]);
    await page.goto('/?template=daily&plan=daily-one');
    await newTodo(page).fill('옮겨 둘 할 일');
    await blurAll(page);
    await page.waitForTimeout(1_100);
    api.records.set('daily:daily-one', tombstone(daily('daily-one', '첫 플랜'), 2));
    const before = api.reads.length;
    await returnToTab(page);
    await expectOneRead(api, before);
    await expect(refreshStatus(page)).toHaveAttribute('data-reason', 'draft');
    await expect(refreshStatus(page)).toContainText('보던 플랜이 다른 기기에서 삭제됐어요. 아직 추가하지 않은 입력이 있어');
    await expect(newTodo(page)).toHaveValue('옮겨 둘 할 일');
    expect(new URL(page.url()).search).toBe('?template=daily&plan=daily-one');

    // The user moves the text elsewhere and clears the field: the deferred refresh resumes by itself.
    await newTodo(page).fill('');
    await blurAll(page);
    await expect(page).toHaveURL(/\/$/, { timeout: 10_000 });
    await expect(refreshStatus(page)).toHaveText('보던 플랜이 다른 기기에서 삭제됐어요. 다른 기기 변경을 반영했어요.');
    await expect(page.getByRole('heading', { name: '최근 작업' })).toBeVisible();
    await expect(sidebar(page).getByText('첫 플랜', { exact: true })).toHaveCount(0);
    expect(api.commits).toEqual([]);
  });

  test('focused editing defers the refresh and resumes on blur; Monthly typed focus is never lost', async ({ page }) => {
    const api = await mockStorage(page, [daily('daily-one', '첫 플랜'), daily('daily-two', '두 번째 플랜'), monthly()]);
    await page.goto('/?template=daily&plan=daily-one');
    await memo(page).click();
    await page.keyboard.type('입력 중 메모');
    await expect.poll(() => api.records.get('daily:daily-one')?.data?.memo, { timeout: 5_000 }).toBe('입력 중 메모');
    await expect(status(page)).toHaveAttribute('data-phase', 'saved');
    await expect(memo(page)).toBeFocused();
    api.records.set('daily:daily-two', daily('daily-two', '다른 기기 제목', '', 2));
    const before = api.reads.length;
    await returnToTab(page);
    await expect(refreshStatus(page)).toHaveAttribute('data-reason', 'editing', { timeout: 10_000 });
    await expect(refreshStatus(page)).toHaveText('입력 중이라 다른 기기 변경 확인을 미뤘어요. 입력을 마치면 확인해요.');
    expect(api.reads.length).toBe(before);
    await expect(sidebar(page).getByText('두 번째 플랜', { exact: true })).toBeVisible();
    await blurAll(page);
    await expect(sidebar(page).getByText('다른 기기 제목', { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(memo(page)).toHaveValue('입력 중 메모');

    // Monthly weekly focus: typed but not yet committed (component state only) while another device edits the plan.
    await page.goto('/?template=monthly&plan=monthly-one');
    await page.getByTestId('weekly-focus-W2').getByRole('button').click();
    const w2 = page.getByLabel('W2 포커스');
    await w2.pressSequentially('작성 중 포커스');
    api.records.set('monthly:monthly-one', monthly('다른 기기 메모', 2));
    const monthlyReads = api.reads.length;
    await page.waitForTimeout(5_200); // past the cooldown started by this page load
    await returnToTab(page);
    await expect(refreshStatus(page)).toHaveAttribute('data-reason', 'editing');
    expect(api.reads.length).toBe(monthlyReads);
    await expect(w2).toHaveValue('작성 중 포커스');
    await w2.press('Enter');
    // Same record changed elsewhere: a truthful conflict with the typed text kept, never a silent overwrite.
    await expect(status(page)).toHaveAttribute('data-phase', 'conflict');
    await expect(page.getByTestId('weekly-focus-W2')).toContainText('작성 중 포커스');
    expect(api.records.get('monthly:monthly-one')?.data?.memo).toBe('다른 기기 메모');
    const download = page.waitForEvent('download');
    await page.getByTestId('storage-sync-download').click();
    expect(fs.readFileSync(await (await download).path(), 'utf8')).toContain('작성 중 포커스');
  });

  test('unsaved and inflight edits defer the refresh; the journal clears only on ACK and the remote change follows', async ({ page }) => {
    const api = await mockStorage(page, [daily('daily-one', '첫 플랜'), daily('daily-two', '두 번째 플랜')]);
    await page.goto('/?template=daily&plan=daily-one');
    const release = api.gateCommits();
    await memo(page).fill('전송 중 메모');
    await blurAll(page);
    await expect.poll(() => api.commits.length).toBe(1);
    expect((await storageKeys(page)).session).toEqual([`plannet-pending@${USER}`]);
    api.records.set('daily:daily-two', daily('daily-two', '다른 기기 제목', '', 2));
    await page.waitForTimeout(5_200);
    const before = api.reads.length;
    await returnToTab(page);
    await expect(refreshStatus(page)).toHaveText('이 탭의 수정이 저장되면 다른 기기 변경을 확인해요.');
    expect(api.reads.length).toBe(before);
    expect((await storageKeys(page)).session).toEqual([`plannet-pending@${USER}`]);
    release();
    await expect(sidebar(page).getByText('다른 기기 제목', { exact: true })).toBeVisible({ timeout: 5_000 });
    await expect(status(page)).toHaveAttribute('data-phase', 'saved');
    await expect(memo(page)).toHaveValue('전송 중 메모');
    expect(await storageKeys(page)).toEqual({ local: [], session: [] });
    expect(api.commits).toHaveLength(1);
  });

  test('offline and invalid reads keep the content, never claim freshness, and recover via online or manual recheck', async ({ page }) => {
    const api = await mockStorage(page, [daily('daily-one', '첫 플랜'), daily('daily-two', '두 번째 플랜')]);
    await page.goto('/?template=daily&plan=daily-one');
    await expect(memo(page)).toHaveValue('');
    api.records.set('daily:daily-two', daily('daily-two', '다른 기기 제목', '', 2));
    api.setMode('offline');
    await page.waitForTimeout(5_200);
    await returnToTab(page);
    await expect(refreshStatus(page)).toHaveText('다른 기기 변경을 확인하지 못했어요. 지금 화면은 마지막으로 불러온 내용이에요.');
    await expect(status(page)).toHaveAttribute('data-phase', 'saved');
    await expect(sidebar(page).getByText('두 번째 플랜', { exact: true })).toBeVisible();
    await expect(page.getByTestId('storage-sync-refresh')).toBeVisible();
    api.setMode('ok');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await expect(sidebar(page).getByText('다른 기기 제목', { exact: true })).toBeVisible();
    await expect(page.getByTestId('storage-sync-refresh')).toHaveCount(0);

    api.records.set('daily:daily-two', { ...daily('daily-two', '깨진 기록', '', 3), data: { ...daily('daily-two', '깨진 기록').data!, todos: 'not-a-list' } });
    await page.waitForTimeout(5_200);
    await returnToTab(page);
    await expect(refreshStatus(page)).toHaveText('서버 응답을 확인하지 못해 다른 기기 변경을 반영하지 않았어요. 지금 화면은 그대로예요.');
    await expect(sidebar(page).getByText('다른 기기 제목', { exact: true })).toBeVisible();
    await expect(sidebar(page).getByText('깨진 기록', { exact: true })).toHaveCount(0);
    api.records.set('daily:daily-two', daily('daily-two', '고친 기록', '', 4));
    await page.getByTestId('storage-sync-refresh').click();
    await expect(sidebar(page).getByText('고친 기록', { exact: true })).toBeVisible();
    await expect(memo(page)).toHaveValue('');
    expect(api.commits).toEqual([]);
  });

  test('401 and another-account response block writes without showing other content; drafts stay downloadable', async ({ page }) => {
    const api = await mockStorage(page, [daily('daily-one', '첫 플랜')]);
    await page.goto('/?template=daily&plan=daily-one');
    await expect(memo(page)).toHaveValue('');
    api.setMode('other-account');
    await page.waitForTimeout(5_200);
    await returnToTab(page);
    await expect(status(page)).toContainText('로그인 계정이 바뀌었어요');
    await expect(page.getByText('B 계정의 플랜')).toHaveCount(0);
    await expect(memo(page)).toHaveValue('');
    await memo(page).fill('차단 뒤 수정');
    await page.waitForTimeout(900);
    expect(api.commits).toEqual([]);
    const download = page.waitForEvent('download');
    await page.getByTestId('storage-sync-download').click();
    expect(fs.readFileSync(await (await download).path(), 'utf8')).toContain('차단 뒤 수정');

    // Reload with the right session: the tab journal restores the blocked draft for this account and saves it.
    api.setMode('ok');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.reload();
    await expect(memo(page)).toHaveValue('차단 뒤 수정');
    await expect.poll(() => api.records.get('daily:daily-one')?.data?.memo).toBe('차단 뒤 수정');
    expect(api.commits).toHaveLength(1);
    await expect(status(page)).toHaveAttribute('data-phase', 'saved');

    // Expired session: blocked, own content stays, nothing more is sent.
    api.setMode('unauthorized');
    await page.waitForTimeout(5_200);
    await returnToTab(page);
    await expect(status(page)).toContainText('로그인이 만료됐어요');
    await expect(memo(page)).toHaveValue('차단 뒤 수정');
    await memo(page).fill('만료 뒤 수정');
    await page.waitForTimeout(900);
    expect(api.commits).toHaveLength(1);
  });

  test('an open AI assistant holds the refresh until it closes', async ({ page }) => {
    const api = await mockStorage(page, [mandalart(), daily('daily-two', '두 번째 플랜')]);
    await page.goto('/?template=mandalart&plan=mandalart-one');
    await page.getByTitle('AI 어시스턴트').click();
    await expect(page.getByRole('heading', { name: 'AI 어시스턴트' })).toBeVisible();
    await blurAll(page);
    api.records.set('daily:daily-two', daily('daily-two', '다른 기기 제목', '', 2));
    await page.waitForTimeout(5_200);
    const before = api.reads.length;
    await returnToTab(page);
    await expect(refreshStatus(page)).toHaveAttribute('data-reason', 'assistant');
    expect(api.reads.length).toBe(before);
    await page.mouse.click(10, 300);
    await expect(page.getByRole('heading', { name: 'AI 어시스턴트' })).toHaveCount(0);
    await expect(sidebar(page).getByText('다른 기기 제목', { exact: true })).toBeVisible({ timeout: 5_000 });
    expect(api.commits).toEqual([]);
  });
});
