# 계정 서버 저장 — Web 구현 보고

2026-09-26. PostgreSQL 저장 계약 `docs/contracts/planner-storage-v1.md`에 맞춘 Web 연동이다. 커밋·푸시는 하지 않았다. 기존 수정 중인 템플릿·보관함·AI 코드의 변경을 되돌리지 않았다.

## 동작

- `/api/v1/me`의 `storageEnabled === true`와 내부 UUID `user.userId`를 확인한 경우 서버 저장을 시작한다. flag가 없거나 false면 기존 인증 계정별 LocalStorage 동작을 유지한다. 비로그인/인증 비활성 동작도 유지한다.
- 4개 플랜, 반복 할 일, 수동 휴일을 동기화한다. `currentId`, 조회 날짜, 패널 상태는 서버에 보내지 않는다. 기존 템플릿 store 동작을 변경하지 않고 store 구독으로 변경을 수집한다.
- 서버 캐시는 `cloud:<userId>` 범위를 사용한다. `plannet-server-sync@<userId>`에는 읽은 레코드/버전, 초안, 전송 중인 정확한 requestId/본문을 함께 보관한다. 예전 `acct:<provider:subject>` 및 비로그인 키를 덮어쓰거나 지우지 않는다.
- 최초 진입과 캐시가 있는 재로드 모두 서버 GET이 끝나기 전에는 편집 화면을 열지 않는다. 캐시가 없는 첫 읽기가 실패하면 빈 편집 상태를 열지 않는다. 이미 보관한 캐시/초안이 있는 읽기 실패에서는 오류와 함께 초안을 유지한다.
- 편집 시 초안을 즉시 보관하고 650ms 뒤 자동 저장한다. Monthly 완료와 원본 Mandalart 셀 완료처럼 연속으로 바뀐 store 변경은 한 commit에 들어간다. 선택만 바뀐 경우나 빈 기본 설정은 서버 쓰기를 만들지 않는다.
- 재로드 시 전송 중이던 요청을 동일 requestId/본문으로 먼저 재시도한 뒤 서버를 읽는다. 늦은 성공 응답으로 이후 편집을 덮어쓰지 않고, 새 버전으로 다음 저장을 보낸다. JSONB 키 순서 및 직렬화 시 사라지는 undefined 필드를 비교에서 정규화한다.
- GET/commit에 `X-Plannet-User-Id` 기대계정 헤더를 보낸다. 세션 만료나 계정 불일치는 쓰기를 중단하고 초안을 보존한다. 같은 계정으로 다시 인증한 새 페이지는 해당 계정 초안을 재개할 수 있다. CSRF 만료는 토큰을 새로 받아 한 번 재시도한다.
- 충돌은 자동 덮어쓰기하지 않는다. 초안 파일 저장과 `초안 보관 후 서버 내용 불러오기`를 제공한다. 서버 내용을 적용하기 전에 별도 LocalStorage backup 키를 성공적으로 기록해야 하며, 전송 성공 여부가 불명확한 요청도 먼저 확인한다.
- 기존 계정 기록과 로그인 전 기록을 별도 버튼으로 가져온다. 원본 ID와 템플릿 간 출처 ID를 그대로 유지한다. 동일 key·내용은 건너뛰며 다른 내용/서버 삭제/현재 초안 삭제와 충돌하면 해당 가져오기를 전부 중단한다. 가져오기 원문은 보존한다. 이전 Mandalart v2의 isDaily 및 Block6 v1의 backlog 누락을 마이그레이션한다.
- 큰 가져오기는 최대 100개/약 7MiB 묶음으로 저장한다. 일부 묶음만 성공하면 나머지 초안을 유지하고 아직 서버에 저장하지 못한 기록 수를 표시한다. 저장소 quota 오류는 서버 저장 성공으로 표시하지 않는다.
- 같은 브라우저의 다른 탭이 같은 계정 동기화 기록을 바꾸면 이전 탭을 멈춘다. 이전 탭의 대기 초안은 별도 backup 키에 보관하고 새로고침을 안내한다. 백업 공간도 부족하면 새로고침 전에 파일 저장을 안내한다.
- 서버 내용을 통째로 적용할 때 Mandalart `resetToken`을 바꿔 이전 AI 응답을 무효화한다.

