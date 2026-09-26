# Auth Contract v1 (API ↔ Web)

작성일: 2026-09-23 · 구현: `apps/api` (Spring Security 7 OAuth2 Client) · 설계 배경: [api-owned-auth-phase1](../research/2026-07-31-api-owned-auth-phase1.md)

Spring API가 Google 로그인·세션·로그아웃을 소유한다. Web은 아래 공개 경로와 응답만 알고, Spring 내부 구현에 의존하지 않는다.

## 1. 전제

- 브라우저 기준 **같은 origin**에서 Web과 API를 제공한다. 진입점(Ingress)은 `/api/v1/**`, `/oauth2/**`, `/login/oauth2/**`를 API로 보내고, 나머지(`/api/chat` 등 포함)는 Web으로 보낸다.
- 세션은 API 메모리에 저장한다(**API replica 1개**). API 재시작 시 다시 로그인해야 하지만 PostgreSQL의 사용자·플랜은 유지된다.
- `externalSubject`는 Google `sub`(외부 식별자)이며 **내부 userId가 아니다**. 서버 저장 활성화 시 API가 검증된 `(authProvider, externalSubject)`를 내부 UUID로 매핑하고, 플랜 소유권은 이 UUID로 제한한다. 이메일은 표시용이다.
- v1 허용 범위: `authProvider:externalSubject` 쌍을 **파생·비권한 키**로 쓸 수 있다. 예: 브라우저 LocalStorage 네임스페이스, Web 서버 메모리의 호출 한도 키. 조건은 다음과 같다.
  - 값은 서버가 검증한 `/api/v1/me` 200 응답에서만 얻는다. 브라우저가 보낸 값은 쓰지 않는다.
  - `externalSubject` 단독이 아니라 `authProvider`와 쌍으로 쓴다.
  - 파생 키 자체를 플랜 소유자 키로 쓰지 않는다. API 내부 identity 매핑은 예외이며 DB 고유 제약으로 관리한다.
  - LocalStorage 네임스페이스는 계정 간 데이터 섞임 방지용일 뿐, 같은 브라우저 사용자에 대한 보안 경계가 아니다.
  - 키 충돌로 계정 데이터가 섞이지 않도록 짧은 비암호 해시 대신 원문 쌍(인코딩)이나 SHA-256 같은 충돌 저항 값을 쓴다.
  - 서버 저장 활성화 시 Web의 플랜 캐시는 내부 userId로 바뀐다. 기존 키는 명시적 가져오기 원본으로 보존한다.

## 2. 엔드포인트

| Method · Path | 호출 주체 | 인증 | 응답 |
|---|---|---|---|
| `GET /oauth2/authorization/google` | 브라우저 top-level 이동 | 불필요 | 302 → Google. 설정 누락 시 302 → 실패 URL `?authError=auth_unavailable` |
| `GET /login/oauth2/code/google` | Google redirect | 불필요 | 성공 302 → `PLANNET_LOGIN_SUCCESS_URL`. 실패 302 → `PLANNET_LOGIN_FAILURE_URL?authError=login_failed` |
| `GET /api/v1/me` | 브라우저 fetch 또는 Web 서버 | 선택 | 200 인증 / 401 미인증 (아래) |
| `GET /api/v1/csrf` | 브라우저 fetch | 불필요 | 200 `{ headerName, token }` |
| `POST /api/v1/logout` | 브라우저 fetch | CSRF 필수 | 204 (본문 없음) |
| `GET /api/v1/health` | 프로브 | 불필요 | 200 `{ "status": "UP" }` |
| 그 외 `/api/v1/**` | — | 필수 | 미인증 401 `{ "authenticated": false }` |
| 그 외 경로 | — | — | 거부(미인증 401, 인증 403) |

### `GET /api/v1/me`

```jsonc
// 200
{
  "authenticated": true,
  "storageEnabled": true,          // false면 기존 로컬 저장 모드
  "user": {
    "userId": "d27c07f4-c94a-4a54-8b35-d43fdc8a2658", // 서버 저장 활성화 시 내부 UUID; 비활성 시 null
    "authProvider": "google",
    "externalSubject": "1098...",   // Google sub. 내부 userId 아님
    "name": "홍길동",                // string | null
    "email": "a@example.com",       // string | null. Google이 미검증으로 표시하면 null
    "image": "https://..."          // string | null
  }
}
// 401
{ "authenticated": false }
```

