# Codex Guidelines

## Project Overview
Plannet - A planner web application with various templates for goal setting and productivity.

## Tech Stack
- **Framework**: Next.js 16.3.8 (App Router, standalone output) + React 19.2
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
- services 모노레포 사본(`apps/plannet`, [안내](docs/guides/services-monorepo.md))에서도 같다. 그곳 루트 `CLAUDE.md`의 브랜치·PR·한국어 커밋 메시지 형식은 사용자가 커밋·PR을 요청했을 때만 적용하고, 병합도 사용자가 명시적으로 요청할 때만 한다

## Commit Message Convention
- Use English for all commit messages (services 모노레포에서는 그 저장소 규칙대로 한국어)
- Follow conventional commits format:
  - `feat:` new feature
  - `fix:` bug fix
  - `refactor:` code refactoring
  - `style:` styling changes
  - `docs:` documentation
  - `chore:` maintenance tasks

## Work & Verification Efficiency
- Follow [docs/verification-policy.md](docs/verification-policy.md): select checks by changed behavior and risk; passing unchanged checks are not rerun by default.
- Read relevant code/report sections once, keep full logs in files, and report exit/count summaries. Broad regressions and extra builds need a concrete reason. Do not run mutation-testing campaigns by default.
- Keep implementation on Opus as requested. Coordinator reviews deltas and evidence instead of repeating the worker's entire test run. Authentication, unsaved changes, account isolation, and data preservation still require coverage when affected.

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

### Image Export
- 만다라트 PNG는 화면 크기와 무관한 전체 9×9 고정 레이아웃(2080×2192)으로 저장
- 저장된 영역 색상과 시스템 글꼴을 사용하며, 긴 텍스트는 줄바꿈·크기 조정으로 표시
- Canvas 출력 크기·간격·색상은 `apps/web/src/lib/mandalartImage.ts`의 상수로 관리

### Account identity
- 로그인 배지에는 이름과 이메일을 함께 표시한다. 모바일에서도 계정을 구분할 수 있게 이메일을 숨기지 않는다. 이메일은 `text-xs`, 긴 주소는 말줄임과 `title`로 처리한다. 이메일이 표시 이름과 같으면 중복 표시하지 않는다.

### Login Landing (`apps/web/src/components/Landing.tsx`)
- 인증이 켜진 환경의 로그인 전 화면. `slate` 바탕 + `indigo` 강조, 작은 3×3 워드마크 `Plannet`
- 주 CTA는 하나: `slate-900` 버튼, 접근 이름 정확히 `Google 로그인` (테스트 헬퍼가 사용)
- 예시 그림은 코드로 그린 3×3 목표·오늘 목록이며 고정된 가상 데이터만 쓰고 `예시 화면` 캡션을 붙인다 (store 데이터 금지)
- 전역 CSS가 기본 outline을 지우므로 조작 요소에 `focus-visible:ring-2 ring-indigo-500 ring-offset-2`
- 360px에서 가로 넘침 없이 1열, `md` 이상 2열 hero

### Dialogs & Keyboard
- 모달은 `src/hooks/useModalDialog.ts`를 쓴다: `role="dialog"`·`aria-modal`, 이름(`aria-labelledby`/`aria-label`), 열 때 초점 진입, Tab 순환(`tabindex=-1`·inert 제외), Esc 닫기, 닫을 때 연 요소로 초점 복귀. 열린 동안 배경으로 옮겨진 초점은 맨 위 대화상자로 되돌린다(배경 DOM에 inert를 붙이지 않음: React가 관리하는 사이드바·보관함 inert와 충돌). 긴 안내(가이드)는 `initialFocus: 'dialog'`
- 연속 모달(템플릿 → 날짜 → 가이드)의 Esc는 이전 단계로 돌아간다. 위에 뜬 모달이 있는 동안 아래 모달은 `inert`(PlanLibrary `suspended`)
- 모달 안 조작 요소의 초점 링은 `globals.css` base 규칙(indigo)이 기본이며 개별 `focus-visible:ring-*`가 우선한다
- 접힌 사이드바는 `inert`로 Tab·보조기기에서 뺀다. 모바일은 열린 사이드바 안의 `사이드바 닫기` 버튼, 선택·생성·복제 뒤 자동 닫힘
- Enter로 제출·저장하는 입력은 `isImeComposing`(`src/lib/keyboard.ts`)으로 한글 조합 중 키를 먼저 거른다
- 본문 폭: 작업 공간에 고정 최소 폭을 두지 않는다. 넓은 그리드는 자체 가로 스크롤, 헤더 1줄 배치는 `lg` 이상(사이드바 옆 태블릿 본문은 2단)

