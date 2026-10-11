import { randomUUID } from 'node:crypto';
import { expect, Page, test } from '@playwright/test';
import { APP_NAMESPACE, MOCK_NAMESPACE, PUBLIC_ORIGIN, SESSION_COOKIE } from './support/env';
import {
  DB_MAINTENANCE_LABEL, DB_PORT, DB_PVC, DB_SERVICE, psqlAsApp, resourceUid, scaleApi, scaleDb,
  tcpProbeFromPod, tcpProbeFromWeb, waitApiReachable,
} from './support/kube';
import {
  ACCOUNT_HEADER, commit, createDaily, currentUserId, device, downloadedDraft, findRecord, forwardThenAbort, newDailyChange, openPlan,
  pendingJournal, pendingJournalKey, PLANNER_PATH, plannerKeys, records, reloadAcceptingUnload, StoredRecord, syncStatus, titleInput,
} from './support/storage';
import { login, pageFetch, sessionCookie } from './support/ui';

/**
 * [모의 인증 검증] HTTPS Gateway + 운영 Web + 실제 Spring + 실제 PostgreSQL(PVC) 서버 저장.
 * Google·AI만 대역이다. 기록은 실행마다 고유 ID/제목을 써서 이전 실행 데이터와 섞이지 않는다.
 */

const DB_HOST = `${DB_SERVICE}.${APP_NAMESPACE}.svc`;
const todoInput = (page: Page) => page.getByPlaceholder('할 일을 입력하세요...');
const retryButton = (page: Page) => page.getByRole('button', { name: '서버 저장 다시 시도', exact: true });

test('DB 접근은 API·유지보수 label로 제한되고, 앱 DB role은 superuser가 아니다', async ({ page }) => {
  test.setTimeout(240_000);
  // 대조군: 허용된 유지보수 label은 연결된다 (DNS·Service·DB가 살아 있음을 함께 증명)
  expect(tcpProbeFromPod(APP_NAMESPACE, { 'app.kubernetes.io/name': DB_MAINTENANCE_LABEL }, DB_HOST, DB_PORT)).toBe('open');
  // 같은 namespace라도 허용되지 않은 label, 다른 namespace(대역), Web pod는 연결되지 않는다
  const denied = {
    untrusted: tcpProbeFromPod(APP_NAMESPACE, { 'app.kubernetes.io/name': 'plannet-untrusted' }, DB_HOST, DB_PORT),
    mocks: tcpProbeFromPod(MOCK_NAMESPACE, { 'app.kubernetes.io/name': 'mock-probe' }, DB_HOST, DB_PORT),
    web: tcpProbeFromWeb(DB_HOST, DB_PORT),
  };
  for (const [source, result] of Object.entries(denied)) {
    expect(result, source).toMatch(/^ERR:/);
    expect(result, `${source}: 이름 해석 실패가 아니라 정책 차단이어야 한다`).not.toBe('ERR:ENOTFOUND');
  }

  // TCP 연결 가능 여부와 별개로 SQL 인증·권한을 확인한다
  expect(psqlAsApp('select current_user, rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls from pg_roles where rolname = current_user'))
    .toBe('plannet_app|f|f|f|f|f');
  const denials: Record<string, string> = {};
  for (const [name, run] of [
    ['connect postgres db', () => psqlAsApp('select 1', 'postgres')],
    ['create role', () => psqlAsApp('create role plannet_escalation_probe')],
  ] as const) {
    try {
      run();
      denials[name] = 'allowed';
    } catch (error) {
      denials[name] = String((error as { stderr?: string }).stderr ?? error);
    }
  }
  expect(denials['connect postgres db']).toMatch(/permission denied for database/);
  expect(denials['create role']).toMatch(/permission denied to create role/);

  // 실제 API 연결 role: 로그인·조회로 연결 풀을 쓰게 한 뒤 plannet DB의 다른 세션 role을 본다 (Secret 값은 읽지 않는다)
  await login(page);
  await records(page, await currentUserId(page));
  expect(psqlAsApp(
    "select string_agg(distinct a.usename || ':' || r.rolsuper::text, ',') from pg_stat_activity a join pg_roles r on r.rolname = a.usename " +
    "where a.datname = 'plannet' and a.backend_type = 'client backend' and a.pid <> pg_backend_pid()",
  )).toBe('plannet_app:false');
});

