# infra/deploy

Plannet Web(Next.js)과 API(Spring)를 **하나의 HTTPS origin** 뒤에 두는 배포 예제와 로컬 검증 환경이다. 비밀값은 들어 있지 않다. 절차·설정값·복구는 [docs/deployment-readiness.md](../../docs/deployment-readiness.md)를 본다.

| 경로 | 내용 |
|---|---|
| `k8s/base` | Web/API Deployment(각 1 replica, Recreate)·ClusterIP Service·ConfigMap(`web.env`, `api.env`)·Gateway/HTTPRoute·NetworkPolicy |
| `k8s/components/public-host` | `public.env`의 `PUBLIC_HOST`를 Gateway·HTTPRoute host에 채운다 |
| `k8s/overlays/production` | 공개 배포 예제. PostgreSQL 저장 필수, `public/public.env`·이미지 태그·DB Secret을 준비한다 |
| `k8s/overlays/home` | 실제 홈 클러스터 배포(`plannet.mhd-mhd.duckdns.org`). ingress-nginx·와일드카드 TLS·클러스터 안 DB 를 쓴다 — [home/README.md](home/README.md) |
| `k8s/overlays/local-verify` | HTTPS·인증·서버 저장 리허설 전용. storage=true, 실제 이미지 + 검증 전용 PostgreSQL(`postgres.yaml`) + Google OIDC·AI 대역(`mocks/mock-external.mjs`) |
| `verify/` | 검증용 kind 설정, Playwright E2E(`verify/e2e`) |
| `scripts/` | 스냅샷·이미지 빌드·매니페스트 검증·로컬 검증·Secret 주입·공개 점검 |
| `home/` | 홈 클러스터 전용: 최초 준비 스크립트·러너 권한·API 빌드 Dockerfile |

```bash
infra/deploy/scripts/validate-manifests.sh             # 회귀 테스트 + 렌더 + 정책 + 스키마 검사 (클러스터 불필요)
python3 -B infra/deploy/scripts/test_validate_manifests.py  # 정책 검사기 부정 회귀 테스트만
python3 -B infra/deploy/scripts/test_verify_down.py        # verify-down 자격 증명 정리 회귀 테스트 (가짜 kind, Docker 불필요)
infra/deploy/scripts/verify-local.sh                   # 빌드 → kind(plannet-verify) 배포 → E2E
infra/deploy/scripts/verify-down.sh                    # 검증 클러스터(+PVC) 삭제, 검증 DB 자격 증명 파일 삭제
infra/deploy/scripts/check-public.sh https://<domain>  # 실제 공개 origin 점검 (배포 후)
```

격리 규칙: 작업·산출물은 `$TMPDIR/plannet-deploy`(`PLANNET_WORK_DIR`로 변경), 검증 클러스터는 전용 kubeconfig를 쓴다(기본 kube context 불변). 호스트 포트는 `127.0.0.1:19643`(HTTPS)·`19680`(HTTP)이다. 원본 저장소의 `.next`·`build`·Gradle daemon은 재사용하지 않는다.

`source-snapshot.txt`는 기준 커밋과 미커밋 파일 목록, `source-sha256.json`은 복사한 소스별 SHA-256을 기록한다. `images.txt`와 함께 보존해 검증에 사용한 소스와 이미지를 추적한다. 배포 후에는 현재 소스의 Flyway migration 목록과 실제 DB의 성공 이력이 정확히 일치해야 한다. 이전 이미지의 migration 일부만 적용된 상태는 통과하지 않는다.

공개 API는 `PLANNET_STORAGE_ENABLED=true`와 Secret `plannet-api-secret`의 `PLANNET_DB_URL`, `PLANNET_DB_USERNAME`, `PLANNET_DB_PASSWORD`를 필수로 요구한다. `create-secrets.sh`가 이 세 값을 Google 자격 증명과 함께 화면에 표시하지 않고 입력받아 stdin으로 주입한다. 이 예제에는 DB Deployment/Service가 포함되지 않는다. 배포할 때 API Pod가 접근할 수 있는 private PostgreSQL 주소, DB 측 방화벽, 영구 저장 및 별도 장치 백업을 확정한다.

Pod의 `127.0.0.1`은 해당 Pod 자신이다. 호스트용 PostgreSQL Compose의 `127.0.0.1:15432` URL을 운영 Secret에 그대로 복사하지 않는다. 로컬 DB 및 홈서버 이전은 [PostgreSQL 운영 문서](../../docs/postgresql-operations.md)를 따른다.

## local-verify 저장 리허설 (storage=true)