### Work resumption (`usePlanSelectionUrl`, `WorkspaceHome`)
- 선택은 주소 `?template=<type>&plan=<id>`에만 둔다(제목·이메일·내용·LocalStorage/sessionStorage 금지). 첫 DB 조회·저장 범위 확인 뒤에만 읽고, 이 계정의 불러온 store에 없으면 열지 않고 안내 후 주소를 비운다
- 선택 변경은 한 작업이 끝난 뒤 한 번만 `pushState`(Next가 감싼 history, state는 `null`). 보던 플랜이 삭제돼 바뀌면 `replaceState`
- 빈 작업 공간: `오늘 할 일`(오늘 일간 Daily 열기/명시적 생성, 여럿이면 모두 나열)·`최근 작업`(updatedAt, 같으면 `template:id`). 불러오기·이동만으로 생성 금지
- 가이드는 생성 필수 단계가 아니다. 생성은 템플릿 → 날짜 확인으로 끝나고, 사용법은 헤더 `사용법`·템플릿 선택의 `<템플릿> 사용법 보기`로 연다
- `오늘`은 탭 재표시·창 초점·현지 자정(하루 한 번 타이머)에 다시 읽고, 오늘 플랜 생성은 누르는 순간 날짜·store를 다시 확인한다(폴링 금지)
- 새로 추가한 조작 요소는 `FOCUS_RING`(`lib/constants.ts`)을 쓴다. 대화상자 밖 요소는 globals base ring이 없다
- 사이드바 맨 위 `홈`(aria-current, 터치 44px)은 `clearAllSelections()`로 선택만 비운다(모바일은 사이드바 닫힘). history·location 직접 조작·새로고침·저장 플러시·플랜 생성 금지. 하단 탭·별도 대시보드는 두지 않는다

### Touch · iPhone · 홈 화면 앱 (`globals.css`, `lib/constants.ts`)
- 터치 판정은 `touch:` 변형 하나(`(hover: none)` 또는 `(any-pointer: coarse)`). 폭(`max-sm:`)으로 터치를 가정하지 않는다
- 호버 전용 조작은 `TOUCH_REVEAL`(hover·focus-within·touch), 독립 버튼은 `TOUCH_TARGET`(터치 44px), 밀집 그리드의 작은 버튼은 보이는 크기 유지 + `touch-hit`(히트 영역 44px, relative/absolute 필요). 데스크탑 크기·`FOCUS_RING`은 그대로
- 모바일 만다라트: 개요(버튼) → 아래 상세에서 편집. 글자 있는 하위 목표 칸 탭은 선택·스크롤만(초점 없음). 정중앙 핵심 목표는 늘 그 자리 입력 칸(`Cell keepTextEditable`, 색상은 개요 아래 버튼). 글자 없는 하위 목표 칸도 그 자리 입력이며 초점 동안 입력 칸 유지. 상세에 autoFocus 없음, 스크롤은 명시적 선택 때만(동작 줄이기 존중), 저장은 기존 store 액션만
- 드래그만으로 닿지 않는 이동은 명시적 동작(Block6 `옮기기…`). 드래그 손잡이는 `touch-none`
- `viewport-fit=cover`, 확대 제한 없음. 흐름 안 화면은 body safe-area padding 한 곳, 높이는 `min-h-app`/`h-app`(dvh, 미지원 시 vh). 고정 요소만 각자 inset: 모바일 사이드바 `pt-safe pl-safe pb-keyboard`(md 이상 `p-0`), 모달 바깥층 `overlay-safe` + 패널 `max-h-full overflow-y-auto`, AI 패널 `pt-safe pr-safe pb-keyboard`. 새 모달도 같은 클래스
- 화상 키보드: `useKeyboardInset`(`lib/visualViewport.ts`, 작업 공간 1회)이 `--keyboard-inset` CSS 변수만 갱신. React 상태로 옮기지 않고(입력 재마운트·초안 유실 방지) 폴링 금지
- iPhone 초점 확대 방지는 모바일 폭+터치의 `text-xs/sm` 입력만 16px. `maximum-scale`로 막지 않는다
- 홈 화면 앱: `app/manifest.ts`(id·start_url·scope `/`, standalone), `appleWebApp` 메타, 아이콘은 `lib/brandIcon.tsx`의 코드 3×3(180·192·512). 서비스 워커·오프라인·푸시·백그라운드 동기화 추가 금지. 설치 안내는 사이드바 하단 `홈 화면에 추가`(standalone이면 숨김)

