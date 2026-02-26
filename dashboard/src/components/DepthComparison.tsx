import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, LabelList, Cell, ResponsiveContainer } from 'recharts';
import { useDepthComparison } from '../lib/hooks';
import { useFilterOptional } from '../lib/FilterContext';
import { Skeleton } from './charts';

export default function DepthComparison() {
  const { data, error, isLoading } = useDepthComparison();
  const filter = useFilterOptional();

  const focused = filter?.focusedScenario ?? null;
  const onFocusClick = filter
    ? (name: string) => { filter.guardClick(); filter.toggleFocus('scenario', name); }
    : undefined;

  if (error) return <div className="text-red-400 p-4">Error: {error.message}</div>;
  if (isLoading) return <Skeleton variant="chart" />;
  if (!data) return null;

  const hasFocus = focused != null;

  const chartData = data.scenarios.map((s) => ({
    name: s.name.length > 20 ? s.name.slice(0, 18) + '...' : s.name,
    fullName: s.name,
    depth1: s.depth1.retained,
    depth2: s.depth2.retained,
    delta: s.delta,
  }));

  const CustomLabel = (props: any) => {
    const { x, y, width, index } = props;
    const delta = chartData[index]?.delta;
    if (delta === undefined || delta === 0) return null;
    const color = delta > 0 ? '#10b981' : '#ef4444';
    return (
      <text x={x + width / 2} y={y - 8} fill={color} textAnchor="middle" fontSize={11} fontWeight="bold">
        {delta > 0 ? '+' : ''}{delta}
      </text>
    );
  };

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-100">Depth 1 vs Depth 2</h2>
          <span className="text-[10px] font-semibold uppercase tracking-wider bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded">RLM</span>
        </div>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Click a scenario bar group to focus — does a second delegation layer help or hurt?
      </p>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={chartData}
          margin={{ top: 20, right: 30 }}
          onClick={(state) => {
            const fullName = (state as any)?.activePayload?.[0]?.payload?.fullName;
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
            labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullName ?? _label}
          />
          <Legend wrapperStyle={{ color: '#9ca3af' }} />
          <Bar dataKey="depth1" name="Depth 1" radius={[4, 4, 0, 0]}>
            {chartData.map((entry) => {
              const isDimmed = hasFocus && focused !== entry.fullName;
              return <Cell key={`d1-${entry.fullName}`} fill="#14b8a6" fillOpacity={isDimmed ? 0.15 : 1} />;
            })}
          </Bar>
          <Bar dataKey="depth2" name="Depth 2" radius={[4, 4, 0, 0]}>
            {chartData.map((entry) => {
              const isDimmed = hasFocus && focused !== entry.fullName;
              return <Cell key={`d2-${entry.fullName}`} fill="#8b5cf6" fillOpacity={isDimmed ? 0.15 : 1} />;
            })}
            <LabelList content={<CustomLabel />} />
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