- 응답에는 `Cache-Control: no-cache, no-store, max-age=0, must-revalidate`가 붙는다. Web도 캐시하지 않는다.
- `storageEnabled`와 `user.userId`는 v1 호환 필드 추가다. 이전 응답처럼 플래그가 없으면 Web은 로컬 모드를 유지한다. 활성화했는데 UUID가 없으면 계약 오류로 처리한다. DB 장애는 503이며 로컬 저장 모드로 조용히 전환하지 않는다.
- 저장 API와 `X-Plannet-User-Id` 계정 전환 방어 규칙은 [planner-storage-v1](./planner-storage-v1.md)을 따른다. 헤더는 세션의 사용자와 일치하는지 검사할 뿐 소유자를 선택하지 않는다.
- `/api/v1/**`의 미인증 응답은 **절대 로그인 HTML로 redirect하지 않는다**(항상 401 JSON). 요청의 `Accept`와 관계없다.

### `GET /api/v1/csrf` → `POST /api/v1/logout`

```ts
const { headerName, token } = await fetch('/api/v1/csrf', { credentials: 'same-origin' }).then(r => r.json());
const res = await fetch('/api/v1/logout', { method: 'POST', headers: { [headerName]: token }, credentials: 'same-origin' });
// res.status === 204
```

- 토큰은 세션에 묶인다. 로그인하면 세션 id가 바뀌므로 **로그인 후나 403 응답 후에는 토큰을 다시 받는다**. 토큰 값은 요청마다 달라질 수 있지만(BREACH 대응 마스킹) 같은 세션 안에서는 모두 유효하다.
- 현재 `headerName`은 `X-CSRF-TOKEN`이다. Web은 이름을 하드코딩하지 말고 응답 값을 쓴다.
- CSRF 누락·불일치: 403 `{ "error": "csrf_invalid" }`. 그 밖의 권한 거부: 403 `{ "error": "forbidden" }`.
- 로그아웃은 멱등이다. 미인증 세션도 유효한 CSRF 토큰과 함께 요청하면 204를 받는다. 성공하면 서버 세션을 무효화하고 세션 쿠키를 만료시킨다.

## 3. 세션 쿠키

| 속성 | 로컬(기본) | prod 프로필 |
|---|---|---|
| 이름 | `PLANNET_SESSION` | `PLANNET_SESSION` |
| Path | `/` (Web 경로에서도 브라우저가 전송) | `/` |
| HttpOnly | 예 (JS에서 읽을 수 없음) | 예 |
| SameSite | `Lax` (Google callback top-level GET에 필요) | `Lax` |
| Secure | 아니오 (`http://localhost`) | 예 |
| Domain | 없음 (host-only) | 없음 |

## 4. Web 서버의 세션 검증 (서버 → API)

Web의 서버 코드(route handler, server component 등)는 브라우저 요청의 `PLANNET_SESSION` 쿠키**만** 골라 내부 API 주소로 전달한다.

```ts
const session = cookies().get('PLANNET_SESSION')?.value;
const res = session
  ? await fetch(`${process.env.API_INTERNAL_URL}/api/v1/me`, {
      headers: { cookie: `PLANNET_SESSION=${session}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    })
  : null;
// res?.status === 200 → 인증. 그 밖(401, 5xx, 네트워크 오류, timeout) → 미인증으로 처리(fail closed)
```

- 내부 주소 예: 로컬 k8s `http://mandalart-api:8080`, 로컬 개별 실행 `http://127.0.0.1:8080`. Host가 달라도 세션 검증에는 영향이 없다.
- 브라우저가 보낸 사용자 ID·헤더를 신뢰하지 않는다. 인증 판단은 `/api/v1/me` 200 응답에만 근거한다.
- **인증 서버 장애 시 fail closed**: API가 응답하지 않거나 5xx면 보호 기능(AI 등)을 거부한다. 캐시된 이전 결과로 허용하지 않는다.

## 5. 로그인 UX 흐름

