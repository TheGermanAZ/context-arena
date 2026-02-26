import { Suspense, lazy, useState, useEffect, type ReactElement } from 'react';
import { FilterProvider, useFilter } from '../lib/FilterContext';
import NavBar from '../components/NavBar';
import { useSyncURL } from '../lib/useSyncURL';
import Sidebar from '../components/Sidebar';
import { Panel, Skeleton } from '../components/charts';

const Leaderboard = lazy(() => import('../components/Leaderboard'));
const TokenCost = lazy(() => import('../components/TokenCost'));
const RetentionByType = lazy(() => import('../components/RetentionByType'));
const RetentionCurve = lazy(() => import('../components/RetentionCurve'));
const DepthComparison = lazy(() => import('../components/DepthComparison'));
const RllmComparison = lazy(() => import('../components/RllmComparison'));
const CodeStrategies = lazy(() => import('../components/CodeStrategies'));
const ScenarioHeatmap = lazy(() => import('../components/ScenarioHeatmap'));
const CostAccuracy = lazy(() => import('../components/CostAccuracy'));
const ScenarioDifficulty = lazy(() => import('../components/ScenarioDifficulty'));

/* ── Panel Registry ───────────────────────────────────────────── */

interface PanelConfig {
  render: () => ReactElement;
  title: string;
  badge?: { text: string; color: 'emerald' | 'red' };
}

const PANEL_MAP: Record<string, PanelConfig> = {
  'leaderboard': { render: () => <Leaderboard />, title: 'Strategy Leaderboard' },
  'token-cost': { render: () => <TokenCost />, title: 'Token Cost per Step' },
  'scenario-heatmap': { render: () => <ScenarioHeatmap />, title: 'Scenario Heatmap' },
  'cost-accuracy': { render: () => <CostAccuracy />, title: 'Cost vs Accuracy' },
  'scenario-difficulty': { render: () => <ScenarioDifficulty />, title: 'Scenario Difficulty' },
  'retention-by-type': { render: () => <RetentionByType />, title: 'Retention by Type', badge: { text: 'RLM', color: 'emerald' } },
  'retention-curve': { render: () => <RetentionCurve />, title: 'Retention Curve', badge: { text: 'RLM', color: 'emerald' } },
  'depth-comparison': { render: () => <DepthComparison />, title: 'Depth 1 vs 2', badge: { text: 'RLM', color: 'emerald' } },
  'rllm-comparison': { render: () => <RllmComparison />, title: 'RLLM vs Hand-rolled', badge: { text: 'RLLM', color: 'red' } },
  'code-strategies': { render: () => <CodeStrategies />, title: 'Code Strategies', badge: { text: 'RLLM', color: 'red' } },
};

/* ── Filter Bar ───────────────────────────────────────────────── */

function FilterBar() {
  const filter = useFilter();

  const activeFocus = filter.focusedStrategy
    ? { domain: 'strategy' as const, value: filter.focusedStrategy }
    : filter.focusedType
      ? { domain: 'type' as const, value: filter.focusedType }
      : filter.focusedScenario
        ? { domain: 'scenario' as const, value: filter.focusedScenario }
        : filter.focusedCategory
          ? { domain: 'category' as const, value: filter.focusedCategory }
          : null;

  return (
    <div className="flex items-center gap-3 mb-4 min-h-[40px]">
      <div className="flex items-center gap-2 flex-1">
        {activeFocus && (
          <div className="flex items-center gap-2 bg-gray-800 rounded-lg px-3 py-1.5 text-sm">
            <span className="text-gray-400">Focused:</span>
            <span className="text-gray-100 font-medium">{activeFocus.value}</span>
            <button
              onClick={() => filter.clearFocus(activeFocus.domain)}
              className="text-gray-500 hover:text-gray-300 ml-1"
            >
              ×
            </button>
          </div>
        )}
      </div>
      {activeFocus && (
        <button
          onClick={() => filter.clearAllFocus()}
          className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1 border border-gray-700 rounded transition-colors"
        >
          Reset
        </button>
      )}
    </div>
  );
}

