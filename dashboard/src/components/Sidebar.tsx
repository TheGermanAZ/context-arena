import { useFilterOptional } from '../lib/FilterContext';

const PANEL_GROUPS = [
  {
    label: 'Strategy Comparison',
    panels: [
      { id: 'leaderboard', label: 'Leaderboard' },
      { id: 'token-cost', label: 'Token Cost' },
    ],
  },
  {
    label: 'RLM Deep Dive',
    badge: { text: 'RLM', color: 'emerald' as const },
    panels: [
      { id: 'retention-by-type', label: 'Retention by Type' },
      { id: 'retention-curve', label: 'Retention Curve' },
      { id: 'depth-comparison', label: 'Depth 1 vs 2' },
    ],
  },
  {
    label: 'Code Generation',
    badge: { text: 'RLLM', color: 'red' as const },
    panels: [
      { id: 'rllm-comparison', label: 'RLLM vs Hand-rolled' },
      { id: 'code-strategies', label: 'Code Strategies' },
    ],
  },
];

const PRESETS: Record<string, string[]> = {
  'Overview': ['leaderboard', 'token-cost', 'retention-by-type'],
  'RLM Deep Dive': ['retention-by-type', 'retention-curve', 'depth-comparison'],
  'Code Generation': ['rllm-comparison', 'code-strategies'],
};

interface SidebarProps {
  expanded: boolean;
  onToggle: () => void;
}

export default function Sidebar({ expanded, onToggle }: SidebarProps) {
  const filter = useFilterOptional();
  const panels = filter?.panels ?? [];
  const setPanels = filter?.setPanels;

  const togglePanel = (id: string) => {
    if (!setPanels) return;
    if (panels.includes(id)) {
      setPanels(panels.filter((p) => p !== id));
    } else if (panels.length < 4) {
      setPanels([...panels, id]);
    }
  };

  const applyPreset = (presetName: string) => {
    setPanels?.(PRESETS[presetName]);
  };

  const badgeClasses: Record<string, string> = {
    emerald: 'bg-emerald-900/50 text-emerald-400',
    red: 'bg-red-900/50 text-red-400',
  };

  // Check if current panels match a preset
  const activePreset = Object.entries(PRESETS).find(
    ([, ids]) => ids.length === panels.length && ids.every((id) => panels.includes(id))
  )?.[0] ?? null;

  return (
    <>
      {/* Collapse toggle — always visible */}
      <button
        onClick={onToggle}
        className="fixed top-4 left-4 z-50 p-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-gray-100 hover:bg-gray-700 transition-colors"
        aria-label={expanded ? 'Collapse sidebar' : 'Expand sidebar'}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          {expanded ? (
            <>
              <path d="M12 4L7 9L12 14" />
              <line x1="3" y1="3" x2="3" y2="15" />
            </>
          ) : (
            <>
              <line x1="3" y1="4" x2="15" y2="4" />
              <line x1="3" y1="9" x2="15" y2="9" />
              <line x1="3" y1="14" x2="15" y2="14" />
            </>
          )}
        </svg>
      </button>

      {/* Sidebar panel */}
      <aside
        className={`fixed top-0 left-0 h-full bg-gray-900 border-r border-gray-800 z-40 transition-all duration-200 ease-in-out flex flex-col ${
          expanded ? 'w-56' : 'w-0 overflow-hidden'
        }`}
      >
        <div className="pt-14 px-4 pb-4 flex-1 overflow-y-auto">
          {/* Presets */}
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Presets</h2>
          <div className="flex flex-col gap-1 mb-5">
            {Object.keys(PRESETS).map((name) => (
              <button
                key={name}
                onClick={() => applyPreset(name)}
                className={`w-full text-left px-3 py-1.5 rounded text-sm transition-colors ${
                  activePreset === name
                    ? 'bg-gray-800 text-emerald-400'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                }`}
              >
                {name}
              </button>
            ))}
          </div>

          {/* Panel checkboxes */}
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">Panels</h2>
          {PANEL_GROUPS.map((group) => (
            <div key={group.label} className="mb-4">
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                  {group.label}
                </span>
                {group.badge && (
                  <span className={`text-[9px] font-semibold uppercase px-1.5 py-px rounded ${badgeClasses[group.badge.color]}`}>
                    {group.badge.text}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-0.5">
                {group.panels.map(({ id, label }) => {
                  const isActive = panels.includes(id);
                  const isDisabled = !isActive && panels.length >= 4;
                  return (
                    <label
                      key={id}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded text-sm cursor-pointer transition-colors ${
                        isActive
                          ? 'text-gray-100 bg-gray-800/50'
                          : isDisabled
                            ? 'text-gray-600 cursor-not-allowed'
                            : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/30'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isActive}
                        disabled={isDisabled}
                        onChange={() => togglePanel(id)}
                        className="accent-emerald-500 w-3.5 h-3.5"
                      />
                      {label}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          {panels.length >= 4 && (
            <p className="text-[10px] text-gray-600 px-1">Max 4 panels</p>
          )}
        </div>
      </aside>
    </>
  );
}

export { PANEL_GROUPS };
