import { useEffect, useState } from 'react';

interface FullContextPathProps {
  d: string;
  animate: boolean;
  reduceMotion: boolean;
  markerId: string;
  timing?: string;
}

const ANIMATION_MS = 5200;
const MESSAGE_ROWS = [
  { y: 104, width: 228, label: 'Turn 1' },
  { y: 145, width: 236, label: 'Turn 2' },
  { y: 186, width: 244, label: 'Turn 3' },
  { y: 227, width: 252, label: 'Turn 4' },
  { y: 268, width: 260, label: 'Turn 5' },
  { y: 309, width: 268, label: 'Turn 6' },
];

function FullContextPath({
  d,
  animate,
  reduceMotion,
  markerId,
  timing = '0;0.08;0.24;1',
}: FullContextPathProps) {
  if (!animate || reduceMotion) {
    return <path className="strategy-flow-line strategy-flow-line-full" d={d} markerEnd={`url(#${markerId})`} />;
  }

  return (
    <path
      className="strategy-flow-line strategy-flow-line-full strategy-flow-line-spawn"
      d={d}
      markerEnd={`url(#${markerId})`}
      pathLength={100}
    >
      <animate
        attributeName="stroke-dashoffset"
        values="100;100;0;0"
        keyTimes={timing}
        dur="5.2s"
        repeatCount="1"
      />
      <animate
        attributeName="opacity"
        values="0;0;1;1"
        keyTimes={timing}
        dur="5.2s"
        repeatCount="1"
      />
    </path>
  );
}

export default function FullContextFlowAnimation() {
  const [reduceMotion, setReduceMotion] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasPlayed, setHasPlayed] = useState(false);
  const [playKey, setPlayKey] = useState(0);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setReduceMotion(media.matches);
    handleChange();
    media.addEventListener('change', handleChange);
    return () => media.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setTimeout(() => setIsPlaying(false), ANIMATION_MS + 120);
    return () => window.clearTimeout(timer);
  }, [isPlaying, playKey]);

  const onPlay = () => {
    if (reduceMotion) return;
    setHasPlayed(true);
    setPlayKey((value) => value + 1);
    setIsPlaying(true);
  };

  const markerId = `full-context-arrow-head-${playKey}`;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 shadow-lg shadow-black/20">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-100">Full Context Execution</h3>
          <p className="text-sm text-gray-400 mt-1">
            Every response re-sends the full conversation, maximizing recall while growing token cost each turn.
          </p>
        </div>
        <button
          type="button"
          onClick={onPlay}
          disabled={isPlaying || reduceMotion}
          className={`shrink-0 inline-flex items-center rounded-md px-3 py-1.5 text-xs font-semibold border transition-colors ${
            isPlaying
              ? 'bg-blue-500/20 border-blue-400/40 text-blue-200 cursor-wait'
              : reduceMotion
                ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700 hover:border-gray-500'
          }`}
          aria-label="Play Full Context animation"
          title={reduceMotion ? 'Animation disabled because Reduced Motion is enabled' : 'Play animation'}
        >
          {isPlaying ? 'Playing...' : hasPlayed ? 'Replay' : 'Play'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-700 bg-[#d9e4f5]">
        <svg
          key={`full-context-${playKey}`}
          className="w-full h-auto strategy-flow-diagram"
          viewBox="0 0 980 420"
          role="img"
          aria-label="Full Context strategy diagram where all prior turns are sent to the model each step"
        >
          <defs>
            <marker
              id={markerId}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#334155" />
            </marker>
          </defs>

          <g className={isPlaying ? 'strategy-node-pop pop-delay-1' : undefined}>
            <rect x="38" y="52" width="308" height="322" rx="10" fill="#bfd2ea" stroke="#334155" strokeWidth="2" />
            <text x="192" y="82" textAnchor="middle" fontSize="15" fontWeight="700" fill="#111827">Conversation History</text>
          </g>

          {MESSAGE_ROWS.map((row, index) => (
            <g key={row.label}>
              <rect
                x="58"
                y={row.y}
                width={row.width}
                height="28"
                rx="7"
                fill="#e2ebf9"
                stroke="#334155"
                strokeWidth="1.5"
                className={isPlaying ? 'strategy-node-glow-full' : undefined}
                style={isPlaying ? { animationDelay: `${0.14 + index * 0.2}s` } : undefined}
              />
              <text x="78" y={row.y + 18} fontSize="11" fill="#1f2937">{row.label}</text>
            </g>
          ))}

          <rect x="56" y="356" width="272" height="14" rx="5" fill="#9bb4d7" />
          <rect x="56" y="356" width="228" height="14" rx="5" fill="#547bb0" opacity="0.58">
            {!reduceMotion && isPlaying && (
              <animate
                attributeName="width"
                values="82;82;228;228"
                keyTimes="0;0.24;0.58;1"
                dur="5.2s"
                repeatCount="1"
              />
            )}
          </rect>
          <text x="192" y="351" textAnchor="middle" fontSize="10" fill="#1f2937">Context payload grows every turn</text>

          <g className={isPlaying ? 'strategy-node-pop pop-delay-2' : undefined}>
            <rect
              x="438"
              y="145"
              width="170"
              height="122"
              rx="10"
              fill="#bee5be"
              stroke="#334155"
              strokeWidth="2"
              className={isPlaying ? 'strategy-node-glow-full' : undefined}
              style={isPlaying ? { animationDelay: '1.2s' } : undefined}
            />
            <text x="523" y="190" textAnchor="middle" fontSize="18" fill="#111827">Language</text>
            <text x="523" y="214" textAnchor="middle" fontSize="18" fill="#111827">Model</text>
            <text x="523" y="238" textAnchor="middle" fontSize="11" fill="#334155">entire thread each turn</text>
          </g>

          <g className={isPlaying ? 'strategy-node-pop pop-delay-3' : undefined}>
            <rect
              x="760"
              y="176"
              width="176"
              height="54"
              rx="8"
              fill="#efd2df"
              stroke="#334155"
              strokeWidth="2"
              className={isPlaying ? 'strategy-node-glow-full' : undefined}
              style={isPlaying ? { animationDelay: '1.6s' } : undefined}
            />
            <text x="848" y="208" textAnchor="middle" fontSize="12" fill="#111827">assistant response</text>
          </g>

          <FullContextPath d="M 346 210 H 438" animate={isPlaying} reduceMotion={reduceMotion} markerId={markerId} />
          <FullContextPath d="M 608 206 H 760" animate={isPlaying} reduceMotion={reduceMotion} markerId={markerId} />
          <FullContextPath
            d="M 868 230 V 336 H 346"
            animate={isPlaying}
            reduceMotion={reduceMotion}
            markerId={markerId}
            timing="0;0.4;0.72;1"
          />

          <text x="868" y="354" textAnchor="middle" fontSize="10" fill="#374151">next turn repeats with even more tokens</text>
        </svg>
      </div>

      <p className="text-xs text-gray-500 mt-3">
        Full Context keeps perfect recall by resending the entire thread, but each round carries more tokens than the last.
      </p>
    </div>
  );
}