### Editing header & confirms (`Header.tsx`, `ConfirmDialog.tsx`)
- 헤더는 1단 제목(`플랜 제목`), 2단 날짜 칩(달력 아이콘, title `플랜 날짜 변경`)+도구 한 묶음(사용법·AI·만다라트 `⋮`). 칩은 `HEADER_CHIP`(높이 36px 이상·`FOCUS_RING`). `⋮`를 별도 줄로 떨어뜨리지 않는다. 360px 만다라트는 `사용법`을 아이콘만(이름은 `aria-label`)·`Beta` 숨김
- `⋮`는 파일·초기화만 담는 펼침 메뉴(`aria-expanded`). 열면 첫 항목 초점, Esc·Tab 이탈로 닫고 메뉴 버튼으로 복귀. 헤더에 이미 있는 동작(사용법)을 중복하지 않는다. 다음에 확인이 뜨는 항목은 `…`
- 되돌릴 수 없는 동작은 `ConfirmDialog`(`useModalDialog`, 첫 초점 `취소`, Esc·배경 클릭 취소, `data-refresh-hold`). 문구는 실제로 바뀌는 범위·유지되는 것·되돌릴 수 없음·미리 할 수 있는 보관 방법을 짧게 쓴다

### Weeks (`lib/weekUtils.ts`)
- 주차 규칙은 하나: 월~일, 그 달 1일이 든 주가 W1, 한 달은 4·5·6주(`MAX_WEEKS_IN_MONTH`). Monthly 달력·Block6·날짜 선택기·이번 주 포커스가 같은 helper를 쓰고 요일 열도 월요일 시작(`WEEKDAY_LABELS`, 토 파랑·일 빨강)
- Monthly `weeklyFocus`는 5개(이전) 또는 6개. 이전 5개는 읽기·이동·날짜 변경만으로 바꾸지 않고 W6 작성 때만 추가. 그 달에 없는 주의 내용은 지우지 않고 `이 달에 없는 주 · 보관된 내용`으로 보여 준다

### Safe refresh (`PlannerSync.refresh`, `lib/refreshGuard.ts`)
- 탭 재표시·창 초점·`online`에서만 조건부 조회(폴링 금지, 5초 간격 안의 반복은 끝에 1회). 미저장·전송 중·충돌/계정 차단·읽을 수 없는 임시 보관이면 조회·교체하지 않고, 조회 중 수정·입력이 있으면 그 응답을 버린다. 임시 보관 키는 쓰거나 지우지 않는다
- store에 바로 반영하지 않는 입력(새 항목·인라인 수정·AI 입력 등)에는 `data-local-draft`를 붙인다. 내용이 바뀌면 안 되는 확인 창·팝오버는 `aria-modal` 대화상자이거나 `data-refresh-hold`를 붙인다. 열린 동안 보류할 패널은 `holdRefresh()`
- 안내는 관찰한 사실만 말한다(확인 못 함/미룸/반영함). 자동 최신화에 `서버 내용 불러오기`(수정 버림)를 쓰지 않는다

### Code loading (`lib/lazyComponent.tsx`)
- 로그인 전 화면(`page.tsx`·`Landing`·`AuthProvider`)은 플래너 store·편집기를 import하지 않는다. 동기화 인스턴스는 `lib/plannerSyncInstance.ts`로 읽는다
- 편집기·사용법·이모지·AI처럼 처음 열 때만 필요한 큰 코드는 `lazyComponent`로 나눈다. `next/dynamic`(Suspense)은 경계마다 약 300ms 표시 지연이 생겨 쓰지 않는다. 실패해도 자동 새로고침하지 않는다
- 대화상자·패널로 여는 지연 코드는 대기·실패 중에도 `LazyLoadDialog`(닫기·`다시 시도`, `useModalDialog`)를 띄운다. 닫으면 늦게 온 코드가 다시 열지 않는다. 편집기 실패는 같은 자리 `다시 시도`. Turbopack 운영 빌드는 실패한 코드 묶음을 기억해 같은 탭 재시도가 다시 실패할 수 있어, 안내에 `저장이 끝난 뒤 새로고침`을 함께 쓴다
- 저장 비교(`sameData`)는 같은 참조를 건너뛴다. store는 제자리 변경 없이 새 객체로 갱신해야 한다. 측정: `e2e/performance/` ([보고](docs/session-reports/performance.md))

**Note**: 디자인 시스템 관련 결정(색상, 타이포그래피, 간격 등)은 이 섹션에 문서화할 것

## Key Features
- Storage modes: logged-in service saves to PostgreSQL (650ms autosave). Only unacknowledged changes + the exact inflight request are kept in tab memory and one sessionStorage key `plannet-pending@<uuid>` (reload protection, removed after DB ACK; never full/base snapshots). Unload guard while dirty, logout waits for save. Explicit `AUTH_ENABLED=false` local mode auto-saves to LocalStorage. Legacy browser keys are read-only (explicit import / draft file download), never deleted
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
