# 계정 이메일 DB 저장

2026-10-05 · Opus 구현·49개 검사 통과, 총괄 코드·JUnit 결과·소스 해시 검토 완료. 이메일 구현과 API 선행 변경은 별도 커밋으로 분리한다. 미배포이며 서비스 재시작·실제 사용자 DB 반영은 하지 않았다.

## 무엇을 했나

`plannet_user`에 Google 계정 이메일을 **프로필 메타데이터**로 저장한다. 계정 식별은 그대로 `(provider, subject)` → 내부 UUID다.

```
Google 로그인 (ID 토큰 검증, 세션)
   │
   ├─ sub ───────────────► (provider, subject) ──► 내부 UUID (소유권, 변경 없음)
   │
   └─ email + email_verified
          │  OidcUser 이고 email_verified === true(Boolean)
          │  320자 이하 · 공백/제어 문자 없음 · '@' 1개
          ▼
      plannet_user.email  (nullable, 고유 아님, 병합 키 아님)
```

- Flyway `V4__account_profile_email.sql`: `email VARCHAR(320)` nullable 열과 형식 CHECK만 추가한다. 기존 사용자·플랜·영수증은 바뀌지 않고 기존 계정의 이메일은 NULL이다.
- `PlannerStorage.resolveUser(provider, subject, verifiedEmail)`: 먼저 읽고, 새 계정이면 INSERT, 검증된 이메일이 저장값과 다를 때만 UPDATE한다. 같은 값이면 쓰지 않는다.
- `/api/v1/me`와 planner 요청(GET 스냅샷·commit)의 사용자 확인에서 `OAuth2AuthenticationToken.verifiedProfileEmail()`을 넘긴다. 요청 본문·헤더의 이메일은 읽지 않는다.
- 토큰·이름·사진 등 다른 값은 저장하지 않는다.

## 동작 변화

| 상황 | 이전 | 이후 |
|---|---|---|
| 처음 로그인, 검증된 이메일 | 사용자 행에 이메일 없음 | 이메일 기록 |
| Google에서 이메일 변경(같은 sub) | — | 같은 UUID·플랜 유지, 이메일만 갱신 |
| 다른 sub, 같은 이메일 | 별도 계정 | 그대로 별도 계정(이메일 중복 허용) |
| `email_verified` 없음/false/문자열, 이메일 없음·무효·320자 초과 | — | 로그인 정상, 저장된 이메일 유지(새 계정은 NULL) |
| 같은 이메일로 반복 조회 | 매번 `INSERT … DO NOTHING` | SELECT만, 행 쓰기 없음 |
| 비로그인 요청 | 401 | 401, 사용자 행 생성 없음 |
| 저장 비활성(`AUTH_ENABLED=false`·인증 전용) | DB 없음 | 변경 없음 |

## 기존 계정은 언제 채워지나

- 배포 직후 기존 계정의 `email`은 **NULL**이다. 일괄 보정은 하지 않는다(외부 값을 추측해 넣지 않음).
- 세션은 API 메모리에 있어 새 API 배포(재시작)로 기존 세션이 끊긴다. 사용자가 **다음에 로그인**하면 첫 `/me`에서 채워지고, 이후 그 세션의 `/me`·planner 요청은 같은 값이면 쓰지 않는다.
- 이후 Google 쪽 이메일이 바뀌면 다음 로그인 때 갱신된다. 검증되지 않은 클레임으로는 덮어쓰지 않는다.

## API 응답

`/me`의 `user.email` 표시 규칙은 바꾸지 않았다(명시적 `email_verified=false`일 때만 null). DB 기록만 `true`를 요구한다.

- 장점: Web 화면·계약 변경 없음.
- 한계: 드물게 `email_verified` 클레임이 없는 토큰은 화면에는 이메일이 보이지만 DB에는 기록되지 않는다. Google ID 토큰은 이 클레임을 넣으므로 실사용 영향은 작다.

## 검증

실제 PostgreSQL 18(새 합성 compose 프로젝트, 루프백 25490, 전용 테스트 DB)에서 Gradle 1회 실행: **49개 통과, 실패·건너뜀 0**.

| 검사 | 수 | 확인 내용 |
|---|---|---|
| `AuthenticatedUserEmailTests` | 4 | `true`만 허용, 없음/false/"true" 거부, 320자 경계, 공백·제어·`@` 개수, OIDC 아닌 principal 거부, 무효여도 신원 유지 |
| `AccountEmailPostgresTests` | 7 | V3 데이터가 든 격리 스키마 → V4: 사용자(이메일 제외)·플랜 6·영수증 2 지문 동일, email NULL·nullable·320, CHECK 거부/중복 허용 · 첫 기록 · 이메일 변경 시 같은 UUID·플랜 · planner 요청 경로 기록 · 같은 이메일 다른 sub 분리 · 무효 클레임 7종 유지 + `xmin` 불변 · 반복 GET `xmin` 불변 · 비로그인 쓰기 0 |
| 기존 `PlannerPostgresTests`, `PlannerSnapshotEtagTests` | 20 | 동시 최초 로그인 1명, 소유권·ETag·영수증 회귀 |
| 기존 `AuthSecurityPolicyTests`, `OAuthLoginFlowTests` | 18 | 저장 비활성 인증 흐름 회귀 |

실행하지 않음: Web/브라우저 E2E(응답·화면 변경 없음), W6·백업/복원 검사, 전체 회귀. 검증용 컨테이너·네트워크·볼륨과 비밀번호 파일은 삭제했고 남은 자원 0을 확인했다. 실제 DB(15432)·기본 프로필·실제 환경 파일은 사용하지 않았다.

## 비고

- 이메일은 개인정보다. DB dump의 보관·공유 기준은 기존 계정 데이터와 같다.
- 이전 API는 이 열을 읽지 않으므로 API만 되돌려도 호환된다.
