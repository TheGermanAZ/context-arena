import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Glob } from 'bun';
import path from 'node:path';

type JsonRecord = Record<string, unknown>;

interface BenchmarkStep {
  step: number;
  inputTokens: number;
  outputTokens: number;
  memoryOverheadTokens: number;
  latencyMs: number;
}

interface BenchmarkEntry {
  strategyName: string;
  scenarioName: string;
  correct: boolean;
  totalInputTokens: number;
  totalMemoryOverheadTokens: number;
  totalLatencyMs: number;
  estimatedCostUsd: number;
  steps: BenchmarkStep[];
}

interface RlmLossTypeEntry {
  type: string;
  totalProbes: number;
  retentionByCycle: number[];
  overallRetention: number;
  losses: Array<{ scenario: string; fact: string; lostAtCycle: number }>;
}

interface RlmDepthEntry {
  scenarioName: string;
  depth: number;
  retainedCount: number;
  totalProbes: number;
}

interface NanoBaselineEntry {
  name: string;
  retained: number;
  total: number;
}

interface NanoBaselineData {
  overall: { pct: number };
  results: NanoBaselineEntry[];
}

interface RllmScenarioResult {
  scenarioName: string;
  probeResults: Array<{ retainedByCycle: boolean[] }>;
}

interface RllmExtractionData {
  results: RllmScenarioResult[];
}

interface CodeAnalysisBlock {
  categories: string[];
  hasSubLLMCalls?: boolean;
  hasRegex?: boolean;
  hasChunking?: boolean;
  hasLooping?: boolean;
}

interface CodeAnalysisData {
  classified: CodeAnalysisBlock[];
}

const app = new Hono();
app.use('*', cors());

const resultsDir = path.resolve(import.meta.dir, '../results');

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function toBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

async function readJsonFiles(prefix: string): Promise<Array<{ path: string; data: unknown }>> {
  const glob = new Glob(`${prefix}-*.json`);
  const files: Array<{ path: string; data: unknown }> = [];

  for await (const name of glob.scan({ cwd: resultsDir })) {
    if (name.includes('partial')) continue;
    const data = (await Bun.file(path.join(resultsDir, name)).json()) as unknown;
    files.push({ path: name, data });
  }

  return files;
}

