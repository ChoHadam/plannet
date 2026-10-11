import fs from 'node:fs';
import { test, expect, Page } from '@playwright/test';
import {
  browserPersistence, createPlan, dailyData, expectNoPlannerPersistence, expectPendingJournalOnly, loginAs, logout, mock, MockUser,
  pendingJournalKey, syncStatus, testUser,
} from './support/helpers';

// 새로고침 대비 임시 보관: 저장 전 변경분과 전송 중 요청만 이 탭의 sessionStorage(계정 UUID별 키)에 두고,
// DB가 확인하면 지운다. 복원은 같은 계정 로그인 + DB 조회·검증 뒤에만 한다. DB가 기준이다.

const titleInput = (page: Page) => page.locator('input[placeholder="나의 투두리스트"]');
const sidebarPlan = (page: Page, title: string) => page.locator('aside').getByText(title, { exact: true });

test.beforeEach(async () => {
  await mock.reset();
});

async function createDaily(page: Page, title: string) {
  await createPlan(page, '투두리스트', 3);
  await titleInput(page).fill(title);
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
}

async function dbById(user: MockUser, id: string) {
  return (await mock.planner(user)).records.find((record) => record.id === id);
}

/** beforeunload 확인을 수락하고 새로고침한다 (미저장 상태에서만 확인 창이 뜬다) */
async function reloadAccepting(page: Page) {
  page.once('dialog', (dialog) => { expect(dialog.type()).toBe('beforeunload'); void dialog.accept(); });
  await page.reload();
}

async function seedJournal(page: Page, key: string, value: string) {
  await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [key, value]);
}

test('디바운스 전에 새로고침해도 변경분만 복원되어 원래 기대 버전으로 자동 저장되고, 끝나면 임시 보관이 지워진다', async ({ page }) => {
  const user = testUser('gap');
  await page.clock.install();
  await loginAs(page, user);
  await createDaily(page, '디바운스 전');
  const { userId } = await mock.planner(user);
  const before = (await mock.planner(user)).records[0];
  await expectNoPlannerPersistence(page);

  // 시계를 멈춰 650ms 저장 타이머가 돌지 않게 한다 → 수정은 아직 DB에 없다
  await page.clock.pauseAt(Date.now() + 60_000);
  await titleInput(page).fill('새로고침 직전 수정');
  const journal = await expectPendingJournalOnly(page, userId, [before.id]);
  expect(journal.inflight).toBeNull();
  expect(journal.drafts[0].expectedVersion).toBe(before.version);
  expect((await dbById(user, before.id))?.data?.title).toBe('디바운스 전');

  await reloadAccepting(page);
  await page.clock.resume();
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  const saved = await dbById(user, before.id);
  expect(saved?.data?.title).toBe('새로고침 직전 수정');
  expect(saved?.version).toBe(before.version + 1);
  await sidebarPlan(page, '새로고침 직전 수정').click();
  await expect(titleInput(page)).toHaveValue('새로고침 직전 수정');
  await expectNoPlannerPersistence(page);
});

test('POST가 받아들여진 뒤 응답 전에 새로고침하면 같은 requestId로 다시 보내 중복 없이 한 번만 반영된다', async ({ page }) => {
  const user = testUser('replay');
  await loginAs(page, user);
  await createDaily(page, '응답 전');
  const { userId } = await mock.planner(user);
  const before = (await mock.planner(user)).records[0];

  // 서버는 커밋하지만 응답은 영영 돌려주지 않는다 → 그 사이에 새로고침
  let accepted!: () => void;
  const committed = new Promise<void>((resolve) => { accepted = resolve; });
  await page.route('**/api/v1/planner/commit', async (route) => {
    await route.fetch();
    accepted();
    await new Promise(() => {});
  });
  await titleInput(page).fill('응답 유실 새로고침');
  await committed;
  const journal = await expectPendingJournalOnly(page, userId, [before.id]);
  const requestId = journal.inflight!.requestId;
  await page.unroute('**/api/v1/planner/commit');

  await reloadAccepting(page);
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  const { commitRequests, records } = await mock.planner(user);
  expect(commitRequests.filter((id) => id === requestId)).toHaveLength(2);
  const saved = records.find((record) => record.id === before.id)!;
  expect(saved.data?.title).toBe('응답 유실 새로고침');
  expect(saved.version).toBe(before.version + 1);
  await expectNoPlannerPersistence(page);
});

