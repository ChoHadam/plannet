# Monthly/Daily 기간 탐색 및 Monthly 가져오기 출처 수정

## 완료 내용

- Monthly/Daily 이전·다음 버튼이 원본 플랜의 날짜와 `updatedAt`을 변경하던 동작을 제거했다. 같은 카테고리·기간의 기존 플랜을 선택하고, 없으면 빈 기간과 명시적 생성 버튼을 보여준다.
- 같은 기간에 여러 플랜이 있어도 합치지 않는다. `createdAt` 최신순, 동률이면 ID 오름차순으로 선택한다. 다른 복사본은 전체 플랜 목록에서 선택할 수 있다.
- `viewedMonth`/`viewedDay`는 빈 기간 조회 상태만 저장한다. 기존 데이터와 계정별 hydration을 유지하며 다른 플랜 선택·새 플랜 생성·복제 선택 시 해제한다. 빈 기간에 이전 플랜 제목·편집 UI가 남지 않는다.
- Monthly의 동작하지 않던 헤더 날짜 변경을 실제 날짜 재지정에 연결했다. Daily 헤더도 카테고리와 관계없이 그리드와 같은 날짜를 표시한다. 존재하지 않는 일자는 그 달 말일로 맞추고, 같은 날짜 재확인으로 수정 시각을 바꾸지 않는다.
- Monthly 가져오기에서 `원본 플랜 ID + 셀 ID`를 선택·중복 키로 사용한다. 추천 항목에 원본 제목을 표시하고 각 항목의 실제 출처를 저장한다. 다른 만다라트의 동일 셀 번호를 별개로 가져오며, 같은 출처의 추천/그룹 중복과 재가져오기를 막는다.
- 기존 단일 출처 API 호출과 저장된 출처 필드 형식을 유지했다. 사용자가 동의한 완료 토글만 해당 원본에 반영한다.

## 변경 파일

- `apps/web/src/hooks/useMonthly.ts`, `useDaily.ts`
- `apps/web/src/lib/planPeriod.ts`, `monthlyImport.ts`, `templateRegistry.ts`
- `apps/web/src/components/Monthly/MonthlyGrid.tsx`, `ImportGoalsModal.tsx`
- `apps/web/src/components/Daily/DailyGrid.tsx`
- `apps/web/src/components/Header.tsx`: 날짜 표시/DatePicker 범위만 수정 (내보내기/가져오기 핸들러는 root 담당)
- `apps/web/src/app/page.tsx`: 빈 조회 기간의 템플릿 화면 유지
- `apps/web/e2e/period-and-import/period-and-import.spec.ts`, `start-web.mjs`
- `apps/web/playwright.period-and-import.config.ts`
- `docs/templates/monthly.md`, `daily.md`, 이 보고서

기존 미커밋 변경은 유지했다. 커밋·푸시는 실행하지 않았다.

## 검증 결과

작업 디렉터리: `apps/web`.

1. `../../node_modules/.bin/playwright test --config playwright.period-and-import.config.ts` — **Chromium 9/9 통과, 17.4초**, 실제 Google Fonts를 포함한 production build 성공.
2. `../../node_modules/.bin/tsc --noEmit --incremental false` — 통과.
3. 담당 소스·신규 테스트·설정에 대한 `../../node_modules/.bin/eslint ...` — 오류/경고 없이 통과.
4. `git diff --check` — 통과.

브라우저 검증 범위:

- Monthly 연말 이동, 같은 기간 복사본 결정, 원본 전체 배열 무변경, 빈 기간 새로고침, 명시적 생성
- Daily 윤일·평년 2월·연말 이동, 카테고리가 다른 같은 날짜 플랜 제외, 복사본 결정, 편집 입력 상태 분리
- Monthly 날짜 재지정 및 중복 보존, 같은 날짜 확인 시 `updatedAt` 보존
- Daily 헤더/DatePicker 일관성, 윤일에서 평년으로 재지정할 때 말일 보정
- 템플릿 전환 후 빈 조회 상태 해제와 배타적 선택
- 서로 다른 두 만다라트의 같은 셀 번호 가져오기, 추천/그룹 중복 제거, 선택한 원본에만 완료 동기화, 동의하지 않은 원본 보존
- 드롭다운 원본이 비어 있어도 다른 원본의 추천 가져오기
- 모의 인증 응답으로 계정 A → B → A 새로고침 시 조회 기간과 플랜 격리

## 환경과 제한

전용 포트 `3640`, 결과 경로 `apps/web/test-results/period-and-import`를 사용했다. harness는 소스를 임시 디렉터리에 복사하므로 공유 `.next/dev`, `next-env.d.ts`, `tsconfig.json`을 수정하지 않는다. 실제 백업·API·외부 AI는 사용하지 않는다.

처음 sandbox 실행은 `fonts.googleapis.com` DNS가 차단되어 실패했다. 권한 확장으로 정상 폰트 빌드/브라우저 실행이 승인되어 최종 9개 테스트는 원래 폰트 소스로 통과했다. 폰트 대체 코드는 최종 harness에 없다.

임시 복사본에서 외부 `node_modules` 심볼릭 링크를 standalone으로 패키징하면 잘못된 경로(`/private/var/Users`) 생성이 시도되므로, **복사한 설정에서만** `output: standalone`을 제거하고 `next start`로 검증한다. 앱 코드·폰트·원본 Next 설정은 동일하다. standalone 패키징 및 전체 통합 회귀는 root가 별도로 검증한다.

과거 버그로 이미 잘못 저장된 출처는 진짜 원본을 확정할 수 없어 자동 수정하지 않는다. 기존 데이터의 출처 ID를 그대로 존중한다. 계정 테스트는 브라우저에서 인증 응답을 모의하며 실제 OAuth 제공자는 호출하지 않는다.
