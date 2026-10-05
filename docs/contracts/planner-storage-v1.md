# Planner Storage v1 — 구현 계약

2026-09-26 · 사용자 확정: **PostgreSQL, 로컬 컴퓨터에서 개발·검증 후 홈서버로 이전**. 같은 origin의 Spring 세션·CSRF를 사용한다. 초기 서버 저장은 아래 두 엔드포인트와 플랜별 버전으로 구현한다. 계약 변경은 총괄과 조율한다.

## 활성화와 사용자

- `PLANNET_STORAGE_ENABLED=true`일 때 PostgreSQL을 필수로 연결하고 Flyway를 실행한다. 연결 실패 시 메모리 저장으로 대체하지 않는다. 기본 인증 전용 실행은 false로 유지해 기존 DB 없는 검증을 지원한다. 서버 저장용 로컬 실행과 공개 배포 예제에는 true를 명시한다.
- 환경변수: `PLANNET_DB_URL`(JDBC URL), `PLANNET_DB_USERNAME`, `PLANNET_DB_PASSWORD`. 저장 활성화 시 누락은 기동 실패다. 비밀번호를 코드/로그에 남기지 않는다.
- `/api/v1/me`의 기존 필드를 유지하고 최상위 `storageEnabled: boolean`을 추가한다. 활성화된 인증 사용자는 `user.userId: string(UUID)`를 추가로 받는다. 검증된 OAuth `(provider, subject)`를 내부 사용자에 원자적으로 매핑하며 이메일을 키로 쓰지 않는다. `/me`와 planner 요청의 사용자 확인에서 검증된 이메일이 새로 오거나 바뀐 경우에만 `plannet_user.email`을 갱신한다(같으면 쓰기 없음, 없거나 무효면 기존 값 유지). 요청 본문·헤더의 이메일은 읽지 않는다.
- Web은 `storageEnabled === true`와 유효한 userId가 있을 때만 서버 저장을 시작한다. 이전 응답에서 flag가 없으면 기존 로컬 모드로 호환한다. 활성화 상태의 DB 장애는 성공/로컬 저장 완료로 위장하지 않는다.
- 서버 저장의 로컬 캐시/초안/전송 대기는 내부 userId별로 격리한다. 예전 provider/subject 계정 키와 비로그인 키는 보존하고 명시적 가져오기 대상으로만 읽는다.
- 모든 planner 요청은 `X-Plannet-User-Id`에 기대하는 내부 사용자 ID를 보낸다. API는 세션에서 검증한 ID와 비교만 하며 소유권을 헤더에서 결정하지 않는다. 누락/불일치는 `409 { error: 'account_changed' }`로 읽기·쓰기를 거부한다. 다른 탭에서 계정이 바뀌었을 때 이전 계정 초안의 오전송을 막으며 `/me` 사전 조회만으로 대체하지 않는다.

## 레코드 형식

```ts
type RecordKind = 'mandalart' | 'block6' | 'monthly' | 'daily' | 'recurring' | 'holidays';
interface PlannerRecord {
  kind: RecordKind;
  id: string;             // 기존 플랜 id. recurring/holidays는 'default'
  schemaVersion: 1;
  version: number;        // 서버에서 단조 증가, 최초 저장은 1
  data: object | null;    // null이면 삭제 표식
  deleted: boolean;
  updatedAt: string;      // 서버 UTC timestamp
}
```

- 플랜 data는 현재 템플릿의 완전한 JSON 객체(ID·공통 메타데이터 포함)다. 저장 시 서버가 공통 컬럼을 추출해 같은 트랜잭션에서 기록하고 응답에는 완전한 data를 제공한다. 소유권은 본문에서 받지 않는다.
- 반복 할 일 data는 `{ todos: RecurringTodo[] }`, 휴일은 `{ manualHolidays: ManualHolidayMap }`이다. 기기별 currentId/viewedDay/viewedMonth/패널 상태는 서버에 보내지 않는다.
- DB 식별자는 `(user_id, kind, id)`로 구분한다. 서로 다른 템플릿의 같은 ID와 같은 날짜의 여러 플랜을 보존한다. 삭제 표식을 유지해 오래된 저장이 삭제한 기록을 되살리지 못하게 한다.
- 형식 버전·템플릿 일치·필수 필드·중첩 구조·ID·날짜·스케줄·개수/문자열/크기 상한을 서버에서 검사한다. 기존 저장본의 안전한 확장 필드는 유지한다. NUL·위험한 프로토타입 키·과도한 깊이는 거부한다.

## API

