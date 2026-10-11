#!/usr/bin/env bash
set -euo pipefail
# Runs once on an empty verification PVC (executable: the entrypoint runs it, PGPASSWORD is exported). Keep the application role separate from the cluster administrator.
export PLANNET_APP_PASSWORD
PLANNET_APP_PASSWORD="$(cat /run/plannet/app_password)"
psql --username postgres --dbname postgres --no-psqlrc --set ON_ERROR_STOP=1 <<'SQL'
\getenv app_password PLANNET_APP_PASSWORD
CREATE ROLE plannet_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';
CREATE DATABASE plannet OWNER plannet_app TEMPLATE template0 ENCODING 'UTF8';
REVOKE ALL ON DATABASE plannet FROM PUBLIC;
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
REVOKE CONNECT ON DATABASE template1 FROM PUBLIC;
\connect plannet
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
unset PLANNET_APP_PASSWORD
