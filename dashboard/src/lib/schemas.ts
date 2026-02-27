import { z } from 'zod';

const leaderboardEntrySchema = z.object({
  rank: z.number(),
  strategy: z.string(),
  accuracy: z.number(),
  accuracyFraction: z.string(),
  avgInputTokens: z.number(),
  avgOverhead: z.number(),
  avgLatency: z.number(),
  totalCost: z.number(),
});

const retentionByTypeEntrySchema = z.object({
  type: z.string(),
  retained: z.number(),
  total: z.number(),
  pct: z.number(),
});

const depthScenarioSchema = z.object({
  name: z.string(),
  depth1: z.object({ retained: z.number(), total: z.number() }),
  depth2: z.object({ retained: z.number(), total: z.number() }),
  delta: z.number(),
});

const retentionCycleSchema = z.object({
  cycle: z.number(),
}).catchall(z.number());

const rllmScenarioSchema = z.object({
  name: z.string(),
  handRolled: z.object({
    retained: z.number(),
    total: z.number(),
    pct: z.number(),
  }),
  rllm: z.object({
    retained: z.number(),
    total: z.number(),
    pct: z.number(),
  }),
});

const tokenCostStepSchema = z.object({
  step: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  overhead: z.number(),
  latency: z.number(),
});

const tokenCostStrategySchema = z.object({
  name: z.string(),
  steps: z.array(tokenCostStepSchema),
});

const codeCategorySchema = z.object({
  name: z.string(),
  count: z.number(),
  pct: z.number(),
});

const heatmapCellSchema = z.object({
  strategy: z.string(),
  scenario: z.string(),
  correct: z.boolean(),
  cost: z.number(),
  inputTokens: z.number(),
  latencyMs: z.number(),
});

const strategySummarySchema = z.object({
  strategy: z.string(),
  correct: z.number(),
  total: z.number(),
  accuracy: z.number(),
});

const scenarioSummarySchema = z.object({
  scenario: z.string(),
  correct: z.number(),
  total: z.number(),
  accuracy: z.number(),
});

const costAccuracyPointSchema = z.object({
  strategy: z.string(),
  accuracy: z.number(),
  totalCost: z.number(),
  avgInputTokens: z.number(),
  avgLatency: z.number(),
});

const scenarioDifficultyEntrySchema = z.object({
  name: z.string(),
  correct: z.number(),
  total: z.number(),
  accuracy: z.number(),
  hardestStrategies: z.array(z.string()),
});

export const leaderboardResponseSchema = z.array(leaderboardEntrySchema);

export const retentionByTypeResponseSchema = z.array(retentionByTypeEntrySchema);

export const depthComparisonResponseSchema = z.object({
  scenarios: z.array(depthScenarioSchema),
  summary: z.object({
    depth1Total: z.object({
      retained: z.number(),
      total: z.number(),
      pct: z.number(),
    }),
    depth2Total: z.object({
      retained: z.number(),
      total: z.number(),
      pct: z.number(),
    }),
  }),
});

export const retentionCurveResponseSchema = z.object({
  types: z.array(z.string()),
  cycles: z.array(retentionCycleSchema),
});

export const rllmComparisonResponseSchema = z.object({
  scenarios: z.array(rllmScenarioSchema),
  summary: z.object({
    handRolledPct: z.number(),
    rllmPct: z.number(),
  }),
});

export const tokenCostResponseSchema = z.object({
  scenario: z.string(),
  strategies: z.array(tokenCostStrategySchema),
  availableScenarios: z.array(z.string()),
});

export const codeAnalysisResponseSchema = z.object({
  totalBlocks: z.number(),
  categories: z.array(codeCategorySchema),
  features: z.array(codeCategorySchema),
});

export const scenarioHeatmapResponseSchema = z.object({
  strategies: z.array(z.string()),
  scenarios: z.array(z.string()),
  cells: z.array(heatmapCellSchema),
  strategySummaries: z.array(strategySummarySchema),
  scenarioSummaries: z.array(scenarioSummarySchema),
});

export const costAccuracyResponseSchema = z.object({
  points: z.array(costAccuracyPointSchema),
  paretoFrontier: z.array(costAccuracyPointSchema),
});

export const scenarioDifficultyResponseSchema = z.object({
  scenarios: z.array(scenarioDifficultyEntrySchema),
});

// --- Parallel Benchmarks (CTX-26 expansion) ---

const parallelBenchmarkRowSchema = z.object({
  track: z.string(),
  type: z.enum(['industry', 'internal']),
  strategy: z.string(),
  score: z.string(),
  passed: z.boolean(),
  avgLatencyMs: z.number(),
  costUsd: z.number(),
});

export const parallelBenchmarksResponseSchema = z.object({
  rows: z.array(parallelBenchmarkRowSchema),
  summary: z.object({
    industryCount: z.number(),
    internalCount: z.number(),
    totalTracks: z.number(),
  }),
});
