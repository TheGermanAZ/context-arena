import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useCodeAnalysis } from '../lib/hooks';
import { useFilterOptional } from '../lib/FilterContext';
import { Skeleton, ErrorCard } from './charts';

const CATEGORY_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
  '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1',
];

interface FeatureData {
  name: string;
  rawName: string;
  count: number;
  pct: number;
}

interface ActiveLabelState {
  activeLabel?: string | number;
}

export default function CodeStrategies() {
  const { data, error, isLoading, refetch } = useCodeAnalysis();
  const filter = useFilterOptional();

  const focused = filter?.focusedCategory ?? null;
  const onFocusClick = filter
    ? (name: string) => { filter.guardClick(); filter.toggleFocus('category', name); }
    : undefined;

  if (error) return <ErrorCard message={error.message} onRetry={() => refetch()} />;
  if (isLoading) return <Skeleton variant="chart" />;
  if (!data) return null;

  const hasFocus = focused != null;

  const pieData = data.categories.map((c, i) => ({
    ...c,
    fill: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));

  const featureData: FeatureData[] = data.features.map((f) => ({
    name: f.name.replace('has', '').replace(/([A-Z])/g, ' $1').trim(),
    rawName: f.name,
    count: f.count,
    pct: f.pct,
  }));

  return (
    <div className="strategy-reveal bg-gray-900 rounded-lg border border-gray-700 p-6 shadow-lg shadow-black/20" style={{ animationDelay: '120ms' }}>
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
          <ResponsiveContainer width="100%" height={360}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="count"
                nameKey="name"
                cx="50%"
                cy="45%"
                innerRadius={55}
                outerRadius={95}
                paddingAngle={2}
                onClick={(_, idx) => {
                  const hit = pieData[idx];
                  if (hit) onFocusClick?.(hit.name);
                }}
                style={{ cursor: 'pointer' }}
                isAnimationActive
                animationBegin={100}
                animationDuration={700}
                animationEasing="ease-out"
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
                itemStyle={{ color: '#d1d5db' }}
                formatter={(value: number | string | undefined, name: string | number | undefined) => [
                  `${value ?? 0} blocks`,
                  String(name ?? ''),
                ]}
              />
              <Legend
                verticalAlign="bottom"
                iconType="circle"
                iconSize={8}
                formatter={(value: string) => {
                  const entry = pieData.find((d) => d.name === value);
                  return `${value} (${entry?.pct ?? 0}%)`;
                }}
                wrapperStyle={{ color: '#9ca3af', fontSize: 12, paddingTop: 12 }}
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
                const label = (state as ActiveLabelState | undefined)?.activeLabel;
                if (typeof label === 'string') {
                  const match = featureData.find((f) => f.name === label);
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
                labelStyle={{ color: '#f3f4f6' }}
                itemStyle={{ color: '#d1d5db' }}
                formatter={(value: number | string | undefined, _name: string | number | undefined, item: { payload?: FeatureData }) => [
                  `${value ?? 0} (${item.payload?.pct ?? 0}%)`,
                  'Count',
                ]}
              />
              <Bar
                dataKey="count"
                radius={[0, 4, 4, 0]}
                isAnimationActive
                animationBegin={260}
                animationDuration={750}
                animationEasing="ease-out"
              >
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
