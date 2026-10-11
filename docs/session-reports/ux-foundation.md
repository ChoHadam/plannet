# UI 기본 조작 첫 묶음 (태블릿·키보드·한글 입력)

2026-09-30 · 기준 `3e08caa` + 기존 미커밋 변경. [UI·UX 검토](../ui-ux-review.md) 1순위 중 첫 묶음. **Claude Opus 구현·검증 및 Codex 총괄 최종 검토 완료.** 후속 코드 보완 1회와 Block6 문서 보완을 반영했다. 커밋·push 없음. 로드맵 전체 완료가 아니다.

## 동작 변화

| 영역 | 이전 | 이후 |
|---|---|---|
| 태블릿 폭 | `PlannerWorkspace` `md:min-w-[1024px]` → 768/820px에서 페이지 넘침 256/204px, 로그아웃 등 화면 밖 | 최소 폭 제거. 헤더 1줄 배치를 `lg` 이상으로(사이드바 옆 태블릿 본문은 2단). 5개 폭 × Daily·만다라트·Block6·Monthly에서 페이지 넘침 0. Block6 그리드는 내부 가로 스크롤 유지 |
| 생성 모달 | 템플릿 선택: dialog 역할·Esc·Tab 가두기 없음. 날짜 선택: 첫 버튼 초점만 | 공통 `useModalDialog`: dialog 역할·이름·`aria-modal`, 초점 진입, Tab/Shift+Tab 순환(`tabindex=-1`·inert 제외), Esc 닫기, 연 요소로 초점 복귀, 열린 동안 배경으로 옮겨진 초점을 맨 위 대화상자로 되돌림. 템플릿 선택·날짜 선택·가이드 4종 적용 |
| 연속·중첩 모달 | — | 템플릿 → 날짜 → 가이드는 각 단계 Esc가 이전 단계로. 보관함 위 복제 날짜 선택의 Esc는 위 모달만 닫고 보관함의 복제 버튼으로 초점 복귀(기존 `suspended`/`inert` 유지) |
| 모달 초점 표시 | 전역 CSS가 outline 제거 → 모달 안 초점 안 보임 | `globals.css` base 규칙: dialog 안 조작 요소 indigo 초점 링. 개별 ring 클래스가 우선 |
| 사이드바 | 접혀도 Tab으로 항목 도달. 모바일 닫기 버튼 없음(배경만). 생성 후 사이드바가 편집기를 덮음. 접힌 상태에서 선택하면 오히려 열림 | 접히면 `inert`. 모바일 `사이드바 닫기`(36px 이상, indigo 링). 열면 닫기 버튼, 닫으면 열기 버튼으로 초점. 모바일 생성·복제·선택 완료 뒤 닫힘. 데스크탑 동작 유지 |
| 한글 조합 Enter | Daily 할 일 수정 input과 AI 입력에 가드 없음 | `isImeComposing`(isComposing 또는 keyCode 229)으로 조합 중 Enter/Esc 무시. 일반 Enter·Shift+Enter 의미 유지 |

## 변경 파일 (이번 작업분만)

- 2회차에 바뀐 파일: `useModalDialog.ts`(focusin 가드·스택·`getTabbables`), `ux-foundation.spec.ts`(Monthly·배경 격리·취소·선택자·모바일 생성 4종), 문서 4개(이 보고서·`ui-ux-review.md`·`roadmap-status.md`·`AGENTS.md`). 앱의 다른 파일은 바꾸지 않았다
- 새 파일: `apps/web/src/hooks/useModalDialog.ts`, `apps/web/src/lib/keyboard.ts`, `apps/web/e2e/ux-foundation/ux-foundation.spec.ts`, `apps/web/playwright.ux-foundation.config.ts`
- UI: `Sidebar.tsx`, `DatePicker.tsx`, `PlanLibrary/PlanLibrary.tsx`(Tab 순환만 공통 함수), `PlannerWorkspace.tsx`, `Header.tsx`, `MandalartGuide.tsx`, `Block6/Block6Guide.tsx`, `Monthly/MonthlyGuide.tsx`, `Daily/DailyGuide.tsx`, `Daily/DailyGrid.tsx`, `AIChatSidebar.tsx`, `app/globals.css`, `lib/constants.ts`(모바일 경계 상수)
- 테스트: `e2e/ai-response-safety/chat.spec.ts`(모바일에서 접힌 사이드바에 직접 초점을 주던 경로 → 열기 버튼 후 선택), `e2e/period-and-import/start-web.mjs`(포트를 `ISOLATED_WEB_PORT`로 받음, 기본 3640 유지)
- 문서: `AGENTS.md` Design System `Dialogs & Keyboard`, `docs/templates/daily.md`·`mandalart.md`·`monthly.md`·`block6.md`(3회차: 생성·가이드 키보드·모바일 닫기 안내), `docs/ui-ux-review.md`, `docs/roadmap-status.md`

