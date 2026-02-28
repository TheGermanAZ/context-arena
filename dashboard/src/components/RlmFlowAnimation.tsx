import { useEffect, useState } from 'react';

type SpawnPhase = 'left' | 'right';

interface SpawnPathProps {
  d: string;
  phase: SpawnPhase;
  reduceMotion: boolean;
  animate: boolean;
  timing?: string;
}

const PHASE_TIMINGS: Record<SpawnPhase, string> = {
  left: '0;0.1;0.22;1',
  right: '0;0.16;0.3;1',
};

const ANIMATION_MS = 6000;

function SpawnPath({ d, phase, reduceMotion, animate, timing }: SpawnPathProps) {
  if (reduceMotion || !animate) {
    return <path className="rlm-arch-line" d={d} />;
  }

  const resolvedTiming = timing ?? PHASE_TIMINGS[phase];
  return (
    <path className="rlm-arch-line rlm-arch-line-spawn" d={d} pathLength={100}>
      <animate
        attributeName="stroke-dashoffset"
        values="100;100;0;0"
        keyTimes={resolvedTiming}
        dur="6s"
        repeatCount="1"
      />
      <animate
        attributeName="opacity"
        values="0;0;1;1"
        keyTimes={resolvedTiming}
        dur="6s"
        repeatCount="1"
      />
    </path>
  );
}

