import fs from 'node:fs';
import { test, expect, Page, Route } from '@playwright/test';
import {
  browserPersistence, createPlan, dailyData, EDGE_ORIGIN, expectNoPlannerPersistence, expectPendingJournalOnly, expectPlannerClosed, loginAs, logout, mock,
  MockUser, syncStatus, testUser,
} from './support/helpers';

// 로그인한 서비스 모드: 플래너 기록은 DB에만 저장된다. 저장 전 수정은 탭 메모리에만 있고,
// 브라우저 저장소(localStorage·sessionStorage·IndexedDB)에는 기록·캐시·재시도 봉투·초안이 쓰이지 않는다.

const titleInput = (page: Page) => page.locator('input[placeholder="나의 투두리스트"]');
const retryButton = (page: Page) => page.getByRole('button', { name: '서버 저장 다시 시도' });
const sidebarPlan = (page: Page, title: string) => page.locator('aside').getByText(title, { exact: true });

test.beforeEach(async () => {
  await mock.reset();
});

async function createDaily(page: Page, title: string) {
  await createPlan(page, '투두리스트', 3);
  await titleInput(page).fill(title);
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
}

async function dbRecord(user: MockUser, title: string) {
  return (await mock.planner(user)).records.find((record) => record.data?.title === title);
}

async function openPlan(page: Page, title: string) {
  await sidebarPlan(page, title).click();
  await expect(titleInput(page)).toHaveValue(title);
}

/** 등록된 beforeunload 처리기가 이동을 막으려 하는지 (실제 확인 창은 별도 테스트에서 본다) */
async function unloadBlocked(page: Page) {
  return page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  });
}

test('처음 불러오기·수정·저장 확인·오류·충돌·로그아웃·재로그인 내내 브라우저에는 미확인 변경분 임시 보관만 남는다', async ({ page }) => {
  const user = testUser('mem');
  await loginAs(page, user);
  await expectNoPlannerPersistence(page);

  await createDaily(page, '메모리 플랜');
  const saved = (await dbRecord(user, '메모리 플랜'))!;
  expect(saved).toBeDefined();
  await expectNoPlannerPersistence(page);

  // 오류: 저장소 장애 → 저장됐다고 표시하지 않고 수정은 탭에 남는다
  await mock.configure({ storageMode: 'error' });
  await titleInput(page).fill('장애 중 수정');
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'error');
  await expect(syncStatus(page)).not.toContainText('저장됐어요');
  await expect(page.getByText(/서버에 저장되지 않은 기록 \d+개가 남아 있어요/)).toBeVisible();
  await expect(titleInput(page)).toHaveValue('장애 중 수정');
  const { userId } = await mock.planner(user);
  const pending = await expectPendingJournalOnly(page, userId, [saved.id]);
  expect(pending.inflight?.changes).toHaveLength(1);

  // 복구 후 다시 시도 → DB 저장
  await mock.configure({ storageMode: 'ok' });
  await retryButton(page).click();
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  expect((await mock.planner(user)).records.find((record) => record.id === saved.id)?.data?.title).toBe('장애 중 수정');

  // 충돌: 다른 기기가 먼저 바꿈 → 이 탭의 수정은 보내지 않고 메모리에만 남는다. '보관했어요' 같은 표현이 없다
  await mock.seedPlanner(user, [{ kind: 'daily', id: saved.id, data: dailyData(saved.id, '다른 기기 수정') }]);
  await titleInput(page).fill('충돌 난 내 수정');
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'conflict');
  await expect(syncStatus(page)).toContainText('이 탭에만');
  await expect(page.getByTestId('storage-sync-controls')).not.toContainText('보관');
  // 충돌 중에도 변경분만 임시 보관되고, 원래 기대 버전을 유지한다 (DB 새 버전 위로 자동 재기준하지 않음)
  const conflicted = await expectPendingJournalOnly(page, userId, [saved.id]);
  expect([...conflicted.drafts.map((draft) => draft.expectedVersion)]).toEqual([saved.version + 1]);

  // 파일로 받은 뒤 명시적으로 버리고 서버 내용을 불러온다
  const download = page.waitForEvent('download');
  await page.getByTestId('storage-sync-download').click();
  const file = await (await download).path();
  expect(fs.readFileSync(file, 'utf8')).toContain('충돌 난 내 수정');
  await page.getByTestId('storage-sync-use-server').click();
  await expect(page.getByRole('group', { name: '서버 내용 불러오기 확인' })).toContainText('되돌릴 수 없어요');
  await page.getByTestId('storage-sync-confirm-use-server').click();
  await expect(titleInput(page)).toHaveValue('다른 기기 수정');
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  await expectNoPlannerPersistence(page);

  await logout(page);
  await expectNoPlannerPersistence(page);
  await loginAs(page, user);
  await openPlan(page, '다른 기기 수정');
  await expectNoPlannerPersistence(page);
});

