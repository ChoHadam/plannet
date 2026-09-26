#!/usr/bin/env bash
# 현재 작업 트리(미커밋 변경 포함)를 저장소 밖으로 복사한다.
# - 포함: 추적 파일 + 추적되지 않았지만 .gitignore 대상이 아닌 파일 (git ls-files -co --exclude-standard)
# - 제외: .gitignore 대상 전부 (.env*, k8s/local/ 의 로컬 Secret, node_modules, .next, build 등)
# 원본 저장소의 파일·빌드 산출물은 읽기만 한다.
source "$(dirname "$0")/lib.sh"
require git rsync

log "snapshot: $REPO_ROOT → $SNAPSHOT_DIR"
mkdir -p "$PLANNET_WORK_DIR" "$ARTIFACTS_DIR"
rm -rf "$SNAPSHOT_DIR"
mkdir -p "$SNAPSHOT_DIR"

list="$PLANNET_WORK_DIR/snapshot-files.txt"
# 삭제된 추적 파일은 건너뛴다.
git -C "$REPO_ROOT" ls-files -co --exclude-standard --deduplicate \
  | while IFS= read -r file; do [[ -f "$REPO_ROOT/$file" ]] && printf '%s\n' "$file"; done > "$list"
rsync -a --files-from="$list" "$REPO_ROOT/" "$SNAPSHOT_DIR/"

# 비밀값이 들어갈 수 있는 파일이 섞이지 않았는지 확인한다.
leaked="$(cd "$SNAPSHOT_DIR" && find . \( -name '.env' -o -name '.env.*' -o -path './k8s/local/*' \) ! -name '.env.example' -print)"
[[ -z "$leaked" ]] || fail "스냅샷에 비밀값 후보 파일이 있습니다: $leaked"

{
  echo "created_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "head=$(git -C "$REPO_ROOT" rev-parse HEAD)"
  echo "branch=$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
  echo "files=$(wc -l < "$list" | tr -d ' ')"
  echo "uncommitted:"
  git -C "$REPO_ROOT" status --porcelain | sed 's/^/  /'
} > "$ARTIFACTS_DIR/source-snapshot.txt"
log "snapshot done ($(wc -l < "$list" | tr -d ' ') files). 기록: $ARTIFACTS_DIR/source-snapshot.txt"
