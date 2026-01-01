# Claude Code Guidelines

## Project Overview
Mandalart - A 9x9 grid goal-setting web application built with Next.js.

## Tech Stack
- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **State Management**: Zustand with persist middleware
- **Security**: DOMPurify for XSS prevention
- **Language**: TypeScript

## Commit Message Convention
- Use English for all commit messages
- Follow conventional commits format:
  - `feat:` new feature
  - `fix:` bug fix
  - `refactor:` code refactoring
  - `style:` styling changes
  - `docs:` documentation
  - `chore:` maintenance tasks

## Code Style
- Use TypeScript strict mode
- Prefer functional components with hooks
- Use `'use client'` directive for client components
- Sanitize all user inputs with DOMPurify

## Project Structure
```
src/
├── app/           # Next.js App Router pages
├── components/    # React components
├── hooks/         # Custom hooks (Zustand stores)
├── lib/           # Utilities and constants
└── types/         # TypeScript type definitions
```

## Key Features
- Auto-save to LocalStorage
- Color customization per grid section
- Cell synchronization between center and outer grids
- Outer grids activate only when sub-goals are entered
