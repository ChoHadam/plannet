#!/usr/bin/env bash
# 홈 클러스터(kube context `home`) 최초 준비. 배포 러너가 할 수 없는 일만 모아 둔다.
#
#   infra/deploy/home/bootstrap.sh infra        # namespace · 러너 권한 · 와일드카드 인증서 복제 · DB 자격 증명
#   infra/deploy/home/bootstrap.sh app-secrets  # Google client · AI 키 입력 (화면에 표시하지 않는다)
#
# 두 단계 모두 여러 번 실행해도 안전하다. 이미 있는 비밀번호는 다시 만들지 않는다
# (PVC 안의 DB 와 비밀번호가 어긋나면 API 가 접속하지 못한다).
# 값은 stdin 으로만 넘긴다. 명령 인자·파일·Git 에 남기지 않는다.
set -euo pipefail

CONTEXT="${PLANNET_CONTEXT:-home}"
NS=plannet
HERE="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$(cd "$HERE/.." && pwd)"
# 와일드카드 인증서는 클러스터 공용이다 (land·eng50 과 같은 것을 쓴다).
CERT_NS=default
CERT_NAME=mhd-mhd-wildcard
TLS_SECRET=mhd-mhd-wildcard-tls

log() { printf '==> %s\n' "$*"; }
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
k() { kubectl --context "$CONTEXT" "$@"; }

command -v kubectl >/dev/null || fail "kubectl 이 필요합니다"
k version --request-timeout=10s -o json >/dev/null 2>&1 || fail "context '$CONTEXT' 로 클러스터에 접속할 수 없습니다 (홈 PC 가 켜져 있나요?)"

# 값을 stdin(env 파일 형식)으로만 넘긴다.
# server-side apply: client-side 는 값을 last-applied-configuration annotation 으로 복사한다 (describe 에 노출).
apply_secret_stdin() {
  local name="$1"
  k -n "$NS" create secret generic "$name" --from-env-file=/dev/stdin --dry-run=client -o yaml \
    | k apply --server-side --force-conflicts --field-manager=plannet-bootstrap -f - >/dev/null
}

cmd_infra() {
  log "namespace $NS"
  k apply -f "$DEPLOY_DIR/k8s/base/namespace.yaml" >/dev/null

  log "배포 러너 권한 (land:deployer → $NS)"
  k apply -f "$HERE/runner-rbac.yaml" >/dev/null

  log "와일드카드 인증서($TLS_SECRET) 를 $NS 로 복제 허용"
  # cert-manager 가 만든 Secret 을 reflector 가 다른 namespace 로 복제한다.
  # 공용 리소스이므로 기존 목록에 덧붙이기만 한다 (land·eng50 을 지우지 않는다).
  local allowed auto
  allowed="$(k -n "$CERT_NS" get certificate "$CERT_NAME" \
    -o 'jsonpath={.spec.secretTemplate.annotations.reflector\.v1\.k8s\.emberstack\.com/reflection-allowed-namespaces}')"
  auto="$(k -n "$CERT_NS" get certificate "$CERT_NAME" \
    -o 'jsonpath={.spec.secretTemplate.annotations.reflector\.v1\.k8s\.emberstack\.com/reflection-auto-namespaces}')"
  [[ -n "$allowed" ]] || fail "인증서 $CERT_NS/$CERT_NAME 의 reflector 설정을 읽지 못했습니다"
  add_ns() { case ",$1," in *",$NS,"*) printf '%s' "$1";; *) printf '%s,%s' "$1" "$NS";; esac; }
  k -n "$CERT_NS" patch certificate "$CERT_NAME" --type merge -p "$(printf '{"spec":{"secretTemplate":{"annotations":{
    "reflector.v1.k8s.emberstack.com/reflection-allowed-namespaces":"%s",
    "reflector.v1.k8s.emberstack.com/reflection-auto-namespaces":"%s"}}}}' "$(add_ns "$allowed")" "$(add_ns "$auto")")" >/dev/null

  log "DB 자격 증명 (plannet-db-secret)"
  if k -n "$NS" get secret plannet-db-secret >/dev/null 2>&1; then
    log "  이미 있습니다 — 그대로 둡니다 (PVC 안의 DB 와 맞춰야 합니다)"
  else
    command -v openssl >/dev/null || fail "openssl 이 필요합니다"
    printf 'ADMIN_PASSWORD=%s\nAPP_PASSWORD=%s\n' "$(openssl rand -hex 32)" "$(openssl rand -hex 32)" \
      | apply_secret_stdin plannet-db-secret
    log "  새로 만들었습니다 (화면에 표시하지 않습니다)"
  fi

  log "인증서 복제 대기 ($NS/$TLS_SECRET)"
  for _ in $(seq 1 30); do
    k -n "$NS" get secret "$TLS_SECRET" >/dev/null 2>&1 && { log "  준비됨"; break; }
    sleep 2
  done
  k -n "$NS" get secret "$TLS_SECRET" >/dev/null 2>&1 \
    || fail "$NS 에 $TLS_SECRET 이 복제되지 않았습니다 (kube-system 의 reflector 로그를 확인하세요)"

  log "infra 준비 완료. 다음: bootstrap.sh app-secrets → 배포 워크플로 (deploy-plannet)"
}

