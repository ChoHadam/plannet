#!/usr/bin/env python3
"""validate_manifests.py 회귀 검사: 실제 overlay 렌더 결과를 한 곳씩 망가뜨려 정책 위반을 잡는지 확인한다.

  python3 -B infra/deploy/scripts/test_validate_manifests.py   # kubectl(kustomize)·PyYAML 필요, 클러스터 불필요
"""
import copy
from pathlib import Path
import subprocess
import sys
import unittest

import yaml

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
from validate_manifests import validate  # noqa: E402

OVERLAYS = Path(__file__).resolve().parent.parent / "k8s" / "overlays"
# 운영 예제의 placeholder를 실제 적용 직전처럼 채운다 (strict 기준선이 통과해야 변형 검사가 의미 있다).
PRODUCTION_FILL = {
    "__SET_GATEWAY_PROXY_IP_REGEX__": r"10\.244\.0\.\d+",
    "registry.example.com": "registry.plannet.internal",
    "REPLACE_WITH_IMAGE_TAG": "3e08caa",
}


def render(overlay: str) -> list[dict]:
    text = subprocess.check_output(["kubectl", "kustomize", str(OVERLAYS / overlay)], text=True)
    if overlay == "production":
        for placeholder, value in PRODUCTION_FILL.items():
            text = text.replace(placeholder, value)
    return [doc for doc in yaml.safe_load_all(text) if doc]


RENDERED = {overlay: render(overlay) for overlay in ("production", "local-verify")}


def get(docs: list[dict], kind: str, name: str) -> dict:
    return next(d for d in docs if d["kind"] == kind and d["metadata"]["name"].startswith(name))


def api_container(docs):
    return get(docs, "Deployment", "plannet-api")["spec"]["template"]["spec"]["containers"][0]


def db_container(docs):
    return get(docs, "StatefulSet", "plannet-db")["spec"]["template"]["spec"]["containers"][0]


def db_policy(docs):
    return get(docs, "NetworkPolicy", "plannet-db-ingress")["spec"]


def remove(docs, kind, name):
    docs.remove(get(docs, kind, name))


def set_storage_false(docs):
    get(docs, "ConfigMap", "plannet-api-config")["data"]["PLANNET_STORAGE_ENABLED"] = "false"


def override_storage_env(docs):
    api_container(docs)["env"].append({"name": "PLANNET_STORAGE_ENABLED", "value": "false"})


def drop_db_password_ref(docs):
    container = api_container(docs)
    container["env"] = [e for e in container["env"] if e["name"] != "PLANNET_DB_PASSWORD"]


def optional_db_url_ref(docs):
    entry = next(e for e in api_container(docs)["env"] if e["name"] == "PLANNET_DB_URL")
    entry["valueFrom"]["secretKeyRef"]["optional"] = True


def literal_db_password(docs):
    entry = next(e for e in api_container(docs)["env"] if e["name"] == "PLANNET_DB_PASSWORD")
    entry.pop("valueFrom")
    entry["value"] = "not-a-secret"


def add_secret_document(docs):
    docs.append({"apiVersion": "v1", "kind": "Secret", "metadata": {"name": "plannet-db-secret", "namespace": "plannet"},
                 "stringData": {"APP_PASSWORD": "x"}})


