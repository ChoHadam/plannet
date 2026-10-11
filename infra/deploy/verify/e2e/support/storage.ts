import { randomUUID } from 'node:crypto';
import { Browser, BrowserContext, expect, Page, Route } from '@playwright/test';
import { raw } from './raw';
import { PUBLIC_ORIGIN } from './env';
import { dismissGuide, login, pageFetch } from './ui';

/**
 * 서버 저장(PostgreSQL) 검증 헬퍼. 요청은 모두 브라우저 안 fetch(pageFetch)로 보낸다.
 * Playwright request context는 검증 도메인 host resolver 규칙을 따르지 않는다.
 * 계약: apps/api/.../storage/PlannerController.kt, apps/web/src/lib/plannerSyncApi.ts
 */
export const PLANNER_PATH = '/api/v1/planner';
export const ACCOUNT_HEADER = 'X-Plannet-User-Id';
const FIXTURE_TIME = '2026-09-27T00:00:00.000Z';

export interface StoredRecord {
  kind: string;
  id: string;
  version: number;
  schemaVersion: number;
  data: Record<string, unknown> | null;
  deleted: boolean;
}

export const titleInput = (page: Page) => page.getByPlaceholder('나의 투두리스트');
export const syncStatus = (page: Page) => page.getByTestId('storage-sync-status');

export async function currentUserId(page: Page): Promise<string> {
  const me = await pageFetch(page, '/api/v1/me');
  expect(me.status).toBe(200);
  const body = me.json as { storageEnabled?: boolean; user?: { userId?: string } };
  expect(body.storageEnabled).toBe(true);
  expect(body.user?.userId).toMatch(/^[0-9a-f-]{36}$/);
  return body.user!.userId!;
}

export async function records(page: Page, userId: string): Promise<StoredRecord[]> {
  const res = await pageFetch(page, PLANNER_PATH, { headers: { [ACCOUNT_HEADER]: userId } });
  expect(res.status).toBe(200);
  return (res.json as { records: StoredRecord[] }).records;
}

export async function findRecord(page: Page, userId: string, id: string) {
  return (await records(page, userId)).find((record) => record.id === id);
}

export async function csrfHeaders(page: Page): Promise<Record<string, string>> {
  const csrf = await pageFetch(page, '/api/v1/csrf');
  expect(csrf.status).toBe(200);
  const { headerName, token } = csrf.json as { headerName: string; token: string };
  return { [headerName]: token };
}

export async function commit(page: Page, userId: string, changes: object[], options: { requestId?: string; csrf?: boolean } = {}) {
  const headers = { [ACCOUNT_HEADER]: userId, ...(options.csrf === false ? {} : await csrfHeaders(page)) };
  return pageFetch(page, `${PLANNER_PATH}/commit`, {
    method: 'POST',
    headers,
    body: { requestId: options.requestId ?? randomUUID(), changes },
  });
}

/** PlannerValidator 의 Daily 필수 필드를 모두 갖춘 기록 */
export function daily(id: string, title = id, todoText = '서버에 보존할 할 일') {
  return {
    id, title, template: 'daily', category: 'daily', year: 2026, month: 9, day: 27,
    todos: [{ id: `${id}-todo`, text: todoText, completed: false }],
    memo: '', createdAt: FIXTURE_TIME, updatedAt: FIXTURE_TIME,
  };
}

export const newDailyChange = (id: string, title = id) => ({ kind: 'daily', id, schemaVersion: 1, expectedVersion: 0, data: daily(id, title) });

