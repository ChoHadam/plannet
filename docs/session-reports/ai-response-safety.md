# [ai-response-safety] 완료 — 늦게 온 AI 응답이 다른 플랜·최신 편집·새 채팅·로그아웃 뒤 계정 기록을 바꾸지 않음. 자동(27개 통과)·브라우저 검증 완료

상태: **완료** (2026-09-26) · 세션: mandalart-b5 (Claude Code) · 커밋·push 하지 않음

## 변경 (현재 작업 트리에 반영, 미커밋)

| 파일 | 핵심 동작 |
|---|---|
| `apps/web/src/lib/aiResponseSafety.ts` (신규) | 순수 함수. `snapshotGridValues`(요청 시점 셀 값), `findStaleReason`(세대→계정 저장 범위→플랜 ID→플랜 존재 순서로 확인), `planGridAction`(최신 플랜 기준으로 쓸 셀 목록 계산, 기다리는 동안 바뀐 칸은 제외) |
| `apps/web/src/components/AIChatSidebar.tsx` | 요청마다 `{세대, 저장 범위, planId, 스냅샷}`와 `AbortController`를 기록. 플랜 전환·삭제(=currentId 변경)·채팅 초기화·닫기·계정 범위 변경·해제·`beforeunload`/`pagehide`에서 세대를 올리고 요청을 끊음. 응답 처리 직전 store의 **최신 값**(`getState()`)과 `getPlannerStorageScope()`로 다시 확인. 메시지·사용량·진행 횟수·종료·오류·401 전환·loading 모두 현재 요청일 때만 갱신. 이전 요청의 `finally`는 새 요청의 loading을 끄지 않음. 셀 쓰기는 기존 `updateCell`만 사용(정제·중앙/외곽 동기화 유지, 직접 `setState` 없음) |
| `apps/web/e2e/ai-response-safety/**`, `apps/web/playwright.ai-response-safety.config.ts` (신규) | 전용 서버 스크립트(비밀 파일 없는 별도 사본 빌드, 포트 3520), 로직 테스트, 브라우저 테스트, 수동 검증용 지연 프록시(`manual-proxy.mjs`, 3521) |

### 적용 규칙 (동작 변화)
- **버리는 경우:** 요청 후 플랜 전환, A→B→A 재선택, 현재 플랜 삭제, 채팅 초기화("새로운 대화 시작"), 패널 닫기, 컴포넌트 해제, 계정 저장 범위 변경, 로그아웃·로그인 등으로 페이지 이동이 시작된 경우. 이때 이전 응답은 그리드·메시지·사용량·진행 횟수·loading 어디에도 반영하지 않음.
- **닫기:** 진행 중 요청을 취소하고, 답을 못 받은 질문은 대화에서 빼서 입력창에 되돌림.
- **수동 편집 보존:** 쓰기 대상은 "요청 시점 값 = 지금 값"인 칸만. 새 하위 목표 칸은 요청 시점에도 지금도 빈 칸 중에서 고름. 요청 전부터 있던 실천 계획을 덮어쓰는 기존 동작은 유지. 보존한 칸이 있으면 응답 끝에 "⚠️ 응답을 기다리는 동안 직접 수정한 칸은 그대로 두었어요." 표시.
- **플랜 초기화·핵심 목표 변경:** 대화 전제가 바뀐 것으로 보고 그리드에 쓰지 않음("⚠️ … 핵심 목표가 바뀌어 그리드에 적용하지 않았어요").
- 정상 요청·현재 요청의 401(로그인 안내 전환)·429·503 안내는 기존과 같음.

## 검증

실행 위치: 원본 작업 트리 코드를 `start-server.mjs`가 세션 scratchpad의 사본(`.env*`·`.local-backup`·`.next`·`test-results` 제외, `.env` 자동 로드 끔)으로 복사해 `next build`(타입 검사 포함) 후 standalone으로 127.0.0.1:3520에서 실행. 사본은 검증 시점(2026-09-26)의 작업 트리 전체이므로 세션 A의 `next.config.ts`, 세션 C의 `Sidebar.tsx` 진행 중 변경도 포함됨.

| 명령 | 결과 |
|---|---|
| `AIRS_WORK_DIR=<scratchpad>/airs-copy npx playwright test -c playwright.ai-response-safety.config.ts` (apps/web) | **27 passed / 0 failed / 0 skipped** (logic 13, desktop 11, mobile(Pixel 7) 3). 로그: `apps/web/test-results/ai-response-safety-manual/playwright-final-run.log` |
| 대조 실행: 사본의 `AIChatSidebar.tsx`만 HEAD 버전으로 바꿔 같은 브라우저 테스트 실행 | 14개 중 **9 failed** — 수동 입력 "내가 쓴 목표"가 "운동"으로 덮어써짐, 로그아웃 이동 중 A 계정 키에 쓰기 발생, 전환 후 loading 잔존 등. 통과한 5개는 정상/오류 안내/대화 재시작/새로고침 기반 계정 전환(회귀 탐지용이 아닌 기존 동작 확인) |
| `npx eslint` (변경 파일·e2e·config) | 오류 0 |
| `tsc --noEmit` — 격리 tsconfig(src + e2e/ai-response-safety, 루트 `.next/dev/types` 미포함) | 오류 0 (과거 Auth.js 생성 타입 문제와 무관하게 확인) |
| 사본 `next build` | 성공 |

브라우저 테스트 방식: `/api/runtime-config`·`/api/v1/me|csrf|logout`·`/api/chat`을 Playwright가 브라우저에서 가로채 모의(인증 on, 계정 A/B). `/api/chat` 요청은 붙잡아 두었다가 원하는 시점에 응답. 채팅 패널은 화면 전체 오버레이라, 열린 채의 편집·전환은 키보드 경로(focus + Enter/입력)로 재현.

