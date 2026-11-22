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

## PR screenshots

Every PR that changes UI shows screenshots at the standard viewports (mobile 390×844, tablet 834×1194,
laptop 1280×800, wide 1536×960; defined in `packages/ui/src/breakpoints.ts`).

```sh
# 1. Build what you want to capture (app or Storybook), then:
bun run screenshots --serve apps/race-engineering/web/dist --spa --out .screenshots/pr-12 --shot home=/
bun run screenshots --serve packages/ui/storybook-static --out .screenshots/pr-12 \
  --shot sample="/iframe.html?id=sketch-primitives--sample-screen&viewMode=story" --dark

# 2. Upload to the pr-assets branch and add the table to the PR description:
bun run screenshots:publish 12 .screenshots/pr-12 --ticket SIE-72
```

Images live on the `pr-assets` branch (never merged). `.screenshots/` is git-ignored.

## Principles

- Facts come from deterministic tools; the AI picks, explains and is checked.
- Demo mode works without any keys and costs nothing.
- No secrets or raw recordings in git (pre-commit secret scan).

## Licence

Code: MIT (see `LICENSE`). Session data has its own licences; see `apps/race-engineering/web/public/data/NOTICE.md`.
