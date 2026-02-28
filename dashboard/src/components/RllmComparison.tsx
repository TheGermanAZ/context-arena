import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell, ResponsiveContainer } from 'recharts';
import { useRllmComparison } from '../lib/hooks';
import { useFilterOptional } from '../lib/FilterContext';
import { Skeleton, ErrorCard } from './charts';
import type { RllmScenario } from '../lib/types';

interface RllmChartRow {
  name: string;
  fullName: string;
  handRolled: number;
  rllm: number;
}

interface ActivePayloadState {
  activePayload?: Array<{ payload?: RllmChartRow }>;
}

export default function RllmComparison() {
  const { data, error, isLoading, refetch } = useRllmComparison();
  const filter = useFilterOptional();

  const focused = filter?.focusedScenario ?? null;
  const onFocusClick = filter
    ? (name: string) => { filter.guardClick(); filter.toggleFocus('scenario', name); }
    : undefined;

  if (error) return <ErrorCard message={error.message} onRetry={() => refetch()} />;
  if (isLoading) return <Skeleton variant="chart" />;
  if (!data) return null;

  const hasFocus = focused != null;

  const chartData: RllmChartRow[] = data.scenarios.map((s: RllmScenario) => ({
    name: s.name.length > 20 ? s.name.slice(0, 18) + '...' : s.name,
    fullName: s.name,
    handRolled: s.handRolled.retained,
    rllm: s.rllm.retained,
  }));

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-6 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-lg font-semibold text-gray-100">Hand-rolled RLM vs RLLM Code-Gen</h2>
            <span className="text-[10px] font-semibold uppercase tracking-wider bg-red-900/50 text-red-400 px-2 py-0.5 rounded">RLLM</span>
          </div>
          <p className="text-sm text-gray-400">
            Click a scenario to focus — hand-rolled delegation crushes code-gen on gpt-5-nano
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 bg-gray-800 rounded-lg px-4 py-2">
            <div className="text-center">
              <div className="text-2xl font-bold text-emerald-400">{data.summary.handRolledPct}%</div>
              <div className="text-xs text-gray-400">Hand-rolled</div>
            </div>
            <div className="text-gray-600 text-lg">vs</div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-400">{data.summary.rllmPct}%</div>
              <div className="text-xs text-gray-400">RLLM</div>
            </div>
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={chartData}
          margin={{ top: 5, right: 30 }}
          onClick={(state) => {
            const fullName = (state as ActivePayloadState | undefined)?.activePayload?.[0]?.payload?.fullName;
            if (fullName) onFocusClick?.(fullName);
          }}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
          <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} label={{ value: 'Retained', fill: '#9ca3af', angle: -90, position: 'insideLeft' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
            labelStyle={{ color: '#f3f4f6' }}
            itemStyle={{ color: '#d1d5db' }}
            itemSorter={(item) => -(Number(item.value) || 0)}
            labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName ?? _label}
          />
          <Legend wrapperStyle={{ color: '#9ca3af' }} />
          <Bar
            dataKey="handRolled"
            name="Hand-rolled RLM"
            radius={[4, 4, 0, 0]}
            isAnimationActive
            animationBegin={20}
            animationDuration={700}
            animationEasing="ease-out"
          >
            {chartData.map((entry) => {
              const isDimmed = hasFocus && focused !== entry.fullName;
              return <Cell key={`hr-${entry.fullName}`} fill="#10b981" fillOpacity={isDimmed ? 0.15 : 1} />;
            })}
          </Bar>
          <Bar
            dataKey="rllm"
            name="RLLM Code-Gen"
            radius={[4, 4, 0, 0]}
            isAnimationActive
            animationBegin={180}
            animationDuration={700}
            animationEasing="ease-out"
          >
            {chartData.map((entry) => {
              const isDimmed = hasFocus && focused !== entry.fullName;
              return <Cell key={`rl-${entry.fullName}`} fill="#ef4444" fillOpacity={isDimmed ? 0.15 : 1} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
