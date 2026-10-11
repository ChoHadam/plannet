#!/usr/bin/env bash
# 전용 kind 클러스터에 실제 Web/API 이미지 + Envoy Gateway + Google·AI 대역을 올리고 E2E를 실행한다.
# 실제 PostgreSQL/PVC와 storage=true로 HTTPS·인증·서버 저장을 함께 검증한다.
#
#   ./verify-local.sh              # 클러스터 준비(없으면 생성) → 배포 → E2E → 클러스터 유지
#   VERIFY_TEARDOWN=1 ./verify-local.sh   # 끝나면 클러스터 삭제
#   SKIP_BUILD=1 ./verify-local.sh        # 이미 만든 plannet-{web,api}:verify 이미지 사용
#   SKIP_TESTS=1 ./verify-local.sh        # 배포만 (브라우저로 직접 확인할 때)
#
# 격리: 클러스터 이름 plannet-verify, kubeconfig는 $PLANNET_WORK_DIR/kubeconfig (기본 kube context 불변),
# 호스트 포트 127.0.0.1:19643(HTTPS)/19680(HTTP). 기존 클러스터·서버는 건드리지 않는다.
source "$(dirname "$0")/lib.sh"
require docker kind kubectl helm openssl node python3

OVERLAY="$DEPLOY_DIR/k8s/overlays/local-verify"
TLS_DIR="$PLANNET_WORK_DIR/tls"
mkdir -p "$PLANNET_WORK_DIR" "$ARTIFACTS_DIR"

# 대역 자격 증명 (가짜 값, overlays/local-verify/kustomization.yaml 의 mock-external-config 와 동일)
MOCK_CLIENT_ID="verify-client-id.apps.example.test"
MOCK_CLIENT_SECRET="verify-client-secret-not-real"
MOCK_AI_API_KEY="verify-ai-key-not-real"

ensure_images() {
  if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
    docker image inspect "$WEB_IMAGE:$VERIFY_IMAGE_TAG" "$API_IMAGE:$VERIFY_IMAGE_TAG" >/dev/null \
      || fail "SKIP_BUILD=1 이지만 $VERIFY_IMAGE_TAG 이미지가 없습니다"
    return
  fi
  IMAGE_TAG="$VERIFY_IMAGE_TAG" "$DEPLOY_DIR/scripts/build-images.sh"
}

ensure_cluster() {
  if kind get clusters 2>/dev/null | grep -qx "$VERIFY_CLUSTER"; then
    log "kind cluster $VERIFY_CLUSTER 재사용"
    kind get kubeconfig --name "$VERIFY_CLUSTER" > "$VERIFY_KUBECONFIG"
    return
  fi
  for port in "$VERIFY_HTTPS_PORT" "$VERIFY_HTTP_PORT"; do
    ! lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 || fail "포트 $port 가 이미 사용 중입니다"
  done
  local config="$PLANNET_WORK_DIR/kind-config.yaml"
  sed -e "s/\${VERIFY_HTTPS_PORT}/$VERIFY_HTTPS_PORT/" -e "s/\${VERIFY_HTTP_PORT}/$VERIFY_HTTP_PORT/" \
    "$DEPLOY_DIR/verify/kind-config.yaml" > "$config"
  log "kind cluster $VERIFY_CLUSTER 생성 (kubeconfig: $VERIFY_KUBECONFIG)"
  kind create cluster --name "$VERIFY_CLUSTER" --config "$config" --kubeconfig "$VERIFY_KUBECONFIG" --wait 120s
}

install_gateway_controller() {
  log "Envoy Gateway $ENVOY_GATEWAY_VERSION 설치/확인"
  helm --kubeconfig "$VERIFY_KUBECONFIG" upgrade --install eg oci://docker.io/envoyproxy/gateway-helm \
    --version "$ENVOY_GATEWAY_VERSION" -n envoy-gateway-system --create-namespace --wait --timeout 5m >/dev/null
}

load_images() {
  log "이미지를 kind 노드에 적재"
  docker image inspect node:20-alpine >/dev/null 2>&1 || docker pull -q node:20-alpine >/dev/null
  kind load docker-image --name "$VERIFY_CLUSTER" \
    "$WEB_IMAGE:$VERIFY_IMAGE_TAG" "$API_IMAGE:$VERIFY_IMAGE_TAG" node:20-alpine >/dev/null
  # Pin the version from the manifest so the loaded image and deployed image cannot drift.
  local postgres_image
  postgres_image="$(python3 -c 'import sys,yaml; print(next(d for d in yaml.safe_load_all(open(sys.argv[1])) if d["kind"] == "StatefulSet")["spec"]["template"]["spec"]["containers"][0]["image"])' "$OVERLAY/postgres.yaml")"
  docker image inspect "$postgres_image" >/dev/null 2>&1 || docker pull -q "$postgres_image" >/dev/null
  kind load docker-image --name "$VERIFY_CLUSTER" "$postgres_image" >/dev/null
}

