import { useAnimationPlayer, SpawnPath, SpawnGroup, AnimationCard } from './animationUtils';
import { SPAWN_DURATION } from './animationConstants';

export default function QtdFlowAnimation() {
  const { reduceMotion, isPlaying, hasPlayed, playKey, onPlay } = useAnimationPlayer();

  const turns = [
    { label: 'Turn 1', y: 110 },
    { label: 'Turn 2', y: 150 },
    { label: 'Turn 3', y: 190 },
    { label: 'Turn 4', y: 230 },
    { label: 'Turn 5', y: 270 },
    { label: 'Turn 6', y: 310 },
    { label: 'Turn 7', y: 350 },
  ];

  return (
    <AnimationCard
      title="Query-Time Distillation Execution"
      subtitle="Zero proactive compression. Messages accumulate raw. When budget exceeds at query time, a single sub-LLM distills guided by the user's actual question."
      playingClassName="bg-teal-500/20 border-teal-400/40 text-teal-200 cursor-wait"
      isPlaying={isPlaying}
      hasPlayed={hasPlayed}
      reduceMotion={reduceMotion}
      onPlay={onPlay}
      footnote="Unlike RLM, QTD pays zero cost during conversation — compression is lazy and question-guided, keeping only what the current query needs."
    >
      <div className="overflow-x-auto rounded-lg border border-gray-700 bg-[#d9d9d9]">
        <svg
          key={`qtd-${playKey}`}
          className="w-full h-auto rlm-arch-diagram"
          viewBox="0 0 1000 620"
          role="img"
          aria-label="QTD architecture showing raw message accumulation with lazy query-time distillation when budget is exceeded"
        >
          <defs>
            <marker id="rlm-arrow-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f3640" />
            </marker>
          </defs>

          {/* ── Title ──────────────────────────────────── */}
          <text x="50" y="40" fontSize="21" fontWeight="700" fill="#111827">QTD</text>
          <text x="100" y="40" fontSize="14" fill="#334155">Query-Time Distillation — no proactive compression</text>

          {/* ── Raw message buffer (left) ──────────────── */}
          <g className={isPlaying ? 'strategy-node-pop' : undefined}>
            <rect x="40" y="60" width="240" height="340" rx="8" fill="#dee3c2" stroke="#2f3640" strokeWidth="2" />
            <text x="160" y="88" textAnchor="middle" fontSize="13" fontWeight="600" fill="#111827">Raw Message Buffer</text>
            <text x="160" y="104" textAnchor="middle" fontSize="10" fill="#334155">all turns kept verbatim</text>
          </g>

          {/* Turn rows — all active (nothing dropped) */}
          {turns.map((turn) => (
            <g key={turn.label}>
              <rect x="58" y={turn.y} width="204" height="28" rx="6" fill="#eef7df" stroke="#334155" strokeWidth="1.4" />
              <text x="72" y={turn.y + 18} fontSize="10" fill="#111827">{turn.label} (raw)</text>
            </g>
          ))}

          {/* Growing buffer bar */}
          <rect x="58" y="386" width="204" height="10" rx="4" fill="#c7d6a8" />
          <rect x="58" y="386" width="180" height="10" rx="4" fill="#7a9e3c" opacity="0.7">
            {!reduceMotion && isPlaying && (
              <animate attributeName="width" values="60;60;180;180" keyTimes="0;0.15;0.40;1" dur={SPAWN_DURATION} repeatCount="1" />
            )}
          </rect>

          {/* ── Budget check diamond ───────────────────── */}
          <g className={isPlaying ? 'strategy-node-pop' : undefined} style={isPlaying ? { animationDelay: '0.8s' } : undefined}>
            <polygon
              points="410,220 490,175 570,220 490,265"
              fill="#f9f0ca" stroke="#2f3640" strokeWidth="2"
            />
            <text x="490" y="215" textAnchor="middle" fontSize="11" fontWeight="600" fill="#111827">Budget</text>
            <text x="490" y="230" textAnchor="middle" fontSize="10" fill="#334155">exceeded?</text>
          </g>

          {/* ── Arrow: buffer → budget check ───────────── */}
          <SpawnPath d="M 280 220 H 410" timing="0;0.12;0.28;1" reduceMotion={reduceMotion} animate={isPlaying} />

          {/* ── YES path: question-guided distillation ─── */}
          <SpawnPath d="M 490 265 V 340" timing="0;0.22;0.36;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <text x="510" y="310" fontSize="10" fontWeight="600" fill="#be123c">yes</text>

          {/* ── User question pill ─────────────────────── */}
          <g className={isPlaying ? 'strategy-node-pop' : undefined} style={isPlaying ? { animationDelay: '1.6s' } : undefined}>
            <rect x="340" y="290" width="120" height="32" rx="8" fill="#e7c5e5" stroke="#2f3640" strokeWidth="2" />
            <text x="400" y="311" textAnchor="middle" fontSize="10" fill="#111827">user question</text>
          </g>
          <SpawnPath d="M 400 322 L 445 350" timing="0;0.34;0.50;1" reduceMotion={reduceMotion} animate={isPlaying} />

          {/* ── Distiller panel ────────────────────────── */}
          <SpawnGroup
            timing="0;0.34;0.52;1" reduceMotion={reduceMotion} animate={isPlaying}
            cx={530} cy={420} rootCx={490} rootCy={220}
          >
            <rect x="370" y="350" width="320" height="130" rx="7" fill="#bcd0dc" stroke="#2f3640" strokeWidth="2" />
            <text x="530" y="375" textAnchor="middle" fontSize="13" fontWeight="600" fill="#111827">Query-Time Distiller</text>
            <rect
              x="410" y="388" width="180" height="68" rx="8"
              fill="#bee5be" stroke="#2f3640" strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow delay-2' : undefined}
            />
            <text x="500" y="418" textAnchor="middle" fontSize="12" fill="#111827">Distiller LM</text>
            <text x="500" y="436" textAnchor="middle" fontSize="9" fill="#334155">question guides extraction</text>
            <rect x="620" y="398" width="50" height="38" rx="4" fill="#e7c5e5" stroke="#2f3640" strokeWidth="1" />
            <text x="645" y="422" textAnchor="middle" fontSize="8" fill="#111827">Q</text>
          </SpawnGroup>

          {/* ── Distilled output arrow ────────────────── */}
          <SpawnPath d="M 530 480 V 530" timing="0;0.58;0.74;1" reduceMotion={reduceMotion} animate={isPlaying} />

          {/* ── NO path: direct to model ───────────────── */}
          <SpawnPath d="M 570 220 H 700" timing="0;0.22;0.36;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <text x="620" y="210" fontSize="10" fontWeight="600" fill="#047857">no</text>

          {/* ── Direct LM path ─────────────────────────── */}
          <g className={isPlaying ? 'strategy-node-pop' : undefined} style={isPlaying ? { animationDelay: '1.6s' } : undefined}>
            <rect x="700" y="170" width="240" height="100" rx="7" fill="#bcd0dc" stroke="#2f3640" strokeWidth="2" />
            <rect
              x="730" y="188" width="170" height="60" rx="8"
              fill="#bee5be" stroke="#2f3640" strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow delay-1' : undefined}
            />
            <text x="815" y="215" textAnchor="middle" fontSize="13" fill="#111827">Language Model</text>
            <text x="815" y="233" textAnchor="middle" fontSize="10" fill="#334155">raw messages fit budget</text>
          </g>

          {/* ── Direct response arrow ────────────────── */}
          <SpawnPath d="M 820 270 V 530 H 660" timing="0;0.50;0.70;1" reduceMotion={reduceMotion} animate={isPlaying} />

          {/* ── Response box (animates in last) ──────── */}
          <g className={isPlaying ? 'strategy-node-pop pop-delay-last' : undefined}>
            <rect x="400" y="535" width="260" height="40" rx="8" fill="#efcfd8" stroke="#2f3640" strokeWidth="2" />
            <text x="530" y="560" textAnchor="middle" fontSize="11" fill="#111827">distilled context + response</text>
          </g>

          {/* ── Annotation ─────────────────────────────── */}
          <text x="160" y="420" textAnchor="middle" fontSize="10" fill="#334155">zero compression cost</text>
          <text x="160" y="434" textAnchor="middle" fontSize="10" fill="#334155">until budget exceeded</text>
        </svg>
      </div>
    </AnimationCard>
  );
}