test('새로 들어오면 브라우저에 남은 예전 캐시가 아니라 DB의 최신 기록을 보인다', async ({ page }) => {
  const user = testUser('fresh');
  await loginAs(page, user);
  const { userId } = await mock.planner(user);
  await logout(page);

  // 예전 설계가 남긴 같은 계정의 서버 캐시(오래된 값)와 DB의 새 값
  const staleKey = `plannet-daily@cloud:${userId}`;
  const stale = JSON.stringify({ version: 0, state: { dailyPlans: [dailyData('shared', '오래된 캐시 제목')], currentDailyId: null } });
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [staleKey, stale]);
  await mock.seedPlanner(user, [{ kind: 'daily', id: 'shared', data: dailyData('shared', 'DB 최신 제목') }]);

  await loginAs(page, user);
  await expect(sidebarPlan(page, 'DB 최신 제목')).toBeVisible();
  await expect(page.getByText('오래된 캐시 제목')).toHaveCount(0);

  // 다른 기기가 DB를 바꾼 뒤 새로고침하면 바뀐 DB를 다시 읽는다
  await mock.seedPlanner(user, [{ kind: 'daily', id: 'shared', data: dailyData('shared', '새로고침 후 제목') }]);
  await page.reload();
  await expect(sidebarPlan(page, '새로고침 후 제목')).toBeVisible();
  // 예전 캐시 키는 읽지도 바꾸지도 지우지도 않는다
  await expectNoPlannerPersistence(page, { [staleKey]: stale });
  expect((await mock.stats()).commits).toBe(0);
});

test('브라우저 저장소를 쓸 수 없어도 DB 저장은 정상 동작한다', async ({ page }) => {
  await page.addInitScript(() => {
    const denied = () => { throw new DOMException('denied', 'SecurityError'); };
    Storage.prototype.setItem = denied;
    Storage.prototype.getItem = denied;
    Storage.prototype.removeItem = denied;
  });
  const user = testUser('denied');
  await loginAs(page, user);
  await createDaily(page, '저장소 차단 플랜');
  expect(await dbRecord(user, '저장소 차단 플랜')).toBeDefined();
  // 임시 보관을 쓸 수 없다는 짧은 안내만 보이고 DB 저장은 계속된다
  await expect(page.getByTestId('storage-sync-protection-unavailable')).toBeVisible();
  await expect(syncStatus(page)).toHaveAttribute('data-protection', 'unavailable');
  await logout(page);
});

test('sessionStorage 속성 자체에 접근할 수 없어도 DB 자동 저장은 계속된다', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });
  });
  const user = testUser('session-getter');
  await loginAs(page, user);
  await createDaily(page, '세션 게터 차단');
  expect(await dbRecord(user, '세션 게터 차단')).toBeDefined();
  await expect(page.getByTestId('storage-sync-protection-unavailable')).toBeVisible();
  await logout(page);
});

