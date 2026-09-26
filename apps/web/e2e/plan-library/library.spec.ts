import { test, expect, Page } from '@playwright/test';
import { createPlan } from '../support/helpers';
import {
  DAILY_STORAGE_KEY,
  MANDALART_STORAGE_KEY,
  dailyPlan,
  dailyPlans,
  libraryDialog,
  libraryOpenButton,
  openLibrary,
  rawStore,
  readStore,
  seedDaily,
  sidebarPlan,
} from './helpers';

// 전체 플랜 목록(docs/plan-library.md). 인증 off → LOCAL 저장 범위.

interface DailyState {
  state: { dailyPlans: { id: string; title: string }[]; currentDailyId: string | null };
}
interface MandalartState {
  state: { mandalarts: { id: string; title: string }[]; currentId: string | null };
}

const dailyTitleInput = (page: Page) => page.locator('input[placeholder="나의 투두리스트"]');
const mandalartTitleInput = (page: Page) => page.locator('input[placeholder="나의 만다라트"]');

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('6개 이상이면 최근 5개와 더보기를 보여주고, 오래된 플랜을 열어도 원본은 바뀌지 않는다', async ({ page }) => {
  const seeded = dailyPlans(8);
  await seedDaily(page, seeded);

  // 최근 만든 5개(기록 8~4)만 사이드바에 보인다.
  for (const n of [8, 7, 6, 5, 4]) await expect(sidebarPlan(page, `기록 ${n}`)).toBeVisible();
  for (const n of [3, 2, 1]) await expect(sidebarPlan(page, `기록 ${n}`)).toHaveCount(0);

  const before = await rawStore(page, DAILY_STORAGE_KEY);

  await page.getByRole('button', { name: '일간 플랜 전체 8개 보기' }).click();
  const dialog = libraryDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '일간 플랜 8' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByText('8개 플랜')).toBeVisible();
  await expect(dialog.locator('li')).toHaveCount(8);

  // 정렬: 만든 순(기본) → 수정 순 → 제목 순. 표시 순서만 바뀐다.
  const order = () => dialog.locator('li').evaluateAll((items) => items.map((li) => li.getAttribute('data-plan-key')));
  expect(await order()).toEqual(seeded.map((p) => `daily:${p.id}`).reverse());
  await dialog.getByRole('combobox').selectOption('updated');
  expect(await order()).toEqual(seeded.map((p) => `daily:${p.id}`));
  await dialog.getByRole('combobox').selectOption('title');
  expect(await order()).toEqual(seeded.map((p) => `daily:${p.id}`));

  // 검색
  await dialog.getByRole('searchbox', { name: '플랜 제목 검색' }).fill('  기록 1 ');
  await expect(dialog.getByText('검색 결과 1개')).toBeVisible();
  await expect(dialog.locator('li')).toHaveCount(1);

  // 조회·정렬·검색만으로는 저장 데이터가 한 글자도 바뀌지 않는다.
  expect(await rawStore(page, DAILY_STORAGE_KEY)).toBe(before);

  // 가장 오래된 플랜 열기
  await libraryOpenButton(page, 'daily:seed-1').click();
  await expect(dialog).toBeHidden();
  await expect(dailyTitleInput(page)).toHaveValue('기록 1');
  await expect(page.getByText('할 일 1')).toBeVisible();

  const after = await readStore<{ state: { dailyPlans: unknown[]; currentDailyId: string } }>(page, DAILY_STORAGE_KEY);
  expect(after?.state.currentDailyId).toBe('seed-1');
  // 선택 상태 외에 날짜·내용·updatedAt은 그대로다.
  expect(after?.state.dailyPlans).toEqual(seeded);
});

test('같은 제목·같은 날짜·겹치는 id라도 template+id로 따로 보여주고 하나만 선택한다', async ({ page }) => {
  await createPlan(page, '만다라트', 0);
  await mandalartTitleInput(page).fill('공통 제목');
  await expect(sidebarPlan(page, '공통 제목')).toBeVisible();
  const mandalart = await readStore<MandalartState>(page, MANDALART_STORAGE_KEY);
  const sharedId = mandalart!.state.mandalarts[0].id;

  // 다른 템플릿의 같은 id, 같은 템플릿의 같은 제목·같은 날짜
  await seedDaily(page, [
    dailyPlan(1, { id: sharedId, title: '공통 제목' }),
    dailyPlan(2, { id: 'twin', title: '공통 제목', day: 1 }),
    dailyPlan(3, { title: '다른 제목' }),
  ]);

  await openLibrary(page);
  const dialog = libraryDialog(page);
  await expect(dialog.getByText('4개 플랜')).toBeVisible();
  await dialog.getByRole('searchbox').fill('공통');
  await expect(dialog.getByText('검색 결과 3개')).toBeVisible();
  const keys = await dialog.locator('li').evaluateAll((items) => items.map((li) => li.getAttribute('data-plan-key')));
  expect(keys.sort()).toEqual([`daily:${sharedId}`, 'daily:twin', `mandalart:${sharedId}`].sort());

  // 같은 id의 Daily를 열면 Mandalart 선택은 풀린다 (selectExclusive).
  await libraryOpenButton(page, `daily:${sharedId}`).click();
  await expect(dailyTitleInput(page)).toBeVisible();
  expect((await readStore<MandalartState>(page, MANDALART_STORAGE_KEY))?.state.currentId).toBeNull();
  expect((await readStore<DailyState>(page, DAILY_STORAGE_KEY))?.state.currentDailyId).toBe(sharedId);

  await openLibrary(page);
  await dialog.getByRole('searchbox').fill('공통');
  await expect(libraryOpenButton(page, `daily:${sharedId}`)).toHaveAttribute('aria-current', 'true');
  await expect(libraryOpenButton(page, `mandalart:${sharedId}`)).not.toHaveAttribute('aria-current', 'true');
  await expect(libraryOpenButton(page, 'daily:twin')).not.toHaveAttribute('aria-current', 'true');

  await libraryOpenButton(page, `mandalart:${sharedId}`).click();
  await expect(mandalartTitleInput(page)).toHaveValue('공통 제목');
  expect((await readStore<DailyState>(page, DAILY_STORAGE_KEY))?.state.currentDailyId).toBeNull();
  expect((await readStore<MandalartState>(page, MANDALART_STORAGE_KEY))?.state.currentId).toBe(sharedId);

  // 검색 결과 없음 · 빈 카테고리
  await openLibrary(page);
  await dialog.getByRole('searchbox').fill('존재하지 않는 제목');
  await expect(dialog.getByText('검색 결과 0개')).toBeVisible();
  await expect(dialog.getByText("'존재하지 않는 제목'와 일치하는 플랜이 없습니다")).toBeVisible();
  await dialog.getByRole('searchbox').fill('');
  await dialog.getByRole('button', { name: '주간 플랜 0' }).click();
  await expect(dialog.getByText('이 카테고리에 플랜이 없습니다')).toBeVisible();

  // 합쳐지지 않았는지 저장 데이터로도 확인
  const daily = await readStore<DailyState>(page, DAILY_STORAGE_KEY);
  expect(daily?.state.dailyPlans.filter((p) => p.title === '공통 제목')).toHaveLength(2);
});

