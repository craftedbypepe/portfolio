# Decisions

Engineering decisions for the monorepo. Product decisions live in each project's PRD.

| Date       | Decision                                                                                                | Why                                                                             |
| ---------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 2026-11-19 | One monorepo for all projects; Bun + Turborepo; separate `web/` and `api/` packages per project         | Shared design system and AI toolkit; server-only code never reaches the browser |
| 2026-11-19 | Vite + React + React Router; Express on Vercel Functions; Mastra + AI SDK; Zod                          | Familiar, public tools; one URL per project, no CORS                            |
| 2026-11-19 | shadcn/ui + Tailwind + Storybook in `packages/ui`; Claude Design reads the design system from this repo | Code is the design source of truth                                              |
| 2026-11-19 | Vitest; MIT for code; session data keeps its own licences                                               |                                                                                 |
| 2026-11-19 | TypeScript pinned to 6.0.x                                                                              | typescript-eslint supports TypeScript < 6.1                                     |
