# Plannet

A planner web application with templates for goal setting and productivity. The UI text is Korean.

> **Where this code lives:** the original repository (`ChoHadam/plannet`, development branch `feat/web-spring-auth`;
> its `main` is older) and the [`services`](https://github.com/MyoungHaSong/services) monorepo copy under `apps/plannet`
> keep the same application code and docs. Some changes described here may not be published until they are committed
> and merged. Run every command from the Plannet project root (`apps/plannet` in the monorepo). Monorepo-only notes
> (home-server deployment, files that differ per repository): [docs/guides/services-monorepo.md](docs/guides/services-monorepo.md).

Public address for the home-server deployment: `https://plannet.mhd-mhd.duckdns.org` (not deployed yet).
Deployment details: [docs/deployment-readiness.md](docs/deployment-readiness.md) and [infra/deploy/README.md](infra/deploy/README.md).

## Templates

- **Mandalart** - 9x9 grid goal-setting tool
- **Block6** - Weekly planner with six daily time blocks
- **Monthly** - Monthly goals and weekly focus
- **Daily** - Daily todo list

## Features

- Account-owned PostgreSQL storage with in-memory unsaved edits, explicit import and version conflict protection
- Standalone LocalStorage mode only when authentication is explicitly disabled for local development
- Color customization per section
- XSS prevention with DOMPurify
- Responsive design, touch-friendly controls and an installable home-screen web app (see below)

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- Zustand (State Management)
- Spring Boot/Kotlin API
- PostgreSQL 18 / Flyway

## Run modes

| | Local mode (quick start) | Account mode (advanced) |
|---|---|---|
| You need | Node.js and npm | Node.js, JDK 21, Docker with Compose, Python 3.9+, [Caddy](https://caddyserver.com/), your own Google OAuth client |
| Sign-in | None, single user | Google |
| Where plans are saved | This browser's LocalStorage for the exact address you open | PostgreSQL in a Docker volume on your computer |
| AI assistant | Not available | Optional, needs an OpenAI-compatible gateway |
| Backups | Mandalart JSON/PNG files; optional dev-server snapshots (see below) | `npm run db:backup` |
| Guide | Below | [Local setup guide](docs/guides/local-setup.md) |

## Quick start (local mode)

Command blocks are for Bash or zsh on macOS or Linux. On Windows, use WSL2 (not tested); when cloning on
Windows itself, enable `git config core.longpaths true` first.

Requires npm and a currently supported Node.js LTS release that is 20.9 or later
(20.9 is the minimum for Next.js 16).

```bash
git clone --branch feat/web-spring-auth https://github.com/ChoHadam/plannet.git
cd plannet
# or the monorepo copy: git clone https://github.com/MyoungHaSong/services.git && cd services/apps/plannet
npm ci
test -e apps/web/.env.local || cp apps/web/.env.example apps/web/.env.local
AUTH_ENABLED=false npm --workspace apps/web run dev -- --hostname 127.0.0.1 --port 3000
```

Open <http://localhost:3000>. Stop the server with `Ctrl+C`; run the last command again to restart.

- `npm ci` installs the exact versions in the project root's `package-lock.json` (the Plannet npm workspace).
- The copy step keeps an existing `apps/web/.env.local`. The `AUTH_ENABLED=false` prefix keeps local mode
  even if that file says `AUTH_ENABLED=true`, because variables already set in the shell take precedence over
  `.env.local`. The `OPENGATEWAY_*` placeholders are not used in local mode.
- `--hostname 127.0.0.1` keeps the server on this computer. `npm run dev` also works but listens on all
  network interfaces, and `npm run web:dev -- --hostname ...` does not forward the flags correctly.

### Where your data lives in local mode

- Plans are stored in browser LocalStorage for the exact origin. `http://localhost:3000`,
  `http://127.0.0.1:3000`, another port, another browser or another browser profile each start with
  separate, empty data. Use the same address every time.
- Nothing is sent to a database and nothing syncs between browsers or devices.
- Stopping and restarting the server keeps the data. A private/incognito window loses it when closed, and
  clearing site data or browsing data for the address deletes it.
- Backups are limited:
  - The Mandalart menu (`⋮`) saves the current Mandalart as JSON or PNG and can import Mandalart JSON.
    There is no file export for Block6, Monthly, Daily or for all plans at once.
  - Only under `next dev`, the sidebar's `백업 복원` dialog can turn on automatic snapshots for that browser.
    Snapshots of all plans are written to `apps/web/.local-backup/` (newest 20 kept, git-ignored) and can be
    restored from the same dialog. This is off by default and disabled in production builds.

### Optional: local production build

```bash
npm run web:build
mkdir -p apps/web/.next/standalone/apps/web/.next/static apps/web/.next/standalone/apps/web/public
cp -R apps/web/.next/static/. apps/web/.next/standalone/apps/web/.next/static/
cp -R apps/web/public/. apps/web/.next/standalone/apps/web/public/
AUTH_ENABLED=false LOCAL_BACKUP_ENABLED=false HOSTNAME=127.0.0.1 PORT=3000 \
  node apps/web/.next/standalone/apps/web/server.js
```

The app uses Next.js [`output: "standalone"`](https://nextjs.org/docs/app/api-reference/config/next-config-js/output),
so start `server.js` as above (the same path the [Dockerfile](apps/web/Dockerfile) runs) instead of
`npm start` / `next start`. The standalone server is configured by the environment variables on that command;
they keep local mode on and the dev-only snapshot backup off. Use the same <http://localhost:3000> address
to see the data saved by the dev server. Repeat the copy steps after each build.

## Account mode (Google + PostgreSQL)

Account mode runs three local processes behind one origin. A reverse proxy at `http://localhost:18080` sends
`/api/v1`, `/oauth2` and `/login/oauth2` to the Spring API and everything else to Next.js. Starting the API
and Web on separate ports without a proxy does not support Google sign-in. The
[local setup guide](docs/guides/local-setup.md) has the full recipe: Google client, private API environment
file, PostgreSQL, Caddy configuration, optional AI and backup/restore.

Background documents:
[authentication contract](docs/contracts/auth-v1.md),
[Web auth integration](docs/web-auth-integration.md),
[storage design](docs/account-storage-design.md),
[PostgreSQL operations](docs/postgresql-operations.md) (Korean).

Local-mode data does not move to account mode automatically. Account mode runs at `http://localhost:18080`,
a different browser origin from `http://localhost:3000`, so it cannot read local-mode LocalStorage; its
`로그인 전 기록 가져오기` option only sees records from the same origin. Keep your local-mode browser data and
any Mandalart JSON exports; Mandalart JSON can be imported again from the Mandalart menu.

In account mode, plans, recurring tasks and personal holidays are saved only to PostgreSQL.
Each request is scoped to the authenticated account. Unsaved edits and the exact pending request stay in
tab memory and in one per-account sessionStorage key (changed records only), so a page reload does not lose
them; the key is removed once the database acknowledges every change. Closing the tab is not a recovery
path: failed saves can be retried or explicitly downloaded before leaving the page. The planner does not fall
back to browser storage when server storage is unavailable. Existing browser originals remain unchanged
for explicit import or draft download; they remain accessible within the same browser profile.
Only explicit `AUTH_ENABLED=false` local mode uses LocalStorage for new planner data.

## Home-screen web app (iPhone / Android)

Plannet can be added to the home screen and opens in its own standalone window (`/manifest.webmanifest`,
code-drawn 3×3 icons at `/apple-icon` and `/icons/icon-192.png`, `/icons/icon-512.png`).

- iPhone/iPad (Safari): Share → **홈 화면에 추가** → Add.
- Android (Chrome): ⋮ menu → **홈 화면에 추가** or **앱 설치**.
- In the app, the sidebar footer has a `홈 화면에 추가` help entry (hidden when already opened from the home screen).

Boundaries: it is the same online site in a standalone window. There is no service worker, offline cache, push
notification or background sync, and storage is unchanged (account PostgreSQL; unsaved edits stay in the tab
until the server acknowledges them). Before closing or switching away from the app, check that the status shows
`서버에 저장됐어요`. Google sign-in returning to the standalone window and save behavior after iOS kills a
backgrounded app have not been verified on a physical device yet.

## Development checks

Run checks that match your change instead of every suite.

| Command | Needs | What it checks |
|---|---|---|
| `npm run web:lint` | Node | ESLint for the web app |
| `npm run api:test` | JDK 21 | API unit and integration tests |
| `npm --workspace apps/web exec -- playwright test e2e/templates.spec.ts` | Playwright Chromium | One E2E file against an isolated local stack |
| `npm run web:test:e2e` | Playwright Chromium | All default E2E tests (mock authentication and AI) |
| `npm run test:storage` | Playwright Chromium, Docker, JDK 21 | Real PostgreSQL and Spring with a test OIDC provider; uses ports 3690–3695 |

Install the browser once with `npm --workspace apps/web exec -- playwright install chromium`.
E2E tests start their own servers on dedicated ports and never call real Google or AI services.
`npm run check` runs `web:lint` and `api:test`; `npm run build:all` builds both apps.

## License

MIT. The full license text (`LICENSE` file) has not been added yet and should be added before open-source publication.