## 주요 파일

| 파일 | 역할 |
|---|---|
| `apps/web/src/lib/plannerSync.ts` | React와 분리된 내구성 있는 초안/버전/전송 상태 머신 |
| `apps/web/src/lib/plannerSyncApi.ts` | 동일 origin GET/commit, 세션 기대계정·CSRF·응답 검사 |
| `apps/web/src/lib/plannerSyncStores.ts` | 6개 store 스냅샷/적용, 구조 검사, 기존 기록 읽기 전용 가져오기 |
| `apps/web/src/hooks/usePlannerSync.ts` | 계정별 coordinator 수명·store 구독·online 재시도·다른 탭 보호 |
| `apps/web/src/components/PlannerSyncStatus.tsx` | 한국어 저장 상태·명시적 가져오기·초안 다운로드·충돌 처리 |
| `AuthProvider`, `authContract`, `plannerStorage`, `usePlannerStorageHydration`, `useAllPlans`, `Home`, `AuthStatus` | 활성화/내부 UUID 범위/초기 편집 대기/UI 연결 |

안정적인 브라우저 선택자는 `storage-sync-status` (`data-phase=loading|saving|saved|error|conflict`), `storage-sync-import-local`, `storage-sync-import-legacy`, `storage-sync-download`, `storage-sync-use-server`다.

## 검증

```sh
cd apps/web
npx tsc --noEmit --incremental false
STORAGE_SYNC_LOGIC_ONLY=1 npx playwright test -c playwright.storage-sync.config.ts --project=logic
npx playwright test -c playwright.storage-sync.config.ts
```

- 상태 머신 14개 및 모의 API 브라우저 8개: 총 22개 통과. 캐시 재로드의 지연 GET 대기, 첫 읽기 실패, 초안 선저장, 성공 응답 유실+재로드, 전송 중 새 편집/되돌리기, 충돌+재로드+다운로드+보관, 세션 계정 전환, 같은 계정 재인증, 명시적 가져오기 충돌/원본 보존/참조 보존, 큰 가져오기 100/100/5 묶음, 일부 실패 시 나머지 105개 보존, quota/손상 캐시, 실제 Monthly→Mandalart store 완료 연동의 단일 commit, AI resetToken을 검사했다.
- production 빌드는 환경 파일·로컬 백업·기존 `.next`를 제외한 OS 임시 사본과 전용 3680 포트에서 실행했다. 실제 API·DB·외부 AI는 이 모의 테스트에서 호출하지 않는다. Google Fonts 다운로드는 sandbox 밖의 승인된 빌드로 수행했다. 소스의 폰트를 바꾸지 않았다.
- 수정한 저장 관련 소스의 TypeScript 및 대상 ESLint 검사 통과. 루트 에이전트가 별도로 실제 Spring+PostgreSQL+production Web 및 기존 인증/템플릿 회귀를 담당한다.

## 범위와 남은 제약

- 다른 기기의 변경을 실시간 구독하거나 자동 병합하지 않는다. 재로드/명시적 서버 내용 불러오기에서 읽으며, 오래된 저장은 서버 버전 충돌로 막는다.
- 같은 브라우저 여러 탭의 동시 편집은 지원하지 않고 변경 감지 시 이전 탭을 멈추고 초안을 보관한다.
- 브라우저 저장 공간이 부족하면 초안을 파일로 보관할 수 있으며, 내구성 있는 초안 기록 없이 서버 전송을 강행하지 않는다. 브라우저 저장소 자체를 삭제하면 전송 전 초안은 복구할 수 없다.
- 충돌의 자동 병합이나 초안 백업 파일을 다시 가져오는 전용 UI는 이번 범위가 아니다. 서버 내용 적용 전에 원본 초안의 LocalStorage 사본과 파일 다운로드 경로를 제공한다.
- 이 보고서의 22개 검증은 모의 API 결과다. 실제 PostgreSQL 영속성/소유권/DB 백업·복원 결과는 루트/API 보고서를 따른다.
