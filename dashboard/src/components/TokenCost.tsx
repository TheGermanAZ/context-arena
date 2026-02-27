import { useEffect, useState } from 'react';
import { LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useTokenCost } from '../lib/hooks';
import { useFilterOptional } from '../lib/FilterContext';
import { Skeleton, ErrorCard } from './charts';
import { getStrategyColor } from '../lib/colors';

type Metric = 'inputTokens' | 'overhead' | 'latency';

const METRIC_LABELS: Record<Metric, string> = {
  inputTokens: 'Input Tokens',
  overhead: 'Overhead Tokens',
  latency: 'Latency (ms)',
};

interface LegendClickPayload {
  value?: string | number;
}

export default function TokenCost() {
  const filter = useFilterOptional();

  // Scenario: use filter context if available, otherwise local state
  const [localScenario, setLocalScenario] = useState<string>('');
  const scenario = filter?.scenario ?? localScenario;
  const onScenarioChange = filter
    ? (s: string) => filter.setScenario(s)
    : (s: string) => setLocalScenario(s);

  const { data, error, isLoading, refetch } = useTokenCost(scenario || undefined);
  const [metric, setMetric] = useState<Metric>('inputTokens');

  const focused = filter?.focusedStrategy ?? null;
  const onFocusClick = filter
    ? (name: string) => { filter.guardClick(); filter.toggleFocus('strategy', name); }
    : undefined;

  // Sync initial scenario from server response when no scenario is set
  // Must be before conditional returns to satisfy Rules of Hooks
  useEffect(() => {
    if (!scenario && data?.scenario) {
      onScenarioChange(data.scenario);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.scenario]);

  if (error) return <ErrorCard message={error.message} onRetry={() => refetch()} />;
  if (isLoading) return <Skeleton variant="chart" />;
  if (!data) return null;

  const hasFocus = focused != null;

  const maxSteps = Math.max(...data.strategies.map((s) => s.steps.length));
  const chartData = Array.from({ length: maxSteps }, (_, i) => {
    const row: Record<string, number> = { step: i + 1 };
    for (const strat of data.strategies) {
      const step = strat.steps[i];
      if (step) row[strat.name] = step[metric];
    }
    return row;
  });

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-6 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-100 mb-1">Token Cost per Step</h2>
          <p className="text-sm text-gray-400">Click a legend item to focus a strategy</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={scenario}
            onChange={(e) => onScenarioChange(e.target.value)}
            className="bg-gray-800 text-gray-200 border border-gray-600 rounded px-3 py-1.5 text-sm"
          >
            {data.availableScenarios.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <div className="flex rounded overflow-hidden border border-gray-600">
            {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  metric === m ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'
                }`}
              >
                {METRIC_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 5, right: 30 }}>
          <defs>
            {data.strategies.map((strat) => (
              <linearGradient key={`grad-${strat.name}`} id={`grad-${strat.name.replace(/[^a-zA-Z0-9]/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={getStrategyColor(strat.name)} stopOpacity={0.3} />
                <stop offset="100%" stopColor={getStrategyColor(strat.name)} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="step" tick={{ fill: '#9ca3af', fontSize: 12 }} label={{ value: 'Step', fill: '#9ca3af', position: 'insideBottom', offset: -5 }} />
          <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={(v) => v.toLocaleString()} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
            labelStyle={{ color: '#f3f4f6' }}
            labelFormatter={(v) => `Step ${v}`}
            formatter={(value: number | string | undefined, name: string) => [`${(value ?? 0).toLocaleString()}`, name]}
          />
          <Legend
            wrapperStyle={{ color: '#9ca3af', cursor: 'pointer' }}
            onClick={(e: LegendClickPayload) => {
              const value = e.value;
              if (typeof value === 'string') onFocusClick?.(value);
            }}
          />
          {data.strategies.map((strat, idx) => {
            const isFocused = focused === strat.name;
            const isDimmed = hasFocus && !isFocused;
            const gradId = `grad-${strat.name.replace(/[^a-zA-Z0-9]/g, '-')}`;
            const seriesDelay = idx * 130;
            return [
              <Area
                key={`area-${strat.name}`}
                type="monotone"
                dataKey={strat.name}
                fill={`url(#${gradId})`}
                stroke="none"
                fillOpacity={isDimmed ? 0 : isFocused ? 1 : 0.5}
                legendType="none"
                tooltipType="none"
                isAnimationActive
                animationBegin={seriesDelay}
                animationDuration={650}
                animationEasing="ease-out"
              />,
              <Line
                key={strat.name}
                type="monotone"
                dataKey={strat.name}
                stroke={getStrategyColor(strat.name)}
                strokeWidth={isFocused ? 3 : isDimmed ? 1 : 2}
                strokeOpacity={isDimmed ? 0.15 : 1}
                dot={isDimmed ? false : { r: isFocused ? 4 : 3 }}
                activeDot={isDimmed ? false : { r: isFocused ? 6 : 5, onClick: () => onFocusClick?.(strat.name) }}
                isAnimationActive
                animationBegin={seriesDelay + 120}
                animationDuration={700}
                animationEasing="ease-out"
              />,
            ];
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
