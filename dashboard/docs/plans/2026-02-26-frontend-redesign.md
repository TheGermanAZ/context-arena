# Frontend Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the single-view dashboard into a multi-route app with a landing page, data storytelling demo, and multi-panel analytics workspace.

**Architecture:** Three routes (`/`, `/demo`, `/dashboard`) sharing a TanStack Query data layer and FilterContext. Existing chart components refactored to use hooks instead of inline fetching. New shared chart primitives (styled tooltip, gradients, KPI cards, skeletons, export). Demo route auto-generates narrative text from live API data.

**Tech Stack:** React 19 + TypeScript + Vite 7 + Recharts 3 + TanStack Query 5 + React Router 7 + Tailwind 4 + html2canvas

**Design doc:** `docs/plans/2026-02-26-frontend-redesign-design.md`

---

### Task 1: Install Dependencies

**Files:**
- Modify: `dashboard/package.json`

**Step 1: Install runtime dependencies**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && bun add @tanstack/react-query react-router-dom html2canvas
```

**Step 2: Verify installation**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && bun run build 2>&1 | head -5
```

Expected: no dependency resolution errors (TS errors are fine at this stage).

**Step 3: Commit**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && git add package.json bun.lock && git commit -m "chore: add tanstack-query, react-router-dom, html2canvas"
```

---

### Task 2: CSS Color System

**Files:**
- Modify: `dashboard/src/index.css`
- Modify: `dashboard/src/lib/colors.ts`

**Step 1: Add CSS custom properties to `src/index.css`**

Replace the file contents with:

```css
@import "tailwindcss";

:root {
  /* Strategy colors */
  --color-strategy-full-context: #3b82f6;
  --color-strategy-window-6: #f59e0b;
  --color-strategy-window-10: #d97706;
  --color-strategy-rlm: #10b981;
  --color-strategy-summarize: #06b6d4;
  --color-strategy-structured: #84cc16;
  --color-strategy-correction-aware: #8b5cf6;
  --color-strategy-hybrid: #ec4899;

  /* Probe type colors */
  --color-probe-entity: #3b82f6;
  --color-probe-quantity: #10b981;
  --color-probe-date: #f59e0b;
  --color-probe-correction: #ef4444;
  --color-probe-spatial: #8b5cf6;
  --color-probe-relationship: #ec4899;
  --color-probe-phone-id: #06b6d4;

  /* Surface colors */
  --color-surface-0: #030712;   /* body bg */
  --color-surface-1: #111827;   /* card bg */
  --color-surface-2: #1f2937;   /* tooltip/elevated bg */
  --color-border: #374151;
  --color-border-subtle: #1f2937;

  /* Text */
  --color-text-primary: #f3f4f6;
  --color-text-secondary: #9ca3af;
  --color-text-muted: #6b7280;
}
```

**Step 2: Update `src/lib/colors.ts` to read CSS vars**

Keep the existing `STRATEGY_COLORS` and `PROBE_TYPE_COLORS` maps unchanged (charts need hex strings, not CSS var references). The CSS vars serve as the source of truth for Tailwind usage; the TS maps serve charts. They use identical values.

No changes needed to colors.ts — the values already match.

**Step 3: Commit**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && git add src/index.css && git commit -m "style: add CSS custom properties for color system"
```

---

### Task 3: TanStack Query Data Hooks

**Files:**
- Create: `dashboard/src/lib/hooks.ts`
- Modify: `dashboard/src/main.tsx` (wrap in QueryClientProvider)

**Step 1: Create `src/lib/hooks.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type {
  LeaderboardEntry,
  RetentionByTypeEntry,
  DepthComparisonResponse,
  RetentionCurveResponse,
  RllmComparisonResponse,
  TokenCostResponse,
  CodeAnalysisResponse,
} from './types';

export function useLeaderboard() {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard'],
    queryFn: api.leaderboard,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRetentionByType() {
  return useQuery<RetentionByTypeEntry[]>({
    queryKey: ['retention-by-type'],
    queryFn: api.retentionByType,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDepthComparison() {
  return useQuery<DepthComparisonResponse>({
    queryKey: ['depth-comparison'],
    queryFn: api.depthComparison,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRetentionCurve() {
  return useQuery<RetentionCurveResponse>({
    queryKey: ['retention-curve'],
    queryFn: api.retentionCurve,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRllmComparison() {
  return useQuery<RllmComparisonResponse>({
    queryKey: ['rllm-comparison'],
    queryFn: api.rllmComparison,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTokenCost(scenario?: string) {
  return useQuery<TokenCostResponse>({
    queryKey: ['token-cost', scenario ?? 'default'],
    queryFn: () => api.tokenCost(scenario),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCodeAnalysis() {
  return useQuery<CodeAnalysisResponse>({
    queryKey: ['code-analysis'],
    queryFn: api.codeAnalysis,
    staleTime: 5 * 60 * 1000,
  });
}
```