create_tls_and_secrets() {
  if [[ ! -f "$TLS_DIR/tls.crt" ]]; then
    log "자체 서명 인증서 생성 ($VERIFY_HOST, $VERIFY_MOCK_HOST)"
    mkdir -p "$TLS_DIR"
    chmod 700 "$TLS_DIR"
    openssl req -x509 -newkey rsa:2048 -nodes -days 7 -subj "/CN=$VERIFY_HOST" \
      -addext "subjectAltName=DNS:$VERIFY_HOST,DNS:$VERIFY_MOCK_HOST" \
      -keyout "$TLS_DIR/tls.key" -out "$TLS_DIR/tls.crt" 2>/dev/null
    chmod 600 "$TLS_DIR/tls.key"
  fi
  vkubectl apply -f "$DEPLOY_DIR/k8s/base/namespace.yaml" >/dev/null
  # server-side apply: 값이 last-applied-configuration annotation에 복사되지 않는다.
  apply_secret() {
    vkubectl -n "$APP_NAMESPACE" create "$@" --dry-run=client -o yaml \
      | vkubectl apply --server-side --force-conflicts --field-manager=plannet-verify -f - >/dev/null
  }
  apply_secret secret tls plannet-tls --cert "$TLS_DIR/tls.crt" --key "$TLS_DIR/tls.key"
  apply_secret secret generic plannet-web-secret --from-literal=OPENGATEWAY_API_KEY="$MOCK_AI_API_KEY"
  MOCK_CLIENT_ID="$MOCK_CLIENT_ID" MOCK_CLIENT_SECRET="$MOCK_CLIENT_SECRET" \
    python3 "$DEPLOY_DIR/scripts/verify-secrets.py" \
      --kubeconfig "$VERIFY_KUBECONFIG" --directory "$PLANNET_WORK_DIR/db-secrets"
}

deploy() {
  log "apply overlays/local-verify"
  vkubectl apply -k "$OVERLAY" >/dev/null
  vkubectl -n "$APP_NAMESPACE" rollout status statefulset/plannet-db --timeout=180s
  # 같은 태그로 이미지를 다시 만든 경우에도 새 이미지를 쓰도록 재시작한다.
  vkubectl -n "$APP_NAMESPACE" rollout restart deployment/plannet-web deployment/plannet-api >/dev/null
  vkubectl -n "$APP_NAMESPACE" rollout status deployment/plannet-api --timeout=180s
  vkubectl -n "$APP_NAMESPACE" rollout status deployment/plannet-web --timeout=120s
  vkubectl -n plannet-mocks rollout status deployment/mock-external --timeout=120s
  vkubectl -n "$APP_NAMESPACE" wait gateway/plannet --for=condition=Programmed --timeout=120s >/dev/null
  wait_for_edge
  verify_bootstrap
}

wait_for_edge() {
  # 생성한 자체 서명 인증서로 TLS를 검증한다 (-k 없이). 앱 진입점과 OIDC 대역을 모두 확인한다.
  local target host url
  for target in "$VERIFY_HOST /api/v1/health" "$VERIFY_MOCK_HOST /healthz"; do
    set -- $target
    host="$1"
    url="https://$host:$VERIFY_HTTPS_PORT$2"
    for _ in $(seq 1 60); do
      if curl -s --cacert "$TLS_DIR/tls.crt" --resolve "$host:$VERIFY_HTTPS_PORT:127.0.0.1" \
        -o /dev/null -w '%{http_code}' "$url" | grep -qx 200; then
        log "진입점 준비 완료: $url"
        continue 2
      fi
      sleep 2
    done
    fail "진입점 응답 없음: $url"
  done
}

# 배포 직후 저장 경로를 확인한다: 비관리자 앱 역할, PVC, 실제 migration, storage=true.
# DB 관리자 비밀번호는 pod 안의 Secret 파일에서만 읽는다 (호스트 프로세스 인자·로그에 남기지 않음).
verify_bootstrap() {
  log "PostgreSQL/API 저장 경로 확인"
  local pvc storage sql result expected_migrations
  pvc="$(vkubectl -n "$APP_NAMESPACE" get pvc data-plannet-db-0 -o jsonpath='{.status.phase}')"
  [[ "$pvc" == "Bound" ]] || fail "DB PVC data-plannet-db-0 상태: ${pvc:-없음}"
  storage="$(vkubectl -n "$APP_NAMESPACE" exec deploy/plannet-api -- printenv PLANNET_STORAGE_ENABLED)"
  [[ "$storage" == "true" ]] || fail "API PLANNET_STORAGE_ENABLED=$storage (true 여야 함)"
  sql="SELECT concat_ws('|', r.rolsuper, r.rolcreaterole, r.rolcreatedb, r.rolreplication, r.rolbypassrls,
         (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = 'plannet'),
         (SELECT string_agg(version, ',' ORDER BY installed_rank) FROM flyway_schema_history WHERE success),
         (SELECT count(*) FROM flyway_schema_history WHERE NOT success),
         (SELECT tableowner FROM pg_tables WHERE tablename = 'flyway_schema_history'))
       FROM pg_roles r WHERE r.rolname = 'plannet_app'"
  result="$(vkubectl -n "$APP_NAMESPACE" exec plannet-db-0 -c postgres -- sh -c \
    'PGPASSWORD="$(cat /run/plannet/admin_password)" exec psql -h 127.0.0.1 -U postgres -d plannet -XAtq -v ON_ERROR_STOP=1 -c "$1"' \
    sh "$sql")"
  log "DB 확인: super|createrole|createdb|replication|bypassrls|db_owner|migrations|failed|history_owner = $result"
  # Match the current source migrations exactly; an old image with only V1/V2 must not pass a V3 rehearsal.
  expected_migrations="$(python3 - "$REPO_ROOT/apps/api/src/main/resources/db/migration" <<'PY'
