# portfolio

Monorepo for four AI product case studies. Each project has its own web app, API and live URL, and they share one design system and one AI toolkit.

| Project                | Folder                  | Status                         |
| ---------------------- | ----------------------- | ------------------------------ |
| Race Engineering Agent | `apps/race-engineering` | Phase 4 · Technical foundation |
| Sketch → 3D            | —                       | Planned                        |
| London Museum Planner  | —                       | Planned                        |
| Tokensmith             | —                       | Planned                        |

## Layout

```txt
apps/<project>/web    Vite + React app
apps/<project>/api    Express API (Vercel Functions)
packages/config       TypeScript, ESLint and Vitest presets
packages/ui           design system: tokens, components, Storybook
packages/ai-core      runtime checker, guardrails, demo mode, evals
packages/telemetry    Race Engineering data model and lap tools
```

## Getting started

```sh
bun install
bun run dev         # all apps in demo mode, no keys needed
bun run test
bun run lint
bun run type-check
```

## Principles

- Facts come from deterministic tools; the AI picks, explains and is checked.
- Demo mode works without any keys and costs nothing.
- No secrets or raw recordings in git (pre-commit secret scan).

## Licence

Code: MIT (see `LICENSE`). Session data has its own licences; see `apps/race-engineering/web/public/data/NOTICE.md`.
