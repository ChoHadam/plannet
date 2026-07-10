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
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

### API

```bash
npm run api:dev
```

The API server runs on [http://localhost:8080](http://localhost:8080).
Health check:

```bash
curl http://localhost:8080/api/v1/health
```

## License

MIT
