import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Glob } from 'bun';
import path from 'node:path';

const app = new Hono();
app.use('*', cors());

const resultsDir = path.resolve(import.meta.dir, '../results');

// --- Helpers ---

async function readJsonFiles(prefix: string): Promise<Array<{ path: string; data: any }>> {
  const glob = new Glob(`${prefix}-*.json`);
  const files: Array<{ path: string; data: any }> = [];

  for await (const name of glob.scan({ cwd: resultsDir })) {
    if (name.includes('partial')) continue;
    const data = await Bun.file(path.join(resultsDir, name)).json();
    files.push({ path: name, data });
  }
  return files;
}

async function findBest<T>(prefix: string, scoreFn: (data: any) => number): Promise<T | null> {
  const files = await readJsonFiles(prefix);
  let best: any = null;
  let bestScore = -1;

  for (const { data } of files) {
    const score = scoreFn(data);
    if (score > bestScore) {
      bestScore = score;
      best = data;
    }
  }
  return best;
}

const INPUT_COST_PER_1M = 0.80;
const OUTPUT_COST_PER_1M = 4.00;

function calculateCost(inputTokens: number, outputTokens: number): number {
  return (inputTokens / 1_000_000) * INPUT_COST_PER_1M + (outputTokens / 1_000_000) * OUTPUT_COST_PER_1M;
}

// --- Routes ---

