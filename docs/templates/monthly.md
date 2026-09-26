# 월간 플래너 (Monthly Compass)

## 개요

**컨셉: "Monthly Compass (월간 나침반)"**

Mandalart(목표 설정)와 Block 6(일일 실행)를 연결하는 전략적 월간 대시보드.

| 템플릿 | 역할 |
|--------|------|
| Mandalart | **Why** - 왜 이 목표를 하는가 |
| **Monthly Compass** | **What & When** - 이번 달에 무엇을, 언제까지 |
| Block 6 | **How** - 어떻게 하루를 보낼 것인가 |

---

## UI 레이아웃: 하이브리드 대시보드

```
┌─────────────────────────────────────────────────────────────────┐
│  [< 이전달]     2025년 2월     [다음달 >]                        │
├───────────────────┬─────────────────────────────────────────────┤
│                   │                                             │
│   COMPACT         │   MONTHLY DASHBOARD                         │
│   CALENDAR        │                                             │
│   (30%)           │   (70%)                                     │
│                   │                                             │
│  ┌─────────────┐  │   ┌─────────────────────────────────────┐   │
│  │ 일 월 화 수 │  │   │ 이달의 목표 (3~5개)                  │   │
│  │ 목 금 토    │  │   │ ☐ 목표 1  ────────────── [50%]     │   │
│  │             │  │   │ ☐ 목표 2  ────────────── [30%]     │   │
│  │  1  2  3  4 │  │   │ ☐ 목표 3  ────────────── [0%]      │   │
│  │  5  6  7  8 │  │   └─────────────────────────────────────┘   │
│  │  9 10 11 12 │  │                                             │
│  │ 13 14 15 16 │  │   ┌─────────────────────────────────────┐   │
│  │ 17 18 19 20 │  │   │ 주간 포커스                          │   │
│  │ 21 22 23 24 │  │   │ W1: ____________________________    │   │
│  │ 25 26 27 28 │  │   │ W2: ____________________________    │   │
│  └─────────────┘  │   │ W3: ____________________________    │   │
│                   │   │ W4: ____________________________    │   │
│   (주간 포커스가  │   │ W5: ____________________________    │   │
│    캘린더에 표시) │   └─────────────────────────────────────┘   │
│                   │                                             │
│                   │   ┌─────────────────────────────────────┐   │
│                   │   │ 메모                                 │   │
│                   │   │                                     │   │
│                   │   └─────────────────────────────────────┘   │
│                   │                                             │
└───────────────────┴─────────────────────────────────────────────┘
```

---

## 타입 정의

### 신규 파일: `src/types/monthly.ts`

```typescript
import { PlanCategory } from './mandalart';

export interface MonthlyGoal {
  id: string;
  text: string;
  progress: number; // 0-100
  completed: boolean;
  sourceMandalartId?: string; // 만다라트에서 불러온 경우 실제 원본 플랜 ID
  sourceCellId?: string; // 원본 셀 ID (플랜 ID와 함께 식별)
}

export interface WeeklyFocus {
  weekNumber: number; // 1-5
  text: string;
}

export interface MonthlyData {
  id: string;
  title: string;
  category: PlanCategory;
  template: 'monthly';
  year: number;
  month: number; // 1-12
  goals: MonthlyGoal[]; // 목표 목록 (가져오기 UI는 5개까지 안내)
  weeklyFocus: WeeklyFocus[]; // 5개 (W1-W5)
  memo: string;
  createdAt: string;
  updatedAt: string;
}
```

### 공통 템플릿 타입과 등록

`src/types/mandalart.ts`의 `TemplateType`은 `mandalart`, `block6`, `monthly`, `daily`를 포함한다. 각 템플릿의 표시 이름, 허용 카테고리, store 액션, 가이드·그리드 컴포넌트는 `src/lib/templateRegistry.ts`에서 관리한다. Monthly는 월간 카테고리의 기본 템플릿이다.

---

## Zustand 스토어

