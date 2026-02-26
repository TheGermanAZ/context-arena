import { useEffect, useState } from 'react';

type FlowRowState = 'active' | 'compressed' | 'dropped';
type StrategyTheme = 'amber' | 'cyan' | 'lime' | 'violet' | 'pink';

interface FlowRow {
  label: string;
  state: FlowRowState;
}

interface OptionalBlock {
  title: string;
  note: string;
  fill: string;
}

export interface GenericStrategyFlowConfig {
  title: string;
  subtitle: string;
  ariaLabel: string;
  theme: StrategyTheme;
  background: string;
  lineColor: string;
  processorTitle: string;
  processorNote: string;
  memoryTitle: string;
  memoryNote: string;
  loopNote: string;
  rows: FlowRow[];
  optionalBlock?: OptionalBlock;
}

interface AnimatedPathProps {
  d: string;
  markerId: string;
  lineColor: string;
  animate: boolean;
  reduceMotion: boolean;
  timing?: string;
}

const ANIMATION_MS = 5200;

const THEME_ACTIVE_BUTTON_CLASSES: Record<StrategyTheme, string> = {
  amber: 'bg-amber-500/20 border-amber-400/40 text-amber-200 cursor-wait',
  cyan: 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200 cursor-wait',
  lime: 'bg-lime-500/20 border-lime-400/40 text-lime-200 cursor-wait',
  violet: 'bg-violet-500/20 border-violet-400/40 text-violet-200 cursor-wait',
  pink: 'bg-pink-500/20 border-pink-400/40 text-pink-200 cursor-wait',
};

const THEME_NODE_GLOW_CLASSES: Record<StrategyTheme, string> = {
  amber: 'strategy-node-glow-theme strategy-node-glow-amber',
  cyan: 'strategy-node-glow-theme strategy-node-glow-cyan',
  lime: 'strategy-node-glow-theme strategy-node-glow-lime',
  violet: 'strategy-node-glow-theme strategy-node-glow-violet',
  pink: 'strategy-node-glow-theme strategy-node-glow-pink',
};

const ROW_STYLE: Record<FlowRowState, { fill: string; stroke: string; settledOpacity: number; animatedOpacity: string }> = {
  active: {
    fill: '#eef7df',
    stroke: '#334155',
    settledOpacity: 1,
    animatedOpacity: '1;1;1;1',
  },
  compressed: {
    fill: '#d9e7ff',
    stroke: '#334155',
    settledOpacity: 0.72,
    animatedOpacity: '1;1;0.72;0.72',
  },
  dropped: {
    fill: '#f3cdcf',
    stroke: '#334155',
    settledOpacity: 0.3,
    animatedOpacity: '1;1;0.3;0.3',
  },
};