LOCAL_MUTATIONS = {
    "storage=false in API ConfigMap": set_storage_false,
    "storage=false via API env override": override_storage_env,
    "missing DB password Secret ref": drop_db_password_ref,
    "optional DB URL Secret ref": optional_db_url_ref,
    "literal DB password": literal_db_password,
    "Secret rendered into manifests": add_secret_document,
    "DB StatefulSet removed": lambda d: remove(d, "StatefulSet", "plannet-db"),
    "DB Service removed": lambda d: remove(d, "Service", "plannet-db"),
    "DB Service NodePort": lambda d: get(d, "Service", "plannet-db")["spec"].update(type="NodePort"),
    "DB Service LoadBalancer": lambda d: get(d, "Service", "plannet-db")["spec"].update(type="LoadBalancer"),
    "DB Service externalIPs": lambda d: get(d, "Service", "plannet-db")["spec"].update(externalIPs=["192.0.2.10"]),
    "DB Service selector mismatch": lambda d: get(d, "Service", "plannet-db")["spec"].update(selector={"app": "other"}),
    "DB replicas 2": lambda d: get(d, "StatefulSet", "plannet-db")["spec"].update(replicas=2),
    "PVC deleted with StatefulSet": lambda d: get(d, "StatefulSet", "plannet-db")["spec"]
        ["persistentVolumeClaimRetentionPolicy"].update(whenDeleted="Delete"),
    "volumeClaimTemplates removed": lambda d: get(d, "StatefulSet", "plannet-db")["spec"].pop("volumeClaimTemplates"),
    "data replaced by emptyDir": lambda d: (get(d, "StatefulSet", "plannet-db")["spec"].pop("volumeClaimTemplates"),
        get(d, "StatefulSet", "plannet-db")["spec"]["template"]["spec"]["volumes"].append({"name": "data", "emptyDir": {}})),
    "PGDATA outside persistent mount": lambda d: next(e for e in db_container(d)["env"] if e["name"] == "PGDATA")
        .update(value="/tmp/pgdata"),
    "data mounted at PG17 path only": lambda d: next(m for m in db_container(d)["volumeMounts"] if m["name"] == "data")
        .update(mountPath="/var/lib/postgresql/data"),
    "DB admin password literal": lambda d: db_container(d)["env"].append({"name": "POSTGRES_PASSWORD", "value": "x"}),
    "DB runs as root": lambda d: get(d, "StatefulSet", "plannet-db")["spec"]["template"]["spec"]["securityContext"]
        .update(runAsNonRoot=False),
    "readiness via init socket": lambda d: db_container(d)["readinessProbe"]["exec"]
        .update(command=["pg_isready", "-U", "postgres"]),
    "startup via init socket": lambda d: db_container(d)["startupProbe"]["exec"]
        .update(command=["pg_isready", "-h", "/var/run/postgresql"]),
    "init script not executable": lambda d: next(v for v in get(d, "StatefulSet", "plannet-db")["spec"]["template"]
        ["spec"]["volumes"] if v["name"] == "init")["configMap"].pop("defaultMode"),
    "DB image latest": lambda d: db_container(d).update(image="postgres:latest"),
    "DB NetworkPolicy removed": lambda d: remove(d, "NetworkPolicy", "plannet-db-ingress"),
    "DB NetworkPolicy allows web": lambda d: db_policy(d)["ingress"][0]["from"].append(
        {"podSelector": {"matchLabels": {"app.kubernetes.io/name": "plannet-web"}}}),
    "DB NetworkPolicy allow-all rule": lambda d: db_policy(d)["ingress"].append({}),
    "DB NetworkPolicy empty from": lambda d: db_policy(d)["ingress"][0].pop("from"),
    "DB NetworkPolicy namespaceSelector": lambda d: db_policy(d)["ingress"][0]["from"][0].update(namespaceSelector={}),
    "DB NetworkPolicy ipBlock": lambda d: db_policy(d)["ingress"][0]["from"].append({"ipBlock": {"cidr": "0.0.0.0/0"}}),
    "DB NetworkPolicy extra port": lambda d: db_policy(d)["ingress"][0]["ports"].append({"protocol": "TCP", "port": 22}),
    "DB NetworkPolicy wrong target": lambda d: db_policy(d).update(podSelector={"matchLabels": {"app": "other"}}),
    "DB NetworkPolicy targets all pods": lambda d: db_policy(d).update(podSelector={}),
    "DB NetworkPolicy without Ingress type": lambda d: db_policy(d).update(policyTypes=["Egress"]),
    "default deny removed": lambda d: remove(d, "NetworkPolicy", "default-deny-ingress"),
    "default deny narrowed": lambda d: get(d, "NetworkPolicy", "default-deny-ingress")["spec"]
        .update(podSelector={"matchLabels": {"app.kubernetes.io/name": "plannet-web"}}),
}

PRODUCTION_MUTATIONS = {
    "storage=false in API ConfigMap": set_storage_false,
    "storage=false via API env override": override_storage_env,
    "missing DB password Secret ref": drop_db_password_ref,
    "optional DB URL Secret ref": optional_db_url_ref,
    "literal DB password": literal_db_password,
    "Secret rendered into manifests": add_secret_document,
    "rehearsal DB leaked into production": lambda d: d.extend(copy.deepcopy(
        [x for x in RENDERED["local-verify"] if x["metadata"]["name"].startswith("plannet-db")])),
    "mock provider leaked into production": lambda d: d.append(copy.deepcopy(
        get(RENDERED["local-verify"], "ConfigMap", "plannet-api-mock-provider"))),
    "unpinned image": lambda d: api_container(d).update(image="registry.plannet.internal/plannet-api:latest"),
    "default deny removed": lambda d: remove(d, "NetworkPolicy", "default-deny-ingress"),
    "API NetworkPolicy removed": lambda d: remove(d, "NetworkPolicy", "plannet-api-ingress"),
}


class ValidateManifestsTest(unittest.TestCase):
    def assert_rejected(self, overlay, mutations):
        for label, mutate in mutations.items():
            with self.subTest(overlay=overlay, mutation=label):
                docs = copy.deepcopy(RENDERED[overlay])
                mutate(docs)
                errors, _ = validate(overlay, docs, strict=True)
                self.assertTrue(errors, f"{overlay}: '{label}' 변형이 통과했습니다")

    def test_baselines_pass_strict(self):
        for overlay, docs in RENDERED.items():
            with self.subTest(overlay=overlay):
                errors, warnings = validate(overlay, copy.deepcopy(docs), strict=True)
                self.assertEqual((errors, warnings), ([], []))

    def test_production_example_placeholders_fail_strict(self):
        text = subprocess.check_output(["kubectl", "kustomize", str(OVERLAYS / "production")], text=True)
        errors, _ = validate("production", [d for d in yaml.safe_load_all(text) if d], strict=True)
        self.assertTrue(any("placeholder" in e for e in errors))

    def test_local_verify_regressions_rejected(self):
        self.assert_rejected("local-verify", LOCAL_MUTATIONS)

    def test_production_regressions_rejected(self):
        self.assert_rejected("production", PRODUCTION_MUTATIONS)


if __name__ == "__main__":
    unittest.main(verbosity=1)
