#!/usr/bin/env python3
"""Exercise real PostgreSQL on a new isolated project; never use the default DB."""

import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import secrets
import stat
import subprocess

from manage import APP_ROLE, DATABASE, Storage, run


def verify(port):
    profile = "verify-" + secrets.token_hex(6)
    storage = Storage(profile)
    checks = []
    created = False

    def passed(message):
        checks.append(message)
        print("PASS " + message)

    def fingerprint(database):
        return storage.sql("SELECT jsonb_agg(to_jsonb(p) ORDER BY user_id, kind, id)::text FROM storage_probe p;", database, admin=False)

    try:
        # init uses exclusive directory/file creation; no pre-existing profile is reused.
        storage.init(port)
        existing = run(["docker", "ps", "--all", "--quiet", "--filter", f"label=com.docker.compose.project={storage.project}"], capture_output=True, text=True)
        assert not existing.stdout.strip(), "Generated project name already has containers"
        for resource, name in (("volume", storage.volume), ("network", storage.project + "_default")):
            assert subprocess.run(["docker", resource, "inspect", name], capture_output=True).returncode != 0, "Generated resource name already exists"
        created = True
        storage.up()
        passed("PostgreSQL starts with a non-superuser app role")
        for name in ("admin.password", "app.password", "compose.env", "api.env"):
            assert stat.S_IMODE((storage.directory / name).stat().st_mode) == 0o600
        container = storage.compose("ps", "--quiet", "db", capture_output=True, text=True).stdout.strip()
        inspect = run(["docker", "inspect", container], capture_output=True, text=True).stdout
        metadata = json.loads(inspect)[0]
        assert metadata["HostConfig"]["PortBindings"]["5432/tcp"] == [{"HostIp": "127.0.0.1", "HostPort": str(port)}]
        for name in ("admin.password", "app.password"):
            assert (storage.directory / name).read_text().strip() not in inspect
        passed("Loopback-only port, mode 600 files, no literal passwords in container metadata")
        wrong_password = subprocess.run([
            "docker", "exec", container, "sh", "-c",
            'PGPASSWORD=definitely-wrong exec psql --host=127.0.0.1 --username=plannet_app --dbname=plannet -c "SELECT 1"',
        ], capture_output=True, text=True)
        assert wrong_password.returncode != 0 and "password authentication failed" in wrong_password.stderr
        passed("TCP password authentication rejects wrong credentials")
        storage.sql("""
CREATE TABLE storage_probe (
  user_id uuid NOT NULL, kind text NOT NULL, id text NOT NULL,
  version bigint NOT NULL, data jsonb, deleted boolean NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT '2026-09-26T00:00:00Z',
  PRIMARY KEY (user_id, kind, id)
);
INSERT INTO storage_probe(user_id, kind, id, version, data, deleted) VALUES
('00000000-0000-0000-0000-000000000001','daily','same-id',3,'{"title":"매일 읽기","todos":[{"completed":true}],"sourceId":"월간"}',false),
('00000000-0000-0000-0000-000000000002','daily','same-id',7,'{"title":"두 번째 계정","count":42}',false),
('00000000-0000-0000-0000-000000000001','monthly','same-id',2,'{"title":"Monthly","nested":{"enabled":true}}',false),
('00000000-0000-0000-0000-000000000001','daily','deleted-id',9,NULL,true);
CREATE SEQUENCE storage_probe_sequence;
SELECT nextval('storage_probe_sequence');
SELECT nextval('storage_probe_sequence');
""", DATABASE, admin=False)
        before = fingerprint(DATABASE)
        storage.compose("stop", "db")
        storage.up()
        assert fingerprint(DATABASE) == before
        passed("Rows, JSON, Unicode, account keys, versions and tombstones survive stop/start")
        archive = storage.backup(DATABASE, None)
        try:
            storage.backup(DATABASE, archive)
            raise AssertionError("Backup overwrote an existing file")
        except FileExistsError:
            passed("Backup refuses an existing output path")
        target = "plannet_restore_probe"
        storage.restore(archive, target)
        assert fingerprint(target) == before
        assert storage.sql("SELECT last_value FROM storage_probe_sequence;", target, admin=False) == "2"
        assert storage.sql("SELECT pg_get_userbyid(relowner) FROM pg_class WHERE relname = 'storage_probe';", target) == APP_ROLE
        passed("Custom-format dump restores equivalent rows, sequence value and app ownership to a new database")
        for existing in (DATABASE, target):
            try:
                storage.restore(archive, existing)
                raise AssertionError("Restore accepted an existing database")
            except RuntimeError as error:
                assert "Refusing existing database" in str(error)
        assert fingerprint(DATABASE) == before and fingerprint(target) == before
        passed("Restore refuses both source and existing destination, preserving both")
        storage.write_api_env(target)
        assert storage.api_env(target)["PLANNET_DB_URL"].endswith("/" + target)
        passed("Restored database has a separate compatible API env; default stays unchanged")
        report = {"verifiedAt": datetime.now(timezone.utc).isoformat(), "profile": profile, "port": port, "checks": checks, "backup": str(archive)}
        (storage.directory / "verification.json").write_text(json.dumps(report, indent=2) + "\n")
        print(f"Verification report: {storage.directory / 'verification.json'}")
    finally:
        if created:
            # Remove only resources created under this randomly generated profile.
            # Never use `down -v`, prune, a shared container name or a default volume.
            storage.compose("down")
            inspect = subprocess.run(["docker", "volume", "inspect", storage.volume], capture_output=True, text=True)
            if inspect.returncode == 0:
                labels = json.loads(inspect.stdout)[0].get("Labels") or {}
                assert profile.startswith("verify-") and labels.get("com.docker.compose.project") == storage.project
                run(["docker", "volume", "rm", storage.volume])
            print("Disposable containers/network/volume removed. Private backup and report retained locally.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=15433)
    verify(parser.parse_args().port)
