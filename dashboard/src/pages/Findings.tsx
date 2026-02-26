import { useState, useEffect, useRef, type ReactNode } from 'react';
import NavBar from '../components/NavBar';
import Leaderboard from '../components/Leaderboard';
import RetentionByType from '../components/RetentionByType';
import RetentionCurve from '../components/RetentionCurve';
import DepthComparison from '../components/DepthComparison';
import RllmComparison from '../components/RllmComparison';
import CodeStrategies from '../components/CodeStrategies';
import { KPICard, Skeleton } from '../components/charts';
import { useLeaderboard } from '../lib/hooks';

/* ─── Scroll spy ─────────────────────────────── */

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

function ProposalCard({
  number,
  title,
  abstract,
  predicted,
}: {
  number: number;
  title: string;
  abstract: string;
  predicted: string;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-6">
      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-emerald-500 font-bold text-lg">#{number}</span>
        <h4 className="text-gray-100 font-semibold">{title}</h4>
      </div>
      <p className="text-gray-400 text-sm leading-relaxed mb-3">{abstract}</p>
      <div className="text-xs text-emerald-400/80 font-medium">Predicted: {predicted}</div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────── */

export default function Findings() {
  const activeId = useScrollSpy(SECTION_IDS);
  const leaderboard = useLeaderboard();
  const top = leaderboard.data?.[0];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* ── Sticky nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-gray-950/80 backdrop-blur-sm border-b border-gray-800/50">
        <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {SECTIONS.map(({ id, label }) => (
              <a
                key={id}
                href={`#${id}`}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                  activeId === id
                    ? 'bg-emerald-600 text-white'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
              >
                {label}
              </a>
            ))}
          </div>
          <NavBar />
        </div>
      </nav>

      <div className="max-w-5xl mx-auto px-6 pt-24">
        {/* ── Hero ── */}
        <header className="pt-8 pb-12">
          <h1 className="text-5xl font-extrabold tracking-tight mb-4">
            What LLMs Forget
          </h1>
          <p className="text-xl text-gray-400 max-w-3xl leading-relaxed">
            Benchmarking long-context memory strategies: why deeper delegation beats agentic code,
            what types of information disappear first, and where the field goes next.
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
                <KPICard label="Strategies Tested" value={8} format={(n) => String(n)} subtitle="memory approaches" accentColor="#10b981" />
                <KPICard label="Scenarios" value={8} format={(n) => String(n)} subtitle="failure modes" accentColor="#8b5cf6" />
                <KPICard label="Probes" value={62} format={(n) => String(n)} subtitle="fact-level tracking" accentColor="#f59e0b" />
                <KPICard label="Best Accuracy" value={top ? top.accuracy * 100 : 100} format={(n) => `${n.toFixed(0)}%`} subtitle={top?.strategy ?? 'Full Context'} accentColor="#10b981" />
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
            We tested 8 strategies. Each uses a different approach to managing memory when the
            conversation exceeds a threshold (typically 8 messages before compression triggers).
          </Prose>
          <Prose>
            <strong>Hybrid</strong> (100%) works because it runs two tracks in parallel: one extracts facts
            as natural-language sentences (preserving relationships), while the other produces a narrative
            summary. Neither track alone scores 100% — the combination does.{' '}
            <strong>RLM</strong> (88%) delegates old messages to a sub-LLM with five targeted questions
            (ENTITIES, DECISIONS, CORRECTIONS, NUMBERS, CURRENT STATE).{' '}
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
            Section 8 — The Field
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

          <h3 className="text-xl font-semibold text-gray-200 mb-4">External Calibration</h3>
          <Prose>
            We ran bounded proxy adapters against three industry benchmarks to calibrate our
            internal findings against the broader field:
          </Prose>
          <DataTable
            headers={['Track', 'Strategy', 'Score', 'Latency', 'Cost']}
            rows={[
              ['LongMemEval slice', 'Full Context', '33.3%', '12.0s', '$0.25'],
              ['LongMemEval slice', 'RLM(8)', '66.7%', '76.8s', '$0.28'],
              ['MemoryArena slice', 'Full Context', '75.0%', '25.8s', '$0.05'],
              ['MemoryArena slice', 'RLM(8)', '75.0%', '24.0s', '$0.05'],
              ['MemoryAgentBench', 'Full Context', '25.0%', '13.0s', '$0.07'],
              ['MemoryAgentBench', 'RLM(8)', '0.0%', '12.8s', '$0.06'],
            ]}
          />
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
            Five research proposals emerged from this work, each targeting a specific weakness
            identified by the benchmark:
          </Prose>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <ProposalCard
              number={1}
              title="Depth-Adaptive RLM"
              abstract="Dynamically select compression depth per segment based on content assessment, unifying self-correction benefits with noise-resilience."
              predicted="75-80% retention (vs. RLM's 59.7%)"
            />
            <ProposalCard
              number={2}
              title="Correction Format Engineering"
              abstract="Systematically test how correction presentation format affects entrenchment bypass, hypothesizing re-derivation > assertion formats."
              predicted="75% → 85%+ on correction scenarios"
            />
            <ProposalCard
              number={3}
              title="Structural Shadow Graphs"
              abstract="Parallel property graph alongside RLM text output to preserve spatial facts, identifiers, and relationships that text flattening destroys."
              predicted="0% → 70-90% on spatial/ID/decision facts"
            />
            <ProposalCard
              number={4}
              title="Foresight-Guided Extraction"
              abstract="Augment RLM extraction with anticipatory salience signals predicting what information will be queried, biasing toward high-impact facts."
              predicted="59.7% → 70-75% overall"
            />
            <ProposalCard
              number={5}
              title="Stability-Plasticity Decomposed Memory"
              abstract="Dual-channel context (Stable for identifiers/spatial, Plastic for corrections) with independent compression rules matched to retention requirements."
              predicted="79% → 88%+ overall retention"
            />
          </div>

          <h3 className="text-xl font-semibold text-gray-200 mb-4">Open Questions</h3>
          <ul className="space-y-2 mb-10 text-gray-400">
            {[
              'Does the self-correction effect hold at depth 3+?',
              'Can the sub-LLM prompt be tuned per-type to eliminate the 0% retention categories?',
              'Would a larger model close the agentic extraction gap, or does code quality not matter when the fundamental approach is flawed?',
              'Is there a hybrid approach — prompt-guided code generation — that gets the best of both worlds?',
              'Can a dual-track architecture (natural-language blob + side-channel store) outperform both base RLM and Hybrid?',
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
          Built on data from 8 strategies × 8 scenarios × 62 probes
        </footer>
      </div>
    </div>
  );
}
