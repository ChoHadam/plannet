# 배포 스크립트 공통 설정. 각 스크립트가 source 한다.
# 모든 값은 환경변수로 덮어쓸 수 있다. 다른 작업의 서버·빌드 산출물과 겹치지 않도록
# 작업 디렉터리는 저장소 밖(TMPDIR)을, 포트는 전용 대역(196xx)을 기본값으로 쓴다.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Plannet 프로젝트 루트(services 모노레포에서는 apps/plannet). 상위 모노레포 git 안에 있어도 git 명령은 이 폴더로 범위를 한정한다.
REPO_ROOT="$(cd "$DEPLOY_DIR/../.." && pwd)"

# 스냅샷·빌드·검증 산출물 위치 (저장소 밖)
PLANNET_WORK_DIR="${PLANNET_WORK_DIR:-${TMPDIR:-/tmp}/plannet-deploy}"
PLANNET_WORK_DIR="${PLANNET_WORK_DIR%/}"
SNAPSHOT_DIR="$PLANNET_WORK_DIR/src"
ARTIFACTS_DIR="${PLANNET_ARTIFACTS_DIR:-$PLANNET_WORK_DIR/artifacts}"

# 이미지 이름·태그. 태그 기본값은 HEAD 커밋 + 미커밋 변경 표시.
WEB_IMAGE="${WEB_IMAGE:-plannet-web}"
API_IMAGE="${API_IMAGE:-plannet-api}"
default_tag() {
  local sha dirty=""
  sha="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
  [[ -n "$(git -C "$REPO_ROOT" status --porcelain -- .)" ]] && dirty="-dirty"
  echo "${sha}${dirty}"
}
IMAGE_TAG="${IMAGE_TAG:-$(default_tag)}"

# 로컬 검증 클러스터 (전용 kind 클러스터 + 전용 kubeconfig; 기존 kube context를 바꾸지 않는다)
VERIFY_CLUSTER="${VERIFY_CLUSTER:-plannet-verify}"
VERIFY_KUBECONFIG="$PLANNET_WORK_DIR/kubeconfig"
# 포트·호스트는 overlays/local-verify 의 public.env·mock 설정과 같아야 해서 고정값이다.
VERIFY_HTTPS_PORT=19643
VERIFY_HTTP_PORT=19680
VERIFY_HOST="plannet.test"
VERIFY_MOCK_HOST="mock.test"
VERIFY_IMAGE_TAG="verify"
ENVOY_GATEWAY_VERSION="${ENVOY_GATEWAY_VERSION:-1.9.1}"

APP_NAMESPACE="plannet"

log() { printf '\033[1;34m[deploy]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[deploy] %s\033[0m\n' "$*" >&2; exit 1; }
require() { for cmd in "$@"; do command -v "$cmd" >/dev/null || fail "필요한 명령이 없습니다: $cmd"; done; }

# 응답 없는 Docker/kind 호출이 무기한 대기하지 않게 제한 시간 뒤 강제 종료한다 (종료 코드는 명령의 것, 시간 초과는 137).
# 출력은 호출한 쪽의 리다이렉트를 따른다. 명령 치환 대신 파일로 받으면 남은 자식 프로세스가 출력을 붙잡지 않는다.
run_bounded() {
  local seconds="$1" pid watchdog rc=0; shift
  "$@" & pid=$!
  ( sleep "$seconds"; kill -9 "$pid" 2>/dev/null ) >/dev/null 2>&1 & watchdog=$!
  { wait "$pid"; } 2>/dev/null || rc=$?
  kill "$watchdog" 2>/dev/null || true
  { wait "$watchdog"; } 2>/dev/null || true
  return "$rc"
}

# 검증 클러스터 전용 kubectl. 사용자의 기본 kubeconfig/context를 쓰지 않는다.
vkubectl() { kubectl --kubeconfig "$VERIFY_KUBECONFIG" "$@"; }
