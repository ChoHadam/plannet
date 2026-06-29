# Codex Guidelines

## Project Overview
Plannet - A planner web application with various templates for goal setting and productivity.

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **State Management**: Zustand with persist middleware
- **Security**: DOMPurify for XSS prevention
- **Language**: TypeScript

## Git Workflow (CRITICAL)
⛔ **절대로 사용자의 명시적 요청 없이 git commit/push 금지**

- 코드 변경 후 커밋하지 말 것 - 사용자가 "커밋해줘"라고 말할 때까지 대기
- 빌드 성공해도 자동 커밋 금지
- 작업 완료되어도 자동 커밋 금지
- 사용자가 직접 커밋을 요청할 때만 커밋 진행

## Commit Message Convention
- Use English for all commit messages
- Follow conventional commits format:
  - `feat:` new feature
  - `fix:` bug fix
  - `refactor:` code refactoring
  - `style:` styling changes
  - `docs:` documentation
  - `chore:` maintenance tasks

## Code Style
- Use TypeScript strict mode
- Prefer functional components with hooks
- Use `'use client'` directive for client components
- Sanitize all user inputs with DOMPurify

## Code Principles
- **DRY (Don't Repeat Yourself)**: 동일한 값이 여러 곳에서 사용되면 상수로 추출
  - 예: 너비, 색상, 스타일 등 하드코딩된 값이 2곳 이상이면 공유 상수로 관리
  - 한 곳만 수정하면 전체가 반영되도록 설계
- 매직 넘버/문자열 지양 - 의미 있는 상수명 사용

## Project Structure
```
src/
├── app/           # Next.js App Router pages
├── components/    # React components
├── hooks/         # Custom hooks (Zustand stores)
├── lib/           # Utilities and constants
└── types/         # TypeScript type definitions
```

## Templates
- **Mandalart**: 9x9 grid goal-setting tool (Why)
- **Block6**: 6-block daily planner with weekly view (How)
- **Monthly**: Monthly compass with goals and weekly focus (What & When)
- **Daily**: Simple daily todo list (Execution)

Each template has documentation in `docs/templates/`:
- `mandalart.md`
- `block6.md`
- `monthly.md`

**Important**: When modifying template features, update the corresponding documentation file and commit together.

## Template Architecture

### Design Principles (핵심 원칙)

**1. 독립성 (Independence)**
- 각 템플릿은 완전히 독립적으로 동작해야 함
- 다른 템플릿이 없어도 단독으로 사용 가능해야 함
- 특정 템플릿에 "뾰족하게 의존"하는 설계 금지
  - ❌ Daily가 Block6에만 연동되는 설계
  - ✅ Daily가 모든 상위 플랜(Monthly, Block6, Mandalart)과 선택적으로 연동

**2. 유연한 연동 (Flexible Integration)**
- 템플릿 간 연동은 선택적(optional)으로 제공
- Import 방식으로 다른 플랜의 데이터를 가져올 수 있음
- 출처 추적 필드로 원본 정보 보존:
  ```typescript
  sourceType?: 'monthly' | 'block6' | 'mandalart';
  sourceId?: string;
  sourceCellId?: string;
  ```

**3. 카테고리 기반 분류 (Category-based Organization)**
- 모든 플랜은 `PlanCategory` 중 하나에 속함: `annual`, `monthly`, `weekly`, `daily`
- 같은 카테고리 내에서 여러 템플릿 선택 가능
  - 예: 주간 계획으로 Block6 또는 Mandalart 선택 가능
  - 예: 일간 계획으로 Daily(투두리스트) 또는 다른 템플릿 선택 가능

### Store 구조
각 템플릿은 독립된 Zustand store를 가짐:
- `useMandalartStore` - Mandalart 상태 관리
- `useBlock6Store` - Block6 상태 관리
- `useMonthlyStore` - Monthly 상태 관리
- `useDailyStore` - Daily 상태 관리

선택 상태 전환 시 다른 store의 `currentId`를 초기화하여 한 번에 하나의 템플릿만 활성화

## Design System

### Typography
- **부연 설명/도움말 텍스트**: `text-xs` (12px) 사용
  - 예: "할 일을 추가하고 블록으로 드래그하세요"
  - 예: "2월 W3 · 월간 플래너" (출처 정보)
  - 예: "각 주에 집중할 핵심 과업이나 영역을 적어보세요"
- `text-[10px]` 같은 임의 픽셀값 지양 → Tailwind 기본 스케일 사용

### Colors
- Block6 시간대: `amber-50` (오전), `sky-50` (오후), `violet-50` (저녁)
- 이번 주 포커스 카드: `indigo` 계열 (violet과 조화)

**Note**: 디자인 시스템 관련 결정(색상, 타이포그래피, 간격 등)은 이 섹션에 문서화할 것

## Key Features
- Auto-save to LocalStorage
- Color customization per grid section
- Cell synchronization between center and outer grids
- Outer grids activate only when sub-goals are entered

## MCP Tools (CRITICAL)
⚠️ **zen chat 명령어 사용 시 반드시 아래 모델 사용**

```
model: google/gemini-3-pro-preview
```

- zen chat 호출 시 항상 `google/gemini-3-pro-preview` 모델 지정
- 다른 모델로 변경 금지 (사용자가 명시적으로 다른 모델 요청 시 제외)
