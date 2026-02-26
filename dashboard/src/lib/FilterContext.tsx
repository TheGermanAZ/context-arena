import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from 'react';

type FocusDomain = 'strategy' | 'type' | 'scenario' | 'category';

interface FilterState {
  focusedStrategy: string | null;
  focusedType: string | null;
  focusedScenario: string | null;
  focusedCategory: string | null;
  panels: string[];
  scenario: string | null;
}

interface FilterActions {
  toggleFocus: (domain: FocusDomain, name: string) => void;
  clearFocus: (domain: FocusDomain) => void;
  clearAllFocus: () => void;
  setPanels: (panels: string[]) => void;
  setScenario: (scenario: string | null) => void;
  guardClick: () => void;
  shouldClearOnBackground: () => boolean;
}

const FilterContext = createContext<(FilterState & FilterActions) | null>(null);

const DEFAULT_PANELS = ['leaderboard', 'token-cost', 'retention-by-type'];

export function FilterProvider({ children }: { children: ReactNode }) {
  const [focusedStrategy, setFocusedStrategy] = useState<string | null>(null);
  const [focusedType, setFocusedType] = useState<string | null>(null);
  const [focusedScenario, setFocusedScenario] = useState<string | null>(null);
  const [focusedCategory, setFocusedCategory] = useState<string | null>(null);
  const [panels, setPanels] = useState<string[]>(DEFAULT_PANELS);
  const [scenario, setScenario] = useState<string | null>(null);

  const justFocused = useRef(false);

  const setterFor = (domain: FocusDomain) => {
    switch (domain) {
      case 'strategy': return setFocusedStrategy;
      case 'type': return setFocusedType;
      case 'scenario': return setFocusedScenario;
      case 'category': return setFocusedCategory;
    }
  };

  const toggleFocus = useCallback((domain: FocusDomain, name: string) => {
    justFocused.current = true;
    setterFor(domain)((prev) => (prev === name ? null : name));
  }, []);

  const clearFocus = useCallback((domain: FocusDomain) => {
    setterFor(domain)(null);
  }, []);

  const clearAllFocus = useCallback(() => {
    setFocusedStrategy(null);
    setFocusedType(null);
    setFocusedScenario(null);
    setFocusedCategory(null);
  }, []);

  const guardClick = useCallback(() => {
    justFocused.current = true;
  }, []);

  const shouldClearOnBackground = useCallback(() => {
    if (justFocused.current) {
      justFocused.current = false;
      return false;
    }
    return true;
  }, []);

  return (
    <FilterContext.Provider
      value={{
        focusedStrategy, focusedType, focusedScenario, focusedCategory,
        panels, scenario,
        toggleFocus, clearFocus, clearAllFocus,
        setPanels, setScenario,
        guardClick, shouldClearOnBackground,
      }}
    >
      {children}
    </FilterContext.Provider>
  );
}

export function useFilter() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilter must be used within FilterProvider');
  return ctx;
}

/** Safe version that returns null outside FilterProvider (for demo route) */
export function useFilterOptional() {
  return useContext(FilterContext);
}

export type { FocusDomain };