/** 독립 브라우저 context(다른 기기에 해당). 이 파일의 page와 쿠키·localStorage를 공유하지 않는다. */
export async function device(browser: Browser, secondAccount = false) {
  const context = await browser.newContext({ baseURL: PUBLIC_ORIGIN, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await login(page, secondAccount);
  return { context, page, userId: await currentUserId(page) };
}

/** 전체 플랜 검색으로 연다. 사이드바 최근 5개 제한과 이전 실행에서 쌓인 기록에 영향받지 않는다. */
export async function openPlan(page: Page, title: string) {
  await page.getByRole('button', { name: /^전체 플랜 보기/ }).click();
  const dialog = page.getByRole('dialog', { name: '전체 플랜' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('searchbox').fill(title);
  await dialog.getByRole('list', { name: '플랜 목록' }).getByRole('button').filter({ hasText: title }).first().click();
  await expect(dialog).toBeHidden();
  await expect(titleInput(page)).toHaveValue(title);
}

export async function createDaily(page: Page) {
  await page.getByRole('button', { name: '새로 만들기', exact: true }).nth(3).click();
  await page.getByRole('button', { name: '투두리스트 추천 간단한 일간 할 일 관리', exact: true }).click();
  await page.getByRole('button', { name: '확인', exact: true }).click();
  await dismissGuide(page);
  await expect(titleInput(page)).toBeVisible();
}

export async function downloadedDraft(page: Page): Promise<string> {
  const event = page.waitForEvent('download');
  await page.getByTestId('storage-sync-download').click();
  const stream = await (await event).createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

// ---- 저장 전 변경분 임시 보관(sessionStorage) · 새로고침 ----

/** 앱의 계정별 임시 보관 키 (apps/web/src/lib/pendingJournal.ts) */
export const pendingJournalKey = (userId: string) => `plannet-pending@${userId}`;

export interface PendingJournal {
  format: number;
  userId: string;
  drafts: { kind: string; id: string; expectedVersion: number; data: Record<string, unknown> | null }[];
  inflight: { requestId: string; changes: { kind: string; id: string; expectedVersion: number; data: Record<string, unknown> | null }[] } | null;
}

/** 브라우저 저장소의 Plannet 키. 로그인한 서비스는 localStorage에 전체 사본을 두지 않는다 */
export async function plannerKeys(page: Page) {
  return page.evaluate(() => ({
    local: Object.keys(localStorage).filter((key) => key.startsWith('plannet')).sort(),
    session: Object.keys(sessionStorage).filter((key) => key.startsWith('plannet')).sort(),
  }));
}

/** 이 계정의 임시 보관 내용. 변경분·전송 중 요청만 있고 기준 사본(base)이 없어야 한다 */
export async function pendingJournal(page: Page, userId: string): Promise<PendingJournal | null> {
  const raw = await page.evaluate((key) => sessionStorage.getItem(key), pendingJournalKey(userId));
  if (raw === null) return null;
  const journal = JSON.parse(raw);
  expect(Object.keys(journal).sort()).toEqual(['drafts', 'format', 'inflight', 'savedAt', 'userId']);
  expect(journal).toMatchObject({ format: 1, userId });
  return journal as PendingJournal;
}

/** 미저장 상태의 새로고침: beforeunload 확인 창이 떠야 하고, 수락해 새로고침한다 */
export async function reloadAcceptingUnload(page: Page) {
  const dialog = new Promise<string>((resolve) => {
    page.once('dialog', (shown) => { resolve(shown.type()); void shown.accept(); });
  });
  await page.reload();
  expect(await dialog).toBe('beforeunload');
}

/**
 * 서버에는 커밋하고 브라우저에는 응답을 주지 않는다(응답 유실). route.fetch는 검증 도메인 해석을 따르지 않아
 * raw(127.0.0.1 + SNI)로 같은 요청을 보낸다. 서버가 돌려준 원래 ACK 본문을 반환한다.
 */
export async function forwardThenAbort(route: Route, context: BrowserContext): Promise<{ records: StoredRecord[] }> {
  const request = route.request();
  const body = request.postData() ?? '';
  const headers = Object.fromEntries(Object.entries(await request.allHeaders())
    .filter(([name]) => !name.startsWith(':') && !['host', 'content-length', 'accept-encoding', 'connection'].includes(name)));
  if (!headers.cookie) headers.cookie = (await context.cookies()).map((c) => `${c.name}=${c.value}`).join('; ');
  headers['content-length'] = String(Buffer.byteLength(body));
  const response = await raw(new URL(request.url()).pathname, { method: 'POST', headers, body });
  expect(response.status, response.body).toBe(200);
  await route.abort('failed');
  return response.json<{ records: StoredRecord[] }>();
}
