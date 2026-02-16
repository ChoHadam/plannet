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
│   • 이벤트 있음   │   │ W5: ____________________________    │   │
│   ○ 오늘          │   └─────────────────────────────────────┘   │
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
  sourceMandalartId?: string; // 만다라트에서 불러온 경우 출처 ID
}

export interface WeeklyFocus {
  weekNumber: number; // 1-5
  text: string;
}

export interface CalendarEvent {
  id: string;
  date: number; // day of month (1-31)
  text: string;
  color?: string;
}

export interface MonthlyData {
  id: string;
  title: string;
  category: PlanCategory;
  template: 'monthly';
  year: number;
  month: number; // 1-12
  goals: MonthlyGoal[]; // 최대 5개
  weeklyFocus: WeeklyFocus[]; // 5개 (W1-W5)
  events: CalendarEvent[];
  memo: string;
  createdAt: string;
  updatedAt: string;
}
```

### 수정 파일: `src/types/mandalart.ts`

```typescript
export type TemplateType = 'mandalart' | 'block6' | 'monthly';

export const TEMPLATE_LABELS: Record<TemplateType, string> = {
  mandalart: '만다라트',
  block6: 'Block 6',
  monthly: '월간 플래너',
};
```

---

## Zustand 스토어

### 신규 파일: `src/hooks/useMonthly.ts`

- localStorage key: `'plannet-monthly'`
- persist 미들웨어 + skipHydration (기존 패턴)

**주요 액션:**

```typescript
interface MonthlyStore {
  monthlyPlans: MonthlyData[];
  currentMonthlyId: string | null;

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
  importActionPlans: (actionPlans: string[], sourceMandalartId?: string) => void;

  // Weekly Focus
  updateWeeklyFocus: (weekNumber: number, text: string) => void;

  // Events
  addEvent: (date: number, text: string) => void;
  updateEvent: (eventId: string, text: string) => void;
  deleteEvent: (eventId: string) => void;

  // Memo
  updateMemo: (memo: string) => void;

  // Navigation
  navigateMonth: (direction: 'prev' | 'next') => void;
}
```

---

## 컴포넌트

### 신규 디렉토리: `src/components/Monthly/`

| 파일 | 설명 |
|------|------|
| `index.ts` | 배럴 export |
| `MonthlyGrid.tsx` | 메인 레이아웃 (좌: 캘린더, 우: 대시보드) |
| `CompactCalendar.tsx` | 월간 캘린더 (이벤트 표시) |
| `MonthlyGoals.tsx` | 이달의 목표 (진행률 바 + 만다라트 불러오기) |
| `WeeklyFocus.tsx` | 주간 포커스 입력 영역 |
| `MemoSection.tsx` | 메모 영역 |
| `MonthlyGuide.tsx` | 사용법 가이드 모달 |
| `ImportGoalsModal.tsx` | 만다라트에서 목표 불러오기 모달 |

### 컴포넌트 상세

**CompactCalendar.tsx:**
- 7열 x 5~6행 그리드
- 이벤트 있는 날짜에 색상 점 표시
- 오늘 날짜 강조
- 날짜 클릭 시 이벤트 추가/편집

**MonthlyGoals.tsx:**
- 최대 5개 목표
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

### 수정 파일: `src/components/Sidebar.tsx`

```typescript
// templates 배열에 추가
{ type: 'monthly', description: '월간 목표와 주간 계획', hasGuide: true }

// useMonthlyStore import 및 플랜 표시
const monthlyPlans = useMonthlyStore((state) => state.monthlyPlans);

// getPlansByCategory에 monthly 추가
const getPlansByCategory = (category: PlanCategory): PlanData[] => {
  const mandalartPlans = mandalarts.filter((m) => m.category === category);
  const block6Plans = block6PlansData.filter((p) => p.category === category);
  const monthlyPlansList = monthlyPlans.filter((p) => p.category === category);
  return [...mandalartPlans, ...block6Plans, ...monthlyPlansList];
};
```

### 수정 파일: `src/app/page.tsx`

```typescript
import { MonthlyGrid } from '@/components/Monthly';
import { useMonthlyStore, useMonthlyHydration } from '@/hooks/useMonthly';

// hydration
useMonthlyHydration();

// 현재 템플릿 결정
const currentMonthlyId = useMonthlyStore((state) => state.currentMonthlyId);
const currentTemplate = currentMandalartId ? 'mandalart'
  : currentBlock6Id ? 'block6'
  : currentMonthlyId ? 'monthly'
  : null;

// 렌더링
{currentTemplate === 'monthly' && <MonthlyGrid />}
```

### 수정 파일: `src/lib/constants.ts`

```typescript
// 월간 플래너 색상
export const MONTHLY_COLORS = {
  goalProgress: '#3B82F6', // blue-500
  goalComplete: '#22C55E', // green-500
  eventDot: '#F59E0B',     // amber-500
  today: '#EF4444',        // red-500
};
```

---

## 가이드 모달

### MonthlyGuide.tsx 내용

1. **월간 나침반 소개**: 한 달의 방향을 설정하는 도구
2. **이달의 목표**: 3~5개의 핵심 목표 설정
3. **주간 포커스**: 각 주에 집중할 영역 기입
4. **캘린더**: 중요 이벤트/마감일 표시
5. **시작하기** 버튼

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
3. **주간 포커스**: 각 주 텍스트 입력/수정
4. **캘린더**: 이벤트 추가, 날짜별 표시 확인
5. **데이터 저장**: 새로고침 후 데이터 유지
6. **월 이동**: 이전/다음 월 네비게이션

---

## 향후 확장 가능성 (MVP 이후)

- ~~Mandalart 목표 연동~~ ✅ 구현 완료
- Block 6 주간 포커스 연동
- 습관 트래커 추가
- 월말 회고 섹션
- 월간 리포트 생성