| API | 요청 | 성공 |
|---|---|---|
| `GET /api/v1/planner` | 세션·기대 사용자 헤더 | `200 { userId, records: PlannerRecord[] }` — 해당 사용자 레코드 전체, 삭제 표식 포함 |
| `POST /api/v1/planner/commit` | 세션·기대 사용자 헤더·CSRF·JSON, 아래 본문 | `200 { records: PlannerRecord[] }` — 반영된 레코드 |

```json
{
  "requestId": "UUID-per-logical-commit",
  "changes": [
    { "kind": "daily", "id": "existing-client-id", "schemaVersion": 1,
      "expectedVersion": 0, "data": { "id": "existing-client-id", "template": "daily" } }
  ]
}
```

예시 data는 생략된 형식이며 실제 요청에는 해당 템플릿의 모든 필수 필드를 포함한다. 최초 생성은 expectedVersion 0, 수정/삭제는 읽은 서버 버전을 사용한다. 삭제는 data null이다. 한 요청의 변경은 **전부 성공 또는 전부 실패**하며 같은 key를 두 번 넣지 않는다. 여러 플랜의 완료 동기화도 한 commit으로 보낸다.

- 최대 100개 변경/commit, 본문 8 MiB 이하, 개별 data 2 MiB 이하. 이전은 제한 크기의 묶음으로 처리하며 원본을 보존한다. 큰 이전의 전체 성공 여부와 묶음별 결과를 구분한다.
- `(user_id, requestId)`와 요청 해시·응답을 함께 저장한다. 네트워크 단절 후 같은 요청을 재전송하면 기존 성공 응답을 반환한다. 같은 requestId로 다른 내용을 보내면 409다. idempotency 확인은 버전 확인보다 먼저 한다.
- `409 { error: 'version_conflict', conflicts: [{kind,id,expectedVersion,actualVersion}] }`이면 해당 commit은 반영되지 않는다. `actualVersion`은 자기 계정 범위에서만 계산한다.
- 그 밖 오류: `400 invalid_request`, `413 payload_too_large`, `409 idempotency_conflict`, `503 storage_unavailable`, `503 storage_disabled`. 인증·CSRF는 auth-v1의 401/403 형식을 따른다. 응답·오류를 캐시하지 않는다.
- 소유권은 검증된 세션으로만 결정한다. 다른 사용자 ID를 받는 옵션·endpoint는 만들지 않는다. 출처는 같은 사용자+원본 템플릿+원본 ID로만 해석하며, 출처 없는/삭제된 기록도 독립 플랜으로 보존한다.

## 클라이언트 저장·이전

1. 인증/계정 확인 → 해당 계정 캐시 복원 → 서버 읽기. 서버 로딩 중 내용을 자동 생성·빈 값으로 덮어쓰지 않는다.
2. 편집은 계정별 초안에 보존하고 debounce 후 변경된 레코드를 commit한다. 버전·미전송 변경·진행 중 requestId/본문을 내구성 있게 보관한다. ACK 도착 중 새 편집이 있으면 그 편집을 보존한다.
3. 실패/401/계정 전환 시 성공 표시나 다른 계정 재전송을 하지 않는다. 재로드 후에는 전송 중이던 동일 requestId/본문을 먼저 확인/재시도하여 성공 응답 유실로 인한 가짜 충돌을 피한다.
4. 충돌은 자동 덮어쓰기하지 않고 초안을 다운로드/보존할 수 있게 한 뒤 최신 서버 내용 확인 또는 명시적 재시도를 제공한다. 최신 서버 내용을 적용하기 전 초안 보존을 보장한다.
5. 기존 계정 로컬 기록과 로그인 전 기록은 구분해 사용자가 명시적으로 가져온다. 원본 키를 지우지 않는다. 동일 key·동일 내용은 건너뛰고 다른 내용이면 충돌로 알려 자동 병합하지 않는다. 출처 ID는 유지한다.
6. 저장 상태(불러오는 중/저장 중/저장됨/실패/충돌)를 표시한다. 로컬 파일 백업 UI와 공용 서버 백업 금지는 그대로 유지한다.

## 완료 검증

실제 PostgreSQL로 migration·소유권·버전 충돌·원자적 변경·재시도·삭제·재시작 영속성 검증. 브라우저 두 개에서 로그인 계정별 서버 복원, 네트워크 실패/재로드, 충돌 시 초안 보존, 명시적 로컬 이전, 원본 참조 보존 검증. 기존 인증/로컬 모드도 회귀한다. DB dump를 별도 빈 DB에 복원해 데이터 일치를 확인하고 홈서버 이전 절차를 문서화한다.