test('저장 응답이 유실되면 살아 있는 탭에서 같은 요청을 재전송하고, 전송 중 수정도 이어서 저장한다', async ({ page }) => {
  const user = testUser('ack');
  await loginAs(page, user);
  await createDaily(page, '응답 유실 전');
  const before = (await dbRecord(user, '응답 유실 전'))!;

  // 1) 서버는 커밋하지만 브라우저는 응답을 받지 못한다
  let lose = true;
  await page.route('**/api/v1/planner/commit', async (route) => {
    if (!lose) return route.continue();
    lose = false;
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.abort('failed');
  });
  await titleInput(page).fill('응답 유실 후');
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'error');
  await expect(syncStatus(page)).not.toContainText('저장됐어요');
  await retryButton(page).click();
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  const afterRetry = (await dbRecord(user, '응답 유실 후'))!;
  expect(afterRetry.version).toBe(before.version + 1);
  const { commitRequests } = await mock.planner(user);
  const lastId = commitRequests.at(-1)!;
  expect(commitRequests.filter((id) => id === lastId)).toHaveLength(2);
  await page.unroute('**/api/v1/planner/commit');

  // 2) 전송 중 수정: 첫 요청을 붙잡아 둔 사이의 수정은 응답 뒤 새 버전 기준으로 이어서 저장된다
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let holding: Route | null = null;
  await page.route('**/api/v1/planner/commit', async (route) => {
    if (holding) return route.continue();
    holding = route;
    await held;
    await route.continue();
  });
  await titleInput(page).fill('전송 중 1');
  await expect.poll(() => holding !== null).toBe(true);
  expect(await unloadBlocked(page)).toBe(true); // 전송 중(응답 전)에도 닫기 확인
  await titleInput(page).fill('전송 중 2');
  release();
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  const final = (await mock.planner(user)).records.find((record) => record.id === before.id)!;
  expect(final.data?.title).toBe('전송 중 2');
  expect(final.version).toBe(afterRetry.version + 2);
  expect(await unloadBlocked(page)).toBe(false);
  await expectNoPlannerPersistence(page);
});

test('저장되지 않은 수정이 있을 때만 닫기·새로고침 확인 창이 뜬다', async ({ page }) => {
  await loginAs(page, testUser('unload'));
  await createDaily(page, '닫기 확인');
  expect(await unloadBlocked(page)).toBe(false);

  await mock.configure({ storageMode: 'error' });
  await titleInput(page).fill('닫기 전 미저장');
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'error');
  expect(await unloadBlocked(page)).toBe(true);

  // 실제 브라우저 확인 창: 취소하면 페이지와 메모리의 수정이 그대로다
  const dialog = page.waitForEvent('dialog');
  await page.close({ runBeforeUnload: true });
  const shown = await dialog;
  expect(shown.type()).toBe('beforeunload');
  await shown.dismiss();
  await expect(titleInput(page)).toHaveValue('닫기 전 미저장');

  await mock.configure({ storageMode: 'ok' });
  await retryButton(page).click();
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  expect(await unloadBlocked(page)).toBe(false);
});

test('로그아웃은 먼저 저장을 마치고, 저장·CSRF가 실패하면 작업 공간과 수정을 그대로 둔다', async ({ page }) => {
  const user = testUser('logout');
  await loginAs(page, user);
  await createDaily(page, '나가기 전');

  // 저장 실패: 로그아웃 요청을 보내지 않고 안내만 한다
  await mock.configure({ storageMode: 'error' });
  await titleInput(page).fill('저장 안 된 수정');
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '저장되지 않은 수정이 있어 로그아웃하지 않았어요' })).toBeVisible();
  await expect(titleInput(page)).toHaveValue('저장 안 된 수정');
  expect((await mock.stats()).logoutCalls).toBe(0);
  expect((await mock.stats()).sessions).toBe(1);
  await expect(page.getByTestId('storage-sync-download')).toBeVisible();

  // 저장은 끝났지만 로그아웃 CSRF가 계속 거부되면: 세션·작업 공간은 그대로다
  // (/csrf 자체를 바꾸면 저장 commit도 거부되어 'unsaved'가 된다. 로그아웃 응답만 거부한다)
  await mock.configure({ storageMode: 'ok' });
  await retryButton(page).click();
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  expect(await dbRecord(user, '저장 안 된 수정')).toBeDefined();
  await page.route('**/api/v1/logout', (route) => route.fulfill({ status: 403, json: { error: 'csrf_invalid' } }));
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '로그아웃하지 못했어요' })).toBeVisible();
  await expect(titleInput(page)).toHaveValue('저장 안 된 수정');
  expect((await mock.stats()).sessions).toBe(1);
  await page.unroute('**/api/v1/logout');

  // 성공: 디바운스 전에 로그아웃해도 먼저 저장한 뒤 나간다
  await titleInput(page).fill('나가기 직전 수정');
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
  expect(await dbRecord(user, '나가기 직전 수정')).toBeDefined();
  expect((await mock.stats()).sessions).toBe(0);
  await expectNoPlannerPersistence(page);
});