test('Daily UI 수정이 저장되고 다른 브라우저가 복원한다. 다른 계정·오래된 계정 헤더·CSRF 없는 쓰기는 거부된다', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await login(page);
  const userId = await currentUserId(page);
  await createDaily(page);
  const title = `기기 간 복원 ${randomUUID()}`;
  const todo = `다른 기기에서도 보이는 기록 ${randomUUID()}`;
  await titleInput(page).fill(title);
  await todoInput(page).fill(todo);
  await todoInput(page).press('Enter');
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  await expect.poll(async () => (await records(page, userId)).find((r) => r.data?.title === title)?.data?.todos).toEqual(
    expect.arrayContaining([expect.objectContaining({ text: todo })]),
  );
  const saved = (await records(page, userId)).find((r) => r.data?.title === title)!;

  const remote = await device(browser);
  const other = await device(browser, true);
  try {
    expect(remote.userId).toBe(userId);
    await openPlan(remote.page, title);
    await expect(remote.page.getByText(todo, { exact: true })).toBeVisible();

    expect(other.userId).not.toBe(userId);
    const otherRecords = await records(other.page, other.userId);
    expect(otherRecords.some((r) => r.id === saved.id || r.data?.title === title)).toBe(false);

    // 이전 계정 ID를 헤더로 보내도 소유자를 선택하지 못한다 (계정 전환 전제조건만 확인)
    const staleRead = await pageFetch(other.page, PLANNER_PATH, { headers: { [ACCOUNT_HEADER]: userId } });
    expect(staleRead.status).toBe(409);
    expect(staleRead.json).toMatchObject({ error: 'account_changed' });
    const staleId = `stale-${randomUUID()}`;
    const staleWrite = await commit(other.page, userId, [newDailyChange(staleId)]);
    expect(staleWrite.status).toBe(409);
    expect(staleWrite.json).toMatchObject({ error: 'account_changed' });
    // 소유자 기록 덮어쓰기 시도도 같은 이유로 거부된다
    const overwrite = await commit(other.page, userId, [{ kind: 'daily', id: saved.id, schemaVersion: 1, expectedVersion: saved.version, data: null }]);
    expect(overwrite.status).toBe(409);

    // 자기 계정 헤더라도 CSRF 토큰이 없으면 쓰기 거부
    const noCsrfId = `no-csrf-${randomUUID()}`;
    const noCsrf = await commit(other.page, other.userId, [newDailyChange(noCsrfId)], { csrf: false });
    expect(noCsrf.status).toBe(403);

    expect((await records(other.page, other.userId)).some((r) => [staleId, noCsrfId].includes(r.id))).toBe(false);
    const ownerAfter = await records(page, userId);
    expect(ownerAfter.some((r) => [staleId, noCsrfId].includes(r.id))).toBe(false);
    expect(ownerAfter.find((r) => r.id === saved.id)).toEqual(saved);
  } finally {
    await remote.context.close();
    await other.context.close();
  }
});

