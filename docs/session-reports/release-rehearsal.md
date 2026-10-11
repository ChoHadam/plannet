# HTTPS·PostgreSQL 배포 리허설

2026-09-27 · 구현 기준 `3e08caa` + 미커밋 리허설 변경. **로컬 자체 서명 HTTPS + production Web·Spring + 실제 PostgreSQL/PVC 결합에서 브라우저 테스트 17개가 첫 전체 실행에 모두 통과했다.** Google·AI는 대역(mock)이며, 실제 홈서버·공인 TLS·실제 Google/AI 검증은 아니다.

## 범위와 결과

| 대상 | 이번 변경·확인 | 상태 |
|---|---|---|
| 실행 구조 | 자체 서명 HTTPS → Envoy Gateway → production Web·Spring → PostgreSQL 18.6/PVC. Google OIDC·AI만 대역 | **실행 검증 통과** |
| 이미지 | `plannet-api:verify` `sha256:ffc2c709…e838`, `plannet-web:verify` `sha256:0cdd1dd3…f80b` (arm64, `3e08caa` 스냅샷). kind 노드의 이미지 ID가 `images.txt`와 일치 | 재빌드 없음 |
| 배포·DB 기동 | Docker Desktop 재시작 후 `verify-local.sh` EXIT=0. 앱 역할 super·createrole·createdb·replication·bypassrls 모두 `f`, DB·Flyway 이력 소유자 `plannet_app`, migration `1,2`·실패 0, 자격 증명 로그 검사 PASS | 통과 |
| 스키마 | Docker 복구 후 production 15개·local-verify 27개 모두 kubeconform Valid, Invalid·Errors·Skipped 0 | 통과. production 예제 placeholder는 정책 경고이며 실제 배포 전 채워야 함 |
| 정책 검사 | 실제 overlay 변형 회귀 4개: local 36개·production 11개 위반 사례 거부 | 통과 |
| 정리 스크립트 | 조회 실패·시간 초과·삭제 미확인 시 DB 비밀번호 보존, 삭제 확인 시 해당 파일만 제거 | 모의 회귀 4개 통과 |
| 브라우저 테스트 | 기존 진입점 9 + 흐름 3 + 서버 저장 5 = 17개 | **17 passed / 0 failed / 0 flaky, 1.7분, 재실행 없음** |
| 비밀 노출 | 산출물·E2E 로그에서 생성 DB 비밀번호 2개 미검출(값은 스크립트 안에서만 비교) | PASS. 가짜 대역 값은 저장소에 커밋된 리터럴로 렌더 YAML에만 존재 |
| 실제 서비스 공개 | 공인 TLS·실제 Google/AI·홈서버 이전 | **범위 밖, 미완료** |

## 서버 저장 시나리오 (storage.spec.ts)

| 시나리오 | 확인 내용 | 결과 |
|---|---|---|
| DB 접근 제한·역할 | 유지보수 label pod에서 TCP 연결 성공(대조군). 같은 namespace 미허용 label·대역 namespace·Web pod는 차단(이름 해석 실패 아님). SQL로 앱 역할 비superuser, `postgres` DB 접속·역할 생성 거부, API의 실제 연결 역할이 `plannet_app`(superuser 아님) | 통과 (19.5s) |
| 기기 간 복원·계정 격리 | Daily UI 수정 → PostgreSQL 저장 → 독립 브라우저(같은 계정)에서 전체 플랜 검색으로 복원. 두 번째 계정은 조회 불가, 이전 계정 헤더 조회·생성·삭제 409 `account_changed`, CSRF 없는 쓰기 403, 소유자 기록 불변 | 통과 (3.3s) |
| 동시 수정 충돌 | 서버 승자 기록 그대로 보존, 패자는 `conflict` 상태·초안 파일 다운로드, "초안 보관 후 서버 내용 불러오기"로 승자 표시·초안 localStorage 보관, 서버 버전 불변 | 통과 (3.4s) |
| 저장 응답 유실 | 서버 커밋 후 응답만 차단(2회). 재시도 버튼·새로고침이 같은 requestId 3회 전송, 기록 1개·버전은 첫 응답과 동일 | 통과 (3.5s) |
| DB 중단·재시작, API 재시작 | DB StatefulSet 0 → 수정 시 오류·미저장 초안 표시·파일 저장, 조회 5xx → DB 1 → 재시도 저장. PVC UID 동일·DB pod 새로 생성(정상 종료 후 재기동 로그). API 0→1 후 기존 쿠키 401, 재로그인 시 같은 사용자 ID·기록 유지. `finally`에서 항상 DB·API replica 1 복구 | 통과 (22.7s) |