test('전송 중에 생긴 새 수정은 임시 보관에 남고, 응답 뒤 확인된 버전 위에서만 이어서 저장된다', async ({ page }) => {
  const user = testUser('inflight');
  await loginAs(page, user);
  await createDaily(page, '전송 전');
  const { userId } = await mock.planner(user);
  const before = (await mock.planner(user)).records[0];

  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let holding = false;
  await page.route('**/api/v1/planner/commit', async (route) => {
    if (holding) return route.continue();
    holding = true;
    await held;
    await route.continue();
  });
  await titleInput(page).fill('전송 중 1');
  await expect.poll(() => holding).toBe(true);
  await titleInput(page).fill('전송 중 2');
  const journal = await expectPendingJournalOnly(page, userId, [before.id]);
  expect(journal.inflight?.changes).toHaveLength(1);
  expect(journal.drafts.map((draft) => draft.data?.title)).toEqual(['전송 중 2']);
  expect(journal.drafts[0].expectedVersion).toBe(before.version);

  release();
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  const saved = await dbById(user, before.id);
  expect(saved?.data?.title).toBe('전송 중 2');
  expect(saved?.version).toBe(before.version + 2);
  await expectNoPlannerPersistence(page);
});

test('새로고침 사이에 DB가 더 새로워졌으면 복원한 초안을 덮어쓰지 않고 충돌로 남긴다', async ({ page }) => {
  const user = testUser('fresh-conflict');
  await page.clock.install();
  await loginAs(page, user);
  await createDaily(page, '충돌 전');
  const { userId } = await mock.planner(user);
  const before = (await mock.planner(user)).records[0];
  await page.clock.pauseAt(Date.now() + 60_000);
  await titleInput(page).fill('복원될 내 초안');
  await expectPendingJournalOnly(page, userId, [before.id]);

  // 다른 기기가 먼저 저장
  await mock.seedPlanner(user, [{ kind: 'daily', id: before.id, data: dailyData(before.id, '다른 기기 최신') }]);
  await reloadAccepting(page);
  await page.clock.resume();
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'conflict');
  expect((await dbById(user, before.id))?.data?.title).toBe('다른 기기 최신');
  await sidebarPlan(page, '복원될 내 초안').click();
  await expect(titleInput(page)).toHaveValue('복원될 내 초안');
  // 초안은 원래 기대 버전 그대로 보관된다. 명시적으로 버리면 DB 내용과 빈 임시 보관이 된다.
  const journal = await expectPendingJournalOnly(page, userId, [before.id]);
  expect(journal.drafts[0].expectedVersion).toBe(before.version);
  await page.getByTestId('storage-sync-use-server').click();
  await page.getByTestId('storage-sync-confirm-use-server').click();
  await expect(titleInput(page)).toHaveValue('다른 기기 최신');
  await expectNoPlannerPersistence(page);
});

test('형식이 깨진 임시 보관은 적용·삭제·덮어쓰지 않고 파일 저장·명시적 삭제만 제공한다. 다른 계정 키는 읽지 않는다', async ({ page }) => {
  const user = testUser('journal-bad');
  await loginAs(page, user);
  const { userId } = await mock.planner(user);
  await createDaily(page, '깨진 보관 테스트');
  const before = (await mock.planner(user)).records[0];
  const otherKey = pendingJournalKey('00000000-0000-4000-8000-0000000000ff');
  const otherValue = JSON.stringify({ format: 1, userId: '00000000-0000-4000-8000-0000000000ff', drafts: [{ kind: 'daily', id: before.id, schemaVersion: 1, expectedVersion: 1, data: dailyData(before.id, '다른 계정 초안') }], inflight: null });
  const broken = '{"format":1,"userId":"' + userId + '","drafts":[{"kind":"daily","id":"x","schemaVersion":1,"expectedVersion":"one"}]';
  await seedJournal(page, otherKey, otherValue);
  await seedJournal(page, pendingJournalKey(userId), broken);
  const commitsBefore = (await mock.stats()).commits;

  await page.reload();
  await expect(page.getByTestId('storage-sync-journal-invalid')).toBeVisible();
  await expect(syncStatus(page)).toHaveAttribute('data-protection', 'invalid');
  await expect(page.getByText('다른 계정 초안')).toHaveCount(0);
  expect((await mock.stats()).commits).toBe(commitsBefore);
  // 새 수정은 DB에 저장되지만 깨진 보관은 덮어쓰지 않는다
  await sidebarPlan(page, '깨진 보관 테스트').click();
  await titleInput(page).fill('깨진 보관 중 수정');
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  expect((await dbById(user, before.id))?.data?.title).toBe('깨진 보관 중 수정');
  expect((await browserPersistence(page)).session).toEqual({ [otherKey]: otherValue, [pendingJournalKey(userId)]: broken });
  expect((await mock.stats()).commits).toBe(commitsBefore + 1);

  const download = page.waitForEvent('download');
  await page.getByTestId('storage-sync-journal-download').click();
  expect(fs.readFileSync(await (await download).path(), 'utf8')).toBe(broken);
  await page.getByTestId('storage-sync-journal-discard').click();
  await page.getByTestId('storage-sync-journal-discard-confirm').click();
  await expect(page.getByTestId('storage-sync-journal-invalid')).toHaveCount(0);
  // 이 계정 키만 지워지고 다른 계정 키는 그대로다
  expect((await browserPersistence(page)).session).toEqual({ [otherKey]: otherValue });
});

