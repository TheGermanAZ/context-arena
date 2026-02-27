# Migrate Dashboard: Vite + Hono → Bun.serve() with HTML Imports

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate Vite, Hono, and the two-server dev setup. Unify the dashboard into a single `Bun.serve()` process with HTML imports, per CLAUDE.md conventions.

**Architecture:** Replace the current Vite dev server + Hono API server (port 3001) with a single `Bun.serve()` that serves the React SPA via HTML import and handles all `/api/*` routes in the same process. TanStack Query stays — it handles caching, error states, and loading states that are orthogonal to the server choice.

**Tech Stack:** Bun.serve() (fullstack), React 19, React Router 7, TanStack Query 5, Recharts 3, Tailwind 4, Zod 4, bun-plugin-tailwind

---

## What Changes

| Layer | Before | After |
|-------|--------|-------|
| Dev server | Vite (port 5173) + proxy to Hono (port 3001) | Single `Bun.serve()` (port 3000) |
| Build | `vite build` | `bun build` (via HTML import — automatic) |
| CSS | `@tailwindcss/vite` plugin | `bun-plugin-tailwind` in bunfig.toml |
| HTML | `index.html` served by Vite | `index.html` imported in server.ts |
| API | Hono routes with `new Hono()` | `Bun.serve({ routes: { "/api/*": ... } })` |
| Types | `vite/client` types | Remove (Bun provides its own) |
| HMR | Vite HMR | `Bun.serve({ development: { hmr: true, console: true } })` |

## What Does NOT Change

- **TanStack Query** — stays. Provides caching, loading/error states, staleTime, refetch logic. No replacement needed.
- **React Router** — stays. Client-side routing unchanged.
- **All React components** — untouched. Same pages, charts, sidebar, filter context.
- **API response shapes** — identical. Same Zod schemas, same types. Frontend doesn't know the server changed.
- **`api.ts` / `hooks.ts`** — unchanged. They `fetch('/api/...')` which works the same way.
- **FilterContext, useSyncURL** — unchanged.

---

## Task 1: Install dependencies and configure Tailwind

**Files:**
- Modify: `dashboard/package.json`
- Create: `dashboard/bunfig.toml`

**Step 1: Install bun-plugin-tailwind**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard
bun add bun-plugin-tailwind
```

**Step 2: Create bunfig.toml**

```toml
[serve.static]
plugins = ["bun-plugin-tailwind"]
```

**Step 3: Remove Vite packages**

```bash
bun remove vite @vitejs/plugin-react @tailwindcss/vite
```

**Step 4: Verify bun install clean**

```bash
bun install
```

Expected: No errors. `node_modules` updated.

**Step 5: Commit**

```bash
git add dashboard/package.json dashboard/bun.lock dashboard/bunfig.toml
git commit -m "chore: swap Vite deps for bun-plugin-tailwind"
```

---

## Task 2: Convert server.ts from Hono to Bun.serve()

This is the big task. The current `server.ts` is ~920 lines. The helper functions (readJsonFiles, parsers, type guards) stay identical — only the routing layer changes.

**Files:**
- Modify: `dashboard/server.ts`

**Step 1: Replace the Hono routing shell**

Current pattern (Hono):
```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';

const app = new Hono();
app.use('*', cors());

app.get('/api/leaderboard', async (c) => {
  // ... logic ...
  return c.json(result);
});

// ... 11 more routes ...

export default {
  port: 3001,
  fetch: app.fetch,
};
```

New pattern (Bun.serve):
```typescript
import index from './index.html';

// ... all helper functions, interfaces, parsers stay exactly the same ...

function corsHeaders(): HeadersInit {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data: unknown): Response {
  return Response.json(data, { headers: corsHeaders() });
}

