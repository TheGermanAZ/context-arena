import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, Cell, ResponsiveContainer } from 'recharts';
import { useDepthComparison } from '../lib/hooks';
import { useFilterOptional } from '../lib/FilterContext';
import { Skeleton, ErrorCard } from './charts';
import type { DepthScenario } from '../lib/types';

interface DepthChartRow {
  name: string;
  fullName: string;
  depth1: number;
  depth2: number;
  delta: number;
}

interface ActivePayloadState {
  activePayload?: Array<{ payload?: DepthChartRow }>;
}

interface DeltaLabelProps {
  x?: number;
  y?: number;
  width?: number;
  index?: number;
  deltas: number[];
}

function DeltaLabel({ x = 0, y = 0, width = 0, index, deltas }: DeltaLabelProps) {
  if (index === undefined) return null;
  const delta = deltas[index];
  if (delta === undefined || delta === 0) return null;

  const color = delta > 0 ? '#10b981' : '#ef4444';
  return (
    <text x={x + width / 2} y={y - 8} fill={color} textAnchor="middle" fontSize={11} fontWeight="bold">
      {delta > 0 ? '+' : ''}{delta}
    </text>
  );
}

export default function DepthComparison() {
  const { data, error, isLoading, refetch } = useDepthComparison();
  const filter = useFilterOptional();

  const focused = filter?.focusedScenario ?? null;
  const onFocusClick = filter
    ? (name: string) => { filter.guardClick(); filter.toggleFocus('scenario', name); }
    : undefined;

  if (error) return <ErrorCard message={error.message} onRetry={() => refetch()} />;
  if (isLoading) return <Skeleton variant="chart" />;
  if (!data) return null;

  const hasFocus = focused != null;

  const chartData: DepthChartRow[] = data.scenarios.map((s: DepthScenario) => ({
    name: s.name,
    fullName: s.name,
    depth1: s.depth1.retained,
    depth2: s.depth2.retained,
    delta: s.delta,
  }));
  const deltas = chartData.map((entry) => entry.delta);

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-6 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-100">Depth 1 vs Depth 2</h2>
          <span className="text-[10px] font-semibold uppercase tracking-wider bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded">RLM</span>
        </div>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Click a scenario bar group to focus — does a second delegation layer help or hurt?
      </p>
      <ResponsiveContainer width="100%" height={480}>
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 30, bottom: 100, left: 0 }}
          onClick={(state) => {
            const fullName = (state as ActivePayloadState | undefined)?.activePayload?.[0]?.payload?.fullName;
            if (fullName) onFocusClick?.(fullName);
          }}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} angle={-45} textAnchor="end" dy={5} dx={-5} interval={0} />
          <YAxis tick={{ fill: '#9ca3af', fontSize: 12 }} label={{ value: 'Retained', fill: '#9ca3af', angle: -90, position: 'insideLeft' }} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
            labelStyle={{ color: '#f3f4f6' }}
            itemStyle={{ color: '#d1d5db' }}
            itemSorter={(item) => -(Number(item.value) || 0)}
            labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName ?? _label}
          />
          <Legend verticalAlign="top" wrapperStyle={{ color: '#9ca3af' }} />
          <Bar dataKey="depth1" name="Depth 1" fill="#14b8a6" radius={[4, 4, 0, 0]}>
            {chartData.map((entry) => {
              const isDimmed = hasFocus && focused !== entry.fullName;
              return <Cell key={`d1-${entry.fullName}`} fill="#14b8a6" fillOpacity={isDimmed ? 0.15 : 1} />;
            })}
          </Bar>
          <Bar dataKey="depth2" name="Depth 2" fill="#8b5cf6" radius={[4, 4, 0, 0]}>
            {chartData.map((entry) => {
              const isDimmed = hasFocus && focused !== entry.fullName;
              return <Cell key={`d2-${entry.fullName}`} fill="#8b5cf6" fillOpacity={isDimmed ? 0.15 : 1} />;
            })}
            <LabelList content={<DeltaLabel deltas={deltas} />} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-4 flex gap-6 text-sm text-gray-400 justify-center">
        <span>
          Depth 1: <span className="text-teal-400 font-mono">{data.summary.depth1Total.retained}/{data.summary.depth1Total.total}</span>{' '}
          ({data.summary.depth1Total.pct}%)
        </span>
        <span>
          Depth 2: <span className="text-violet-400 font-mono">{data.summary.depth2Total.retained}/{data.summary.depth2Total.total}</span>{' '}
          ({data.summary.depth2Total.pct}%)
        </span>
      </div>
    </div>
  );
}
