import { useLeaderboard } from '../lib/hooks';
import { useFilterOptional } from '../lib/FilterContext';
import { Skeleton } from './charts';
import { getStrategyColor } from '../lib/colors';

export default function Leaderboard() {
  const { data, error, isLoading } = useLeaderboard();
  const filter = useFilterOptional();

  const focused = filter?.focusedStrategy ?? null;
  const onFocusClick = filter
    ? (name: string) => { filter.guardClick(); filter.toggleFocus('strategy', name); }
    : undefined;

  if (error) return <div className="text-red-400 p-4">Error: {error.message}</div>;
  if (isLoading) return <Skeleton variant="table" />;
  if (!data) return null;

  const maxAccuracy = Math.max(...data.map((d) => d.accuracy));
  const hasFocus = focused != null;

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Strategy Leaderboard</h2>
          <p className="text-sm text-gray-400 mt-1">All 8 memory strategies ranked by accuracy across 8 scenarios — click a row to focus</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-700">
              <th className="px-4 py-3 w-12">#</th>
              <th className="px-4 py-3">Strategy</th>
              <th className="px-4 py-3 w-48">Accuracy</th>
              <th className="px-4 py-3 text-right">Avg Input Tokens</th>
              <th className="px-4 py-3 text-right">Avg Overhead</th>
              <th className="px-4 py-3 text-right">Avg Latency</th>
              <th className="px-4 py-3 text-right">Total Cost</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const isFocused = focused === row.strategy;
              const isDimmed = hasFocus && !isFocused;

              return (
                <tr
                  key={row.strategy}
                  onClick={(e) => { e.stopPropagation(); onFocusClick?.(row.strategy); }}
                  className={`border-b border-gray-800 cursor-pointer transition-all duration-150 ${
                    isFocused
                      ? 'bg-gray-800 ring-1 ring-emerald-500/30'
                      : isDimmed
                        ? 'opacity-25 hover:opacity-50'
                        : 'hover:bg-gray-800/50'
                  }`}
                >
                  <td className="px-4 py-3 text-gray-500 font-mono">{row.rank}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: getStrategyColor(row.strategy) }} />
                      <span className="font-medium text-gray-100">{row.strategy}</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-gray-100 font-mono w-16">{(row.accuracy * 100).toFixed(0)}%</span>
                      <div className="flex-1 bg-gray-800 rounded-full h-2 max-w-24">
                        <div className="h-full rounded-full transition-all" style={{ width: `${(row.accuracy / maxAccuracy) * 100}%`, backgroundColor: getStrategyColor(row.strategy) }} />
                      </div>
                      <span className="text-gray-500 text-xs">{row.accuracyFraction}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">{row.avgInputTokens.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">{row.avgOverhead.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">{(row.avgLatency / 1000).toFixed(1)}s</td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">${row.totalCost.toFixed(4)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
