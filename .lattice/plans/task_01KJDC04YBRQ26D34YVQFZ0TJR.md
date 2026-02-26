# CTX-6: Context Arena Results Dashboard

## Goal
Build a Vite + React + TypeScript dashboard with a Bun/Hono API server to visualize Context Arena's 30 result JSON files across 7 tab views.

## Architecture
- `dashboard/` — Vite React app (frontend) on port 5173
- `dashboard/server.ts` — Hono + Bun API server on port 3001
- Vite dev server proxies `/api/*` to Hono backend

## File Structure
```
dashboard/
  server.ts              # Hono API server (port 3001)
  index.html             # Shell HTML
  frontend.tsx           # React root + tab state
  styles.css             # Tailwind dark theme
  components/
    Tabs.tsx             # Tab navigation
    Leaderboard.tsx      # View 1: strategy accuracy table
    RetentionByType.tsx  # View 2: fact type retention bars
    DepthComparison.tsx  # View 3: depth 1 vs 2 grouped bars
    RetentionCurve.tsx   # View 4: per-cycle retention lines
    RllmComparison.tsx   # View 5: RLLM vs hand-rolled bars
    TokenCost.tsx        # View 6: tokens per step lines
    CodeStrategies.tsx   # View 7: code classification pie
  lib/
    api.ts               # Typed fetch wrappers
    types.ts             # Shared TS types
    colors.ts            # Color palettes
```

## 7 API Endpoints + Views
1. `GET /api/leaderboard` → strategy accuracy table
2. `GET /api/retention-by-type` → fact type retention bars
3. `GET /api/depth-comparison` → depth 1 vs 2 grouped bars
4. `GET /api/retention-curve` → per-cycle retention lines
5. `GET /api/rllm-comparison` → RLLM vs hand-rolled bars
6. `GET /api/token-cost?scenario=X` → tokens per step lines
7. `GET /api/code-analysis` → code classification pie

## Dependencies
- Vite (react-ts template), Recharts, Tailwind CSS + @tailwindcss/vite
- Hono (API server in project root)

## Acceptance Criteria
- All 7 tabs render with real data from result JSON files
- Dark theme throughout
- Numbers match findings.md tables
- `bun run dashboard/server.ts` starts API, `cd dashboard && bun run dev` starts frontend