test('문서 검증을 통과하지 못하는 같은 계정 임시 보관은 적용하지 않고 원문을 보존한다', async ({ page }) => {
  const user = testUser('journal-shape');
  await loginAs(page, user);
  const { userId } = await mock.planner(user);
  // 구조는 맞지만 Daily 문서로는 잘못됨(제목 없음)
  const invalidDoc = JSON.stringify({ format: 1, userId, drafts: [{ kind: 'daily', id: 'bad-doc', schemaVersion: 1, expectedVersion: 0, data: { id: 'bad-doc' } }], inflight: null });
  await seedJournal(page, pendingJournalKey(userId), invalidDoc);
  await page.reload();
  await expect(page.getByTestId('storage-sync-journal-invalid')).toBeVisible();
  await expect(page.locator('aside')).toBeVisible();
  expect((await mock.stats()).commits).toBe(0);
  expect((await browserPersistence(page)).session).toEqual({ [pendingJournalKey(userId)]: invalidDoc });
});

test('임시 보관은 같은 계정 로그인 뒤에만 복원되고, 로그인 전 화면·다른 계정에는 보이거나 전송되지 않는다', async ({ page }) => {
  const alice = testUser('journal-alice');
  const bob = testUser('journal-bob');
  await loginAs(page, alice);
  await createDaily(page, 'Alice 저장본');
  const aliceId = (await mock.planner(alice)).userId;
  const record = (await mock.planner(alice)).records[0];
  await logout(page);
  await expectNoPlannerPersistence(page);

  // 같은 탭에 Alice의 미전송 변경분이 남아 있는 상황
  const aliceJournal = JSON.stringify({ format: 1, userId: aliceId, drafts: [{ kind: 'daily', id: record.id, schemaVersion: 1, expectedVersion: record.version, data: dailyData(record.id, 'Alice 미전송') }], inflight: null });
  await seedJournal(page, pendingJournalKey(aliceId), aliceJournal);
  await page.reload();
  await expect(page.getByText('Alice 미전송')).toHaveCount(0);

  await loginAs(page, bob);
  await expect(page.getByText('Alice 미전송')).toHaveCount(0);
  expect((await mock.planner(bob)).records).toEqual([]);
  expect((await browserPersistence(page)).session).toEqual({ [pendingJournalKey(aliceId)]: aliceJournal });
  await logout(page);

  await loginAs(page, alice);
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  expect((await dbById(alice, record.id))?.data?.title).toBe('Alice 미전송');
  await expectNoPlannerPersistence(page);
});

test('로그아웃은 저장을 마친 계정의 임시 보관만 지우고, 저장 실패 시에는 수정과 임시 보관을 남긴다', async ({ page }) => {
  const user = testUser('journal-logout');
  await loginAs(page, user);
  await createDaily(page, '로그아웃 보관');
  const { userId } = await mock.planner(user);
  const record = (await mock.planner(user)).records[0];
  const legacy = { 'plannet-daily': '{"state":{"dailyPlans":[]},"version":0}' };
  await page.evaluate((entries) => { for (const [k, v] of Object.entries(entries)) localStorage.setItem(k, v); }, legacy);

  await mock.configure({ storageMode: 'error' });
  await titleInput(page).fill('저장 실패 중');
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'error');
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: '저장되지 않은 수정이 있어 로그아웃하지 않았어요' })).toBeVisible();
  await expectPendingJournalOnly(page, userId, [record.id], legacy);

  await mock.configure({ storageMode: 'ok' });
  await page.getByRole('button', { name: '로그아웃', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
  expect((await dbById(user, record.id))?.data?.title).toBe('저장 실패 중');
  // 원본 LocalStorage는 그대로, 임시 보관은 비었다
  await expectNoPlannerPersistence(page, legacy);
});