브라우저 테스트 목록: 정상 적용 · 401/429/503 안내 · 요청 중 플랜 전환 후 새 요청 성공 · A→B→A · 현재 플랜 삭제 · 기다리는 동안 수동 입력 보존 · 플랜 초기화 · 닫기→다시 열기→새 요청 중 이전 요청 완료(loading 유지) · 대화 재시작 후 진행 횟수 0 · 로그아웃 후 문서 이동을 붙잡은 동안 응답 도착 → A 계정 키 쓰기 없음 · 계정 B로 전환 후 B 범위에서만 적용.

### 수동 브라우저 확인 (Claude in Chrome, 데스크톱)
`manual-proxy.mjs`(3521 → 3520, 모의 인증, `/api/chat` 8초 지연)로 확인. 스크린샷: `apps/web/test-results/ai-response-safety-manual/` (gitignore 대상)
1. `01-plan-switch-no-stale.jpg` — "운동" 요청 중 키보드로 플랜 B 선택 → 8초 뒤에도 B 채팅은 인사말만, A·B 중앙 그리드 변화 없음(LocalStorage 확인).
2. `02-manual-edit-preserved.jpg` — B에서 "영어" 요청 중 첫 하위 목표 칸에 "직접 쓴 목표" 입력 → 응답은 다음 빈 칸(1번)과 외곽 그리드에 적용, 입력 보존. 정상 응답·토큰 표시 확인.
3. `03-close-cancel-restore.jpg` — "독서" 요청 후 닫기 → 8초 뒤 다시 열면 입력창에 "독서" 복원, loading 없음, 저장소에 "독서" 없음.

## 미완료·한계
- **모바일 수동 확인 못함:** Chrome 창 크기 조정이 viewport에 반영되지 않았음. 모바일은 Playwright Pixel 7 에뮬레이션 3개 테스트로만 확인.
- 로그아웃 경합은 자동 테스트(문서 이동 보류)로만 확인. 수동으로는 재현 창이 너무 짧아 따로 하지 않음.
- `beforeunload`에서 요청을 무효로 하므로, 페이지를 떠나려다 취소되는 이동(현재 앱에는 없음)이 생기면 그 요청 응답은 버려짐.
- 다른 탭에서 다른 계정으로 로그인한 경우는 이 탭의 저장 범위가 바뀌지 않아 감지 대상이 아님(응답은 요청을 보낸 계정 범위의 플랜에만 적용됨).
- 채팅 패널에 focus trap이 없어 키보드로 뒤의 그리드·사이드바를 조작할 수 있음. 이번 변경은 그 경우도 안전하게 처리하지만, 접근성 관점의 focus 관리는 범위 밖.
- 실제 외부 AI·실제 Google 로그인으로는 검증하지 않음(모두 모의).

## 조율
- 공유 계약 변경 없음. 읽기 전용 파일(`useMandalart.ts`, `AuthProvider.tsx`, `plannerStorage.ts`, `/api/chat`, `lib/server/**`, 기존 E2E 공용 도구) 수정 없음. store API 변경 요청 없음.
- 세션 A(mandalart-e9): 시작 알림 수신 → 범위·포트 충돌 없음을 회신(전송 성공, 응답 확인은 없음).
- 세션 C(mandalart-f3): 21:17 KST 완료 알림을 받은 뒤 C의 최종 `Sidebar.tsx`·PlanLibrary가 포함된 작업 트리로 같은 명령을 다시 실행했고 **27 passed / 0 failed**. C는 21:15 KST 자기 E2E(15/15)가 이 세션의 `AIChatSidebar.tsx` 변경을 포함한 작업 트리에서 통과했다고 알려 옴(C의 보고이며 이 세션이 직접 실행한 결과는 아님). 시작 알림은 겹치는 파일이 없어 회신하지 않음. 이 세션 테스트는 사이드바 플랜 버튼을 `aside` 안 버튼의 텍스트로 찾으므로, C가 플랜 항목 구조를 바꾸면 선택자 조정이 필요할 수 있음(검증 시점의 C 변경 포함 상태로 통과).

## 문서 (총괄 세션 반영 제안)
`docs/templates/mandalart.md` 9행 "저장·인증" 문단 다음에 추가:

> **AI 어시스턴트 응답 적용:** 응답은 요청을 보낸 플랜·계정·대화에만 적용한다. 응답을 기다리는 동안 플랜을 바꾸거나(다시 돌아와도 동일) 삭제·초기화하거나, 대화를 새로 시작하거나 패널을 닫거나 로그아웃하면 이전 응답은 버린다. 패널을 닫으면 요청이 취소되고 보낸 질문은 입력창으로 돌아온다. 기다리는 동안 직접 수정한 칸은 AI가 덮어쓰지 않으며, 새 하위 목표는 요청 시점과 지금 모두 비어 있는 칸에 넣는다. 핵심 목표가 바뀌었으면 그리드에 적용하지 않고 안내만 표시한다.

로드맵 3단계 "지연 AI 응답" 항목: 구현·검증 완료(모의 인증·모의 AI). 재검증 명령은 위 표 첫 행.

## 전달
- 로드맵 총괄 세션(참고값 `01a0ce63-…`)은 `ListAgents` 목록에 없어 **직접 전송하지 못함**. 이 보고서로 전달.
- peer-sync 전송: 세션 A(mandalart-e9)에 범위·포트 회신 1건(전송 성공). 완료 사실은 A·C에 알릴 필요가 없어 보내지 않음.
