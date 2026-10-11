#!/usr/bin/env python3
"""verify-down.sh 회귀 검사: 가짜 kind로 실행해 클러스터 부재가 확인될 때만 DB 자격 증명을 지우는지 확인한다.

  python3 -B infra/deploy/scripts/test_verify_down.py   # Docker·kind 클러스터를 호출하지 않는다
"""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parent / "verify-down.sh"
# FAKE_KIND_MODE: present(삭제 후 사라짐) | absent | fail(조회 실패) | hang(조회 무응답)
#                 | delete-fail(삭제 실패) | recheck-fail(삭제 후 조회 실패) | stuck(삭제 후에도 남음)
FAKE_KIND = """#!/usr/bin/env bash
echo "$*" >> "$FAKE_STATE/kind.calls"
mode="$FAKE_KIND_MODE"
case "$1 $2" in
  "get clusters")
    [[ "$mode" == fail ]] && { echo "failed to list clusters" >&2; exit 1; }
    [[ "$mode" == hang ]] && exec sleep 30
    if [[ -f "$FAKE_STATE/deleted" ]]; then
      [[ "$mode" == recheck-fail ]] && exit 1
      [[ "$mode" == stuck ]] && { echo plannet-verify; exit 0; }
      echo "No kind clusters found." >&2; exit 0
    fi
    echo other-cluster
    [[ "$mode" != absent ]] && echo plannet-verify
    exit 0 ;;
  "delete cluster")
    [[ "$mode" == delete-fail ]] && exit 1
    touch "$FAKE_STATE/deleted"; exit 0 ;;
esac
exit 2
"""
FAKE_DOCKER = """#!/usr/bin/env bash
echo "$*" >> "$FAKE_STATE/docker.calls"
exit 1
"""


class VerifyDownTest(unittest.TestCase):
    def run_down(self, mode: str, query_timeout: str = "5"):
        root = Path(tempfile.mkdtemp(prefix="plannet-verify-down-test-"))
        self.addCleanup(subprocess.run, ["rm", "-rf", str(root)])
        bin_dir, state, work = root / "bin", root / "state", root / "work"
        for directory in (bin_dir, state):
            directory.mkdir()
        credentials = work / "db-secrets"
        credentials.mkdir(parents=True, mode=0o700)
        for role in ("admin", "app"):
            (credentials / f"{role}.password").write_text("0" * 64)
        (credentials / "unrelated.txt").write_text("keep")
        for name, body in (("kind", FAKE_KIND), ("docker", FAKE_DOCKER)):
            (bin_dir / name).write_text(body)
            (bin_dir / name).chmod(0o755)
        env = {**os.environ, "PATH": f"{bin_dir}:{os.environ['PATH']}", "PLANNET_WORK_DIR": str(work),
               "FAKE_STATE": str(state), "FAKE_KIND_MODE": mode, "KIND_QUERY_TIMEOUT": query_timeout,
               "IMAGE_TAG": "test"}
        result = subprocess.run(["bash", str(SCRIPT)], env=env, capture_output=True, text=True, timeout=60)
        self.assertFalse((state / "docker.calls").exists(), "verify-down.sh 가 docker를 직접 호출했습니다")
        calls = (state / "kind.calls").read_text().splitlines()
        return result, credentials, calls

    def assert_credentials_kept(self, credentials: Path):
        self.assertEqual(sorted(p.name for p in credentials.iterdir()), ["admin.password", "app.password", "unrelated.txt"])

    def assert_credentials_removed(self, credentials: Path):
        self.assertEqual(sorted(p.name for p in credentials.iterdir()), ["unrelated.txt"])

    def test_failed_query_keeps_credentials_and_does_not_delete(self):
        for mode in ("fail", "hang"):
            with self.subTest(mode=mode):
                result, credentials, calls = self.run_down(mode, query_timeout="2")
                self.assertNotEqual(result.returncode, 0)
                self.assertNotIn("delete cluster", " ".join(calls))
                self.assert_credentials_kept(credentials)

    def test_unconfirmed_deletion_keeps_credentials(self):
        for mode in ("delete-fail", "recheck-fail", "stuck"):
            with self.subTest(mode=mode):
                result, credentials, _ = self.run_down(mode)
                self.assertNotEqual(result.returncode, 0)
                self.assert_credentials_kept(credentials)

    def test_confirmed_deletion_removes_only_owned_password_files(self):
        result, credentials, calls = self.run_down("present")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual([c for c in calls if c.startswith("delete")],
                         [f"delete cluster --name plannet-verify --kubeconfig {credentials.parent}/kubeconfig"])
        self.assertEqual(calls.count("get clusters"), 2)
        self.assert_credentials_removed(credentials)

    def test_confirmed_absent_cluster_removes_orphaned_credentials(self):
        result, credentials, calls = self.run_down("absent")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, ["get clusters"])
        self.assert_credentials_removed(credentials)


if __name__ == "__main__":
    unittest.main(verbosity=1)
