#!/usr/bin/env bash
# deploy-hardening 검증: 빌드 컨텍스트 제외 규칙, 이미지 잔존 여부, API non-root 기동, Web 보안 헤더.
#
#   scripts/deploy-hardening/verify.sh                 # 전체 (컨텍스트 → 이미지 빌드 → 런타임)
#   SKIP_BUILD=1 scripts/deploy-hardening/verify.sh    # 컨텍스트 검사만
#   KEEP_WEB=1 scripts/deploy-hardening/verify.sh      # 끝난 뒤 Web 컨테이너를 남겨 브라우저로 확인 (docker rm -f plannet-hardening-web)
#
# 원본 저장소는 읽기만 한다. 현재 작업 트리(추적 + gitignore 대상이 아닌 미추적 파일)를 작업 디렉터리로
# 복사하고, 복사본에 "가짜 비밀 표식" 파일을 심은 뒤 검사한다. 실제 비밀 파일은 복사·출력하지 않는다.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK_DIR="${HARDENING_WORK_DIR:-${TMPDIR:-/tmp}/plannet-deploy-hardening}"
COPY_DIR="$WORK_DIR/src"
OUT_DIR="$WORK_DIR/artifacts"
TAG="${HARDENING_TAG:-verify}"
WEB_IMAGE="plannet-hardening-web:$TAG"
API_IMAGE="plannet-hardening-api:$TAG"
PROBE_IMAGE="plannet-hardening-probe:$TAG"
WEB_PORT="${HARDENING_WEB_PORT:-3510}"
API_PORT="${HARDENING_API_PORT:-3511}"
WEB_CONTAINER="plannet-hardening-web"
API_CONTAINER="plannet-hardening-api"
API_JAR="apps/api/build/libs/api-0.1.0-SNAPSHOT.jar" # apps/api/Dockerfile 의 COPY 경로
MARKER="PLANNET_HARDENING_FAKE_SECRET_MARKER"         # 가짜 표식 (실제 비밀값 아님)
EXPECTED_API_UID="10001"                             # infra/deploy/k8s/base/api.yaml runAsUser

pass=0; failed=0
ok()   { pass=$((pass + 1)); printf 'PASS  %s\n' "$*"; }
bad()  { failed=$((failed + 1)); printf 'FAIL  %s\n' "$*"; }
log()  { printf '\n== %s\n' "$*"; }
check() { local desc="$1"; shift; if "$@"; then ok "$desc"; else bad "$desc"; fi; }

