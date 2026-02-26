import { useEffect, useState } from 'react';

interface WindowedPathProps {
  d: string;
  animate: boolean;
  reduceMotion: boolean;
  markerId: string;
  timing?: string;
}

const ANIMATION_MS = 5200;
const FEED_ROWS = [
  { y: 100, label: 'Turn 1 (old)' },
  { y: 136, label: 'Turn 2 (old)' },
  { y: 172, label: 'Turn 3 (old)' },
  { y: 208, label: 'Turn 4' },
  { y: 244, label: 'Turn 5' },
  { y: 280, label: 'Turn 6' },
];

function WindowedPath({
  d,
  animate,
  reduceMotion,
  markerId,
  timing = '0;0.08;0.26;1',
}: WindowedPathProps) {
  if (!animate || reduceMotion) {
    return <path className="strategy-flow-line strategy-flow-line-window" d={d} markerEnd={`url(#${markerId})`} />;
  }

  return (
    <path
      className="strategy-flow-line strategy-flow-line-window strategy-flow-line-spawn"
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

export default function WindowedFlowAnimation() {
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

  const markerId = `windowed-arrow-head-${playKey}`;

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 shadow-lg shadow-black/20">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-100">Windowed Execution</h3>
          <p className="text-sm text-gray-400 mt-1">
            Only the latest N turns are forwarded. Cost stays bounded while old facts fall out of view.
          </p>
        </div>
        <button
          type="button"
          onClick={onPlay}
          disabled={isPlaying || reduceMotion}
          className={`shrink-0 inline-flex items-center rounded-md px-3 py-1.5 text-xs font-semibold border transition-colors ${
            isPlaying
              ? 'bg-amber-500/20 border-amber-400/40 text-amber-200 cursor-wait'
              : reduceMotion
                ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700 hover:border-gray-500'
          }`}
          aria-label="Play Windowed animation"
          title={reduceMotion ? 'Animation disabled because Reduced Motion is enabled' : 'Play animation'}
        >
          {isPlaying ? 'Playing...' : hasPlayed ? 'Replay' : 'Play'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-700 bg-[#e8dfcd]">
        <svg
          key={`windowed-${playKey}`}
          className="w-full h-auto strategy-flow-diagram"
          viewBox="0 0 980 420"
          role="img"
          aria-label="Windowed strategy diagram that keeps only the latest turns in context"
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
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#374151" />
            </marker>
          </defs>

          <rect x="36" y="56" width="280" height="306" rx="10" fill="#f0e7d2" stroke="#374151" strokeWidth="2" />
          <text x="176" y="84" textAnchor="middle" fontSize="15" fontWeight="700" fill="#111827">Incoming Turns</text>

          {FEED_ROWS.map((row, index) => {
            const isOld = index < 3;
            const settledOpacity = isOld ? 0.28 : 1;
            return (
              <g key={row.label} opacity={isPlaying && !reduceMotion && isOld ? 1 : settledOpacity}>
                {!reduceMotion && isPlaying && isOld && (
                  <animate
                    attributeName="opacity"
                    values="1;1;0.28;0.28"
                    keyTimes="0;0.2;0.46;1"
                    dur="5.2s"
                    repeatCount="1"
                  />
                )}
                <rect
                  x="56"
                  y={row.y}
                  width="236"
                  height="25"
                  rx="7"
                  fill={isOld ? '#edc9c9' : '#f8eed7'}
                  stroke="#374151"
                  strokeWidth="1.5"
                />
                <text x="74" y={row.y + 16} fontSize="10.5" fill="#111827">{row.label}</text>
              </g>
            );
          })}

          <g className={isPlaying ? 'strategy-node-pop pop-delay-2' : undefined}>
            <rect
              x="362"
              y="182"
              width="214"
              height="132"
              rx="10"
              fill="#f7e39f"
              stroke="#374151"
              strokeWidth="2"
              className={isPlaying ? 'strategy-node-glow-window' : undefined}
            />
            <text x="469" y="208" textAnchor="middle" fontSize="13" fontWeight="700" fill="#111827">Context Window (N=3)</text>
            <rect x="386" y="220" width="166" height="24" rx="6" fill="#fbf3d5" stroke="#374151" strokeWidth="1.4" />
            <rect x="386" y="249" width="166" height="24" rx="6" fill="#fbf3d5" stroke="#374151" strokeWidth="1.4" />
            <rect x="386" y="278" width="166" height="24" rx="6" fill="#fbf3d5" stroke="#374151" strokeWidth="1.4" />
            <text x="469" y="237" textAnchor="middle" fontSize="10" fill="#111827">Turn 4</text>
            <text x="469" y="266" textAnchor="middle" fontSize="10" fill="#111827">Turn 5</text>
            <text x="469" y="295" textAnchor="middle" fontSize="10" fill="#111827">Turn 6</text>
          </g>

          <g className={isPlaying ? 'strategy-node-pop pop-delay-3' : undefined}>
            <rect
              x="668"
              y="146"
              width="168"
              height="120"
              rx="10"
              fill="#bee5be"
              stroke="#374151"
              strokeWidth="2"
              className={isPlaying ? 'strategy-node-glow-window' : undefined}
              style={isPlaying ? { animationDelay: '1.1s' } : undefined}
            />
            <text x="752" y="191" textAnchor="middle" fontSize="18" fill="#111827">Language</text>
            <text x="752" y="215" textAnchor="middle" fontSize="18" fill="#111827">Model</text>
          </g>

          <g className={isPlaying ? 'strategy-node-pop pop-delay-4' : undefined}>
            <rect
              x="858"
              y="176"
              width="98"
              height="54"
              rx="8"
              fill="#efd2df"
              stroke="#374151"
              strokeWidth="2"
              className={isPlaying ? 'strategy-node-glow-window' : undefined}
              style={isPlaying ? { animationDelay: '1.4s' } : undefined}
            />
            <text x="907" y="208" textAnchor="middle" fontSize="12" fill="#111827">response</text>
          </g>

          <g className={isPlaying ? 'strategy-node-pop pop-delay-5' : undefined}>
            <rect
              x="642"
              y="292"
              width="236"
              height="58"
              rx="8"
              fill="#f4c7a7"
              stroke="#374151"
              strokeWidth="2"
              className={isPlaying ? 'strategy-node-glow-window' : undefined}
              style={isPlaying ? { animationDelay: '1.8s' } : undefined}
            >
              {!reduceMotion && isPlaying && (
                <animate
                  attributeName="opacity"
                  values="0.25;0.25;1;1"
                  keyTimes="0;0.35;0.7;1"
                  dur="5.2s"
                  repeatCount="1"
                />
              )}
            </rect>
            <text x="760" y="316" textAnchor="middle" fontSize="11" fontWeight="700" fill="#111827">Forgotten Outside Window</text>
            <text x="760" y="334" textAnchor="middle" fontSize="10" fill="#111827">Turns 1-3 dropped from active context</text>
          </g>

          <WindowedPath d="M 292 250 H 362" animate={isPlaying} reduceMotion={reduceMotion} markerId={markerId} />
          <WindowedPath d="M 576 214 H 668" animate={isPlaying} reduceMotion={reduceMotion} markerId={markerId} />
          <WindowedPath d="M 836 203 H 858" animate={isPlaying} reduceMotion={reduceMotion} markerId={markerId} />
          <WindowedPath
            d="M 176 182 H 176 V 322 H 642"
            animate={isPlaying}
            reduceMotion={reduceMotion}
            markerId={markerId}
            timing="0;0.34;0.68;1"
          />
        </svg>
      </div>

      <p className="text-xs text-gray-500 mt-3">
        Windowed memory fixes token cost per request by dropping older turns, which can remove early facts from model context.
      </p>
    </div>
  );
}