test('두 브라우저 동시 수정: 서버 승자 보존, 패자 초안은 파일 저장·새로고침 뒤에도 충돌로 남고 명시적으로 버려야 서버 내용이 된다', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await login(page);
  const userId = await currentUserId(page);
  const id = `conflict-${randomUUID()}`;
  expect((await commit(page, userId, [newDailyChange(id)])).status).toBe(200);
  await page.reload();
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  await openPlan(page, id);

  const second = await device(browser);
  try {
    await openPlan(second.page, id);
    const winner = `PC에서 수정 ${id}`;
    await titleInput(page).fill(winner);
    await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
    await expect.poll(async () => (await findRecord(page, userId, id))?.data?.title).toBe(winner);
    const winnerRecord = (await findRecord(page, userId, id))!;

    const loser = `보존할 휴대폰 초안 ${id}`;
    await titleInput(second.page).fill(loser);
    await expect(syncStatus(second.page)).toHaveAttribute('data-phase', 'conflict');
    await expect(syncStatus(second.page)).toContainText('다른 기기에서 바뀐 기록이 있어');
    expect(await findRecord(page, userId, id)).toEqual(winnerRecord);
    await expect(titleInput(second.page)).toHaveValue(loser);
    expect(await downloadedDraft(second.page)).toContain(loser);

    // 충돌 초안은 이 탭의 임시 보관에 변경분만 남는다(원래 기대 버전). 새로고침해도 충돌로 복원되고 DB 승자는 그대로다.
    const conflicted = await pendingJournal(second.page, userId);
    expect(conflicted?.drafts.map((draft) => [draft.id, draft.expectedVersion])).toEqual([[id, winnerRecord.version - 1]]);
    expect((await plannerKeys(second.page)).local).toEqual([]);
    await reloadAcceptingUnload(second.page);
    await expect(syncStatus(second.page)).toHaveAttribute('data-phase', 'conflict');
    await openPlan(second.page, loser);
    expect(await findRecord(page, userId, id)).toEqual(winnerRecord);

    // 명시적으로 서버 내용을 선택: 확인 후에만 초안을 버린다. 버린 뒤에는 임시 보관도 비워진다.
    await second.page.getByTestId('storage-sync-use-server').click();
    await expect(titleInput(second.page)).toHaveValue(loser);
    await second.page.getByTestId('storage-sync-confirm-use-server').click();
    await expect(syncStatus(second.page)).toHaveAttribute('data-phase', 'saved');
    await expect(titleInput(second.page)).toHaveValue(winner);
    expect(await plannerKeys(second.page)).toEqual({ local: [], session: [] });
    expect(await findRecord(page, userId, id)).toEqual(winnerRecord);

    await second.page.reload();
    await expect(syncStatus(second.page)).toHaveAttribute('data-phase', 'saved');
    await openPlan(second.page, winner);
  } finally {
    await second.context.close();
  }
});

test('저장 응답 유실 후 새로고침: 임시 보관된 같은 requestId를 재전송해 원래 ACK를 받고 버전은 한 번만 오른다', async ({ page, context }) => {
  test.setTimeout(180_000);
  await login(page);
  const userId = await currentUserId(page);
  await createDaily(page);
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  const title = `응답 유실 ${randomUUID()}`;
  const sent: string[] = [];
  let lostAck: { records: StoredRecord[] } | null = null;

  // 첫 요청만: 서버에는 커밋되고 브라우저는 응답을 받지 못한다
  await page.route('**/api/v1/planner/commit', async (route) => {
    const body = route.request().postData() ?? '';
    if (!body.includes(title)) return route.continue();
    sent.push(JSON.parse(body).requestId);
    if (lostAck) return route.continue();
    lostAck = await forwardThenAbort(route, context);
  });

  await titleInput(page).fill(title);
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'error');
  const committed = (await records(page, userId)).filter((r) => r.data?.title === title);
  expect(committed).toHaveLength(1);
  const acked = lostAck!.records.find((r) => r.id === committed[0].id)!;
  expect(committed[0].version).toBe(acked.version);
  // 새로고침 전: 임시 보관에 POST 전 기록한 바로 그 요청이 남아 있다
  const journal = await pendingJournal(page, userId);
  expect(journal?.inflight?.requestId).toBe(sent[0]);
  expect((await plannerKeys(page)).local).toEqual([]);

  // 실제 새로고침: DB를 읽은 뒤 같은 requestId를 다시 보내고 서버는 원래 ACK를 재구성해 돌려준다
  const replay = page.waitForResponse((res) => res.url().endsWith('/api/v1/planner/commit') && (res.request().postData() ?? '').includes(title));
  await reloadAcceptingUnload(page);
  const replayed = await (await replay).json() as { records: StoredRecord[] };
  expect(replayed).toEqual(lostAck);
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  expect(sent).toEqual([sent[0], sent[0]]);
  const final = (await records(page, userId)).filter((r) => r.data?.title === title);
  expect(final).toHaveLength(1);
  expect(final[0].version).toBe(acked.version);
  expect(await plannerKeys(page)).toEqual({ local: [], session: [] });
  await openPlan(page, title);
});

