import { useAnimationPlayer, SpawnPath, SpawnGroup, AnimationCard } from './animationUtils';
import { SPAWN_DURATION } from './animationConstants';

export default function QpbFlowAnimation() {
  const { reduceMotion, isPlaying, hasPlayed, playKey, onPlay } = useAnimationPlayer();

  const pinnedValues = [
    { label: '$465,000', y: 608 },
    { label: 'POL-2024-8891', y: 632 },
    { label: '090-8765-4321', y: 656 },
    { label: '$12,500/year', y: 680 },
  ];

  return (
    <AnimationCard
      title="Quantity-Pinning Buffer Execution"
      subtitle="Extends RLM with a zero-cost regex side-channel. After each delegation, scans for dollar amounts, IDs, phone numbers and pins them in a persistent buffer."
      playingClassName="bg-emerald-500/20 border-emerald-400/40 text-emerald-200 cursor-wait"
      isPlaying={isPlaying}
      hasPlayed={hasPlayed}
      reduceMotion={reduceMotion}
      onPlay={onPlay}
      footnote="Same LLM cost as base RLM — the regex scanner and pinned buffer are zero-cost local operations that protect the highest-loss fact type."
    >
      <div className="overflow-x-auto rounded-lg border border-gray-700 bg-[#d9d9d9]">
        <svg
          key={`qpb-${playKey}`}
          className="w-full h-auto rlm-arch-diagram"
          viewBox="0 0 1060 740"
          role="img"
          aria-label="QPB architecture showing RLM delegation with parallel regex scanning into a pinned quantity buffer"
        >
          <defs>
            <marker id="rlm-arrow-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f3640" />
            </marker>
          </defs>

          {/* ── Title ──────────────────────────────────── */}
          <text x="320" y="44" fontSize="21" fontWeight="700" fill="#111827">QPB</text>
          <text x="380" y="44" fontSize="21" fill="#111827">(root)</text>
          <text x="450" y="44" fontSize="14" fill="#334155">RLM + regex pinning</text>

          {/* ── Root RLM panel ─────────────────────────── */}
          <rect
            x="310" y="55" width="400" height="180" rx="7"
            fill="#bcd0dc" stroke="#2f3640" strokeWidth="2"
            className={isPlaying ? 'strategy-node-pop' : undefined}
          />
          <g className={isPlaying ? 'strategy-node-pop pop-delay-1' : undefined}>
            <rect
              x="375" y="82" width="190" height="90" rx="8"
              fill="#bee5be" stroke="#2f3640" strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow' : undefined}
            />
            <text x="470" y="117" textAnchor="middle" fontSize="15" fill="#111827">Language</text>
            <text x="470" y="140" textAnchor="middle" fontSize="15" fill="#111827">Model</text>
          </g>
          <text x="510" y="210" textAnchor="middle" fontSize="10.5" fill="#334155">delegates (same as base RLM)</text>

          {/* ── Input pills ────────────────────────────── */}
          <g className={isPlaying ? 'strategy-node-pop pop-delay-1' : undefined}>
            <rect x="60" y="92" width="120" height="36" rx="8" fill="#e7c5e5" stroke="#2f3640" strokeWidth="2" />
            <text x="120" y="115" textAnchor="middle" fontSize="11" fill="#111827">query</text>
          </g>
          <g className={isPlaying ? 'strategy-node-pop pop-delay-1' : undefined}>
            <rect x="35" y="147" width="200" height="36" rx="8" fill="#dee3c2" stroke="#2f3640" strokeWidth="2" />
            <text x="135" y="170" textAnchor="middle" fontSize="11" fill="#111827">context</text>
          </g>

          {/* ── Output pill ────────────────────────────── */}
          <g className={isPlaying ? 'strategy-node-pop pop-delay-2' : undefined}>
            <rect x="830" y="108" width="155" height="42" rx="8" fill="#efcfd8" stroke="#2f3640" strokeWidth="2" />
            <text x="907" y="134" textAnchor="middle" fontSize="11" fill="#111827">response</text>
          </g>

          {/* ── Top flow lines ─────────────────────────── */}
          <path className="rlm-arch-line" d="M 180 110 H 310" />
          <path className="rlm-arch-line" d="M 235 165 H 310" />
          <path className="rlm-arch-line" d="M 710 129 H 830" />

          {/* ── Delegation arrow ───────────────────────── */}
          <SpawnPath d="M 510 235 V 300" timing="0;0.10;0.24;1" reduceMotion={reduceMotion} animate={isPlaying} />

          {/* ── Sub-LLM panel ──────────────────────────── */}
          <SpawnGroup
            timing="0;0.10;0.28;1" reduceMotion={reduceMotion} animate={isPlaying}
            cx={430} cy={375} rootCx={470} rootCy={127}
          >
            <text x="240" y="296" fontSize="17" fontWeight="700" fill="#111827">Sub-LLM</text>
            <text x="350" y="296" fontSize="12" fill="#334155">(standard RLM extraction)</text>
            <rect x="230" y="305" width="400" height="130" rx="7" fill="#bcd0dc" stroke="#2f3640" strokeWidth="2" />
            <rect
              x="290" y="325" width="180" height="80" rx="8"
              fill="#bee5be" stroke="#2f3640" strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow delay-1' : undefined}
            />
            <text x="380" y="358" textAnchor="middle" fontSize="13" fill="#111827">Extractor LM</text>
            <text x="380" y="378" textAnchor="middle" fontSize="10" fill="#334155">5 extraction questions</text>

            <rect x="510" y="340" width="100" height="50" rx="6" fill="#dee3c2" stroke="#2f3640" strokeWidth="1.5" />
            <text x="560" y="362" textAnchor="middle" fontSize="10" fill="#111827">NL output</text>
            <text x="560" y="378" textAnchor="middle" fontSize="8" fill="#334155">(knowledge blob)</text>
          </SpawnGroup>

          {/* ── Split: two paths from sub-LLM output ──── */}

          {/* Left path: NL knowledge blob */}
          <SpawnPath d="M 360 435 V 490" timing="0;0.34;0.50;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <SpawnGroup
            timing="0;0.36;0.54;1" reduceMotion={reduceMotion} animate={isPlaying}
            cx={300} cy={550} rootCx={470} rootCy={127}
          >
            <rect x="175" y="495" width="250" height="110" rx="7" fill="#f9f0ca" stroke="#2f3640" strokeWidth="2" />
            <text x="300" y="520" textAnchor="middle" fontSize="13" fontWeight="600" fill="#111827">Delegated Knowledge</text>
            <text x="300" y="540" textAnchor="middle" fontSize="10" fill="#334155">NL blob (wholesale replace)</text>
            <rect x="195" y="555" width="210" height="12" rx="5" fill="#e7ddaf" />
            <rect x="195" y="555" width="160" height="12" rx="5" fill="#c7b269">
              {!reduceMotion && isPlaying && (
                <animate attributeName="width" values="40;40;160;160" keyTimes="0;0.36;0.60;1" dur={SPAWN_DURATION} repeatCount="1" />
              )}
            </rect>
            <rect x="195" y="573" width="210" height="12" rx="5" fill="#e7ddaf" />
            <rect x="195" y="573" width="130" height="12" rx="5" fill="#c7b269">
              {!reduceMotion && isPlaying && (
                <animate attributeName="width" values="30;30;130;130" keyTimes="0;0.38;0.62;1" dur={SPAWN_DURATION} repeatCount="1" />
              )}
            </rect>
          </SpawnGroup>

          {/* Right path: Regex scanner → Pinned buffer */}
          <SpawnPath d="M 560 390 H 670 V 460" timing="0;0.34;0.50;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <text x="630" y="430" fontSize="10" fill="#334155">regex scan</text>

          {/* Regex Scanner */}
          <SpawnGroup
            timing="0;0.38;0.56;1" reduceMotion={reduceMotion} animate={isPlaying}
            cx={760} cy={490} rootCx={470} rootCy={127}
          >
            <rect
              x="620" y="465" width="280" height="65" rx="7"
              fill="#ef8589" stroke="#2f3640" strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow delay-2' : undefined}
            />
            <text x="760" y="490" textAnchor="middle" fontSize="13" fontWeight="600" fill="#111827">Regex Scanner</text>
            <text x="760" y="510" textAnchor="middle" fontSize="9" fill="#334155">$amounts · IDs · phones · percentages · rates</text>
          </SpawnGroup>

          {/* Arrow: scanner → pinned buffer */}
          <SpawnPath d="M 760 530 V 565" timing="0;0.50;0.64;1" reduceMotion={reduceMotion} animate={isPlaying} />

          {/* Pinned Values Buffer */}
          <SpawnGroup
            timing="0;0.50;0.66;1" reduceMotion={reduceMotion} animate={isPlaying}
            cx={760} cy={635} rootCx={470} rootCy={127}
          >
            <rect x="620" y="570" width="280" height="130" rx="7" fill="#d8f0e4" stroke="#2f3640" strokeWidth="2" />
            <text x="760" y="593" textAnchor="middle" fontSize="12" fontWeight="600" fill="#111827">Pinned Buffer (persist)</text>
            {pinnedValues.map((pv, i) => (
              <g key={pv.label}>
                <rect
                  x="640" y={pv.y - 12} width="240" height="22" rx="4"
                  fill="#b8e8d0" stroke="#059669" strokeWidth="1"
                />
                <text x="655" y={pv.y + 3} fontSize="10" fontWeight="600" fill="#065f46">{pv.label}</text>
                {!reduceMotion && isPlaying && (
                  <animate
                    attributeName="opacity"
                    values="0;0;1;1"
                    keyTimes={`0;${(0.52 + i * 0.05).toFixed(2)};${(0.60 + i * 0.05).toFixed(2)};1`}
                    dur={SPAWN_DURATION}
                    repeatCount="1"
                  />
                )}
              </g>
            ))}
          </SpawnGroup>

          {/* ── Merge arrows: both paths → root ────────── */}
          <SpawnPath
            d="M 175 550 H 100 V 165 H 310"
            timing="0;0.68;0.84;1"
            reduceMotion={reduceMotion}
            animate={isPlaying}
          />
          <SpawnPath
            d="M 900 625 H 950 V 165 H 710"
            timing="0;0.72;0.88;1"
            reduceMotion={reduceMotion}
            animate={isPlaying}
          />
          <text x="78" y="380" fontSize="10" fill="#334155" writingMode="vertical-rl">NL blob to context</text>
          <text x="968" y="420" fontSize="10" fill="#334155" writingMode="vertical-rl">pinned values to context</text>
        </svg>
      </div>
    </AnimationCard>
  );
}
