import type {
  LeaderboardEntry,
  RetentionByTypeEntry,
  DepthComparisonResponse,
  RetentionCurveResponse,
  RllmComparisonResponse,
  TokenCostResponse,
  CodeAnalysisResponse,
} from './types';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  leaderboard: () => fetchJson<LeaderboardEntry[]>('/api/leaderboard'),
  retentionByType: () => fetchJson<RetentionByTypeEntry[]>('/api/retention-by-type'),
  depthComparison: () => fetchJson<DepthComparisonResponse>('/api/depth-comparison'),
  retentionCurve: () => fetchJson<RetentionCurveResponse>('/api/retention-curve'),
  rllmComparison: () => fetchJson<RllmComparisonResponse>('/api/rllm-comparison'),
  tokenCost: (scenario?: string) =>
    fetchJson<TokenCostResponse>(`/api/token-cost${scenario ? `?scenario=${encodeURIComponent(scenario)}` : ''}`),
  codeAnalysis: () => fetchJson<CodeAnalysisResponse>('/api/code-analysis'),
};
