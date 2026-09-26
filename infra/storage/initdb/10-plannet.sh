#!/usr/bin/env bash
set -euo pipefail

# Runs only for a new, empty PostgreSQL volume. Credentials never become SQL
# command-line arguments or Docker container environment configuration.
export PLANNET_APP_PASSWORD
PLANNET_APP_PASSWORD="$(cat /run/plannet/app_password)"
psql --username "$POSTGRES_USER" --dbname postgres --no-psqlrc --set ON_ERROR_STOP=1 <<'SQL'
\getenv app_role PLANNET_APP_ROLE
\getenv app_database PLANNET_DATABASE
\getenv app_password PLANNET_APP_PASSWORD
CREATE ROLE :"app_role" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';
CREATE DATABASE :"app_database" OWNER :"app_role" TEMPLATE template0 ENCODING 'UTF8';
REVOKE ALL ON DATABASE :"app_database" FROM PUBLIC;
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
\connect :app_database
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SQL
unset PLANNET_APP_PASSWORD
