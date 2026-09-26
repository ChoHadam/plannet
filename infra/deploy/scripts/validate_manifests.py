#!/usr/bin/env python3
"""kustomize 렌더 결과(stdin)가 공개 배포 정책을 지키는지 검사한다. validate-manifests.sh 가 호출한다.

  python3 validate_manifests.py <overlay-name> [--strict] < rendered.yaml

--strict: 실제 적용 직전 검사. 예제 도메인·placeholder·이미지 태그 미지정을 실패로 본다.
"""
import re
import sys

import yaml

API_PREFIXES = {"/api/v1", "/oauth2", "/login/oauth2"}  # docs/contracts/auth-v1.md §1
CALLBACK_PATH = "/login/oauth2/code/google"
PLACEHOLDER = re.compile(r"__SET_[A-Z_]+__|REPLACE_WITH_[A-Z_]+|HOST_PLACEHOLDER|example\.com")
DB_SECRET_KEYS = ("PLANNET_DB_URL", "PLANNET_DB_USERNAME", "PLANNET_DB_PASSWORD")
SECRET_KEYS = ("OPENGATEWAY_API_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", *DB_SECRET_KEYS)

errors: list[str] = []
warnings: list[str] = []


def check(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)


def main() -> int:
    overlay = sys.argv[1]
    strict = "--strict" in sys.argv[2:]
    docs = [d for d in yaml.safe_load_all(sys.stdin) if d]
    by_kind: dict[str, list[dict]] = {}
    for doc in docs:
        by_kind.setdefault(doc["kind"], []).append(doc)

    def find(kind: str, name: str, namespace: str = "plannet") -> dict:
        for doc in by_kind.get(kind, []):
            meta = doc["metadata"]
            if meta["name"].startswith(name) and meta.get("namespace", namespace) == namespace:
                return doc
        errors.append(f"{kind}/{name} 이(가) 없습니다")
        return {}

    # 1. 비밀값: Secret 리소스와 ConfigMap 안의 비밀 키가 없어야 한다
    check("Secret" not in by_kind, "렌더 결과에 Secret이 있습니다. Secret은 매니페스트 밖에서 주입합니다")
    for cm in by_kind.get("ConfigMap", []):
        for key in cm.get("data", {}):
            check(key not in SECRET_KEYS, f"ConfigMap {cm['metadata']['name']} 에 비밀 키 {key} 가 있습니다")

    # 2. 설정값
    web_cfg = find("ConfigMap", "plannet-web-config").get("data", {})
    api_cfg = find("ConfigMap", "plannet-api-config").get("data", {})
    public = find("ConfigMap", "plannet-public").get("data", {})
    check(web_cfg.get("AUTH_ENABLED") == "true", "Web AUTH_ENABLED 는 true 여야 합니다")
    check(web_cfg.get("LOCAL_BACKUP_ENABLED") == "false", "Web LOCAL_BACKUP_ENABLED 는 false 여야 합니다")
    check(web_cfg.get("API_INTERNAL_URL") == "http://plannet-api:8080", "Web API_INTERNAL_URL 은 내부 Service 주소여야 합니다")
    for key in ("AI_RATE_LIMIT_PER_MINUTE", "AI_RATE_LIMIT_PER_DAY", "AI_GLOBAL_LIMIT_PER_DAY"):
        check(str(web_cfg.get(key, "")).isdigit() and int(web_cfg[key]) > 0, f"Web {key} 는 양의 정수여야 합니다")
    check(api_cfg.get("SPRING_PROFILES_ACTIVE") == "prod", "API SPRING_PROFILES_ACTIVE 는 prod 여야 합니다")
    expected_storage = "false" if overlay == "local-verify" else "true"
    check(api_cfg.get("PLANNET_STORAGE_ENABLED") == expected_storage,
          f"{overlay}: API PLANNET_STORAGE_ENABLED 는 {expected_storage} 여야 합니다")

    host = public.get("PUBLIC_HOST", "")
    origin = public.get("APP_ORIGINS", "")
    redirect = public.get("GOOGLE_REDIRECT_URI", "")
    proxies = public.get("PLANNET_TRUSTED_PROXIES", "")
    check(re.fullmatch(rf"https://{re.escape(host)}(:\d+)?", origin) is not None,
          f"APP_ORIGINS({origin}) 는 https://PUBLIC_HOST[:port] 하나여야 합니다")
    check(redirect == origin + CALLBACK_PATH, f"GOOGLE_REDIRECT_URI({redirect}) 는 APP_ORIGINS + {CALLBACK_PATH} 여야 합니다")
    check(proxies != "" and proxies not in (".*", ".+"), "PLANNET_TRUSTED_PROXIES 는 Gateway 프록시 대역으로 좁혀야 합니다")
    try:
        re.compile(proxies)
    except re.error as exc:
        errors.append(f"PLANNET_TRUSTED_PROXIES 정규식 오류: {exc}")

    # 3. 단일 replica, 내부 Service, Secret 참조
    for name in ("plannet-web", "plannet-api"):
        deploy = find("Deployment", name)
        spec = deploy.get("spec", {})
        check(spec.get("replicas") == 1, f"{name} replicas 는 1 이어야 합니다 (메모리 세션·호출 한도)")
        check(spec.get("strategy", {}).get("type") == "Recreate", f"{name} strategy 는 Recreate 여야 합니다")
        svc = find("Service", name)
        check(svc.get("spec", {}).get("type", "ClusterIP") == "ClusterIP", f"Service {name} 는 ClusterIP 여야 합니다")
        container = spec.get("template", {}).get("spec", {}).get("containers", [{}])[0]
        image = container.get("image", "")
        if strict:
            check(":" in image.rsplit("/", 1)[-1] and not image.endswith(":latest"), f"{name} 이미지 태그를 고정하세요: {image}")
    for doc in by_kind.get("Service", []):
        if doc["metadata"].get("namespace") == "plannet":
            check(doc["spec"].get("type", "ClusterIP") == "ClusterIP", f"Service {doc['metadata']['name']} 가 외부에 노출됩니다")

    # 운영 DB 값은 필수 Secret 참조. 인증 전용 local-verify에는 DB 참조 자체가 없어야 한다.
    api_container = find("Deployment", "plannet-api").get("spec", {}).get("template", {}).get("spec", {}).get("containers", [{}])[0]
    api_env = api_container.get("env", [])
    effective_storage = None
    configmaps = {doc["metadata"]["name"]: doc.get("data", {}) for doc in by_kind.get("ConfigMap", [])}
    for source in api_container.get("envFrom", []):
        source_config = configmaps.get(source.get("configMapRef", {}).get("name"), {})
        if "PLANNET_STORAGE_ENABLED" in source_config:
            effective_storage = source_config["PLANNET_STORAGE_ENABLED"]
    for entry in api_env:
        if entry.get("name") == "PLANNET_STORAGE_ENABLED":
            effective_storage = entry.get("value")
    check(effective_storage == expected_storage, f"{overlay}: API 환경변수가 storage={expected_storage} 정책을 덮어씁니다")
    for key in DB_SECRET_KEYS:
        entries = [entry for entry in api_env if entry.get("name") == key]
        if overlay == "local-verify":
            check(not entries, f"local-verify 인증 검증에는 {key} 참조를 제거해야 합니다")
        else:
            check(len(entries) == 1, f"운영 API {key} 필수 Secret 참조가 정확히 하나 필요합니다")
            if len(entries) == 1:
                ref = entries[0].get("valueFrom", {}).get("secretKeyRef", {})
                check("value" not in entries[0] and ref.get("name") == "plannet-api-secret" and ref.get("key") == key
                      and ref.get("optional", False) is False,
                      f"운영 API {key} 는 plannet-api-secret의 필수 secretKeyRef여야 합니다")

    # 4. 라우팅: API 경로만 API로, 나머지는 Web으로. HTTP 리스너는 redirect만.
    route = find("HTTPRoute", "plannet-app")
    api_paths, web_paths = set(), set()
    for rule in route.get("spec", {}).get("rules", []):
        backends = {b["name"] for b in rule.get("backendRefs", [])}
        paths = {m["path"]["value"] for m in rule.get("matches", []) if m.get("path", {}).get("type") == "PathPrefix"}
        if backends == {"plannet-api"}:
            api_paths |= paths
        elif backends == {"plannet-web"}:
            web_paths |= paths
        else:
            errors.append(f"예상하지 못한 backend: {backends}")
    check(api_paths == API_PREFIXES, f"API 경로가 계약과 다릅니다: {sorted(api_paths)}")
    check(web_paths == {"/"}, f"Web 경로는 / 하나여야 합니다: {sorted(web_paths)}")
    check(route.get("spec", {}).get("hostnames") == [host], "HTTPRoute host가 PUBLIC_HOST와 다릅니다")
    check(all(ref.get("sectionName") == "https" for ref in route.get("spec", {}).get("parentRefs", [])),
          "앱 HTTPRoute는 HTTPS 리스너에만 붙어야 합니다")
    redirect_route = find("HTTPRoute", "plannet-https-redirect")
    filters = [f for r in redirect_route.get("spec", {}).get("rules", []) for f in r.get("filters", [])]
    check(any(f.get("requestRedirect", {}).get("scheme") == "https" for f in filters), "HTTP→HTTPS redirect가 없습니다")
    check(not any(r.get("backendRefs") for r in redirect_route.get("spec", {}).get("rules", [])),
          "HTTP 리스너에 backend가 붙어 있습니다")
    gateway = find("Gateway", "plannet")
    for listener in gateway.get("spec", {}).get("listeners", []):
        if listener["name"] in ("https", "http"):
            check(listener.get("hostname") == host, f"Gateway 리스너 {listener['name']} host가 PUBLIC_HOST와 다릅니다")
        if listener["protocol"] == "HTTPS":
            check(listener.get("tls", {}).get("mode") == "Terminate", f"리스너 {listener['name']} TLS 설정이 없습니다")

    # 5. NetworkPolicy
    policies = {p["metadata"]["name"] for p in by_kind.get("NetworkPolicy", [])}
    check({"default-deny-ingress", "plannet-web-ingress", "plannet-api-ingress"} <= policies, "NetworkPolicy가 빠졌습니다")

    # 6. placeholder (strict 에서만 실패)
    rendered = yaml.safe_dump_all(docs)
    found = sorted(set(PLACEHOLDER.findall(rendered)))
    if found:
        (errors if strict else warnings).append(f"placeholder가 남아 있습니다: {found}")
    if overlay != "local-verify":
        check("plannet-mocks" not in rendered and "PLANNET_AUTH_GOOGLE_PROVIDER" not in rendered,
              "검증용 대역 설정이 운영 overlay에 섞였습니다")

    for message in warnings:
        print(f"  WARN  {message}")
    for message in errors:
        print(f"  FAIL  {message}")
    summary = f"{overlay}: {len(docs)} resources, host={host}, callback={redirect}"
    print(("  OK    " if not errors else "  ERROR ") + summary)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