API·infra·동기화/저장/인증 계약·의존성은 바꾸지 않았다.

## 총괄 후속 검토 반영 (2회차)

| 요청 | 판단·조치 | 근거 |
|---|---|---|
| 1. Monthly 반응형, 모바일 생성 4종 | 반응형 테스트에 Monthly 가상 플랜 추가: 5개 폭에서 페이지·`main` 넘침 0, 이전/다음 달·목표 입력·주간 포커스·메모·로그아웃이 화면 안, 달력 1일·31일 칸이 화면 안이고 폭 24px 이상. 모바일 생성 완료 검증을 투두리스트·만다라트 → +Block 6·월간 플래너 | 코드 수정 없이 통과. `ux-screens/monthly-*.png` |
| 2. 배경 조작 격리 | **실제 결함 확인.** 수정 전 코드로 새 테스트를 돌려, 템플릿·날짜 모달이 열린 동안 헤더 제목·사이드바 플랜·로그아웃에 `focus()`하면 초점이 모달 밖으로 빠짐(2 failed, `followup-repro-before-fix.log`). `useModalDialog`에 document `focusin` 가드 + 열린 대화상자 스택 추가: 맨 위 대화상자만 반응하고, 마지막으로 초점이 있던 내부 요소(없으면 첫 조작 요소)로 되돌림. 닫을 때 리스너·스택 정리. 배경 DOM에 `inert`를 붙이는 방식은 쓰지 않음: 모바일 생성 완료 때 React가 사이드바에 `inert`를 켜는 같은 커밋 뒤 정리 코드가 그것을 지우게 되는 충돌이 있음. 포인터는 각 모달의 배경막, 보조기기 가상 커서는 `aria-modal`이 담당 | 수정 후 통과: 초점 복귀, 이어서 친 글자가 배경 제목을 바꾸지 않음, Tab·Esc 정상, 닫은 뒤 배경 초점 정상. 보관함 위 날짜 선택에서도 확인 후 보관함 검색창 초점 정상 |
| 3. focusable 선택자 | 선택자는 `[tabindex="-1"]`를 일반 요소에서만 뺐고 `button[tabindex=-1]`·inert 안 요소는 통과시켰음. `getTabbables()`로 `tabIndex < 0`·`[inert]` 조상·화면에 없는 요소를 걸러 Tab 순환과 첫 초점에 공통 사용. **현재 앱 모달에는 해당 요소가 없어** 실제 흐름의 결함은 아님 → 템플릿 모달에 합성 요소를 넣어 건너뜀만 확인 | 통과 |
| 4. 보관함 복제·삭제, 생성 취소 | 삭제 키보드 흐름은 기존 `plan-library/library.spec.ts`의 키보드 테스트가 이미 확인(확인 모달의 취소 초점 → Tab → 삭제 → 보관함 검색창 복귀). 복제는 기존 테스트와 새 스위트가 함께 확인. 새 테스트: 템플릿·날짜·가이드 각 단계 Esc 취소 뒤 1.5초(자동 저장 650ms 초과) 대기해도 저장 요청 0·모의 DB 기록 수 불변·보관함 개수 불변. 이어서 키보드만(Enter·Tab)으로 생성하면 기록 +1 | 통과 |
| 5. 문서 | 이 보고서·`ui-ux-review.md`·`roadmap-status.md`·`AGENTS.md`(배경 초점·선택자 규칙) 갱신 | — |

## 실행한 검증

모두 격리 포트·임시 빌드, 가상 계정·가상 플랜. 인증·DB·AI는 브라우저 가로채기 또는 기존 모의 서버. 실제 DB·Google·유료 AI·사용자 브라우저 저장소에 접근하지 않았다.

**최종(2회차, 후속 수정 이후 소스 기준).** 아래 1회차 표는 이력이며, 2회차 코드 변경 뒤 모두 다시 실행했다.

