#!/usr/bin/env python3
"""Local PostgreSQL operations; Python standard library + Docker Compose only."""

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys

ROOT = Path(__file__).resolve().parent
STATE_ROOT = ROOT / ".local"
DEFAULT_PORT = 15432
DATABASE = "plannet"
APP_ROLE = "plannet_app"
IDENTIFIER = re.compile(r"[a-z][a-z0-9_]{0,62}\Z")
PROFILE = re.compile(r"[a-z][a-z0-9-]{0,35}\Z")
os.umask(0o077)


def fail(message):
    raise RuntimeError(message)


def run(command, **kwargs):
    return subprocess.run(command, check=True, **kwargs)


def identifier(value):
    if not IDENTIFIER.fullmatch(value) or value in {"postgres", "template0", "template1"}:
        fail("Use a non-system database name: lowercase letters, digits, underscores; max 63 characters.")
    return value


def private_write(path, value):
    with path.open("x", encoding="utf-8") as stream:
        stream.write(value)


class Storage:
    def __init__(self, profile):
        if not PROFILE.fullmatch(profile):
            fail("Profile must start with a lowercase letter; use lowercase letters, digits and hyphens (max 36).")
        self.profile = profile
        self.directory = STATE_ROOT / profile
        self.project = "plannet-storage" + ("" if profile == "default" else "-" + profile)
        self.volume = self.project + "-pg18"

    def init(self, port):
        if not 1024 <= port <= 65535:
            fail("Choose a host port between 1024 and 65535.")
        self.directory.mkdir(parents=True, exist_ok=False, mode=0o700)
        private_write(self.directory / "admin.password", secrets.token_hex(32) + "\n")
        private_write(self.directory / "app.password", secrets.token_hex(32) + "\n")
        config = {"port": port, "project": self.project, "volume": self.volume}
        private_write(self.directory / "config.json", json.dumps(config, indent=2) + "\n")
        compose = {
            "PLANNET_PG_PORT": str(port),
            "PLANNET_PG_VOLUME": self.volume,
            "PLANNET_DATABASE": DATABASE,
            "PLANNET_APP_ROLE": APP_ROLE,
            "PLANNET_ADMIN_PASSWORD_FILE": str(self.directory / "admin.password"),
            "PLANNET_APP_PASSWORD_FILE": str(self.directory / "app.password"),
        }
        # Compose's single-quoted dotenv values preserve literal dollar signs.
        def quote(value):
            if "\n" in value or "\r" in value:
                fail("Newlines in the checkout path are unsupported.")
            return "'" + value.replace("'", "\\'") + "'"
        private_write(self.directory / "compose.env", "".join(f"{key}={quote(value)}\n" for key, value in compose.items()))
        self.write_api_env(DATABASE)
        print(f"Created private configuration: {self.directory}")
        print("Passwords are generated locally and are not printed. Existing configuration is never replaced.")

    def config(self):
        path = self.directory / "config.json"
        if not path.is_file():
            fail(f"Initialize this profile first: {ROOT / 'db.sh'} --profile {self.profile} init")
        config = json.loads(path.read_text())
        if config.get("project") != self.project or config.get("volume") != self.volume:
            fail("Configuration does not match this profile; do not copy profile files across machines.")
        return config

    def compose(self, *arguments, **kwargs):
        self.config()
        return run([
            "docker", "compose", "--project-name", self.project,
            "--env-file", str(self.directory / "compose.env"),
            "--file", str(ROOT / "compose.yaml"), *arguments,
        ], **kwargs)

    def pg(self, program, *arguments, admin=False, **kwargs):
        secret = "admin_password" if admin else "app_password"
        user = "postgres" if admin else APP_ROLE
        return self.compose(
            "exec", "-T", "db", "sh", "-c",
            f'export PGPASSWORD="$(cat /run/plannet/{secret})"; exec "$@"',
            "plannet-pg", program, "--host=127.0.0.1", f"--username={user}",
            *arguments, **kwargs,
        )

    def sql(self, statement, database="postgres", admin=True):
        return self.pg(
            "psql", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--tuples-only", "--no-align",
            f"--dbname={database}", admin=admin, input=statement, text=True, capture_output=True,
        ).stdout.strip()

    def up(self):
        self.config()
        # An explicitly named volume must not silently adopt some other service's data.
        result = subprocess.run(["docker", "volume", "inspect", self.volume], capture_output=True, text=True)
        if result.returncode == 0:
            labels = json.loads(result.stdout)[0].get("Labels") or {}
            if labels.get("com.docker.compose.project") != self.project:
                fail(f"Refusing unrelated existing volume: {self.volume}")
        self.compose("up", "--detach", "--wait", "--wait-timeout", "120", "db")
        if self.sql("SELECT current_user;", DATABASE, admin=False) != APP_ROLE:
            fail("Application database authentication failed.")
        self.status()

    def status(self):
        self.compose("ps", "db")
        version = self.sql("SHOW server_version;")
        flags = self.sql("SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = 'plannet_app';")
        if flags != "f|f|f|f|f":
            fail("Application role has unexpected elevated privileges.")
        print(f"PostgreSQL {version}; application role: {APP_ROLE} (no elevated cluster privileges)")
        print(f"Loopback connection: 127.0.0.1:{self.config()['port']}/{DATABASE}")
        print(f"Persistent volume: {self.volume}")
        print(f"Private API environment: {self.directory / 'api.env'}")

    def api_env(self, database):
        identifier(database)
        password = (self.directory / "app.password").read_text().strip()
        if not re.fullmatch(r"[a-f0-9]{64}", password):
            fail("Application password file is invalid. Do not regenerate credentials for an existing volume.")
        return {
            "PLANNET_STORAGE_ENABLED": "true",
            "PLANNET_DB_URL": f"jdbc:postgresql://127.0.0.1:{self.config()['port']}/{database}",
            "PLANNET_DB_USERNAME": APP_ROLE,
            "PLANNET_DB_PASSWORD": password,
        }

    def write_api_env(self, database):
        target = self.directory / ("api.env" if database == DATABASE else f"api-{identifier(database)}.env")
        private_write(target, "".join(f"{key}={value}\n" for key, value in self.api_env(database).items()))
        print(f"API environment written (mode 600): {target}")

    def backup(self, database, destination):
        identifier(database)
        if destination is None:
            backup_dir = self.directory / "backups"
            backup_dir.mkdir(mode=0o700, exist_ok=True)
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
            destination = backup_dir / f"{database}-{stamp}.dump"
        destination = Path(os.path.abspath(Path(destination).expanduser()))
        # Exclusive creation prevents replacing either a previous backup or a symlink target.
        with destination.open("xb") as output:
            try:
                self.pg("pg_dump", "--format=custom", "--no-owner", "--no-privileges", f"--dbname={database}", stdout=output)
            except BaseException:
                destination.unlink()
                raise
        checksum = hashlib.sha256()
        with destination.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                checksum.update(chunk)
        digest = checksum.hexdigest()
        print(f"Backup created: {destination}")
        print(f"SHA-256: {digest}")
        print("Contains private account data. Copy it to encrypted storage on another device.")
        return destination

    def restore(self, archive, target):
        identifier(target)
        archive = Path(archive).expanduser().resolve()
        with archive.open("rb") as stream:
            if stream.read(5) != b"PGDMP":
                fail("Restore requires a pg_dump custom-format archive.")
        # Never accept a caller-supplied existing 'empty' DB: create a brand-new target ourselves.
        if self.sql(f"SELECT 1 FROM pg_database WHERE datname = '{target}';"):
            fail(f"Refusing existing database '{target}'. Choose a NEW database name.")
        with archive.open("rb") as stream:
            self.compose("exec", "-T", "db", "pg_restore", "--list", stdin=stream, stdout=subprocess.DEVNULL)
        self.sql(f'CREATE DATABASE "{target}" OWNER "{APP_ROLE}" TEMPLATE template0 ENCODING \'UTF8\';\nREVOKE ALL ON DATABASE "{target}" FROM PUBLIC;')
        self.sql("REVOKE CREATE ON SCHEMA public FROM PUBLIC;", target)
        try:
            with archive.open("rb") as stream:
                self.pg("pg_restore", "--exit-on-error", "--single-transaction", "--no-owner", "--no-privileges", f"--dbname={target}", stdin=stream)
        except BaseException:
            print(f"Restore failed. Target '{target}' is retained for inspection; original databases were not overwritten.", file=sys.stderr)
            raise
        print(f"Restored into new database: {target}")
        print("Verify data before changing the API connection. The current API environment was not changed.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", default="default", help="Independent local configuration and Docker project")
    commands = parser.add_subparsers(dest="action", required=True)
    init = commands.add_parser("init", help="Generate private credentials once; never overwrite")
    init.add_argument("--port", type=int, default=DEFAULT_PORT)
    commands.add_parser("up", help="Start PostgreSQL and verify app authentication")
    commands.add_parser("status", help="Show connection, volume and role status without secrets")
    commands.add_parser("stop", help="Stop only this profile, retaining its database volume")
    backup = commands.add_parser("backup", help="Create an exclusive custom-format backup")
    backup.add_argument("--database", default=DATABASE)
    backup.add_argument("--output", type=Path)
    restore = commands.add_parser("restore", help="Restore a trusted archive into a NEW database")
    restore.add_argument("archive", type=Path)
    restore.add_argument("--target", required=True)
    env = commands.add_parser("api-env", help="Create a private API env file for a restored database")
    env.add_argument("--database", required=True)
    execute = commands.add_parser("run", help="Run a host command with the DB environment (never print secrets)")
    execute.add_argument("--database", default=DATABASE)
    execute.add_argument("command", nargs=argparse.REMAINDER)
    args = parser.parse_args()
    storage = Storage(args.profile)
    if args.action == "init":
        storage.init(args.port)
    elif args.action == "up":
        storage.up()
    elif args.action == "status":
        storage.status()
    elif args.action == "stop":
        storage.compose("stop", "db")
        print(f"Stopped. Persistent volume retained: {storage.volume}")
    elif args.action == "backup":
        storage.backup(args.database, args.output)
    elif args.action == "restore":
        storage.restore(args.archive, args.target)
    elif args.action == "api-env":
        database = identifier(args.database)
        if storage.sql("SELECT current_user;", database, admin=False) != APP_ROLE:
            fail("Application role cannot connect to target database.")
        storage.write_api_env(database)
    elif args.action == "run":
        command = args.command[1:] if args.command[:1] == ["--"] else args.command
        if not command:
            fail("Specify a command after --, for example: run -- ./gradlew :apps:api:bootRun")
        environment = os.environ.copy()
        environment.update(storage.api_env(args.database))
        os.execvpe(command[0], command, environment)


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        # Captured PostgreSQL errors do not include credential arguments.
        print(f"Database command failed (exit {error.returncode}).", file=sys.stderr)
        if error.stderr:
            print(error.stderr, file=sys.stderr)
        sys.exit(1)
    except (RuntimeError, OSError, ValueError) as error:
        print(f"Error: {error}", file=sys.stderr)
        sys.exit(1)
