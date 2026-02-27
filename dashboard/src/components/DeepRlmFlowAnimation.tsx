import { useAnimationPlayer, SpawnPath, SpawnGroup, AnimationCard } from './animationUtils';

export default function DeepRlmFlowAnimation() {
  const { reduceMotion, isPlaying, hasPlayed, playKey, onPlay } = useAnimationPlayer();

  return (
    <AnimationCard
      title="DeepRLM(d=2) Execution"
      subtitle="Each compression fires a chain of sub-LLM passes. Pass 1 extracts; Pass 2 re-reads the output with fresh eyes."
      playingClassName="bg-blue-500/20 border-blue-400/40 text-blue-200 cursor-wait"
      isPlaying={isPlaying}
      hasPlayed={hasPlayed}
      reduceMotion={reduceMotion}
      onPlay={onPlay}
      footnote="Depth isolates information loss — each re-extraction pass refines with fresh context, unlike single-shot RLM."
    >
      <div className="overflow-x-auto rounded-lg border border-gray-700 bg-[#d9d9d9]">
        <svg
          key={`deep-rlm-${playKey}`}
          className="w-full h-auto rlm-arch-diagram"
          viewBox="0 0 960 700"
          role="img"
          aria-label="DeepRLM architecture showing chained depth-2 sub-LLM passes for iterative extraction refinement"
        >
          <defs>
            <marker id="rlm-arrow-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f3640" />
            </marker>
          </defs>

          {/* ── Title ──────────────────────────────────── */}
          <text x="300" y="44" fontSize="21" fontWeight="700" fill="#111827">DeepRLM</text>
          <text x="418" y="44" fontSize="21" fill="#111827">(root, d=0)</text>

          {/* ── Root RLM panel ─────────────────────────── */}
          <rect
            x="290" y="55" width="380" height="195" rx="7"
            fill="#bcd0dc" stroke="#2f3640" strokeWidth="2"
            className={isPlaying ? 'strategy-node-pop' : undefined}
          />
          <g className={isPlaying ? 'strategy-node-pop pop-delay-1' : undefined}>
            <rect
              x="345" y="85" width="190" height="90" rx="8"
              fill="#bee5be" stroke="#2f3640" strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow' : undefined}
            />
            <text x="440" y="120" textAnchor="middle" fontSize="15" fill="#111827">Language</text>
            <text x="440" y="143" textAnchor="middle" fontSize="15" fill="#111827">Model</text>
          </g>
          <text x="480" y="222" textAnchor="middle" fontSize="10.5" fill="#334155">delegates to depth chain</text>

          {/* ── Input pills ────────────────────────────── */}
          <g className={isPlaying ? 'strategy-node-pop pop-delay-1' : undefined}>
            <rect x="55" y="95" width="120" height="36" rx="8" fill="#e7c5e5" stroke="#2f3640" strokeWidth="2" />
            <text x="115" y="118" textAnchor="middle" fontSize="11" fill="#111827">query</text>
          </g>
          <g className={isPlaying ? 'strategy-node-pop pop-delay-1' : undefined}>
            <rect x="30" y="150" width="200" height="36" rx="8" fill="#dee3c2" stroke="#2f3640" strokeWidth="2" />
            <text x="130" y="173" textAnchor="middle" fontSize="11" fill="#111827">context</text>
          </g>

          {/* ── Output pill ────────────────────────────── */}
          <g className={isPlaying ? 'strategy-node-pop pop-delay-2' : undefined}>
            <rect x="760" y="108" width="155" height="42" rx="8" fill="#efcfd8" stroke="#2f3640" strokeWidth="2" />
            <text x="837" y="134" textAnchor="middle" fontSize="11" fill="#111827">response</text>
          </g>

          {/* ── Top-level flow lines ───────────────────── */}
          <path className="rlm-arch-line" d="M 175 113 H 290" />
          <path className="rlm-arch-line" d="M 230 168 H 290" />
          <path className="rlm-arch-line" d="M 670 129 H 760" />

          {/* ── Delegation arrow to Pass 1 ─────────────── */}
          <SpawnPath d="M 480 250 V 320" timing="0;0.12;0.28;1" reduceMotion={reduceMotion} animate={isPlaying} />

          {/* ── Pass 1: Initial Extraction ─────────────── */}
          <SpawnGroup
            timing="0;0.12;0.30;1" reduceMotion={reduceMotion} animate={isPlaying}
            cx={480} cy={390} rootCx={440} rootCy={130}
          >
            <text x="250" y="315" fontSize="17" fontWeight="700" fill="#111827">Pass 1</text>
            <text x="330" y="315" fontSize="14" fill="#334155">Initial Extraction</text>
            <rect x="240" y="325" width="480" height="130" rx="7" fill="#bcd0dc" stroke="#2f3640" strokeWidth="2" />
            <rect
              x="310" y="350" width="180" height="80" rx="8"
              fill="#bee5be" stroke="#2f3640" strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow delay-1' : undefined}
            />
            <text x="400" y="383" textAnchor="middle" fontSize="14" fill="#111827">Extractor LM</text>
            <text x="400" y="403" textAnchor="middle" fontSize="10" fill="#334155">5 extraction questions</text>
            <rect x="540" y="365" width="150" height="38" rx="6" fill="#dee3c2" stroke="#2f3640" strokeWidth="1.5" />
            <text x="615" y="389" textAnchor="middle" fontSize="10" fill="#111827">output₁ (NL blob)</text>
          </SpawnGroup>

          {/* ── Arrow from Pass 1 to Pass 2 ────────────── */}
          <SpawnPath d="M 480 455 V 510" timing="0;0.36;0.52;1" reduceMotion={reduceMotion} animate={isPlaying} />

          {/* ── Pass 2: Re-read & Refine ───────────────── */}
          <SpawnGroup
            timing="0;0.36;0.54;1" reduceMotion={reduceMotion} animate={isPlaying}
            cx={480} cy={580} rootCx={440} rootCy={130}
          >
            <text x="250" y="507" fontSize="17" fontWeight="700" fill="#111827">Pass 2</text>
            <text x="330" y="507" fontSize="14" fill="#334155">Re-read &amp; Refine</text>
            <rect x="240" y="517" width="480" height="130" rx="7" fill="#bcd0dc" stroke="#2f3640" strokeWidth="2" />
            <rect
              x="310" y="542" width="180" height="80" rx="8"
              fill="#bee5be" stroke="#2f3640" strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow delay-2' : undefined}
            />
            <text x="400" y="575" textAnchor="middle" fontSize="14" fill="#111827">Re-extractor LM</text>
            <text x="400" y="595" textAnchor="middle" fontSize="10" fill="#334155">fresh eyes on output₁</text>
            <rect x="540" y="557" width="150" height="38" rx="6" fill="#dee3c2" stroke="#2f3640" strokeWidth="1.5" />
            <text x="615" y="581" textAnchor="middle" fontSize="10" fill="#111827">output₂ (refined)</text>
          </SpawnGroup>

          {/* ── Return arrow: Pass 2 → Root ────────────── */}
          <SpawnPath
            d="M 720 582 H 830 V 180 H 670"
            timing="0;0.62;0.82;1"
            reduceMotion={reduceMotion}
            animate={isPlaying}
          />
          <text x="848" y="400" fontSize="10" fill="#334155" writingMode="vertical-rl">refined knowledge</text>
        </svg>
      </div>
    </AnimationCard>
  );
}