`local-verify`는 운영과 같은 storage=true·DB Secret 계약(`plannet-api-secret`의 필수 `secretKeyRef` 세 개)을 쓰고, 검증 클러스터 안에 일회용 PostgreSQL을 둔다. 운영 overlay에는 이 DB 리소스가 들어가지 않는다 (정책 검사로 막음).

- **DB**: `postgres:18.6-bookworm` StatefulSet 1 replica, UID/GID 999·non-root, 루트 파일시스템 읽기 전용. PVC `data-plannet-db-0`(1Gi, kind local-path)를 `/var/lib/postgresql`에 붙이고 `PGDATA=/var/lib/postgresql/18/docker`로 둔다 (PG18 이미지 구조).
- **초기화**: 빈 PVC에서만 `postgres-init.sh`가 한 번 실행된다(ConfigMap `defaultMode: 0555`, entrypoint가 source하지 않고 실행). `plannet_app` 역할을 NOSUPERUSER·NOCREATEDB·NOCREATEROLE·NOREPLICATION·NOBYPASSRLS로 만들고 `plannet` DB 소유자로 둔다. PUBLIC의 `postgres`/`template1` 접속 권한과 `public` 스키마 CREATE는 회수한다. 관리자(`postgres`)는 API가 쓰지 않는다.
- **readiness**: `pg_isready -h 127.0.0.1`. 초기화 중 임시 서버는 Unix socket만 열기 때문에 최종 TCP 서버가 뜨기 전에는 Ready가 되지 않는다.
- **접근 제한**: ClusterIP Service `plannet-db:5432`. NetworkPolicy `plannet-db-ingress`는 같은 namespace의 `app.kubernetes.io/name` = `plannet-api` / `plannet-db-maintenance` pod만 5432로 허용한다 (namespace 전체 `default-deny-ingress` 위에 추가). NetworkPolicy는 CNI가 강제할 때만 효과가 있으므로 E2E에서 실제 차단을 확인한다.
- **자격 증명**: `verify-secrets.py`가 `$PLANNET_WORK_DIR/db-secrets/{admin,app}.password`(디렉터리 0700, 파일 0600, 64자 hex)를 처음 한 번 만들고 `plannet-db-secret`·`plannet-api-secret`을 stdin + server-side apply로 적용한다 (값이 프로세스 인자·`last-applied-configuration` annotation·출력에 남지 않음). kube context가 정확히 `kind-plannet-verify`가 아니면 거부한다. 클러스터에 Secret이 있는데 파일이 없으면 기존 PVC와 비밀번호가 어긋나므로 새로 만들지 않고 실패한다.
- **배포 후 확인** (`verify-local.sh`의 `verify_bootstrap`): PVC Bound, API pod `PLANNET_STORAGE_ENABLED=true`, `plannet_app` 권한 플래그 전부 false, `plannet` DB·`flyway_schema_history` 소유자 `plannet_app`, 성공한 migration `1,2…`와 실패 0건. 진입점은 `-k` 없이 생성한 인증서(`$PLANNET_WORK_DIR/tls/tls.crt`)로 `https://plannet.test:19643/api/v1/health`와 `https://mock.test:19643/healthz`를 확인한다. 산출물 로그(`artifacts/cluster/logs-plannet-db.txt` 포함)에 DB 비밀번호·대역 비밀값이 없는지 검사한다.
- **보존/정리**: pod 재시작·StatefulSet 축소/삭제에도 PVC는 남는다(`persistentVolumeClaimRetentionPolicy: Retain`). 같은 클러스터로 다시 `verify-local.sh`를 돌리면 기존 PVC와 자격 증명 파일을 그대로 쓴다. `verify-down.sh`(또는 `VERIFY_TEARDOWN=1`)는 클러스터와 함께 PVC를 지우고, 성공한 `kind get clusters` 조회로 클러스터가 없음을 다시 확인한 뒤에만 짝을 잃은 `db-secrets/{admin,app}.password`를 지운다. 조회가 실패하거나 시간 초과(`KIND_QUERY_TIMEOUT`, 기본 30초)되면 Docker 응답이 없어도 클러스터·PVC가 남아 있을 수 있으므로 아무것도 지우지 않고 실패한다. 데이터를 처음부터 다시 만들려면 클러스터를 지우고 다시 만든다. 클러스터를 둔 채 자격 증명 파일만 지우지 않는다.
- **스키마 검사**: `--strict`는 kubeconform(Docker) 스키마 검사를 필수로 한다. Docker가 15초 안에 응답하지 않으면 실패한다 (`SKIP_SCHEMA=1`로 명시적으로만 생략).
