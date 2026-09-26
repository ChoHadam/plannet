[plan-library] 최근 5개 밖의 플랜을 전체 목록·제목 검색으로 다시 열 수 있게 구현했고, 자동 검증(15/15)과 데스크톱·모바일·키보드 브라우저 확인을 마쳤다. 남은 조건은 커밋과 총괄 세션의 통합 회귀다.

상태: 완료 (2026-09-26 21:15 KST, 커밋·push 안 함)

시작 시 작업 트리: `031e124` + 다른 세션의 미커밋 API·배포·문서 변경. 작업 중에 세션 A(`.dockerignore`, `apps/api/Dockerfile`, `apps/web/next.config.ts`, `scripts/`)와 세션 B(`AIChatSidebar.tsx`, `aiResponseSafety.ts`, `e2e/ai-response-safety/`)의 변경도 생겼다. 이 세션은 그 파일들을 수정하지 않았다.

## 변경 (모두 원본 작업 트리에 반영, 미커밋)

| 파일 | 핵심 동작 |
|---|---|
| `apps/web/src/lib/planLibrary.ts` (새 파일) | `planKey`(`template:id`), `RECENT_PLAN_LIMIT=5`, 정렬(만든·수정·제목 순, 같은 값이면 key로 고정), 제목 검색(NFC·대소문자·공백 정규화, `제목 없음` 포함). 원본은 바꾸지 않고 새 배열을 돌려준다 |
| `apps/web/src/components/PlanLibrary/PlanLibrary.tsx`, `index.ts` (새 파일) | 전체 플랜 모달: 검색, 카테고리 필터(개수 포함), 정렬, 결과 수, 세 가지 빈 상태, 열기·복제·삭제. 데스크톱은 모달, 모바일은 전체 화면. 초점 가두기, Esc, 초점 복원. 위에 다른 모달이 뜨면 `inert` |
| `apps/web/src/components/Sidebar.tsx` | 상단 `전체 플랜 · 검색` 버튼, 6개 이상인 카테고리에 `더보기 · 전체 N개`. 최근 목록 key와 메뉴 상태를 `template:id`로 변경. 행 안에 선택 버튼을 두어 키보드로 선택할 수 있다(행 클릭과 `cursor-pointer`는 유지). 메뉴 버튼은 초점을 받으면 보인다. 보관함 상태는 저장 범위에 묶고, Section은 범위별 key로 다시 마운트한다. 날짜 선택 모달은 열릴 때 첫 버튼, 삭제 확인은 `취소`에 초점을 준다. 선택은 기존 `selectExclusive`, 복제·삭제·생성은 기존 핸들러를 그대로 쓴다 |
| `apps/web/e2e/plan-library/**`, `apps/web/playwright.plan-library.config.ts` (새 파일) | 전용 스택(포트 3530~3533, 빌드 `.next/plan-library-e2e`, 결과 `test-results/plan-library`, 백업 임시 경로 `.next/plan-library-e2e-backup`). 공용 `mock-auth-api.mjs`·`edge-proxy.mjs`는 읽기 전용으로 import만 한다. 전용 tsconfig로 공용 `tsconfig.e2e.json`을 건드리지 않는다 |
| `docs/plan-library.md` (새 파일) | UI·규칙·접근성·코드 위치 |

템플릿·카테고리·날짜 모델, store, `templateRegistry.ts`, `useAllPlans.ts`, AuthProvider, 저장 방식은 수정하지 않았다.

## 검증

| 항목 | 명령·조건 | 결과 |
|---|---|---|
| 전용 E2E | `cd apps/web && npx playwright test -c playwright.plan-library.config.ts` (새 빌드, 21:15) | **15개 실행 · 15 통과 · 0 실패 · 0 건너뜀** |
| └ plan-library 신규 | `library.spec.ts` 4개(local), `account.spec.ts` 1개(auth, 모의 Spring) | 5 통과 |
| └ 기존 회귀 | 기존 `e2e/templates.spec.ts` 10개를 전용 스택에서 재실행(생성·선택 전환·삭제·제목 편집·백업) | 10 통과 |
| lint | `npx eslint .` (apps/web) | 0 error, 0 warning |
| 타입 | `npx tsc --noEmit -p e2e/plan-library/tsconfig.json` (격리된 생성 타입) | 통과 |
| 타입(루트) | `npx tsc --noEmit` | 실패: `.next/dev/types/validator.ts`의 삭제된 `api/auth/[...nextauth]`, `api/auth/me` 참조. 이미 알려진 과거 Auth.js 생성 타입 문제이며 이번 변경과 무관하다 |
| build | E2E 스택의 `next build` (`NEXT_DIST_DIR=.next/plan-library-e2e`) | 성공 |

E2E가 다루는 경우: 6개 이상(8·7·30개)·최근 5개와 더보기, 가장 오래된 플랜 선택, 조회·정렬·검색 전후 LocalStorage 원문 동일, 선택 뒤 플랜 배열 deep-equal(`updatedAt` 포함), 같은 제목·같은 날짜 Daily 2개와 **같은 id** Mandalart의 구별, `selectExclusive`로 반대쪽 선택 해제, 검색 결과 없음·빈 카테고리, 키보드(열기·초점 가두기·Esc 복원·검색·Tab 선택·삭제 확인·복제 날짜 선택), 모바일 390×844 터치(전체 화면·스크롤·선택 뒤 사이드바 닫힘), 계정 전환(Alice 7개 → Bob 0개·검색 0개·메뉴 없음 → Alice 7개 복원, Bob 범위에 Alice 데이터 없음).