/* ── Expand Modal ─────────────────────────────────────────────── */

function ExpandModal({ config, onClose }: { panelId: string; config: PanelConfig; onClose: () => void }) {
  const content = config.render();

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/95 flex flex-col p-6" onClick={onClose}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-100">{config.title}</h2>
          {config.badge && (
            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
              config.badge.color === 'emerald' ? 'bg-emerald-900/50 text-emerald-400' : 'bg-red-900/50 text-red-400'
            }`}>
              {config.badge.text}
            </span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-200 text-2xl leading-none">×</button>
      </div>
      <div className="flex-1 min-h-0" onClick={(e) => e.stopPropagation()}>
        <Suspense fallback={<Skeleton className="h-full" />}>
          {content}
        </Suspense>
      </div>
    </div>
  );
}

/* ── Panel Grid ───────────────────────────────────────────────── */

function PanelGrid() {
  const filter = useFilter();
  const [expandedPanel, setExpandedPanel] = useState<string | null>(null);

  const gridClass = (() => {
    switch (filter.panels.length) {
      case 1: return 'grid-cols-1';
      case 2: return 'grid-cols-1 lg:grid-cols-2';
      case 3: return 'grid-cols-1 lg:grid-cols-2';
      case 4: return 'grid-cols-1 lg:grid-cols-2';
      default: return 'grid-cols-1';
    }
  })();

  return (
    <>
      <div className={`grid gap-4 ${gridClass}`}>
        {filter.panels.map((id, idx) => {
          const config = PANEL_MAP[id];
          if (!config) return null;

          // For 3 panels, make the last one span full width
          const spanFull = filter.panels.length === 3 && idx === 2;

          return (
            <div key={id} className={spanFull ? 'lg:col-span-2' : ''}>
              <Panel
                title={config.title}
                badge={config.badge}
                onExpand={() => setExpandedPanel(id)}
              >
                <Suspense fallback={<Skeleton />}>
                  {config.render()}
                </Suspense>
              </Panel>
            </div>
          );
        })}
      </div>

      {/* Expand Modal */}
      {expandedPanel && PANEL_MAP[expandedPanel] && (
        <ExpandModal
          panelId={expandedPanel}
          config={PANEL_MAP[expandedPanel]}
          onClose={() => setExpandedPanel(null)}
        />
      )}
    </>
  );
}

/* ── Dashboard Content ────────────────────────────────────────── */

function DashboardContent() {
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const filter = useFilter();

  useSyncURL();

  const handleBackgroundClick = () => {
    if (filter.shouldClearOnBackground()) {
      // Clear the active domain's focus
      if (filter.focusedStrategy) filter.clearFocus('strategy');
      else if (filter.focusedType) filter.clearFocus('type');
      else if (filter.focusedScenario) filter.clearFocus('scenario');
      else if (filter.focusedCategory) filter.clearFocus('category');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100" onClick={handleBackgroundClick}>
      <Sidebar expanded={sidebarExpanded} onToggle={() => setSidebarExpanded((e) => !e)} />
      <div className={`transition-all duration-200 ease-in-out ${sidebarExpanded ? 'ml-56' : 'ml-0'}`}>
        <div className="max-w-7xl mx-auto px-6 py-6">
          <header className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {!sidebarExpanded && <div className="w-8" />}
              <div>
                <h1 className="text-2xl font-bold text-gray-100">Context Arena Dashboard</h1>
                <p className="text-sm text-gray-400 mt-1">
                  Select panels from the sidebar — click chart elements to focus across views
                </p>
              </div>
            </div>
            <NavBar />
          </header>
          <FilterBar />
          <PanelGrid />
        </div>
      </div>
    </div>
  );
}

/* ── Page Export ───────────────────────────────────────────────── */

export default function DashboardPage() {
  return (
    <FilterProvider>
      <DashboardContent />
    </FilterProvider>
  );
}