### 신규 파일: `src/hooks/useMonthly.ts`

- 비로그인 localStorage key: `'plannet-monthly'`. 로그인 시 계정별 접미사를 붙이며 기존 비로그인 기록은 보존한다. [공통 저장 정책](../web-auth-integration.md)을 따른다.
- persist 미들웨어 + skipHydration. 인증 상태와 저장 범위를 확인한 뒤 복원한다.

**주요 액션:**

```typescript
interface MonthlyStore {
  monthlyPlans: MonthlyData[];
  currentMonthlyId: string | null;
  viewedMonth: { category: PlanCategory; year: number; month: number } | null;

  // CRUD
  createMonthlyPlan: (category: PlanCategory, year: number, month: number) => string;
  selectMonthlyPlan: (id: string | null) => void;
  deleteMonthlyPlan: (id: string) => void;

  // Goals
  addGoal: (text: string) => void;
  updateGoal: (goalId: string, text: string) => void;
  updateGoalProgress: (goalId: string, progress: number) => void;
  toggleGoalCompleted: (goalId: string) => void;
  deleteGoal: (goalId: string) => void;
  importActionPlans: (items: Array<{ text: string; cellId: string; sourceMandalartId?: string }>, legacySourceId?: string) => void;

  // Weekly Focus
  updateWeeklyFocus: (weekNumber: number, text: string) => void;

  // Memo
  updateMemo: (memo: string) => void;

  // Navigation
  navigateMonth: (direction: 'prev' | 'next') => void;
  updatePlanDate: (year?: number, month?: number) => void;
}
```

---

## 컴포넌트

### 신규 디렉토리: `src/components/Monthly/`

| 파일 | 설명 |
|------|------|
| `index.ts` | 배럴 export |
| `MonthlyGrid.tsx` | 메인 레이아웃 (좌: 캘린더, 우: 대시보드) |
| `CompactCalendar.tsx` | 월간 캘린더 (주간 포커스 표시) |
| `MonthlyGoals.tsx` | 이달의 목표 (진행률 바 + 만다라트 불러오기) |
| `WeeklyFocus.tsx` | 주간 포커스 입력 영역 |
| `MemoSection.tsx` | 메모 영역 |
| `MonthlyGuide.tsx` | 사용법 가이드 모달 |
| `ImportGoalsModal.tsx` | 만다라트에서 목표 불러오기 모달 |

### 컴포넌트 상세

**CompactCalendar.tsx:**
- 7열 x 5~6행 그리드 (주 단위로 구성)
- 각 주(row) 옆에 주간 포커스 텍스트 표시
- 오늘 날짜 강조
- WeeklyFocus 컴포넌트에서 입력한 내용이 캘린더에 반영

**MonthlyGoals.tsx:**
- 직접 목표 추가 및 가져오기 (가져오기 UI는 총 5개까지 선택)
- 각 목표: 텍스트 + 진행률 바 (0-100%)
- 드래그로 진행률 조절 또는 직접 입력
- 체크박스로 완료 토글
- "만다라트에서 불러오기" 버튼 → ImportGoalsModal 열기

**ImportGoalsModal.tsx:**
- 만다라트 선택 드롭다운
- 세부 목표별로 그룹화된 실천 계획 표시
- 개별 실천 계획 체크박스로 선택
- 선택된 항목을 평면적인 월간 목표로 추가

**WeeklyFocus.tsx:**
- W1~W5 라벨 + 텍스트 입력
- 해당 주의 핵심 과업/집중 영역 기입

---

## 만다라트 연동

### 유틸리티: `src/lib/mandalartIntegration.ts`

만다라트에서 실천 계획을 추출하는 유틸리티:

```typescript
export interface ActionPlanItem {
  id: string;          // 고유 ID
  text: string;        // 실천 계획 텍스트
  subGoalText: string; // 소속 세부 목표 (표시용)
}

export interface GroupedActionPlans {
  subGoalText: string;
  actionPlans: ActionPlanItem[];
}

// 세부 목표별로 그룹화된 실천 계획 추출
export function extractGroupedActionPlans(mandalartData: MandalartData): GroupedActionPlans[];
```