| 명령 (`apps/web`) | 최종 결과 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` / `npx eslint .` | 통과 / 통과 |
| `npx playwright test -c playwright.ux-foundation.config.ts` | **19 passed** (반응형 5, 생성 모달 5, 사이드바 데스크탑 1·모바일 5, 한글 조합 3). 2회차 중간 실행: 반응형 5건 실패 → 테스트가 Monthly 주간 포커스 입력칸을 찾았으나 내용이 있으면 텍스트로 표시됨. 표시 텍스트 확인으로 고친 뒤 통과(앱 문제 아님) |
| `npx playwright test -c playwright.plan-library.config.ts` | **15 passed** |
| `npx playwright test -c playwright.period-and-import.config.ts` | **9 passed** |
| `npx playwright test -c playwright.config.ts` | **74 passed** (local 10 + auth 64) |
| `AIRS_WORK_DIR=/private/tmp/plannet-opus-20260930/airs-work npx playwright test -c playwright.ai-response-safety.config.ts` | **34 passed** (현재 소스를 새로 복사·빌드) |

로그: `/private/tmp/plannet-opus-20260930/final2-*.log`. 포트는 `nc -z` 바인드 확인만 사용(`lsof` 미사용). 테스트 서버는 Playwright가 종료했고 위 포트가 모두 비어 있음을 확인했다.

### 1회차 이력

| 명령 (`apps/web`) | 결과 |
|---|---|
| `npx tsc --noEmit -p tsconfig.json` | 통과 |
| `npx eslint .` | 통과 (0 오류) |
| `npx playwright test -c playwright.ux-foundation.config.ts` (3650, 새 스위트) | **14 passed** (최종 실행). 1회차 11/14: 768·820px 만다라트 헤더 `메뉴`·`AI` 버튼이 화면 밖 → Header 수정, 모바일 닫기 버튼을 슬라이드 전환 중 측정 → 전환 종료 대기로 보정 |
| `npx playwright test -c playwright.plan-library.config.ts` (3530~3533) | **15 passed** (library 4 + templates 10 + account 1) |
| `npx playwright test -c playwright.period-and-import.config.ts` (3640) | **9 passed** |
| `npx playwright test -c playwright.config.ts` (3310~3315, local 10 + auth 64) | **74 passed** |
| `npx playwright test -c playwright.ai-response-safety.config.ts` (3520) | 1차: 하네스 공용 임시 `node_modules` 복제본 손상(`next/dist/server/require-hook` 없음)으로 빌드 전 실패. 삭제 대신 `AIRS_WORK_DIR=/private/tmp/plannet-opus-20260930/airs-work`로 새 복제 → **31 passed / 3 failed**(모바일 3건). 원인: 로그아웃 배지가 DB 조회 중 화면에도 보여 사이드바 마운트 전에 접힘 여부를 판단한 테스트 경합(단독 재실행 3/3 통과). 헬퍼가 `aside` 부착을 기다리게 고친 뒤 전체 **34 passed** (`AIRS_SKIP_SYNC=1 AIRS_SKIP_BUILD=1`, 같은 앱 소스 빌드 재사용) |

새 스위트가 확인하는 것:

- 360·768·820·1024·1440px: Daily·만다라트·Block6·Monthly 페이지 넘침 ≤ 0, Monthly 주요 입력·달력 칸 크기, `main` 넘침 0(Daily), 내부 스크롤 영역 밖 조작 요소가 화면 밖에 없음, `body`/`html` overflow-x가 hidden 아님, 로그아웃·할 일 입력·이메일이 화면 안, 이메일 전체 텍스트·`title`·폭 100px 이상
- 배경 격리: 모달이 열린 동안 배경 제목·사이드바·로그아웃에 준 초점이 모달로 복귀, 배경 입력 불변, 닫은 뒤 해제
- 생성 취소 3단계 모두 저장 요청 0·기록 불변, 이후 키보드만으로 생성 시 기록 +1
- Tab 순환이 `tabindex=-1`·inert 요소를 건너뜀(합성 요소)
- 템플릿 → 날짜 → 가이드: dialog 이름, `aria-modal`, 초점 진입, Tab/Shift+Tab을 요소 수+2회 눌러도 밖으로 안 나감, Esc 단계 복귀, 완료 뒤 + 버튼 초점 복귀
- 보관함 위 복제 날짜 선택: Esc가 위 모달만 닫고 복제 버튼 초점 복원
- 데스크탑 접기: `inert`, Tab 25회 동안 사이드바 밖, 펼친 뒤 선택해도 사이드바 유지
- 모바일 390px: 닫힌 사이드바 Tab 차단, 열기 → 닫기 버튼 초점·크기, Enter로 닫으면 열기 버튼 초점. 투두리스트·만다라트·Block 6·월간 플래너 생성 완료 뒤 사이드바 화면 밖·편집기 클릭 가능
- 한글 조합: Daily 수정(Enter/Esc × isComposing/keyCode 229) 유지 후 일반 Enter 저장, 신규 입력 가드 회귀, AI 입력 조합 Enter·Shift+Enter 미전송 → 일반 Enter 1회만 가상 `/api/chat`

화면: `/private/tmp/plannet-opus-20260930/ux-screens/`의 `daily|mandalart|block6|monthly-{360,768,820,1024,1440}.png` (가상 데이터).

## 남은 위험·미확인

- **실제 입력기:** 한글 조합은 Chromium 합성 keydown(isComposing, keyCode 229 각각)으로만 확인. 실제 macOS/Windows 한글 입력기·Safari·iPadOS 미확인
- **배경 격리 범위:** 초점 되돌림(focusin)·배경막·`aria-modal` 조합. 배경 DOM `inert`는 쓰지 않아, `aria-modal`을 무시하는 오래된 보조기기의 가상 커서는 배경을 읽을 수 있다. 실제 스크린 리더 미확인
- **Monthly W6:** 2026년 8월처럼 6주인 달의 W6 포커스는 `미설정`으로 보인다(3순위 과제, 이번 범위 밖)
- **공통 모달 미적용(후속):** 사이드바 삭제 확인(기존 `autoFocus` 유지), Header 초기화·가져오기 확인, 백업 복원, Daily 주간 가져오기, Monthly 목표 불러오기, 셀 일정·색상·이모지·반복 할 일 팝오버, 사이드바 행 메뉴, AI 채팅 패널
- **모바일 열린 사이드바:** 배경 클릭은 막히지만 뒤 본문으로 Tab 이동은 가능(사이드바를 모달로 만들지 않음)
- **태블릿 헤더:** 768~1023px는 2단 헤더. 만다라트는 `⋮` 메뉴가 별도 줄(기존 모바일 배치와 같음). 총괄이 768px 화면과 버튼 위치 검증을 확인했으며, 추가적인 도구 배치 정리는 후속 개선 대상
- 가이드 초기 초점은 대화상자 자체(긴 안내 읽기 우선). 첫 조작까지 Tab 1회 필요
- `storage-sync`, `server-storage`(실제 Spring+PostgreSQL), `mandalart-io`, 배포 검증은 이번 변경과 무관해 실행하지 않음. 이번 라운드에서 기존(사전) 실패는 발견하지 못함. 1회차 ai-response-safety의 임시 복제본 손상은 하네스 환경 문제였다

## 총괄 최종 검토

2026-09-30 · **첫 묶음 완료 판정.** 구현·수정·테스트는 Opus가 수행했고, 총괄은 변경분·테스트 내용·로그·화면·검증 소스 일치를 대조했다.

| 검토 항목 | 확인한 근거·판정 |
|---|---|
| 태블릿·모바일 | 5개 폭 × 4개 템플릿의 검사 내용과 결과 확인. Daily·Monthly 360/768px, 만다라트 768px 화면을 직접 검토. 주요 조작과 계정 구분이 유지됨 |
| 모달·사이드바 | 배경 초점 결함의 수정 전 실패와 수정 후 통과 확인. 연속 생성·중첩 날짜 선택·보관함 삭제·생성 취소·4개 템플릿 모바일 생성 검증 확인. React가 관리하는 `inert`를 유지하며 `focusin`으로 초점을 돌리는 현재 범위를 수용 |
| 입력·시각 규칙 | IME 두 신호를 각각 확인하는 검사와 일반 Enter/Shift+Enter 회귀 확인. 공통 초점 링과 태블릿 헤더 기준은 AGENTS에 기록된 범위로 수용 |
| 테스트 신뢰성 | 최종 UI 19·보관함 15·날짜/가져오기 9·기본 74·AI 34의 통과 로그 확인. 테스트용 모바일 선택 경로는 실제로 사이드바를 연 뒤 선택하도록 수정됐으며 검증을 삭제하지 않음 |
| 현재 소스·기존 작업 보존 | 최종 UX 격리 빌드의 Web 소스 **97개**와 현재 소스의 SHA-256 전부 일치. 작업 전 API/infra diff 및 인증·동기화·임시 저장 주요 Web 파일 9개 보존 확인. HEAD는 `3e08caa` 유지 |

위 미확인 환경과 미적용 모달은 완료 범위에 포함하지 않는다. 이번 판정은 로컬 소스 검토이며 실제 실행 중인 서비스 배포나 홈서버 검증을 뜻하지 않는다.