Bun.serve({
  port: 3000,
  routes: {
    // SPA — Bun auto-bundles the HTML + its script/CSS imports
    "/": index,

    // API routes — each converted from Hono c.json() to Response.json()
    "/api/leaderboard": {
      async GET() {
        // ... same logic, return jsonResponse(result) instead of c.json(result) ...
      },
    },
    "/api/retention-by-type": {
      async GET() { /* ... */ },
    },
    "/api/depth-comparison": {
      async GET() { /* ... */ },
    },
    "/api/retention-curve": {
      async GET() { /* ... */ },
    },
    "/api/rllm-comparison": {
      async GET() { /* ... */ },
    },
    "/api/token-cost": {
      async GET(req) {
        const url = new URL(req.url);
        const scenario = url.searchParams.get('scenario') ?? undefined;
        // ... same logic ...
      },
    },
    "/api/code-analysis": {
      async GET() { /* ... */ },
    },
    "/api/scenario-heatmap": {
      async GET() { /* ... */ },
    },
    "/api/cost-accuracy": {
      async GET() { /* ... */ },
    },
    "/api/scenario-difficulty": {
      async GET() { /* ... */ },
    },
    "/api/parallel-benchmarks": {
      async GET() { /* ... */ },
    },
    "/api/journal": {
      async GET() { /* ... */ },
    },
  },

  // Fallback: serve the SPA for client-side routing
  fetch(req) {
    // For any non-API path not matched above, serve the SPA
    return new Response(Bun.file('./index.html'));
  },

  development: {
    hmr: true,
    console: true,
  },
});
```

**Conversion rules for each route handler:**
1. `async (c) => { ... return c.json(data); }` → `async GET() { ... return jsonResponse(data); }`
2. `c.req.query('scenario')` → `new URL(req.url).searchParams.get('scenario')`
3. Remove `import { Hono } from 'hono'` and `import { cors } from 'hono/cors'`
4. Add `import index from './index.html'` at top

**Step 2: Handle the SPA fallback for client-side routing**

The `fetch()` fallback ensures that paths like `/dashboard`, `/findings`, `/demo`, `/journal` all serve `index.html`, letting React Router handle them client-side. API routes are matched first by the `routes` object.

**Step 3: Verify the server starts**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard
bun --hot server.ts
```

Expected: Server starts on port 3000. No errors.

**Step 4: Verify API endpoints respond**

```bash
curl -s http://localhost:3000/api/leaderboard | head -c 200
curl -s http://localhost:3000/api/retention-by-type | head -c 200
curl -s http://localhost:3000/api/journal | head -c 200
```

Expected: JSON responses matching previous Hono output.

**Step 5: Verify SPA serves at root and subroutes**

```bash
curl -s http://localhost:3000/ | head -20
curl -s http://localhost:3000/dashboard | head -20
curl -s http://localhost:3000/findings | head -20
```

Expected: HTML with `<div id="root">` and bundled script tags.

**Step 6: Commit**

```bash
git add dashboard/server.ts
git commit -m "feat: migrate server.ts from Hono to Bun.serve() with HTML imports"
```

---

## Task 3: Remove Hono dependency

**Files:**
- Modify: `dashboard/package.json`

**Step 1: Uninstall hono**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard
bun remove hono
```

**Step 2: Verify no remaining hono imports**

```bash
grep -r "from 'hono'" dashboard/
```

Expected: No results.

**Step 3: Commit**

```bash
git add dashboard/package.json dashboard/bun.lock
git commit -m "chore: remove hono dependency"
```

---

## Task 4: Delete Vite config, update index.html and tsconfig

**Files:**
- Delete: `dashboard/vite.config.ts`
- Delete: `dashboard/public/vite.svg`
- Modify: `dashboard/index.html` (update favicon, remove Vite-specific bits)
- Modify: `dashboard/tsconfig.app.json` (remove `vite/client` types)

**Step 1: Delete vite.config.ts**

```bash
rm dashboard/vite.config.ts
rm dashboard/public/vite.svg
```

**Step 2: Update index.html — remove vite favicon reference**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Context Arena Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

(Just removes the `<link rel="icon" ... href="/vite.svg" />` line)

**Step 3: Update tsconfig.app.json — remove vite/client types**

Change:
```json
"types": ["vite/client"],
```
To:
```json
"types": [],
```

(Bun types are auto-included. If needed later: `"types": ["bun-types"]`)

**Step 4: Verify TypeScript compiles**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard
bunx tsc -b --noEmit
```

Expected: Clean compile. No errors.

**Step 5: Commit**

```bash
git add -A dashboard/vite.config.ts dashboard/public/ dashboard/index.html dashboard/tsconfig.app.json
git commit -m "chore: remove Vite config and references"
```

---

## Task 5: Update package.json scripts

**Files:**
- Modify: `dashboard/package.json`

**Step 1: Replace scripts**

Before:
```json
"scripts": {
  "dev": "vite",
  "build": "tsc -b && vite build",
  "lint": "eslint .",
  "test": "vitest run",
  "test:watch": "vitest",
  "preview": "vite preview"
}
```

After:
```json
"scripts": {
  "dev": "bun --hot server.ts",
  "build": "tsc -b",
  "lint": "eslint .",
  "test": "bun test",
  "test:watch": "bun test --watch"
}
```

Notes:
- `dev` now runs the unified server with HMR
- `build` only runs type-checking — Bun.serve() bundles on the fly in production too (or use `bun build` for static hosting)
- `preview` removed — `bun server.ts` in production mode is the preview
- `test` switches from vitest to bun test (tests may need minor vitest→bun:test migration)

