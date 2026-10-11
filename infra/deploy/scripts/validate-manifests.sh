#!/usr/bin/env bash
# 배포 매니페스트를 클러스터 없이 검증한다 (적용하지 않음).
#
#   ./validate-manifests.sh                     # production, local-verify 예제 검사 (placeholder는 경고)
#   ./validate-manifests.sh --strict production # 실제 적용 직전: placeholder·예제 도메인·태그 미고정이면 실패
#
# 0) 정책 검사기 회귀 테스트(test_validate_manifests.py)  1) kubectl kustomize 렌더  2) 정책 검사(validate_manifests.py)
# 3) 스키마 검사(kubeconform, Docker로 실행). --strict 에서는 필수 (SKIP_SCHEMA=1 로 명시적으로만 생략).
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

# Docker 데몬이 멈춰 있어도 검사가 무기한 대기하지 않도록 응답 시간을 제한한다.
schema_available() { command -v docker >/dev/null && run_bounded 15 docker info >/dev/null 2>&1; }
schema_mode=skip
if [[ "${SKIP_SCHEMA:-0}" != "1" ]]; then
  if schema_available; then schema_mode=run
  elif [[ -n "$strict" ]]; then fail "--strict 는 kubeconform 스키마 검사가 필요합니다 (Docker 응답 없음). 생략하려면 SKIP_SCHEMA=1"
  else log "경고: Docker 응답 없음 — 스키마 검사 생략"; fi
fi

log "정책 검사기 회귀 테스트"
python3 -B "$DEPLOY_DIR/scripts/test_validate_manifests.py" 2>&1 | tail -1 | sed 's/^/  /'
[[ ${PIPESTATUS[0]} -eq 0 ]] || fail "정책 검사기 회귀 테스트 실패 (python3 -B $DEPLOY_DIR/scripts/test_validate_manifests.py)"

status=0
for overlay in "${overlays[@]}"; do
  dir="$DEPLOY_DIR/k8s/overlays/$overlay"
  [[ -d "$dir" ]] || fail "overlay 없음: $overlay"
  out="$ARTIFACTS_DIR/rendered-$overlay.yaml"
  log "render $overlay"
  kubectl kustomize "$dir" > "$out"
  python3 -B "$DEPLOY_DIR/scripts/validate_manifests.py" "$overlay" $strict < "$out" || status=1
  if [[ "$schema_mode" == "run" ]]; then
    if docker run --rm -i "$KUBECONFORM_IMAGE" -strict -summary \
      -schema-location default -schema-location "$CRD_SCHEMAS" - < "$out" > "$out.schema.txt" 2>&1; then
      echo "  OK    schema: $(tail -1 "$out.schema.txt")"
    else
      echo "  FAIL  schema:"; sed 's/^/        /' "$out.schema.txt"; status=1
    fi
  fi
done
[[ $status -eq 0 ]] && log "manifests OK" || fail "manifest 검증 실패"
