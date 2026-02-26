import { Link } from 'react-router-dom';
import { useLeaderboard } from '../lib/hooks';
import { KPICard, Skeleton } from '../components/charts';
import NavBar from '../components/NavBar';

export default function Landing() {
  const { data, isLoading } = useLeaderboard();

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
      <div className="max-w-4xl mx-auto px-6 pt-6 pb-16 space-y-20">
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
            {strategies.map((s) => (
              <div
                key={s.title}
                className="bg-gray-900 rounded-lg border border-gray-700 p-5 flex gap-4 shadow-lg shadow-black/20"
                style={{ borderLeftWidth: 4, borderLeftColor: s.color }}
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