export default function RlmFlowAnimation() {
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
    const timer = window.setTimeout(() => setIsPlaying(false), ANIMATION_MS + 100);
    return () => window.clearTimeout(timer);
  }, [isPlaying, playKey]);

  const onPlay = () => {
    if (reduceMotion) return;
    setHasPlayed(true);
    setPlayKey((v) => v + 1);
    setIsPlaying(true);
  };

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 shadow-lg shadow-black/20">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-100">Recursive RLM Execution</h3>
          <p className="text-sm text-gray-400 mt-1">
            Animated architecture view of root execution, delegated sub-queries, and merged sub-responses.
          </p>
        </div>
        <button
          type="button"
          onClick={onPlay}
          disabled={isPlaying || reduceMotion}
          className={`shrink-0 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold border transition-colors ${
            isPlaying
              ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200 cursor-wait'
              : reduceMotion
                ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700 hover:border-gray-500'
          }`}
          aria-label="Play RLM animation"
          title={reduceMotion ? 'Animation disabled because Reduced Motion is enabled' : 'Play animation'}
        >
          <span className="text-sm leading-none">{isPlaying ? '\u23F5' : '\u25B6'}</span>
          <span>{isPlaying ? 'Playing...' : hasPlayed ? 'Replay' : 'Play'}</span>
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-700 bg-[#d9d9d9]">
        <svg
          key={`diagram-${playKey}`}
          className="w-full h-auto rlm-arch-diagram"
          viewBox="0 0 1260 930"
          role="img"
          aria-label="Recursive Language Model architecture with root depth zero and delegated depth one branches"
        >
          <defs>
            <marker
              id="rlm-arrow-head"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f3640" />
            </marker>
          </defs>

          {/* Root panel */}
          <rect
            x="460"
            y="80"
            width="340"
            height="290"
            rx="7"
            fill="#bcd0dc"
            stroke="#2f3640"
            strokeWidth="2"
            className={isPlaying ? 'strategy-node-pop' : undefined}
          />
          <text x="495" y="64" fontSize="21" fontWeight="700" fill="#111827">RLM</text>
          <text x="550" y="64" fontSize="21" fill="#111827">(root / depth=0)</text>

          {/* Root internals */}
          <g className={isPlaying ? 'strategy-node-pop pop-delay-1' : undefined}>
            <rect
              x="535"
              y="120"
              width="190"
              height="95"
              rx="8"
              fill="#bee5be"
              stroke="#2f3640"
              strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow' : undefined}
            />
            <text x="630" y="154" textAnchor="middle" fontSize="15" fill="#111827">Language</text>
            <text x="630" y="177" textAnchor="middle" fontSize="15" fill="#111827">Model</text>
          </g>

          <g className={isPlaying ? 'strategy-node-pop pop-delay-2' : undefined}>
            <rect
              x="512"
              y="235"
              width="236"
              height="132"
              rx="8"
              fill="#ef8589"
              stroke="#2f3640"
              strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow delay-1' : undefined}
            />
            <rect x="528" y="252" width="204" height="44" rx="4" fill="#1f2937" />
            <text x="535" y="270" fontSize="8" fill="#f5f5f5"># Peek at the structure of the context</text>
            <text x="535" y="283" fontSize="8" fill="#f5f5f5">print(context[:2000])</text>
            <text x="630" y="326" textAnchor="middle" fontSize="17" fill="#111827">Environment E</text>
            <text x="630" y="349" textAnchor="middle" fontSize="17" fill="#111827">(e.g. REPL)</text>
          </g>

          {/* Inputs / outputs */}
          <g className={isPlaying ? 'strategy-node-pop pop-delay-1' : undefined}>
            <rect x="176" y="112" width="104" height="38" rx="8" fill="#e7c5e5" stroke="#2f3640" strokeWidth="2" />
            <text x="228" y="136" textAnchor="middle" fontSize="11" fill="#111827">query</text>
          </g>

          <g className={isPlaying ? 'strategy-node-pop pop-delay-2' : undefined}>
            <rect x="52" y="165" width="362" height="36" rx="8" fill="#dee3c2" stroke="#2f3640" strokeWidth="2" />
            <text x="233" y="190" textAnchor="middle" fontSize="11" fill="#111827">context</text>
          </g>

          <g className={isPlaying ? 'strategy-node-pop pop-delay-last' : undefined}>
            <rect x="937" y="112" width="166" height="38" rx="8" fill="#efcfd8" stroke="#2f3640" strokeWidth="2" />
            <text x="1020" y="136" textAnchor="middle" fontSize="11" fill="#111827">final response</text>
          </g>

          {/* Left depth-1 panel */}
          <g className="rlm-subtree">
            {!reduceMotion && isPlaying && (
              <>
                <animate attributeName="opacity" values="0;0;1;1" keyTimes="0;0.1;0.22;1" dur="6s" repeatCount="1" />
                <animateTransform
                  attributeName="transform"
                  type="matrix"
                  values="0.12 0 0 0.12 575.16 96.22;0.12 0 0 0.12 575.16 96.22;1 0 0 1 0 0;1 0 0 1 0 0"
                  keyTimes="0;0.1;0.22;1"
                  dur="6s"
                  repeatCount="1"
                />
              </>
            )}
            <text x="332" y="460" fontSize="23" fontWeight="700" fill="#111827">RLM</text>
            <text x="384" y="460" fontSize="23" fill="#111827">(depth=1)</text>

            <rect x="332" y="478" width="250" height="250" rx="7" fill="#bcd0dc" stroke="#2f3640" strokeWidth="2" />
            <rect x="342" y="490" width="102" height="34" rx="8" fill="#e7c5e5" stroke="#2f3640" strokeWidth="2" />
            <text x="393" y="512" textAnchor="middle" fontSize="11" fill="#111827">sub-query 1</text>
            <rect x="452" y="490" width="118" height="34" rx="8" fill="#dee3c2" stroke="#2f3640" strokeWidth="2" />
            <text x="511" y="512" textAnchor="middle" fontSize="11" fill="#111827">sub-context 1</text>

            <rect
              x="365"
              y="552"
              width="184"
              height="92"
              rx="8"
              fill="#bee5be"
              stroke="#2f3640"
              strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow delay-2' : undefined}
            />
            <text x="457" y="590" textAnchor="middle" fontSize="17" fill="#111827">Language</text>
            <text x="457" y="613" textAnchor="middle" fontSize="17" fill="#111827">Model</text>

            <rect x="373" y="682" width="168" height="38" rx="8" fill="#efcfd8" stroke="#2f3640" strokeWidth="2" />
            <text x="457" y="706" textAnchor="middle" fontSize="11" fill="#111827">sub-response 1</text>
          </g>

          {/* Right depth-1 panel */}
          <g className="rlm-subtree">
            {!reduceMotion && isPlaying && (
              <>
                <animate attributeName="opacity" values="0;0;1;1" keyTimes="0;0.16;0.3;1" dur="6s" repeatCount="1" />
                <animateTransform
                  attributeName="transform"
                  type="matrix"
                  values="0.12 0 0 0.12 520.8 86.5;0.12 0 0 0.12 520.8 86.5;1 0 0 1 0 0;1 0 0 1 0 0"
                  keyTimes="0;0.16;0.3;1"
                  dur="6s"
                  repeatCount="1"
                />
              </>
            )}
            <text x="970" y="460" fontSize="23" fontWeight="700" fill="#111827">RLM</text>
            <text x="1022" y="460" fontSize="23" fill="#111827">(depth=1)</text>

            <rect x="675" y="478" width="470" height="342" rx="7" fill="#bcd0dc" stroke="#2f3640" strokeWidth="2" />
            <rect x="699" y="490" width="118" height="34" rx="8" fill="#dee3c2" stroke="#2f3640" strokeWidth="2" />
            <text x="758" y="512" textAnchor="middle" fontSize="11" fill="#111827">sub-context 2</text>
            <rect x="841" y="490" width="102" height="34" rx="8" fill="#e7c5e5" stroke="#2f3640" strokeWidth="2" />
            <text x="892" y="512" textAnchor="middle" fontSize="11" fill="#111827">sub-query 2</text>

            <rect
              x="756"
              y="552"
              width="186"
              height="92"
              rx="8"
              fill="#bee5be"
              stroke="#2f3640"
              strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow delay-3' : undefined}
            />
            <text x="849" y="590" textAnchor="middle" fontSize="17" fill="#111827">Language</text>
            <text x="849" y="613" textAnchor="middle" fontSize="17" fill="#111827">Model</text>

            <rect x="964" y="570" width="170" height="38" rx="8" fill="#efcfd8" stroke="#2f3640" strokeWidth="2" />
            <text x="1049" y="595" textAnchor="middle" fontSize="11" fill="#111827">sub-response 2</text>

            <rect
              x="733"
              y="670"
              width="244"
              height="136"
              rx="8"
              fill="#ef8589"
              stroke="#2f3640"
              strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow delay-4' : undefined}
            />
            <rect x="748" y="687" width="214" height="45" rx="4" fill="#1f2937" />
            <text x="754" y="705" fontSize="8" fill="#f5f5f5"># Peek at the structure of the context</text>
            <text x="754" y="718" fontSize="8" fill="#f5f5f5">print(context[:2000])</text>
            <text x="855" y="765" textAnchor="middle" fontSize="17" fill="#111827">Environment E</text>
            <text x="855" y="788" textAnchor="middle" fontSize="17" fill="#111827">(e.g. REPL)</text>

            <text x="772" y="890" fontSize="26" fill="#111827">...</text>
            <text x="855" y="890" fontSize="26" fill="#111827">...</text>
            <text x="936" y="890" fontSize="26" fill="#111827">...</text>
          </g>

          {/* Flow lines */}
          <path className="rlm-arch-line" d="M 280 131 H 528" />
          <path className="rlm-arch-line" d="M 414 183 H 512" />
          <SpawnPath d="M 723 131 H 934" phase="right" timing="0;0.86;0.96;1" reduceMotion={reduceMotion} animate={isPlaying} />

          <path className="rlm-arch-line" d="M 620 215 V 235" />
          <path className="rlm-arch-line" d="M 642 235 V 215" />

          <SpawnPath d="M 610 367 L 540 478" phase="left" reduceMotion={reduceMotion} animate={isPlaying} />
          <SpawnPath d="M 688 367 L 775 478" phase="right" reduceMotion={reduceMotion} animate={isPlaying} />

          <SpawnPath d="M 393 524 V 552" phase="left" timing="0;0.24;0.36;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <SpawnPath d="M 511 524 V 552" phase="left" timing="0;0.24;0.36;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <SpawnPath d="M 457 644 V 682" phase="left" timing="0;0.38;0.50;1" reduceMotion={reduceMotion} animate={isPlaying} />

          <SpawnPath d="M 893 524 V 552" phase="right" timing="0;0.32;0.44;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <SpawnPath d="M 760 524 V 670" phase="right" timing="0;0.32;0.44;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <SpawnPath d="M 942 589 H 964" phase="right" timing="0;0.46;0.58;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <SpawnPath d="M 848 644 V 670" phase="right" timing="0;0.46;0.58;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <SpawnPath d="M 872 670 V 644" phase="right" timing="0;0.50;0.62;1" reduceMotion={reduceMotion} animate={isPlaying} />

          <SpawnPath d="M 808 806 L 785 860" phase="right" timing="0;0.56;0.68;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <SpawnPath d="M 855 806 V 860" phase="right" timing="0;0.56;0.68;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <SpawnPath d="M 904 806 L 934 860" phase="right" timing="0;0.56;0.68;1" reduceMotion={reduceMotion} animate={isPlaying} />

          <SpawnPath d="M 373 701 H 265 V 319 H 460" phase="left" timing="0;0.54;0.70;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <SpawnPath d="M 1134 589 H 1193 V 319 H 800" phase="right" timing="0;0.68;0.82;1" reduceMotion={reduceMotion} animate={isPlaying} />
        </svg>
      </div>

      <p className="text-xs text-gray-500 mt-3">
        The child RLM branches and their arrows now spawn together from the root, then remain stable for readability.
      </p>
    </div>
  );
}
