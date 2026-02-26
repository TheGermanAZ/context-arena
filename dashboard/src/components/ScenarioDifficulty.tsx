import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, LabelList } from 'recharts';
import { useScenarioDifficulty } from '../lib/hooks';
import { useFilterOptional } from '../lib/FilterContext';
import { Skeleton, ErrorCard } from './charts';
import type { ScenarioDifficultyEntry } from '../lib/types';

interface DifficultyTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: ScenarioDifficultyEntry }>;
}

function DifficultyTooltip({ active, payload }: DifficultyTooltipProps) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  if (!d) return null;
  return (
    <div style={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', padding: '12px' }}>
      <p style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 4 }}>{d.name}</p>
      <p style={{ color: '#d1d5db' }}>Accuracy: {d.accuracy}%</p>
      <p style={{ color: '#d1d5db' }}>{d.correct}/{d.total} strategies pass</p>
      {d.hardestStrategies.length > 0 && (
        <p style={{ color: '#ef4444', marginTop: 4 }}>Failed: {d.hardestStrategies.join(', ')}</p>
      )}
    </div>
  );
}

function getBarColor(accuracy: number): string {
  if (accuracy < 62.5) return '#ef4444';
  if (accuracy < 87.5) return '#f59e0b';
  return '#10b981';
}

export default function ScenarioDifficulty() {
  const { data, error, isLoading, refetch } = useScenarioDifficulty();
  const filter = useFilterOptional();

  const focused = filter?.focusedScenario ?? null;
  const onFocusClick = filter
    ? (name: string) => { filter.guardClick(); filter.toggleFocus('scenario', name); }
    : undefined;

  if (error) return <ErrorCard message={error.message} onRetry={() => refetch()} />;
  if (isLoading) return <Skeleton variant="chart" />;
  if (!data) return null;

  const hasFocus = focused != null;

  const chartData = data.scenarios.map((d) => ({
    ...d,
    label: `${d.correct}/${d.total} pass`,
  }));

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-6 shadow-lg shadow-black/20">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-gray-100">Scenario Difficulty</h2>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Scenarios ranked by how many strategies solve them — hardest first
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
          <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 12 }} width={160} />
          <Tooltip content={<DifficultyTooltip />} />
          <Bar dataKey="accuracy" radius={[0, 4, 4, 0]}>
            {chartData.map((entry) => {
              const isDimmed = hasFocus && focused !== entry.name;
              return (
                <Cell
                  key={entry.name}
                  fill={getBarColor(entry.accuracy)}
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
