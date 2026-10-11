# AI 초기화 후속 — 완료

2026-09-26 · 원본 작업 트리에 반영 · 커밋·push 없음.

`coordinator-review.md`가 지적한 빈 핵심 목표 초기화 누락을 브라우저에서 재현하고 수정했다. 초기화 전후의 ID·생성/수정 시각·셀 값이 모두 같아도 이전 AI 응답 전체를 버린다. 기존 `ai-response-safety.md`의 초기화 관련 한계와 검증 수치는 이 후속 보고서로 보완한다.

## 변경

| 파일 | 후속 변경 |
|---|---|
| `apps/web/src/hooks/useMandalart.ts` | 메모리에만 존재하는 `resetToken: object \| null`. `resetCurrent()`와 새 `replaceCurrentMandalart(data): boolean`이 내용과 토큰을 같은 store 갱신에서 교체한다. 토큰은 셀 값·시각에 의존하지 않으며 하나의 슬롯만 사용한다. persist의 기존 `mandalarts`·`currentId` 구조와 버전은 유지한다. |
| `apps/web/src/components/AIChatSidebar.tsx` | store 구독에서 플랜 전환·초기화를 동기 감지해 요청 세대를 무효화하고 요청 취소·대화·사용량·도움 횟수·종료 상태를 초기화한다. React effect가 재실행될 때까지 기다리지 않는다. 요청 context의 토큰을 응답 처리 및 catch/finally에서도 확인해 이전 완료가 새 요청의 loading을 해제하지 못한다. |
| `apps/web/src/lib/aiResponseSafety.ts` | 요청/현재 상태에 초기화 토큰을 추가하고, 값이 같아도 토큰이 다르면 `plan-reset`으로 판정한다. 일반 셀 편집 보존 규칙은 유지한다. |
| `apps/web/e2e/ai-response-safety/{chat,logic}.spec.ts`, `fixtures.ts` | 빈 핵심 목표·동일 시각 초기화 2개, 초기화→새 요청→이전 응답 도착 1개, 토큰 판정 1개, 실제 store의 반복 초기화/전체 교체/없는 대상 3개 회귀 추가. 기존 초기화 테스트는 이전 응답을 대화에서도 버리는 동작으로 갱신했다. |
| `apps/web/e2e/ai-response-safety/{server.config,start-server}.mjs`, `apps/web/playwright.ai-response-safety.config.ts` | `AIRS_PORT`·`AIRS_OUTPUT_DIR` 재정의 지원. 기본 포트 3520과 기본 결과 경로는 유지한다. |

`replaceCurrentMandalart(data: MandalartData): boolean`은 검증된 import 입력을 받는다. 선택된 기존 플랜이 있으면 immutable하게 교체하며 local ID를 유지하고, 가져온 category·내용·schedule·날짜·createdAt을 보존한다. updatedAt만 현재 시각으로 갱신한다. 대상이 없으면 false를 반환한다. Header에서 호출 전 플랜·계정 문맥 확인과 JSON 검증은 총괄/IO 범위다.

## 검증

apps/web에서 실행:

```sh
AIRS_PORT=3661 AIRS_WORK_DIR=/private/tmp/plannet-ai-reset-final AIRS_OUTPUT_DIR=/private/tmp/plannet-ai-reset-final-results npx playwright test -c playwright.ai-response-safety.config.ts
```

- **34 passed / 0 failed / 0 skipped**: logic 17, desktop 14, Pixel 7 3. 기존 27개 범위를 포함한다. 사본의 `next build`(TypeScript 포함)도 성공했다.
- 새 브라우저 테스트는 `/api/chat`의 AbortSignal을 테스트에서만 제거해 취소 후에도 응답 본문을 실제 전달한다. 빈 값·동일 ID·동일 생성/수정 시각에서 `set_core_goal`과 `generate_actions`를 모두 차단하는지 확인한다. 정상 응답의 기존 토큰/도움 횟수가 있던 상태에서 초기화 후 새 요청을 보낸 뒤 이전 응답을 전달해 메시지·사용량·도움 횟수·종료·loading을 확인한다.
- **수정 전 대조 실행: 2 failed.** 변경 전 사본 `/private/tmp/plannet-ai-reset-baseline`에서 같은 빈 핵심 목표 테스트 2개를 실행했다(포트 3660, `AIRS_SKIP_SYNC=1`). 둘 다 초기화 후 셀이 비어 있어야 한다는 assertion에 실패했다. Playwright 오류 스냅샷에 이전 목표·이전 질문·이전 응답·`토큰: 150`이 남아 있다. 결과 경로: `/private/tmp/plannet-ai-reset-baseline-results`.
- 변경 파일과 전용 E2E/config의 ESLint 오류 0, `git diff --check` 통과.
- 최종 결과: `/private/tmp/plannet-ai-reset-final-results/.last-run.json`의 `status: passed`.

초기 제한 환경 실행은 Google Fonts 연결 실패, 폰트 대체를 시도한 사본은 Turbopack의 port bind EPERM으로 빌드 단계에서 중단됐다. 이후 `require_escalated`로 정상 폰트 설정을 유지한 빌드·브라우저 검증과 대조 실행을 완료했다. 임시 폰트 대체 코드는 제거했고 최종 사본의 layout은 원본과 동일하다.

## 총괄 문서 반영 문구

> 플랜을 초기화하거나 JSON 가져오기로 전체 내용을 교체하면 진행 중인 AI 요청과 대화·사용량·진행 횟수가 함께 초기화된다. 핵심 목표가 원래 비어 있거나 초기화 전후 셀 값과 시각이 같아도 이전 응답은 반영되지 않는다. 초기화 후 새 요청을 시작해도 이전 응답이 새 요청의 진행 상태를 바꾸지 않는다. 일반적인 직접 셀 편집은 기존 편집 보존 규칙을 따른다.

`docs/templates/mandalart.md`와 `coordinator-review.md`는 총괄 소유이므로 이 세션에서 수정하지 않았다. 기존 보고서의 “플랜 초기화·핵심 목표 변경 시 안내만 표시” 중 **초기화**는 이제 이전 응답 전체 폐기로 구분해야 한다. 직접 핵심 목표를 편집한 경우의 그리드 적용 차단 안내는 유지한다.

실제 Google 로그인·실제 유료 AI는 호출하지 않았다. 인증/API는 Playwright 모의 응답이다. 새로운 초기화 회귀는 데스크톱 Chromium, 기존 모바일 회귀 3개는 Pixel 7 에뮬레이션에서 실행했다. Header import의 브라우저 검증과 최종 병합 작업 트리 전체 회귀는 총괄/IO 검증과 구분한다.
