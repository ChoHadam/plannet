#!/usr/bin/env bash
# 운영 클러스터에 Secret을 만든다/갱신한다. 값은 파일·Git·명령 인자에 남기지 않는다.
#
#   ./create-secrets.sh --context <kube-context>            # 확인만 (무엇을 만들지 출력, 적용 안 함)
#   ./create-secrets.sh --context <kube-context> --apply    # 적용
#   ... --tls-cert fullchain.pem --tls-key privkey.pem      # 인증서를 직접 넣을 때 (cert-manager를 쓰면 생략)
#
# 값 입력: Google/AI 환경변수 및 PLANNET_DB_URL/USERNAME/PASSWORD 가 있으면 쓰고,
#         없으면 화면에 표시하지 않고 입력받는다. 출력에는 값 대신 길이만 보인다.
source "$(dirname "$0")/lib.sh"
require kubectl

context="" apply=0 tls_cert="" tls_key=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --context) context="$2"; shift 2 ;;
    --apply) apply=1; shift ;;
    --tls-cert) tls_cert="$2"; shift 2 ;;
    --tls-key) tls_key="$2"; shift 2 ;;
    *) fail "알 수 없는 인자: $1" ;;
  esac
done
[[ -n "$context" ]] || fail "--context 를 지정하세요 (현재 context로 실수 적용 방지)"
k() { kubectl --context "$context" "$@"; }

read_secret() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    local value
    read -r -s -p "$name: " value; echo >&2
    printf -v "$name" '%s' "$value"
  fi
  [[ -n "${!name}" ]] || fail "$name 이 비어 있습니다"
  [[ "${!name}" != *$'\n'* && "${!name}" != *$'\r'* ]] || fail "$name 에 줄바꿈을 넣을 수 없습니다"
}
for name in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET OPENGATEWAY_API_KEY \
  PLANNET_DB_URL PLANNET_DB_USERNAME PLANNET_DB_PASSWORD; do read_secret "$name"; done
[[ "$GOOGLE_CLIENT_ID" == *.apps.googleusercontent.com ]] || log "경고: GOOGLE_CLIENT_ID 형식이 Google client ID와 다릅니다"
[[ "$PLANNET_DB_URL" == jdbc:postgresql://* ]] || fail "PLANNET_DB_URL 은 PostgreSQL JDBC URL이어야 합니다"

log "대상 context: $context, namespace: $APP_NAMESPACE"
echo "  plannet-api-secret: GOOGLE_CLIENT_ID(${#GOOGLE_CLIENT_ID}자), GOOGLE_CLIENT_SECRET(${#GOOGLE_CLIENT_SECRET}자)"
echo "                      PLANNET_DB_URL(${#PLANNET_DB_URL}자), PLANNET_DB_USERNAME(${#PLANNET_DB_USERNAME}자), PLANNET_DB_PASSWORD(${#PLANNET_DB_PASSWORD}자)"
echo "  plannet-web-secret: OPENGATEWAY_API_KEY(${#OPENGATEWAY_API_KEY}자)"
[[ -n "$tls_cert" ]] && echo "  plannet-tls: $tls_cert / $tls_key"
if [[ $apply -ne 1 ]]; then
  log "확인만 했습니다. 적용하려면 --apply 를 붙이세요."
  exit 0
fi

k apply -f "$DEPLOY_DIR/k8s/base/namespace.yaml" >/dev/null
# 값은 stdin(env 파일 형식)으로만 넘겨 프로세스 인자·셸 기록에 남지 않게 한다.
# server-side apply: client-side apply는 값을 last-applied-configuration annotation에 복사한다 (describe에 노출).
apply_secret() { k apply --server-side --force-conflicts --field-manager=plannet-secrets -f - >/dev/null; }
apply_generic() {
  local secret="$1"; shift
  k -n "$APP_NAMESPACE" create secret generic "$secret" --from-env-file=/dev/stdin --dry-run=client -o yaml \
    | apply_secret
}
printf 'GOOGLE_CLIENT_ID=%s\nGOOGLE_CLIENT_SECRET=%s\nPLANNET_DB_URL=%s\nPLANNET_DB_USERNAME=%s\nPLANNET_DB_PASSWORD=%s\n' \
  "$GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_SECRET" "$PLANNET_DB_URL" "$PLANNET_DB_USERNAME" "$PLANNET_DB_PASSWORD" \
  | apply_generic plannet-api-secret
printf 'OPENGATEWAY_API_KEY=%s\n' "$OPENGATEWAY_API_KEY" | apply_generic plannet-web-secret
if [[ -n "$tls_cert" ]]; then
  k -n "$APP_NAMESPACE" create secret tls plannet-tls --cert "$tls_cert" --key "$tls_key" --dry-run=client -o yaml \
    | apply_secret
fi
log "Secret 적용 완료. 값이 바뀐 경우 kubectl rollout restart 로 pod를 다시 띄워야 반영됩니다."
