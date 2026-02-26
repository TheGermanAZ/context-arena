import { type ReactNode, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLeaderboard } from '../lib/hooks';
import { KPICard, Skeleton } from '../components/charts';
import GenericStrategyFlowAnimation, { type GenericStrategyFlowConfig } from '../components/GenericStrategyFlowAnimation';
import NavBar from '../components/NavBar';
import FullContextFlowAnimation from '../components/FullContextFlowAnimation';
import RlmFlowAnimation from '../components/RlmFlowAnimation';
import WindowedFlowAnimation from '../components/WindowedFlowAnimation';

export default function Landing() {
  const { data, isLoading } = useLeaderboard();
  const [selectedAnimationId, setSelectedAnimationId] = useState(strategyAnimationCatalog[0].id);
  const selectedAnimation = strategyAnimationCatalog.find((animation) => animation.id === selectedAnimationId)
    ?? strategyAnimationCatalog[0];

  // Derive KPI values from leaderboard data
  const bestAccuracy = data?.reduce((best, e) => (e.accuracy > best.accuracy ? e : best), data[0]);
  const lowestCost = data?.reduce((best, e) => (e.totalCost < best.totalCost ? e : best), data[0]);
  const mostEfficient = data
    ?.filter((e) => e.accuracy > 0.5)
    .reduce<typeof data[number] | undefined>(
      (best, e) => (!best || e.avgInputTokens < best.avgInputTokens ? e : best),
      undefined,
    );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <div className="max-w-5xl mx-auto px-6 pt-6 pb-16 space-y-20">
        <div className="flex justify-end">
          <NavBar />
        </div>

        {/* ── Hero ──────────────────────────────────────────── */}
        <section className="text-center">
          <h1 className="text-5xl font-bold tracking-tight mb-4">Context Arena</h1>
          <p className="text-lg text-gray-400 max-w-2xl mx-auto mb-10">
            Benchmarking memory strategies for LLM conversations
          </p>
          <div className="flex gap-4 justify-center">
            <Link
              to="/demo"
              className="px-6 py-3 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-500 transition-colors"
            >
              See the story
            </Link>
            <Link
              to="/dashboard"
              className="px-6 py-3 bg-gray-800 text-gray-200 rounded-lg border border-gray-700 font-medium hover:bg-gray-700 transition-colors"
            >
              Explore the data
            </Link>
          </div>
        </section>

        {/* ── What are memory strategies? ───────────────────── */}
        <section>
          <h2 className="text-2xl font-semibold text-center mb-10">What are memory strategies?</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {strategies.map((s, idx) => (
              <div
                key={s.title}
                className="strategy-reveal bg-gray-900 rounded-lg border border-gray-700 p-5 flex gap-4 shadow-lg shadow-black/20"
                style={{
                  borderLeftWidth: 4,
                  borderLeftColor: s.color,
                  animationDelay: `${120 + idx * 110}ms`,
                }}
              >
                <div
                  className="w-4 h-4 rounded-sm mt-1 flex-shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <div>
                  <h3 className="font-semibold mb-1">{s.title}</h3>
                  <p className="text-sm text-gray-400 leading-relaxed">{s.description}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-2xl font-semibold text-center mb-4">How Strategies Execute</h2>
          <p className="text-center text-gray-400 max-w-2xl mx-auto mb-8">
            Select a strategy to focus on one execution flow at a time, then press Play to inspect how memory is handled.
          </p>
          <div className="grid gap-6 2xl:grid-cols-[300px_minmax(0,1fr)] 2xl:items-start">
            <aside className="bg-gray-900 rounded-xl border border-gray-700 p-4 shadow-lg shadow-black/20 2xl:sticky 2xl:top-6">
              <p className="text-xs uppercase tracking-wider text-gray-500">Strategy Selector</p>
              <div className="mt-4 space-y-5">
                {strategyAnimationGroups.map((group) => (
                  <div key={group.label}>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{group.label}</p>
                    <div className="grid gap-2 sm:grid-cols-2 2xl:grid-cols-1">
                      {group.items.map((animation) => {
                        const isSelected = animation.id === selectedAnimation.id;
                        return (
                          <button
                            key={animation.id}
                            type="button"
                            onClick={() => setSelectedAnimationId(animation.id)}
                            className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
                              isSelected
                                ? 'bg-gray-800/90 text-gray-100'
                                : 'bg-gray-900 text-gray-300 border-gray-700 hover:bg-gray-800/60 hover:text-gray-200'
                            }`}
                            style={isSelected ? { borderColor: animation.accentColor } : undefined}
                          >
                            <span className="block text-sm font-semibold">{animation.title}</span>
                            <span className="block text-xs text-gray-400 mt-1 leading-relaxed">{animation.description}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </aside>

            <div className="min-w-0 space-y-3">
              <div className="px-1 flex items-center justify-between gap-4">
                <p className="text-xs uppercase tracking-wider text-gray-500">Now Viewing</p>
                <p className="text-sm font-semibold text-gray-200">{selectedAnimation.title}</p>
              </div>
              {selectedAnimation.render()}
            </div>
          </div>
        </section>

        {/* ── Key Findings ─────────────────────────────────── */}
        <section>
          <h2 className="text-2xl font-semibold text-center mb-10">Key Findings</h2>
          {isLoading || !data ? (
            <div className="grid gap-6 md:grid-cols-3">
              <Skeleton variant="kpi" />
              <Skeleton variant="kpi" />
              <Skeleton variant="kpi" />
            </div>
          ) : (
            <div className="grid gap-6 md:grid-cols-3">
              {bestAccuracy && (
                <KPICard
                  label="Best Accuracy"
                  value={bestAccuracy.accuracy * 100}
                  format={(n) => `${n.toFixed(0)}%`}
                  subtitle={bestAccuracy.strategy}
                  accentColor="var(--color-strategy-rlm)"
                />
              )}
              {lowestCost && (
                <KPICard
                  label="Lowest Cost"
                  value={lowestCost.totalCost}
                  format={(n) => `$${n.toFixed(4)}`}
                  subtitle={lowestCost.strategy}
                  accentColor="var(--color-strategy-correction-aware)"
                />
              )}
              {mostEfficient && (
                <KPICard
                  label="Most Efficient"
                  value={mostEfficient.avgInputTokens}
                  format={(n) => `${Math.round(n).toLocaleString()} tokens`}
                  subtitle={mostEfficient.strategy}
                  accentColor="var(--color-strategy-window-6)"
                />
              )}
            </div>
          )}
        </section>

        {/* ── CTA Footer ───────────────────────────────────── */}
        <section className="text-center pb-8">
          <div className="flex gap-6 justify-center">
            <Link
              to="/demo"
              className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              See the full story &rarr;
            </Link>
            <Link
              to="/dashboard"
              className="text-indigo-400 hover:text-indigo-300 font-medium transition-colors"
            >
              Explore the data &rarr;
            </Link>
          </div>
        </section>

      </div>
    </div>
  );
}

/* ── Strategy card data ─────────────────────────────────── */

const strategies = [
  {
    title: 'Full Context',
    description: 'Send the entire conversation every time. Perfect recall, exponential token cost.',
    color: 'var(--color-strategy-full-context)',
  },
  {
    title: 'Windowed',
    description: 'Keep only the last N messages. Fixed cost, but forgets early facts.',
    color: 'var(--color-strategy-window-6)',
  },
  {
    title: 'Recursive Summarization (RLM)',
    description: 'Compress old context into structured summaries. Balanced cost and recall.',
    color: 'var(--color-strategy-rlm)',
  },
];

type StrategyAnimationGroup = 'Core' | 'Advanced';

interface AdditionalStrategyAnimationConfig extends GenericStrategyFlowConfig {
  id: string;
  pickerTitle: string;
  pickerDescription: string;
}

interface StrategyAnimationCatalogItem {
  id: string;
  title: string;
  description: string;
  accentColor: string;
  group: StrategyAnimationGroup;
  render: () => ReactNode;
}

const additionalStrategyAnimations: AdditionalStrategyAnimationConfig[] = [
  {
    id: 'window-10',
    pickerTitle: 'Window(10)',
    pickerDescription: 'A larger rolling window before truncation starts.',
    title: 'Window(10) Execution',
    subtitle: 'Larger window keeps more recent turns before truncation, trading slightly higher cost for better recall.',
    ariaLabel: 'Window 10 strategy diagram with a larger active window and delayed truncation of older turns',
    theme: 'amber',
    background: '#efe7d6',
    lineColor: '#a16207',
    processorTitle: 'Window Selector',
    processorNote: 'keeps latest 10 turns',
    memoryTitle: 'Window Buffer (N=10)',
    memoryNote: 'older turns trimmed less aggressively',
    loopNote: 'response appends to the rolling window before next turn',
    rows: [
      { label: 'Turn 1 (old)', state: 'dropped' },
      { label: 'Turn 2 (old)', state: 'dropped' },
      { label: 'Turn 3', state: 'compressed' },
      { label: 'Turn 4', state: 'compressed' },
      { label: 'Turn 5', state: 'active' },
      { label: 'Turn 6', state: 'active' },
      { label: 'Turn 7', state: 'active' },
      { label: 'Turn 8', state: 'active' },
    ],
  },
  {
    id: 'summarize-8',
    pickerTitle: 'Summarize(8)',
    pickerDescription: 'Condenses older turns into a compact narrative summary.',
    title: 'Summarize(8) Execution',
    subtitle: 'Old turns are condensed into a running free-form summary before inference.',
    ariaLabel: 'Summarize strategy diagram showing compressed free-text summary memory',
    theme: 'cyan',
    background: '#d8edf0',
    lineColor: '#0e7490',
    processorTitle: 'Summarizer',
    processorNote: 'compress stale turns to text',
    memoryTitle: 'Summary Buffer',
    memoryNote: 'single narrative memory blob',
    loopNote: 'each response updates the summary then feeds the next prompt',
    rows: [
      { label: 'Turn 1', state: 'compressed' },
      { label: 'Turn 2', state: 'compressed' },
      { label: 'Turn 3', state: 'compressed' },
      { label: 'Turn 4', state: 'active' },
      { label: 'Turn 5', state: 'active' },
      { label: 'Turn 6', state: 'active' },
    ],
  },
  {
    id: 'structured-8',
    pickerTitle: 'Structured(8)',
    pickerDescription: 'Extracts facts into reusable structured slots.',
    title: 'Structured(8) Execution',
    subtitle: 'Key entities and facts are extracted into structured slots for compact retrieval.',
    ariaLabel: 'Structured strategy diagram showing extraction into schema slots before model call',
    theme: 'lime',
    background: '#e6efd8',
    lineColor: '#4d7c0f',
    processorTitle: 'Fact Extractor',
    processorNote: 'maps turns into slots',
    memoryTitle: 'Structured Memory',
    memoryNote: 'entities, dates, relations',
    loopNote: 'new response updates schema fields and preserves high-signal facts',
    rows: [
      { label: 'Entity updates', state: 'compressed' },
      { label: 'Date changes', state: 'compressed' },
      { label: 'Relation facts', state: 'compressed' },
      { label: 'Recent user turns', state: 'active' },
      { label: 'Recent assistant turns', state: 'active' },
    ],
    optionalBlock: {
      title: 'Schema Check',
      note: 'slot consistency',
      fill: '#d9efc2',
    },
  },
  {
    id: 'correction-aware',
    pickerTitle: 'CorrectionAware',
    pickerDescription: 'Prioritizes corrected facts over superseded values.',
    title: 'CorrectionAware Execution',
    subtitle: 'Contradicting facts are resolved so superseded values do not keep polluting context.',
    ariaLabel: 'Correction aware strategy diagram with conflict resolution and truth ledger memory',
    theme: 'violet',
    background: '#e8e0f3',
    lineColor: '#7c3aed',
    processorTitle: 'Correction Filter',
    processorNote: 'detects overwritten facts',
    memoryTitle: 'Truth Ledger',
    memoryNote: 'latest valid values only',
    loopNote: 'resolved corrections feed the next turn with stale facts suppressed',
    rows: [
      { label: 'Original claim', state: 'dropped' },
      { label: 'Correction', state: 'active' },
      { label: 'Follow-up correction', state: 'active' },
      { label: 'Supporting context', state: 'compressed' },
      { label: 'Recent turns', state: 'active' },
    ],
    optionalBlock: {
      title: 'Conflict Resolver',
      note: 'choose latest truth',
      fill: '#ded4f5',
    },
  },
  {
    id: 'hybrid',
    pickerTitle: 'Hybrid',
    pickerDescription: 'Combines summary, structure, and correction channels.',
    title: 'Hybrid Execution',
    subtitle: 'Blends summarization, structured slots, and correction tracking in one routing layer.',
    ariaLabel: 'Hybrid strategy diagram combining summary, structure, and correction checks in a shared loop',
    theme: 'pink',
    background: '#f1dde8',
    lineColor: '#be185d',
    processorTitle: 'Hybrid Router',
    processorNote: 'choose best memory path',
    memoryTitle: 'Hybrid Memory Graph',
    memoryNote: 'summary + slots + corrections',
    loopNote: 'response updates multiple memory channels before next inference',
    rows: [
      { label: 'Narrative details', state: 'compressed' },
      { label: 'Named entities', state: 'compressed' },
      { label: 'Corrections', state: 'active' },
      { label: 'Recent turns', state: 'active' },
      { label: 'Task instructions', state: 'active' },
    ],
    optionalBlock: {
      title: 'Safety Replay',
      note: 'high-risk facts',
      fill: '#f2cde0',
    },
  },
];

const strategyAnimationCatalog: StrategyAnimationCatalogItem[] = [
  {
    id: 'full-context',
    title: 'Full Context',
    description: 'Send the complete conversation each turn.',
    accentColor: 'var(--color-strategy-full-context)',
    group: 'Core',
    render: () => <FullContextFlowAnimation />,
  },
  {
    id: 'windowed',
    title: 'Windowed',
    description: 'Keep only the latest turns in memory.',
    accentColor: 'var(--color-strategy-window-6)',
    group: 'Core',
    render: () => <WindowedFlowAnimation />,
  },
  {
    id: 'rlm',
    title: 'RLM(8)',
    description: 'Delegate and summarize recursively.',
    accentColor: 'var(--color-strategy-rlm)',
    group: 'Core',
    render: () => <RlmFlowAnimation />,
  },
  ...additionalStrategyAnimations.map<StrategyAnimationCatalogItem>((animation) => ({
    id: animation.id,
    title: animation.pickerTitle,
    description: animation.pickerDescription,
    accentColor: animation.lineColor,
    group: 'Advanced',
    render: () => (
      <GenericStrategyFlowAnimation
        title={animation.title}
        subtitle={animation.subtitle}
        ariaLabel={animation.ariaLabel}
        theme={animation.theme}
        background={animation.background}
        lineColor={animation.lineColor}
        processorTitle={animation.processorTitle}
        processorNote={animation.processorNote}
        memoryTitle={animation.memoryTitle}
        memoryNote={animation.memoryNote}
        loopNote={animation.loopNote}
        rows={animation.rows}
        optionalBlock={animation.optionalBlock}
      />
    ),
  })),
];

const strategyAnimationGroups: Array<{ label: StrategyAnimationGroup; items: StrategyAnimationCatalogItem[] }> = [
  {
    label: 'Core',
    items: strategyAnimationCatalog.filter((animation) => animation.group === 'Core'),
  },
  {
    label: 'Advanced',
    items: strategyAnimationCatalog.filter((animation) => animation.group === 'Advanced'),
  },
];
