# Context Arena Frontend Redesign

## Problem

The dashboard is a functional v1 — 7 views behind a sidebar, stock Recharts styling, one view at a time. It serves personal analysis but falls short for collaborators (can't see multiple panels), demo viewers (no narrative), and discovery (no explainer). Charts lack visual polish, data fetching has no caching/deduplication, and view state isn't URL-shareable.

## Audiences

| Audience | Need | Route |
|----------|------|-------|
| Discovery / social | "What is Context Arena?" | `/` |
| Demo / portfolio | Guided narrative with key insights | `/demo` |
| Collaborators | Multi-panel exploration with filters | `/dashboard` |
| Personal research | Same as collaborators, with export | `/dashboard` |
| LLM app developers | Strategy recommendation (Phase 2) | `/recommend` |
| Social sharing | Embeddable card images (Phase 2) | `/card/:metric` |

## Phasing

**Phase 1 (current):** Landing + Demo + Dashboard with export, TanStack Query, URL state.
**Phase 2 (deferred):** Strategy recommender wizard + shareable card image generation.

## Route Map (Phase 1)

```
/                → Landing/explainer
/demo            → Data storytelling (scrollable narrative)
/dashboard       → Multi-panel analytics workspace
```

## Shared Infrastructure

### TanStack Query Data Layer

Replace all 7 `useEffect` + `useState` patterns with TanStack Query hooks:

```ts
// lib/hooks.ts
export function useLeaderboard() {
  return useQuery({ queryKey: ['leaderboard'], queryFn: api.leaderboard });
}
export function useRetentionByType() { ... }
export function useDepthComparison() { ... }
export function useRetentionCurve() { ... }
export function useRllmComparison() { ... }
export function useTokenCost(scenario?: string) { ... }
export function useCodeAnalysis() { ... }
```

Benefits: automatic caching, deduplication across panels, background refetch, loading/error states, cache shared across route transitions.

### React Router

Client-side routing with `createBrowserRouter`. Three routes with layout wrappers.

### FilterProvider (React Context)

Holds domain-based focus state + panel selection. Replaces current prop-drilling of `focused`/`onFocusClick` through App.

```ts
interface FilterState {
  focusedStrategy: string | null;
  focusedType: string | null;
  focusedScenario: string | null;
  focusedCategory: string | null;
  panels: string[];        // active panel IDs
  scenario: string | null; // for TokenCost scenario selector
}
```

Components call `useFilter()` to read/write. Click-to-focus and click-outside-to-clear behavior preserved, just lifted to context.

### URL State Sync

Filter state bidirectionally syncs with URL search params:

```
/dashboard?panels=leaderboard,token-cost&focus=strategy:RLM(8)&scenario=Early+Fact+Recall
/demo#cost
```

A `useSyncURL()` hook reads params on mount and writes on filter changes. Copy URL = exact same view for collaborator.

### Shared Chart Primitives

New `components/charts/` folder:

| Component | Purpose |
|-----------|---------|
| `StyledTooltip` | Dark glass-morphism tooltip, replaces 7 inline tooltip configs |
| `GradientDefs` | SVG `<defs>` with gradient definitions for chart fills |
| `AnimatedNumber` | Count-up animation for KPI hero cards |
| `Skeleton` | Pulsing gray placeholder matching chart shapes |
| `ExportButton` | Downloads chart container as PNG (html2canvas) or data as CSV |
| `KPICard` | Hero metric card with large number, subtitle, optional trend arrow |
| `Panel` | Card chrome wrapper — title bar, expand button, export button |

### Color System

Move from inline hex to CSS custom properties in `index.css`:

```css
:root {
  --color-strategy-full-context: #3b82f6;
  --color-strategy-rlm: #10b981;
  --color-strategy-window-6: #f59e0b;
  /* ... */
}
```

Referenced by both Tailwind classes and chart components.

## `/` — Landing Page

Centered single-column layout (`max-w-4xl`). Fast-loading, sets context.

**Sections:**
1. Hero — project name, one-line description ("Benchmarking memory strategies for LLM conversations"), CTA buttons
2. "What are memory strategies?" — brief explainer, 3-4 strategy types illustrated with simple diagrams
3. Key findings — 3 KPI cards computed from leaderboard API data (best accuracy, lowest cost, fastest strategy)
4. CTAs — "See the full story" → `/demo`, "Explore the data" → `/dashboard`

## `/demo` — Data Storytelling

Full-width scrollable narrative. No sidebar. Content column `max-w-5xl` centered.

**Structure:**
1. Hero with 3-4 animated KPI cards (data-derived from API)
2. Six narrative sections, each containing:
   - Headline insight (template string filled from API data — auto-updates on new benchmarks)
   - 1-2 sentence context paragraph
   - Styled chart (gradient fills, glow effects, no click interactivity)
3. Sticky mini-nav pills at top for section jumping
4. Footer with "Dive deeper" link to `/dashboard`

**Sections:**
1. "The Leaderboard" — ranked strategies with styled table
2. "The Cost of Remembering" — token cost line chart, callout on Full Context growth
3. "What Gets Forgotten" — retention by type bars + retention curve side-by-side
4. "Does Depth Help?" — depth comparison, auto-derived delta callout
5. "Hand-rolled vs Code-Gen" — RLLM comparison with hero stat banner
6. "Inside the Code" — code strategies pie and feature bars

**Visual treatments:**
- Scroll-triggered fade-in via `IntersectionObserver` + CSS `@keyframes` (no library)
- KPI cards with animated count-up on first paint
- Narrative callouts with left accent border
- Subtle gradient dividers between sections
- Charts restyled with gradient fills and subtle glow (same Recharts, custom styling)

## `/dashboard` — Multi-Panel Analytics

**Layout:** Filter bar at top, responsive panel grid below, collapsible sidebar for presets.

### Filter Bar

Always visible at top. Contains:
- Strategy multi-select dropdown
- Scenario multi-select dropdown
- Fact type multi-select dropdown
- Reset button
- Export All button (downloads zip of all visible panels as PNG + CSV)

### Panel Picker

Sidebar shows checkbox list of 7 available panels. User checks 1-4 to display. Auto-grid:
- 1 panel → full width
- 2 panels → 2 columns
- 3 panels → 2 top + 1 full-width bottom
- 4 panels → 2x2

Three quick-select presets in the sidebar:
- **Overview**: Leaderboard + Token Cost + Retention by Type
- **RLM Deep Dive**: Retention by Type + Retention Curve + Depth Comparison
- **Code Generation**: RLLM vs Hand-rolled + Code Strategies

Presets are shortcuts that check the relevant panels. User can manually adjust after selecting a preset.

### Panel Behavior

Each panel is the existing component wrapped in `<Panel>`:
- Title bar with panel name
- Expand button (↗) — goes full-screen overlay within the dashboard
- Export button — PNG or CSV for that panel
- Loading skeleton while data fetches

No compact/full variants. Components are responsive to their container.

### Focus Behavior

Same domain-based system as v1, lifted to `FilterProvider`:
- Click chart element → FilterProvider updates → all visible panels in same domain react
- Click outside any panel → clear current domain focus
- Focus state encodes in URL

### Sidebar

Simplified from v1:
- Panel picker checkboxes (grouped by section: Strategy Comparison, RLM, Code Gen)
- Quick-select presets
- Still collapsible

### Export

Per-panel: PNG button (html2canvas captures the chart container) and CSV button (serializes the hook's data to CSV blob).

Top-level "Export All": downloads a zip containing PNG + CSV for each visible panel.

## Phase 2 (Deferred)

### `/recommend` — Strategy Recommender

3-question wizard:
1. "What's your context window budget?" (small / medium / large)
2. "What matters most?" (accuracy / cost / latency)
3. "What types of facts do you need to retain?" (multi-select)

Returns a strategy recommendation with supporting chart snippets from the benchmark data.

### `/card/:metric` — Shareable Cards

Server-rendered PNG images at fixed dimensions (1200x630 for OG, 400x300 for embeds). Generated from the same data, styled for social sharing. OG meta tags on all pages reference these.

## Dependencies to Add

```
bun add @tanstack/react-query react-router-dom html2canvas
```

## Files to Create/Modify

### New Files
- `src/lib/hooks.ts` — TanStack Query hooks
- `src/lib/FilterContext.tsx` — FilterProvider + useFilter hook
- `src/lib/useSyncURL.ts` — bidirectional URL state sync
- `src/components/charts/StyledTooltip.tsx`
- `src/components/charts/GradientDefs.tsx`
- `src/components/charts/AnimatedNumber.tsx`
- `src/components/charts/Skeleton.tsx`
- `src/components/charts/ExportButton.tsx`
- `src/components/charts/KPICard.tsx`
- `src/components/charts/Panel.tsx`
- `src/pages/Landing.tsx`
- `src/pages/Demo.tsx`
- `src/pages/Dashboard.tsx`
- `src/router.tsx` — route definitions

### Modified Files
- `src/App.tsx` — becomes thin shell wrapping RouterProvider + QueryClientProvider
- `src/index.css` — add CSS custom properties for color system
- `src/components/Leaderboard.tsx` — use `useLeaderboard()` hook, `useFilter()`, accept Panel wrapper
- `src/components/TokenCost.tsx` — same pattern
- `src/components/RetentionByType.tsx` — same pattern
- `src/components/RetentionCurve.tsx` — same pattern
- `src/components/DepthComparison.tsx` — same pattern
- `src/components/RllmComparison.tsx` — same pattern
- `src/components/CodeStrategies.tsx` — same pattern
- `src/components/Sidebar.tsx` — becomes panel picker with presets

### Removed Files
- `src/components/Tabs.tsx` — already unused (replaced by Sidebar in v1)
