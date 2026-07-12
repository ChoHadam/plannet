import { test, expect, Page } from '@playwright/test';

// 각 테스트는 격리된 브라우저 컨텍스트 (빈 localStorage)에서 실행
// 카테고리 순서: 연간(0), 월간(1), 주간(2), 일간(3)

test.describe('템플릿 공통 플로우', () => {
  test.beforeEach(async ({ page }) => {
    // 템플릿 테스트 데이터가 실제 로컬 백업 목록에 섞이지 않도록 자동 백업 비활성화
    await page.addInitScript(() => {
      localStorage.setItem('plannet-auto-backup-enabled', 'false');
    });
  });

  const templates = [
    { name: '만다라트', placeholder: '나의 만다라트', categoryIndex: 0 },   // 연간
    { name: 'Block 6', placeholder: '나의 Block 6', categoryIndex: 2 },     // 주간
    { name: '월간 플래너', placeholder: '나의 월간 플래너', categoryIndex: 1 }, // 월간
    { name: '투두리스트', placeholder: '나의 투두리스트', categoryIndex: 3 },   // 일간
  ];

  for (const tmpl of templates) {
    test(`${tmpl.name} 플랜 생성`, async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('h1:has-text("Plannet")')).toBeVisible();

      await createPlan(page, tmpl.name, tmpl.categoryIndex);

      await expect(page.locator(`input[placeholder="${tmpl.placeholder}"]`)).toBeVisible({ timeout: 5000 });
    });
  }

  test('플랜 선택 전환', async ({ page }) => {
    await page.goto('/');

    // 만다라트 (연간)
    await createPlan(page, '만다라트', 0);
    await expect(page.locator('input[placeholder="나의 만다라트"]')).toBeVisible({ timeout: 3000 });

    // 투두리스트 (일간)
    await createPlan(page, '투두리스트', 3);
    await expect(page.locator('input[placeholder="나의 투두리스트"]')).toBeVisible({ timeout: 3000 });

    // 사이드바에서 만다라트 항목 클릭하면 전환
    await page.locator('text=만다라트').first().click();
    await expect(page.locator('input[placeholder="나의 만다라트"]')).toBeVisible({ timeout: 3000 });
  });

  test('플랜 삭제', async ({ page }) => {
    await page.goto('/');

    await createPlan(page, '투두리스트', 3);
    await expect(page.locator('input[placeholder="나의 투두리스트"]')).toBeVisible({ timeout: 3000 });

    const planItem = page.locator('[class*="cursor-pointer"]').filter({ hasText: '투두리스트' }).first();
    await planItem.hover();

    // 점3개 메뉴 클릭
    await planItem.locator('button[title="메뉴"]').click();
    // 드롭다운에서 삭제 클릭
    await page.locator('text=삭제').first().click();

    await expect(page.locator('text=플랜을 삭제하시겠습니까?')).toBeVisible();
    await page.locator('button:has-text("삭제")').last().click();

    await expect(page.locator('text=플랜을 선택하거나 새로 만들어주세요')).toBeVisible({ timeout: 3000 });
  });

  test('제목 편집', async ({ page }) => {
    await page.goto('/');

    await createPlan(page, '투두리스트', 3);

    const titleInput = page.locator('input[placeholder="나의 투두리스트"]');
    await expect(titleInput).toBeVisible({ timeout: 3000 });
    await titleInput.fill('오늘의 할 일');

    await expect(page.locator('text=오늘의 할 일')).toBeVisible();
  });
});

// 헬퍼: 플랜 생성 (카테고리 인덱스로 적합한 + 버튼 클릭)
async function createPlan(page: Page, templateName: string, categoryIndex: number) {
  // 해당 카테고리의 + 버튼 클릭
  const createBtn = page.locator('button[title="새로 만들기"]').nth(categoryIndex);
  await createBtn.click();

  // 템플릿 선택 모달에서 클릭
  await expect(page.locator('text=템플릿을 선택하세요')).toBeVisible({ timeout: 3000 });
  await page.locator(`button:has-text("${templateName}")`).first().click();

  // DatePicker 모달 → 확인
  const dateConfirm = page.locator('button:has-text("확인")');
  await expect(dateConfirm).toBeVisible({ timeout: 3000 });
  await dateConfirm.click();

  // 가이드 모달 → "시작하기" 찾을 때까지 "다음" 클릭
  await dismissGuide(page);
}

async function dismissGuide(page: Page) {
  for (let i = 0; i < 10; i++) {
    const startBtn = page.locator('button:has-text("시작하기")');
    if (await startBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await startBtn.click();
      return;
    }

    const nextBtn = page.locator('button:has-text("다음")');
    if (await nextBtn.isVisible({ timeout: 500 }).catch(() => false)) {
      await nextBtn.click();
      continue;
    }

    break;
  }
}
