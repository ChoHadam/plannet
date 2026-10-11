# infra/deploy/home — 홈 클러스터 배포

`https://plannet.mhd-mhd.duckdns.org` 로 서비스하는 배포 구성이다. 대상은 집 PC 의 Docker Desktop
쿠버네티스(kube context `home`, 노드 `docker-desktop`)이고, 같은 클러스터에서 `land-buddy` 와 `eng50` 이 돌고 있다.

`MyoungHaSong/services` 의 `main` 에 `apps/plannet/**` 변경이 머지되면 모노레포 공용 워크플로 `.github/workflows/deploy.yml` 이
`apps/plannet/deploy.conf` 를 읽어 plannet 만 배포한다(PR 에서는 `deploy.conf` 검사만, 배포 없음).
홈 클러스터는 외부에서 들어갈 수 없어서, 클러스터 안에서 도는 셀프호스티드 러너(`[self-hosted, land]`)가 실행한다
(설치: `apps/land-buddy/deploy/k8s/runner/setup.sh`). 원본 Plannet 저장소의 `main` 머지는 배포하지 않는다.

## production overlay 와 다른 점

이 클러스터에 이미 있는 것을 쓴다. `docs/guides/home-server-migration.md` 가 가정한 Envoy Gateway·외부 DB·레지스트리는 두지 않았다.

| | production (예제) | home (실제) |
|---|---|---|
| 진입점 | Gateway API + Envoy Gateway | 이미 80/443 을 잡고 있는 **ingress-nginx** (`k8s/overlays/home/ingress.yaml`) |
| TLS | 직접 준비한 `plannet-tls` | cert-manager 의 `*.mhd-mhd.duckdns.org` 와일드카드. `land`·`eng50` 과 같은 Secret 을 reflector 가 복제 |
| HTTP→HTTPS | HTTPRoute 301 | ingress-nginx 기본값(`ssl-redirect`) |
| 이미지 | 레지스트리 push | 노드 도커에서 직접 빌드, `imagePullPolicy: Never` |
| API 이미지 | `apps/api/Dockerfile` (미리 만든 jar) | `Dockerfile.api` — 러너에 Java 가 없어 jar 까지 이미지 안에서 빌드 |
| DB | 외부 사설 PostgreSQL | 클러스터 안 StatefulSet + PVC (`k8s/overlays/home/postgres.yaml`) |
| Namespace | overlay 에 포함 | 사람이 1회 적용 (러너에 namespace 권한이 없다) |

라우팅 계약(`/api/v1`·`/oauth2`·`/login/oauth2` → API, 그 외 → Web)과 `storage=true`, 단일 replica,
Secret 참조, Pod Security `restricted` 는 production 과 같다. `k8s/base` 는 바꾸지 않았다.

## 최초 1회

```bash
# 1) namespace · 러너 권한 · 인증서 복제 · DB 자격 증명(자동 생성, 화면에 표시하지 않음)
infra/deploy/home/bootstrap.sh infra

# 2) Google client · AI 키 입력 (값은 stdin 으로만 들어간다)
infra/deploy/home/bootstrap.sh app-secrets
```

Google 의 승인된 리디렉션 URI 는 이미 등록돼 있다 — `https://plannet.mhd-mhd.duckdns.org/login/oauth2/code/google`
(`docs/guides/home-server-migration.md`). 다시 등록하지 않는다.

그다음부터는 services `main` 에 머지만 하면 된다. 수동 배포는 반드시 plannet 만 지정한다(`services` 를 비우면 deploy.conf 가 있는 서비스 전부가 배포된다):

```bash
gh workflow run deploy.yml --repo MyoungHaSong/services -f services=plannet
```

## 데이터 이전·복원

```bash
infra/deploy/home/restore-dump.sh <덤프 파일> <sha256 파일>
kubectl --context home -n plannet rollout restart deploy/plannet-api   # 남은 migration 적용
```

이 클러스터에서는 `kubectl exec`·`kubectl cp` 가 동작하지 않는다
(`Internal error ... http: server gave HTTP response to HTTPS client`). 그래서 덤프를 Secret 으로 넣고
Job 이 `pg_restore` 를 돌린 뒤 Secret 을 지운다. Secret 한계가 1MiB 이므로 더 큰 덤프는 PVC 를 붙인 Job 으로 받아야 한다.

복원은 단일 트랜잭션이고 대상 DB 가 비어 있지 않으면 중단한다. 덤프에는 역할·비밀번호가 들어 있지 않으므로
`bootstrap.sh infra` 가 만든 `plannet_app` 을 그대로 쓴다. 전체 이전 절차(쓰기 정지 → 최종 백업 → 복원 → 대조)는
`docs/guides/home-server-migration.md` 3절이다.

## 알아 둘 것

- **NetworkPolicy 가 강제되지 않는다.** Docker Desktop 쿠버네티스에는 정책을 강제하는 CNI 가 없다.
  매니페스트에는 그대로 두었지만(이식성·기록) 실제 차단은 일어나지 않는다. 즉 같은 클러스터의 다른
  namespace pod 가 `plannet-web`·`plannet-api`·`plannet-db` Service 로 직접 붙을 수 있다.
  Service 는 모두 ClusterIP 라 외부에는 열려 있지 않다.
- **DB 데이터는 이 PVC 안에만 있다.** `hostpath` StorageClass 는 `reclaimPolicy=Delete` 다. PVC 를 지우면
  데이터가 사라진다. 별도 장치 백업은 `docs/postgresql-operations.md` 절차를 따른다.
- **예전 로컬 DB 의 데이터는 2026-10-05 에 옮겼다** (계정 2개·플랜 레코드 40개·커밋 영수증 4개).
  이제 예전 로컬 API 에 쓰기를 하면 양쪽이 갈라진다. 쓰려면 이 주소를 쓴다.
- **외부에서 80 포트가 닫혀 있다.** 공유기가 443 만 넘겨준다 (`land`·`eng` 도 같다). HTTPS 는 정상이지만
  `http://` 로 들어오면 연결이 되지 않는다(redirect 가 아니라 연결 실패). 공유기에서 80 을 열면
  ingress-nginx 가 301 로 넘긴다.
- **세션은 API pod 메모리에 있다.** 배포하면 모두 다시 로그인해야 한다 (`docs/contracts/auth-v1.md` §1).
- ConfigMap 은 내용 해시가 이름에 붙어서, 설정을 바꿀 때마다 이전 이름의 ConfigMap 이 남는다. 참조되지 않으면
  무해하지만 가끔 정리한다.
