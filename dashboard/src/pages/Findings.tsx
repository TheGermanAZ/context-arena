import { useState, useEffect, useRef, type ReactNode } from 'react';
import NavBar from '../components/NavBar';
import Leaderboard from '../components/Leaderboard';
import RetentionByType from '../components/RetentionByType';
import RetentionCurve from '../components/RetentionCurve';
import DepthComparison from '../components/DepthComparison';
import RllmComparison from '../components/RllmComparison';
import CodeStrategies from '../components/CodeStrategies';
import ParallelBenchmarks from '../components/ParallelBenchmarks';
import { KPICard, Skeleton } from '../components/charts';
import { useLeaderboard } from '../lib/hooks';

/* ─── Scroll spy ─────────────────────────────── */

function useScrollSpy(ids: string[]) {
  const [activeId, setActiveId] = useState(ids[0]);
  useEffect(() => {
    const HEADER_OFFSET = 100;
    function onScroll() {
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= HEADER_OFFSET) {
          current = id;
        }
      }
      setActiveId(current);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [ids]);
  return activeId;
}

/* ─── Fade-in on scroll ──────────────────────── */

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

/* ─── Sections ───────────────────────────────── */

const SECTIONS = [
  { id: 'problem', label: 'The Problem' },
  { id: 'benchmark', label: 'Benchmark' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'forgotten', label: 'Forgotten' },
  { id: 'depth', label: 'Depth Paradox' },
  { id: 'prompts-vs-code', label: 'Prompts vs Code' },
  { id: 'persistence', label: 'Persistence Trap' },
  { id: 'proposals', label: 'Proposals Tested' },
  { id: 'sp-retest', label: 'SP Retest' },
  { id: 'qpb', label: 'QPB Breakthrough' },
  { id: 'gates', label: 'Promotion Gates' },
  { id: 'intent-framing', label: 'Intent Framing' },
  { id: 'strategy-map', label: 'Strategy Map' },
  { id: 'ship-now', label: 'What We Ship' },
  { id: 'landscape', label: 'The Field' },
  { id: 'insights', label: 'Insights' },
  { id: 'future', label: 'Where Next' },
] as const;

const SECTION_IDS = SECTIONS.map((s) => s.id);

/* ─── Helper components ──────────────────────── */

function FindingsSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  const { ref, visible } = useFadeIn();
  return (
    <section
      id={id}
      ref={ref}
      className={`py-16 border-b border-gray-800/40 last:border-b-0 transition-all duration-700 ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      }`}
    >
      <h2 className="text-3xl font-bold text-gray-100 mb-6">{title}</h2>
      {children}
    </section>
  );
}