## 브라우저 직접 확인

- **데스크톱 (Claude in Chrome, 1496×693):** 포트 3534의 인증 off standalone(같은 빌드). 테스트 데이터 13개를 심었다. 보관함을 열어 `주간 회고`를 검색하니 서로 다른 카테고리의 같은 제목 2개가 따로 나왔다. 키보드만으로 검색 → Tab 이동(초점 링 표시) → Enter로 가장 오래된 `브라우저 기록 1`을 열었고, 초점이 연 버튼으로 돌아왔다.
- **모바일:** Chrome 확장에서 창 크기 변경이 적용되지 않았다(`outerWidth` 0). iframe 방식은 세션 A의 새 보안 헤더(frame 차단) 때문에 로드되지 않았다. 그래서 **Playwright Chromium iPhone 13 에뮬레이션(390×844, 터치)**으로 같은 서버를 열고 스크린샷을 직접 확인했다. 사이드바 더보기, 전체 화면 목록, 25개 스크롤, 긴 제목 말줄임, 빈 검색 상태, 선택 뒤 편집 화면을 봤다. 가로 넘침은 0px이었다. 실제 모바일 기기는 확인하지 않았다.
- 스크린샷은 세션 scratchpad에 두었고 저장소에는 추가하지 않았다(`m1-sidebar.png` ~ `m5-selected.png`).
- 확인에 쓴 포트 3534 서버는 종료했다. 전용 E2E 스택은 Playwright가 종료한다.

## 근거·주의

- 빌드는 **원본 작업 트리**에서 전용 dist 디렉터리로 했다. 그래서 세션 A·B의 진행 중 변경(`next.config.ts` 보안 헤더, `AIChatSidebar.tsx`)도 포함됐다. 통과 결과는 21:15 시점 작업 트리 기준이다.
- 모든 인증은 모의 Spring이고, 실제 Google·외부 AI는 호출하지 않았다. 실제 사용자 데이터 대신 심은 테스트 데이터만 썼다.
- `usePlannerStorageHydration`은 같은 페이지에서 저장 범위가 바뀌면 새로고침한다. 새로고침 없는 범위 전환은 앱에서 일어나지 않으므로 E2E로 재현하지 않았다. 코드에서는 보관함 상태를 범위에 묶고 Section을 범위 key로 다시 마운트해 대비했다.

## 미완료

- 없음(범위 내). 커밋은 사용자 요청 시 진행한다. 이 세션 소유 파일만 stage해야 한다.
- 이미 있던 동작 관찰(수정 안 함): 주간 카테고리의 Daily 플랜은 `week`가 없어 날짜가 `2026`으로만 표시된다(`formatPlanDate`, DatePicker 소유).

## 조율

- 공유 계약 변경 없음. 소유 범위 밖 파일 수정 없음.
- 시작할 때와 완료 때 `mandalart-b5`, `mandalart-e9`(A·B로 추정)에 범위·포트·빌드 경로와 완료 사실을 보냈다. 완료 메시지에는 세션 A의 새 헤더가 같은 origin의 iframe 표시도 막는다는 런타임 관찰을 함께 적었다. 전송은 모두 성공했다. `mandalart-e9`가 세션 A(deploy-hardening)로 답했다. 같은 origin iframe 차단은 의도한 동작이며(`X-Frame-Options: DENY`, CSP `frame-ancestors 'none'`, Gateway 정책과 같음) 앱은 스스로를 iframe에 넣지 않으므로 변경할 필요가 없다고 했다. 이 세션의 15/15 결과도 A 보고서에 기록했다고 했다. `mandalart-b5`는 세션 B(ai-response-safety)라고 답했다. 이 세션의 최종 Sidebar.tsx가 포함된 작업 트리에서 자기 테스트를 21:17 KST에 돌려 27/27 통과했다고 알려 왔다. 이 세션이 직접 돌린 결과는 아니다. B의 E2E는 `aside` 안 제목 텍스트로 찾는 플랜 버튼과 `<제목> 메뉴` aria-label의 메뉴 버튼에 의존한다. 이 선택자를 바꾸면 B에 알려야 한다.

## 문서 (총괄 세션 반영 제안)

- `docs/roadmap-status.md` 6단계 "최근 5개 밖의 기록 접근" → 구현됨(`docs/plan-library.md`, 미커밋).
- `docs/templates/mandalart.md`, `block6.md`, `monthly.md`의 사이드바·플랜 관리 부분에 한 문장 추가: "사이드바는 카테고리별 최근 5개를 보여주며, 이전 플랜은 사이드바 상단 `전체 플랜 · 검색` 또는 `더보기`에서 제목 검색으로 다시 열 수 있다 (docs/plan-library.md)."
- CLAUDE.md/AGENTS.md Design System 후보: 보관함 칩·항목은 `text-xs`를 쓰고 임의 픽셀값은 새로 쓰지 않았다. 기존 사이드바 배지의 `text-[10px]`는 그대로 뒀다.

## 전달

- ListAgents(21:0x·21:1x)에는 저장소 `mandalart` 세션이 `mandalart-b5`, `mandalart-e9`, `mandalart-65`(9일 전 시작, 브리핑보다 이전)로 보였다. 어느 것도 로드맵 총괄 세션(참고값 `01a0ce63-…`)임을 확인할 수 없었고, 브리핑대로 총괄 세션에는 메시지 도구가 없다. 따라서 **총괄 세션에 직접 전송하지 않았다.** 이 보고서가 전달 수단이다.