port_free() { ! lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; }
cleanup() { docker rm -f "$API_CONTAINER" >/dev/null 2>&1 || true; [[ "${KEEP_WEB:-0}" == "1" ]] || docker rm -f "$WEB_CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# --- 1. 작업 트리 사본 + 가짜 표식 -----------------------------------------------------------
log "copy working tree → $COPY_DIR"
rm -rf "$COPY_DIR"; mkdir -p "$COPY_DIR" "$OUT_DIR"
git -C "$REPO_ROOT" ls-files -co --exclude-standard --deduplicate \
  | while IFS= read -r f; do [[ -f "$REPO_ROOT/$f" ]] && printf '%s\n' "$f"; done > "$OUT_DIR/copy-files.txt"
rsync -a --files-from="$OUT_DIR/copy-files.txt" "$REPO_ROOT/" "$COPY_DIR/"

# 제외되어야 하는 경로 (gitignore 대상이라 실제 저장소에만 있을 수 있는 것 포함)
LEAK_PATHS=(
  "k8s/local/secret.local.yaml"
  "k8s/local/configmap.yaml"
  ".env"
  ".env.local"
  "apps/web/.env.local"
  "apps/web/.env.production"
  "apps/web/e2e/.env.test"
  ".local-backup/snapshot.json"
  "apps/web/.local-backup/snapshot.json"
  "infra/deploy/overlays-secret.yaml"
  "certs/tls.pem"
  "certs/tls.key"
  "docs/session-reports/marker-report.txt"
  "test-results/marker.txt"
  "apps/web/test-results/marker.txt"
  "apps/web/playwright-report/marker.txt"
  "apps/web/.next/marker.txt"
  "apps/api/build/reports/marker.txt"
  "debug.log"
)
for p in "${LEAK_PATHS[@]}"; do mkdir -p "$COPY_DIR/$(dirname "$p")"; printf '%s %s\n' "$MARKER" "$p" > "$COPY_DIR/$p"; done

# 반드시 포함되어야 하는 빌드 입력
KEEP_PATHS=(
  "package.json" "package-lock.json" "apps/web/package.json" "apps/web/next.config.ts"
  "apps/web/tsconfig.json" "apps/web/.env.example" "apps/web/src/app/layout.tsx"
  "apps/web/public/next.svg" "apps/web/postcss.config.mjs"
)

# --- 2. 빌드 컨텍스트 검사 (Docker가 실제로 보내는 파일 목록) ------------------------------
# 컨텍스트 전체를 복사하는 probe 이미지로 .dockerignore 적용 결과를 본다.
context_list() { # $1 = context dir, $2 = output file
  local df="$WORK_DIR/probe.Dockerfile"
  printf 'FROM node:20-alpine\nCOPY . /ctx\nRUN cd /ctx && find . -type f | sort > /ctx-files.txt\n' > "$df"
  docker build -q -f "$df" -t "$PROBE_IMAGE" "$1" >/dev/null
  docker run --rm --entrypoint cat "$PROBE_IMAGE" /ctx-files.txt > "$2"
}

log "root build context (apps/web/Dockerfile)"
context_list "$COPY_DIR" "$OUT_DIR/context-root.txt"
for p in "${LEAK_PATHS[@]}"; do check "root context excludes $p" bash -c "! grep -qxF './$p' '$OUT_DIR/context-root.txt'"; done
for p in "${KEEP_PATHS[@]}"; do check "root context keeps $p" grep -qxF "./$p" "$OUT_DIR/context-root.txt"; done
check "root context has no node_modules" bash -c "! grep -q '/node_modules/' '$OUT_DIR/context-root.txt'"
printf 'root context files: %s\n' "$(wc -l < "$OUT_DIR/context-root.txt" | tr -d ' ')"

if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
  log "SKIP_BUILD=1 → 이미지 빌드·런타임 검사 건너뜀"
  printf '\nresult: %d passed, %d failed\n' "$pass" "$failed"; [[ $failed -eq 0 ]]; exit
fi

# --- 3. API jar (사본에서 빌드) + API 컨텍스트 ---------------------------------------------
log "gradle :apps:api:bootJar (copy)"
(cd "$COPY_DIR" && ./gradlew --no-daemon --console=plain :apps:api:bootJar) > "$OUT_DIR/gradle.log" 2>&1 \
  || { tail -30 "$OUT_DIR/gradle.log"; bad "gradle bootJar"; exit 1; }
check "api jar exists at Dockerfile COPY path" test -f "$COPY_DIR/$API_JAR"
# bootJar 뒤에 표식을 다시 심는다 (Gradle이 build/ 를 정리하지 않아도 확실히 존재하도록)
mkdir -p "$COPY_DIR/apps/api/build/reports" "$COPY_DIR/apps/api/src/main/resources"
printf '%s\n' "$MARKER" > "$COPY_DIR/apps/api/build/reports/marker.txt"
printf '%s\n' "$MARKER" > "$COPY_DIR/apps/api/.env"

log "api build context (apps/api)"
context_list "$COPY_DIR/apps/api" "$OUT_DIR/context-api.txt"
check "api context contains only the jar" \
  bash -c "[[ \"\$(cat '$OUT_DIR/context-api.txt')\" == './build/libs/api-0.1.0-SNAPSHOT.jar' ]]"

# --- 4. 이미지 빌드 ------------------------------------------------------------------------
log "docker build $API_IMAGE"
docker build -t "$API_IMAGE" -f "$COPY_DIR/apps/api/Dockerfile" "$COPY_DIR/apps/api" > "$OUT_DIR/docker-api.log" 2>&1 \
  && ok "api image build" || { tail -30 "$OUT_DIR/docker-api.log"; bad "api image build"; }

log "docker build $WEB_IMAGE (root context)"
docker build -t "$WEB_IMAGE" -f "$COPY_DIR/apps/web/Dockerfile" "$COPY_DIR" > "$OUT_DIR/docker-web.log" 2>&1 \
  && ok "web image build" || { tail -30 "$OUT_DIR/docker-web.log"; bad "web image build"; }
docker build -q --target builder -t "$WEB_IMAGE-builder" -f "$COPY_DIR/apps/web/Dockerfile" "$COPY_DIR" > /dev/null \
  && ok "web builder stage build" || bad "web builder stage build"

# 표식 문자열 또는 비밀 후보 파일이 이미지(builder 단계 포함)에 남았는지 확인한다.
scan_image() { # $1 image
  docker run --rm --user 0 --entrypoint sh "$1" -c "
    grep -rlF '$MARKER' / --exclude-dir=proc --exclude-dir=sys --exclude-dir=dev 2>/dev/null
    find / -xdev \\( -name '.env' -o -name '.env.*' -o -name '.local-backup' -o -name '*secret*.yaml' -o -name '*.pem' -o -name '*.key' \\) \
      ! -name '.env.example' ! -path '*/node_modules/*' ! -path '/etc/ssl*' ! -path '/usr/*' 2>/dev/null
  " || true
}
for img in "$WEB_IMAGE" "$WEB_IMAGE-builder" "$API_IMAGE"; do
  leaks="$(scan_image "$img")"
  if [[ -z "$leaks" ]]; then ok "no marker/secret candidates in $img"; else bad "leaks in $img: $leaks"; fi
done

# --- 5. API 런타임: 기본 non-root + health -------------------------------------------------
# 이전 실행에서 남긴 이 스크립트 전용 컨테이너만 지운다.
docker rm -f "$WEB_CONTAINER" "$API_CONTAINER" >/dev/null 2>&1 || true
log "api runtime (port $API_PORT)"
check "port $API_PORT free" port_free "$API_PORT"
image_user="$(docker image inspect --format '{{.Config.User}}' "$API_IMAGE")"
check "api image Config.User=$EXPECTED_API_UID:$EXPECTED_API_UID (got $image_user)" test "$image_user" = "$EXPECTED_API_UID:$EXPECTED_API_UID"
default_id="$(docker run --rm --entrypoint id "$API_IMAGE")"
check "api default user is non-root ($default_id)" test "$(docker run --rm --entrypoint id "$API_IMAGE" -u)" = "$EXPECTED_API_UID"

wait_http() { # $1 url → 0 when 200
  for _ in $(seq 1 60); do [[ "$(curl -s -o /dev/null -w '%{http_code}' "$1")" == "200" ]] && return 0; sleep 2; done; return 1
}
# 별도 Kubernetes 설정 없이(=securityContext 없이) 기본 실행
docker run -d --name "$API_CONTAINER" -p "127.0.0.1:$API_PORT:8080" "$API_IMAGE" >/dev/null
check "api health 200 (default user)" wait_http "http://127.0.0.1:$API_PORT/api/v1/health"
check "api java process uid=$EXPECTED_API_UID" test "$(docker exec "$API_CONTAINER" sh -c 'stat -c %u /proc/1')" = "$EXPECTED_API_UID"
check "api /api/v1/me 401 without session" \
  test "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$API_PORT/api/v1/me")" = "401"
