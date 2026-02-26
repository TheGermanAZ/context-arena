// @ts-nocheck — Legacy file kept for reference. Replaced by RouterProvider + pages/.
import { useRef, useState } from 'react';
import Sidebar from './components/Sidebar';
import Leaderboard from './components/Leaderboard';
import TokenCost from './components/TokenCost';
import RetentionByType from './components/RetentionByType';
import RetentionCurve from './components/RetentionCurve';
import DepthComparison from './components/DepthComparison';
import RllmComparison from './components/RllmComparison';
import CodeStrategies from './components/CodeStrategies';

// Focus domains: which views share focus state
// 0=Leaderboard, 1=TokenCost  → focusedStrategy
// 2=RetentionByType, 3=RetentionCurve  → focusedType
// 4=DepthComparison, 5=RllmComparison  → focusedScenario
// 6=CodeStrategies  → focusedCategory (standalone)
type FocusDomain = 'strategy' | 'type' | 'scenario' | 'category';

const VIEW_DOMAIN: FocusDomain[] = [
  'strategy', 'strategy',
  'type', 'type',
  'scenario', 'scenario',
  'category',
];

const VIEWS = [
  Leaderboard,
  TokenCost,
  RetentionByType,
  RetentionCurve,
  DepthComparison,
  RllmComparison,
  CodeStrategies,
];

export default function App() {
  const [activeTab, setActiveTab] = useState(0);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  // One focus value per domain
  const [focusedStrategy, setFocusedStrategy] = useState<string | null>(null);
  const [focusedType, setFocusedType] = useState<string | null>(null);
  const [focusedScenario, setFocusedScenario] = useState<string | null>(null);
  const [focusedCategory, setFocusedCategory] = useState<string | null>(null);

  // Guard: skip the next background clear if a focus click just fired
  const justFocused = useRef(false);

  const toggle = (setter: React.Dispatch<React.SetStateAction<string | null>>) =>
    (name: string) => {
      justFocused.current = true;
      setter((prev) => (prev === name ? null : name));
    };

  const ActiveView = VIEWS[activeTab];
  const domain = VIEW_DOMAIN[activeTab];

  // Clear focus when switching to a different domain
  const handleTabChange = (idx: number) => {
    const newDomain = VIEW_DOMAIN[idx];
    if (newDomain !== VIEW_DOMAIN[activeTab]) {
      if (domain === 'strategy') setFocusedStrategy(null);
      if (domain === 'type') setFocusedType(null);
      if (domain === 'scenario') setFocusedScenario(null);
      if (domain === 'category') setFocusedCategory(null);
    }
    setActiveTab(idx);
  };

  const clearFocus = () => {
    if (justFocused.current) {
      justFocused.current = false;
      return;
    }
    if (domain === 'strategy') setFocusedStrategy(null);
    if (domain === 'type') setFocusedType(null);
    if (domain === 'scenario') setFocusedScenario(null);
    if (domain === 'category') setFocusedCategory(null);
  };

  // Build focus props per domain
  const focusProps = (() => {
    switch (domain) {
      case 'strategy':
        return { focused: focusedStrategy, onFocusClick: toggle(setFocusedStrategy) };
      case 'type':
        return { focused: focusedType, onFocusClick: toggle(setFocusedType) };
      case 'scenario':
        return { focused: focusedScenario, onFocusClick: toggle(setFocusedScenario) };
      case 'category':
        return { focused: focusedCategory, onFocusClick: toggle(setFocusedCategory) };
    }
  })();

  return (
    <div className="bg-gray-950 text-gray-100 min-h-screen" onClick={clearFocus}>
      <Sidebar
        active={activeTab}
        onChange={handleTabChange}
        expanded={sidebarExpanded}
        onToggle={() => setSidebarExpanded((e) => !e)}
      />
      <div className={`transition-all duration-200 ease-in-out ${sidebarExpanded ? 'ml-56' : 'ml-0'}`}>
        <div className="max-w-7xl mx-auto px-6 py-6">
          <header className="mb-6 flex items-center gap-3">
            {!sidebarExpanded && <div className="w-8" />}
            <div>
              <h1 className="text-2xl font-bold text-gray-100">Context Arena Dashboard</h1>
              <p className="text-sm text-gray-400 mt-1">
                Visualizing memory strategy benchmarks across 8 scenarios
              </p>
            </div>
          </header>
          <ActiveView {...focusProps} />
        </div>
      </div>
    </div>
  );
}
