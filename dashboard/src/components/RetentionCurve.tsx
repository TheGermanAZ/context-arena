import { LineChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useRetentionCurve } from '../lib/hooks';
import { useFilterOptional } from '../lib/FilterContext';
import { Skeleton, ErrorCard } from './charts';
import { getProbeTypeColor } from '../lib/colors';

interface LegendClickPayload {
  value?: string | number;
}

export default function RetentionCurve() {
  const { data, error, isLoading, refetch } = useRetentionCurve();
  const filter = useFilterOptional();

  const focused = filter?.focusedType ?? null;
  const onFocusClick = filter
    ? (name: string) => { filter.guardClick(); filter.toggleFocus('type', name); }
    : undefined;

  if (error) return <ErrorCard message={error.message} onRetry={() => refetch()} />;
  if (isLoading) return <Skeleton variant="chart" />;
  if (!data) return null;

  const hasFocus = focused != null;

  const chartData = data.cycles.map((c) => ({
    ...c,
    name: `C${c.cycle}`,
  }));

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-6 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-100">Retention Curve by Type</h2>
          <span className="text-[10px] font-semibold uppercase tracking-wider bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded">RLM</span>
        </div>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Click a legend item to focus — per-cycle retention rates for each fact type
      </p>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={chartData} margin={{ top: 5, right: 30 }}>
          <defs>
            {data.types.map((type) => (
              <linearGradient key={`grad-${type}`} id={`grad-rt-${type.replace(/[^a-zA-Z0-9]/g, '-')}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={getProbeTypeColor(type)} stopOpacity={0.3} />
                <stop offset="100%" stopColor={getProbeTypeColor(type)} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            tickFormatter={(v) => `${v}%`}
            label={{ value: 'Retention %', fill: '#9ca3af', angle: -90, position: 'insideLeft' }}
          />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
            labelStyle={{ color: '#f3f4f6' }}
            itemSorter={(item) => -(Number(item.value) || 0)}
            formatter={(value: number | string | undefined, name?: string) => [`${value ?? 0}%`, name ?? '']}
          />
          <Legend
            wrapperStyle={{ color: '#9ca3af', cursor: 'pointer' }}
            onClick={(e: LegendClickPayload) => {
              const value = e.value;
              if (typeof value === 'string') onFocusClick?.(value);
            }}
          />
          {data.types.map((type) => {
            const isFocused = focused === type;
            const isDimmed = hasFocus && !isFocused;
            const gradId = `grad-rt-${type.replace(/[^a-zA-Z0-9]/g, '-')}`;
            return [
              <Area
                key={`area-${type}`}
                type="monotone"
                dataKey={type}
                fill={`url(#${gradId})`}
                stroke="none"
                fillOpacity={isDimmed ? 0 : isFocused ? 1 : 0.5}
                legendType="none"
                tooltipType="none"
              />,
              <Line
                key={type}
                type="monotone"
                dataKey={type}
                stroke={getProbeTypeColor(type)}
                strokeWidth={isFocused ? 3 : isDimmed ? 1 : 2}
                strokeOpacity={isDimmed ? 0.15 : 1}
                dot={isDimmed ? false : { r: isFocused ? 5 : 4 }}
                activeDot={isDimmed ? false : { r: isFocused ? 7 : 6, onClick: () => onFocusClick?.(type) }}
              />,
            ];
          })}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