1. 로그인 버튼: `window.location.href = '/oauth2/authorization/google'` (fetch 불가, top-level 이동).
2. 성공하면 API가 `PLANNET_LOGIN_SUCCESS_URL`(기본 `/`)로 보낸다. Web은 `/api/v1/me`로 상태를 다시 읽는다.
3. 실패하면 `PLANNET_LOGIN_FAILURE_URL?authError=<code>`로 보낸다. `login_failed`는 사용자 거부, state 불일치, Google token/JWK 장애 등이다. `auth_unavailable`은 API에 Google client가 설정되지 않은 경우다. Web은 이 쿼리를 보고 안내 문구를 표시한다.
4. 로그인 후 원래 페이지로 돌아가는 기능(returnTo)은 v1 범위에 없다(open redirect 방지를 위해 보류).

## 6. API 설정 (환경변수)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 없음 | 비밀값. Secret으로만 주입. 없으면 로그인만 `auth_unavailable`(로컬) / 기동 실패(prod) |
| `GOOGLE_REDIRECT_URI` | `{baseUrl}/login/oauth2/code/{registrationId}` | prod 필수. 예: `https://plannet.example.com/login/oauth2/code/google` |
| `PLANNET_LOGIN_SUCCESS_URL` | `/` | 같은 origin이면 상대 경로 |
| `PLANNET_LOGIN_FAILURE_URL` | `/` | `authError` 쿼리가 붙는다 |
| `PLANNET_SESSION_TIMEOUT` | `8h` | 유휴 세션 만료 |
| `PLANNET_SESSION_COOKIE_SECURE` | `false` | 로컬에서 HTTPS 프록시를 쓸 때만 `true`. prod 프로필은 항상 `true` |
| `SPRING_PROFILES_ACTIVE` | 없음 | HTTPS 배포는 `prod` |
| `PLANNET_STORAGE_ENABLED` | `false` / prod `true` | PostgreSQL 저장 활성화. `storage` 프로필도 활성화한다 |
| `PLANNET_DB_URL` / `PLANNET_DB_USERNAME` / `PLANNET_DB_PASSWORD` | 없음 | 저장 활성화 시 필수. API에만 주입하며 DB는 외부에 공개하지 않는다 |
| `PLANNET_TRUSTED_PROXIES` | 없음 | prod 필수. `X-Forwarded-*`를 신뢰할 프록시 IP 정규식. 예: `10\.1\.\d{1,3}\.\d{1,3}` |

로컬 예시 (Ingress `localhost:18080` 뒤):

```bash
GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... ./gradlew :apps:api:bootRun
# Google Console 승인된 redirect URI: http://localhost:18080/login/oauth2/code/google
```

prod 예시 (TLS 종료 Ingress 뒤):

```bash
SPRING_PROFILES_ACTIVE=prod
GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...            # Secret
GOOGLE_REDIRECT_URI=https://plannet.example.com/login/oauth2/code/google
PLANNET_TRUSTED_PROXIES='10\.1\.\d{1,3}\.\d{1,3}'        # Ingress controller pod 대역
```

- 로컬 기본값은 `X-Forwarded-*` 헤더를 무시한다. Ingress가 `Host`를 그대로 전달하면 callback은 `http://localhost:18080/...`로 계산된다.
- prod는 신뢰 프록시에서 온 `X-Forwarded-Proto/Host/Port/For`만 반영한다. 로그인 redirect는 상대 경로(`Location: /`)로 보낸다.
- prod에서 Google client, redirect URI, 신뢰 프록시 중 하나라도 빠지면 기동에 실패한다.
- 저장 활성화 시 PostgreSQL 연결과 Flyway migration도 성공해야 기동한다. DB 실행·백업·홈서버 이전은 [운영 문서](../postgresql-operations.md)를 참고한다.

## 7. 변경 규칙

- 이 계약을 깨는 변경(경로, 필드 이름·타입, 상태 코드, 쿠키 이름)은 `auth-v2`로 새로 작성하고, Web과 동시에 전환한다.
- 필드 추가(예: 내부 `userId`)는 v1 호환 변경으로 허용한다. Web은 모르는 필드를 무시한다.
