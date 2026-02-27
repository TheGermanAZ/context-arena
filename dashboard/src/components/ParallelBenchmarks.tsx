import { useParallelBenchmarks } from '../lib/hooks';
import { useFilterOptional } from '../lib/FilterContext';
import { Skeleton, ErrorCard } from './charts';

const TYPE_BADGE: Record<string, { label: string; classes: string }> = {
  industry: { label: 'Industry', classes: 'bg-blue-900/50 text-blue-400' },
  internal: { label: 'Internal', classes: 'bg-purple-900/50 text-purple-400' },
};

export default function ParallelBenchmarks() {
  const { data, error, isLoading, refetch } = useParallelBenchmarks();
  const filter = useFilterOptional();

  const focused = filter?.focusedStrategy ?? null;
  const onFocusClick = filter
    ? (name: string) => { filter.guardClick(); filter.toggleFocus('strategy', name); }
    : undefined;

  if (error) return <ErrorCard message={error.message} onRetry={() => refetch()} />;
  if (isLoading) return <Skeleton variant="table" />;
  if (!data) return null;

  const hasFocus = focused != null;

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden shadow-lg shadow-black/20">
      <div className="px-6 py-4 border-b border-gray-700">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">Parallel Benchmark Expansion</h2>
            <p className="text-sm text-gray-400 mt-1">
              {data.summary.totalTracks} tracks — {data.summary.industryCount} industry, {data.summary.internalCount} internal results
            </p>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-700">
              <th className="px-4 py-3">Track</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Strategy</th>
              <th className="px-4 py-3">Score</th>
              <th className="px-4 py-3 text-right">Latency</th>
              <th className="px-4 py-3 text-right">Cost</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, idx) => {
              const isFocused = focused === row.strategy;
              const isDimmed = hasFocus && !isFocused;
              const badge = TYPE_BADGE[row.type] ?? TYPE_BADGE.internal;
              const isNewTrack = idx === 0 || row.track !== data.rows[idx - 1].track;

              return (
                <tr
                  key={`${row.track}-${row.strategy}`}
                  onClick={(e) => { e.stopPropagation(); onFocusClick?.(row.strategy); }}
                  className={`strategy-reveal border-b border-gray-800 transition-all duration-150 ${
                    onFocusClick ? 'cursor-pointer' : ''
                  } ${
                    isNewTrack ? 'border-t border-gray-700' : ''
                  } ${
                    isFocused
                      ? 'bg-gray-800 ring-1 ring-emerald-500/30'
                      : isDimmed
                        ? 'opacity-25 hover:opacity-50'
                        : 'hover:bg-gray-800/50'
                  }`}
                  style={{ animationDelay: `${80 + idx * 50}ms` }}
                >
                  <td className="px-4 py-3 font-medium text-gray-200">
                    {isNewTrack ? row.track : ''}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${badge.classes}`}>
                      {badge.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-100">{row.strategy}</td>
                  <td className="px-4 py-3">
                    <span className={`font-mono ${row.passed ? 'text-emerald-400' : 'text-red-400'}`}>
                      {row.score}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">
                    {row.avgLatencyMs > 0 ? `${(row.avgLatencyMs / 1000).toFixed(1)}s` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-gray-300">
                    {row.costUsd > 0 ? `$${row.costUsd.toFixed(4)}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
