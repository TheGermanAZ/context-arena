import type {
  LeaderboardEntry,
  RetentionByTypeEntry,
  DepthComparisonResponse,
  RetentionCurveResponse,
  RllmComparisonResponse,
  TokenCostResponse,
  CodeAnalysisResponse,
  ScenarioHeatmapResponse,
  CostAccuracyResponse,
  ScenarioDifficultyResponse,
  ParallelBenchmarksResponse,
  JournalResponse,
} from './types';
import type { ZodType } from 'zod';
import {
  leaderboardResponseSchema,
  retentionByTypeResponseSchema,
  depthComparisonResponseSchema,
  retentionCurveResponseSchema,
  rllmComparisonResponseSchema,
  tokenCostResponseSchema,
  codeAnalysisResponseSchema,
  scenarioHeatmapResponseSchema,
  costAccuracyResponseSchema,
  scenarioDifficultyResponseSchema,
  parallelBenchmarksResponseSchema,
  journalResponseSchema,
} from './schemas';

async function fetchJson<T>(url: string, schema: ZodType<T>, endpoint: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  const payload: unknown = await res.json();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue && issue.path.length > 0 ? issue.path.join('.') : '<root>';
    throw new Error(`API validation failed for ${endpoint} at ${path}: ${issue?.message ?? 'invalid response'}`);
  }
  return parsed.data;
}

export const api = {
  leaderboard: () => fetchJson<LeaderboardEntry[]>('/api/leaderboard', leaderboardResponseSchema, '/api/leaderboard'),
  retentionByType: () =>
    fetchJson<RetentionByTypeEntry[]>('/api/retention-by-type', retentionByTypeResponseSchema, '/api/retention-by-type'),
  depthComparison: () =>
    fetchJson<DepthComparisonResponse>('/api/depth-comparison', depthComparisonResponseSchema, '/api/depth-comparison'),
  retentionCurve: () =>
    fetchJson<RetentionCurveResponse>('/api/retention-curve', retentionCurveResponseSchema, '/api/retention-curve'),
  rllmComparison: () =>
    fetchJson<RllmComparisonResponse>('/api/rllm-comparison', rllmComparisonResponseSchema, '/api/rllm-comparison'),
  tokenCost: async (scenario?: string): Promise<TokenCostResponse> => {
    // Static builds bundle all scenarios into one file; extract the requested one
    const res = await fetch('/api/token-cost');
    if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
    const payload: unknown = await res.json();

    // Try bundled format first (static deployment)
    if (payload && typeof payload === 'object' && 'byScenario' in payload) {
      const bundle = payload as {
        availableScenarios: string[];
        defaultScenario: string;
        byScenario: Record<string, { scenario: string; strategies: unknown[] }>;
      };
      const key = scenario ?? bundle.defaultScenario;
      const entry = bundle.byScenario[key] ?? bundle.byScenario[bundle.defaultScenario];
      const single = {
        scenario: entry.scenario,
        strategies: entry.strategies,
        availableScenarios: bundle.availableScenarios,
      };
      const parsed = tokenCostResponseSchema.safeParse(single);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const path = issue && issue.path.length > 0 ? issue.path.join('.') : '<root>';
        throw new Error(`API validation failed for /api/token-cost at ${path}: ${issue?.message ?? 'invalid response'}`);
      }
      return parsed.data;
    }

    // Direct format (dev server)
    const parsed = tokenCostResponseSchema.safeParse(payload);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const path = issue && issue.path.length > 0 ? issue.path.join('.') : '<root>';
      throw new Error(`API validation failed for /api/token-cost at ${path}: ${issue?.message ?? 'invalid response'}`);
    }
    return parsed.data;
  },
  codeAnalysis: () => fetchJson<CodeAnalysisResponse>('/api/code-analysis', codeAnalysisResponseSchema, '/api/code-analysis'),
  scenarioHeatmap: () =>
    fetchJson<ScenarioHeatmapResponse>('/api/scenario-heatmap', scenarioHeatmapResponseSchema, '/api/scenario-heatmap'),
  costAccuracy: () => fetchJson<CostAccuracyResponse>('/api/cost-accuracy', costAccuracyResponseSchema, '/api/cost-accuracy'),
  scenarioDifficulty: () =>
    fetchJson<ScenarioDifficultyResponse>('/api/scenario-difficulty', scenarioDifficultyResponseSchema, '/api/scenario-difficulty'),
  parallelBenchmarks: () =>
    fetchJson<ParallelBenchmarksResponse>('/api/parallel-benchmarks', parallelBenchmarksResponseSchema, '/api/parallel-benchmarks'),
  journal: () => fetchJson<JournalResponse>('/api/journal', journalResponseSchema, '/api/journal'),
};