테스트 종료 후 DB·API·Web 모두 replica 1 Ready, PVC `data-plannet-db-0` 동일 볼륨 Bound, 일회용 probe pod 잔존 0을 확인했다.

## 실행 경과

1. 첫 배포 시도에서 PostgreSQL 이미지를 kind에 적재하던 중 Docker Desktop VM이 멈췄다(`virtio_net ... transmit queue 0 timed out`). 총괄이 이 작업의 멈춘 프로세스만 종료했고, Docker 재시작은 사용자가 결정·수행했다.
2. 재시작 후 인프라 세션이 `SKIP_BUILD=1 SKIP_TESTS=1 verify-local.sh`로 배포·DB 확인을 마치고 준비 완료를 넘겼다(로그 `/private/tmp/plannet-release-deploy-resumed.log`).
3. 브라우저 세션이 전체 17개를 한 번 실행했다. 실패가 없어 수정·재실행은 하지 않았다. 과거 HTTPS(storage=false) 12개 결과나 HTTP 저장 통합 6개와 합산하지 않는다.

```bash
PLANNET_WORK_DIR=/private/tmp/plannet-release-rehearsal-20260927 \
  SKIP_BUILD=1 SKIP_TESTS=1 infra/deploy/scripts/verify-local.sh

VERIFY_KUBECONFIG=/private/tmp/plannet-release-rehearsal-20260927/kubeconfig \
  VERIFY_ARTIFACTS_DIR=/private/tmp/plannet-release-rehearsal-20260927/artifacts/e2e \
  node_modules/.bin/playwright test --config infra/deploy/verify/e2e/playwright.config.ts
```

- E2E 콘솔: `/private/tmp/plannet-release-e2e.log` · 결과: `artifacts/e2e/results.json`(expected 17, unexpected 0), `artifacts/e2e/report/`. 실패 시 trace·스크린샷은 `artifacts/e2e/test-results/`에 남긴다(이번 실행은 실패 없음).
- 테스트 후 클러스터 근거: `artifacts/cluster/` (리소스·이벤트·Web/API/DB/대역 로그, `running-image-ids.txt`). 로그는 재시작 후 현재 pod 기준이다.
- 이미지·소스: `artifacts/images.txt`, `artifacts/source-snapshot.txt` (`artifacts/` = `/private/tmp/plannet-release-rehearsal-20260927/artifacts`)
- 최종 스키마: `artifacts/final-schema/` (인프라 세션의 기본 `$TMPDIR/plannet-deploy/artifacts`에 있던 production·local-verify 결과를 총괄이 대조 후 모음)
- 작업 인계·세션 보고: `/private/tmp/plannet-opus-20260927/`

## 한계·남은 일

- **모의 검증이다:** 자체 서명 인증서, `plannet.test`·`mock.test`의 로컬 해석, Google OIDC·AI 대역. 공인 인증서·DNS·공유기·실제 Google callback·실제 AI 요청/예산은 확인하지 않았다.
- 단일 노드 kind(local-path PVC)이다. 홈서버 디스크·백업 위치·DB 복원·운영 Secret은 이전 시점에 검증한다.
- NetworkPolicy는 kind의 kindnetd에서 강제됨을 확인했다. 홈서버 CNI에서 다시 확인해야 한다.
- 기존 실제 HTTP 서버 저장 검증은 [저장 통합 보고](./storage-integration.md)에 보존한다.

커밋·push·공개 배포는 이번 추가 작업에서 수행하지 않았다.