**동작 방식:**
1. 만다라트 중심 그리드의 셀 0-3, 5-8에서 세부 목표 추출
2. 각 세부 목표에 연결된 외곽 그리드에서 실천 계획 (셀 0-3, 5-8) 추출
3. 세부 목표별로 그룹화하여 반환

---

## UI 통합

### 레지스트리와 사이드바

`src/lib/templateRegistry.ts`의 Monthly 항목은 `MonthlyGrid`, `MonthlyGuide`, store의 생성·선택·날짜 변경 액션을 연결한다. `Sidebar`는 `useAllPlansReactive()`로 네 템플릿의 플랜을 모아 카테고리별로 표시하며, 템플릿별 목록을 직접 합치는 별도 분기를 두지 않는다. `selectExclusive()`는 다른 템플릿의 선택을 해제하고 Monthly/Daily의 빈 기간 조회 상태도 지운다.

### 복원과 화면 선택

`src/app/page.tsx`는 `useAllHydrated()`가 완료될 때까지 로딩 화면을 보여준다. 실제 복원은 `usePlannerStorageHydration()`이 인증과 저장 범위를 확인한 뒤 시작한다.

복원 후에는 `useAllPlansReactive()`의 `currentTemplate`을 우선 표시한다. 선택한 플랜이 없으면 `viewedMonth` 또는 `viewedDay`로 빈 기간의 템플릿을 유지하고, 선택과 조회 기간이 모두 없을 때 플랜 선택 안내를 보여준다. 그리드는 `templateRegistry[displayedTemplate].GridComponent`로 렌더링한다.

### 수정 파일: `src/lib/constants.ts`

```typescript
// 월간 플래너 색상
export const MONTHLY_COLORS = {
  goalProgress: '#3B82F6', // blue-500
  goalComplete: '#22C55E', // green-500
  today: '#EF4444',        // red-500
};
```

---

## 가이드 모달

### MonthlyGuide.tsx 내용

1. **월간 나침반 소개**: 한 달의 방향을 설정하는 도구
2. **이달의 목표**: 3~5개의 핵심 목표 설정
3. **주간 포커스**: 각 주에 집중할 영역 기입 (캘린더에 표시됨)
4. **시작하기** 버튼

---

## 파일 변경 요약

### 신규 파일 (11개)
1. `src/types/monthly.ts`
2. `src/hooks/useMonthly.ts`
3. `src/components/Monthly/index.ts`
4. `src/components/Monthly/MonthlyGrid.tsx`
5. `src/components/Monthly/CompactCalendar.tsx`
6. `src/components/Monthly/MonthlyGoals.tsx`
7. `src/components/Monthly/WeeklyFocus.tsx`
8. `src/components/Monthly/MemoSection.tsx`
9. `src/components/Monthly/MonthlyGuide.tsx`
10. `src/components/Monthly/ImportGoalsModal.tsx`
11. `src/lib/mandalartIntegration.ts`

### 수정 파일 (4개)
1. `src/types/mandalart.ts` - TemplateType 확장
2. `src/components/Sidebar.tsx` - 템플릿 옵션 추가
3. `src/app/page.tsx` - 조건부 렌더링
4. `src/lib/constants.ts` - 색상 상수 추가

---

## 구현 순서

1. 타입 정의 (`monthly.ts`, `mandalart.ts` 수정)
2. Zustand 스토어 (`useMonthly.ts`)
3. 메인 레이아웃 (`MonthlyGrid.tsx`)
4. 캘린더 컴포넌트 (`CompactCalendar.tsx`)
5. 목표/주간 포커스 (`MonthlyGoals.tsx`, `WeeklyFocus.tsx`)
6. UI 통합 (`Sidebar.tsx`, `page.tsx`)
7. 가이드 모달 (`MonthlyGuide.tsx`)
8. 테스트 및 디버깅

