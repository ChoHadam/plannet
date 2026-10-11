FROM eclipse-temurin:21-jre
# 기본 실행 사용자를 non-root로 둔다. UID/GID는 infra/deploy/k8s/base/api.yaml 의 runAsUser/runAsGroup(10001)과 같다.
RUN groupadd --system --gid 10001 plannet \
 && useradd --system --uid 10001 --gid plannet --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin plannet
WORKDIR /app
COPY build/libs/api-0.1.0-SNAPSHOT.jar app.jar
EXPOSE 8080
# 숫자 UID로 지정해야 Kubernetes runAsNonRoot가 이미지 사용자를 검증할 수 있다.
USER 10001:10001
ENTRYPOINT ["java", "-jar", "app.jar"]
