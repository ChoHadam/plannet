#!/usr/bin/env bash
# 배포 매니페스트를 클러스터 없이 검증한다 (적용하지 않음).
#
#   ./validate-manifests.sh                     # production, local-verify 예제 검사 (placeholder는 경고)
#   ./validate-manifests.sh --strict production # 실제 적용 직전: placeholder·예제 도메인·태그 미고정이면 실패
#
# 1) kubectl kustomize 렌더  2) 정책 검사(validate_manifests.py)  3) 스키마 검사(kubeconform, Docker로 실행; 선택)
# 렌더 결과는 $ARTIFACTS_DIR/rendered-<overlay>.yaml 에 남긴다 (비밀값 없음).
source "$(dirname "$0")/lib.sh"
require kubectl python3
python3 -c 'import yaml' 2>/dev/null || fail "python3 PyYAML이 필요합니다 (pip3 install pyyaml)"

strict=""
overlays=()
for arg in "$@"; do
  case "$arg" in
    --strict) strict="--strict" ;;
    *) overlays+=("$arg") ;;
  esac
done
[[ ${#overlays[@]} -gt 0 ]] || overlays=(production local-verify)
mkdir -p "$ARTIFACTS_DIR"

# kubeconform: Kubernetes + Gateway API CRD 스키마 (Docker 이미지가 있으면 실행)
KUBECONFORM_IMAGE="ghcr.io/yannh/kubeconform:v0.7.0"
CRD_SCHEMAS='https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json'

status=0
for overlay in "${overlays[@]}"; do
  dir="$DEPLOY_DIR/k8s/overlays/$overlay"
  [[ -d "$dir" ]] || fail "overlay 없음: $overlay"
  out="$ARTIFACTS_DIR/rendered-$overlay.yaml"
  log "render $overlay"
  kubectl kustomize "$dir" > "$out"
  python3 "$DEPLOY_DIR/scripts/validate_manifests.py" "$overlay" $strict < "$out" || status=1
  if [[ "${SKIP_SCHEMA:-0}" != "1" ]] && command -v docker >/dev/null && docker info >/dev/null 2>&1; then
    if docker run --rm -i "$KUBECONFORM_IMAGE" -strict -summary \
      -schema-location default -schema-location "$CRD_SCHEMAS" - < "$out" > "$out.schema.txt" 2>&1; then
      echo "  OK    schema: $(tail -1 "$out.schema.txt")"
    else
      echo "  FAIL  schema:"; sed 's/^/        /' "$out.schema.txt"; status=1
    fi
  fi
done
[[ $status -eq 0 ]] && log "manifests OK" || fail "manifest 검증 실패"