---

## 검증 방법

1. **기본 동작**: Sidebar에서 월간 플래너 선택 후 새 플랜 생성
2. **목표 관리**: 추가, 진행률 조절, 완료 토글, 삭제
3. **주간 포커스**: 각 주 텍스트 입력/수정 → 캘린더에 표시 확인
4. **데이터 저장**: 새로고침 후 데이터 유지
5. **월 이동**: 이전/다음 월 네비게이션

---

## 향후 확장 가능성 (MVP 이후)

- ~~Mandalart 목표 연동~~ ✅ 구현 완료
- Block 6 주간 포커스 연동
- 습관 트래커 추가
- 월말 회고 섹션
- 월간 리포트 생성


## 기간 탐색과 날짜 변경

- 그리드의 `이전 달` / `다음 달`은 조회 기간을 이동한다. 원래 플랜의 날짜, 목표, 주간 포커스, 메모, `updatedAt`을 수정하지 않는다.
- 같은 카테고리·연월의 플랜이 있으면 그 플랜을 선택한다. 복사본 등 여러 개가 있으면 `createdAt`이 최신인 플랜을 열고, 시각이 같으면 ID 오름차순으로 결정한다. 다른 복사본은 사이드바·전체 목록에서 각각 열 수 있으며 합치지 않는다.
- 플랜이 없는 달에는 빈 화면과 `이 달의 플랜 만들기` 버튼을 표시한다. 버튼을 눌러야 새 플랜이 생긴다. 기존 제목과 편집 헤더는 표시하지 않는다.
- 빈 조회 기간은 `viewedMonth`로 저장한다. 기존 저장 데이터에 이 필드가 없어도 복원할 수 있다. 조회 상태는 브라우저에만 보관하고 플랜 내용은 활성 저장 모드에 따라 계정별로 복원한다.
- 다른 템플릿·플랜을 선택하거나 새 플랜을 만들면 조회 기간을 해제한다. 목표 입력·가져오기·완료 동기화 등은 선택된 플랜이 있을 때만 동작한다.
- 헤더의 날짜 버튼(`플랜 날짜 변경`)은 **현재 선택한 플랜 자체의 날짜를 재지정**한다. 같은 달의 다른 플랜은 보존하며, 같은 날짜를 다시 확인해도 `updatedAt`을 바꾸지 않는다.

## 여러 만다라트에서 가져오기

- `이번 달 추천`은 모든 만다라트의 대상 셀을 모아 보여주며 항목마다 원본 제목을 표시한다. 선택한 드롭다운 플랜이 비어 있어도 다른 플랜의 추천 항목을 가져올 수 있다.
- 선택·중복 판정은 `원본 플랜 ID + 셀 ID` 조합을 쓴다. 서로 다른 만다라트의 `top-left-0`은 각각 선택할 수 있다. 같은 셀이 추천과 세부 목표 목록에 함께 나와도 한 번만 추가한다.
- 새 목표는 항목별 `sourceMandalartId`와 `sourceCellId`를 저장한다. 같은 출처를 이미 가져왔다면 재선택을 막으며, store도 동일 출처 중복을 거른다.
- 완료 체크는 사용자가 `둘 다 완료`를 선택한 경우에만 저장된 원본 플랜·셀에 반영한다. `월간만 완료`는 원본을 수정하지 않는다. 슬라이더·진행률 버튼은 월간 목표만 변경한다.
- 기존 단일 출처 호출(`importActionPlans(items, sourceId)`)과 저장된 목표는 계속 지원한다. 출처 없는 목표도 독립적으로 사용할 수 있다. 과거 오류로 잘못 저장된 출처를 추측해서 바꾸지는 않는다.

전용 회귀 테스트: `cd apps/web && ../../node_modules/.bin/playwright test --config playwright.period-and-import.config.ts`.