**Step 2: Wrap app in QueryClientProvider in `src/main.tsx`**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './index.css'
import App from './App.tsx'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
)
```

**Step 3: Verify it compiles**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && bunx tsc --noEmit 2>&1 | head -20
```

Expected: no errors from hooks.ts or main.tsx (existing component errors are fine).

**Step 4: Commit**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && git add src/lib/hooks.ts src/main.tsx && git commit -m "feat: add TanStack Query data hooks and QueryClientProvider"
```

---

### Task 4: FilterContext

**Files:**
- Create: `dashboard/src/lib/FilterContext.tsx`

**Step 1: Create `src/lib/FilterContext.tsx`**

This replaces the prop-drilled `focused`/`onFocusClick` pattern from App.tsx. Components call `useFilter()` to read and write focus state.

```tsx
import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from 'react';

type FocusDomain = 'strategy' | 'type' | 'scenario' | 'category';

interface FilterState {
  focusedStrategy: string | null;
  focusedType: string | null;
  focusedScenario: string | null;
  focusedCategory: string | null;
  panels: string[];
  scenario: string | null;
}

interface FilterActions {
  toggleFocus: (domain: FocusDomain, name: string) => void;
  clearFocus: (domain: FocusDomain) => void;
  clearAllFocus: () => void;
  setPanels: (panels: string[]) => void;
  setScenario: (scenario: string | null) => void;
  /** Call from click handlers that SET focus to guard against immediate clearFocus from click bubbling */
  guardClick: () => void;
  /** Call from background click handlers — returns false if a focus click just fired */
  shouldClearOnBackground: () => boolean;
}

const FilterContext = createContext<(FilterState & FilterActions) | null>(null);

const DEFAULT_PANELS = ['leaderboard', 'token-cost', 'retention-by-type'];

export function FilterProvider({ children }: { children: ReactNode }) {
  const [focusedStrategy, setFocusedStrategy] = useState<string | null>(null);
  const [focusedType, setFocusedType] = useState<string | null>(null);
  const [focusedScenario, setFocusedScenario] = useState<string | null>(null);
  const [focusedCategory, setFocusedCategory] = useState<string | null>(null);
  const [panels, setPanels] = useState<string[]>(DEFAULT_PANELS);
  const [scenario, setScenario] = useState<string | null>(null);

  const justFocused = useRef(false);

  const setterFor = (domain: FocusDomain) => {
    switch (domain) {
      case 'strategy': return setFocusedStrategy;
      case 'type': return setFocusedType;
      case 'scenario': return setFocusedScenario;
      case 'category': return setFocusedCategory;
    }
  };

  const toggleFocus = useCallback((domain: FocusDomain, name: string) => {
    justFocused.current = true;
    setterFor(domain)((prev) => (prev === name ? null : name));
  }, []);

  const clearFocus = useCallback((domain: FocusDomain) => {
    setterFor(domain)(null);
  }, []);

  const clearAllFocus = useCallback(() => {
    setFocusedStrategy(null);
    setFocusedType(null);
    setFocusedScenario(null);
    setFocusedCategory(null);
  }, []);

  const guardClick = useCallback(() => {
    justFocused.current = true;
  }, []);

  const shouldClearOnBackground = useCallback(() => {
    if (justFocused.current) {
      justFocused.current = false;
      return false;
    }
    return true;
  }, []);

  return (
    <FilterContext.Provider
      value={{
        focusedStrategy, focusedType, focusedScenario, focusedCategory,
        panels, scenario,
        toggleFocus, clearFocus, clearAllFocus,
        setPanels, setScenario,
        guardClick, shouldClearOnBackground,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilter must be used within FilterProvider');
  return ctx;
}

export type { FocusDomain };
```

**Step 2: Verify it compiles**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && bunx tsc --noEmit 2>&1 | grep FilterContext
```

Expected: no errors.

**Step 3: Commit**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && git add src/lib/FilterContext.tsx && git commit -m "feat: add FilterProvider context for cross-panel focus state"
```

---

### Task 5: React Router Setup

**Files:**
- Create: `dashboard/src/router.tsx`
- Create: `dashboard/src/pages/Landing.tsx` (placeholder)
- Create: `dashboard/src/pages/Demo.tsx` (placeholder)
- Create: `dashboard/src/pages/Dashboard.tsx` (placeholder)
- Modify: `dashboard/src/App.tsx` (thin shell)
- Modify: `dashboard/src/main.tsx` (add RouterProvider)

**Step 1: Create placeholder page components**

`src/pages/Landing.tsx`:
```tsx
export default function Landing() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Context Arena</h1>
        <p className="text-gray-400 mb-8">Benchmarking memory strategies for LLM conversations</p>
        <div className="flex gap-4 justify-center">
          <a href="/demo" className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors">
            See the story
          </a>
          <a href="/dashboard" className="px-6 py-3 bg-gray-800 text-gray-200 rounded-lg border border-gray-700 hover:bg-gray-700 transition-colors">
            Explore the data
          </a>
        </div>
      </div>
    </div>
  );
}
```

`src/pages/Demo.tsx`:
```tsx
export default function Demo() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-3xl font-bold mb-4">Data Story — Placeholder</h1>
        <p className="text-gray-400">Demo route will be built in Task 11.</p>
      </div>
    </div>
  );
}
```

`src/pages/Dashboard.tsx`:
```tsx
import { FilterProvider } from '../lib/FilterContext';

