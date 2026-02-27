// API response types

export interface LeaderboardEntry {
  rank: number;
  strategy: string;
  accuracy: number;
  accuracyFraction: string;
  avgInputTokens: number;
  avgOverhead: number;
  avgLatency: number;
  totalCost: number;
}

export interface RetentionByTypeEntry {
  type: string;
  retained: number;
  total: number;
  pct: number;
}

export interface DepthScenario {
  name: string;
  depth1: { retained: number; total: number };
  depth2: { retained: number; total: number };
  delta: number;
}

export interface DepthComparisonResponse {
  scenarios: DepthScenario[];
  summary: {
    depth1Total: { retained: number; total: number; pct: number };
    depth2Total: { retained: number; total: number; pct: number };
  };
}

export interface RetentionCurveResponse {
  types: string[];
  cycles: Array<{ cycle: number } & Record<string, number>>;
}

export interface RllmScenario {
  name: string;
  handRolled: { retained: number; total: number; pct: number };
  rllm: { retained: number; total: number; pct: number };
}

export interface RllmComparisonResponse {
  scenarios: RllmScenario[];
  summary: { handRolledPct: number; rllmPct: number };
}

export interface TokenCostStep {
  step: number;
  inputTokens: number;
  outputTokens: number;
  overhead: number;
  latency: number;
}

export interface TokenCostStrategy {
  name: string;
  steps: TokenCostStep[];
}

export interface TokenCostResponse {
  scenario: string;
  strategies: TokenCostStrategy[];
  availableScenarios: string[];
}

export interface CodeCategory {
  name: string;
  count: number;
  pct: number;
}

export interface CodeFeature {
  name: string;
  count: number;
  pct: number;
}

export interface CodeAnalysisResponse {
  totalBlocks: number;
  categories: CodeCategory[];
  features: CodeFeature[];
}

// --- Scenario Heatmap ---

export interface HeatmapCell {
  strategy: string;
  scenario: string;
  correct: boolean;
  cost: number;
  inputTokens: number;
  latencyMs: number;
}

export interface HeatmapSummary {
  strategy?: string;
  scenario?: string;
  correct: number;
  total: number;
  accuracy: number;
}

export interface ScenarioHeatmapResponse {
  strategies: string[];
  scenarios: string[];
  cells: HeatmapCell[];
  strategySummaries: HeatmapSummary[];
  scenarioSummaries: HeatmapSummary[];
}

// --- Cost vs Accuracy ---

export interface CostAccuracyPoint {
  strategy: string;
  accuracy: number;
  totalCost: number;
  avgInputTokens: number;
  avgLatency: number;
}

export interface CostAccuracyResponse {
  points: CostAccuracyPoint[];
  paretoFrontier: CostAccuracyPoint[];
}

// --- Scenario Difficulty ---

export interface ScenarioDifficultyEntry {
  name: string;
  correct: number;
  total: number;
  accuracy: number;
  hardestStrategies: string[];
}

export interface ScenarioDifficultyResponse {
  scenarios: ScenarioDifficultyEntry[];
}

// --- Parallel Benchmarks (CTX-26 expansion) ---

export interface ParallelBenchmarkRow {
  track: string;
  type: 'industry' | 'internal';
  strategy: string;
  score: string;
  passed: boolean;
  avgLatencyMs: number;
  costUsd: number;
}

export interface ParallelBenchmarksResponse {
  rows: ParallelBenchmarkRow[];
  summary: { industryCount: number; internalCount: number; totalTracks: number };
}