from pathlib import Path
import re
import sys
versions = [re.fullmatch(r'V([0-9]+(?:\.[0-9]+)*)__.*\.sql', p.name).group(1)
            for p in Path(sys.argv[1]).glob('V*__*.sql')]
if not versions:
    raise SystemExit('No source migrations found')
print(','.join(sorted(versions, key=lambda v: tuple(map(int, v.split('.'))))))
PY
)"
  [[ "$result" == "f|f|f|f|f|plannet_app|$expected_migrations|0|plannet_app" ]] \
    || fail "DB 초기화/마이그레이션 상태가 기대와 다릅니다: $result"
}

collect_artifacts() {
  local dir="$ARTIFACTS_DIR/cluster"
  mkdir -p "$dir"
  vkubectl get all,gateway,httproute,networkpolicy,pvc -A -o wide > "$dir/resources.txt" 2>&1 || true
  vkubectl get events -A --sort-by=.lastTimestamp > "$dir/events.txt" 2>&1 || true
  for target in "$APP_NAMESPACE deployment/plannet-web" "$APP_NAMESPACE deployment/plannet-api" \
    "$APP_NAMESPACE statefulset/plannet-db" "plannet-mocks deployment/mock-external"; do
    set -- $target
    vkubectl -n "$1" logs "$2" --all-containers --tail=500 > "$dir/logs-${2##*/}.txt" 2>&1 || true
  done
  # 가짜 자격 증명도 로그에 남지 않았는지 확인한다 (실제 배포에서 같은 방식으로 누출을 점검).
  if grep -rlE "$MOCK_CLIENT_SECRET|$MOCK_AI_API_KEY" "$dir" >/dev/null 2>&1; then
    log "경고: 로그에 비밀값이 기록되었습니다: $(grep -rlE "$MOCK_CLIENT_SECRET|$MOCK_AI_API_KEY" "$dir")"
  fi
  python3 - "$dir" "$PLANNET_WORK_DIR/db-secrets" <<'PY'
from pathlib import Path
import sys
logs, credentials = map(Path, sys.argv[1:])
values = [p.read_text().strip() for p in credentials.glob('*.password')]
leaks = [p.name for p in logs.glob('*.txt') if any(v and v in p.read_text(errors='replace') for v in values)]
if leaks:
    raise SystemExit('DB credential leaked in verification logs: ' + ', '.join(leaks))
print('DB credential log check: PASS')
PY
}

run_tests() {
  log "E2E (Playwright) 실행"
  local status=0
  (cd "$DEPLOY_DIR/verify/e2e" && \
    VERIFY_KUBECONFIG="$VERIFY_KUBECONFIG" VERIFY_ARTIFACTS_DIR="$ARTIFACTS_DIR/e2e" \
    VERIFY_HOST="$VERIFY_HOST" VERIFY_MOCK_HOST="$VERIFY_MOCK_HOST" \
    VERIFY_HTTPS_PORT="$VERIFY_HTTPS_PORT" VERIFY_HTTP_PORT="$VERIFY_HTTP_PORT" \
    "$REPO_ROOT/node_modules/.bin/playwright" test --config playwright.config.ts) || status=$?
  return $status
}

main() {
  ensure_images
  "$DEPLOY_DIR/scripts/validate-manifests.sh" --strict local-verify
  ensure_cluster
  install_gateway_controller
  load_images
  create_tls_and_secrets
  deploy
  local status=0
  if [[ "${SKIP_TESTS:-0}" != "1" ]]; then run_tests || status=$?; fi
  collect_artifacts
  if [[ "${VERIFY_TEARDOWN:-0}" == "1" ]]; then "$DEPLOY_DIR/scripts/verify-down.sh"; fi
  log "산출물: $ARTIFACTS_DIR"
  [[ $status -eq 0 ]] || fail "E2E 실패 (exit $status). 보고서: $ARTIFACTS_DIR/e2e"
  log "완료"
}

main "$@"