export default function DashboardPage() {
  return (
    <FilterProvider>
      <div className="min-h-screen bg-gray-950 text-gray-100 p-8">
        <h1 className="text-3xl font-bold mb-4">Dashboard — Placeholder</h1>
        <p className="text-gray-400">Multi-panel dashboard will be built in Task 12.</p>
      </div>
    </FilterProvider>
  );
}
```

**Step 2: Create `src/router.tsx`**

```tsx
import { createBrowserRouter, Navigate } from 'react-router-dom';
import Landing from './pages/Landing';
import Demo from './pages/Demo';
import DashboardPage from './pages/Dashboard';

export const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/demo', element: <Demo /> },
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '*', element: <Navigate to="/" replace /> },
]);
```

**Step 3: Update `src/main.tsx` to use RouterProvider**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import './index.css'
import { router } from './router'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
```

**Step 4: Update `src/App.tsx`**

App.tsx is no longer the entry point (RouterProvider handles routing). Keep the file but it's now unused — we'll clean it up later. For now, leave it as-is to avoid breaking anything during the transition.

**Step 5: Verify all three routes render**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && bunx tsc --noEmit 2>&1 | head -20
```

Then manually verify in browser: `http://localhost:5173/`, `/demo`, `/dashboard` should all render their placeholders.

**Step 6: Commit**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && git add src/router.tsx src/pages/ src/main.tsx && git commit -m "feat: add React Router with landing, demo, dashboard routes"
```

---

### Task 6: URL State Sync Hook

**Files:**
- Create: `dashboard/src/lib/useSyncURL.ts`

**Step 1: Create the hook**

This hook bidirectionally syncs FilterContext state with URL search params on the `/dashboard` route.

```ts
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFilter, type FocusDomain } from './FilterContext';

/**
 * Syncs FilterContext state ↔ URL search params.
 * Call this once at the top of the Dashboard page.
 *
 * URL format:
 *   /dashboard?panels=leaderboard,token-cost&focus=strategy:RLM(8)&scenario=Early+Fact+Recall
 */
