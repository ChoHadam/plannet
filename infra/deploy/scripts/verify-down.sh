#!/usr/bin/env bash
# 로컬 검증 클러스터(plannet-verify)만 삭제한다. 다른 kind/Docker Desktop 클러스터는 건드리지 않는다.
# PVC(local-path)는 kind 노드 컨테이너 안에 있어 클러스터와 함께 사라지므로, 클러스터가 없음을 확인한 뒤에만
# 짝을 잃은 검증 DB 자격 증명 파일을 지운다. 목록 조회가 실패하면(Docker 응답 없음 등) 아무것도 지우지 않는다.
source "$(dirname "$0")/lib.sh"
require kind

KIND_QUERY_TIMEOUT="${KIND_QUERY_TIMEOUT:-30}"
KIND_DELETE_TIMEOUT="${KIND_DELETE_TIMEOUT:-300}"
DB_SECRETS_DIR="$PLANNET_WORK_DIR/db-secrets"

# 성공한 조회에서만 0(있음)/1(없음)을 돌려준다. 조회 실패·시간 초과는 fail로 중단한다.
verify_cluster_exists() {
  local listing status=0
  listing="$(mktemp)"
  run_bounded "$KIND_QUERY_TIMEOUT" kind get clusters >"$listing" 2>/dev/null || status=$?
  if [[ $status -ne 0 ]]; then
    rm -f "$listing"
    fail "kind 클러스터 목록을 확인하지 못했습니다 (exit $status). 클러스터·PVC·DB 자격 증명을 그대로 둡니다"
  fi
  status=0
  grep -qx "$VERIFY_CLUSTER" "$listing" || status=1
  rm -f "$listing"
  return "$status"
}

remove_db_credentials() {
  [[ -d "$DB_SECRETS_DIR" && ! -L "$DB_SECRETS_DIR" ]] || return 0
  rm -f "$DB_SECRETS_DIR/admin.password" "$DB_SECRETS_DIR/app.password"
  rmdir "$DB_SECRETS_DIR" 2>/dev/null || true
  log "검증 DB 자격 증명 삭제: $DB_SECRETS_DIR"
}

if verify_cluster_exists; then
  log "kind cluster $VERIFY_CLUSTER 삭제"
  run_bounded "$KIND_DELETE_TIMEOUT" kind delete cluster --name "$VERIFY_CLUSTER" --kubeconfig "$VERIFY_KUBECONFIG" \
    || fail "kind cluster $VERIFY_CLUSTER 삭제 실패. DB 자격 증명을 그대로 둡니다"
  ! verify_cluster_exists || fail "삭제 후에도 kind cluster $VERIFY_CLUSTER 가 남아 있습니다. DB 자격 증명을 그대로 둡니다"
else
  log "kind cluster $VERIFY_CLUSTER 없음"
fi
remove_db_credentials