async function findBest<T>(prefix: string, scoreFn: (data: T) => number): Promise<T | null> {
  const files = await readJsonFiles(prefix);
  let best: T | null = null;
  let bestScore = -1;

  for (const { data } of files) {
    const candidate = data as T;
    const score = scoreFn(candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

function parseBenchmarkEntries(data: unknown): BenchmarkEntry[] {
  if (!Array.isArray(data)) return [];

  const entries: BenchmarkEntry[] = [];
  for (const row of data) {
    if (!isRecord(row)) continue;

    const stepsRaw = Array.isArray(row.steps) ? row.steps : [];
    const steps: BenchmarkStep[] = stepsRaw
      .filter(isRecord)
      .map((step) => ({
        step: toNumber(step.step),
        inputTokens: toNumber(step.inputTokens),
        outputTokens: toNumber(step.outputTokens),
        memoryOverheadTokens: toNumber(step.memoryOverheadTokens),
        latencyMs: toNumber(step.latencyMs),
      }));

    const strategyName = toString(row.strategyName);
    const scenarioName = toString(row.scenarioName);
    if (!strategyName || !scenarioName) continue;

    entries.push({
      strategyName,
      scenarioName,
      correct: toBoolean(row.correct),
      totalInputTokens: toNumber(row.totalInputTokens),
      totalMemoryOverheadTokens: toNumber(row.totalMemoryOverheadTokens),
      totalLatencyMs: toNumber(row.totalLatencyMs),
      estimatedCostUsd: toNumber(row.estimatedCostUsd),
      steps,
    });
  }

  return entries;
}

function parseRlmLossByType(data: unknown): RlmLossTypeEntry[] {
  if (!isRecord(data) || !Array.isArray(data.byType)) return [];

  return data.byType
    .filter(isRecord)
    .map((entry) => {
      const lossesRaw = Array.isArray(entry.losses) ? entry.losses : [];
      const losses = lossesRaw.filter(isRecord).map((loss) => ({
        scenario: toString(loss.scenario),
        fact: toString(loss.fact),
        lostAtCycle: toNumber(loss.lostAtCycle),
      }));

      const retentionByCycleRaw = Array.isArray(entry.retentionByCycle)
        ? entry.retentionByCycle
        : [];
      const retentionByCycle = retentionByCycleRaw.map((value) => toNumber(value));

      return {
        type: toString(entry.type),
        totalProbes: toNumber(entry.totalProbes),
        retentionByCycle,
        overallRetention: toNumber(entry.overallRetention),
        losses,
      } satisfies RlmLossTypeEntry;
    })
    .filter((entry) => entry.type.length > 0);
}

function parseDepthEntries(data: unknown): RlmDepthEntry[] {
  if (!Array.isArray(data)) return [];

  return data
    .filter(isRecord)
    .map((entry) => ({
      scenarioName: toString(entry.scenarioName),
      depth: toNumber(entry.depth),
      retainedCount: toNumber(entry.retainedCount),
      totalProbes: toNumber(entry.totalProbes),
    }))
    .filter((entry) => entry.scenarioName.length > 0);
}

function parseNanoBaseline(data: unknown): NanoBaselineData | null {
  if (!isRecord(data)) return null;

  const overall = isRecord(data.overall)
    ? { pct: toNumber(data.overall.pct) }
    : { pct: 0 };

  const resultsRaw = Array.isArray(data.results) ? data.results : [];
  const results = resultsRaw
    .filter(isRecord)
    .map((entry) => ({
      name: toString(entry.name),
      retained: toNumber(entry.retained),
      total: toNumber(entry.total),
    }))
    .filter((entry) => entry.name.length > 0);

  return { overall, results };
}

function parseRllmExtraction(data: unknown): RllmExtractionData | null {
  if (!isRecord(data) || !Array.isArray(data.results)) return null;

  const results = data.results
    .filter(isRecord)
    .map((scenario) => {
      const probeResultsRaw = Array.isArray(scenario.probeResults)
        ? scenario.probeResults
        : [];

      const probeResults = probeResultsRaw
        .filter(isRecord)
        .map((probe) => ({
          retainedByCycle: Array.isArray(probe.retainedByCycle)
            ? probe.retainedByCycle.map((v) => toBoolean(v))
            : [],
        }));

      return {
        scenarioName: toString(scenario.scenarioName),
        probeResults,
      } satisfies RllmScenarioResult;
    })
    .filter((scenario) => scenario.scenarioName.length > 0);

  return { results };
}

function parseCodeAnalysis(data: unknown): CodeAnalysisData | null {
  if (!isRecord(data) || !Array.isArray(data.classified)) return null;

  const classified = data.classified
    .filter(isRecord)
    .map((block) => ({
      categories: Array.isArray(block.categories)
        ? block.categories.map((cat) => toString(cat)).filter(Boolean)
        : [],
      hasSubLLMCalls: toBoolean(block.hasSubLLMCalls),
      hasRegex: toBoolean(block.hasRegex),
      hasChunking: toBoolean(block.hasChunking),
      hasLooping: toBoolean(block.hasLooping),
    }));

  return { classified };
}

// View 1: Leaderboard
app.get('/api/leaderboard', async (c) => {
  const raw = await findBest<unknown>('benchmark', (data) =>
    Array.isArray(data) ? data.length : 0,
  );

  const data = parseBenchmarkEntries(raw);
  if (data.length === 0) return c.json({ error: 'No benchmark data' }, 404);

  const byStrategy = new Map<string, BenchmarkEntry[]>();
  for (const entry of data) {
    const list = byStrategy.get(entry.strategyName) ?? [];
    list.push(entry);
    byStrategy.set(entry.strategyName, list);
  }

  const rows = Array.from(byStrategy.entries()).map(([strategy, entries]) => {
    const correct = entries.filter((entry) => entry.correct).length;
    const total = entries.length;
    const accuracy = total > 0 ? correct / total : 0;
    const avgInputTokens = Math.round(
      entries.reduce((sum, entry) => sum + entry.totalInputTokens, 0) / total,
    );
    const avgOverhead = Math.round(
      entries.reduce((sum, entry) => sum + entry.totalMemoryOverheadTokens, 0) / total,
    );
    const avgLatency = Math.round(
      entries.reduce((sum, entry) => sum + entry.totalLatencyMs, 0) / total,
    );
    const totalCost = entries.reduce((sum, entry) => sum + entry.estimatedCostUsd, 0);

    return {
      strategy,
      accuracy,
      accuracyFraction: `${correct}/${total}`,
      avgInputTokens,
      avgOverhead,
      avgLatency,
      totalCost: +totalCost.toFixed(6),
    };
  });

  rows.sort((a, b) => b.accuracy - a.accuracy || a.totalCost - b.totalCost);
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });

  return c.json(rows);
});

// View 2: Retention by Type
app.get('/api/retention-by-type', async (c) => {
  const raw = await findBest<unknown>('rlm-loss', (data) =>
    isRecord(data) && Array.isArray(data.results) ? data.results.length : 0,
  );

  const byType = parseRlmLossByType(raw);
  if (byType.length === 0) return c.json({ error: 'No rlm-loss data' }, 404);

  const rows = byType
    .map((entry) => {
      const retained = Math.round(entry.overallRetention * entry.totalProbes);
      const pct = +(entry.overallRetention * 100).toFixed(1);
      return {
        type: entry.type,
        retained,
        total: entry.totalProbes,
        pct,
      };
    })
    .sort((a, b) => a.pct - b.pct);

  return c.json(rows);
});

// View 3: Depth Comparison
app.get('/api/depth-comparison', async (c) => {
  const files = await readJsonFiles('rlm-depth');
  const allEntries = files.flatMap(({ data }) => parseDepthEntries(data));

  if (allEntries.length === 0) return c.json({ error: 'No depth data' }, 404);

  const scenarioMap = new Map<string, { depth1?: RlmDepthEntry; depth2?: RlmDepthEntry }>();
  for (const entry of allEntries) {
    const existing = scenarioMap.get(entry.scenarioName) ?? {};
    if (entry.depth === 1) {
      if (!existing.depth1 || entry.retainedCount > existing.depth1.retainedCount) {
        existing.depth1 = entry;
      }
    }
    if (entry.depth === 2) {
      if (!existing.depth2 || entry.retainedCount > existing.depth2.retainedCount) {
        existing.depth2 = entry;
      }
    }
    scenarioMap.set(entry.scenarioName, existing);
  }

  const scenarios = Array.from(scenarioMap.entries()).map(([name, { depth1, depth2 }]) => ({
    name,
    depth1: { retained: depth1?.retainedCount ?? 0, total: depth1?.totalProbes ?? 0 },
    depth2: { retained: depth2?.retainedCount ?? 0, total: depth2?.totalProbes ?? 0 },
    delta: (depth2?.retainedCount ?? 0) - (depth1?.retainedCount ?? 0),
  }));

  const d1r = scenarios.reduce((sum, scenario) => sum + scenario.depth1.retained, 0);
  const d1t = scenarios.reduce((sum, scenario) => sum + scenario.depth1.total, 0);
  const d2r = scenarios.reduce((sum, scenario) => sum + scenario.depth2.retained, 0);
  const d2t = scenarios.reduce((sum, scenario) => sum + scenario.depth2.total, 0);

  return c.json({
    scenarios,
    summary: {
      depth1Total: {
        retained: d1r,
        total: d1t,
        pct: d1t > 0 ? +((d1r / d1t) * 100).toFixed(1) : 0,
      },
      depth2Total: {
        retained: d2r,
        total: d2t,
        pct: d2t > 0 ? +((d2r / d2t) * 100).toFixed(1) : 0,
      },
    },
  });
});

// View 4: Retention Curve
app.get('/api/retention-curve', async (c) => {
  const raw = await findBest<unknown>('rlm-loss', (data) =>
    isRecord(data) && Array.isArray(data.results) ? data.results.length : 0,
  );

  const byType = parseRlmLossByType(raw);
  if (byType.length === 0) return c.json({ error: 'No rlm-loss data' }, 404);

  const types = byType.map((entry) => entry.type).sort();
  const maxCycles = Math.max(...byType.map((entry) => entry.retentionByCycle.length));

  const cycles: Array<Record<string, number>> = [];
  for (let i = 0; i < maxCycles; i++) {
    const row: Record<string, number> = { cycle: i + 1 };
    for (const entry of byType) {
      row[entry.type] =
        i < entry.retentionByCycle.length
          ? +(entry.retentionByCycle[i] * 100).toFixed(1)
          : 0;
    }
    cycles.push(row);
  }

  return c.json({ types, cycles });
});

// View 5: RLLM vs Hand-rolled
app.get('/api/rllm-comparison', async (c) => {
  const handRolledRaw = await findBest<unknown>('rlm-nano-baseline', (data) => {
    const parsed = parseNanoBaseline(data);
    return parsed?.overall.pct ?? 0;
  });
  const handRolled = parseNanoBaseline(handRolledRaw);

  const rllmFiles = await readJsonFiles('rllm-extraction');
  const rllm = rllmFiles.length > 0 ? parseRllmExtraction(rllmFiles[0]?.data) : null;

  if (!handRolled || !rllm) return c.json({ error: 'Missing comparison data' }, 404);

  const scenarios = handRolled.results.map((hr) => {
    const rllmScenario = rllm.results.find((entry) => entry.scenarioName === hr.name);
    const rllmRetained = rllmScenario
      ? rllmScenario.probeResults.filter((probe) => {
          const cycles = probe.retainedByCycle;
          return cycles.length > 0 ? cycles[cycles.length - 1] : false;
        }).length
      : 0;
    const rllmTotal = rllmScenario?.probeResults.length ?? hr.total;

    return {
      name: hr.name,
      handRolled: {
        retained: hr.retained,
        total: hr.total,
        pct: hr.total > 0 ? +((hr.retained / hr.total) * 100).toFixed(1) : 0,
      },
      rllm: {
        retained: rllmRetained,
        total: rllmTotal,
        pct: rllmTotal > 0 ? +((rllmRetained / rllmTotal) * 100).toFixed(1) : 0,
      },
    };
  });

  const hrTotal = scenarios.reduce((sum, scenario) => sum + scenario.handRolled.retained, 0);
  const hrAll = scenarios.reduce((sum, scenario) => sum + scenario.handRolled.total, 0);
  const rTotal = scenarios.reduce((sum, scenario) => sum + scenario.rllm.retained, 0);
  const rAll = scenarios.reduce((sum, scenario) => sum + scenario.rllm.total, 0);

  return c.json({
    scenarios,
    summary: {
      handRolledPct: hrAll > 0 ? +((hrTotal / hrAll) * 100).toFixed(1) : 0,
      rllmPct: rAll > 0 ? +((rTotal / rAll) * 100).toFixed(1) : 0,
    },
  });
});

// View 6: Token/Cost per Step
app.get('/api/token-cost', async (c) => {
  const raw = await findBest<unknown>('benchmark', (data) =>
    Array.isArray(data) ? data.length : 0,
  );

  const data = parseBenchmarkEntries(raw);
  if (data.length === 0) return c.json({ error: 'No benchmark data' }, 404);

  const scenarioParam = c.req.query('scenario');
  const availableScenarios = [...new Set(data.map((entry) => entry.scenarioName))].sort();
  const defaultScenario = availableScenarios[0] ?? '';
  const scenario =
    scenarioParam && availableScenarios.includes(scenarioParam)
      ? scenarioParam
      : defaultScenario;

  const filtered = data.filter((entry) => entry.scenarioName === scenario);
  const strategies = filtered.map((entry) => ({
    name: entry.strategyName,
    steps: entry.steps.map((step) => ({
      step: step.step,
      inputTokens: step.inputTokens,
      outputTokens: step.outputTokens,
      overhead: step.memoryOverheadTokens,
      latency: Math.round(step.latencyMs),
    })),
  }));

  return c.json({ scenario, strategies, availableScenarios });
});

// View 7: Code Analysis
app.get('/api/code-analysis', async (c) => {
  const files = await readJsonFiles('code-analysis');
  if (files.length === 0) return c.json({ error: 'No code analysis data' }, 404);

  const first = files[0];
  const data = first ? parseCodeAnalysis(first.data) : null;
  if (!data) return c.json({ error: 'No code analysis data' }, 404);

  const classified = data.classified;
  const totalBlocks = classified.length;

  const catCounts = new Map<string, number>();
  for (const block of classified) {
    for (const category of block.categories) {
      catCounts.set(category, (catCounts.get(category) ?? 0) + 1);
    }
  }

  const categories = Array.from(catCounts.entries())
    .map(([name, count]) => ({
      name,
      count,
      pct: totalBlocks > 0 ? +((count / totalBlocks) * 100).toFixed(1) : 0,
    }))
    .sort((a, b) => b.count - a.count);

  const featureKeys = ['hasSubLLMCalls', 'hasRegex', 'hasChunking', 'hasLooping'] as const;
  const features = featureKeys.map((key) => {
    const count = classified.filter((block) => block[key]).length;
    return {
      name: key,
      count,
      pct: totalBlocks > 0 ? +((count / totalBlocks) * 100).toFixed(1) : 0,
    };
  });

  return c.json({ totalBlocks, categories, features });
});

// View 8: Scenario Heatmap (strategy × scenario pass/fail grid)
app.get('/api/scenario-heatmap', async (c) => {
  const raw = await findBest<unknown>('benchmark', (data) =>
    Array.isArray(data) ? data.length : 0,
  );

  const data = parseBenchmarkEntries(raw);
  if (data.length === 0) return c.json({ error: 'No benchmark data' }, 404);

  const cells = data.map((entry) => ({
    strategy: entry.strategyName,
    scenario: entry.scenarioName,
    correct: entry.correct,
    cost: entry.estimatedCostUsd,
    inputTokens: entry.totalInputTokens,
    latencyMs: Math.round(entry.totalLatencyMs),
  }));

  const byStrategy = new Map<string, BenchmarkEntry[]>();
  for (const entry of data) {
    const list = byStrategy.get(entry.strategyName) ?? [];
    list.push(entry);
    byStrategy.set(entry.strategyName, list);
  }

  const strategySummaries = Array.from(byStrategy.entries())
    .map(([strategy, entries]) => {
      const correct = entries.filter((entry) => entry.correct).length;
      return {
        strategy,
        correct,
        total: entries.length,
        accuracy: entries.length > 0 ? correct / entries.length : 0,
      };
    })
    .sort((a, b) => b.accuracy - a.accuracy);

  const byScenario = new Map<string, BenchmarkEntry[]>();
  for (const entry of data) {
    const list = byScenario.get(entry.scenarioName) ?? [];
    list.push(entry);
    byScenario.set(entry.scenarioName, list);
  }

  const scenarioSummaries = Array.from(byScenario.entries())
    .map(([scenario, entries]) => {
      const correct = entries.filter((entry) => entry.correct).length;
      return {
        scenario,
        correct,
        total: entries.length,
        accuracy: entries.length > 0 ? correct / entries.length : 0,
      };
    })
    .sort((a, b) => b.accuracy - a.accuracy);

  return c.json({
    strategies: strategySummaries.map((summary) => summary.strategy),
    scenarios: scenarioSummaries.map((summary) => summary.scenario),
    cells,
    strategySummaries,
    scenarioSummaries,
  });
});

// View 9: Cost vs Accuracy with Pareto frontier
app.get('/api/cost-accuracy', async (c) => {
  const raw = await findBest<unknown>('benchmark', (data) =>
    Array.isArray(data) ? data.length : 0,
  );

  const data = parseBenchmarkEntries(raw);
  if (data.length === 0) return c.json({ error: 'No benchmark data' }, 404);

  const byStrategy = new Map<string, BenchmarkEntry[]>();
  for (const entry of data) {
    const list = byStrategy.get(entry.strategyName) ?? [];
    list.push(entry);
    byStrategy.set(entry.strategyName, list);
  }

  const points = Array.from(byStrategy.entries()).map(([strategy, entries]) => {
    const correct = entries.filter((entry) => entry.correct).length;
    const total = entries.length;
    const totalCost = entries.reduce((sum, entry) => sum + entry.estimatedCostUsd, 0);
    const avgInputTokens = Math.round(
      entries.reduce((sum, entry) => sum + entry.totalInputTokens, 0) / total,
    );
    const avgLatency = Math.round(
      entries.reduce((sum, entry) => sum + entry.totalLatencyMs, 0) / total,
    );

    return {
      strategy,
      accuracy: +((correct / total) * 100).toFixed(1),
      totalCost: +totalCost.toFixed(6),
      avgInputTokens,
      avgLatency,
    };
  });

  const sorted = [...points].sort((a, b) => a.totalCost - b.totalCost);
  const paretoFrontier: typeof points = [];
  let maxAcc = -1;

  for (const point of sorted) {
    if (point.accuracy > maxAcc) {
      paretoFrontier.push({
        strategy: point.strategy,
        accuracy: point.accuracy,
        totalCost: point.totalCost,
        avgInputTokens: point.avgInputTokens,
        avgLatency: point.avgLatency,
      });
      maxAcc = point.accuracy;
    }
  }

  return c.json({ points, paretoFrontier });
});

// View 10: Scenario Difficulty (which scenarios are hardest)
app.get('/api/scenario-difficulty', async (c) => {
  const raw = await findBest<unknown>('benchmark', (data) =>
    Array.isArray(data) ? data.length : 0,
  );

  const data = parseBenchmarkEntries(raw);
  if (data.length === 0) return c.json({ error: 'No benchmark data' }, 404);

  const byScenario = new Map<string, BenchmarkEntry[]>();
  for (const entry of data) {
    const list = byScenario.get(entry.scenarioName) ?? [];
    list.push(entry);
    byScenario.set(entry.scenarioName, list);
  }

  const scenarios = Array.from(byScenario.entries())
    .map(([name, entries]) => {
      const correct = entries.filter((entry) => entry.correct).length;
      const total = entries.length;
      const hardestStrategies = entries
        .filter((entry) => !entry.correct)
        .map((entry) => entry.strategyName);

      return {
        name,
        correct,
        total,
        accuracy: +((correct / total) * 100).toFixed(1),
        hardestStrategies,
      };
    })
    .sort((a, b) => a.accuracy - b.accuracy);

  return c.json({ scenarios });
});

// View 11: Parallel Benchmarks (CTX-26 expansion)
interface ParallelBenchmarkRow {
  track: string;
  type: 'industry' | 'internal';
  strategy: string;
  score: string;
  passed: boolean;
  avgLatencyMs: number;
  costUsd: number;
}

function formatFraction(num: number, den: number): string {
  const pct = den > 0 ? ((num / den) * 100).toFixed(1) : '0.0';
  return `${num}/${den} (${pct}%)`;
}

function formatPassFail(passed: boolean, matched: number, total: number): string {
  return `${passed ? 'PASS' : 'FAIL'} (${matched}/${total})`;
}

app.get('/api/parallel-benchmarks', async (c) => {
  const rows: ParallelBenchmarkRow[] = [];

  // ── LongMemEval Slice ──
  const longmemRaw = await findBest<JsonRecord>('longmemeval-slice', (data) =>
    isRecord(data) && Array.isArray(data.strategies) ? data.strategies.length : 0,
  );
  if (longmemRaw && Array.isArray(longmemRaw.strategies)) {
    const sampleSize = toNumber(longmemRaw.sampleSize, 1);
    for (const s of longmemRaw.strategies.filter(isRecord)) {
      const correct = toNumber(s.correct);
      rows.push({
        track: 'LongMemEval Slice',
        type: 'industry',
        strategy: toString(s.strategyName),
        score: formatFraction(correct, sampleSize),
        passed: correct === sampleSize,
        avgLatencyMs: Math.round(toNumber(s.avgLatencyMs)),
        costUsd: +toNumber(s.totalEstimatedCostUsd).toFixed(4),
      });
    }
  }

  // ── MemoryArena Slice ──
  const arenaRaw = await findBest<JsonRecord>('memoryarena-slice', (data) =>
    isRecord(data) && Array.isArray(data.strategies) ? data.strategies.length : 0,
  );
  if (arenaRaw && Array.isArray(arenaRaw.strategies)) {
    for (const s of arenaRaw.strategies.filter(isRecord)) {
      const passed = toNumber(s.passedChecks);
      const total = toNumber(s.totalChecks);
      rows.push({
        track: 'MemoryArena Slice',
        type: 'industry',
        strategy: toString(s.strategyName),
        score: formatFraction(passed, total),
        passed: passed === total,
        avgLatencyMs: Math.round(toNumber(s.avgLatencyMs)),
        costUsd: +toNumber(s.totalEstimatedCostUsd).toFixed(4),
      });
    }
  }

  // ── MemoryAgentBench Subset ──
  const agentbenchRaw = await findBest<JsonRecord>('memoryagentbench-slice', (data) =>
    isRecord(data) && Array.isArray(data.strategies) ? data.strategies.length : 0,
  );
  if (agentbenchRaw && Array.isArray(agentbenchRaw.strategies)) {
    for (const s of agentbenchRaw.strategies.filter(isRecord)) {
      const correct = toNumber(s.correct);
      const total = toNumber(s.total);
      rows.push({
        track: 'MemoryAgentBench Subset',
        type: 'industry',
        strategy: toString(s.strategyName),
        score: formatFraction(correct, total),
        passed: correct === total,
        avgLatencyMs: Math.round(toNumber(s.avgLatencyMs)),
        costUsd: +toNumber(s.totalEstimatedCostUsd).toFixed(4),
      });
    }
  }

  // ── Memory-Action Micro ──
  const microBest = await findBest<JsonRecord>('memory-action-micro', (data) =>
    isRecord(data) && Array.isArray(data.strategies) ? data.strategies.length : 0,
  );
  if (microBest && Array.isArray(microBest.strategies)) {
    for (const s of microBest.strategies.filter(isRecord)) {
      const matched = toNumber(s.matchedChecks);
      const total = toNumber(s.totalChecks);
      rows.push({
        track: 'Memory-Action Micro',
        type: 'internal',
        strategy: toString(s.strategyName),
        score: formatPassFail(toBoolean(s.passed), matched, total),
        passed: toBoolean(s.passed),
        avgLatencyMs: Math.round(toNumber(s.latencyMs)),
        costUsd: +toNumber(s.estimatedCostUsd).toFixed(4),
      });
    }
  }

  // ── Cross-Session ──
  const crossRaw = await findBest<JsonRecord>('internal-cross-session', (data) =>
    isRecord(data) && Array.isArray(data.strategies) ? data.strategies.length : 0,
  );
  if (crossRaw && Array.isArray(crossRaw.strategies)) {
    for (const s of crossRaw.strategies.filter(isRecord)) {
      const matched = toNumber(s.matchedChecks);
      const total = toNumber(s.totalChecks);
      rows.push({
        track: 'Cross-Session',
        type: 'internal',
        strategy: toString(s.strategyName),
        score: formatPassFail(toBoolean(s.correct), matched, total),
        passed: toBoolean(s.correct),
        avgLatencyMs: Math.round(toNumber(s.totalLatencyMs)),
        costUsd: +toNumber(s.estimatedCostUsd).toFixed(4),
      });
    }
  }

  // ── Multi-Agent Handoff ──
  const multiRaw = await findBest<JsonRecord>('internal-multi-agent', (data) =>
    isRecord(data) && Array.isArray(data.strategies) ? data.strategies.length : 0,
  );
  if (multiRaw && Array.isArray(multiRaw.strategies)) {
    for (const s of multiRaw.strategies.filter(isRecord)) {
      const matched = toNumber(s.matchedChecks);
      const total = toNumber(s.totalChecks);
      rows.push({
        track: 'Multi-Agent Handoff',
        type: 'internal',
        strategy: toString(s.strategyName),
        score: formatPassFail(toBoolean(s.correct), matched, total),
        passed: toBoolean(s.correct),
        avgLatencyMs: Math.round(toNumber(s.totalLatencyMs)),
        costUsd: +toNumber(s.estimatedCostUsd).toFixed(4),
      });
    }
  }

  // ── Scale Ladder ──
  const scaleRaw = await findBest<JsonRecord>('internal-scale-ladder', (data) =>
    isRecord(data) && Array.isArray(data.strategies) ? data.strategies.length : 0,
  );
  if (scaleRaw && Array.isArray(scaleRaw.strategies)) {
    for (const s of scaleRaw.strategies.filter(isRecord)) {
      const passed = toNumber(s.passed);
      const total = toNumber(s.total);
      rows.push({
        track: 'Scale Ladder',
        type: 'internal',
        strategy: toString(s.strategyName),
        score: formatFraction(passed, total),
        passed: passed === total,
        avgLatencyMs: Math.round(toNumber(s.avgLatencyMs)),
        costUsd: +toNumber(s.totalEstimatedCostUsd).toFixed(4),
      });
    }
  }

  // ── Backbone Matrix ──
  const backboneRaw = await findBest<JsonRecord>('internal-backbone-matrix', (data) =>
    isRecord(data) && Array.isArray(data.results) ? data.results.length : 0,
  );
  if (backboneRaw && Array.isArray(backboneRaw.results)) {
    for (const r of backboneRaw.results.filter(isRecord)) {
      if (toString(r.model) !== 'gpt-5-nano') continue;
      const correct = toBoolean(r.correct);
      rows.push({
        track: 'Backbone Matrix',
        type: 'internal',
        strategy: toString(r.model),
        score: correct ? 'PASS' : 'FAIL',
        passed: correct,
        avgLatencyMs: Math.round(toNumber(r.latencyMs)),
        costUsd: 0,
      });
    }
  }

  // Sort: industry first, then internal, then by track name
  rows.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'industry' ? -1 : 1;
    if (a.track !== b.track) return a.track.localeCompare(b.track);
    return a.strategy.localeCompare(b.strategy);
  });

  const industryCount = rows.filter((r) => r.type === 'industry').length;
  const internalCount = rows.filter((r) => r.type === 'internal').length;
  const tracks = new Set(rows.map((r) => r.track));

  return c.json({
    rows,
    summary: { industryCount, internalCount, totalTracks: tracks.size },
  });
});

const port = 3001;
Bun.serve({ fetch: app.fetch, port });
console.log(`Dashboard API server running on http://localhost:${port}`);
