import { useScenarioHeatmap } from '../lib/hooks';
import { useFilterOptional } from '../lib/FilterContext';
import { Skeleton, ErrorCard } from './charts';
import { getStrategyColor, getScenarioColor } from '../lib/colors';

export default function ScenarioHeatmap() {
  const { data, error, isLoading, refetch } = useScenarioHeatmap();
  const filter = useFilterOptional();

  const focusedStrategy = filter?.focusedStrategy ?? null;
  const focusedScenario = filter?.focusedScenario ?? null;

  const onStrategyClick = filter
    ? (name: string) => { filter.guardClick(); filter.toggleFocus('strategy', name); }
    : undefined;

  const onScenarioClick = filter
    ? (name: string) => { filter.guardClick(); filter.toggleFocus('scenario', name); }
    : undefined;

  if (error) return <ErrorCard message={error.message} onRetry={() => refetch()} />;
  if (isLoading) return <Skeleton variant="table" />;
  if (!data) return null;

  const hasStrategyFocus = focusedStrategy != null;
  const hasScenarioFocus = focusedScenario != null;

  const cellMap = new Map<string, typeof data.cells[number]>();
  for (const cell of data.cells) {
    cellMap.set(`${cell.strategy}::${cell.scenario}`, cell);
  }

  const strategySummaryMap = new Map(
    data.strategySummaries.map((s) => [s.strategy, s]),
  );
  const scenarioSummaryMap = new Map(
    data.scenarioSummaries.map((s) => [s.scenario, s]),
  );

  return (
    <div className="bg-gray-900 rounded-lg border border-gray-700 overflow-hidden shadow-lg shadow-black/20">
      <div className="px-6 py-4 border-b border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100">Scenario Heatmap</h2>
        <p className="text-sm text-gray-400 mt-1">
          Pass/fail matrix across all strategies and scenarios — click a row or column to focus
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 border-b border-gray-700">
              {/* Corner cell */}
              <th className="px-4 py-3" />

              {/* Scenario column headers */}
              {data.scenarios.map((scenario) => {
                const isDimmed = hasScenarioFocus && focusedScenario !== scenario;
                return (
                  <th
                    key={scenario}
                    className={`px-2 py-3 text-center cursor-pointer transition-all duration-150 ${
                      isDimmed ? 'opacity-25 hover:opacity-50' : 'hover:bg-gray-800/50'
                    }`}
                    onClick={(e) => { e.stopPropagation(); onScenarioClick?.(scenario); }}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: getScenarioColor(scenario) }}
                      />
                      <span className="block text-xs font-medium text-gray-300 max-w-[5rem] text-center leading-tight">
                        {scenario}
                      </span>
                    </div>
                  </th>
                );
              })}

              {/* Summary column header */}
              <th className="px-3 py-3 text-center text-xs font-medium text-gray-500">Total</th>
            </tr>
          </thead>

          <tbody>
            {data.strategies.map((strategy) => {
              const isStrategyFocused = focusedStrategy === strategy;
              const isStrategyDimmed = hasStrategyFocus && !isStrategyFocused;
              const summary = strategySummaryMap.get(strategy);

              return (
                <tr
                  key={strategy}
                  className={`border-b border-gray-800 cursor-pointer transition-all duration-150 ${
                    isStrategyFocused
                      ? 'bg-gray-800 ring-1 ring-emerald-500/30'
                      : isStrategyDimmed
                        ? 'opacity-25 hover:opacity-50'
                        : 'hover:bg-gray-800/50'
                  }`}
                  onClick={(e) => { e.stopPropagation(); onStrategyClick?.(strategy); }}
                >
                  {/* Row header: strategy name with color dot */}
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: getStrategyColor(strategy) }}
                      />
                      <span className="font-medium text-gray-100 whitespace-nowrap">{strategy}</span>
                    </span>
                  </td>

                  {/* Data cells */}
                  {data.scenarios.map((scenario) => {
                    const cell = cellMap.get(`${strategy}::${scenario}`);
                    const isScenarioDimmed = hasScenarioFocus && focusedScenario !== scenario;

                    if (!cell) {
                      return (
                        <td
                          key={scenario}
                          className={`px-2 py-3 text-center transition-all duration-150 ${
                            isScenarioDimmed ? 'opacity-25' : ''
                          }`}
                        >
                          <span className="inline-block w-8 h-8 leading-8 rounded bg-gray-800 text-gray-600 text-xs">
                            —
                          </span>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={scenario}
                        className={`px-2 py-3 text-center transition-all duration-150 ${
                          isScenarioDimmed ? 'opacity-25' : ''
                        }`}
                      >
                        <span
                          className={`inline-block w-8 h-8 leading-8 rounded text-xs font-medium ${
                            cell.correct
                              ? 'bg-emerald-500/30 text-emerald-400'
                              : 'bg-red-500/30 text-red-400'
                          }`}
                        >
                          {cell.correct ? '\u2713' : '\u2717'}
                        </span>
                      </td>
                    );
                  })}

                  {/* Summary column */}
                  <td className="px-3 py-3 text-center font-mono text-xs text-gray-400">
                    {summary ? `${summary.correct}/${summary.total}` : '—'}
                  </td>
                </tr>
              );
            })}

            {/* Summary row */}
            <tr className="border-t border-gray-700 text-gray-500">
              <td className="px-4 py-3 text-xs font-medium text-gray-500">Total</td>
              {data.scenarios.map((scenario) => {
                const summary = scenarioSummaryMap.get(scenario);
                const isScenarioDimmed = hasScenarioFocus && focusedScenario !== scenario;
                return (
                  <td
                    key={scenario}
                    className={`px-2 py-3 text-center font-mono text-xs transition-all duration-150 ${
                      isScenarioDimmed ? 'opacity-25' : ''
                    }`}
                  >
                    {summary ? `${summary.correct}/${summary.total}` : '—'}
                  </td>
                );
              })}
              <td className="px-3 py-3" />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
