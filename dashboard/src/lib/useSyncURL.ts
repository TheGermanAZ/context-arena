import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useFilter, type FocusDomain } from './FilterContext';

/**
 * Syncs FilterContext state with URL search params.
 * Call once at top of Dashboard page.
 *
 * URL format:
 *   /dashboard?panels=leaderboard,token-cost&focus=strategy:RLM(8)&scenario=Early+Fact+Recall
 */
export function useSyncURL() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = useFilter();

  // On mount: read URL → set filter state
  useEffect(() => {
    const panelsParam = searchParams.get('panels');
    if (panelsParam) {
      filter.setPanels(panelsParam.split(','));
    }

    const focusParam = searchParams.get('focus');
    if (focusParam) {
      const colonIdx = focusParam.indexOf(':');
      if (colonIdx > 0) {
        const domain = focusParam.slice(0, colonIdx) as FocusDomain;
        const name = focusParam.slice(colonIdx + 1);
        if (domain && name) {
          filter.toggleFocus(domain, name);
        }
      }
    }

    const scenarioParam = searchParams.get('scenario');
    if (scenarioParam) {
      filter.setScenario(scenarioParam);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // On filter change: write state → URL
  useEffect(() => {
    const params = new URLSearchParams();

    if (filter.panels.length > 0) {
      params.set('panels', filter.panels.join(','));
    }

    const focus = filter.focusedStrategy
      ? `strategy:${filter.focusedStrategy}`
      : filter.focusedType
        ? `type:${filter.focusedType}`
        : filter.focusedScenario
          ? `scenario:${filter.focusedScenario}`
          : filter.focusedCategory
            ? `category:${filter.focusedCategory}`
            : null;

    if (focus) params.set('focus', focus);
    if (filter.scenario) params.set('scenario', filter.scenario);

    setSearchParams(params, { replace: true });
  }, [
    filter.panels, filter.focusedStrategy, filter.focusedType,
    filter.focusedScenario, filter.focusedCategory, filter.scenario,
    setSearchParams,
  ]);
}
