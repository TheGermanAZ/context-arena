import { useState, useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  useLeaderboard,
  useRetentionByType,
  useDepthComparison,
  useRllmComparison,
  useCodeAnalysis,
  useScenarioHeatmap,
  useCostAccuracy,
} from '../lib/hooks';
import { KPICard, Skeleton } from '../components/charts';
import NavBar from '../components/NavBar';
import Leaderboard from '../components/Leaderboard';
import TokenCost from '../components/TokenCost';
import RetentionByType from '../components/RetentionByType';
import RetentionCurve from '../components/RetentionCurve';
import DepthComparison from '../components/DepthComparison';
import RllmComparison from '../components/RllmComparison';
import CodeStrategies from '../components/CodeStrategies';
import ScenarioHeatmap from '../components/ScenarioHeatmap';
import CostAccuracy from '../components/CostAccuracy';

/* ---------- constants ---------- */

const SECTIONS = [
  { id: 'methodology', label: 'Methodology' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'cost', label: 'Cost of Remembering' },
  { id: 'efficiency', label: 'Efficiency Frontier' },
  { id: 'forgotten', label: 'What Gets Forgotten' },
  { id: 'depth', label: 'Depth' },
  { id: 'hand-vs-gen', label: 'Hand-rolled vs Code-Gen' },
  { id: 'code', label: 'Inside the Code' },
  { id: 'qpb', label: 'The QPB Breakthrough' },
  { id: 'ship', label: 'What We Ship' },
] as const;

const SECTION_IDS = SECTIONS.map((s) => s.id);

/* ---------- hooks ---------- */

function useScrollSpy(ids: string[]) {
  const [activeId, setActiveId] = useState(ids[0]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { rootMargin: '-20% 0px -70% 0px' },
    );

    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [ids]);

  return activeId;
}

