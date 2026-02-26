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
