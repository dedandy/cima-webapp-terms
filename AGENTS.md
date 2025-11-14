# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains all runtime code. Group domain logic under `src/modules/terms`, shared UI pieces under `src/components`, and cross-cutting utilities in `src/lib`.
- Static assets (logos, downloadable PDFs, legal snippets) live in `public/assets`; reference them via `/assets/...` to keep import paths simple.
- Centralized configuration such as environment helpers or HTTP clients should sit in `src/config`. Keep every file under 300 lines to preserve readability.
- Tests mirror the source tree in `tests/unit` and `tests/e2e` so every module has a nearby suite. Use the same file names as their counterparts for quick diffing.

## Build, Test, and Development Commands
- `npm install` – installs dependencies; run after every branch switch that updates `package-lock.json`.
- `npm run dev` – launches the local dev server with hot reload at `http://localhost:5173`.
- `npm run build` – creates the production bundle in `dist/`; fails on unresolved imports or type errors.
- `npm run lint` – runs ESLint + Prettier checks; required before pushing.
- `npm run test` – executes the full Vitest suite (unit + component tests). Add `--watch` while iterating locally.

## Coding Style & Naming Conventions
- TypeScript everywhere; no implicit `any`. Enable `strict` in `tsconfig.json` and fix warnings immediately.
- Two-space indentation, 100-character soft wrap, single quotes in TS/JS, double quotes in JSON. Let Prettier handle formatting via `npm run lint -- --fix`.
- Components and hooks use PascalCase (`TermsSidebar.tsx`), helpers use camelCase (`formatLegalCode.ts`), constants SCREAMING_SNAKE_CASE. Keep CSS Modules in `*.module.scss` colocated with the component.

## Testing Guidelines
- Use Vitest + Testing Library for units/components, and Playwright for `tests/e2e`. Follow the `featureName.behavior.spec.ts` pattern.
- Aim for 90% branch coverage on modules touching regulatory copy; add regression tests for every bug fix involving copy parsing or routing.
- Prefer faking HTTP in tests via `msw` handlers stored in `tests/mocks`. Snapshot only for long-form legal text to detect accidental edits.

## Commit & Pull Request Guidelines
- Follow Conventional Commits (`feat: add terms sidebar navigation`). Scope components when useful (`fix(terms-modal): prevent double submit`).
- PRs should include: short problem statement, bullet summary of changes, test evidence (`npm run test` output), and screenshots/GIFs for UI deltas.
- Link the relevant issue or task ID in the PR description footer. Keep PRs under 400 lines of diff; split otherwise.

## Security & Configuration Tips
- Store API keys, tenant IDs, and legal content endpoints in `.env.local`; never commit secrets. Provide sanitized `.env.example` updates whenever a new variable is introduced.
- Review dependency alerts weekly; patch any high-severity vulnerability before the next release tag.