test('650ms 저장 대기 중 새로고침: 변경분만 임시 보관되고 새로고침 뒤 원래 기대 버전으로 한 번 저장된다', async ({ page }) => {
  test.setTimeout(180_000);
  await page.clock.install();
  await login(page);
  const userId = await currentUserId(page);
  await createDaily(page);
  const title = `대기 중 새로고침 ${randomUUID()}`;
  await titleInput(page).fill(`${title} 전`);
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  const before = (await records(page, userId)).find((r) => r.data?.title === `${title} 전`)!;

  // 시계를 멈춰 저장 타이머가 돌지 않게 한다 → 수정은 아직 DB에 없다
  await page.clock.pauseAt(Date.now() + 60_000);
  await titleInput(page).fill(title);
  const journal = await pendingJournal(page, userId);
  expect(journal?.inflight).toBeNull();
  expect(journal?.drafts.map((draft) => [draft.id, draft.expectedVersion])).toEqual([[before.id, before.version]]);
  expect((await findRecord(page, userId, before.id))?.data?.title).toBe(`${title} 전`);

  await reloadAcceptingUnload(page);
  await page.clock.resume();
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  const saved = await findRecord(page, userId, before.id);
  expect(saved?.data?.title).toBe(title);
  expect(saved?.version).toBe(before.version + 1);
  expect(await plannerKeys(page)).toEqual({ local: [], session: [] });
});

test('전송 중에 생긴 새 수정은 임시 보관에 남고 응답 뒤 확인된 버전 위에서 DB까지 저장된다', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const userId = await currentUserId(page);
  await createDaily(page);
  const title = `전송 중 수정 ${randomUUID()}`;
  await titleInput(page).fill(`${title} 0`);
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  const before = (await records(page, userId)).find((r) => r.data?.title === `${title} 0`)!;

  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  let holding = false;
  await page.route('**/api/v1/planner/commit', async (route) => {
    if (holding || !(route.request().postData() ?? '').includes(title)) return route.continue();
    holding = true;
    await held;
    await route.continue();
  });
  await titleInput(page).fill(`${title} 1`);
  await expect.poll(() => holding).toBe(true);
  await titleInput(page).fill(`${title} 2`);
  const journal = await pendingJournal(page, userId);
  expect(journal?.inflight?.changes.map((change) => change.data?.title)).toEqual([`${title} 1`]);
  expect(journal?.drafts.map((draft) => [draft.data?.title, draft.expectedVersion])).toEqual([[`${title} 2`, before.version]]);

  release();
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  const saved = await findRecord(page, userId, before.id);
  expect(saved?.data?.title).toBe(`${title} 2`);
  expect(saved?.version).toBe(before.version + 2);
  expect(await plannerKeys(page)).toEqual({ local: [], session: [] });
});

