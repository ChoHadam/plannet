#!/usr/bin/env bash
# 전용 kind 클러스터에 실제 Web/API 이미지 + Envoy Gateway + Google·AI 대역을 올리고 E2E를 실행한다.
# 인증/HTTPS/라우팅 검증 전용: local-verify는 storage=false이며 PostgreSQL 검증을 포함하지 않는다.
#
#   ./verify-local.sh              # 클러스터 준비(없으면 생성) → 배포 → E2E → 클러스터 유지
#   VERIFY_TEARDOWN=1 ./verify-local.sh   # 끝나면 클러스터 삭제
#   SKIP_BUILD=1 ./verify-local.sh        # 이미 만든 plannet-{web,api}:verify 이미지 사용
#   SKIP_TESTS=1 ./verify-local.sh        # 배포만 (브라우저로 직접 확인할 때)
#
# 격리: 클러스터 이름 plannet-verify, kubeconfig는 $PLANNET_WORK_DIR/kubeconfig (기본 kube context 불변),
# 호스트 포트 127.0.0.1:19643(HTTPS)/19680(HTTP). 기존 클러스터·서버는 건드리지 않는다.
source "$(dirname "$0")/lib.sh"
require docker kind kubectl helm openssl node

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
}

create_tls_and_secrets() {
  if [[ ! -f "$TLS_DIR/tls.crt" ]]; then
    log "자체 서명 인증서 생성 ($VERIFY_HOST, $VERIFY_MOCK_HOST)"
    mkdir -p "$TLS_DIR"
    openssl req -x509 -newkey rsa:2048 -nodes -days 7 -subj "/CN=$VERIFY_HOST" \
      -addext "subjectAltName=DNS:$VERIFY_HOST,DNS:$VERIFY_MOCK_HOST" \
      -keyout "$TLS_DIR/tls.key" -out "$TLS_DIR/tls.crt" 2>/dev/null
  fi
  vkubectl apply -f "$DEPLOY_DIR/k8s/base/namespace.yaml" >/dev/null
  apply_secret() { vkubectl -n "$APP_NAMESPACE" create "$@" --dry-run=client -o yaml | vkubectl apply -f - >/dev/null; }
  apply_secret secret tls plannet-tls --cert "$TLS_DIR/tls.crt" --key "$TLS_DIR/tls.key"
  apply_secret secret generic plannet-web-secret --from-literal=OPENGATEWAY_API_KEY="$MOCK_AI_API_KEY"
  apply_secret secret generic plannet-api-secret \
    --from-literal=GOOGLE_CLIENT_ID="$MOCK_CLIENT_ID" --from-literal=GOOGLE_CLIENT_SECRET="$MOCK_CLIENT_SECRET"
}

deploy() {
  log "apply overlays/local-verify"
  vkubectl apply -k "$OVERLAY" >/dev/null
  # 같은 태그로 이미지를 다시 만든 경우에도 새 이미지를 쓰도록 재시작한다.
  vkubectl -n "$APP_NAMESPACE" rollout restart deployment/plannet-web deployment/plannet-api >/dev/null
  vkubectl -n "$APP_NAMESPACE" rollout status deployment/plannet-api --timeout=180s
  vkubectl -n "$APP_NAMESPACE" rollout status deployment/plannet-web --timeout=120s
  vkubectl -n plannet-mocks rollout status deployment/mock-external --timeout=120s
  vkubectl -n "$APP_NAMESPACE" wait gateway/plannet --for=condition=Programmed --timeout=120s >/dev/null
  wait_for_edge
}

wait_for_edge() {
  local url="https://127.0.0.1:$VERIFY_HTTPS_PORT/api/v1/health"
  for _ in $(seq 1 60); do
    if curl -sk --resolve "$VERIFY_HOST:$VERIFY_HTTPS_PORT:127.0.0.1" -o /dev/null -w '%{http_code}' \
      "https://$VERIFY_HOST:$VERIFY_HTTPS_PORT/api/v1/health" | grep -q 200; then
      log "진입점 준비 완료: https://$VERIFY_HOST:$VERIFY_HTTPS_PORT"
      return
    fi
    sleep 2
  done
  fail "진입점 응답 없음: $url"
}

collect_artifacts() {
  local dir="$ARTIFACTS_DIR/cluster"
  mkdir -p "$dir"
  vkubectl get all,gateway,httproute,networkpolicy -A -o wide > "$dir/resources.txt" 2>&1 || true
  vkubectl get events -A --sort-by=.lastTimestamp > "$dir/events.txt" 2>&1 || true
  for target in "$APP_NAMESPACE deployment/plannet-web" "$APP_NAMESPACE deployment/plannet-api" \
    "plannet-mocks deployment/mock-external"; do
    set -- $target
    vkubectl -n "$1" logs "$2" --all-containers --tail=500 > "$dir/logs-${2#deployment/}.txt" 2>&1 || true
  done
  # 가짜 자격 증명도 로그에 남지 않았는지 확인한다 (실제 배포에서 같은 방식으로 누출을 점검).
  if grep -rlE "$MOCK_CLIENT_SECRET|$MOCK_AI_API_KEY" "$dir" >/dev/null 2>&1; then
    log "경고: 로그에 비밀값이 기록되었습니다: $(grep -rlE "$MOCK_CLIENT_SECRET|$MOCK_AI_API_KEY" "$dir")"
  fi
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
