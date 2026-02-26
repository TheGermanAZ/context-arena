export const STRATEGY_COLORS: Record<string, string> = {
  'Full Context': '#3b82f6',    // blue
  'Window(6)': '#f59e0b',       // amber
  'Window(10)': '#d97706',      // amber-darker
  'RLM(8)': '#10b981',          // emerald
  'Summarize(8)': '#06b6d4',    // cyan
  'Structured(8)': '#84cc16',   // lime
  'CorrectionAware': '#8b5cf6', // violet
  'Hybrid': '#ec4899',          // pink
};

export const PROBE_TYPE_COLORS: Record<string, string> = {
  entity: '#3b82f6',
  quantity: '#10b981',
  date: '#f59e0b',
  correction: '#ef4444',
  spatial: '#8b5cf6',
  relationship: '#ec4899',
  'phone/id': '#06b6d4',
};

export function getStrategyColor(name: string): string {
  return STRATEGY_COLORS[name] ?? '#6b7280';
}

export function getProbeTypeColor(name: string): string {
  return PROBE_TYPE_COLORS[name] ?? '#6b7280';
}

export const SCENARIO_COLORS: Record<string, string> = {
  'Early Fact Recall': '#3b82f6',       // blue
  'State Change Tracking': '#10b981',   // emerald
  'Contradiction Resolution': '#f59e0b', // amber
  'Multi-hop Reasoning': '#8b5cf6',     // violet
  'Long Horizon + Noise': '#ec4899',    // pink
  'Cascading Corrections': '#ef4444',   // red
  'Implicit Corrections': '#06b6d4',    // cyan
  'Rapid-fire Corrections': '#d97706',  // amber-darker
};

export function getScenarioColor(name: string): string {
  return SCENARIO_COLORS[name] ?? '#6b7280';
}
