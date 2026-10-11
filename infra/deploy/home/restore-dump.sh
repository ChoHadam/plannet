#!/usr/bin/env bash
# PostgreSQL custom-format 덤프를 홈 클러스터의 plannet DB 에 복원한다.
#
#   infra/deploy/home/restore-dump.sh <덤프 파일> [<sha256 파일>]
#
# 왜 이런 방식인가: 이 클러스터(Docker Desktop)에서는 `kubectl exec`/`cp` 가 동작하지 않는다
#   (Internal error ... http: server gave HTTP response to HTTPS client).
#   그래서 덤프를 Secret 으로 넣고 Job 이 pg_restore 를 돌린 뒤 Secret 을 지운다.
#   Secret 은 1MiB 가 한계다. 더 큰 덤프는 PVC 를 붙인 Job 으로 받아야 한다.
#
# 복원은 단일 트랜잭션이다. 하나라도 실패하면 전체가 취소된다 (반쯤 복원된 상태를 만들지 않는다).
# 대상 DB 가 비어 있지 않으면 중단한다. 이전 절차는 docs/guides/home-server-migration.md 3절.
set -euo pipefail

CONTEXT="${PLANNET_CONTEXT:-home}"
NS=plannet
DUMP="${1:-}"
SUM="${2:-}"
SECRET=plannet-db-restore-dump
JOB=plannet-db-restore

log() { printf '==> %s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
k() { kubectl --context "$CONTEXT" "$@"; }

[[ -f "$DUMP" ]] || fail "사용법: $0 <덤프 파일> [<sha256 파일>]"
command -v kubectl >/dev/null || fail "kubectl 이 필요합니다"

if [[ -n "$SUM" ]]; then
  log "체크섬 대조"
  want="$(awk '{print $1}' "$SUM")"
  got="$(if command -v sha256sum >/dev/null; then sha256sum "$DUMP"; else shasum -a 256 "$DUMP"; fi | awk '{print $1}')"
  [[ "$want" == "$got" ]] || fail "체크섬이 다릅니다 (기대 $want, 실제 $got)"
  log "  일치"
else
  log "경고: sha256 파일을 주지 않았습니다 — 전송 중 손상을 확인하지 않습니다"
fi

size="$(wc -c < "$DUMP" | tr -d ' ')"
[[ "$size" -lt 1000000 ]] || fail "덤프가 1MB 를 넘습니다($size B). Secret 으로 넣을 수 없습니다 — 스크립트 주석 참고"

log "덤프를 Secret 으로 넣기 ($size B)"
k -n "$NS" create secret generic "$SECRET" --from-file=plannet.dump="$DUMP" --dry-run=client -o yaml \
  | k apply --server-side --force-conflicts --field-manager=plannet-restore -f - >/dev/null

# 끝나든 실패하든 사용자 데이터가 Secret 으로 남지 않게 한다.
cleanup() { k -n "$NS" delete secret "$SECRET" --ignore-not-found >/dev/null 2>&1 || true; }
trap cleanup EXIT

log "복원 Job 실행"
k -n "$NS" delete job "$JOB" --ignore-not-found >/dev/null
k apply -f - >/dev/null <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: $JOB
  namespace: $NS
spec:
  backoffLimit: 0
  template:
    metadata:
      labels:
        app.kubernetes.io/name: plannet-db-maintenance   # DB NetworkPolicy 가 허용하는 라벨
    spec:
      restartPolicy: Never
      automountServiceAccountToken: false
      securityContext:
        runAsNonRoot: true
        runAsUser: 999
        runAsGroup: 999
        seccompProfile: { type: RuntimeDefault }
      containers:
        - name: psql
          image: postgres:18.6-bookworm
          command: ["bash", "-eo", "pipefail", "-c"]
          args:
            - |
              tables=\$(psql -Atc "select count(*) from information_schema.tables where table_schema='public'")
              [ "\$tables" = "0" ] || { echo "대상 DB 가 비어 있지 않습니다 (public 테이블 \$tables 개) — 중단"; exit 1; }
              pg_restore --single-transaction --exit-on-error -d "\$PGDATABASE" /dump/plannet.dump
              echo "== 복원 결과 =="
              psql -Atc "select 'plannet_user', count(*) from plannet_user
                         union all select 'planner_record', count(*) from planner_record
                         union all select 'planner_commit_receipt', count(*) from planner_commit_receipt"
              echo "== flyway 이력 (version|success) =="
              psql -Atc "select version, success from flyway_schema_history order by installed_rank"
              echo "== 테이블 소유자 =="
              psql -Atc "select tablename, tableowner from pg_tables where schemaname='public' order by tablename"
          env:
            - name: PGPASSWORD
              valueFrom: { secretKeyRef: { name: plannet-db-secret, key: APP_PASSWORD } }
            - { name: PGHOST, value: plannet-db }
            - { name: PGUSER, value: plannet_app }
            - { name: PGDATABASE, value: plannet }
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            capabilities: { drop: [ALL] }
          volumeMounts:
            - { name: dump, mountPath: /dump, readOnly: true }
            - { name: tmp, mountPath: /tmp }
      volumes:
        - name: dump
          # 0444: fsGroup 없이도 999 번 사용자가 읽을 수 있어야 한다.
          secret: { secretName: $SECRET, defaultMode: 0444 }
        - name: tmp
          emptyDir: {}
EOF

for _ in $(seq 1 60); do
  status="$(k -n "$NS" get job "$JOB" -o jsonpath='{.status.conditions[0].type}' 2>/dev/null || true)"
  [[ -n "$status" ]] && break
  sleep 3
done
k -n "$NS" logs -l job-name="$JOB" --tail=40 || true
[[ "${status:-}" == Complete || "${status:-}" == SuccessCriteriaMet ]] || fail "복원 실패 (job 상태: ${status:-시간초과})"

log "복원 완료. API 를 다시 띄워 Flyway 가 남은 migration 을 적용하게 한다:"
log "  kubectl --context $CONTEXT -n $NS rollout restart deploy/plannet-api"