docker logs "$API_CONTAINER" > "$OUT_DIR/api-default.log" 2>&1
docker rm -f "$API_CONTAINER" >/dev/null

# k8s 매니페스트와 같은 제약(읽기 전용 FS, /tmp 쓰기 가능, 권한 상승 금지, capability 제거)으로도 기동
docker run -d --name "$API_CONTAINER" -p "127.0.0.1:$API_PORT:8080" \
  --read-only --tmpfs /tmp --cap-drop ALL --security-opt no-new-privileges \
  --user "$EXPECTED_API_UID:$EXPECTED_API_UID" "$API_IMAGE" >/dev/null
check "api health 200 (read-only rootfs, cap-drop ALL)" wait_http "http://127.0.0.1:$API_PORT/api/v1/health"
docker logs "$API_CONTAINER" > "$OUT_DIR/api-restricted.log" 2>&1
docker rm -f "$API_CONTAINER" >/dev/null

# --- 6. Web 런타임: 보안 헤더 --------------------------------------------------------------
log "web runtime (port $WEB_PORT)"
check "port $WEB_PORT free" port_free "$WEB_PORT"
docker run -d --name "$WEB_CONTAINER" -p "127.0.0.1:$WEB_PORT:3000" "$WEB_IMAGE" >/dev/null
BASE="http://127.0.0.1:$WEB_PORT"
check "web / 200" wait_http "$BASE/"
check "web user uid 1001" test "$(docker exec "$WEB_CONTAINER" id -u)" = "1001"

headers_of() { curl -s -D - -o /dev/null "$1" | tr -d '\r'; }
chunk="$(curl -s "$BASE/" | grep -oE '/_next/static/[^"]+\.js' | head -1)"
check "found a static chunk in HTML ($chunk)" test -n "$chunk"
for path in "/" "/favicon.ico" "/next.svg" "$chunk" "/api/runtime-config"; do
  h="$(headers_of "$BASE$path")"
  printf '%s\n%s\n' "--- $path" "$h" >> "$OUT_DIR/web-headers.txt"
  check "$path status 200" grep -qE '^HTTP/[0-9.]+ 200' <<<"$h"
  check "$path no X-Powered-By" bash -c "! grep -qi '^x-powered-by:' <<<\"\$1\"" _ "$h"
  check "$path nosniff" grep -qi '^x-content-type-options: nosniff' <<<"$h"
  check "$path X-Frame-Options DENY" grep -qi '^x-frame-options: DENY' <<<"$h"
  check "$path CSP frame-ancestors" grep -qi "^content-security-policy: frame-ancestors 'none'" <<<"$h"
  check "$path Referrer-Policy" grep -qi '^referrer-policy: strict-origin-when-cross-origin' <<<"$h"
  check "$path Permissions-Policy" grep -qi '^permissions-policy: camera=()' <<<"$h"
  check "$path no HSTS (Gateway owns it)" bash -c "! grep -qi '^strict-transport-security:' <<<\"\$1\"" _ "$h"
done
check "static chunk keeps immutable cache" grep -qi '^cache-control: public, max-age=31536000, immutable' <<<"$(headers_of "$BASE$chunk")"
check "svg served as image/svg+xml" grep -qi '^content-type: image/svg+xml' <<<"$(headers_of "$BASE/next.svg")"
docker logs "$WEB_CONTAINER" > "$OUT_DIR/web.log" 2>&1

printf '\nresult: %d passed, %d failed (artifacts: %s)\n' "$pass" "$failed" "$OUT_DIR"
[[ $failed -eq 0 ]]
