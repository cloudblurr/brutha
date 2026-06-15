# Contributing to BRUTHA (grok-agent)

Thanks for contributing! This guide covers the local workflow.

## Setup

```bash
npm install
cp .env.example .env.local   # add your XAI_API_KEY
npm run dev
```

## Quality gates

Run these before opening a PR (CI runs the same):

```bash
npm run lint     # ESLint (no-explicit-any, prefer-const, next rules)
npm test         # Vitest unit + integration tests
npm run build    # Next.js production build + typecheck
```

## Adding a tool

1. Pick the right category module under `src/lib/tools/` (or create a new one).
2. Define the tool with a Zod `inputSchema` and an `execute` that returns a
   JSON-serializable result. On failure, return the uniform error shape
   `{ error: string, details?: unknown }` (see `src/lib/tools/_errors.ts`) —
   never throw.
3. For cacheable, repeatable network calls, wrap the body in `cached(key, fn)`
   from `src/lib/tools/_cache.ts`.
4. Add a unit test next to it (`*.test.ts`). Exercise both the success and the
   error path.
5. The tool is auto-registered via the category map in `src/lib/tool-registry.ts`.
   External/plugin tools can register at startup with `registerTool(name, tool)`.

## Database changes

Add a new migration object to `MIGRATIONS` in `src/lib/db.ts` with the next
version number. Never edit a migration that has already shipped.

## Commits & releases

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add convertTemperature tool
fix: handle empty weather response
docs: expand README testing section
```

Releases and `CHANGELOG.md` are generated with `npm run release`
(standard-version).

## Internationalization

User-facing UI strings go in `locales/*.json` and are read via `t()` from
`src/lib/i18n.ts` — avoid hard-coding new display strings in components.
