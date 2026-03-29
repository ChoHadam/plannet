import { test, expect, Page } from '@playwright/test';

// 각 테스트는 격리된 브라우저 컨텍스트 (빈 localStorage)에서 실행

test.describe('템플릿 공통 플로우', () => {
  const templates = [
    { name: '만다라트', placeholder: '나의 만다라트' },
    { name: 'Block 6', placeholder: '나의 Block 6' },
    { name: '월간 플래너', placeholder: '나의 월간 플래너' },
    { name: '투두리스트', placeholder: '나의 투두리스트' },
  ];

  for (const tmpl of templates) {
    test(`${tmpl.name} 플랜 생성`, async ({ page }) => {
      await page.goto('/');
      await expect(page.locator('h1:has-text("Plannet")')).toBeVisible();

      await createPlan(page, tmpl.name);

      // 헤더에 placeholder가 있는 제목 input이 보이는지 확인
      await expect(page.locator(`input[placeholder="${tmpl.placeholder}"]`)).toBeVisible({ timeout: 5000 });
    });
  }

  test('플랜 선택 전환', async ({ page }) => {
    await page.goto('/');

    // 만다라트 생성
    await createPlan(page, '만다라트');
    await expect(page.locator('input[placeholder="나의 만다라트"]')).toBeVisible({ timeout: 3000 });

    // Block 6 생성
    await createPlan(page, 'Block 6');
    await expect(page.locator('input[placeholder="나의 Block 6"]')).toBeVisible({ timeout: 3000 });

    // 사이드바에서 만다라트 항목 클릭하면 전환되는지 확인
    await page.locator('text=만다라트').first().click();
    await expect(page.locator('input[placeholder="나의 만다라트"]')).toBeVisible({ timeout: 3000 });
  });

  test('플랜 삭제', async ({ page }) => {
    await page.goto('/');

    await createPlan(page, '투두리스트');
    await expect(page.locator('input[placeholder="나의 투두리스트"]')).toBeVisible({ timeout: 3000 });

    // 사이드바에서 삭제 버튼 hover로 표시
    const planItem = page.locator('[class*="cursor-pointer"]').filter({ hasText: '투두리스트' }).first();
    await planItem.hover();

    await planItem.locator('button[title="삭제"]').click();

    // 삭제 확인 모달
    await expect(page.locator('text=플랜을 삭제하시겠습니까?')).toBeVisible();
    await page.locator('button:has-text("삭제")').last().click();

    // 플랜이 사라지고 빈 상태
    await expect(page.locator('text=플랜을 선택하거나 새로 만들어주세요')).toBeVisible({ timeout: 3000 });
  });

  test('제목 편집', async ({ page }) => {
    await page.goto('/');

    await createPlan(page, '투두리스트');

    const titleInput = page.locator('input[placeholder="나의 투두리스트"]');
    await expect(titleInput).toBeVisible({ timeout: 3000 });
    await titleInput.fill('오늘의 할 일');

    // 사이드바에 변경된 제목이 반영되는지 확인
    await expect(page.locator('text=오늘의 할 일')).toBeVisible();
  });
});

// 헬퍼: 플랜 생성 (모달 플로우를 단계별로 처리)
async function createPlan(page: Page, templateName: string) {
  // + 버튼 클릭 (모달이 열려있지 않을 때만)
  const createBtn = page.locator('button[title="새로 만들기"]').first();
  await createBtn.click();

  // 템플릿 선택 모달에서 클릭
  await expect(page.locator('text=템플릿을 선택하세요')).toBeVisible({ timeout: 3000 });
  // 버튼 내부의 템플릿 이름 클릭 (가이드 버튼이 아닌 메인 버튼)
  await page.locator(`button:has-text("${templateName}")`).first().click();

  // DatePicker 모달 → 확인
  const dateConfirm = page.locator('button:has-text("확인")');
  await expect(dateConfirm).toBeVisible({ timeout: 3000 });
  await dateConfirm.click();

  // 가이드 모달 → "시작하기" 찾을 때까지 "다음" 클릭
  await dismissGuide(page);
}

async function dismissGuide(page: Page) {
  // 가이드 모달이 열려있으면 "시작하기"가 나올 때까지 "다음" 클릭
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

    // 가이드가 없으면 끝
    break;
  }
}
