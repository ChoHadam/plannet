# deploy-hardening 세션 보고

```text
[deploy-hardening] 비밀 파일 컨텍스트 제외·API non-root·Next 기본 보안 헤더를 구현하고 격리 사본/이미지/포트에서 검증 완료. PNG 내보내기 실패는 이번 변경 이전부터 있던 별도 문제(아래 미완료)
상태: 완료
```

- 작성: 2026-09-26. 시작 시점 브랜치 `feat/web-spring-auth`, HEAD `031e124`. 다른 세션의 미커밋 변경은 건드리지 않았다.
- 적용 파일은 **원본 작업 트리에 반영됨**(미커밋). 검증은 이 세션 scratchpad의 작업 트리 사본(`git ls-files -co --exclude-standard` 대상 + 가짜 표식 파일)에서 2026-09-26 21:0x 에 수행했다.

## 변경

| 파일 | 핵심 동작 |
|---|---|
| `.dockerignore` | `**/` 패턴으로 중첩 경로까지 제외: `**/.env`·`**/.env.*`(`.env.example`만 허용), `k8s/local/`, `**/*secret*.yaml(yml)`, `**/*.pem`·`*.key`·`*.p12`·`*.jks`, `**/.local-backup`(기존엔 **루트 `.local-backup/`가 컨텍스트에 포함**됐음), `docs/session-reports/`, `**/test-results`·`playwright-report`·`blob-report`·`*.log`, `**/.next`·`build`·`.gradle`·`.kotlin`·`*.tsbuildinfo`, `.claude/`·IDE 설정. 기존 항목(`*.md`, `.git`, `Dockerfile` 등) 유지 |
| `apps/api/.dockerignore` (신규) | allowlist: 컨텍스트에 `build/libs/api-0.1.0-SNAPSHOT.jar`만 보낸다 (소스·설정·Gradle 산출물·`.env` 제외) |
| `apps/api/Dockerfile` | 시스템 사용자 `plannet`(UID/GID 10001, `infra/deploy/k8s/base/api.yaml`의 runAsUser/runAsGroup과 동일) 생성, `USER 10001:10001`(숫자 → k8s `runAsNonRoot` 검증 가능). 베이스 이미지·jar COPY 경로·포트 8080·ENTRYPOINT·환경변수 계약은 그대로. multi-stage/베이스 업그레이드 없음 |
| `apps/web/next.config.ts` | `poweredByHeader: false`. `headers()`로 모든 경로에 `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Content-Security-Policy: frame-ancestors 'none'`(스크립트 정책 없음), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()`. **HSTS는 넣지 않음**(HTTPS 판단은 Gateway 책임). Gateway는 같은 헤더를 `set`하므로 값이 겹쳐도 충돌 없음. `output: standalone`, `NEXT_DIST_DIR`, `NEXT_TSCONFIG_PATH`, `/api/backup` 추적 제외 보존 |
| `scripts/deploy-hardening/verify.sh` (신규) | 사본 생성 → 가짜 표식 19개 심기 → probe 이미지로 실제 빌드 컨텍스트 목록 검사(제외/유지) → 사본에서 bootJar → API·Web 이미지 빌드(Web은 builder 단계도) → 표식 문자열·비밀 후보 파일 이미지 스캔 → API 기본 UID·health·`/api/v1/me` 401, k8s 동일 제약(read-only rootfs, `/tmp` tmpfs, cap-drop ALL, no-new-privileges) 기동 → Web 헤더 검사 |
| `scripts/deploy-hardening/browser-check.mjs` (신규) | Playwright headless: 데스크톱 플랜 생성·PNG 내보내기, 모바일 첫 화면, 다른 origin iframe 삽입 차단 |

## 검증

- `HARDENING_WORK_DIR=<scratchpad>/hardening scripts/deploy-hardening/verify.sh` → **90 passed, 0 failed**
  - 컨텍스트: 표식 19개 전부 제외, 필수 입력 9개(package/lockfile, `apps/web/.env.example`, src, public, 설정) 유지, node_modules 없음. API 컨텍스트 = jar 1개
  - 이미지: `plannet-hardening-web:verify`, 그 builder 단계, `plannet-hardening-api:verify` 모두 표식/비밀 후보 없음 (베이스 이미지 CA 번들 `/etc/ssl*`은 검사 대상에서 제외)
  - API: `Config.User=10001:10001`, `id` → uid=10001(plannet), PID 1 uid 10001, health 200, `/api/v1/me` 401, 제한 모드 health 200
  - Web(3510): `/`, `/favicon.ico`, `/next.svg`, `/_next/static/chunks/*.js`, `/api/runtime-config` 모두 200 + 5개 헤더 존재, `X-Powered-By`·HSTS 없음. static chunk `immutable` 캐시·SVG content-type 유지. 실행 UID 1001
- 회귀 대조(변경 전 규칙): 같은 사본에 HEAD의 `.dockerignore`를 넣으면 `k8s/local/secret.local.yaml`, `k8s/local/configmap.yaml`, `.local-backup/`, `apps/web/.local-backup/`, `apps/web/e2e/.env.test`, `certs/*.pem|key`, `docs/session-reports/*`, `apps/api/build/**`가 컨텍스트에 포함됨을 확인. 기존 `plannet-api:verify` 이미지는 `uid=0(root)`.
- `node scripts/deploy-hardening/browser-check.mjs` (3510, 새 이미지) → 5 passed, 2 failed (PNG 관련 2건, 아래 미완료)
  - 통과: 데스크톱·모바일(390×844) 로드·오류 없음, 문서 응답에 X-Powered-By 없음, localhost:3512에서 127.0.0.1:3510 iframe 삽입 시 앱 내용이 렌더되지 않음
  - 기존 이미지(`plannet-web:verify`, 헤더 없음, 3513) 대조: iframe 안에 앱이 렌더되고(차단 테스트가 의미 있음), PNG 실패는 **동일하게 발생**
- `npx eslint next.config.ts` 0 error. 타입 검사는 Docker 안 `next build`(사본)에서 통과.
- 브라우저 도구: Claude in Chrome으로 3510을 열어 화면 확인했으나 PNG 저장 시 앱의 `alert()`로 탭이 멈춰 닫았다. 이후 Playwright(dialog 처리)로 대체.

## 미완료 / 발견

1. **PNG 내보내기 실패 (기존 문제, 이번 변경과 무관)**: 이미지 저장 → `이미지 생성 중 오류가 발생했습니다.` alert. 헤더 없는 기존 이미지에서도 동일. 추정 원인: Tailwind v4 CSS가 `lab()` 색상 함수를 69회 사용하고(`.next/static/chunks/*.css`), `html2canvas@1.4.1`은 `lab()/oklch()` 파싱을 지원하지 않는다(`export.ts`가 예외를 삼켜 메시지만 표시). export 파일은 이번 3세션 범위 밖이라 수정하지 않았다 → JSON/PNG 인수인계 항목으로 총괄 세션에 넘긴다.
2. OAuth redirect는 전체 페이지 이동(`/oauth2/authorization/google`, Gateway가 API로 라우팅)이라 Next 헤더가 개입하지 않는다. 이번 변경은 Next 응답에만 적용되며 `Referrer-Policy`는 cross-origin에 origin만 보낸다. 실제 Google 흐름·Gateway 결합은 배포 검증 클러스터 재사용 금지 규칙에 따라 **실행하지 않았다**.
3. 남은 이미지: `plannet-hardening-web:verify`, `plannet-hardening-api:verify`(이 세션 전용, 필요 없으면 `docker rmi`). 컨테이너는 모두 제거했다.

## 조율

- 공유 계약 변경 없음. `infra/deploy/**`, API 인증 코드 수정 없음.
- `build-images.sh`와 호환: API 컨텍스트(`apps/api`)·jar 경로 동일, Web 루트 컨텍스트 동일. 스냅샷 빌드 결과는 달라지지 않는다(gitignore 대상 대부분이 원래 스냅샷에서 빠짐).
- B(ai-response-safety, `mandalart-b5`): 착수 알림 전송 성공, 응답 받음 — "coordinator 아님, next.config 변경과 충돌 없음".
- C(plan-library, `mandalart-f3`): 상대가 먼저 범위를 알려 옴. 파일·포트 겹침 없음(회신 불필요 요청).
  - C 완료 보고(C 세션의 실행 결과이며 이 세션이 직접 돌린 것은 아님): 21:15 KST 공유 작업 트리 E2E 빌드에 이 세션의 `next.config.ts`가 포함됐고 15/15 통과(기존 `templates.spec.ts` 포함). 새 헤더가 같은 origin의 iframe 삽입도 막는다고 알려 옴 → 의도된 동작으로 회신(DENY·`frame-ancestors 'none'`은 Gateway의 기존 `X-Frame-Options: DENY`와 같다. `apps/web/src`·`e2e`에 iframe/프레임 메시징 사용 없음을 grep으로 확인).

## 문서 (총괄 세션 반영 제안)

- `docs/deployment-readiness.md` "발견한 문제" 표 1~3행: 해결됨으로 갱신. 1행 수정 내용에 "루트 `.local-backup/`도 포함되던 문제" 추가. 2행은 "USER 10001 추가(완료), multi-stage·digest 고정은 미적용"으로 분리.
- `docs/roadmap-status.md` 배포 행/0단계: "`.dockerignore` 보완" 완료 처리.
- `infra/deploy/k8s/base/api.yaml` 주석 `eclipse-temurin 이미지는 root가 기본이라 …` → "이미지 기본 사용자(10001)와 동일" 정도로 배포 담당이 갱신 (파일은 읽기 전용이라 수정 안 함).
- `infra/deploy/k8s/base/gateway.yaml` 주석 "Next.js는 보안 헤더를 붙이지 않는다"는 이제 사실이 아님 → Gateway 헤더는 유지(HSTS 담당, 중복은 `set`으로 무해)하되 주석만 갱신 제안.
- 템플릿 문서 변경 없음. Mandalart 문서의 이미지 저장 설명은 1번 문제가 해결될 때 함께 확인.

## 전달

- 로드맵 총괄 세션: ListAgents에 식별 참고값과 대응하는 세션이 없고 B 세션도 같은 결과를 보고함 → **직접 전송하지 못했다**. 이 파일로 보고한다.
- `mandalart-3f` 전송 시도는 "reachable 아님"으로 실패(해당 세션 없음).
