#!/usr/bin/env bash
# 스냅샷(snapshot-source.sh 결과)에서 Web/API 이미지를 만든다. 원본 저장소의 .next·build는 쓰지 않는다.
#
#   IMAGE_TAG=v20261001 ./build-images.sh          # 로컬 이미지 plannet-web:TAG, plannet-api:TAG
#   PLATFORM=linux/amd64 ./build-images.sh         # 배포 노드 아키텍처가 다를 때 (buildx)
#   RUN_API_TESTS=1 ./build-images.sh              # 스냅샷에서 API 테스트도 실행
#   SKIP_SNAPSHOT=1 ./build-images.sh              # 이미 만든 스냅샷 재사용
#
# 레지스트리 push는 하지 않는다. 결과 이미지 ID는 $ARTIFACTS_DIR/images.txt 에 남긴다.
source "$(dirname "$0")/lib.sh"
require docker java

[[ "${SKIP_SNAPSHOT:-0}" == "1" && -d "$SNAPSHOT_DIR" ]] || "$DEPLOY_DIR/scripts/snapshot-source.sh"
mkdir -p "$ARTIFACTS_DIR"

API_JAR="apps/api/build/libs/api-0.1.0-SNAPSHOT.jar" # apps/api/Dockerfile 의 COPY 경로
gradle_tasks=(":apps:api:bootJar")
[[ "${RUN_API_TESTS:-0}" == "1" ]] && gradle_tasks+=(":apps:api:test")

# --no-daemon: 다른 작업이 띄운 Gradle daemon을 재사용하지 않는다.
log "gradle ${gradle_tasks[*]} (snapshot)"
(cd "$SNAPSHOT_DIR" && ./gradlew --no-daemon --console=plain "${gradle_tasks[@]}") \
  > "$ARTIFACTS_DIR/gradle-build.log" 2>&1 || { tail -40 "$ARTIFACTS_DIR/gradle-build.log"; fail "gradle 실패"; }
[[ -f "$SNAPSHOT_DIR/$API_JAR" ]] || fail "API jar가 없습니다: $API_JAR"
if [[ "${RUN_API_TESTS:-0}" == "1" ]]; then
  rm -rf "$ARTIFACTS_DIR/api-test-results"
  cp -R "$SNAPSHOT_DIR/apps/api/build/test-results/test" "$ARTIFACTS_DIR/api-test-results"
fi

build_args=()
if [[ -n "${PLATFORM:-}" ]]; then
  build_args=(buildx build --platform "$PLATFORM" --load)
else
  build_args=(build)
fi

log "docker build $API_IMAGE:$IMAGE_TAG"
docker "${build_args[@]}" -t "$API_IMAGE:$IMAGE_TAG" -f "$SNAPSHOT_DIR/apps/api/Dockerfile" "$SNAPSHOT_DIR/apps/api" \
  > "$ARTIFACTS_DIR/docker-api.log" 2>&1 || { tail -40 "$ARTIFACTS_DIR/docker-api.log"; fail "API 이미지 빌드 실패"; }

log "docker build $WEB_IMAGE:$IMAGE_TAG"
docker "${build_args[@]}" -t "$WEB_IMAGE:$IMAGE_TAG" -f "$SNAPSHOT_DIR/apps/web/Dockerfile" "$SNAPSHOT_DIR" \
  > "$ARTIFACTS_DIR/docker-web.log" 2>&1 || { tail -40 "$ARTIFACTS_DIR/docker-web.log"; fail "Web 이미지 빌드 실패"; }

# 이미지 안에 비밀값 후보 파일이 없는지 확인한다 (.env*, 로컬 백업 스냅샷).
leaks="$(docker run --rm --entrypoint sh "$WEB_IMAGE:$IMAGE_TAG" -c \
  "find / -xdev \( -name '.env' -o -name '.env.*' -o -name '.local-backup' -o -name 'secret.local.yaml' \) 2>/dev/null | grep -v node_modules || true")"
[[ -z "$leaks" ]] || fail "Web 이미지에 비밀값 후보 파일이 있습니다: $leaks"

{
  echo "tag=$IMAGE_TAG"
  docker image inspect --format '{{index .RepoTags 0}} {{.Id}} {{.Architecture}} {{.Size}}' \
    "$API_IMAGE:$IMAGE_TAG" "$WEB_IMAGE:$IMAGE_TAG"
} > "$ARTIFACTS_DIR/images.txt"
log "images ready: $API_IMAGE:$IMAGE_TAG, $WEB_IMAGE:$IMAGE_TAG"