// View 1: Leaderboard
app.get('/api/leaderboard', async (c) => {
  const data = await findBest<any[]>('benchmark', (d) => (Array.isArray(d) ? d.length : 0));
  if (!data) return c.json({ error: 'No benchmark data' }, 404);

  const byStrategy = new Map<string, any[]>();
  for (const entry of data) {
    const list = byStrategy.get(entry.strategyName) ?? [];
    list.push(entry);
    byStrategy.set(entry.strategyName, list);
  }

  const rows = Array.from(byStrategy.entries()).map(([strategy, entries]) => {
    const correct = entries.filter((e) => e.correct).length;
    const total = entries.length;
    const accuracy = correct / total;
    const avgInputTokens = Math.round(entries.reduce((s, e) => s + e.totalInputTokens, 0) / total);
    const avgOverhead = Math.round(entries.reduce((s, e) => s + e.totalMemoryOverheadTokens, 0) / total);
    const avgLatency = Math.round(entries.reduce((s, e) => s + e.totalLatencyMs, 0) / total);
    const totalCost = entries.reduce((s, e) => s + e.estimatedCostUsd, 0);

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
  rows.forEach((r, i) => ((r as any).rank = i + 1));

  return c.json(rows);
});

// View 2: Retention by Type
app.get('/api/retention-by-type', async (c) => {
  const data = await findBest<any>('rlm-loss', (d) => (d?.results?.length ?? 0));
  if (!data) return c.json({ error: 'No rlm-loss data' }, 404);

  // byType is an array: [{ type, totalProbes, retentionByCycle, overallRetention, losses }]
  const byType = data.byType as Array<{
    type: string;
    totalProbes: number;
    retentionByCycle: number[];
    overallRetention: number;
    losses: Array<{ scenario: string; fact: string; lostAtCycle: number }>;
  }>;

  // Use overallRetention (probes retained through all cycles without ever being lost)
  const rows = byType.map((t) => {
    const retained = Math.round(t.overallRetention * t.totalProbes);
    const pct = +(t.overallRetention * 100).toFixed(1);
    return { type: t.type, retained, total: t.totalProbes, pct };
  }).sort((a, b) => a.pct - b.pct);

  return c.json(rows);
});

// View 3: Depth Comparison
app.get('/api/depth-comparison', async (c) => {
  const files = await readJsonFiles('rlm-depth');
  const allEntries: any[] = [];

  for (const { data } of files) {
    if (Array.isArray(data)) allEntries.push(...data);
  }

  if (allEntries.length === 0) return c.json({ error: 'No depth data' }, 404);

  // Keep the best (highest retention) entry per scenario+depth combo
  const scenarioMap = new Map<string, { depth1?: any; depth2?: any }>();
  for (const entry of allEntries) {
    const key = entry.scenarioName;
    const existing = scenarioMap.get(key) ?? {};
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
    scenarioMap.set(key, existing);
  }

  const scenarios = Array.from(scenarioMap.entries()).map(([name, { depth1, depth2 }]) => ({
    name,
    depth1: { retained: depth1?.retainedCount ?? 0, total: depth1?.totalProbes ?? 0 },
    depth2: { retained: depth2?.retainedCount ?? 0, total: depth2?.totalProbes ?? 0 },
    delta: (depth2?.retainedCount ?? 0) - (depth1?.retainedCount ?? 0),
  }));

  const d1r = scenarios.reduce((s, sc) => s + sc.depth1.retained, 0);
  const d1t = scenarios.reduce((s, sc) => s + sc.depth1.total, 0);
  const d2r = scenarios.reduce((s, sc) => s + sc.depth2.retained, 0);
  const d2t = scenarios.reduce((s, sc) => s + sc.depth2.total, 0);

  return c.json({
    scenarios,
    summary: {
      depth1Total: { retained: d1r, total: d1t, pct: d1t > 0 ? +((d1r / d1t) * 100).toFixed(1) : 0 },
      depth2Total: { retained: d2r, total: d2t, pct: d2t > 0 ? +((d2r / d2t) * 100).toFixed(1) : 0 },
    },
  });
});

// View 4: Retention Curve
app.get('/api/retention-curve', async (c) => {
  const data = await findBest<any>('rlm-loss', (d) => (d?.results?.length ?? 0));
  if (!data) return c.json({ error: 'No rlm-loss data' }, 404);

  // Use pre-computed byType.retentionByCycle to avoid survivorship bias
  const byType = data.byType as Array<{
    type: string;
    totalProbes: number;
    retentionByCycle: number[];
  }>;

  const types = byType.map((t) => t.type).sort();
  const maxCycles = Math.max(...byType.map((t) => t.retentionByCycle.length));

  const cycles: Array<Record<string, number>> = [];
  for (let i = 0; i < maxCycles; i++) {
    const row: Record<string, number> = { cycle: i + 1 };
    for (const t of byType) {
      row[t.type] = i < t.retentionByCycle.length ? +((t.retentionByCycle[i]) * 100).toFixed(1) : 0;
    }
    cycles.push(row);
  }

  return c.json({ types, cycles });
});

// View 5: RLLM vs Hand-rolled
app.get('/api/rllm-comparison', async (c) => {
  // Hand-rolled: best nano-baseline (by pct)
  const handRolled = await findBest<any>('rlm-nano-baseline', (d) => (d?.overall?.pct ?? 0));
  // RLLM code-gen: rllm-extraction
  const rllmFiles = await readJsonFiles('rllm-extraction');
  const rllm = rllmFiles.length > 0 ? rllmFiles[0].data : null;

  if (!handRolled || !rllm) return c.json({ error: 'Missing comparison data' }, 404);

  // Build scenario map from hand-rolled
  const scenarios: any[] = [];
  for (const hr of handRolled.results) {
    const scenarioName = hr.name;
    // Find matching RLLM scenario
    const rllmScenario = rllm.results?.find((r: any) => r.scenarioName === scenarioName);
    const rllmRetained = rllmScenario
      ? rllmScenario.probeResults.filter((p: any) => {
          // Check retention at the last cycle (final state)
          const cycles = p.retainedByCycle;
          return cycles?.length > 0 ? cycles[cycles.length - 1] : false;
        }).length
      : 0;
    const rllmTotal = rllmScenario?.probeResults.length ?? hr.total;

    scenarios.push({
      name: scenarioName,
      handRolled: { retained: hr.retained, total: hr.total, pct: hr.total > 0 ? +((hr.retained / hr.total) * 100).toFixed(1) : 0 },
      rllm: { retained: rllmRetained, total: rllmTotal, pct: rllmTotal > 0 ? +((rllmRetained / rllmTotal) * 100).toFixed(1) : 0 },
    });
  }

  const hrTotal = scenarios.reduce((s, sc) => s + sc.handRolled.retained, 0);
  const hrAll = scenarios.reduce((s, sc) => s + sc.handRolled.total, 0);
  const rTotal = scenarios.reduce((s, sc) => s + sc.rllm.retained, 0);
  const rAll = scenarios.reduce((s, sc) => s + sc.rllm.total, 0);

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
  const data = await findBest<any[]>('benchmark', (d) => (Array.isArray(d) ? d.length : 0));
  if (!data) return c.json({ error: 'No benchmark data' }, 404);

  const scenarioParam = c.req.query('scenario');
  const availableScenarios = [...new Set(data.map((e: any) => e.scenarioName))].sort();
  const scenario = scenarioParam && availableScenarios.includes(scenarioParam) ? scenarioParam : availableScenarios[0];

  const filtered = data.filter((e: any) => e.scenarioName === scenario);
  const strategies = filtered.map((e: any) => ({
    name: e.strategyName,
    steps: e.steps.map((s: any) => ({
      step: s.step,
      inputTokens: s.inputTokens,
      outputTokens: s.outputTokens,
      overhead: s.memoryOverheadTokens,
      latency: Math.round(s.latencyMs),
    })),
  }));

  return c.json({ scenario, strategies, availableScenarios });
});

// View 7: Code Analysis
app.get('/api/code-analysis', async (c) => {
  const files = await readJsonFiles('code-analysis');
  if (files.length === 0) return c.json({ error: 'No code analysis data' }, 404);

  const data = files[0].data;
  const classified = data.classified as any[];
  const totalBlocks = classified.length;

  // Count categories
  const catCounts = new Map<string, number>();
  for (const block of classified) {
    for (const cat of block.categories) {
      catCounts.set(cat, (catCounts.get(cat) ?? 0) + 1);
    }
  }
  const categories = Array.from(catCounts.entries())
    .map(([name, count]) => ({ name, count, pct: +((count / totalBlocks) * 100).toFixed(1) }))
    .sort((a, b) => b.count - a.count);

  // Feature flags
  const featureKeys = ['hasSubLLMCalls', 'hasRegex', 'hasChunking', 'hasLooping'] as const;
  const features = featureKeys.map((key) => {
    const count = classified.filter((b) => b[key]).length;
    return { name: key, count, pct: +((count / totalBlocks) * 100).toFixed(1) };
  });

  return c.json({ totalBlocks, categories, features });
});

// View 8: Scenario Heatmap (strategy × scenario pass/fail grid)
app.get('/api/scenario-heatmap', async (c) => {
  const data = await findBest<any[]>('benchmark', (d) => (Array.isArray(d) ? d.length : 0));
  if (!data) return c.json({ error: 'No benchmark data' }, 404);

  const cells = data.map((e: any) => ({
    strategy: e.strategyName,
    scenario: e.scenarioName,
    correct: e.correct,
    cost: e.estimatedCostUsd,
    inputTokens: e.totalInputTokens,
    latencyMs: Math.round(e.totalLatencyMs),
  }));

  // Strategy summaries (sorted by accuracy desc)
  const byStrategy = new Map<string, any[]>();
  for (const e of data) {
    const list = byStrategy.get(e.strategyName) ?? [];
    list.push(e);
    byStrategy.set(e.strategyName, list);
  }
  const strategySummaries = Array.from(byStrategy.entries())
    .map(([strategy, entries]) => {
      const correct = entries.filter((e: any) => e.correct).length;
      return { strategy, correct, total: entries.length, accuracy: correct / entries.length };
    })
    .sort((a, b) => b.accuracy - a.accuracy);

  // Scenario summaries (sorted by accuracy desc — hardest last)
  const byScenario = new Map<string, any[]>();
  for (const e of data) {
    const list = byScenario.get(e.scenarioName) ?? [];
    list.push(e);
    byScenario.set(e.scenarioName, list);
  }
  const scenarioSummaries = Array.from(byScenario.entries())
    .map(([scenario, entries]) => {
      const correct = entries.filter((e: any) => e.correct).length;
      return { scenario, correct, total: entries.length, accuracy: correct / entries.length };
    })
    .sort((a, b) => b.accuracy - a.accuracy);

  return c.json({
    strategies: strategySummaries.map((s) => s.strategy),
    scenarios: scenarioSummaries.map((s) => s.scenario),
    cells,
    strategySummaries,
    scenarioSummaries,
  });
});

// View 9: Cost vs Accuracy with Pareto frontier
app.get('/api/cost-accuracy', async (c) => {
  const data = await findBest<any[]>('benchmark', (d) => (Array.isArray(d) ? d.length : 0));
  if (!data) return c.json({ error: 'No benchmark data' }, 404);

  const byStrategy = new Map<string, any[]>();
  for (const e of data) {
    const list = byStrategy.get(e.strategyName) ?? [];
    list.push(e);
    byStrategy.set(e.strategyName, list);
  }

  const points = Array.from(byStrategy.entries()).map(([strategy, entries]) => {
    const correct = entries.filter((e: any) => e.correct).length;
    const total = entries.length;
    const totalCost = entries.reduce((s: number, e: any) => s + e.estimatedCostUsd, 0);
    const avgInputTokens = Math.round(entries.reduce((s: number, e: any) => s + e.totalInputTokens, 0) / total);
    const avgLatency = Math.round(entries.reduce((s: number, e: any) => s + e.totalLatencyMs, 0) / total);
    return { strategy, accuracy: +(correct / total * 100).toFixed(1), totalCost: +totalCost.toFixed(6), avgInputTokens, avgLatency };
  });

  // Pareto frontier: sort by cost asc, keep points where accuracy > all cheaper points
  const sorted = [...points].sort((a, b) => a.totalCost - b.totalCost);
  const paretoFrontier: typeof points = [];
  let maxAcc = -1;
  for (const p of sorted) {
    if (p.accuracy > maxAcc) {
      paretoFrontier.push({ strategy: p.strategy, accuracy: p.accuracy, totalCost: p.totalCost, avgInputTokens: p.avgInputTokens, avgLatency: p.avgLatency });
      maxAcc = p.accuracy;
    }
  }

  return c.json({ points, paretoFrontier });
});

// View 10: Scenario Difficulty (which scenarios are hardest)
app.get('/api/scenario-difficulty', async (c) => {
  const data = await findBest<any[]>('benchmark', (d) => (Array.isArray(d) ? d.length : 0));
  if (!data) return c.json({ error: 'No benchmark data' }, 404);

  const byScenario = new Map<string, any[]>();
  for (const e of data) {
    const list = byScenario.get(e.scenarioName) ?? [];
    list.push(e);
    byScenario.set(e.scenarioName, list);
  }

  const scenarios = Array.from(byScenario.entries())
    .map(([name, entries]) => {
      const correct = entries.filter((e: any) => e.correct).length;
      const total = entries.length;
      const hardestStrategies = entries.filter((e: any) => !e.correct).map((e: any) => e.strategyName);
      return { name, correct, total, accuracy: +(correct / total * 100).toFixed(1), hardestStrategies };
    })
    .sort((a, b) => a.accuracy - b.accuracy); // hardest first

  return c.json({ scenarios });
});

// --- Start ---
const port = 3001;
Bun.serve({ fetch: app.fetch, port });
console.log(`Dashboard API server running on http://localhost:${port}`);
