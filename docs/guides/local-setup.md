# Local setup: account mode (Google + PostgreSQL)

This guide runs the full service on your own computer for one or a few Google accounts. For a single-user
planner without sign-in, use the local-mode [quick start](../../README.md#quick-start-local-mode) instead.

> Pre-release: in the original repository this guide targets the `feat/web-spring-auth` development branch; in the `services` monorepo run the commands from `apps/plannet` (see the README note).
> Commands are for Bash or zsh on macOS or Linux; on Windows use WSL2 (not tested).
>
> This recipe needs your own Google OAuth client. Automated tests cover the same routing with a test OIDC
> provider (`npm run test:storage`); they do not sign in to real Google.

## Overview

```
Browser ── http://localhost:18080 ── Caddy (127.0.0.1:18080)
                                       ├─ /api/v1, /oauth2, /login/oauth2 ─▶ Spring API  127.0.0.1:8080 ─▶ PostgreSQL 127.0.0.1:15432
                                       └─ everything else ─────────────────▶ Next.js Web 127.0.0.1:3000
```

Google sign-in, the session cookie and CSRF checks need one browser origin, so always open
`http://localhost:18080`. `http://127.0.0.1:18080` is a different origin and does not match the Google callback.

| Process | Address | Started by |
|---|---|---|
| PostgreSQL (Docker) | `127.0.0.1:15432` | `npm run db:up` |
| Spring API | `127.0.0.1:8080` | `npm run api:dev:storage` |
| Next.js Web | `127.0.0.1:3000` | `npm --workspace apps/web run dev -- ...` |
| Caddy | `127.0.0.1:18080` | `caddy run ...` |

## 1. Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js / npm | Supported LTS, 20.9 or later | Same as the quick start |
| JDK | 21 | The Gradle build requires a Java 21 toolchain and does not download one |
| Docker | Engine or Desktop with Compose v2 (`up --wait`) | Runs PostgreSQL 18 |
| Python | 3.9+ | Used by `infra/storage/db.sh` |
| Caddy | 2.x | External reverse proxy, not installed by this repository. See [Caddy install](https://caddyserver.com/docs/install) |

Run every command from the Plannet project root (`apps/plannet` in the `services` monorepo) after `npm ci`.

## 2. Create a Google OAuth client

In [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

1. Configure the OAuth consent screen. While it is in testing, add the Google accounts that will sign in as test users.
2. Create an OAuth client ID of type **Web application**.
3. Add this authorized redirect URI exactly:

   ```
   http://localhost:18080/login/oauth2/code/google
   ```

Keep the client ID and secret private. Do not commit them, paste them into issues, or put them in
`NEXT_PUBLIC_*` variables.

## 3. Private API environment file

The API does not read an env file by itself. Keep the Google settings in a private file outside the
repository and load it only into the API command.

```bash
mkdir -p "$HOME/.config/plannet"
touch "$HOME/.config/plannet/api-local.env"
chmod 600 "$HOME/.config/plannet/api-local.env"
```

Edit `$HOME/.config/plannet/api-local.env` with a text editor:

```dotenv
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:18080/login/oauth2/code/google
SERVER_ADDRESS=127.0.0.1
```

`SERVER_ADDRESS` makes Spring listen only on loopback (its default is all interfaces).
Do not set `SPRING_PROFILES_ACTIVE=prod`: that profile is for HTTPS deployments (secure-only cookies and
trusted proxy settings) and does not work over plain `http://localhost`.

## 4. PostgreSQL

```bash
npm run db:init   # once: generates private credentials under infra/storage/.local/ (git-ignored)
npm run db:up     # starts PostgreSQL on 127.0.0.1:15432 and checks the app login
```

`db:init` never overwrites an existing configuration. Database passwords are generated locally and are not
printed. Data is kept in a named Docker volume across restarts.

## 5. Spring API (terminal 1)

```bash
( set -a; . "$HOME/.config/plannet/api-local.env"; set +a; npm run api:dev:storage )
```

The parentheses keep the Google values inside this one command. `api:dev:storage` runs
`infra/storage/db.sh run`, which adds the generated database settings to the environment of
`./gradlew :apps:api:bootRun` without printing them. Flyway creates the tables on first start.

Check it from another terminal:

```bash
curl http://127.0.0.1:8080/api/v1/health
```

## 6. Next.js Web (terminal 2)

Create `apps/web/.env.local` if it does not exist (`test -e apps/web/.env.local || cp apps/web/.env.example apps/web/.env.local`)
and set these lines:

```dotenv
AUTH_ENABLED=true
API_INTERNAL_URL=http://127.0.0.1:8080
APP_ORIGINS=http://localhost:18080
```

- `API_INTERNAL_URL` is read only by the Web server to verify sessions; it is never sent to the browser.
- `APP_ORIGINS` must equal the address you open, or AI requests are rejected by the CSRF check.
- Remove the `OPENGATEWAY_*` placeholder lines unless you configure AI (step 9).

```bash
npm --workspace apps/web run dev -- --hostname 127.0.0.1 --port 3000
```

`.env.local` is read at startup; restart the Web server after editing it.

## 7. Caddy (terminal 3)

Save this as `$HOME/.config/plannet/Caddyfile`:

```caddyfile
http://localhost:18080 {
	bind 127.0.0.1

	@api path /api/v1 /api/v1/* /oauth2 /oauth2/* /login/oauth2 /login/oauth2/*
	handle @api {
		reverse_proxy 127.0.0.1:8080
	}
	handle {
		reverse_proxy 127.0.0.1:3000
	}
}
```

```bash
caddy run --config "$HOME/.config/plannet/Caddyfile" --adapter caddyfile
```

Only those three path groups go to Spring. Do not route all of `/api/*` to Spring: `/api/chat`,
`/api/backup` and `/api/runtime-config` belong to the Web server. Caddy forwards the original `Host`
header by default, which the CSRF origin check relies on. The `http://` site address keeps Caddy from
requesting HTTPS certificates. Caddy references: [path matcher](https://caddyserver.com/docs/caddyfile/matchers#path)
(exact path and `/*` prefix forms), [reverse_proxy headers](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#headers)
(Host is passed through unchanged).

## 8. Sign in

Open <http://localhost:18080> and choose `Google 로그인`. After sign-in the planner loads your account's data
from PostgreSQL.

Data created in local mode at `http://localhost:3000` is not moved here automatically. It is a different
browser origin, so `로그인 전 기록 가져오기` cannot see it. Keep that browser data and any
Mandalart JSON exports; Mandalart JSON can be imported from the Mandalart menu.

| Symptom | Likely cause |
|---|---|
| Landing shows `지금은 로그인을 사용할 수 없어요.` | Google values were not loaded into the API process (step 5) |
| Google shows `redirect_uri_mismatch` | The Console URI is not exactly `http://localhost:18080/login/oauth2/code/google` |
| After sign-in: `계정 저장소에 연결할 수 없어요.` | API was started with `npm run api:dev` instead of `api:dev:storage`, or PostgreSQL is not running |
| Page does not load | One of the four processes is stopped, or a port is already in use |

## 9. Optional: AI assistant

The AI assistant works only in account mode (`AUTH_ENABLED=true`) for signed-in users. Add to
`apps/web/.env.local` and restart the Web server:

```dotenv
OPENGATEWAY_API_KEY=your-key
OPENGATEWAY_BASE_URL=https://your-gateway.example.com/v1
OPENGATEWAY_MODEL=a-model-id-your-gateway-serves
```

The endpoint must support the OpenAI Chat Completions API. Always set `OPENGATEWAY_MODEL`: the built-in
default and the examples in `.env.example` are older model IDs that your provider may no longer serve.
Requests are rate-limited per user in Web server memory; see [Web auth integration](../web-auth-integration.md).

## 10. Stop and restart

Stop Caddy, Web and API with `Ctrl+C`. Then:

```bash
npm run db:stop   # stops PostgreSQL and keeps the data volume
```

Next time, run `npm run db:up` and repeat steps 5–7 (no `db:init`). Signing in again is required after the API
restarts because sessions are kept in API memory.

## 11. Backup and restore

```bash
npm run db:backup
```

This writes a `pg_dump` archive under `infra/storage/.local/default/backups/` and prints its SHA-256. The file
contains private account data; copy it to encrypted storage.

Restore always goes into a **new** database and never overwrites the current one:

```bash
./infra/storage/db.sh restore /absolute/path/to/backup.dump --target plannet_restored
```

To run the API against the restored database, name it explicitly:

```bash
( set -a; . "$HOME/.config/plannet/api-local.env"; set +a; ./infra/storage/db.sh run --database plannet_restored -- ./gradlew :apps:api:bootRun )
```

Without `--database`, the API keeps using the original `plannet` database. `npm run db:backup` always backs
up `plannet`; while you use the restored database, back it up by name:

```bash
./infra/storage/db.sh backup --database plannet_restored
```

Moving to another machine,
verification and rollback are covered in [PostgreSQL operations](../postgresql-operations.md) (Korean) and
[`infra/storage/README.md`](../../infra/storage/README.md).