test('sessionStorage를 쓸 수 없어도 DB에 저장되고, 다른 계정의 임시 보관은 적용·전송되지 않는다', async ({ page, browser }) => {
  test.setTimeout(240_000);
  await login(page);
  const firstId = await currentUserId(page);

  // 1) sessionStorage 접근 자체가 거부된 브라우저
  const denied = await browser.newContext({ baseURL: PUBLIC_ORIGIN, ignoreHTTPSErrors: true });
  try {
    await denied.addInitScript(() => {
      Object.defineProperty(window, 'sessionStorage', { get() { throw new DOMException('denied', 'SecurityError'); } });
    });
    const deniedPage = await denied.newPage();
    await login(deniedPage);
    await createDaily(deniedPage);
    const title = `임시 보관 차단 ${randomUUID()}`;
    await titleInput(deniedPage).fill(title);
    await expect(syncStatus(deniedPage)).toHaveAttribute('data-phase', 'saved');
    await expect(deniedPage.getByTestId('storage-sync-protection-unavailable')).toBeVisible();
    expect((await records(page, firstId)).some((r) => r.data?.title === title)).toBe(true);
  } finally { await denied.close(); }

  // 2) 같은 탭에 첫 계정의 미전송 변경분이 남은 상태로 두 번째 계정이 로그인
  const shared = await browser.newContext({ baseURL: PUBLIC_ORIGIN, ignoreHTTPSErrors: true });
  try {
    const draftId = `scoped-${randomUUID()}`;
    const journal = JSON.stringify({ format: 1, userId: firstId, savedAt: 'synthetic', drafts: [newDailyChange(draftId, `첫 계정 미전송 ${draftId}`)], inflight: null });
    const tab = await shared.newPage();
    await tab.goto('/');
    await tab.evaluate(([key, value]) => sessionStorage.setItem(key, value), [pendingJournalKey(firstId), journal]);
    await login(tab, true);
    const secondId = await currentUserId(tab);
    await expect(tab.getByText(`첫 계정 미전송 ${draftId}`)).toHaveCount(0);
    expect((await records(tab, secondId)).some((r) => r.id === draftId)).toBe(false);
    expect(await tab.evaluate((key) => sessionStorage.getItem(key), pendingJournalKey(firstId))).toBe(journal);
    expect((await records(page, firstId)).some((r) => r.id === draftId)).toBe(false);
    // 같은 탭에서 원래 계정으로 로그인해야만 복원되어 그 계정 DB로 저장된다
    await tab.getByRole('button', { name: '로그아웃' }).click();
    await expect(tab.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
    await login(tab);
    await expect.poll(async () => (await findRecord(tab, firstId, draftId))?.data?.title).toBe(`첫 계정 미전송 ${draftId}`);
    await expect(syncStatus(tab)).toHaveAttribute('data-phase', 'saved');
    expect((await plannerKeys(tab)).session).toEqual([]);
  } finally { await shared.close(); }
});

test('HTTPS 경유 조건부 조회: ETag·no-store, 같은 ETag는 본문 없는 304, 수정·삭제 뒤 200. 계정 불일치·미인증은 304가 아니다', async ({ page, browser }) => {
  test.setTimeout(180_000);
  await login(page);
  const userId = await currentUserId(page);
  const get = (etag?: string, account: string | null = userId) => pageFetch(page, PLANNER_PATH, {
    cache: 'no-store',
    headers: { ...(account ? { [ACCOUNT_HEADER]: account } : {}), ...(etag ? { 'If-None-Match': etag } : {}) },
  });
  const first = await get();
  expect(first.status).toBe(200);
  expect(first.etag).toMatch(/^W\/"ps1-[A-Za-z0-9_-]+"$/);
  expect(first.cacheControl).toContain('no-store');

  const notModified = await get(first.etag!);
  expect(notModified.status).toBe(304);
  expect(notModified.text).toBe('');
  expect(notModified.etag).toBe(first.etag);
  expect(notModified.cacheControl).toContain('no-store');

  const id = `etag-${randomUUID()}`;
  expect((await commit(page, userId, [newDailyChange(id)])).status).toBe(200);
  const created = await get(first.etag!);
  expect(created.status).toBe(200);
  expect(created.etag).not.toBe(first.etag);
  expect((created.json as { records: StoredRecord[] }).records.some((r) => r.id === id)).toBe(true);

  expect((await commit(page, userId, [{ kind: 'daily', id, schemaVersion: 1, expectedVersion: 1, data: null }])).status).toBe(200);
  const deleted = await get(created.etag!);
  expect(deleted.status).toBe(200);
  expect(deleted.etag).not.toBe(created.etag);
  expect((deleted.json as { records: StoredRecord[] }).records.find((r) => r.id === id)?.deleted).toBe(true);

  // 소유자 확인이 먼저다: 맞는 ETag여도 계정 헤더가 틀리거나 없으면 409, 로그인하지 않으면 401
  const wrong = await get(deleted.etag!, randomUUID());
  expect(wrong.status).toBe(409);
  expect((await get(deleted.etag!, null)).status).toBe(409);
  const anonymous = await browser.newContext({ baseURL: PUBLIC_ORIGIN, ignoreHTTPSErrors: true });
  try {
    const anonPage = await anonymous.newPage();
    await anonPage.goto('/');
    const unauth = await pageFetch(anonPage, PLANNER_PATH, { cache: 'no-store', headers: { [ACCOUNT_HEADER]: userId, 'If-None-Match': deleted.etag! } });
    expect(unauth.status).toBe(401);
  } finally { await anonymous.close(); }
  // 와일드카드는 안전하게 200
  expect((await get('*')).status).toBe(200);
});

test('저장 영수증은 메타데이터만 남기고, 수정·삭제 뒤 재전송도 원래 ACK를 돌려주며 같은 ID 다른 내용은 409다', async ({ page }) => {
  test.setTimeout(180_000);
  await login(page);
  const userId = await currentUserId(page);
  const id = `receipt-${randomUUID()}`;
  const requestId = randomUUID();
  const original = await commit(page, userId, [newDailyChange(id)], { requestId });
  expect(original.status).toBe(200);
  expect((await commit(page, userId, [{ ...newDailyChange(id, `${id} 수정`), expectedVersion: 1 }])).status).toBe(200);
  expect((await commit(page, userId, [{ kind: 'daily', id, schemaVersion: 1, expectedVersion: 2, data: null }])).status).toBe(200);

  const replay = await commit(page, userId, [newDailyChange(id)], { requestId });
  expect(replay.status).toBe(200);
  expect(replay.json).toEqual(original.json);
  expect((await findRecord(page, userId, id))?.version).toBe(3);

  // SQL에는 생성한 UUID만 넣는다(형식 검사 후). 영수증 본문에는 플랜 데이터가 없다.
  expect(requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  expect(psqlAsApp(
    "select response->>'format', jsonb_path_exists(response, '$.records[*].data'), jsonb_array_length(response->'records'), " +
    `length(response::text) < 1000 from planner_commit_receipt where request_id = '${requestId}'`,
  )).toBe('2|f|1|t');

  const reused = await commit(page, userId, [newDailyChange(id, `${id} 다른 내용`)], { requestId });
  expect(reused.status).toBe(409);
  expect(reused.json).toMatchObject({ error: 'idempotency_conflict' });
  expect((await findRecord(page, userId, id))?.version).toBe(3);
});

test('PostgreSQL 중단·재시작과 API 재시작 후에도 PVC·사용자·기록이 유지된다', async ({ page, context }) => {
  // DB 정상 종료 대기(최대 terminationGracePeriod 60초)·기동·API 재기동을 포함한다
  test.setTimeout(600_000);
  await login(page);
  const userId = await currentUserId(page);
  const pvcUid = resourceUid('pvc', DB_PVC);
  const dbPodUid = resourceUid('pod', 'plannet-db-0');
  const beforeId = `before-outage-${randomUUID()}`;
  expect((await commit(page, userId, [newDailyChange(beforeId)])).status).toBe(200);
  const beforeRecord = (await findRecord(page, userId, beforeId))!;

  await createDaily(page);
  const savedTitle = `중단 전 저장 ${randomUUID()}`;
  await titleInput(page).fill(savedTitle);
  await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
  const planId = (await records(page, userId)).find((r) => r.data?.title === savedTitle)!.id;
  const outageTitle = `중단 중 수정 ${planId}`;

  let primaryError: unknown;
  try {
    scaleDb(0);

    // DB가 없으면 저장이 실패하고, 초안은 남아 파일로 받을 수 있다
    await titleInput(page).fill(outageTitle);
    await expect(syncStatus(page)).toHaveAttribute('data-phase', 'error', { timeout: 45_000 });
    await expect(page.getByText(/서버에 저장되지 않은 기록 \d+개가 남아 있어요/)).toBeVisible();
    expect(await downloadedDraft(page)).toContain(outageTitle);
    const duringOutage = await pageFetch(page, PLANNER_PATH, { headers: { [ACCOUNT_HEADER]: userId } });
    expect(duringOutage.status).toBeGreaterThanOrEqual(500);
    // 저장하지 못한 수정이 있으면 로그아웃하지 않는다: 요청을 보내지 않고 세션·작업 공간·임시 보관이 그대로다
    const cookieBeforeLogout = await sessionCookie(context);
    const logoutRequests: string[] = [];
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().endsWith('/api/v1/logout')) logoutRequests.push(request.url());
    });
    await page.getByRole('button', { name: '로그아웃' }).click();
    // settle() completes up to three bounded save attempts before refusing logout.
    // The default 5s assertion timeout can restore the DB in finally while those attempts are still running.
    await expect(page.getByRole('alert').filter({ hasText: '저장되지 않은 수정이 있어 로그아웃하지 않았어요' })).toBeVisible({ timeout: 60_000 });
    await expect(titleInput(page)).toHaveValue(outageTitle);
    expect((await sessionCookie(context))?.value).toBe(cookieBeforeLogout?.value);
    expect(logoutRequests).toEqual([]);
    // /me also resolves the account through PostgreSQL, so it is unavailable during this outage.
    expect((await pageFetch(page, '/api/v1/me')).status).toBe(503);
    expect((await pendingJournal(page, userId))?.drafts.some((draft) => draft.data?.title === outageTitle)).toBe(true);

    scaleDb(1);
    await expect.poll(async () => (await pageFetch(page, PLANNER_PATH, { headers: { [ACCOUNT_HEADER]: userId } })).status, {
      timeout: 90_000,
    }).toBe(200);
    expect(await currentUserId(page)).toBe(userId);
    expect((await sessionCookie(context))?.value).toBe(cookieBeforeLogout?.value);

    await retryButton(page).click();
    await expect(syncStatus(page)).toHaveAttribute('data-phase', 'saved');
    expect((await findRecord(page, userId, planId))?.data?.title).toBe(outageTitle);
    expect(await findRecord(page, userId, beforeId)).toEqual(beforeRecord);
    expect(resourceUid('pvc', DB_PVC)).toBe(pvcUid);
    expect(resourceUid('pod', 'plannet-db-0')).not.toBe(dbPodUid);

    // API 재시작: 세션은 메모리라 재로그인이 필요하지만 PostgreSQL의 사용자·기록은 그대로다
    const cookie = await sessionCookie(context);
    scaleApi(0);
    scaleApi(1);
    await waitApiReachable();
    expect(await sessionCookie(context)).toMatchObject({ name: SESSION_COOKIE, value: cookie!.value });
    expect((await pageFetch(page, '/api/v1/me')).status).toBe(401);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Google 로그인' }).first()).toBeVisible();
    await login(page);
    expect(await currentUserId(page)).toBe(userId);
    expect((await findRecord(page, userId, planId))?.data?.title).toBe(outageTitle);
    expect(await findRecord(page, userId, beforeId)).toEqual(beforeRecord);
    await openPlan(page, outageTitle);
    // 저장이 끝난 뒤의 로그아웃은 게이트 랜딩으로 돌아가고 서버 세션도 끝난다
    await page.getByRole('button', { name: '로그아웃' }).click();
    await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
    await expect(page.locator('aside')).toHaveCount(0);
    expect((await pageFetch(page, '/api/v1/me')).status).toBe(401);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    // 단언 실패와 무관하게 클러스터를 원래 상태(각 1개, Ready)로 되돌린다. 이미 1개면 scale은 변화 없이 Ready만 기다린다.
    const recoveries: unknown[] = [];
    for (const restore of [() => scaleDb(1), () => scaleApi(1)]) {
      try {
        restore();
      } catch (error) {
        recoveries.push(error);
      }
    }
    await waitApiReachable().catch((error) => recoveries.push(error));
    if (recoveries.length) {
      const message = `cluster recovery failed: ${recoveries.map(String).join('; ')}`;
      console.error(message);
      // 원래 단언 실패를 가리지 않는다
      if (!primaryError) throw new Error(message);
    }
  }
});
