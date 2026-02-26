import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useCodeAnalysis } from '../lib/hooks';
import { useFilterOptional } from '../lib/FilterContext';
import { Skeleton } from './charts';

const CATEGORY_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

export default function CodeStrategies() {
  const { data, error, isLoading } = useCodeAnalysis();
  const filter = useFilterOptional();

  const focused = filter?.focusedCategory ?? null;
  const onFocusClick = filter
    ? (name: string) => { filter.guardClick(); filter.toggleFocus('category', name); }
    : undefined;

  if (error) return <div className="text-red-400 p-4">Error: {error.message}</div>;
  if (isLoading) return <Skeleton variant="chart" />;
  if (!data) return null;

  const hasFocus = focused != null;

  const pieData = data.categories.map((c, i) => ({
    ...c,
    fill: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));

  const featureData = data.features.map((f) => ({
    name: f.name.replace('has', '').replace(/([A-Z])/g, ' $1').trim(),
    rawName: f.name,
    count: f.count,
    pct: f.pct,
  }));

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-gray-100">Code Strategy Analysis</h2>
          <span className="text-[10px] font-semibold uppercase tracking-wider bg-red-900/50 text-red-400 px-2 py-0.5 rounded">RLLM</span>
        </div>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Click a pie slice or bar to focus — {data.totalBlocks} code blocks classified by strategy and feature usage
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Donut chart */}
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-4">Category Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={2}
                label={({ name, ...rest }: any) => `${name} (${(rest as { pct: number }).pct}%)`}
                labelLine={{ stroke: '#6b7280' }}
                onClick={(_, idx) => onFocusClick?.(pieData[idx].name)}
                style={{ cursor: 'pointer' }}
              >
                {pieData.map((entry) => {
                  const isDimmed = hasFocus && focused !== entry.name;
                  return (
                    <Cell key={entry.name} fill={entry.fill} fillOpacity={isDimmed ? 0.15 : 1} />
                  );
                })}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                labelStyle={{ color: '#f3f4f6' }}
                formatter={((value: number, name: string) => [`${value} blocks`, name]) as any}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Feature bars */}
        <div>
          <h3 className="text-sm font-medium text-gray-300 mb-4">Feature Flags</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={featureData}
              layout="vertical"
              margin={{ left: 20, right: 40 }}
              onClick={(state) => {
                if (state?.activeLabel) {
                  const match = featureData.find((f) => f.name === state.activeLabel);
                  if (match) onFocusClick?.(match.rawName);
                }
              }}
              style={{ cursor: 'pointer' }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={100} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px' }}
                formatter={((value: number, _name: string, props: any) => [`${value} (${props.payload.pct}%)`, 'Count']) as any}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {featureData.map((entry) => {
                  const isDimmed = hasFocus && focused !== entry.rawName;
                  return <Cell key={entry.rawName} fill="#6366f1" fillOpacity={isDimmed ? 0.15 : 1} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
