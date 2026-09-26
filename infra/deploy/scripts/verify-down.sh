#!/usr/bin/env bash
# 로컬 검증 클러스터(plannet-verify)만 삭제한다. 다른 kind/Docker Desktop 클러스터는 건드리지 않는다.
source "$(dirname "$0")/lib.sh"
require kind

if kind get clusters 2>/dev/null | grep -qx "$VERIFY_CLUSTER"; then
  log "kind cluster $VERIFY_CLUSTER 삭제"
  kind delete cluster --name "$VERIFY_CLUSTER" --kubeconfig "$VERIFY_KUBECONFIG"
else
  log "kind cluster $VERIFY_CLUSTER 없음"
fi
