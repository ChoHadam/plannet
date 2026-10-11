# PostgreSQL 계정 저장 API 작업 보고

2026-09-26 · 담당 범위: `apps/api/**`와 이 보고서. 기존 변경·미추적 파일을 보존했고 commit/push는 실행하지 않았다. Web·인프라·공용 계약 문서는 총괄/별도 작업자가 담당한다.

## 구현

- Spring JDBC + HikariCP + 명시적 트랜잭션, 조건부 Flyway. 기본 실행은 DB 없이 인증 전용이다. `SPRING_PROFILES_ACTIVE=storage`는 저장을 켜고, `prod`는 `${PLANNET_STORAGE_ENABLED:true}`를 기본값으로 사용한다. 활성화하면 PostgreSQL URL·사용자·비밀번호가 필수이며 연결/마이그레이션 실패 시 기동을 중단한다.
- 설정: `PLANNET_STORAGE_ENABLED`, `PLANNET_DB_URL`, `PLANNET_DB_USERNAME`, `PLANNET_DB_PASSWORD`. `storage` 프로필은 저장을 반드시 켠다. 인증 전용 prod 테스트는 `plannet.storage.enabled=false`를 명시했다.
- 검증된 OAuth `(provider, subject)`를 `plannet_user.id` UUID로 원자적으로 매핑한다. 이메일은 식별에 사용하지 않는다. `/api/v1/me`는 `storageEnabled`를 추가하고 활성화 시에만 `user.userId`를 제공한다. DB 장애는 503으로 반환한다.
- `GET /api/v1/planner`, `POST /api/v1/planner/commit`. 소유자는 세션에서만 정한다. 두 API의 `X-Plannet-User-Id` 헤더는 현재 세션 계정과의 일치 조건이며 소유자를 선택하지 않는다. 누락/불일치는 `409 account_changed`로 레코드 조회·쓰기를 거부한다.
- `mandalart`, `block6`, `monthly`, `daily`, `recurring`, `holidays`를 지원한다. 기본 키는 `(user_id, kind, id)`다. 공통 메타데이터 컬럼과 전체 JSONB 본문을 한 트랜잭션으로 저장한다. 삭제 표식은 버전과 함께 유지한다.
- 계정 row 잠금 아래 receipt → 버전 검사 → 전체 레코드 반영 → receipt 저장을 수행한다. 같은 계정의 동시 최초 생성/동일 요청도 직렬화하고, 다른 계정은 별도 잠금을 사용한다. 한 변경이라도 실패하면 전체를 롤백한다.
- `(user_id, requestId)`의 요청 해시와 성공 응답을 영속 보관한다. 재시도는 버전 검사 전에 원래 응답을 돌려준다. 같은 requestId의 다른 내용은 409다. 해시는 객체 키 순서에 영향을 받지 않고 배열 순서를 보존한다.
- `V1__account_planner_storage.sql`은 사용자·레코드·receipt 테이블과 인덱스를 생성한다. `V2__require_live_record_data.sql`은 SQL CHECK의 NULL 통과를 막아 살아 있는 레코드의 비어 있지 않은 JSONB를 강제한다. Flyway clean은 비활성화한다.

## 서버 검증 범위

본문 8 MiB, 레코드 data 2 MiB, commit 최대 100건. Content-Length가 없는 chunked HTTP도 읽기 단계에서 같은 크기로 제한한다. 중복 JSON 키와 뒤에 붙은 추가 JSON 문서를 거부한다.

필수 공통 필드, 템플릿 일치, ID(최대 128자), 날짜·timestamp·기간, 명시적 boolean/숫자 타입을 검증한다. 텍스트는 16,384자, 중첩 깊이는 12다. 9×9 그리드, 42개 블록, 5개 weeklyFocus와 중복 ID/좌표를 검사한다. 일정의 날짜 순서·반복 종류·대상 월·요일 범위와 중복도 검사한다.

Daily/Monthly/반복 할 일 목록은 최대 2,000개, Block6 전체 할 일은 10,000개, 수동 휴일은 10,000개로 제한한다. Monthly 타입 주석의 `max 5`와 달리 실제 store는 5개 제한 없이 추가하므로 기존 데이터를 잃지 않게 2,000개를 허용했다. 출처 필드는 타입을 검증하고 원문 ID를 보존한다. 출처가 없어도 독립 플랜으로 저장한다. 안전한 확장 필드는 유지하고 NUL·`__proto__`·`prototype`·`constructor`는 거부한다.

## 실행한 검증

실제 `postgres:18.6-bookworm`을 전용 loopback `127.0.0.1:3672`와 전용 disposable Docker volume으로 실행했다. H2·DB mock·실제 Google/외부 AI는 사용하지 않았다.

```sh
# PostgreSQL 통합 테스트. 비밀번호 값은 이 보고서에서 생략한다.
PLANNET_TEST_DB_URL=jdbc:postgresql://127.0.0.1:3672/plannet_test \
PLANNET_TEST_DB_USERNAME=plannet_test \
PLANNET_TEST_DB_PASSWORD='<disposable-test-password>' \
./gradlew :apps:api:test

# DB 환경변수가 없는 기본 인증/단위 검증
./gradlew :apps:api:test
```

- PostgreSQL 모드: **47 tests, 0 skipped, 0 failures/errors**. 기존 25개 검증을 포함한다.
- DB 없는 기본 모드: **35 passed, 12 PostgreSQL cases skipped, 0 failures/errors**. DB 환경변수 존재 여부를 Gradle test input에 포함하여 모드 전환 시 다른 모드의 결과를 재사용하지 않는다.
- 실제 PostgreSQL 통합 11건: 마이그레이션·6개 종류 원문/메타데이터·이메일과 무관한 ID·계정 격리·계정 헤더·401/CSRF·receipt 재시도·변경된 requestId 재사용 거부·다중 레코드 충돌·중간 SQL 실패 롤백·삭제 표식·동시 최초 사용자/플랜 생성·동시 동일 commit·본문 상한.
- 실제 HTTP 재시작 검증 1건: mock OIDC 로그인 → 플랜/삭제 표식 저장 → Spring 종료 → 새 Spring 실행 → 기존 세션 401 → 재로그인 → 동일 내부 ID·레코드·삭제 표식·receipt 복원. 실제 chunked 초과 본문은 413. 실제 datasource 종료 후 `/me`와 planner 읽기/쓰기 모두 503.
- validator 단위 검증 7건, 조건부 설정 검증 2건, 인증 전용 storage_disabled 회귀 1건.
- PostgreSQL 컨테이너 자체도 재시작했다. 재시작 전후 **사용자 47개·레코드 52개·receipt 41개**의 전체 행 정렬 체크섬이 각각 동일했다. 이 수량은 여러 검증 실행이 누적된 합성 테스트 데이터다.
- `git diff --check` 통과.
- 검증 후 전용 `plannet-storage-api-test-20260926` 컨테이너와 같은 이름의 합성 데이터 volume을 제거했다. 다른 개발/검증 DB에는 접근하지 않았다.

브라우저 간 연동/초안/이전 검증은 총괄이 별도 실제 Spring/PostgreSQL 환경에서 수행한다. DB dump 복원·운영 계정/볼륨/백업 정책은 인프라 담당 범위이며 이 보고서의 API 테스트 결과와 구분한다. 세션은 기존과 같이 API 메모리 저장이므로 API 재시작 시 재로그인이 필요하다.