function AnimatedPath({
  d,
  markerId,
  lineColor,
  animate,
  reduceMotion,
  timing = '0;0.08;0.24;1',
}: AnimatedPathProps) {
  if (!animate || reduceMotion) {
    return <path className="strategy-flow-line" d={d} markerEnd={`url(#${markerId})`} style={{ stroke: lineColor }} />;
  }

  return (
    <path
      className="strategy-flow-line strategy-flow-line-spawn"
      d={d}
      markerEnd={`url(#${markerId})`}
      pathLength={100}
      style={{ stroke: lineColor }}
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

export default function GenericStrategyFlowAnimation({
  title,
  subtitle,
  ariaLabel,
  theme,
  background,
  lineColor,
  processorTitle,
  processorNote,
  memoryTitle,
  memoryNote,
  loopNote,
  rows,
  optionalBlock,
}: GenericStrategyFlowConfig) {
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

  const markerId = `generic-strategy-arrow-${theme}-${playKey}`;
  const rowHeight = 21;
  const rowGap = 24;
  const rowsStartY = 92;
  const optionalBlockX = 590;
  const memoryWidth = optionalBlock ? 244 : 260;
  const themeGlowClass = THEME_NODE_GLOW_CLASSES[theme];

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-700 p-4 shadow-lg shadow-black/20">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-100">{title}</h3>
          <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
        </div>
        <button
          type="button"
          onClick={onPlay}
          disabled={isPlaying || reduceMotion}
          className={`shrink-0 inline-flex items-center rounded-md px-3 py-1.5 text-xs font-semibold border transition-colors ${
            isPlaying
              ? THEME_ACTIVE_BUTTON_CLASSES[theme]
              : reduceMotion
                ? 'bg-gray-800 border-gray-700 text-gray-500 cursor-not-allowed'
                : 'bg-gray-800 border-gray-600 text-gray-200 hover:bg-gray-700 hover:border-gray-500'
          }`}
          aria-label={`Play ${title} animation`}
          title={reduceMotion ? 'Animation disabled because Reduced Motion is enabled' : 'Play animation'}
        >
          {isPlaying ? 'Playing...' : hasPlayed ? 'Replay' : 'Play'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-700" style={{ backgroundColor: background }}>
        <svg
          key={`generic-${title}-${playKey}`}
          className="w-full h-auto strategy-flow-diagram"
          viewBox="0 0 900 360"
          role="img"
          aria-label={ariaLabel}
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
              <path d="M 0 0 L 10 5 L 0 10 z" fill={lineColor} />
            </marker>
          </defs>

          <rect x="34" y="56" width="238" height="244" rx="10" fill="#edf0f8" stroke="#334155" strokeWidth="2" />
          <text x="153" y="82" textAnchor="middle" fontSize="13" fontWeight="700" fill="#111827">Conversation Turns</text>

          {rows.map((row, index) => {
            const y = rowsStartY + index * rowGap;
            const style = ROW_STYLE[row.state];
            return (
              <g key={`${row.label}-${index}`} opacity={isPlaying && !reduceMotion ? 1 : style.settledOpacity}>
                {!reduceMotion && isPlaying && (
                  <animate
                    attributeName="opacity"
                    values={style.animatedOpacity}
                    keyTimes="0;0.22;0.5;1"
                    dur="5.2s"
                    repeatCount="1"
                  />
                )}
                <rect
                  x="54"
                  y={y}
                  width="198"
                  height={rowHeight}
                  rx="6"
                  fill={style.fill}
                  stroke={style.stroke}
                  strokeWidth="1.4"
                />
                <text x="68" y={y + 14} fontSize="10" fill="#111827">{row.label}</text>
              </g>
            );
          })}

          <g className={isPlaying ? 'strategy-node-pop pop-delay-1' : undefined}>
            <rect
              x="314"
              y="116"
              width="220"
              height="94"
              rx="10"
              fill="#d8dff0"
              stroke="#334155"
              strokeWidth="2"
              className={isPlaying ? themeGlowClass : undefined}
            />
            <text x="424" y="151" textAnchor="middle" fontSize="15" fontWeight="700" fill="#111827">{processorTitle}</text>
            <text x="424" y="176" textAnchor="middle" fontSize="10.5" fill="#334155">{processorNote}</text>
          </g>

          <g className={isPlaying ? 'strategy-node-pop pop-delay-2' : undefined}>
            <rect
              x="578"
              y="116"
              width="156"
              height="94"
              rx="10"
              fill="#bee5be"
              stroke="#334155"
              strokeWidth="2"
              className={isPlaying ? themeGlowClass : undefined}
            />
            <text x="656" y="151" textAnchor="middle" fontSize="17" fill="#111827">Language</text>
            <text x="656" y="174" textAnchor="middle" fontSize="17" fill="#111827">Model</text>
          </g>

          <g className={isPlaying ? 'strategy-node-pop pop-delay-3' : undefined}>
            <rect
              x="754"
              y="142"
              width="112"
              height="42"
              rx="8"
              fill="#efd2df"
              stroke="#334155"
              strokeWidth="2"
              className={isPlaying ? themeGlowClass : undefined}
            />
            <text x="810" y="167" textAnchor="middle" fontSize="10.5" fill="#111827">response</text>
          </g>

          <g className={isPlaying ? 'strategy-node-pop pop-delay-4' : undefined}>
            <rect
              x="314"
              y="236"
              width={memoryWidth}
              height="84"
              rx="9"
              fill="#f9f0ca"
              stroke="#334155"
              strokeWidth="2"
              className={isPlaying ? themeGlowClass : undefined}
            />
            <text x={314 + memoryWidth / 2} y="263" textAnchor="middle" fontSize="12" fontWeight="700" fill="#111827">
              {memoryTitle}
            </text>
            <text x={314 + memoryWidth / 2} y="283" textAnchor="middle" fontSize="10" fill="#334155">{memoryNote}</text>
            <rect x="330" y="296" width={memoryWidth - 32} height="9" rx="4" fill="#e7ddaf" />
            <rect x="330" y="296" width={Math.max(56, memoryWidth * 0.28)} height="9" rx="4" fill="#c7b269">
              {!reduceMotion && isPlaying && (
                <animate
                  attributeName="width"
                  values={`${Math.max(56, memoryWidth * 0.28)};${Math.max(56, memoryWidth * 0.28)};${memoryWidth - 46};${memoryWidth - 46}`}
                  keyTimes="0;0.34;0.7;1"
                  dur="5.2s"
                  repeatCount="1"
                />
              )}
            </rect>
          </g>

          {optionalBlock ? (
            <g className={isPlaying ? 'strategy-node-pop pop-delay-5' : undefined}>
              <rect
                x={optionalBlockX}
                y="236"
                width="144"
                height="84"
                rx="9"
                fill={optionalBlock.fill}
                stroke="#334155"
                strokeWidth="2"
                className={isPlaying ? themeGlowClass : undefined}
              />
              <text x="662" y="263" textAnchor="middle" fontSize="12" fontWeight="700" fill="#111827">{optionalBlock.title}</text>
              <text x="662" y="283" textAnchor="middle" fontSize="10" fill="#334155">{optionalBlock.note}</text>
            </g>
          ) : null}

          <AnimatedPath d="M 272 162 H 314" markerId={markerId} lineColor={lineColor} animate={isPlaying} reduceMotion={reduceMotion} />
          <AnimatedPath d="M 534 162 H 578" markerId={markerId} lineColor={lineColor} animate={isPlaying} reduceMotion={reduceMotion} />
          <AnimatedPath d="M 734 162 H 754" markerId={markerId} lineColor={lineColor} animate={isPlaying} reduceMotion={reduceMotion} />

          {optionalBlock ? (
            <>
              <AnimatedPath
                d="M 810 184 V 248 H 734"
                markerId={markerId}
                lineColor={lineColor}
                animate={isPlaying}
                reduceMotion={reduceMotion}
                timing="0;0.28;0.56;1"
              />
              <AnimatedPath
                d="M 590 278 H 558"
                markerId={markerId}
                lineColor={lineColor}
                animate={isPlaying}
                reduceMotion={reduceMotion}
                timing="0;0.42;0.62;1"
              />
            </>
          ) : (
            <AnimatedPath
              d="M 810 184 V 278 H 574"
              markerId={markerId}
              lineColor={lineColor}
              animate={isPlaying}
              reduceMotion={reduceMotion}
              timing="0;0.28;0.56;1"
            />
          )}

          <AnimatedPath
            d="M 314 278 H 272"
            markerId={markerId}
            lineColor={lineColor}
            animate={isPlaying}
            reduceMotion={reduceMotion}
            timing="0;0.48;0.74;1"
          />

          <text x="726" y="338" textAnchor="middle" fontSize="10" fill="#374151">{loopNote}</text>
        </svg>
      </div>
    </div>
  );
}
