# 총괄 세션 검토 — 2026-09-26

**후속 범위 결정:** 사용자가 첫 공개의 계정별 서버 저장을 확정했다. DB 종류·운영 방식은 [설계 초안](../account-storage-design.md)으로 협의 중이다. 공개 호스트 `plannet-lab.duckdns.org`를 로컬 배포 설정에 반영했으나 운영에는 적용하지 않았다. 아래 22:19 검토는 해당 범위 결정 전 완료한 코드·검증 기록이다.

22:19 KST 갱신. 이전 A·B·C 결과 인수 뒤 사용자 요청으로 Codex 에이전트 3개를 직접 분담했다. 공개 전 우선 코드 수정과 로컬 회귀를 마쳤다. 실제 공개 배포와 외부 AI 확인은 남았다. 모든 변경은 미커밋이며 기존 작업 트리를 보존했다.

## 완료 판정

| 작업 | 판정·근거 | 이번 검증 |
|---|---|---|
| A · 배포 보안 | 비밀 파일 빌드 제외·API UID 10001·Web 헤더 구현 대조 | 이전 90개 점검 성공 보고 유지. 이미지는 이번 재빌드하지 않음 |
| B · 지연 AI + 후속 초기화 | 빈 핵심 목표 초기화 누락 해결. 동기 store 구독·transient token으로 이전 응답 무효화 | 담당 34개 통과. 수정 전 production 사본에서는 새 브라우저 2개 실제 실패 |
| C · 전체 플랜 목록 | 검색·선택·계정 격리와 날짜 탐색 변경의 결합 확인 | 총괄이 최신 standalone 빌드에서 5개 직접 재실행·통과 |
| Monthly/Daily · 날짜·출처 | 탐색/재지정 분리, 빈 기간 명시적 생성, 복수 원본 식별·완료 전파 | 담당 9개 Chromium 테스트 통과 |
| Mandalart · JSON/PNG | 검증·원본 보호, 전체 PNG. 기존 oklab 예외와 중복 ID 재현 후 수정 | 담당 46개 통과. 총괄도 출력 PNG 직접 시각 확인 |
| 통합 회귀 | 최신 공유 소스의 인증·백업·계정 분리·4개 템플릿·AI 접근 통제 | 총괄이 기존 42개 직접 재실행·통과 |

이번 검증은 **42 + 5 + 34 + 9 + 46 = 136개**, 실패·건너뜀 없음. 실제 Google/유료 AI를 호출한 테스트 수치가 아니다. 상세 담당 검증은 [AI](./ai-reset-followup.md), [날짜·출처](./period-and-import.md), [JSON·PNG](./mandalart-io.md)에 있다.

## 공유 파일 통합

- Header 날짜 부분은 날짜 담당 완료 후 총괄에 인계했다. 총괄은 JSON/PNG 핸들러를 이어서 수정했다.
- JSON 파일 선택 시 계정 범위·원본 객체·선택 세대를 저장한다. 선택/확인 중 플랜 전환, A→B→A 왕복, 초기화, 원본 편집이 있으면 뒤늦은 가져오기를 적용하지 않는다.
- 검증 후 `replaceCurrentMandalart`로 전체 내용을 immutable하게 교체한다. 현재 로컬 ID와 가져온 카테고리·기간·일정·createdAt을 보존하고 updatedAt을 갱신한다. 같은 store 갱신으로 AI 초기화 토큰을 교체한다.
- PNG에는 현재 전체 플랜을 전달한다. iframe/DOM 캡처 없이 고정 9×9 레이아웃을 저장한다.
- 로드맵·배포 현황·템플릿 문서를 완료 상태와 실제 검증 범위에 맞췄다. 이전 세션 보고서는 당시 기록으로 유지했다.

## 직접 실행한 통합 검증

루트에서:

```sh
npm run lint
./node_modules/.bin/tsc --noEmit --incremental false -p apps/web/tsconfig.json
npm run test:e2e
./gradlew --no-daemon --console=plain :apps:api:test
git diff --check
```