test('두 브라우저 동시 수정: DB 버전이 판정하고, 확인 뒤 새 수정이 생기면 서버 내용으로 덮지 않는다', async ({ page, browser }) => {
  const user = testUser('multi');
  await loginAs(page, user);
  await createDaily(page, '공유 플랜');
  const other = await browser.newContext({ baseURL: EDGE_ORIGIN });
  const second = await other.newPage();
  try {
    await loginAs(second, user);
    await openPlan(second, '공유 플랜');

    await titleInput(page).fill('첫 기기 승리');
    await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
    await titleInput(second).fill('둘째 기기 초안');
    await expect(syncStatus(second)).toHaveAttribute('data-phase', 'conflict');
    expect(await dbRecord(user, '첫 기기 승리')).toBeDefined();

    // 확인 창을 연 뒤 수정하면 버리지 않는다
    await second.getByTestId('storage-sync-use-server').click();
    await titleInput(second).fill('확인 중 추가 수정');
    await second.getByTestId('storage-sync-confirm-use-server').click();
    await expect(syncStatus(second)).toContainText('새 수정이 생겨');
    await expect(titleInput(second)).toHaveValue('확인 중 추가 수정');

    // 취소하면 그대로, 다시 확인하면 서버 내용
    await second.getByTestId('storage-sync-use-server').click();
    await second.getByRole('button', { name: '취소' }).click();
    await expect(titleInput(second)).toHaveValue('확인 중 추가 수정');
    await second.getByTestId('storage-sync-use-server').click();
    await second.getByTestId('storage-sync-confirm-use-server').click();
    await expect(titleInput(second)).toHaveValue('첫 기기 승리');
    await expect(syncStatus(second)).toHaveAttribute('data-phase', 'saved');

    // 다시 들어오면 DB 내용이다
    await second.reload();
    await openPlan(second, '첫 기기 승리');
    await expectNoPlannerPersistence(second);
  } finally {
    await other.close();
  }
});

test('예전 방식으로 남은 같은 계정의 미전송 초안은 자동으로 보내지 않고 파일로만 복구한다', async ({ page }) => {
  const user = testUser('legacy');
  await loginAs(page, user);
  const { userId } = await mock.planner(user);
  await logout(page);

  const envelopeKey = `plannet-server-sync@${userId}`;
  const envelope = JSON.stringify({
    format: 1, userId, initialized: true, base: [], blocked: null, inflight: null,
    drafts: [{ kind: 'daily', id: 'old-draft', schemaVersion: 1, expectedVersion: 0, data: dailyData('old-draft', '예전 미전송 초안') }],
  });
  const archiveKey = `${envelopeKey}:backup:old-archive`;
  const otherKey = 'plannet-server-sync@00000000-0000-4000-8000-000000000000';
  const seeded = { [envelopeKey]: envelope, [archiveKey]: '{"archived":"예전 보관본"}', [otherKey]: '{"drafts":[{"id":"다른 계정"}]}' };
  await page.evaluate((entries) => { for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value); }, seeded);

  await loginAs(page, user);
  const notice = page.getByTestId('storage-sync-legacy-drafts');
  await expect(notice).toContainText('자동으로 보내지 않았어요');
  const download = page.waitForEvent('download');
  await page.getByTestId('storage-sync-legacy-download').click();
  const text = fs.readFileSync(await (await download).path(), 'utf8');
  expect(text).toContain('예전 미전송 초안');
  expect(text).toContain('예전 보관본');
  expect(text).not.toContain('다른 계정');

  expect((await mock.stats()).commits).toBe(0);
  expect((await mock.planner(user)).records).toEqual([]);
  expect((await browserPersistence(page)).local).toEqual(Object.fromEntries(Object.entries(seeded).sort()));
});

test('로그인하지 않았거나 다른 계정이면 이전 계정의 기록이 보이지도 전송되지도 않는다', async ({ page }) => {
  const alice = testUser('iso-alice');
  const bob = testUser('iso-bob');
  await loginAs(page, alice);
  await createDaily(page, 'Alice 전용');
  await logout(page);
  await expectPlannerClosed(page, ['Alice 전용']);

  await loginAs(page, bob);
  await expect(page.getByText('Alice 전용')).toHaveCount(0);
  await createDaily(page, 'Bob 전용');
  expect((await mock.planner(alice)).records.map((record) => record.data?.title)).toEqual(['Alice 전용']);
  expect((await mock.planner(bob)).records.map((record) => record.data?.title)).toEqual(['Bob 전용']);
  await expectNoPlannerPersistence(page);
});
