import { expect, Locator, Page } from '@playwright/test';
import { HOST, PORTS } from './stack.config.mjs';

// ---- 테스트 데이터 (실제 사용자 데이터 대신 LocalStorage에 직접 심는다) ----

export const DAILY_STORAGE_KEY = 'plannet-daily';
export const MANDALART_STORAGE_KEY = 'plannet-mandalart';

export interface SeedDailyPlan {
  id: string;
  template: 'daily';
  category: 'daily';
  title: string;
  year: number;
  month: number;
  day: number;
  todos: { id: string; text: string; completed: boolean }[];
  memo: string;
  createdAt: string;
  updatedAt: string;
}

const BASE_TIME = Date.parse('2026-01-01T00:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

/** n번째(1부터) 플랜일수록 나중에 만든 것. 수정 시각은 만든 순서와 반대로 둔다. */
export function dailyPlan(n: number, overrides: Partial<SeedDailyPlan> = {}): SeedDailyPlan {
  return {
    id: `seed-${n}`,
    template: 'daily',
    category: 'daily',
    title: `기록 ${n}`,
    year: 2026,
    month: 1,
    day: Math.min(n, 28),
    todos: [{ id: `todo-${n}`, text: `할 일 ${n}`, completed: n % 2 === 0 }],
    memo: `메모 ${n}`,
    createdAt: new Date(BASE_TIME + n * DAY_MS).toISOString(),
    updatedAt: new Date(BASE_TIME + (100 - n) * DAY_MS).toISOString(),
    ...overrides,
  };
}

export function dailyPlans(count: number): SeedDailyPlan[] {
  return Array.from({ length: count }, (_, i) => dailyPlan(i + 1));
}

/** 현재 origin의 저장 키에 Daily 플랜을 심고 새로 불러와 store가 복원하게 한다. */
export async function seedDaily(page: Page, plans: SeedDailyPlan[], storageKey = DAILY_STORAGE_KEY) {
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, value),
    { key: storageKey, value: JSON.stringify({ state: { dailyPlans: plans, currentDailyId: null }, version: 0 }) },
  );
  await page.reload();
  await expect(page.locator('aside')).toBeVisible();
}

export async function readStore<T = { state: Record<string, unknown> }>(page: Page, key: string): Promise<T | null> {
  const raw = await page.evaluate((k) => localStorage.getItem(k), key);
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function rawStore(page: Page, key: string): Promise<string | null> {
  return page.evaluate((k) => localStorage.getItem(k), key);
}

// ---- 화면 요소 ----

export function libraryDialog(page: Page): Locator {
  return page.getByRole('dialog', { name: '전체 플랜' });
}

export function libraryItem(page: Page, key: string): Locator {
  return libraryDialog(page).locator(`li[data-plan-key="${key}"]`);
}

/** 항목의 열기 버튼 (복제·삭제 버튼 앞의 첫 버튼) */
export function libraryOpenButton(page: Page, key: string): Locator {
  return libraryItem(page, key).getByRole('button').first();
}

export async function openLibrary(page: Page) {
  await page.getByRole('button', { name: /^전체 플랜 보기/ }).click();
  await expect(libraryDialog(page)).toBeVisible();
}

export function sidebarPlan(page: Page, title: string): Locator {
  return page.locator('aside').getByText(title, { exact: true });
}

// ---- 모의 Spring 인증 서버 제어 (이 스택 전용 포트) ----

const MOCK_API = `http://${HOST}:${PORTS.mockApi}`;

async function mockPost(path: string, body?: unknown): Promise<void> {
  const response = await fetch(`${MOCK_API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  if (!response.ok) throw new Error(`mock control ${path} failed: ${response.status}`);
}

export interface MockUser {
  sub: string;
  email: string;
  name: string;
}

export const mock = {
  reset: () => mockPost('/__mock/reset'),
  setNextUser: (nextUser: MockUser) => mockPost('/__mock/config', { nextUser }),
  /** 로그인한 서비스 모드의 기록은 (모의) DB에 있다. 다른 기기에서 저장한 것처럼 심는다 */
  seedPlanner: (user: MockUser, documents: { kind: string; id: string; data: unknown }[]) => mockPost('/__mock/planner', { sub: user.sub, documents }),
  planner: async (user: MockUser): Promise<{ records: { id: string; data: Record<string, unknown> | null }[] }> =>
    (await fetch(`${MOCK_API}/__mock/planner?sub=${encodeURIComponent(user.sub)}`)).json(),
};

export function testUser(id: string): MockUser {
  return { sub: `sub-${id}`, email: `${id}@example.test`, name: `User ${id.toUpperCase()}` };
}

export async function loginAs(page: Page, user: MockUser) {
  await mock.setNextUser(user);
  await page.goto('/');
  await page.getByRole('button', { name: 'Google 로그인' }).first().click();
  await expect(page.getByRole('button', { name: '로그아웃' })).toBeVisible();
  await expect(page.getByText(user.name)).toBeVisible();
}

export async function logout(page: Page) {
  await page.getByRole('button', { name: '로그아웃' }).click();
  await expect(page.getByRole('button', { name: 'Google 로그인' })).toBeVisible();
}
