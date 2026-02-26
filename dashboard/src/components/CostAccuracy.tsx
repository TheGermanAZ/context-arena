import { ComposedChart, Scatter, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Label } from 'recharts';
import { useCostAccuracy } from '../lib/hooks';
import { useFilterOptional } from '../lib/FilterContext';
import { Skeleton, ErrorCard } from './charts';
import { getStrategyColor } from '../lib/colors';
import type { CostAccuracyPoint } from '../lib/types';

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: CostAccuracyPoint;
  focused: string | null;
  hasFocus: boolean;
}

interface ActivePayloadState {
  activePayload?: Array<{ payload?: CostAccuracyPoint }>;
}

function CustomDot(props: DotProps) {
  const { cx, cy, payload, focused, hasFocus } = props;
  if (cx == null || cy == null || !payload) return null;
  const isDimmed = hasFocus && focused !== payload.strategy;
  return (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={8}
        fill={getStrategyColor(payload.strategy)}
        fillOpacity={isDimmed ? 0.15 : 1}
        style={{ cursor: 'pointer' }}
      />
      <text
        x={cx}
        y={cy - 12}
        textAnchor="middle"
        fill={isDimmed ? '#374151' : '#9ca3af'}
        fontSize={11}
      >
        {payload.strategy}
      </text>
    </g>
  );
}

export default function CostAccuracy() {
  const { data, error, isLoading, refetch } = useCostAccuracy();
  const filter = useFilterOptional();

  const focused = filter?.focusedStrategy ?? null;
  const onFocusClick = filter
    ? (name: string) => { filter.guardClick(); filter.toggleFocus('strategy', name); }
    : undefined;

  if (error) return <ErrorCard message={error.message} onRetry={() => refetch()} />;
  if (isLoading) return <Skeleton variant="chart" />;
  if (!data) return null;

  const hasFocus = focused != null;

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 p-6 shadow-lg shadow-black/20">
      <div className="mb-1">
        <h2 className="text-lg font-semibold text-gray-100">Cost vs Accuracy</h2>
      </div>
      <p className="text-sm text-gray-400 mb-6">
        Click a point to focus — Pareto frontier shows optimal cost-accuracy tradeoffs
      </p>
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart
          margin={{ top: 20, right: 30, bottom: 20, left: 20 }}
          onClick={(state) => {
            const payload = (state as ActivePayloadState | undefined)?.activePayload?.[0]?.payload;
            if (payload?.strategy) onFocusClick?.(payload.strategy);
          }}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="totalCost"
            type="number"
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            tickFormatter={(v: number) => `$${v.toFixed(3)}`}
          >
            <Label value="Total Cost (USD)" fill="#9ca3af" position="insideBottom" offset={-10} />
          </XAxis>
          <YAxis
            dataKey="accuracy"
            type="number"
            domain={[0, 100]}
            tick={{ fill: '#9ca3af', fontSize: 12 }}
            tickFormatter={(v: number) => `${v}%`}
          >
            <Label value="Accuracy (%)" fill="#9ca3af" angle={-90} position="insideLeft" offset={0} style={{ textAnchor: 'middle' }} />
          </YAxis>
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0]?.payload as CostAccuracyPoint | undefined;
              if (!point) return null;
              return (
                <div style={{ backgroundColor: '#1f2937', border: '1px solid #374151', borderRadius: '8px', padding: '10px 14px' }}>
                  <p style={{ color: '#f3f4f6', fontWeight: 600, marginBottom: 4 }}>{point.strategy}</p>
                  <p style={{ color: '#d1d5db', fontSize: 12 }}>Accuracy: {point.accuracy.toFixed(1)}%</p>
                  <p style={{ color: '#d1d5db', fontSize: 12 }}>Cost: ${point.totalCost.toFixed(4)}</p>
                  <p style={{ color: '#d1d5db', fontSize: 12 }}>Avg Tokens: {point.avgInputTokens.toLocaleString()}</p>
                </div>
              );
            }}
          />
          <Scatter
            name="Strategies"
            data={data.points}
            shape={<CustomDot focused={focused} hasFocus={hasFocus} />}
          >
            {data.points.map((entry) => (
              <Cell
                key={entry.strategy}
                fill={getStrategyColor(entry.strategy)}
              />
            ))}
          </Scatter>
          <Line
            data={data.paretoFrontier}
            dataKey="accuracy"
            type="stepAfter"
            stroke="#f59e0b"
            strokeDasharray="6 3"
            strokeWidth={2}
            dot={false}
            name="Pareto Frontier"
            legendType="none"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
