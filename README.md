# Plannet

A planner web application with various templates for goal setting and productivity.

## Templates

- **Mandalart** - 9x9 grid goal-setting tool
- **Weekly Planner** - (Coming soon)

## Features

- Auto-save to LocalStorage
- Color customization per section
- XSS prevention with DOMPurify
- Responsive design

## Tech Stack

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- Zustand (State Management)
- Spring Boot/Kotlin API

## Getting Started

### Web

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.
The AI chat route requires `OPENGATEWAY_API_KEY` and `OPENGATEWAY_BASE_URL` in `apps/web/.env.local`.
Google login requires `AUTH_SECRET`, `AUTH_URL`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET`.

### API

```bash
npm run api:dev
```

The API server runs on [http://localhost:8080](http://localhost:8080).
Health check:

```bash
curl http://localhost:8080/api/v1/health
```

### Checks

```bash
npm run check
npm run build:all
```

## License

MIT