**Step 2: Verify dev script works**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard
bun run dev
```

Expected: Server starts, serves SPA + API on single port.

**Step 3: Commit**

```bash
git add dashboard/package.json
git commit -m "chore: update scripts from Vite to Bun.serve()"
```

---

## Task 6: Update api.ts base URL (if needed)

**Files:**
- Modify: `dashboard/src/lib/api.ts` (only if needed)

The current `api.ts` uses relative URLs (`/api/leaderboard`). Since the SPA and API are now served from the same origin, **these should work unchanged**. No Vite proxy needed — the browser's `fetch('/api/...')` goes to the same server.

**Step 1: Verify — read api.ts and confirm all URLs are relative**

All URLs should be `/api/...` (no `http://localhost:3001`). If any are absolute, change them to relative.

**Step 2: Test in browser**

Open `http://localhost:3000` in browser. Navigate to `/dashboard`. Verify:
- Charts load with real data
- No CORS errors in console
- No 404s on API calls
- Client-side navigation works (click between Landing, Demo, Findings, Dashboard, Journal)

**Step 3: Commit (if changes needed)**

```bash
git add dashboard/src/lib/api.ts
git commit -m "fix: ensure api.ts uses relative URLs for unified server"
```

---

## Task 7: Smoke test all pages and API endpoints

**Files:** None (testing only)

**Step 1: Start the server**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard
bun --hot server.ts
```

**Step 2: Verify all 12 API endpoints**

```bash
for endpoint in leaderboard retention-by-type depth-comparison retention-curve rllm-comparison token-cost code-analysis scenario-heatmap cost-accuracy scenario-difficulty parallel-benchmarks journal; do
  status=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/api/$endpoint")
  echo "$endpoint: $status"
done
```

Expected: All return `200`.

**Step 3: Verify SPA routes serve HTML**

```bash
for route in / /dashboard /findings /demo /journal; do
  content_type=$(curl -s -o /dev/null -w "%{content_type}" "http://localhost:3000$route")
  echo "$route: $content_type"
done
```

Expected: All return `text/html` content type.

**Step 4: Verify TypeScript compiles clean**

```bash
bunx tsc -b --noEmit
```

**Step 5: Verify no remaining Vite/Hono references in source**

```bash
grep -r "from 'vite'" dashboard/src/ || echo "No vite imports"
grep -r "from 'hono'" dashboard/ || echo "No hono imports"
grep -r "vite" dashboard/package.json || echo "No vite in package.json"
```

Expected: No matches (except possibly eslint config mentioning vite plugin — that's fine to remove too).

---

## Task 8: Clean up Vitest → Bun test migration (optional)

**Files:**
- Modify: Any `*.test.ts` or `*.test.tsx` files

If tests exist using vitest APIs (`import { describe, it, expect } from 'vitest'`), change to:

```typescript
import { describe, it, expect } from 'bun:test';
```

The API is nearly identical. Main differences:
- `vi.fn()` → `mock()` from `bun:test`
- `vi.spyOn()` → not built-in (use manual mocks)

**Step 1: Find test files**

```bash
find dashboard -name "*.test.*" -type f
```

**Step 2: Convert imports if needed**

**Step 3: Run tests**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard
bun test
```

**Step 4: Remove vitest from devDependencies**

```bash
bun remove vitest
```

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: migrate tests from vitest to bun:test"
```

---

## Acceptance Criteria

- [ ] Single `bun --hot server.ts` serves both SPA and API on one port
- [ ] All 12 API endpoints return correct JSON (validated by existing Zod schemas)
- [ ] All 5 SPA routes render correctly with client-side navigation
- [ ] HMR works in development (edit a component, see change without refresh)
- [ ] Tailwind CSS processes correctly (no unstyled pages)
- [ ] No Hono or Vite imports remain in source
- [ ] TypeScript compiles clean
- [ ] `hono`, `vite`, `@vitejs/plugin-react`, `@tailwindcss/vite` removed from package.json

## Risk Notes

- **Bun HTML imports are relatively new** (v1.2.3+). If bundling issues arise with Recharts or React Router, the fallback is to use `bun build` separately and serve static files.
- **TanStack Query stays intentionally.** It provides loading states, error boundaries, caching, and staleTime — reimplementing this with raw fetch + useState would be a regression.
- **The fetch() fallback for SPA routing is critical.** Without it, direct navigation to `/dashboard` would 404. The `routes` object handles exact matches; `fetch()` catches everything else and serves index.html.