export function useSyncURL() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = useFilter();

  // On mount: read URL → set filter state
  useEffect(() => {
    const panelsParam = searchParams.get('panels');
    if (panelsParam) {
      filter.setPanels(panelsParam.split(','));
    }

    const focusParam = searchParams.get('focus');
    if (focusParam) {
      const [domain, name] = focusParam.split(':') as [FocusDomain, string];
      if (domain && name) {
        filter.toggleFocus(domain, name);
      }
    }

    const scenarioParam = searchParams.get('scenario');
    if (scenarioParam) {
      filter.setScenario(scenarioParam);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On filter change: write state → URL
  useEffect(() => {
    const params = new URLSearchParams();

    if (filter.panels.length > 0) {
      params.set('panels', filter.panels.join(','));
    }

    const focus = filter.focusedStrategy
      ? `strategy:${filter.focusedStrategy}`
      : filter.focusedType
        ? `type:${filter.focusedType}`
        : filter.focusedScenario
          ? `scenario:${filter.focusedScenario}`
          : filter.focusedCategory
            ? `category:${filter.focusedCategory}`
            : null;

    if (focus) params.set('focus', focus);
    if (filter.scenario) params.set('scenario', filter.scenario);

    setSearchParams(params, { replace: true });
  }, [
    filter.panels, filter.focusedStrategy, filter.focusedType,
    filter.focusedScenario, filter.focusedCategory, filter.scenario,
    setSearchParams,
  ]);
}
```

**Step 2: Verify it compiles**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && bunx tsc --noEmit 2>&1 | grep useSyncURL
```

**Step 3: Commit**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && git add src/lib/useSyncURL.ts && git commit -m "feat: add useSyncURL hook for bidirectional URL state"
```

---

### Task 7: Shared Chart Primitives

**Files:**
- Create: `dashboard/src/components/charts/StyledTooltip.tsx`
- Create: `dashboard/src/components/charts/GradientDefs.tsx`
- Create: `dashboard/src/components/charts/AnimatedNumber.tsx`
- Create: `dashboard/src/components/charts/Skeleton.tsx`
- Create: `dashboard/src/components/charts/KPICard.tsx`
- Create: `dashboard/src/components/charts/Panel.tsx`
- Create: `dashboard/src/components/charts/ExportButton.tsx`
- Create: `dashboard/src/components/charts/index.ts` (barrel export)

**Step 1: Create `src/components/charts/StyledTooltip.tsx`**

Replaces the inline Recharts tooltip config repeated in every component.

```tsx
import { type TooltipProps } from 'recharts';

type Formatter = TooltipProps<number, string>['formatter'];

interface StyledTooltipContentProps {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string; payload?: Record<string, unknown> }>;
  label?: string;
  labelFormatter?: (label: string, payload: StyledTooltipContentProps['payload']) => string;
  formatter?: Formatter;
}

export default function StyledTooltipContent({
  active, payload, label, labelFormatter, formatter,
}: StyledTooltipContentProps) {
  if (!active || !payload?.length) return null;

  const displayLabel = labelFormatter ? labelFormatter(label ?? '', payload) : label;

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/95 backdrop-blur-sm px-3 py-2 shadow-xl">
      {displayLabel && <p className="text-xs text-gray-300 mb-1 font-medium">{displayLabel}</p>}
      {payload.map((entry, i) => {
        const formatted = formatter
          ? formatter(entry.value, entry.name, entry as any, i, payload as any)
          : [`${entry.value}`, entry.name];
        const [value, name] = Array.isArray(formatted) ? formatted : [formatted, entry.name];
        return (
          <div key={entry.name} className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-400">{name}:</span>
            <span className="text-gray-100 font-mono">{value}</span>
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Create `src/components/charts/GradientDefs.tsx`**

SVG gradient definitions to be placed inside any Recharts chart's `<defs>`.

```tsx
interface GradientDefProps {
  id: string;
  color: string;
  opacity?: [number, number];
}

export function GradientDef({ id, color, opacity = [0.8, 0.1] }: GradientDefProps) {
  return (
    <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={opacity[0]} />
      <stop offset="100%" stopColor={color} stopOpacity={opacity[1]} />
    </linearGradient>
  );
}

/** Pre-built set of gradients for all strategies. Place inside <defs> in a Recharts chart. */
export function StrategyGradients() {
  return (
    <>
      <GradientDef id="grad-full-context" color="#3b82f6" />
      <GradientDef id="grad-window-6" color="#f59e0b" />
      <GradientDef id="grad-window-10" color="#d97706" />
      <GradientDef id="grad-rlm" color="#10b981" />
      <GradientDef id="grad-summarize" color="#06b6d4" />
      <GradientDef id="grad-structured" color="#84cc16" />
      <GradientDef id="grad-correction-aware" color="#8b5cf6" />
      <GradientDef id="grad-hybrid" color="#ec4899" />
    </>
  );
}
```

**Step 3: Create `src/components/charts/AnimatedNumber.tsx`**

Count-up animation for KPI hero cards.

```tsx
import { useEffect, useRef, useState } from 'react';

interface Props {
  value: number;
  duration?: number;
  format?: (n: number) => string;
  className?: string;
}

export default function AnimatedNumber({ value, duration = 1200, format, className }: Props) {
  const [display, setDisplay] = useState(0);
  const startTime = useRef<number | null>(null);
  const rafId = useRef<number>(0);

  useEffect(() => {
    const startValue = display;
    startTime.current = null;

    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp;
      const elapsed = timestamp - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(startValue + (value - startValue) * eased);
      if (progress < 1) rafId.current = requestAnimationFrame(animate);
    };

    rafId.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const formatted = format ? format(display) : Math.round(display).toLocaleString();

  return <span className={className}>{formatted}</span>;
}
```

**Step 4: Create `src/components/charts/Skeleton.tsx`**

Pulsing placeholder for loading states.

```tsx
interface Props {
  className?: string;
  /** Preset shape: 'chart' = 400px tall, 'table' = 300px tall rows, 'kpi' = small card */
  variant?: 'chart' | 'table' | 'kpi';
}

export default function Skeleton({ className, variant = 'chart' }: Props) {
  const heights: Record<string, string> = {
    chart: 'h-[400px]',
    table: 'h-[300px]',
    kpi: 'h-24',
  };

  return (
    <div className={`animate-pulse rounded-lg bg-gray-800/50 ${heights[variant]} ${className ?? ''}`}>
      <div className="h-full flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-gray-700 border-t-gray-500 animate-spin" />
      </div>
    </div>
  );
}
```

**Step 5: Create `src/components/charts/KPICard.tsx`**

Hero metric card with animated number.

```tsx
import AnimatedNumber from './AnimatedNumber';

interface Props {
  label: string;
  value: number;
  format?: (n: number) => string;
  subtitle?: string;
  accentColor?: string;
}

export default function KPICard({ label, value, format, subtitle, accentColor = '#10b981' }: Props) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-5 flex flex-col">
      <span className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">{label}</span>
      <AnimatedNumber
        value={value}
        format={format}
        className="text-3xl font-bold"
        // Apply accent color via inline style
      />
      <span className="text-3xl font-bold" style={{ color: accentColor }}>
        {/* AnimatedNumber renders the actual value above — this span is hidden, used for layout */}
      </span>
      {subtitle && <span className="text-xs text-gray-400 mt-1">{subtitle}</span>}
    </div>
  );
}
```

Wait — that has a bug with two spans. Simpler version:

```tsx
import AnimatedNumber from './AnimatedNumber';

interface Props {
  label: string;
  value: number;
  format?: (n: number) => string;
  subtitle?: string;
  accentColor?: string;
}

export default function KPICard({ label, value, format, subtitle, accentColor = '#10b981' }: Props) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-5 flex flex-col">
      <span className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">{label}</span>
      <AnimatedNumber
        value={value}
        format={format}
        className="text-3xl font-bold"
      />
      {subtitle && <span className="text-xs text-gray-400 mt-1">{subtitle}</span>}
    </div>
  );
}
```

Note: the `accentColor` should be applied to the AnimatedNumber. Since AnimatedNumber accepts `className` but not `style`, the implementer should either add a `style` prop to AnimatedNumber or use inline style on a wrapping element. Simplest: wrap the AnimatedNumber in a div with the accent color:

```tsx
import AnimatedNumber from './AnimatedNumber';

interface Props {
  label: string;
  value: number;
  format?: (n: number) => string;
  subtitle?: string;
  accentColor?: string;
}

export default function KPICard({ label, value, format, subtitle, accentColor = '#10b981' }: Props) {
  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-5 flex flex-col">
      <span className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">{label}</span>
      <div style={{ color: accentColor }}>
        <AnimatedNumber value={value} format={format} className="text-3xl font-bold" />
      </div>
      {subtitle && <span className="text-xs text-gray-400 mt-1">{subtitle}</span>}
    </div>
  );
}
```

**Step 6: Create `src/components/charts/Panel.tsx`**

Card wrapper for dashboard panels with title bar and action buttons.

```tsx
import { useRef, type ReactNode } from 'react';
import ExportButton from './ExportButton';

interface Props {
  title: string;
  badge?: { text: string; color: 'emerald' | 'red' };
  children: ReactNode;
  onExpand?: () => void;
  exportData?: () => Record<string, unknown>[];
}

const BADGE_CLASSES = {
  emerald: 'bg-emerald-900/50 text-emerald-400',
  red: 'bg-red-900/50 text-red-400',
};

export default function Panel({ title, badge, children, onExpand, exportData }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-200">{title}</h3>
          {badge && (
            <span className={`text-[9px] font-semibold uppercase px-1.5 py-px rounded ${BADGE_CLASSES[badge.color]}`}>
              {badge.text}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <ExportButton containerRef={containerRef} data={exportData} title={title} />
          {onExpand && (
            <button
              onClick={onExpand}
              className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
              aria-label="Expand"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8.5 1.5H12.5V5.5M5.5 12.5H1.5V8.5M12.5 1.5L8 6M1.5 12.5L6 8" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="p-4 flex-1 min-h-0">
        {children}
      </div>
    </div>
  );
}
```

**Step 7: Create `src/components/charts/ExportButton.tsx`**

Downloads panel as PNG or data as CSV.

```tsx
import { useCallback, useState, type RefObject } from 'react';

interface Props {
  containerRef: RefObject<HTMLDivElement | null>;
  data?: () => Record<string, unknown>[];
  title: string;
}

export default function ExportButton({ containerRef, data, title }: Props) {
  const [open, setOpen] = useState(false);

  const exportPNG = useCallback(async () => {
    if (!containerRef.current) return;
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(containerRef.current, {
      backgroundColor: '#111827',
      scale: 2,
    });
    const link = document.createElement('a');
    link.download = `${title.toLowerCase().replace(/\s+/g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setOpen(false);
  }, [containerRef, title]);

  const exportCSV = useCallback(() => {
    if (!data) return;
    const rows = data();
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [
      headers.join(','),
      ...rows.map((row) => headers.map((h) => JSON.stringify(row[h] ?? '')).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const link = document.createElement('a');
    link.download = `${title.toLowerCase().replace(/\s+/g, '-')}.csv`;
    link.href = URL.createObjectURL(blob);
    link.click();
    setOpen(false);
  }, [data, title]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="p-1 text-gray-500 hover:text-gray-300 transition-colors"
        aria-label="Export"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M7 1.5V9.5M3.5 6L7 9.5L10.5 6M2 12.5H12" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 py-1 min-w-[100px]">
          <button onClick={exportPNG} className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700">
            Export PNG
          </button>
          {data && (
            <button onClick={exportCSV} className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-700">
              Export CSV
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 8: Create barrel export `src/components/charts/index.ts`**

```ts
export { default as StyledTooltipContent } from './StyledTooltip';
export { GradientDef, StrategyGradients } from './GradientDefs';
export { default as AnimatedNumber } from './AnimatedNumber';
export { default as Skeleton } from './Skeleton';
export { default as KPICard } from './KPICard';
export { default as Panel } from './Panel';
export { default as ExportButton } from './ExportButton';
```

**Step 9: Verify it all compiles**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && bunx tsc --noEmit 2>&1 | head -20
```

**Step 10: Commit**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && git add src/components/charts/ && git commit -m "feat: add shared chart primitives (tooltip, gradients, KPI, skeleton, panel, export)"
```

---

### Task 8: Refactor Existing Components to Use Hooks + FilterContext

**Files:**
- Modify: `dashboard/src/components/Leaderboard.tsx`
- Modify: `dashboard/src/components/TokenCost.tsx`
- Modify: `dashboard/src/components/RetentionByType.tsx`
- Modify: `dashboard/src/components/RetentionCurve.tsx`
- Modify: `dashboard/src/components/DepthComparison.tsx`
- Modify: `dashboard/src/components/RllmComparison.tsx`
- Modify: `dashboard/src/components/CodeStrategies.tsx`

**Approach:** For each component:
1. Replace `useState` + `useEffect` data fetching with the TanStack Query hook
2. Replace `Props { focused, onFocusClick }` with `useFilter()` context
3. Replace `"Loading..."` text with `<Skeleton />` component
4. Keep chart rendering logic identical — only the data fetching and focus wiring changes

**Step 1: Refactor Leaderboard.tsx**

Key changes:
- `const { data, error, isLoading } = useLeaderboard();` replaces `useState` + `useEffect`
- `const { focusedStrategy, toggleFocus, guardClick } = useFilter();` replaces props
- `if (isLoading) return <Skeleton variant="table" />;`
- Focus click: `onClick={() => { guardClick(); toggleFocus('strategy', row.strategy); }}`
- Remove `Props` interface (no more props needed)

The component should still accept optional `focused`/`onFocusClick` props as a fallback for the demo route (which doesn't use FilterProvider). Use a pattern like:

```tsx
interface Props {
  /** Override focus from context — used by demo route */
  staticFocused?: string | null;
}

export default function Leaderboard({ staticFocused }: Props = {}) {
  const { data, error, isLoading } = useLeaderboard();
  // Try context, fall back to static prop
  const filterCtx = useFilterOptional();
  const focused = staticFocused ?? filterCtx?.focusedStrategy ?? null;
  const onFocusClick = filterCtx
    ? (name: string) => { filterCtx.guardClick(); filterCtx.toggleFocus('strategy', name); }
    : undefined;
  // ... rest unchanged
}
```

Add a `useFilterOptional()` to FilterContext.tsx that returns null instead of throwing when outside a provider:

```tsx
export function useFilterOptional() {
  return useContext(FilterContext);
}
```

Apply this same pattern to all 7 components. Each component:
- Uses its domain's focus value (`focusedStrategy`, `focusedType`, `focusedScenario`, `focusedCategory`)
- Calls `toggleFocus(domain, name)` with the correct domain
- Falls back gracefully when no FilterProvider is present (demo route)

**Step 2: Refactor all 7 components** following the pattern above.

Component → Hook → Focus domain:
- `Leaderboard` → `useLeaderboard()` → `strategy`
- `TokenCost` → `useTokenCost(scenario)` → `strategy`
- `RetentionByType` → `useRetentionByType()` → `type`
- `RetentionCurve` → `useRetentionCurve()` → `type`
- `DepthComparison` → `useDepthComparison()` → `scenario`
- `RllmComparison` → `useRllmComparison()` → `scenario`
- `CodeStrategies` → `useCodeAnalysis()` → `category`

**Step 3: Remove `ClearFocus.tsx`**

The ClearFocus button is now handled by the filter bar in the dashboard layout. Remove the file and all imports.

**Step 4: Verify it compiles and the existing `/dashboard` placeholder still works**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && bunx tsc --noEmit 2>&1 | head -30
```

**Step 5: Commit**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && git add -A src/components/ src/lib/FilterContext.tsx && git commit -m "refactor: migrate all components to TanStack Query hooks + FilterContext"
```

---

### Task 9: Dashboard Sidebar — Panel Picker with Presets

**Files:**
- Modify: `dashboard/src/components/Sidebar.tsx`

**Step 1: Rewrite Sidebar as a panel picker**

The sidebar now shows:
- 3 preset buttons at top (Overview, RLM Deep Dive, Code Generation)
- Below that, 7 checkboxes grouped by section — user can manually pick 1-4 panels
- Still collapsible

```tsx
import { useFilter } from '../lib/FilterContext';

const PANEL_GROUPS = [
  {
    label: 'Strategy Comparison',
    panels: [
      { id: 'leaderboard', label: 'Leaderboard' },
      { id: 'token-cost', label: 'Token Cost' },
    ],
  },
  {
    label: 'RLM Deep Dive',
    badge: { text: 'RLM', color: 'emerald' as const },
    panels: [
      { id: 'retention-by-type', label: 'Retention by Type' },
      { id: 'retention-curve', label: 'Retention Curve' },
      { id: 'depth-comparison', label: 'Depth 1 vs 2' },
    ],
  },
  {
    label: 'Code Generation',
    badge: { text: 'RLLM', color: 'red' as const },
    panels: [
      { id: 'rllm-comparison', label: 'RLLM vs Hand-rolled' },
      { id: 'code-strategies', label: 'Code Strategies' },
    ],
  },
];

const PRESETS: Record<string, string[]> = {
  Overview: ['leaderboard', 'token-cost', 'retention-by-type'],
  'RLM Deep Dive': ['retention-by-type', 'retention-curve', 'depth-comparison'],
  'Code Generation': ['rllm-comparison', 'code-strategies'],
};

interface SidebarProps {
  expanded: boolean;
  onToggle: () => void;
}
```

The implementation toggles panels via `filter.setPanels(...)` from the FilterContext. Checkbox state is derived from `filter.panels.includes(id)`. Max 4 panels enforced in the UI (disable unchecked boxes when 4 are selected).

**Step 2: Verify it compiles**

**Step 3: Commit**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && git add src/components/Sidebar.tsx && git commit -m "feat: rewrite sidebar as panel picker with presets"
```

---

### Task 10: Build Landing Page (`/`)

**Files:**
- Modify: `dashboard/src/pages/Landing.tsx`

**Step 1: Build the landing page**

Sections:
1. **Hero** — "Context Arena" title, subtitle "Benchmarking memory strategies for LLM conversations", two CTA buttons (using `<Link>` from react-router-dom, not `<a>`)
2. **"What are memory strategies?"** — 3 cards explaining Full Context, Windowed, and RLM approaches in 1 sentence each. Simple icons or colored borders, no images.
3. **Key findings** — 3 `<KPICard>` components pulling from `useLeaderboard()`:
   - Best accuracy: find top strategy by `accuracy` field
   - Lowest cost: find strategy with lowest `totalCost`
   - Most efficient: find strategy with lowest `avgInputTokens` among those with accuracy > 50%
4. **CTA footer** — "See the full story →" to `/demo`, "Explore the data →" to `/dashboard`

Layout: centered `max-w-4xl`, dark background, generous spacing.

Use `<Skeleton variant="kpi" />` while leaderboard data loads.

**Step 2: Verify in browser**

Navigate to `http://localhost:5173/`. Should show the landing page with animated KPI numbers once API data loads.

**Step 3: Commit**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && git add src/pages/Landing.tsx && git commit -m "feat: build landing page with hero, explainer, and data-driven KPIs"
```

---

### Task 11: Build Demo Page (`/demo`)

**Files:**
- Modify: `dashboard/src/pages/Demo.tsx`

This is the largest single task. The demo page is a scrollable data story with 6 narrative sections.

**Step 1: Build the page shell**

- Full-width layout, `max-w-5xl` centered content
- Sticky mini-nav at top with pill buttons for each section
- `IntersectionObserver` to track which section is in view (highlights active pill)
- Scroll-triggered fade-in animation via CSS class toggled by IntersectionObserver

Add to `src/index.css`:
```css
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fade-in-up {
  animation: fade-in-up 0.6s ease-out forwards;
}

.opacity-0-until-visible {
  opacity: 0;
}
```

**Step 2: Build the hero section**

- 3-4 KPICards in a row, data-derived from `useLeaderboard()` and `useRllmComparison()`
- Headline: template string like `"${topStrategy} achieves ${accuracy}% accuracy at ${fraction} the token cost"`

**Step 3: Build narrative sections**

Each section follows the pattern:

```tsx
<DemoSection id="leaderboard" title="The Leaderboard">
  <p className="text-lg text-gray-300 mb-6 border-l-2 border-emerald-500 pl-4">
    {topStrategy} leads with {accuracy}% accuracy across all 8 scenarios,
    while costing just ${cost} in API calls.
  </p>
  <Leaderboard />
</DemoSection>
```

Sections and their data-derived insights:
1. **"The Leaderboard"** — top strategy name + accuracy from `useLeaderboard()`
2. **"The Cost of Remembering"** — token ratio between Full Context and RLM from `useTokenCost()`
3. **"What Gets Forgotten"** — worst and best fact types from `useRetentionByType()`, displayed with RetentionByType + RetentionCurve side by side
4. **"Does Depth Help?"** — delta percentage from `useDepthComparison()`
5. **"Hand-rolled vs Code-Gen"** — percentages from `useRllmComparison()`
6. **"Inside the Code"** — total blocks and dominant category from `useCodeAnalysis()`

Charts render without focus interactivity on the demo route (the components fall back gracefully when no FilterProvider wraps them).

**Step 4: Add footer with link to `/dashboard`**

**Step 5: Verify in browser** — navigate to `http://localhost:5173/demo`, scroll through all sections, verify animations fire and numbers are data-derived.

**Step 6: Commit**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && git add src/pages/Demo.tsx src/index.css && git commit -m "feat: build data storytelling demo page with scroll animations"
```

---

### Task 12: Build Dashboard Page (`/dashboard`)

**Files:**
- Modify: `dashboard/src/pages/Dashboard.tsx`

**Step 1: Build the page layout**

```
┌─────────────────────────────────────────────────┐
│ Sidebar (collapsible)  │  Filter bar + panels   │
│                        │                        │
│ [Presets]              │ ┌──────┐ ┌──────┐      │
│ [Checkboxes]           │ │Panel1│ │Panel2│      │
│                        │ └──────┘ └──────┘      │
│                        │ ┌──────┐ ┌──────┐      │
│                        │ │Panel3│ │Panel4│      │
│                        │ └──────┘ └──────┘      │
└─────────────────────────────────────────────────┘
```

- Wraps content in `<FilterProvider>`
- Calls `useSyncURL()` at the top to sync state with URL
- Sidebar on left (panel picker from Task 9)
- Filter bar at top of main area
- Panel grid below

**Step 2: Build the filter bar**

Shows the currently active focus (if any) with a clear button. Also shows the active scenario for TokenCost if that panel is visible. "Reset" button calls `clearAllFocus()`.

**Step 3: Build the panel grid**

Maps `filter.panels` array to a grid of `<Panel>` wrappers around the corresponding chart components:

```tsx
const PANEL_MAP: Record<string, { component: ComponentType; title: string; badge?: ... }> = {
  'leaderboard': { component: Leaderboard, title: 'Strategy Leaderboard' },
  'token-cost': { component: TokenCost, title: 'Token Cost per Step' },
  'retention-by-type': { component: RetentionByType, title: 'Retention by Type', badge: { text: 'RLM', color: 'emerald' } },
  // ... etc
};
```

Grid classes based on panel count:
- 1: `grid-cols-1`
- 2: `grid-cols-2`
- 3: `grid-cols-2` (third spans full width with `col-span-2`)
- 4: `grid-cols-2`

Each panel gets an expand button that renders the component in a full-screen modal overlay.

**Step 4: Build the expand modal**

When a panel's expand button is clicked, render the component in a fixed overlay (`fixed inset-0 z-50 bg-gray-950/95`). Click the backdrop or press Escape to close.

**Step 5: Wire up `useSyncURL()`**

Call at the top of the Dashboard page. Verify URL updates when panels are toggled and focus changes.

**Step 6: Verify in browser**

- `http://localhost:5173/dashboard` — should show 3 panels (Overview preset)
- Toggle panels in sidebar — grid reflows
- Click a bar/row — all panels in same domain react
- Copy URL, paste in new tab — same view restores
- Export button works (PNG downloads)

**Step 7: Commit**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && git add src/pages/Dashboard.tsx && git commit -m "feat: build multi-panel dashboard with filter bar, panel picker, URL sync"
```

---

### Task 13: Cleanup and Final Polish

**Files:**
- Delete: `dashboard/src/components/Tabs.tsx` (unused since sidebar was added)
- Delete: `dashboard/src/components/ClearFocus.tsx` (replaced by filter bar)
- Modify: `dashboard/src/App.tsx` (remove old code, keep as redirect or delete)

**Step 1: Remove unused files**

```bash
rm /Users/thegermanaz/p/js/fractal/ambition/dashboard/src/components/Tabs.tsx
rm /Users/thegermanaz/p/js/fractal/ambition/dashboard/src/components/ClearFocus.tsx
```

**Step 2: Simplify App.tsx**

App.tsx is no longer the entry point. Either delete it or make it a simple redirect:

```tsx
import { Navigate } from 'react-router-dom';
export default function App() {
  return <Navigate to="/" replace />;
}
```

Or just delete it since `main.tsx` now uses `RouterProvider` directly.

**Step 3: Verify the full app works**

Start both servers:
```bash
# Terminal 1
cd /Users/thegermanaz/p/js/fractal/ambition && bun run dashboard/server.ts

# Terminal 2
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && bun run dev
```

Test all routes:
- `http://localhost:5173/` → Landing page with KPIs
- `http://localhost:5173/demo` → Scrollable story with animations
- `http://localhost:5173/dashboard` → Multi-panel with sidebar
- `http://localhost:5173/dashboard?panels=leaderboard&focus=strategy:RLM(8)` → URL state restores

**Step 4: Run type check**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && bunx tsc --noEmit
```

Expected: 0 errors.

**Step 5: Commit**

```bash
cd /Users/thegermanaz/p/js/fractal/ambition/dashboard && git add -A && git commit -m "chore: remove unused Tabs.tsx and ClearFocus.tsx, clean up App.tsx"
```

---

## Task Summary

| Task | Description | Est. Complexity |
|------|-------------|-----------------|
| 1 | Install dependencies | Low |
| 2 | CSS color system | Low |
| 3 | TanStack Query hooks | Low |
| 4 | FilterContext | Medium |
| 5 | React Router setup | Low |
| 6 | URL sync hook | Medium |
| 7 | Shared chart primitives (7 components) | Medium |
| 8 | Refactor 7 existing components | High |
| 9 | Sidebar → panel picker | Medium |
| 10 | Landing page | Medium |
| 11 | Demo page (data storytelling) | High |
| 12 | Dashboard page (multi-panel) | High |
| 13 | Cleanup | Low |
