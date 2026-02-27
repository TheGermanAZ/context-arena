import { useAnimationPlayer, SpawnPath, SpawnGroup, AnimationCard } from './animationUtils';

export default function PersistentRlmFlowAnimation() {
  const { reduceMotion, isPlaying, hasPlayed, playKey, onPlay } = useAnimationPlayer();

  const stores = [
    { label: 'IDs', x: 180 },
    { label: 'Entities', x: 310 },
    { label: 'Quantities', x: 440 },
    { label: 'Dates', x: 570 },
    { label: 'Corrections', x: 700 },
    { label: 'Structural', x: 830 },
  ];

  return (
    <AnimationCard
      title="PersistentRLM Execution"
      subtitle="Same single sub-LLM call as base RLM, but output is parsed into 6 typed stores that merge incrementally — no wholesale replacement."
      playingClassName="bg-orange-500/20 border-orange-400/40 text-orange-200 cursor-wait"
      isPlaying={isPlaying}
      hasPlayed={hasPlayed}
      reduceMotion={reduceMotion}
      onPlay={onPlay}
      footnote="Same cost as base RLM — the parsing and incremental merge happen locally, not via additional LLM calls."
    >
      <div className="overflow-x-auto rounded-lg border border-gray-700 bg-[#d9d9d9]">
        <svg
          key={`persistent-rlm-${playKey}`}
          className="w-full h-auto rlm-arch-diagram"
          viewBox="0 0 1060 700"
          role="img"
          aria-label="PersistentRLM architecture showing sub-LLM delegation then parsing into 6 typed stores with incremental merge"
        >
          <defs>
            <marker id="rlm-arrow-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f3640" />
            </marker>
          </defs>

          {/* ── Title ──────────────────────────────────── */}
          <text x="340" y="44" fontSize="21" fontWeight="700" fill="#111827">PersistentRLM</text>
          <text x="535" y="44" fontSize="21" fill="#111827">(root)</text>

          {/* ── Root RLM panel ─────────────────────────── */}
          <rect
            x="330" y="55" width="400" height="180" rx="7"
            fill="#bcd0dc" stroke="#2f3640" strokeWidth="2"
            className={isPlaying ? 'strategy-node-pop' : undefined}
          />
          <g className={isPlaying ? 'strategy-node-pop pop-delay-1' : undefined}>
            <rect
              x="395" y="82" width="190" height="90" rx="8"
              fill="#bee5be" stroke="#2f3640" strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow' : undefined}
            />
            <text x="490" y="117" textAnchor="middle" fontSize="15" fill="#111827">Language</text>
            <text x="490" y="140" textAnchor="middle" fontSize="15" fill="#111827">Model</text>
          </g>
          <text x="530" y="210" textAnchor="middle" fontSize="10.5" fill="#334155">delegates to sub-LLM</text>

          {/* ── Input pills ────────────────────────────── */}
          <g className={isPlaying ? 'strategy-node-pop pop-delay-1' : undefined}>
            <rect x="75" y="92" width="120" height="36" rx="8" fill="#e7c5e5" stroke="#2f3640" strokeWidth="2" />
            <text x="135" y="115" textAnchor="middle" fontSize="11" fill="#111827">query</text>
          </g>
          <g className={isPlaying ? 'strategy-node-pop pop-delay-1' : undefined}>
            <rect x="50" y="147" width="200" height="36" rx="8" fill="#dee3c2" stroke="#2f3640" strokeWidth="2" />
            <text x="150" y="170" textAnchor="middle" fontSize="11" fill="#111827">context</text>
          </g>

          {/* ── Output pill ────────────────────────────── */}
          <g className={isPlaying ? 'strategy-node-pop pop-delay-2' : undefined}>
            <rect x="830" y="105" width="155" height="42" rx="8" fill="#efcfd8" stroke="#2f3640" strokeWidth="2" />
            <text x="907" y="131" textAnchor="middle" fontSize="11" fill="#111827">response</text>
          </g>

          {/* ── Top flow lines ─────────────────────────── */}
          <path className="rlm-arch-line" d="M 195 110 H 330" />
          <path className="rlm-arch-line" d="M 250 165 H 330" />
          <path className="rlm-arch-line" d="M 730 126 H 830" />

          {/* ── Delegation arrow ───────────────────────── */}
          <SpawnPath d="M 530 235 V 300" timing="0;0.10;0.24;1" reduceMotion={reduceMotion} animate={isPlaying} />

          {/* ── Sub-LLM + Parser panel ─────────────────── */}
          <SpawnGroup
            timing="0;0.10;0.28;1" reduceMotion={reduceMotion} animate={isPlaying}
            cx={530} cy={380} rootCx={490} rootCy={127}
          >
            <text x="340" y="296" fontSize="17" fontWeight="700" fill="#111827">Sub-LLM + Parser</text>
            <rect x="330" y="305" width="400" height="155" rx="7" fill="#bcd0dc" stroke="#2f3640" strokeWidth="2" />
            <rect
              x="370" y="325" width="160" height="70" rx="8"
              fill="#bee5be" stroke="#2f3640" strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow delay-1' : undefined}
            />
            <text x="450" y="355" textAnchor="middle" fontSize="13" fill="#111827">Extractor LM</text>
            <text x="450" y="375" textAnchor="middle" fontSize="10" fill="#334155">same prompt as RLM</text>

            {/* Parser box */}
            <rect
              x="580" y="325" width="120" height="70" rx="8"
              fill="#f9f0ca" stroke="#2f3640" strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow delay-2' : undefined}
            />
            <text x="640" y="355" textAnchor="middle" fontSize="13" fill="#111827">Parser</text>
            <text x="640" y="375" textAnchor="middle" fontSize="10" fill="#334155">section → stores</text>

            {/* Internal arrow: extractor → parser */}
            <path className="rlm-arch-line" d="M 530 360 H 580" />

            <text x="530" y="440" textAnchor="middle" fontSize="10" fill="#334155">routes structured output to typed stores</text>
          </SpawnGroup>

          {/* ── Fan-out arrows from parser to stores ───── */}
          {stores.map((store, i) => (
            <SpawnPath
              key={store.label}
              d={`M 530 460 L ${store.x + 50} 540`}
              timing={`0;${(0.4 + i * 0.04).toFixed(2)};${(0.56 + i * 0.04).toFixed(2)};1`}
              reduceMotion={reduceMotion}
              animate={isPlaying}
            />
          ))}

          {/* ── 6 Typed Store boxes ────────────────────── */}
          <SpawnGroup
            timing="0;0.42;0.60;1" reduceMotion={reduceMotion} animate={isPlaying}
            cx={530} cy={590} rootCx={490} rootCy={127}
          >
            {stores.map((store, i) => (
              <g key={store.label}>
                <rect
                  x={store.x} y="545" width="100" height="60" rx="7"
                  fill="#f9f0ca" stroke="#2f3640" strokeWidth="2"
                  className={isPlaying ? 'rlm-node-glow' : undefined}
                  style={isPlaying ? { animationDelay: `${1.2 + i * 0.15}s` } : undefined}
                />
                <text x={store.x + 50} y="572" textAnchor="middle" fontSize="11" fontWeight="600" fill="#111827">{store.label}</text>
                <text x={store.x + 50} y="590" textAnchor="middle" fontSize="8" fill="#334155">persist</text>
              </g>
            ))}
            <text x="530" y="630" textAnchor="middle" fontSize="10" fill="#334155">stores merge incrementally — corrections are append-only</text>
          </SpawnGroup>

          {/* ── Return arrow: stores → root ────────────── */}
          <SpawnPath
            d="M 230 575 H 100 V 155 H 330"
            timing="0;0.68;0.86;1"
            reduceMotion={reduceMotion}
            animate={isPlaying}
          />
          <text x="78" y="380" fontSize="10" fill="#334155" writingMode="vertical-rl">stores feed context</text>
        </svg>
      </div>
    </AnimationCard>
  );
}
