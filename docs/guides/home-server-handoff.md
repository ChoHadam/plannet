# Plannet 홈서버 배포 인계서 (Windows 호스트 + Kubernetes)

2026-10-05 · 공개 주소 `https://plannet-lab.duckdns.org` · **아직 배포 가능한 상태가 아님.** 0단계 자료를 받은 뒤 시작한다. 이 절차는 Gateway 컨트롤러·DB·디스크·cert-manager를 설치하지 않는다.

**0. 보내는 사람이 먼저 넘길 것 (사전 준비 중 받고, 최종 전환 전까지 모두 전달)**

| 항목 | 내용 |
|---|---|
| 코드 | [ChoHadam/plannet](https://github.com/ChoHadam/plannet) `feat/web-spring-auth`의 **정확한 커밋 SHA** (최신 Web/infra 변경 push 후. `main`은 구버전) + 비공개 저장소 접근 권한 |
| 이미지 | 서버 CPU에 맞는 `plannet-web`·`plannet-api` 고정 태그(또는 digest) + 레지스트리 pull 권한 |
| DB | 쓰기 중지 후 만든 최종 custom-format dump (암호화/비공개 전달) + 파일 SHA-256 + **원본 4개 테이블 건수·내용 해시**(데이터 대조용) |
| 비밀값 | Google client ID/secret, OpenGateway API 키·endpoint·model — 별도 안전 채널, Git·문서에 기록 금지 |
| Google | callback `https://plannet-lab.duckdns.org/login/oauth2/code/google` **등록·저장 완료(2026-10-05). 다시 등록하지 않음** |

**1. 운영자 환경 확인 (실제 값은 운영자가 결정: context·스토리지·레지스트리·endpoint)**

| 항목 | 기준 / 확인 방법 |
|---|---|
| 노드 | Windows 호스트라도 **Linux 워커 노드 필수**. `kubectl get nodes -L kubernetes.io/os,kubernetes.io/arch`로 OS·arch(이미지와 일치), `kubectl get storageclass` |
| 작업 셸 | WSL2 Ubuntu Bash에서 **같은 클러스터**의 kubectl context 사용 (`kubectl config get-contexts`) |
| 도구 | kubectl, Python 3.9+ + PyYAML, curl, Docker Linux 엔진(`--strict` 스키마 검사), PostgreSQL 18 클라이언트(`pg_restore`). 이미지를 못 받을 때만 JDK 21·Git·rsync·Docker로 `infra/deploy/scripts/build-images.sh` |
| Gateway | Gateway API CRD + **Envoy Gateway** 기존 구성 기준. 외부 IP/LoadBalancer → Windows/WSL → 공유기 80/443 경로가 실제로 연결돼야 함 |
| 네트워크 | NetworkPolicy를 **실제로 강제하는 CNI** |
| DNS·TLS | DuckDNS가 현재 공인 IP를 가리키고 자동 갱신. namespace `plannet`에 신뢰된 인증서 Secret `plannet-tls` + 갱신 수단 |
| DB | PostgreSQL 18.6 별도 구축, **API Pod에서 닿는 private endpoint**, 영구 디스크, superuser 아닌 앱 역할 `plannet_app`. production overlay에 DB 없음, `local-verify`를 운영에 쓰지 않음 |

**2. DB 이전** — 상세 명령: [home-server-migration.md](home-server-migration.md) · [postgresql-operations.md](../postgresql-operations.md)

1. 보내는 쪽: 모든 탭 저장 완료 → 기존 API 쓰기 중지 → 최종 dump. 원본 DB·dump는 이전 완료까지 보존.
2. 받는 쪽: 파일 SHA-256 일치 확인, 디렉터리 700·파일 600, 별도 장치에 사본.
3. `plannet_app` 소유의 **새 빈 DB**(예 `plannet_live_YYYYMMDD`)에 복원: `pg_restore --no-owner --no-privileges --exit-on-error --single-transaction -h <db> -U plannet_app -d <새DB> <dump>`. 기존 DB 덮어쓰기 금지, 실패 시 새 이름.
4. 앱 기동 전 받은 원본 건수·내용 해시와 대조: `plannet_user`·`planner_record`·`planner_commit_receipt`·`flyway_schema_history` 건수 + 계정 UUID·플랜 JSON·삭제 표식·버전·영수증 내용 (V4 migration 전).
5. JDBC는 `jdbc:postgresql://<private-endpoint>:5432/<새DB>`. **localhost 금지**(Pod 자신을 가리킴).

**3. 수정할 설정 (비밀값은 Git에 넣지 않음)**

| 파일 (`infra/deploy/k8s/…`) | 할 일 |
|---|---|
| `overlays/production/kustomization.yaml` | `images`의 `newName`/`newTag`를 받은 레지스트리·고정 태그로 |
| `overlays/production/public/public.env` | host·origin·callback은 이미 맞음(유지). `PLANNET_TRUSTED_PROXIES`를 실제 Envoy 프록시 pod IP 정규식으로 교체 |
| `base/web.env` | `OPENGATEWAY_BASE_URL`·`OPENGATEWAY_MODEL`을 받은 값으로 |
| 비공개 레지스트리 | `imagePullSecrets`는 운영자가 직접 구성 (매니페스트에 없음) |

**4. 적용 (WSL Bash, 저장소 루트)** — API·Web 각 1개, `Recreate` 전략이라 재배포 시 짧게 중단

```bash
CTX='<실제 context>'; D=infra/deploy
$D/scripts/create-secrets.sh --context "$CTX" --apply   # Google·AI 키·DB URL/USER/PW 비표시 입력
#   TLS를 직접 넣을 때만: … --tls-cert <fullchain.pem> --tls-key <privkey.pem>
$D/scripts/validate-manifests.sh --strict production
kubectl --context "$CTX" apply -k "$D/k8s/overlays/production"
kubectl --context "$CTX" -n plannet rollout status deployment/plannet-api
kubectl --context "$CTX" -n plannet rollout status deployment/plannet-web
$D/scripts/check-public.sh https://plannet-lab.duckdns.org
```

**5. 완료 기준**

| 검사 | 기대 결과 |
|---|---|
| HTTPS·로그인 | 유효 인증서, Google 로그인·로그아웃 정상 |
| 계정·데이터 | 기존 두 계정 각자 플랜만 보임(격리). 저장 → 새로고침 → API 재시작 후에도 유지 |
| DB·AI | Flyway V1~V4 성공, 실제 AI 요청 성공 |
| 백업 | 실제 운영 DB명으로 백업 → 다른 새 DB에 복원 확인, 매일 및 migration 직전 백업, 호스트 밖 사본 보관 |

비공개 저장소 ≠ 비공개 서비스. 접속 제한은 별도 과제.

**6. 복귀 · 회신**

| 시점 | 방법 |
|---|---|
| 홈서버에 수정 생기기 전 | 기존 API 쓰기 재개 (원본 DB 그대로) |
| 홈서버에 수정 생긴 뒤 | 양쪽 쓰기 중지 → **새 DB부터 백업**. 옛 DB만 재개하면 새 수정 유실 |

**운영자 회신:** 공개 URL · 배포한 커밋 SHA/이미지 태그 · DB 백업 위치(운영 DB명 포함) · 5단계 검사 결과
