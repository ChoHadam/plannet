# Plannet

A planner web application with various templates for goal setting and productivity.

## Templates

- **Mandalart** - 9x9 grid goal-setting tool
- **Block6** - Weekly planner with six daily time blocks
- **Monthly** - Monthly goals and weekly focus
- **Daily** - Daily todo list

## Features

- Account-owned PostgreSQL storage with local drafts, explicit import and version conflict protection
- Standalone LocalStorage mode when server storage is disabled
- Color customization per section
- XSS prevention with DOMPurify
- Responsive design

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- Zustand (State Management)
- Spring Boot/Kotlin API
- PostgreSQL 18 / Flyway

## Getting Started

### Web

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.
The planner can run locally without authentication. AI chat requires `AUTH_ENABLED=true`,
`API_INTERNAL_URL` pointing to the Spring API, and `OPENGATEWAY_API_KEY` / `OPENGATEWAY_BASE_URL`
in `apps/web/.env.local`. The server rejects AI requests unless Spring validates the session.

### API

```bash
npm run api:dev
```

The API server runs on [http://localhost:8080](http://localhost:8080).
Health check:

```bash
curl http://localhost:8080/api/v1/health
```

Google login uses Spring OAuth2. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` on the API process.
Serve both apps through one origin: route `/api/v1/**`, `/oauth2/**`, and `/login/oauth2/**` to Spring,
and other paths to Web. Register that origin's `/login/oauth2/code/google` callback in Google Console.
Starting the two servers separately does not configure this routing.

See the [authentication contract](docs/contracts/auth-v1.md) and [Web setup](docs/web-auth-integration.md)
for cookies, CSRF, runtime configuration, and deployment requirements.
When server storage is enabled, plans, recurring tasks and personal holidays are saved to PostgreSQL.
Each request is scoped to the authenticated account. Existing browser records can be explicitly imported;
their original copies are retained. Without server storage, the planner keeps using separate LocalStorage
namespaces. Browser caches remain accessible to someone using the same browser profile.
Public service readiness is tracked in the [roadmap](docs/roadmap-status.md).

### PostgreSQL (local now, home server later)

Requires Docker with Compose and Python 3.9+. Run initialization once:

```bash
npm run db:init
npm run db:up
npm run api:dev:storage
```

The database listens on `127.0.0.1:15432` and uses a persistent Docker volume. Credentials are generated
under the ignored `infra/storage/.local/` directory and passed to the API without printing them.
Provide the Google configuration and same-origin routing described above to use account storage.
The `prod` API profile requires storage by default; missing DB configuration stops startup.

Use `npm run db:backup` before moving to the home server. Restore into a **new database** using the
[PostgreSQL operations guide](docs/postgresql-operations.md); it covers transfer, verification and rollback.
The [storage design](docs/account-storage-design.md) explains ownership, import and conflicts.

### Checks

```bash
npm run check
npm run build:all
npm run web:test:e2e
npm run test:storage
```

E2E runs isolated local servers with mock authentication and AI providers; it does not verify actual Google login.
`test:storage` uses real PostgreSQL and Spring with a test OIDC provider and production Web build.
It requires Docker and available ports 3690–3695, and removes its disposable database on completion.

## License

MIT