cmd_app_secrets() {
  k -n "$NS" get secret plannet-db-secret >/dev/null 2>&1 \
    || fail "plannet-db-secret 이 없습니다. 먼저 bootstrap.sh infra 를 실행하세요"

  # 세 변수를 local 로 선언하면 환경변수로 미리 넘긴 값이 가려진다 (local 은 unset 으로 만든다).
  local value
  for name in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET OPENGATEWAY_API_KEY; do
    # 환경변수로 미리 넘기지 않았으면 물어본다.
    if [[ -z "${!name+x}" ]]; then
      read -r -s -p "$name: " value; echo >&2
      printf -v "$name" '%s' "$value"
    fi
    # AI 키만은 '빈 값으로 두기'를 허용한다 (OPENGATEWAY_API_KEY= 로 넘긴 경우).
    # Secret 에 키가 아예 없으면 Web pod 가 뜨지 못하지만, 빈 값이면 AI 채팅만 ai_not_configured 로 떨어진다.
    if [[ -z "${!name}" ]]; then
      [[ "$name" == OPENGATEWAY_API_KEY ]] || fail "$name 이 비어 있습니다"
      log "경고: OPENGATEWAY_API_KEY 가 비어 있습니다 — AI 채팅은 동작하지 않습니다 (나머지는 정상)"
    fi
    [[ "${!name}" != *$'\n'* && "${!name}" != *$'\r'* ]] || fail "$name 에 줄바꿈을 넣을 수 없습니다"
  done
  [[ "$GOOGLE_CLIENT_ID" == *.apps.googleusercontent.com ]] \
    || log "경고: GOOGLE_CLIENT_ID 형식이 Google client ID 와 다릅니다"

  # DB 비밀번호는 클러스터에 있는 값을 그대로 쓴다. 사람이 다시 입력하지 않는다.
  local app_password
  app_password="$(k -n "$NS" get secret plannet-db-secret -o 'jsonpath={.data.APP_PASSWORD}' | base64 -d)"
  [[ -n "$app_password" ]] || fail "plannet-db-secret 의 APP_PASSWORD 가 비어 있습니다"

  log "plannet-api-secret / plannet-web-secret 적용 (길이만 표시)"
  echo "  GOOGLE_CLIENT_ID ${#GOOGLE_CLIENT_ID}자 · GOOGLE_CLIENT_SECRET ${#GOOGLE_CLIENT_SECRET}자 · OPENGATEWAY_API_KEY ${#OPENGATEWAY_API_KEY}자"
  printf 'GOOGLE_CLIENT_ID=%s\nGOOGLE_CLIENT_SECRET=%s\nPLANNET_DB_URL=%s\nPLANNET_DB_USERNAME=%s\nPLANNET_DB_PASSWORD=%s\n' \
    "$GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_SECRET" \
    "jdbc:postgresql://plannet-db:5432/plannet" "plannet_app" "$app_password" \
    | apply_secret_stdin plannet-api-secret
  printf 'OPENGATEWAY_API_KEY=%s\n' "$OPENGATEWAY_API_KEY" | apply_secret_stdin plannet-web-secret

  # 이미 돌고 있으면 새 값을 반영한다 (env 는 pod 를 다시 띄워야 바뀐다).
  for d in plannet-api plannet-web; do
    k -n "$NS" get deploy "$d" >/dev/null 2>&1 && k -n "$NS" rollout restart "deploy/$d" >/dev/null || true
  done
  log "완료"
}

case "${1:-}" in
  infra) cmd_infra ;;
  app-secrets) cmd_app_secrets ;;
  *) fail "사용법: bootstrap.sh {infra|app-secrets}" ;;
esac
