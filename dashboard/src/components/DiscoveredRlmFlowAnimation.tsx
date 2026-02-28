import { useAnimationPlayer, SpawnPath, SpawnGroup, AnimationCard } from './animationUtils';

export default function DiscoveredRlmFlowAnimation() {
  const { reduceMotion, isPlaying, hasPlayed, playKey, onPlay } = useAnimationPlayer();

  return (
    <AnimationCard
      title="DiscoveredRLM Execution"
      subtitle="Encodes the best extraction patterns found in CTX-4: chunk-level exhaustive extraction → consolidated synthesis → verification audit."
      playingClassName="bg-rose-500/20 border-rose-400/40 text-rose-200 cursor-wait"
      isPlaying={isPlaying}
      hasPlayed={hasPlayed}
      reduceMotion={reduceMotion}
      onPlay={onPlay}
      footnote="Two sub-LLM calls per cycle (2× base RLM cost) — the verification pass catches omissions and fixes broken associations."
    >
      <div className="overflow-x-auto rounded-lg border border-gray-700 bg-[#d9d9d9]">
        <svg
          key={`discovered-rlm-${playKey}`}
          className="w-full h-auto rlm-arch-diagram"
          viewBox="0 0 1060 780"
          role="img"
          aria-label="DiscoveredRLM architecture showing parallel chunk extraction, consolidation, and verification audit"
        >
          <defs>
            <marker id="rlm-arrow-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f3640" />
            </marker>
          </defs>

          {/* ── Title ──────────────────────────────────── */}
          <text x="50" y="40" fontSize="21" fontWeight="700" fill="#111827">DiscoveredRLM</text>
          <text x="260" y="40" fontSize="14" fill="#334155">chunk → consolidate → verify</text>

          {/* ── Conversation transcript ────────────────── */}
          <g className={isPlaying ? 'strategy-node-pop' : undefined}>
            <rect x="50" y="60" width="960" height="60" rx="8" fill="#dee3c2" stroke="#2f3640" strokeWidth="2" />
            <text x="530" y="88" textAnchor="middle" fontSize="13" fill="#111827">Conversation Transcript</text>
            <text x="530" y="105" textAnchor="middle" fontSize="10" fill="#334155">split into chunks for exhaustive extraction</text>
          </g>

          {/* ── Chunk split arrows ─────────────────────── */}
          <SpawnPath d="M 230 120 V 170" timing="0;0.06;0.16;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <SpawnPath d="M 530 120 V 170" timing="0;0.08;0.18;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <SpawnPath d="M 830 120 V 170" timing="0;0.10;0.20;1" reduceMotion={reduceMotion} animate={isPlaying} />

          {/* ── Pass 1: Parallel chunk extractors ──────── */}
          <SpawnGroup
            timing="0;0.08;0.22;1" reduceMotion={reduceMotion} animate={isPlaying}
            cx={530} cy={240} rootCx={530} rootCy={90}
          >
            <text x="50" y="168" fontSize="15" fontWeight="700" fill="#111827">Pass 1</text>
            <text x="120" y="168" fontSize="12" fill="#334155">Chunk Extraction (parallel)</text>

            {/* Chunk 1 */}
            <rect x="100" y="178" width="260" height="120" rx="7" fill="#bcd0dc" stroke="#2f3640" strokeWidth="2" />
            <text x="230" y="198" textAnchor="middle" fontSize="11" fontWeight="600" fill="#111827">Chunk 1</text>
            <rect
              x="145" y="208" width="170" height="68" rx="8"
              fill="#bee5be" stroke="#2f3640" strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow' : undefined}
            />
            <text x="230" y="240" textAnchor="middle" fontSize="12" fill="#111827">Extractor LM</text>
            <text x="230" y="258" textAnchor="middle" fontSize="9" fill="#334155">exhaustive per-chunk</text>

            {/* Chunk 2 */}
            <rect x="400" y="178" width="260" height="120" rx="7" fill="#bcd0dc" stroke="#2f3640" strokeWidth="2" />
            <text x="530" y="198" textAnchor="middle" fontSize="11" fontWeight="600" fill="#111827">Chunk 2</text>
            <rect
              x="445" y="208" width="170" height="68" rx="8"
              fill="#bee5be" stroke="#2f3640" strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow delay-1' : undefined}
            />
            <text x="530" y="240" textAnchor="middle" fontSize="12" fill="#111827">Extractor LM</text>
            <text x="530" y="258" textAnchor="middle" fontSize="9" fill="#334155">exhaustive per-chunk</text>

            {/* Chunk 3 */}
            <rect x="700" y="178" width="260" height="120" rx="7" fill="#bcd0dc" stroke="#2f3640" strokeWidth="2" />
            <text x="830" y="198" textAnchor="middle" fontSize="11" fontWeight="600" fill="#111827">Chunk 3</text>
            <rect
              x="745" y="208" width="170" height="68" rx="8"
              fill="#bee5be" stroke="#2f3640" strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow delay-2' : undefined}
            />
            <text x="830" y="240" textAnchor="middle" fontSize="12" fill="#111827">Extractor LM</text>
            <text x="830" y="258" textAnchor="middle" fontSize="9" fill="#334155">exhaustive per-chunk</text>
          </SpawnGroup>

          {/* ── Convergence arrows to consolidator ─────── */}
          <SpawnPath d="M 230 298 L 430 380" timing="0;0.28;0.42;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <SpawnPath d="M 530 298 V 380" timing="0;0.30;0.44;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <SpawnPath d="M 830 298 L 630 380" timing="0;0.32;0.46;1" reduceMotion={reduceMotion} animate={isPlaying} />

          {/* ── Consolidator ───────────────────────────── */}
          <SpawnGroup
            timing="0;0.30;0.48;1" reduceMotion={reduceMotion} animate={isPlaying}
            cx={530} cy={430} rootCx={530} rootCy={90}
          >
            <rect x="350" y="385" width="360" height="100" rx="7" fill="#f9f0ca" stroke="#2f3640" strokeWidth="2" />
            <text x="530" y="415" textAnchor="middle" fontSize="14" fontWeight="600" fill="#111827">Consolidator</text>
            <text x="530" y="438" textAnchor="middle" fontSize="11" fill="#334155">merges chunk extractions into unified state</text>
            <text x="530" y="458" textAnchor="middle" fontSize="10" fill="#334155">IDs · entities · quantities · dates · corrections</text>
          </SpawnGroup>

          {/* ── Arrow to Pass 2 ────────────────────────── */}
          <SpawnPath d="M 530 485 V 540" timing="0;0.50;0.62;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <text x="560" y="518" fontSize="11" fill="#334155">consolidated state</text>

          {/* ── Pass 2: Verification audit ─────────────── */}
          <SpawnGroup
            timing="0;0.50;0.66;1" reduceMotion={reduceMotion} animate={isPlaying}
            cx={530} cy={600} rootCx={530} rootCy={90}
          >
            <text x="270" y="538" fontSize="15" fontWeight="700" fill="#111827">Pass 2</text>
            <text x="340" y="538" fontSize="12" fill="#334155">Verification Audit</text>
            <rect x="270" y="548" width="520" height="120" rx="7" fill="#bcd0dc" stroke="#2f3640" strokeWidth="2" />
            <rect
              x="320" y="568" width="180" height="72" rx="8"
              fill="#bee5be" stroke="#2f3640" strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow delay-3' : undefined}
            />
            <text x="410" y="598" textAnchor="middle" fontSize="13" fill="#111827">Verifier LM</text>
            <text x="410" y="618" textAnchor="middle" fontSize="10" fill="#334155">audits against source</text>

            <rect x="550" y="575" width="210" height="60" rx="6" fill="#ef8589" stroke="#2f3640" strokeWidth="1.5" />
            <rect x="558" y="583" width="194" height="22" rx="3" fill="#1f2937" />
            <text x="564" y="597" fontSize="8" fill="#f5f5f5">✓ missing facts  ✓ incorrect values</text>
            <text x="564" y="621" fontSize="8" fill="#111827">✓ broken associations  ✓ anchors</text>
          </SpawnGroup>

          {/* ── Final output ───────────────────────────── */}
          <SpawnPath d="M 530 668 V 720" timing="0;0.86;0.96;1" reduceMotion={reduceMotion} animate={isPlaying} />
          <g className={isPlaying ? 'strategy-node-pop pop-delay-last' : undefined}>
            <rect x="400" y="725" width="260" height="40" rx="8" fill="#efcfd8" stroke="#2f3640" strokeWidth="2" />
            <text x="530" y="750" textAnchor="middle" fontSize="12" fill="#111827">verified knowledge state</text>
          </g>
        </svg>
      </div>
    </AnimationCard>
  );
}