목록 회귀는 apps/web에서:

```sh
npx playwright test -c playwright.plan-library.config.ts e2e/plan-library
```

- lint·표준 타입 검사 성공. 과거 `.next/dev/types`를 `/private/tmp/plannet-old-route-types-dcvnkkm1/types`로 보관하고 현재 경로의 타입을 재생성하여 삭제된 Auth.js 참조 문제를 해소했다.
- 기본 E2E **42 passed (47.4s)**, 목록 **5 passed (15.5s)**. 각각 실제 Google Fonts를 사용하는 새 production/standalone 빌드를 포함했다. 전용 포트 3310~3315와 3530~3533 사용. 개발 서버와 실제 사용자 데이터는 사용하지 않았다.
- API task는 **BUILD SUCCESSFUL, UP-TO-DATE**였다. 기존 9월 26일 XML의 25개 성공 결과를 재사용했으며 새 실행으로 집계하지 않는다.
- 결과 파일: `apps/web/test-results/.last-run.json`, `apps/web/test-results/plan-library/.last-run.json`. 담당 결과 경로는 각 보고서에 기록했다. 총괄은 모바일 PNG에서 전체 칸·한글/영문·색상·이모지·완료 표시를 직접 확인했다.
- sandbox의 폰트 네트워크/포트 제약은 승인된 확장 실행으로 검증했다. 최종 빌드에서 폰트 대체나 보안 헤더 제거를 사용하지 않았다. 날짜 전용 사본의 standalone 패키징 제약은 총괄의 실제 standalone 빌드·회귀로 별도 확인했다.

## 이전 B 보류 사유와 해결

21:19 점검에서는 빈 핵심 목표의 snapshot과 초기화된 같은 ID의 플랜을 실제 helper에 전달했을 때 `findStaleReason()`이 null이고 중앙 4번 쓰기가 허용됐다. 당시 총괄은 단위 함수로만 재현했고, B의 기존 브라우저 27개 성공만으로 완료 처리하지 않았다.

후속 담당은 수정 전 사본에서 빈 목표·같은 타임스탬프 조건의 `set_core_goal`/`generate_actions` 두 브라우저 사례를 모두 실패로 재현했다. 현재는 셀 값·시간과 독립적인 초기화 토큰을 동기 갱신한다. 초기화 후 새 요청이 시작돼도 이전 요청이 그리드·채팅·토큰·횟수·loading을 변경하지 못한다. 따라서 **B 완료 보류를 해제**한다.

## 남은 작업과 제한

- 첫 공개 저장 범위 결정. 브라우저 저장은 기기 간 동기화가 없으며 서버 저장이면 사용자 매핑·DB·소유권·저장 API·이전·충돌·복구가 필요하다.
- 실제 도메인·배포 대상·공인 TLS·Google callback·최신 이미지 배포와 공개 origin 검증. 외부 AI와 공급자 금액 상한 확인.
- 배포의 로컬 HTTPS E2E 12개·공개 점검 18개, A의 이미지/보안 90개는 이전 보고 수치다. 이번 최신 이미지 결합 검증을 대체하지 않는다.
- 과거 잘못 저장된 import 출처는 추측해 교정하지 않는다. 실제 Safari/모바일 다운로드 UI는 미검증이다.
- 주차 정합성·캘린더/URL·Monthly→Daily 등 제품 확장은 후속 로드맵으로 유지한다.

## 작업 조율

직접 생성한 Codex 에이전트의 도구 메시지로 범위·파일 인계·검증 결과를 조율했다. 이전의 독립 Claude 세션과 통신했다고 주장하지 않는다. 날짜/출처·JSON/PNG·AI 초기화를 분담하고 총괄이 Header·문서·통합 회귀를 맡았다. 공개 환경과 제품 범위 결정이 필요한 항목만 사용자에게 확인 요청했다.