function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setVisible(true);
      },
      { threshold: 0.1 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

/* ---------- shared components ---------- */

function DemoSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const { ref, visible } = useFadeIn();
  return (
    <section
      id={id}
      ref={ref}
      className={`py-16 transition-all duration-700 ${visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
    >
      <h2 className="text-2xl font-bold text-gray-100 mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Insight({ children }: { children: ReactNode }) {
  return <p className="text-gray-400 text-lg leading-relaxed mb-8">{children}</p>;
}

/* ---------- page ---------- */

export default function Demo() {
  const activeId = useScrollSpy(SECTION_IDS);

  const leaderboard = useLeaderboard();
  const retentionByType = useRetentionByType();
  const depthComparison = useDepthComparison();
  const rllmComparison = useRllmComparison();
  const codeAnalysis = useCodeAnalysis();
  const scenarioHeatmap = useScenarioHeatmap();
  const costAccuracy = useCostAccuracy();

  /* ---- derived values ---- */
  const top = leaderboard.data?.[0];
  const fullContext = leaderboard.data?.find((e) => e.strategy === 'Full Context');

  const sortedRetention = retentionByType.data
    ? [...retentionByType.data].sort((a, b) => a.pct - b.pct)
    : undefined;
  const worstType = sortedRetention?.[0];
  const bestType = sortedRetention?.[sortedRetention.length - 1];

  const depth1Pct = depthComparison.data?.summary.depth1Total.pct;
  const depth2Pct = depthComparison.data?.summary.depth2Total.pct;
  const depthImproves = depth1Pct != null && depth2Pct != null && depth2Pct - depth1Pct > 2;

  const handRolledPct = rllmComparison.data?.summary.handRolledPct;
  const rllmPct = rllmComparison.data?.summary.rllmPct;

  const codeData = codeAnalysis.data;
  const topCategory = codeData
    ? [...codeData.categories].sort((a, b) => b.count - a.count)[0]
    : undefined;

  /* ---- token savings for KPI ---- */
  const tokenSavingsPct =
    top && fullContext && fullContext.avgInputTokens > 0
      ? ((1 - top.avgInputTokens / fullContext.avgInputTokens) * 100).toFixed(0)
      : undefined;

  /* ---- heatmap derived values ---- */
  const sortedScenarios = scenarioHeatmap.data?.scenarioSummaries
    ? [...scenarioHeatmap.data.scenarioSummaries].sort((a, b) => a.accuracy - b.accuracy)
    : undefined;
  const hardestScenario = sortedScenarios?.[0];
  const easiestScenario = sortedScenarios?.[sortedScenarios.length - 1];
  const perfectStrategies = scenarioHeatmap.data?.strategySummaries.filter((s) => s.accuracy === 1).length;

  /* ---- cost-accuracy derived values ---- */
  const paretoCount = costAccuracy.data?.paretoFrontier.length;
  const cheapestPareto = costAccuracy.data?.paretoFrontier[0];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ---- top nav (site links only) ---- */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-sm border-b border-gray-800/50">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-end pl-52">
          <NavBar />
        </div>
      </nav>

      {/* ---- section sidebar ---- */}
      <aside className="fixed top-0 left-0 h-full w-48 bg-gray-900/80 backdrop-blur-sm border-r border-gray-800/50 z-40 flex flex-col pt-16 pb-6 overflow-y-auto">
        <div className="px-4 mb-4">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Sections</span>
        </div>
        <nav className="flex flex-col gap-0.5 px-3">
          {SECTIONS.map(({ id, label }) => (
            <a
              key={id}
              href={`#${id}`}
              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeId === id
                  ? 'bg-emerald-600/20 text-emerald-400 border-l-2 border-emerald-500'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
            >
              {label}
            </a>
          ))}
        </nav>
      </aside>

      {/* ---- content wrapper ---- */}
      <div className="ml-48 max-w-5xl mx-auto px-6 pt-24">
        {/* ---- hero KPIs ---- */}
        <div className="py-12">
          <h1 className="text-4xl font-bold mb-2">How LLMs Remember</h1>
          <p className="text-gray-400 text-lg mb-10">
            A data-driven narrative exploring memory retention across delegation strategies.
          </p>

          {leaderboard.isLoading || rllmComparison.isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Skeleton variant="kpi" />
              <Skeleton variant="kpi" />
              <Skeleton variant="kpi" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {top && (
                <KPICard
                  label="Best Strategy"
                  value={top.accuracy * 100}
                  format={(n) => `${n.toFixed(0)}%`}
                  subtitle={top.strategy}
                  accentColor="#10b981"
                />
              )}
              {handRolledPct != null && rllmPct != null && (
                <KPICard
                  label="Hand-rolled Retention"
                  value={handRolledPct}
                  format={(n) => `${n.toFixed(0)}%`}
                  subtitle={`vs ${rllmPct.toFixed(0)}% code-gen`}
                  accentColor="#3b82f6"
                />
              )}
              {tokenSavingsPct != null && (
                <KPICard
                  label="Token Savings"
                  value={Number(tokenSavingsPct)}
                  format={(n) => `${n.toFixed(0)}%`}
                  subtitle="vs Full Context"
                  accentColor="#f59e0b"
                />
              )}
            </div>
          )}
        </div>

        {/* ---- Section 1: Methodology ---- */}
        <DemoSection id="methodology" title="Methodology">
          <Insight>
            How we tested LLM memory — the experiment design behind these results.
          </Insight>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <KPICard label="Strategies" value={17} format={(n) => `${n}`} subtitle="Configurations tested" accentColor="#3b82f6" />
            <KPICard label="Scenarios" value={8} format={(n) => `${n}`} subtitle="Test situations" accentColor="#10b981" />
            <KPICard label="Probes" value={62} format={(n) => `${n}`} subtitle="Facts tracked" accentColor="#f59e0b" />
            <KPICard label="Experiments" value={10} format={(n) => `${n}`} subtitle="7 experiments + 3 retests" accentColor="#8b5cf6" />
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 text-sm text-gray-300 space-y-3">
            <p><strong className="text-gray-100">Models:</strong> Claude Haiku 4.5 (initial leaderboard), gpt-5-nano (same-model comparisons, extraction experiment), gpt-4.1-mini (depth experiment).</p>
            <p><strong className="text-gray-100">Compression trigger:</strong> Every 8 messages with a 4-message recent window. Each strategy defines how context is compressed — from never (Full Context) to every turn (Window).</p>
            <p><strong className="text-gray-100">Probe matching:</strong> 62 probes across 8 scenarios, tagged by type (entity, phone/id, quantity, date, correction, spatial, relationship, decision). Case-insensitive substring matching; all patterns must be present.</p>
            <p><strong className="text-gray-100">Benchmark evolution:</strong> Started with 8 strategies on the leaderboard, evolved through feasibility probes and retests to 17 configurations across 10 experiments.</p>
          </div>
        </DemoSection>

        {/* ---- Section 2: The Leaderboard ---- */}
        <DemoSection id="leaderboard" title="The Leaderboard">
          {top ? (
            <Insight>
              {`${top.strategy} leads with ${(top.accuracy * 100).toFixed(0)}% accuracy across all 8 scenarios, while costing just $${top.totalCost.toFixed(4)} in API calls.`}
            </Insight>
          ) : (
            <Skeleton variant="kpi" />
          )}
          {hardestScenario && easiestScenario ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <KPICard
                label="Hardest Scenario"
                value={hardestScenario.accuracy * 100}
                format={(n) => `${n.toFixed(0)}%`}
                subtitle={hardestScenario.scenario ?? ''}
                accentColor="#ef4444"
              />
              <KPICard
                label="Easiest Scenario"
                value={easiestScenario.accuracy * 100}
                format={(n) => `${n.toFixed(0)}%`}
                subtitle={easiestScenario.scenario ?? ''}
                accentColor="#10b981"
              />
              <KPICard
                label="Perfect Strategies"
                value={perfectStrategies ?? 0}
                format={(n) => `${n}`}
                subtitle="100% accuracy"
                accentColor="#3b82f6"
              />
            </div>
          ) : (
            <Skeleton variant="kpi" />
          )}
          <Leaderboard />
        </DemoSection>

        {/* ---- Section 3: Which Scenarios Break Which Strategies? ---- */}
        <DemoSection id="heatmap" title="Which Scenarios Break Which Strategies?">
          {hardestScenario ? (
            <Insight>
              {`${hardestScenario.scenario} is the toughest scenario — ${hardestScenario.total - hardestScenario.correct} of ${hardestScenario.total} strategies fail it. The heatmap below reveals which strategy-scenario combinations succeed.`}
            </Insight>
          ) : (
            <Skeleton variant="kpi" />
          )}
          <ScenarioHeatmap />
        </DemoSection>

        {/* ---- Section 4: The Cost of Remembering ---- */}
        <DemoSection id="cost" title="The Cost of Remembering">
          {top && fullContext ? (
            <Insight>
              {`Full Context consumes ${fullContext.avgInputTokens.toLocaleString()} tokens on average while ${top.strategy} achieves better accuracy at just ${top.avgInputTokens.toLocaleString()} tokens.`}
            </Insight>
          ) : (
            <Skeleton variant="kpi" />
          )}
          <TokenCost />
        </DemoSection>

        {/* ---- Section 5: The Efficiency Frontier ---- */}
        <DemoSection id="efficiency" title="The Efficiency Frontier">
          {paretoCount != null && cheapestPareto ? (
            <Insight>
              {`Only ${paretoCount} of 8 strategies sit on the Pareto frontier — offering the best accuracy at their cost point. The cheapest optimal strategy is ${cheapestPareto.strategy} at $${cheapestPareto.totalCost.toFixed(4)}.`}
            </Insight>
          ) : (
            <Skeleton variant="kpi" />
          )}
          <CostAccuracy />
        </DemoSection>

        {/* ---- Section 6: What Gets Forgotten ---- */}
        <DemoSection id="forgotten" title="What Gets Forgotten">
          {worstType && bestType ? (
            <Insight>
              {`${worstType.type} facts are the hardest to retain at ${worstType.pct.toFixed(0)}%, while ${bestType.type} facts survive at ${bestType.pct.toFixed(0)}%.`}
            </Insight>
          ) : (
            <Skeleton variant="kpi" />
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <RetentionByType />
            <RetentionCurve />
          </div>
        </DemoSection>

        {/* ---- Section 7: Does Depth Help? ---- */}
        <DemoSection id="depth" title="Does Depth Help?">
          {depth1Pct != null && depth2Pct != null ? (
            <Insight>
              {`Adding a second delegation layer ${depthImproves ? 'improves' : 'barely changes'} retention: ${depth1Pct.toFixed(0)}% at depth 1 vs ${depth2Pct.toFixed(0)}% at depth 2.`}
            </Insight>
          ) : (
            <Skeleton variant="kpi" />
          )}
          <DepthComparison />
        </DemoSection>

        {/* ---- Section 8: Hand-rolled vs Code-Gen ---- */}
        <DemoSection id="hand-vs-gen" title="Hand-rolled vs Code-Gen">
          {handRolledPct != null && rllmPct != null ? (
            <Insight>
              {`Hand-rolled delegation achieves ${handRolledPct.toFixed(0)}% retention versus just ${rllmPct.toFixed(0)}% for LLM-generated code — a ${(handRolledPct - rllmPct).toFixed(0)} percentage point gap.`}
            </Insight>
          ) : (
            <Skeleton variant="kpi" />
          )}
          <RllmComparison />
        </DemoSection>

        {/* ---- Section 9: Inside the Code ---- */}
        <DemoSection id="code" title="Inside the Code">
          {codeData && topCategory ? (
            <Insight>
              {`${codeData.totalBlocks} code blocks analyzed. The dominant category is '${topCategory.name}' at ${topCategory.pct.toFixed(0)}%.`}
            </Insight>
          ) : (
            <Skeleton variant="kpi" />
          )}
          <CodeStrategies />
        </DemoSection>

        {/* ---- Section 10: The QPB Breakthrough ---- */}
        <DemoSection id="qpb" title="The QPB Breakthrough">
          <Insight>
            After 6 experiments and 14 failed strategy variants, two new approaches cracked the retention problem.
            QPB (Quantity-Pinning Buffer) extends RLM with a regex side-channel that pins quantities, IDs, and
            dates — zero extra LLM calls, 96.8% retention. QTD (Query-Time Distillation) proves the theoretical
            ceiling: compress only at query time with the question in hand → 98.4%.
          </Insight>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <KPICard label="QPB Retention" value={96.8} format={(n) => `${n}%`} subtitle="vs 75.8% RLM baseline" accentColor="#22c55e" />
            <KPICard label="QTD Retention" value={98.4} format={(n) => `${n}%`} subtitle="Theoretical ceiling" accentColor="#3b82f6" />
            <KPICard label="Quantity Fix" value={100} format={(n) => `${n}%`} subtitle="was 65% in RLM" accentColor="#f59e0b" />
            <KPICard label="Extra LLM Cost" value={0} format={(n) => `${n}`} subtitle="QPB: regex only" accentColor="#8b5cf6" />
          </div>
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-6 text-sm text-gray-300 space-y-3 mb-6">
            <p><strong className="text-gray-100">Why QPB works:</strong> RLM&apos;s sub-LLM systematically drops exact numbers, IDs, and dates during compression. QPB catches these via regex patterns and stores them in a pinned buffer that persists across compression cycles. The sub-LLM still does what it&apos;s good at (language understanding); the buffer handles what it drops.</p>
            <p><strong className="text-gray-100">Why QTD proves the root cause:</strong> When you compress with the question in hand, retention matches Full Context (98.4%). The problem was never compression itself — it was <em>blind</em> compression.</p>
          </div>
        </DemoSection>

        {/* ---- Section 11: What We Ship ---- */}
        <DemoSection id="ship" title="What We Ship Now">
          <Insight>
            After 17 strategy configurations and 10 experiments, the research converges on a clear winner.
            QPB ships behind a feature flag; QTD stays in research; Stability-Plasticity is killed.
          </Insight>
          <div className="space-y-4 mb-8">
            {[
              { strategy: 'QPB', decision: 'Ship (behind flag)', color: 'border-emerald-500/30 bg-emerald-900/10', badge: 'text-emerald-400 bg-emerald-500/10', detail: '96.8% retention with zero additional LLM calls. Needs external benchmark validation.' },
              { strategy: 'QTD', decision: 'Research only', color: 'border-blue-500/30 bg-blue-900/10', badge: 'text-blue-400 bg-blue-500/10', detail: '98.4% retention — matches Full Context. But query-time distillation puts LLM latency on the critical path.' },
              { strategy: 'Stability-Plasticity', decision: 'Killed', color: 'border-red-500/30 bg-red-900/10', badge: 'text-red-400 bg-red-500/10', detail: '3 full runs across 2 configurations. All fail promotion criteria. Per-type variance (34pp swings) means effects are noise, not signal.' },
            ].map(({ strategy, decision, color, badge, detail }) => (
              <div key={strategy} className={`rounded-lg border ${color} p-5`}>
                <div className="flex items-center gap-3 mb-2">
                  <h4 className="text-gray-100 font-semibold">{strategy}</h4>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${badge}`}>{decision}</span>
                </div>
                <p className="text-gray-400 text-sm">{detail}</p>
              </div>
            ))}
          </div>
        </DemoSection>

        {/* ---- footer ---- */}
        <div className="py-16 text-center border-t border-gray-800">
          <p className="text-gray-400 mb-4">Want to explore the data yourself?</p>
          <Link
            to="/dashboard"
            className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-500 transition-colors"
          >
            Explore the dashboard &rarr;
          </Link>
        </div>
      </div>
    </div>
  );
}
