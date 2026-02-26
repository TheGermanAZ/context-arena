import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, LabelList } from 'recharts';
import { useRetentionByType } from '../lib/hooks';
import { useFilterOptional } from '../lib/FilterContext';
import { Skeleton, ErrorCard } from './charts';
import { getProbeTypeColor } from '../lib/colors';

export default function RetentionByType() {
  const { data, error, isLoading, refetch } = useRetentionByType();
  const filter = useFilterOptional();

  const focused = filter?.focusedType ?? null;
  const onFocusClick = filter
    ? (name: string) => { filter.guardClick(); filter.toggleFocus('type', name); }
    : undefined;

  if (error) return <ErrorCard message={error.message} onRetry={() => refetch()} />;
  if (isLoading) return <Skeleton variant="chart" />;
  if (!data) return null;

  const hasFocus = focused != null;

  const chartData = data.map((d) => ({
    ...d,
    label: `${d.pct}% (${d.retained}/${d.total})`,
  }));

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-6 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-100">Retention by Fact Type</h2>
          <span className="text-[10px] font-semibold uppercase tracking-wider bg-emerald-900/50 text-emerald-400 px-2 py-0.5 rounded">RLM</span>
        </div>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Click a bar to focus — which fact types survive RLM's summarize-and-delegate cycle
      </p>
      <ResponsiveContainer width="100%" height={400}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ left: 20, right: 80 }}
          onClick={(state) => {
            if (state?.activeLabel) onFocusClick?.(String(state.activeLabel));
          }}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
          <YAxis type="category" dataKey="type" tick={{ fill: '#9ca3af', fontSize: 12 }} width={100} />
          <Tooltip
            contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
            labelStyle={{ color: '#f3f4f6' }}
            itemStyle={{ color: '#d1d5db' }}
            formatter={((value: number, _name: string, props: any) => [`${value}% (${props.payload.retained}/${props.payload.total})`, 'Retention']) as any}
          />
          <Bar dataKey="pct" radius={[0, 4, 4, 0]}>
            {chartData.map((entry) => {
              const isDimmed = hasFocus && focused !== entry.type;
              return (
                <Cell
                  key={entry.type}
                  fill={getProbeTypeColor(entry.type)}
                  fillOpacity={isDimmed ? 0.15 : 1}
                  style={{ cursor: 'pointer' }}
                />
              );
            })}
            <LabelList dataKey="label" position="right" fill="#9ca3af" fontSize={12} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
