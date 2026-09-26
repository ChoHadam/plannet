# infra/deploy

Plannet Web(Next.js)과 API(Spring)를 **하나의 HTTPS origin** 뒤에 두는 배포 예제와 로컬 검증 환경이다. 비밀값은 들어 있지 않다. 절차·설정값·복구는 [docs/deployment-readiness.md](../../docs/deployment-readiness.md)를 본다.

| 경로 | 내용 |
|---|---|
| `k8s/base` | Web/API Deployment(각 1 replica, Recreate)·ClusterIP Service·ConfigMap(`web.env`, `api.env`)·Gateway/HTTPRoute·NetworkPolicy |
| `k8s/components/public-host` | `public.env`의 `PUBLIC_HOST`를 Gateway·HTTPRoute host에 채운다 |
| `k8s/overlays/production` | 공개 배포 예제. PostgreSQL 저장 필수, `public/public.env`·이미지 태그·DB Secret을 준비한다 |
| `k8s/overlays/local-verify` | 인증/HTTPS 검증 전용. storage=false, 실제 이미지 + Google OIDC·AI 대역(`mocks/mock-external.mjs`) |
| `verify/` | 검증용 kind 설정, Playwright E2E(`verify/e2e`) |
| `scripts/` | 스냅샷·이미지 빌드·매니페스트 검증·로컬 검증·Secret 주입·공개 점검 |

```bash
infra/deploy/scripts/validate-manifests.sh             # 렌더 + 정책 + 스키마 검사 (클러스터 불필요)
infra/deploy/scripts/verify-local.sh                   # 빌드 → kind(plannet-verify) 배포 → E2E
infra/deploy/scripts/verify-down.sh                    # 검증 클러스터 삭제
infra/deploy/scripts/check-public.sh https://<domain>  # 실제 공개 origin 점검 (배포 후)
```

격리 규칙: 작업·산출물은 `$TMPDIR/plannet-deploy`(`PLANNET_WORK_DIR`로 변경), 검증 클러스터는 전용 kubeconfig를 쓴다(기본 kube context 불변). 호스트 포트는 `127.0.0.1:19643`(HTTPS)·`19680`(HTTP)이다. 원본 저장소의 `.next`·`build`·Gradle daemon은 재사용하지 않는다.

공개 API는 `PLANNET_STORAGE_ENABLED=true`와 Secret `plannet-api-secret`의 `PLANNET_DB_URL`, `PLANNET_DB_USERNAME`, `PLANNET_DB_PASSWORD`를 필수로 요구한다. `create-secrets.sh`가 이 세 값을 Google 자격 증명과 함께 화면에 표시하지 않고 입력받아 stdin으로 주입한다. 이 예제에는 DB Deployment/Service가 포함되지 않는다. 배포할 때 API Pod가 접근할 수 있는 private PostgreSQL 주소, DB 측 방화벽, 영구 저장 및 별도 장치 백업을 확정한다.

Pod의 `127.0.0.1`은 해당 Pod 자신이다. 호스트용 PostgreSQL Compose의 `127.0.0.1:15432` URL을 운영 Secret에 그대로 복사하지 않는다. 로컬 DB 및 홈서버 이전은 [PostgreSQL 운영 문서](../../docs/postgresql-operations.md)를 따른다. `local-verify`는 DB Secret 참조를 제거하고 storage=false를 명시하므로 서버 저장·migration·DB 영속성 검증을 포함하지 않는다.
