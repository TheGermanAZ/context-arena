import { useQuery } from '@tanstack/react-query';
import { api } from './api';
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

export function useLeaderboard() {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard'],
    queryFn: api.leaderboard,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRetentionByType() {
  return useQuery<RetentionByTypeEntry[]>({
    queryKey: ['retention-by-type'],
    queryFn: api.retentionByType,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDepthComparison() {
  return useQuery<DepthComparisonResponse>({
    queryKey: ['depth-comparison'],
    queryFn: api.depthComparison,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRetentionCurve() {
  return useQuery<RetentionCurveResponse>({
    queryKey: ['retention-curve'],
    queryFn: api.retentionCurve,
    staleTime: 5 * 60 * 1000,
  });
}

export function useRllmComparison() {
  return useQuery<RllmComparisonResponse>({
    queryKey: ['rllm-comparison'],
    queryFn: api.rllmComparison,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTokenCost(scenario?: string) {
  return useQuery<TokenCostResponse>({
    queryKey: ['token-cost', scenario ?? 'default'],
    queryFn: () => api.tokenCost(scenario),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCodeAnalysis() {
  return useQuery<CodeAnalysisResponse>({
    queryKey: ['code-analysis'],
    queryFn: api.codeAnalysis,
    staleTime: 5 * 60 * 1000,
  });
}

export function useScenarioHeatmap() {
  return useQuery<ScenarioHeatmapResponse>({
    queryKey: ['scenario-heatmap'],
    queryFn: api.scenarioHeatmap,
    staleTime: 5 * 60 * 1000,
  });
}

export function useCostAccuracy() {
  return useQuery<CostAccuracyResponse>({
    queryKey: ['cost-accuracy'],
    queryFn: api.costAccuracy,
    staleTime: 5 * 60 * 1000,
  });
}

export function useScenarioDifficulty() {
  return useQuery<ScenarioDifficultyResponse>({
    queryKey: ['scenario-difficulty'],
    queryFn: api.scenarioDifficulty,
    staleTime: 5 * 60 * 1000,
  });
}

export function useParallelBenchmarks() {
  return useQuery<ParallelBenchmarksResponse>({
    queryKey: ['parallel-benchmarks'],
    queryFn: api.parallelBenchmarks,
    staleTime: 5 * 60 * 1000,
  });
}

export function useJournal() {
  return useQuery<JournalResponse>({
    queryKey: ['journal'],
    queryFn: api.journal,
    staleTime: 5 * 60 * 1000,
  });
}