test('키보드만으로 열기·검색·선택·삭제·닫기를 할 수 있다', async ({ page }) => {
  await seedDaily(page, dailyPlans(7));
  const dialog = libraryDialog(page);
  const opener = page.getByRole('button', { name: /^전체 플랜 보기/ });
  const search = dialog.getByRole('searchbox', { name: '플랜 제목 검색' });

  const tabTo = async (target: ReturnType<Page['locator']>) => {
    for (let i = 0; i < 20; i++) {
      if (await target.evaluate((el) => el === document.activeElement)) return;
      await page.keyboard.press('Tab');
    }
    throw new Error('target never received focus');
  };

  // 열기: 검색창에 초점
  await opener.focus();
  await page.keyboard.press('Enter');
  await expect(search).toBeFocused();

  // 초점이 모달 밖으로 나가지 않는다.
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);

  // Escape로 닫으면 연 버튼으로 초점이 돌아온다.
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();

  // 검색 → Tab으로 항목 → Enter로 선택
  await page.keyboard.press('Enter');
  await expect(search).toBeFocused();
  await page.keyboard.type('기록 2');
  await expect(dialog.getByText('검색 결과 1개')).toBeVisible();
  await tabTo(libraryOpenButton(page, 'daily:seed-2'));
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(dailyTitleInput(page)).toHaveValue('기록 2');

  // 삭제: 확인 모달의 취소 버튼에 초점 → 삭제 → 보관함 검색창으로 복귀
  await opener.focus();
  await page.keyboard.press('Enter');
  await page.keyboard.type('기록 1');
  await tabTo(dialog.getByRole('button', { name: '기록 1 삭제' }));
  await page.keyboard.press('Enter');
  await expect(page.getByText('플랜을 삭제하시겠습니까?')).toBeVisible();
  await expect(page.getByRole('button', { name: '취소' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: '삭제', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText('플랜을 삭제하시겠습니까?')).toBeHidden();
  await expect(dialog.getByText('검색 결과 0개')).toBeVisible();
  await expect(search).toBeFocused();

  const stored = await readStore<DailyState>(page, DAILY_STORAGE_KEY);
  expect(stored?.state.dailyPlans.map((p) => p.id)).not.toContain('seed-1');
  expect(stored?.state.dailyPlans).toHaveLength(6);

  // 복제: 날짜 선택 모달로 초점이 옮겨지고, 확인하면 복제본이 선택된다.
  await search.fill('기록 3');
  await tabTo(dialog.getByRole('button', { name: '기록 3 복제' }));
  await page.keyboard.press('Enter');
  const confirm = page.getByRole('button', { name: '확인', exact: true });
  await expect(confirm).toBeVisible();
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(false);
  await confirm.click();
  await expect(dialog).toBeHidden();
  await expect(dailyTitleInput(page)).toHaveValue('기록 3 (복사)');
});

test.describe('모바일', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('긴 목록을 전체 화면에서 스크롤해 가장 오래된 플랜을 연다', async ({ page }) => {
    await seedDaily(page, dailyPlans(30));

    await page.locator('button[title="사이드바 열기"]').click();
    await page.getByRole('button', { name: /^전체 플랜 보기/ }).click();
    const dialog = libraryDialog(page);
    await expect(dialog.getByText('30개 플랜')).toBeVisible();

    const box = await dialog.boundingBox();
    expect(box?.width).toBe(390);
    expect(box?.height).toBe(844);
    const list = dialog.getByRole('list', { name: '플랜 목록' });
    const scrollable = await list.evaluate((ul) => {
      const scroller = ul.parentElement!;
      return scroller.scrollHeight > scroller.clientHeight;
    });
    expect(scrollable).toBe(true);

    const oldest = libraryOpenButton(page, 'daily:seed-1');
    await oldest.scrollIntoViewIfNeeded();
    await oldest.tap();
    await expect(dialog).toBeHidden();
    // 선택하면 사이드바도 닫혀 편집 화면이 보인다.
    await expect(page.locator('button[title="사이드바 열기"]')).toBeVisible();
    await expect(dailyTitleInput(page)).toHaveValue('기록 1');
  });
});