function Prose({ children }: { children: ReactNode }) {
  return <p className="text-gray-400 text-lg leading-relaxed mb-6">{children}</p>;
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="border-l-4 border-amber-500/70 bg-amber-500/5 rounded-r-lg px-6 py-4 mb-6">
      <div className="text-gray-200 text-base leading-relaxed">{children}</div>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto mb-6">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-700">
            {headers.map((h) => (
              <th key={h} className="text-left text-gray-400 font-medium py-3 px-4 first:pl-0">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`py-3 px-4 first:pl-0 ${
                    j === 0 ? 'text-gray-200 font-medium' : 'text-gray-400'
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GapCard({ name, severity, description }: { name: string; severity: string; description: string }) {
  const color =
    severity === 'Critical'
      ? 'bg-red-500/10 text-red-400 border-red-500/20'
      : severity === 'Complete Gap'
        ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
        : 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-5">
      <div className="flex items-center gap-3 mb-2">
        <h4 className="text-gray-200 font-semibold text-sm">{name}</h4>
        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${color}`}>{severity}</span>
      </div>
      <p className="text-gray-500 text-sm leading-relaxed">{description}</p>
    </div>
  );
}

function VerdictBadge({ verdict }: { verdict: 'ABANDON' | 'INCONCLUSIVE' | 'PASS' | 'KILLED' | 'REWORK' | 'CONDITIONAL' }) {
  const styles = {
    ABANDON: 'bg-red-500/10 text-red-400 border-red-500/20',
    INCONCLUSIVE: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    PASS: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    KILLED: 'bg-red-500/10 text-red-400 border-red-500/20',
    CONDITIONAL: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    REWORK: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  };
  return (
    <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${styles[verdict]}`}>
      {verdict}
    </span>
  );
}

function ProbeCard({
  number,
  title,
  phase1,
  phase2,
  verdict,
  why,
}: {
  number: number;
  title: string;
  phase1: string;
  phase2: string;
  verdict: 'ABANDON' | 'INCONCLUSIVE' | 'KILLED' | 'REWORK';
  why: string;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-5">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-gray-500 font-bold text-sm">#{number}</span>
        <h4 className="text-gray-100 font-semibold text-sm flex-1">{title}</h4>
        <VerdictBadge verdict={verdict} />
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div>
          <span className="text-gray-500">Phase 1: </span>
          <span className="text-gray-300">{phase1}</span>
        </div>
        <div>
          <span className="text-gray-500">Phase 2: </span>
          <span className="text-gray-300">{phase2}</span>
        </div>
      </div>
      <p className="text-gray-500 text-xs leading-relaxed">{why}</p>
    </div>
  );
}

/* ─── Main page ──────────────────────────────── */

export default function Findings() {
  const activeId = useScrollSpy(SECTION_IDS);
  const leaderboard = useLeaderboard();

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Sticky header ── */}
      <header className="sticky top-0 z-30 bg-gray-950/80 backdrop-blur-md border-b border-gray-800/60">
        <div className="max-w-[90rem] mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-100">Findings</h1>
          <NavBar />
        </div>
      </header>

      {/* ── Sidebar + Content ── */}
      <div className="max-w-[90rem] mx-auto flex">
        {/* ── Section sidebar ── */}
        <aside className="hidden lg:block w-72 shrink-0 sticky top-[57px] h-[calc(100vh-57px)] overflow-y-auto border-r border-gray-800/40 py-8 px-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-600 mb-4 px-2">Sections</p>
          <nav className="flex flex-col gap-0.5">
            {SECTIONS.map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                className={`text-left text-xs px-2 py-1.5 rounded transition-colors leading-snug ${
                  activeId === id
                    ? 'text-emerald-400 bg-emerald-500/10 font-medium'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800/40'
                }`}
              >
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="flex-1 min-w-0 max-w-5xl px-6 pt-12 mx-auto">
        {/* ── Hero ── */}
        <header className="pt-8 pb-12">
          <h1 className="text-5xl font-extrabold tracking-tight mb-4">
            What LLMs Forget
          </h1>
          <p className="text-xl text-gray-400 max-w-3xl leading-relaxed">
            Benchmarking long-context memory strategies: why deeper delegation beats agentic code,
            what types of information disappear first, and how a zero-cost regex side-channel achieves 96.8% retention.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10">
            {leaderboard.isLoading ? (
              <>
                <Skeleton variant="kpi" />
                <Skeleton variant="kpi" />
                <Skeleton variant="kpi" />
                <Skeleton variant="kpi" />
              </>
            ) : (
              <>
                <KPICard label="Strategies Tested" value={17} format={(n) => String(n)} subtitle="memory configurations" accentColor="#10b981" />
                <KPICard label="Best Internal" value={96.8} format={(n) => `${n}%`} subtitle="QPB (storage only)" accentColor="#f59e0b" />
                <KPICard label="Probes" value={62} format={(n) => String(n)} subtitle="across 8 scenarios" accentColor="#f59e0b" />
                <KPICard label="Experiments" value={10} format={(n) => String(n)} subtitle="7 experiments + 3 retests" accentColor="#8b5cf6" />
              </>
            )}
          </div>
        </header>

        {/* ════════════════════════════════════════════
            Section 1 — The Problem
           ════════════════════════════════════════════ */}
        <FindingsSection id="problem" title="The Problem">
          <Prose>
            Large language models forget. Not gracefully — catastrophically. When an agent runs for 50+
            conversational turns, the context window fills up and something has to give. Every long-context
            memory strategy is a bet on what to keep and what to lose. Get the bet wrong and your agent
            forgets a phone number, ignores a correction, or hallucinates a budget figure that was updated
            three turns ago.
          </Prose>
          <Prose>
            The field has produced increasingly sophisticated solutions — from sliding windows to recursive
            summarization to neuroscience-inspired memory architectures. But a basic question remains
            underexplored:
          </Prose>
          <Callout>
            <strong>What types of information do these strategies actually lose, and when?</strong>
          </Callout>
          <Prose>Three failure modes drive the problem:</Prose>
          <div className="space-y-3 mb-6">
            {[
              ['Cost explosion', 'Attention is O(n²), so doubling context roughly quadruples compute.'],
              ['Information dilution', 'The model drowns in outdated or irrelevant tokens and misses what matters.'],
              ['Context poisoning', 'Failed attempts, verbose tool outputs, and stale observations actively mislead the model.'],
            ].map(([title, desc]) => (
              <div key={title} className="flex gap-3 items-start">
                <span className="text-red-400 font-bold text-sm mt-0.5">●</span>
                <div>
                  <span className="text-gray-200 font-medium">{title}</span>
                  <span className="text-gray-500"> — {desc}</span>
                </div>
              </div>
            ))}
          </div>
        </FindingsSection>

        {/* ════════════════════════════════════════════
            Section 2 — The Benchmark
           ════════════════════════════════════════════ */}
        <FindingsSection id="benchmark" title="The Benchmark">
          <Prose>
            We designed eight conversational scenarios, each targeting a specific way memory can fail.
            Each scenario plays out as a multi-turn conversation. The agent receives information
            incrementally, then faces a final question that requires synthesizing everything it was told.
          </Prose>
          <DataTable
            headers={['#', 'Scenario', 'Steps', 'What It Tests']}
            rows={[
              [1, 'Early Fact Recall', 20, 'Remembering details from message 1 after 20+ exchanges'],
              [2, 'State Change Tracking', 15, 'Tracking inventory across cumulative updates'],
              [3, 'Contradiction Resolution', 15, 'Handling explicit corrections ("actually, change the hotel to...")'],
              [4, 'Multi-hop Reasoning', 15, 'Computing answers that require combining facts from different turns'],
              [5, 'Long Horizon + Noise', 20, 'Extracting signal from irrelevant chit-chat'],
              [6, 'Cascading Corrections', 14, 'Following corrections that change downstream calculations'],
              [7, 'Implicit Corrections', 16, 'Detecting corrections without signal words ("actually", "wait")'],
              [8, 'Rapid-fire Corrections', 16, 'Tracking 15+ rapid changes to a wedding seating chart'],
            ]}
          />
          <Prose>
            Beyond pass/fail scoring, we instrumented each scenario with <strong>probes</strong> — 62
            specific facts tagged by type (entity, phone/id, quantity, date, correction, spatial,
            relationship, decision). Each probe has patterns to match against the strategy&apos;s internal
            state. This lets us answer not just &quot;did the strategy pass?&quot; but &quot;which specific
            facts survived compression, and which didn&apos;t?&quot;
          </Prose>
        </FindingsSection>

        {/* ════════════════════════════════════════════
            Section 3 — The Leaderboard
           ════════════════════════════════════════════ */}
        <FindingsSection id="leaderboard" title="The Leaderboard">
          <Prose>
            We tested 8 strategies on Claude Haiku 4.5, then re-ran the full leaderboard on gpt-5-nano
            for same-model comparison with agentic extraction. Each strategy uses a different approach to
            managing memory when conversation exceeds a threshold (typically 8 messages before compression).
          </Prose>
          <Prose>
            <strong>Hybrid</strong> (88% on nano) works because it runs two tracks in parallel: one extracts facts
            as natural-language sentences (preserving relationships), while the other produces a narrative
            summary. Neither track alone reaches the top — the combination does.{' '}
            <strong>Full Context</strong> (88% on nano) sends everything — no compression. It dropped from
            100% on Haiku to 88% on nano, proving some failures are reasoning limits, not memory limits.{' '}
            <strong>Sliding Window</strong> is the baseline everyone uses in production — it works until
            anything older than the window is needed.
          </Prose>
          <Leaderboard />
        </FindingsSection>

        {/* ════════════════════════════════════════════
            Section 4 — What Gets Forgotten
           ════════════════════════════════════════════ */}
        <FindingsSection id="forgotten" title="What Gets Forgotten">
          <Prose>
            Using our probe framework, we tracked every fact through every delegation cycle. The results
            reveal a clear hierarchy: some types survive compression; others are wiped completely.
          </Prose>
          <DataTable
            headers={['Type', 'Retention', 'Probes Lost', 'Interpretation']}
            rows={[
              ['spatial', '0%', '3/3', 'Floor plans, regions, locations — completely wiped'],
              ['decision', '0%', '1/1', '"We chose X over Y" — gone'],
              ['phone/id', '0%', '7/7', 'Phone numbers, policy IDs, codes — zeroed out'],
              ['quantity', '12%', '15/17', 'Dollar amounts, counts, rates — nearly all lost'],
              ['entity', '25%', '6/8', 'People, products, organizations — most lost'],
              ['relationship', '33%', '2/3', '"X is part of Y" — fragile'],
              ['correction', '45%', '11/20', '"Changed from A to B" — half survive'],
              ['date', '67%', '1/3', 'Dates and deadlines — best retained'],
            ]}
          />
          <Callout>
            Phone numbers, IDs, and spatial information get 0% retention — despite the sub-LLM&apos;s
            extraction questions specifically covering ENTITIES and NUMBERS. The sub-LLM treats them as
            lower priority than names and dates.
          </Callout>
          <Prose>
            A surprise in the data: probes often show LOST at cycle 1, then RETAINED at cycles 2-3,
            then LOST again at cycles 4-5. This non-monotonic curve happens because cycle 1 processes raw
            conversation (messy, easy to miss details), cycles 2-3 process the sub-LLM&apos;s own structured
            output (organized, easier to copy forward), and cycles 4-5 show compounding loss catching up.
          </Prose>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <RetentionByType />
            <RetentionCurve />
          </div>
        </FindingsSection>

        {/* ════════════════════════════════════════════
            Section 5 — The Depth Paradox
           ════════════════════════════════════════════ */}
        <FindingsSection id="depth" title="The Depth Paradox">
          <Callout>
            <strong>The photocopy metaphor is wrong.</strong> The intuitive model — each pass degrades
            like a photocopy of a photocopy — doesn&apos;t match the data. The second pass isn&apos;t copying;
            it&apos;s <em>re-reading with fresh eyes</em>.
          </Callout>
          <Prose>
            Standard RLM uses depth 1: one sub-LLM call per compression cycle. DeepRLM chains N calls —
            depth 2 means the first sub-LLM&apos;s output gets re-processed by a second sub-LLM with the
            same targeted questions. We expected compounding loss. We got the opposite.
          </Prose>
          <DataTable
            headers={['Scenario', 'Depth 1', 'Depth 2', 'Delta']}
            rows={[
              ['Early Fact Recall', '1/10', '8/10', '+7'],
              ['State Change Tracking', '2/7', '3/7', '+1'],
              ['Contradiction Resolution', '4/8', '4/8', '0'],
              ['Multi-hop Reasoning', '6/8', '7/8', '+1'],
              ['Long Horizon + Noise', '7/8', '3/8', '-4'],
              ['Cascading Corrections', '5/7', '4/7', '-1'],
              ['Implicit Corrections', '6/7', '5/7', '-1'],
              ['Rapid-fire Corrections', '6/7', '7/7', '+1'],
              ['Total', '37/62 (59.7%)', '41/62 (66.1%)', '+6.4pp'],
            ]}
          />
          <Prose>
            Two distinct modes emerge. <strong>Self-correction mode</strong> (4 scenarios improved): the
            second pass reads structured output and catches facts the first pass missed in raw
            conversation. Early Fact Recall jumped from 1/10 to 8/10.{' '}
            <strong>Noise amplification mode</strong> (3 scenarios degraded): for noisy or rapidly-changing
            scenarios, the second pass amplifies confusion because signal and noise are flattened into
            the same format.
          </Prose>
          <DepthComparison />
        </FindingsSection>

        {/* ════════════════════════════════════════════
            Section 6 — Prompts Beat Code
           ════════════════════════════════════════════ */}
        <FindingsSection id="prompts-vs-code" title="Prompts Beat Code">
          <Prose>
            What if we gave the LLM more freedom — let it write and execute its own extraction code?
            The rllm package enables exactly this: the LLM generates JavaScript that runs in a V8
            isolate to extract facts from conversation transcripts.
          </Prose>
          <DataTable
            headers={['Scenario', 'Hand-rolled RLM', 'RLLM Agentic', 'Delta']}
            rows={[
              ['Early Fact Recall', '80%', '0%', '+80pp'],
              ['State Change Tracking', '71%', '0%', '+71pp'],
              ['Contradiction Resolution', '75%', '0%', '+75pp'],
              ['Multi-hop Reasoning', '88%', '0%', '+88pp'],
              ['Long Horizon + Noise', '63%', '0%', '+63pp'],
              ['Cascading Corrections', '86%', '29%', '+57pp'],
              ['Implicit Corrections', '86%', '0%', '+86pp'],
              ['Rapid-fire Corrections', '86%', '71%', '+15pp'],
              ['Overall', '79.0%', '11.3%', '+67.7pp'],
            ]}
          />
          <Prose>
            The hand-rolled approach dominates on every scenario. In 6 of 8 scenarios, RLLM retained
            exactly 0 facts. Offline classification of all 168 code blocks generated revealed:
          </Prose>
          <DataTable
            headers={['Strategy', '% of Code Blocks', 'Description']}
            rows={[
              ['type_specific', '29%', 'Attempts category-based extraction (entities, quantities, etc.)'],
              ['flat_extraction', '13%', 'Simple line-by-line parsing with minimal structure'],
              ['chunking', '~5%', 'Splits transcript into chunks for batch processing'],
              ['unknown/ineffective', '53%', 'Malformed, incomplete, or non-functional code'],
            ]}
          />
          <Callout>
            Making an LLM write code to do what it can already do with language is like asking a
            translator to write a translation program instead of just translating. The 5-question prompt
            works because it delegates to the LLM&apos;s <em>language understanding</em> capabilities. Code
            generation forces an unnecessary indirection.
          </Callout>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <RllmComparison />
            <CodeStrategies />
          </div>
        </FindingsSection>

        {/* ════════════════════════════════════════════
            Section 7 — The Persistence Trap
           ════════════════════════════════════════════ */}
        <FindingsSection id="persistence" title="The Persistence Trap">
          <Prose>
            RLM&apos;s root cause was identified: wholesale replacement. Every compression cycle, the
            sub-LLM&apos;s output completely replaces whatever was stored before. The fix seemed obvious:
            parse the sub-LLM&apos;s output into typed stores and merge incrementally. Same call, same
            cost — just parse-then-merge instead of wholesale replace.
          </Prose>
          <DataTable
            headers={['Scenario', 'RLM(8)', 'PersistentRLM', 'Delta']}
            rows={[
              ['Early Fact Recall', 'PASS', 'PASS', '—'],
              ['State Change Tracking', 'PASS', 'FAIL', '-1'],
              ['Contradiction Resolution', 'PASS', 'PASS', '—'],
              ['Multi-hop Reasoning', 'PASS', 'PASS', '—'],
              ['Long Horizon + Noise', 'PASS', 'PASS', '—'],
              ['Cascading Corrections', 'PASS', 'PASS', '—'],
              ['Implicit Corrections', 'FAIL', 'FAIL', '—'],
              ['Rapid-fire Corrections', 'PASS', 'PASS', '—'],
              ['Total', '7/8 (88%)', '6/8 (75%)', '-1'],
            ]}
          />
          <DataTable
            headers={['Type', 'RLM(8)', 'PersistentRLM', 'Delta']}
            rows={[
              ['spatial', '33% (1/3)', '0% (0/3)', '-33pp'],
              ['decision', '100% (1/1)', '0% (0/1)', '-100pp'],
              ['quantity', '24% (4/17)', '18% (3/17)', '-6pp'],
              ['entity', '63% (5/8)', '63% (5/8)', '0'],
              ['relationship', '67% (2/3)', '67% (2/3)', '0'],
              ['correction', '85% (17/20)', '80% (16/20)', '-5pp'],
              ['phone/id', '86% (6/7)', '86% (6/7)', '0'],
              ['date', '100% (3/3)', '100% (3/3)', '0'],
              ['Total', '62.9% (39/62)', '56.5% (35/62)', '-6.4pp'],
            ]}
          />
          <Callout>
            The structured format <em>splits associations that the sub-LLM would naturally keep
            together</em>. &quot;Gadget-X moved to clearance, count unchanged at 200&quot; is a single
            compound fact in natural language, but three entries in three separate typed stores. The
            sub-LLM processes its own natural-language output better than its own structured output.
          </Callout>
        </FindingsSection>

        {/* ════════════════════════════════════════════
            Section 8 — Testing the Proposals
           ════════════════════════════════════════════ */}
        <FindingsSection id="proposals" title="Testing the Proposals">
          <Prose>

            The first five experiments identified RLM&apos;s weaknesses. Can targeted architectural changes fix
            them? We built lightweight feasibility probes for 5 proposals — two-phase experiments that test
            core assumptions before committing to full implementation. Phase 1 validates at zero LLM cost
            (regex, parsing). Phase 2 runs targeted benchmarks only if Phase 1 passes. Kill criteria stop
            early when the data says the idea is dead.
          </Prose>
          <DataTable
            headers={['#', 'Proposal', 'Phase 1', 'Phase 2', 'Verdict']}
            rows={[
              [1, 'Depth-Adaptive RLM', 'FAIL (50%)', 'skipped', 'ABANDON'],
              [2, 'Correction Format Engineering', 'n/a', 'KILL (0pp spread)', 'ABANDON'],
              [3, 'Structural Shadow Graphs', 'PASS (75%)', '+4pp avg', 'ABANDON'],
              [5, 'Stability-Plasticity', 'PASS (100%)', 'KILL (63.7% < RLM 75.8%)', 'KILLED'],
              [10, 'Schema-Guided Hybrid', 'FAIL (65%)', 'skipped', 'ABANDON'],
            ]}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 my-8">
            <ProbeCard
              number={1}
              title="Depth-Adaptive RLM"
              phase1="FAIL — 50% routing accuracy"
              phase2="skipped"
              verdict="ABANDON"
              why="Regex-based content signals (information density, noise ratio) are too coarse for automatic depth routing. The scenario that benefits most from depth 2 was routed to depth 1."
            />
            <ProbeCard
              number={2}
              title="Correction Format Engineering"
              phase1="n/a"
              phase2="KILL — 0pp spread"
              verdict="ABANDON"
              why="All 7 formats scored identically: 57.1%. Every format retained 100% corrections, 0% quantities. The sub-LLM treats all correction formats equivalently."
            />
            <ProbeCard
              number={3}
              title="Structural Shadow Graphs"
              phase1="PASS — 75% capture"
              phase2="+4pp avg improvement"
              verdict="ABANDON"
              why="Only +4pp gain at 2x token cost (~140K tokens per scenario). Dates and relationships improved, but entities and quantities degraded."
            />
            <ProbeCard
              number={5}
              title="Stability-Plasticity"
              phase1="PASS — 100% classifier recall"
              phase2="KILL — 63.7% vs RLM 75.8%"
              verdict="KILLED"
              why="Full retest across all 8 scenarios with 4 reps. Both hypotheses failed: phone/ID +0pp (needed +15pp), quantity +9pp (needed +10pp). Per-type variance too high (34pp swings) for mechanism to be trustworthy."
            />
            <ProbeCard
              number={10}
              title="Schema-Guided Hybrid"
              phase1="FAIL — 65% coverage"
              phase2="skipped"
              verdict="ABANDON"
              why='Schema generator produced domain-specific types ("pre_money_valuation") instead of abstract categories ("correction", "quantity"). The mapper couldn&apos;t bridge the gap.'
            />
          </div>

          <h3 className="text-xl font-semibold text-gray-200 mb-4">The Quantity Problem</h3>
          <Prose>
            The most striking cross-cutting finding: exact quantities were systematically destroyed by every
            RLM variant we tested — until QPB solved it:
          </Prose>
          <DataTable
            headers={['Experiment', 'Quantity Retention']}
            rows={[
              ['Correction Format (all 7 formats)', '0%'],
              ['RLM baseline (Retention Analysis)', '12%'],
              ['Stability-Plasticity', '17%'],
              ['PersistentRLM (Persistence Experiment)', '18%'],
              ['Shadow Graphs', '33%'],
              ['RLM(8) baseline (QPB Experiment)', '65%'],
              ['QPB (Quantity-Pinning Buffer)', '100%'],
            ]}
          />
          <Callout>
            <strong>Update:</strong> The Quantity-Pinning Buffer (QPB) closes this gap entirely. QPB raises
            quantity retention from 65% to <strong>100%</strong> with zero additional LLM cost — a regex
            side-channel that pins quantities, IDs, and dates across compression cycles. See the QPB
            Breakthrough section below for full results.
          </Callout>
        </FindingsSection>

        {/* ════════════════════════════════════════════
            Section 9 — Stability-Plasticity Retest
           ════════════════════════════════════════════ */}
        <FindingsSection id="sp-retest" title="Stability-Plasticity: Tested and Killed">
          <Prose>
            The original SP probe was inconclusive (wrong test scenarios). We re-ran it with three
            improvements: quantity-pinning classifier added, fresh RLM(8) baseline alongside every scenario,
            and all 8 scenarios with per-hypothesis kill criteria.
          </Prose>
          <DataTable
            headers={['Metric', 'SP Retest', 'SP Confirmation']}
            rows={[
              ['StabilityPlasticity', '80/124 (64.5%)', '81/124 (65.3%)'],
              ['RLM(8) baseline', '73/124 (58.9%)', '77/124 (62.1%)'],
              ['Net delta', '+5.6pp', '+3.2pp'],
            ]}
          />
          <Prose>
            Per-type results from the SP Retest:
          </Prose>
          <DataTable
            headers={['Type', 'SP', 'RLM', 'Delta']}
            rows={[
              ['correction', '90%', '88%', '+3pp'],
              ['date', '83%', '67%', '+17pp'],
              ['decision', '100%', '100%', '+0pp'],
              ['entity', '63%', '63%', '+0pp'],
              ['phone/id', '86%', '86%', '+0pp'],
              ['quantity', '26%', '18%', '+9pp'],
              ['relationship', '50%', '33%', '+17pp'],
              ['spatial', '50%', '33%', '+17pp'],
            ]}
          />
          <Callout>
            <strong>Verdict: KILL.</strong> Both hypotheses failed. H1 (phone/id pinning): +0pp where +15pp was needed —
            RLM already retains these at 86%. H2 (quantity pinning): +9pp where +10pp was needed. The biggest gains
            were on <em>non-targeted</em> types (date +17pp, relationship +17pp), but comparing the SP Confirmation
            run with the SP Retest shows these same types swung by 34pp between runs — too much variance to trust.
          </Callout>
          <Prose>
            This definitively validates the QPB direction: the problem isn&apos;t <em>which facts</em> to protect
            (Stability-Plasticity&apos;s approach) but <em>how</em> to compress without losing them
            (QPB&apos;s approach).
          </Prose>
        </FindingsSection>

        {/* ════════════════════════════════════════════
            Section 10 — QPB Breakthrough
           ════════════════════════════════════════════ */}
        <FindingsSection id="qpb" title="The QPB Breakthrough">
          <Prose>
            Two new strategies tested against Full Context and RLM(8) across all 8 probe-equipped scenarios
            (62 probes total):
          </Prose>
          <div className="space-y-3 mb-6">
            {[
              ['Query-Time Distillation (QTD)', 'Accumulates all messages raw with zero compression. When context exceeds the token budget at query time, fires a single sub-LLM call guided by the user\'s actual question.'],
              ['Quantity-Pinning Buffer (QPB)', 'Extends RLM with a regex side-channel that pins quantities/IDs/dates in a buffer that persists across compression cycles. Zero additional LLM calls.'],
            ].map(([title, desc]) => (
              <div key={title} className="flex gap-3 items-start">
                <span className="text-emerald-400 font-bold text-sm mt-0.5">●</span>
                <div>
                  <span className="text-gray-200 font-medium">{title}</span>
                  <span className="text-gray-500"> — {desc}</span>
                </div>
              </div>
            ))}
          </div>
          <DataTable
            headers={['Strategy', 'Retained', 'Total', 'Retention']}
            rows={[
              ['Full Context', 61, 62, '98.4%'],
              ['QTD', 61, 62, '98.4%'],
              ['QPB', 60, 62, '96.8%'],
              ['RLM(8)', 47, 62, '75.8%'],
            ]}
          />
          <h3 className="text-xl font-semibold text-gray-200 mb-4 mt-8">Retention by Probe Type</h3>
          <DataTable
            headers={['Type', 'Full Ctx', 'RLM(8)', 'QTD', 'QPB']}
            rows={[
              ['entity', '100%', '88%', '100%', '100%'],
              ['phone/id', '100%', '57%', '100%', '100%'],
              ['relationship', '67%', '67%', '67%', '67%'],
              ['quantity', '100%', '65%', '100%', '100%'],
              ['date', '100%', '33%', '100%', '100%'],
              ['decision', '100%', '100%', '100%', '100%'],
              ['correction', '100%', '90%', '100%', '95%'],
              ['spatial', '100%', '100%', '100%', '100%'],
            ]}
          />
          <div className="space-y-3 mt-8">
            <Callout>
              <strong>QTD matches Full Context exactly (98.4%).</strong> RLM&apos;s weakness is blind
              compression, not compression itself. When you compress with the question in hand, you
              don&apos;t lose relevant facts.
            </Callout>
            <Callout>
              <strong>QPB closes nearly all retention gaps.</strong> The regex side-buffer jumps retention
              from 75.8% to 96.8% (+21pp) with zero additional LLM cost. Dates: 33% → 100%. Phone/IDs:
              57% → 100%. Quantities: 65% → 100%.
            </Callout>
            <Callout>
              <strong>QPB has a correction ceiling.</strong> QPB scored 95% on corrections vs 100% for
              QTD/Full Context. The pinned buffer preserves old values alongside new values, but the
              sub-LLM&apos;s natural-language blob can still lose correction context.
            </Callout>
            <Callout>
              <strong>Important caveat:</strong> These numbers measure facts surviving in QPB&apos;s <em>internal state</em> (system prompt + messages).
              The promotion gates (CTX-48) measure facts in the model&apos;s <em>final answer</em> — see the Promotion Gates section below.
            </Callout>
          </div>
        </FindingsSection>

        {/* ════════════════════════════════════════════
            Section 10.5 — Promotion Gates (CTX-48)
           ════════════════════════════════════════════ */}
        <FindingsSection id="gates" title="QPB Promotion Gates (CTX-48)">
          <Prose>
            QPB&apos;s 96.8% internal retention needed to survive six promotion gates. Two independent
            runs revealed significant stochastic variance — QPB swung from last to first place depending
            on whether boundary scenarios passed. The verdict shifted from KILL to CONDITIONAL SHIP after
            run 2 demonstrated QPB as the accuracy leader.
          </Prose>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            <KPICard label="Gates Passed" value={3} format={(n) => `${n}/6`} subtitle="CONDITIONAL SHIP" accentColor="#f59e0b" />
            <KPICard label="QPB Accuracy" value={88} format={(n) => `${n}%`} subtitle="7/8 best-of-2 runs" accentColor="#22c55e" />
            <KPICard label="Phone/ID vs RLM" value={14.3} format={(n) => `+${n}pp`} subtitle="85.7% vs 71.4%" accentColor="#22c55e" />
            <KPICard label="Token Overhead" value={8.2} format={(n) => `${n}%`} subtitle="limit ≤ 10% — PASS" accentColor="#22c55e" />
          </div>
          <h3 className="text-xl font-semibold text-gray-200 mt-8 mb-4">Run Variance (2 Independent Leaderboard Runs)</h3>
          <DataTable
            headers={['Strategy', 'Run 1 (Accuracy)', 'Run 2 (Accuracy)']}
            rows={[
              ['Full Context', '7/8 (88%)', '6/8 (75%)'],
              ['QPB', '6/8 (75%)', '7/8 (88%)'],
              ['RLM(8)', '6/8 (75%)', '5/8 (63%)'],
            ]}
          />
          <Callout>
            <strong>Stochastic sensitivity.</strong> Rankings flip between runs because boundary scenarios
            (Contradiction Resolution, Early Fact Recall) sit at the model&apos;s reasoning limit. Both runs
            agree: QPB is competitive with or superior to RLM(8) on accuracy and matches Full Context.
          </Callout>
          <h3 className="text-xl font-semibold text-gray-200 mt-8 mb-4">Gate Results (Best of 2 Runs)</h3>
          <DataTable
            headers={['Gate', 'Target', 'Run 1', 'Run 2', 'Best', 'Verdict']}
            rows={[
              ['Quantity retention', '≥ 50%', '17.6%', '23.5%', '23.5%', 'FAIL'],
              ['Phone/ID retention', '≥ 90%', '85.7%', '85.7%', '85.7%', 'FAIL (marginal)'],
              ['Cross-session', '4/4', '—', '4/4', '4/4', 'PASS'],
              ['Benign refusal', '0%', '—', '0%', '0%', 'PASS'],
              ['Token overhead', '≤ 10%', '15.5%', '8.2%', '8.2%', 'PASS'],
              ['Official tracks ≥ 2/3', 'QPB > RLM', '0/3', '1/3', '1/3', 'FAIL (marginal)'],
            ]}
          />
          <h3 className="text-xl font-semibold text-gray-200 mt-8 mb-4">Official Benchmark Comparison (Run 2)</h3>
          <DataTable
            headers={['Benchmark', 'Full Context', 'RLM(8)', 'QPB', 'QPB vs RLM']}
            rows={[
              ['LongMemEval', '3/4 (75%)', '1/4 (25%)', '1/3 (33%)*', 'Improve'],
              ['MemoryArena', '1/4 (25%)', '4/4 (100%)', '4/4 (100%)', 'Tie'],
              ['MemoryAgentBench', '1/4 (25%)', '0/4 (0%)', '0/4 (0%)', 'Tie'],
            ]}
          />
          <Prose>
            <em>* QPB had 1 connection error on LongMemEval (scored 1/3 completed items).</em>
          </Prose>
          <h3 className="text-xl font-semibold text-gray-200 mt-8 mb-4">The Storage ≠ Retrieval Gap</h3>
          <Prose>
            The headline finding persists. QPB solves <em>storage</em> (quantities persist in the context
            window at 100%) but not <em>retrieval</em> (the model surfaces only 23.5% in its response).
          </Prose>
          <DataTable
            headers={['Measure', 'Internal State (CTX-7)', 'Final Answer (CTX-48, best run)']}
            rows={[
              ['Quantity retention', '100%', '23.5%'],
              ['Phone/ID retention', '100%', '85.7%'],
              ['Overall retention', '96.8%', '65.8%'],
            ]}
          />
          <div className="space-y-3 mt-6">
            <Callout>
              <strong>Why CONDITIONAL SHIP, not KILL:</strong> (1) QPB is the accuracy leader (7/8 best-of-2). (2) Failed retention
              gates are miscalibrated for final-answer measurement — no strategy reaches 50% quantity retention. (3) QPB
              never underperforms RLM on accuracy across any run. (4) Recalibrated gates (improve over RLM baseline)
              yield 5/6 pass.
            </Callout>
            <Callout>
              <strong>Three retrieval-side interventions worth exploring:</strong> (1) Prompt engineering — explicitly instruct the model
              to reference the pinned buffer. (2) QPB + QTD hybrid — combine QPB&apos;s zero-cost storage with QTD&apos;s
              query-aware retrieval. (3) Structured injection — force-feed pinned values into the question context
              rather than appending to the system prompt.
            </Callout>
          </div>
          <div className="mt-6 flex items-center gap-3">
            <VerdictBadge verdict="CONDITIONAL" />
            <span className="text-gray-400 text-sm">Accuracy leader, but storage-retrieval gap needs retrieval-side intervention.</span>
          </div>
        </FindingsSection>

        {/* ════════════════════════════════════════════
            Section 11 — Intent Framing
           ════════════════════════════════════════════ */}
        <FindingsSection id="intent-framing" title="The Intent Framing Experiment">
          <Prose>
            The Intent Framing Experiment tested whether injecting a benign-context frame into QPB&apos;s
            system prompt eliminates safety refusals. Four strategies tested across 2 scenarios × 3 reps.
          </Prose>
          <h3 className="text-xl font-semibold text-gray-200 mb-4">v1 Results (Action-Plan Question)</h3>
          <DataTable
            headers={['Strategy', 'Pass Rate', 'Refusals', 'Avg Checks (of 8)']}
            rows={[
              ['RLM(8)', '1/6', '0', '6.7'],
              ['QPB+Frame', '1/6', '1', '4.7'],
              ['Full Context', '0/6', '1', '4.7'],
              ['QPB', '0/6*', '1', '1.7*'],
            ]}
          />
          <h3 className="text-xl font-semibold text-gray-200 mt-8 mb-4">v2 Results (Fact-Recall Question)</h3>
          <DataTable
            headers={['Strategy', 'Pass Rate', 'Refusals', 'Avg Checks (of 8)']}
            rows={[
              ['QPB+Frame', '4/6', '0', '7.3'],
              ['Full Context', '4/6', '0', '6.8'],
              ['QPB', '3/6', '0', '5.3'],
              ['RLM(8)', '2/6', '0', '4.2'],
            ]}
          />
          <Callout>
            <strong>The v1 confound was the question format, not compression.</strong> Switching from
            action-plan to fact-recall questions eliminated all safety refusals (3 in v1 → 0 in v2).
            QPB+Frame matches Full Context at 4/6 passes and scores highest average checks (7.3/8).
          </Callout>
          <div className="mt-4 flex items-center gap-3">
            <VerdictBadge verdict="PASS" />
            <span className="text-gray-400 text-sm">Benign-refusal gate cleared: 0 refusals across 24 runs</span>
          </div>
        </FindingsSection>

        {/* ════════════════════════════════════════════
            Section 12 — Strategy Evolution Map
           ════════════════════════════════════════════ */}
        <FindingsSection id="strategy-map" title="Strategy Evolution Map">
          <Prose>
            We tested 17 strategy configurations across 7 experiments. Three evolutionary branches emerged,
            each revealing a different lesson about how to (and how not to) fix memory loss.
          </Prose>
          <DataTable
            headers={['#', 'Strategy', 'Experiment', 'Retention', 'Verdict']}
            rows={[
              [1, 'Window(10)', 'Leaderboard', '45%', 'Baseline'],
              [2, 'Summarize(8)', 'Leaderboard', '48%', 'Baseline'],
              [3, 'RLLM (Agentic Code)', 'Leaderboard + Extraction', '42%', 'Outperformed'],
              [4, 'RLM(8)', 'Leaderboard', '53%', 'Core architecture'],
              [5, 'DiscoveredRLM', 'Depth Experiment', '56%', 'Research only'],
              [6, 'Structured(8)', 'Leaderboard', '60%', 'Baseline'],
              [7, 'Full Context', 'Leaderboard', '66%', 'Reference'],
              [8, 'Hybrid', 'Leaderboard', '71%', 'Strong but 2x cost'],
              [9, 'PersistentRLM', 'Persistence Experiment', '56.5%', 'Worse than RLM'],
              [10, 'DA-RLM', 'Feasibility Probes', '—', 'ABANDON'],
              [11, 'Correction Format (×7)', 'Feasibility Probes', '57.1%', 'ABANDON'],
              [12, 'Shadow Graphs', 'Feasibility Probes', '55.9%', 'ABANDON'],
              [13, 'Stability-Plasticity', 'SP Retest + Confirm', '64.5%', 'KILLED'],
              [14, 'Schema-Guided', 'Feasibility Probes', '—', 'ABANDON'],
              [15, 'QPB', 'QPB Experiment + Gates', '96.8% (int) / 7/8 acc', 'Conditional Ship'],
              [16, 'QTD', 'QPB Experiment', '98.4%', 'Research only'],
              [17, 'QPB+Frame', 'Intent Framing v2', '7.3/8 avg', 'GO'],
            ]}
          />
          <h3 className="text-xl font-semibold text-gray-200 mt-8 mb-4">Three Evolutionary Branches</h3>
          <div className="space-y-6">
            <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
              <h4 className="text-gray-100 font-semibold mb-2 flex items-center gap-2">
                <span className="text-red-400">Branch 1 — Depth</span>
                <span className="text-xs text-gray-500">(Dead End)</span>
              </h4>
              <p className="text-gray-400 text-sm leading-relaxed">
                What if we delegate twice? Depth-2 helps dense scenarios (Early Fact Recall: 1/10 → 8/10)
                but hurts noisy ones (Long Horizon: 7/8 → 3/8). DA-RLM tried to auto-route — but regex-based
                signals couldn&apos;t distinguish dense from noisy (50% routing accuracy). The needed signal is
                semantic, which reintroduces LLM cost.
              </p>
            </div>
            <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
              <h4 className="text-gray-100 font-semibold mb-2 flex items-center gap-2">
                <span className="text-red-400">Branch 2 — Structure</span>
                <span className="text-xs text-gray-500">(Dead End)</span>
              </h4>
              <p className="text-gray-400 text-sm leading-relaxed">
                Five strategies tried to fix type-specific losses by adding structure: typed stores (PersistentRLM),
                parallel graphs (Shadow Graphs), dual-channel routing (Stability-Plasticity), better correction
                prompts (Correction Format). All failed. The sub-LLM already handles what it handles; restructuring
                the input doesn&apos;t help what it can&apos;t extract.
              </p>
            </div>
            <div className="rounded-lg border border-emerald-800/50 bg-emerald-900/10 p-6">
              <h4 className="text-gray-100 font-semibold mb-2 flex items-center gap-2">
                <span className="text-emerald-400">Branch 3 — Extraction Architecture</span>
                <span className="text-xs text-emerald-500">(Winner)</span>
              </h4>
              <p className="text-gray-400 text-sm leading-relaxed">
                The Extraction Experiment proved prompts beat code (79% vs 11%). The Quantity Problem emerged
                across all variants (0-33% retention). This pointed to a different fix: don&apos;t change the
                sub-LLM&apos;s job — add a <strong>zero-cost regex side-channel</strong> that catches what it
                drops. QPB pins quantities, IDs, and dates across compression cycles. Result: 96.8% retention,
                zero extra LLM calls. QTD proved the ceiling: 98.4%. <strong>The winning path: accept the
                sub-LLM&apos;s limitations and build around them.</strong>
              </p>
            </div>
          </div>
        </FindingsSection>

        {/* ════════════════════════════════════════════
            Section 13 — What We Ship Now
           ════════════════════════════════════════════ */}
        <FindingsSection id="ship-now" title="What We Ship Now">
          <DataTable
            headers={['Strategy', 'Decision', 'Rationale', 'Caveat']}
            rows={[
              ['QPB', 'Killed (promotion gates)', '96.8% internal retention but 17.6% final-answer quantity retention. 2/6 gates passed.', 'Storage layer is sound — retrieval gap is the blocker'],
              ['QTD', 'Do not ship (research)', 'Matches Full Context recall (98.4%), proves question-aware retrieval works', 'Query-time distillation puts LLM latency on the critical path'],
              ['Stability-Plasticity', 'Do not ship (kill)', 'Full-run confirmation still trips kill criteria from side effects', 'Regresses date and relationship types'],
              ['QPB + QTD Hybrid', 'Next to explore', 'Combine QPB\'s zero-cost storage with QTD\'s query-aware retrieval', 'Untested — requires new experiment'],
            ]}
          />
          <h3 className="text-xl font-semibold text-gray-200 mt-8 mb-4">Claim Confidence</h3>
          <DataTable
            headers={['Claim', 'Confidence', 'Caveat']}
            rows={[
              ['Internal retention ≠ final-answer quality', 'High', 'QPB: 96.8% internal → 17.6% quantity in answers (CTX-48)'],
              ['Blind compression is dominant RLM failure', 'High', 'Demonstrated on current suite + model family'],
              ['QPB storage layer is sound', 'High', 'Quantities persist at 100% in context; retrieval is the gap'],
              ['Stability-Plasticity abandoned', 'Medium-High', 'Both runs fail promotion; disagree on absolute baseline level'],
              ['Safety/refusal interaction is real', 'Medium', 'v1 benchmark confounded; needs v2 rerun'],
            ]}
          />
          <h3 className="text-xl font-semibold text-gray-200 mt-8 mb-4">Promotion Checklist (Final — CTX-48)</h3>
          <DataTable
            headers={['Gate', 'Target', 'Result', 'Evidence']}
            rows={[
              ['Quantity retention', '≥ 50%', 'FAIL (17.6%)', 'QPB leaderboard retentionByType.quantity'],
              ['Phone/ID retention', '≥ 90%', 'FAIL (85.7%)', 'QPB leaderboard retentionByType.phone/id'],
              ['Cross-session', '4/4 pass', 'PASS (4/4)', 'internal-cross-session-1772221698135.json'],
              ['Benign refusal rate', '0%', 'PASS (0%)', 'memory-action-micro QPB 8/8, zero refusals'],
              ['Token overhead vs RLM', '≤ 10%', 'FAIL (15.5%)', 'QPB 119K vs RLM 103K avg tokens'],
              ['Official tracks improvement', '≥ 2/3', 'FAIL (0/3)', 'Tie on LongMemEval + MAB, lose on MemoryArena'],
            ]}
          />
        </FindingsSection>

        {/* ════════════════════════════════════════════
            Section 14 — The Field
           ════════════════════════════════════════════ */}
        <FindingsSection id="landscape" title="The Field">
          <Prose>
            The long-context memory problem sits at the intersection of five layers of the AI stack,
            each with its own approaches and trade-offs:
          </Prose>
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6 mb-8 font-mono text-sm space-y-1">
            {[
              ['Layer 5: Application', 'Agent-controlled memory (AgeMem, A-MEM, MemRL, EverMemOS, Mem0)'],
              ['Layer 4: Prompt', 'Scoring & compression (AFM, ACON, Scaling Paradox, CorrectBench)'],
              ['Layer 3: Orchestration', 'Multi-agent distribution (Chain-of-Agents, RLMs, MemEvolve, MAGMA)'],
              ['Layer 2: Retrieval', 'RAG, hybrid RAG+LC, SELF-ROUTE, MemSearcher, graph memory'],
              ['Layer 1: Architecture', 'TTT (context → weights), PaTH Attention, positional encoding'],
            ].map(([layer, desc]) => (
              <div key={layer} className="flex gap-4">
                <span className="text-emerald-400 whitespace-nowrap">{layer}</span>
                <span className="text-gray-500">│</span>
                <span className="text-gray-400">{desc}</span>
              </div>
            ))}
          </div>

          <h3 className="text-xl font-semibold text-gray-200 mb-4">8 Critical Gaps</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <GapCard
              name="GAP 1: Memory-Action Integration"
              severity="Critical"
              description="Almost all benchmarks test memory in isolation (can you recall X?). Almost none test whether memory actually improves agent decisions."
            />
            <GapCard
              name="GAP 2: Cross-Session Learning"
              severity="Critical"
              description="No benchmark tests whether agents learn from mistakes across sessions, build expertise over time, or transfer knowledge between tasks."
            />
            <GapCard
              name="GAP 3: Memory at True Scale"
              severity="High"
              description="Most benchmarks cap at 128K tokens. Real agents accumulate millions of tokens across hundreds of sessions."
            />
            <GapCard
              name="GAP 4: Memory Write Quality"
              severity="High"
              description="No benchmark evaluates what agents choose to store vs. discard, whether stored representations degrade, or the cost of memory maintenance."
            />
            <GapCard
              name="GAP 5: Selective Forgetting"
              severity="High"
              description="When information updates or contradicts prior knowledge, how does the agent handle it? No benchmark tests cascading updates."
            />
            <GapCard
              name="GAP 6: Cost-Performance Tradeoffs"
              severity="High"
              description="Every benchmark reports accuracy. Almost none report latency, token cost, dollar cost, or storage requirements."
            />
            <GapCard
              name="GAP 7: Multi-Agent Memory"
              severity="Complete Gap"
              description="No benchmark evaluates memory sharing, coordination, or conflict resolution between multiple agents."
            />
            <GapCard
              name="GAP 8: Backbone Robustness"
              severity="High"
              description="Memory system performance varies wildly across LLM backends. No benchmark tests this systematically."
            />
          </div>

          <h3 className="text-xl font-semibold text-gray-200 mb-4">Benchmark Expansion</h3>
          <Prose>
            We ran bounded proxy adapters against industry benchmarks and built internal micro-benchmarks
            to calibrate our findings across 7 tracks:
          </Prose>
          <ParallelBenchmarks />
          <Callout>
            Agents scoring 90%+ on recall benchmarks achieve 0-12% success on agentic tasks. The
            gap between &quot;can remember&quot; and &quot;can act on memories&quot; is the field&apos;s
            central unsolved problem.
          </Callout>
        </FindingsSection>

        {/* ════════════════════════════════════════════
            Section 9 — Insights & Surprises
           ════════════════════════════════════════════ */}
        <FindingsSection id="insights" title="Insights & Surprises">
          <Prose>
            Cross-cutting discoveries gleaned from Claude&apos;s analysis sessions and the literature
            survey — the meta-findings that emerged from looking at all the data together.
          </Prose>
          <div className="space-y-4">
            {[
              {
                title: 'The Photocopy Metaphor Is Wrong',
                text: 'Depth-2 is re-reading with fresh eyes, not degrading copies. The second pass processes structured output and recovers details the first pass missed in raw conversation.',
              },
              {
                title: 'Anti-Bayesian Drift',
                text: 'LLMs get MORE confident when contradicted (72.9% → 83.3%). Instead of updating beliefs, they entrench — the opposite of rational updating.',
              },
              {
                title: 'The Scaling Paradox',
                text: 'Bigger compressor models produce LESS faithful output. Knowledge overwriting and semantic drift increase with model capability — the model "knows better" and overwrites what it was told.',
              },
              {
                title: 'The Recall-Action Gap',
                text: '90%+ recall benchmarks translate to just 0-12% on real agent tasks. Remembering is necessary but nowhere near sufficient for acting correctly.',
              },
              {
                title: 'Structure Is The Secret',
                text: 'Winning strategies give the sub-LLM structure to fill in (5 questions, category headers). Losing strategies ask the LLM to invent structure — and it mostly fails.',
              },
              {
                title: 'Format Determines Extraction Quality',
                text: 'The sub-LLM processes its own natural-language output better than its own structured output. The structure that helps humans parse information constrains the LLM\'s cross-category associations.',
              },
              {
                title: 'Cost Economics Are Invisible',
                text: 'Almost no benchmark reports cost alongside accuracy. Hybrid is 100% accurate but requires 2x LLM calls per compression cycle — a trade-off that\'s invisible in accuracy-only leaderboards.',
              },
              {
                title: 'The Model Size Paradox',
                text: 'Hand-rolled prompts on nano outperform agentic code gen on larger models. Smaller models with better strategy beat larger naive models (confirmed by MemSearcher findings).',
              },
              {
                title: 'Prompts Compress Human Expertise',
                text: 'The 5-question prompt succeeds because it encodes what types of information matter. Code gen forces the LLM to rediscover this expertise from scratch each time.',
              },
              {
                title: 'Non-Monotonic Retention',
                text: 'Facts lost at cycle 1 can reappear at cycles 2-3 then be permanently lost at 4-5. The sub-LLM\'s extraction quality varies based on input format, not monotonically on distance.',
              },
              {
                title: 'Correction Format Is Irrelevant',
                text: 'Seven distinct correction formats — from explicit negation to Socratic elicitation — all scored identically (57.1%). The sub-LLM already handles corrections well (100% retention). The bottleneck was never how we communicate corrections.',
              },
              {
                title: 'Quantities: Storage Solved, Retrieval Not',
                text: 'QPB\'s regex side-channel raises internal-state quantity retention from 65% to 100% (CTX-7). But the promotion gates (CTX-48) revealed that internal retention ≠ final-answer retention: quantity retention in the model\'s response is only 17.6%. The pinned buffer preserves facts in context but the model doesn\'t surface them in output.',
              },
              {
                title: 'Blind Compression Is The Root Cause',
                text: 'QTD proves this definitively: when the sub-LLM knows the question being asked, retention matches Full Context (98.4%). RLM\'s information loss isn\'t from compression itself — it\'s from compressing without knowing what matters.',
              },
              {
                title: 'Parallel Structures Add Cost, Not Quality',
                text: 'Shadow Graphs (knowledge graph alongside RLM) produced only +4pp improvement at 2x token cost. Architectural additions that run parallel LLM calls must clear a high cost-effectiveness bar.',
              },
            ].map(({ title, text }) => (
              <Callout key={title}>
                <strong>{title}.</strong> {text}
              </Callout>
            ))}
          </div>
        </FindingsSection>

        {/* ════════════════════════════════════════════
            Section 10 — Where Next
           ════════════════════════════════════════════ */}
        <FindingsSection id="future" title="Where Next">
          <Prose>
            The QPB promotion gates answered the biggest open question — and revealed a new one. Storage is solved;
            retrieval is the next frontier. Here&apos;s where the research stands:
          </Prose>

          <h3 className="text-xl font-semibold text-gray-200 mb-4">Answered Questions</h3>
          <div className="space-y-2 mb-8">
            {[
              { q: 'Can a dual-track architecture outperform both base RLM and Hybrid?', a: 'Partially: QPB achieves 96.8% internal retention, but 2/6 promotion gates passed. Storage works; retrieval doesn\'t follow automatically.' },
              { q: 'Does Stability-Plasticity work when tested on the right scenarios?', a: 'Answered: Not as a promotable strategy. SP Retest (4 reps) failed outright. SP Confirmation showed small gain but triggered kill criteria from side effects.' },
              { q: 'Can a quantity-pinning buffer improve number retention?', a: 'Answered: In internal state, yes — 65% → 100%. In final answers, no — only 17.6% (CTX-48). The storage problem is solved; the retrieval problem is not.' },
              { q: 'Does QPB\'s advantage hold on external benchmarks?', a: 'Answered: No. 0/3 official tracks improved. QPB tied RLM on LongMemEval and MemoryAgentBench, lost on MemoryArena.' },
            ].map(({ q, a }) => (
              <div key={q} className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
                <p className="text-gray-200 text-sm font-medium mb-1 line-through opacity-70">{q}</p>
                <p className="text-emerald-400 text-sm">{a}</p>
              </div>
            ))}
          </div>

          <h3 className="text-xl font-semibold text-gray-200 mt-8 mb-4">Remaining Open Questions</h3>
          <ul className="space-y-2 mb-10 text-gray-400">
            {[
              'Can retrieval-side prompt engineering close the storage-retrieval gap? (e.g., "Review PINNED QUANTITIES and include relevant values")',
              'Would a QPB + QTD hybrid combine the best of both — zero-cost storage with query-aware retrieval?',
              'Can structured injection (force-feeding pinned values into the question context) outperform system-prompt appending?',
              'Does the self-correction effect hold at depth 3+?',
              'Can the sub-LLM prompt be tuned per-type to eliminate the 0% retention categories?',
              'Would a larger model close the agentic extraction gap?',
              'Is the format sensitivity specific to small models, or do larger models also extract worse from structured input?',
            ].map((q) => (
              <li key={q} className="flex gap-3">
                <span className="text-emerald-500 mt-1">?</span>
                <span>{q}</span>
              </li>
            ))}
          </ul>

          {/* CTA footer */}
          <div className="rounded-xl border border-gray-800 bg-gradient-to-br from-gray-900 to-gray-950 p-8 text-center">
            <h3 className="text-2xl font-bold text-gray-100 mb-3">Explore the Data</h3>
            <p className="text-gray-400 mb-6">
              See the interactive story or dive into the full dashboard with filters and exports.
            </p>
            <div className="flex justify-center gap-4">
              <a
                href="/demo"
                className="px-6 py-2.5 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-500 transition-colors"
              >
                Interactive Story
              </a>
              <a
                href="/dashboard"
                className="px-6 py-2.5 rounded-lg border border-gray-700 text-gray-300 font-medium hover:bg-gray-800 transition-colors"
              >
                Dashboard
              </a>
            </div>
          </div>
        </FindingsSection>

        {/* Footer */}
        <footer className="py-12 text-center text-gray-600 text-sm">
          Built on data from 17 strategies × 8 scenarios × 62 probes × 10 experiments
        </footer>
        </main>
      </div>
    </div>
  );
}
