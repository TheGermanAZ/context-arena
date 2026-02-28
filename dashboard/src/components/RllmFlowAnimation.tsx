import { useAnimationPlayer, SpawnPath, SpawnGroup, AnimationCard } from './animationUtils';
import { SPAWN_DURATION } from './animationConstants';

export default function RllmFlowAnimation() {
  const { reduceMotion, isPlaying, hasPlayed, playKey, onPlay } = useAnimationPlayer();

  return (
    <AnimationCard
      title="RLLM Execution"
      subtitle="The sub-agent writes JavaScript extraction code that runs in a V8 isolate. Adds code-generation indirection between understanding and extraction."
      playingClassName="bg-red-500/20 border-red-400/40 text-red-200 cursor-wait"
      isPlaying={isPlaying}
      hasPlayed={hasPlayed}
      reduceMotion={reduceMotion}
      onPlay={onPlay}
      footnote="Code-generation indirection loses most facts — only 11% retention vs 79% for hand-rolled RLM. The LLM understands the conversation but can't encode that understanding into extraction code."
    >
      <div className="overflow-x-auto rounded-lg border border-gray-700 bg-[#d9d9d9]">
        <svg
          key={`rllm-${playKey}`}
          className="w-full h-auto rlm-arch-diagram"
          viewBox="0 0 1000 720"
          role="img"
          aria-label="RLLM architecture showing code generation by LLM feeding into V8 sandbox execution with iterative refinement"
        >
          <defs>
            <marker id="rlm-arrow-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#2f3640" />
            </marker>
          </defs>

          {/* ── Title ──────────────────────────────────── */}
          <text x="310" y="44" fontSize="21" fontWeight="700" fill="#111827">RLLM</text>
          <text x="382" y="44" fontSize="21" fill="#111827">(root)</text>

          {/* ── Root RLM panel ─────────────────────────── */}
          <rect
            x="300" y="55" width="400" height="180" rx="7"
            fill="#bcd0dc" stroke="#2f3640" strokeWidth="2"
            className={isPlaying ? 'strategy-node-pop' : undefined}
          />
          <g className={isPlaying ? 'strategy-node-pop pop-delay-1' : undefined}>
            <rect
              x="365" y="82" width="190" height="90" rx="8"
              fill="#bee5be" stroke="#2f3640" strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow' : undefined}
            />
            <text x="460" y="117" textAnchor="middle" fontSize="15" fill="#111827">Language</text>
            <text x="460" y="140" textAnchor="middle" fontSize="15" fill="#111827">Model</text>
          </g>
          <text x="500" y="210" textAnchor="middle" fontSize="10.5" fill="#334155">delegates to agentic code generator</text>

          {/* ── Input pills ────────────────────────────── */}
          <g className={isPlaying ? 'strategy-node-pop pop-delay-1' : undefined}>
            <rect x="60" y="92" width="120" height="36" rx="8" fill="#e7c5e5" stroke="#2f3640" strokeWidth="2" />
            <text x="120" y="115" textAnchor="middle" fontSize="11" fill="#111827">query</text>
          </g>
          <g className={isPlaying ? 'strategy-node-pop pop-delay-1' : undefined}>
            <rect x="35" y="147" width="200" height="36" rx="8" fill="#dee3c2" stroke="#2f3640" strokeWidth="2" />
            <text x="135" y="170" textAnchor="middle" fontSize="11" fill="#111827">context</text>
          </g>

          {/* ── Output pill (animates in last) ────────── */}
          <g className={isPlaying ? 'strategy-node-pop pop-delay-last' : undefined}>
            <rect x="790" y="108" width="155" height="42" rx="8" fill="#efcfd8" stroke="#2f3640" strokeWidth="2" />
            <text x="867" y="134" textAnchor="middle" fontSize="11" fill="#111827">response</text>
          </g>

          {/* ── Top flow lines ─────────────────────────── */}
          <path className="rlm-arch-line" d="M 180 110 H 300" />
          <path className="rlm-arch-line" d="M 235 165 H 300" />
          <SpawnPath d="M 700 129 H 790" timing="0;0.88;0.96;1" reduceMotion={reduceMotion} animate={isPlaying} />

          {/* ── Delegation arrow ───────────────────────── */}
          <SpawnPath d="M 500 235 V 298" timing="0;0.10;0.24;1" reduceMotion={reduceMotion} animate={isPlaying} />

          {/* ── Code Generator panel ───────────────────── */}
          <SpawnGroup
            timing="0;0.10;0.28;1" reduceMotion={reduceMotion} animate={isPlaying}
            cx={500} cy={395} rootCx={460} rootCy={127}
          >
            <text x="230" y="296" fontSize="17" fontWeight="700" fill="#111827">Code Generator</text>
            <text x="405" y="296" fontSize="12" fill="#334155">(agentic, up to 5 iterations)</text>
            <rect x="220" y="305" width="560" height="185" rx="7" fill="#bcd0dc" stroke="#2f3640" strokeWidth="2" />

            {/* Code generator LM */}
            <rect
              x="260" y="325" width="180" height="80" rx="8"
              fill="#bee5be" stroke="#2f3640" strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow delay-1' : undefined}
            />
            <text x="350" y="358" textAnchor="middle" fontSize="13" fill="#111827">Code Gen LM</text>
            <text x="350" y="378" textAnchor="middle" fontSize="10" fill="#334155">writes JS extraction</text>

            {/* Arrow to code box */}
            <path className="rlm-arch-line" d="M 440 365 H 490" />

            {/* Generated code display */}
            <rect
              x="495" y="325" width="260" height="110" rx="8"
              fill="#ef8589" stroke="#2f3640" strokeWidth="2"
              className={isPlaying ? 'rlm-node-glow delay-2' : undefined}
            />
            <text x="625" y="348" textAnchor="middle" fontSize="12" fontWeight="600" fill="#111827">V8 Sandbox</text>
            <rect x="508" y="358" width="234" height="60" rx="4" fill="#1f2937" />
            <text x="515" y="375" fontSize="8" fill="#a5f3fc">// generated extraction code</text>
            <text x="515" y="388" fontSize="8" fill="#f5f5f5">const facts = transcript</text>
            <text x="515" y="401" fontSize="8" fill="#f5f5f5">{'  '}.filter(t =&gt; t.role === &apos;user&apos;)</text>
            <text x="515" y="414" fontSize="8" fill="#f5f5f5">{'  '}.map(extractEntities)</text>

            {/* Iteration loop arrow */}
            <path className="rlm-arch-line" d="M 720 442 H 740 V 355 H 720" />
            <text x="762" y="400" fontSize="9" fill="#334155" writingMode="vertical-rl">iterate</text>

            <text x="500" y="475" textAnchor="middle" fontSize="10" fill="#334155">LM generates code → V8 executes → LM refines (up to 5×)</text>
          </SpawnGroup>

          {/* ── Arrow to output ────────────────────────── */}
          <SpawnPath d="M 500 490 V 545" timing="0;0.50;0.66;1" reduceMotion={reduceMotion} animate={isPlaying} />

          {/* ── Sparse output ──────────────────────────── */}
          <SpawnGroup
            timing="0;0.52;0.68;1" reduceMotion={reduceMotion} animate={isPlaying}
            cx={500} cy={600} rootCx={460} rootCy={127}
          >
            <rect x="280" y="550" width="440" height="100" rx="7" fill="#f3cdcf" stroke="#2f3640" strokeWidth="2" />
            <text x="500" y="580" textAnchor="middle" fontSize="14" fontWeight="600" fill="#111827">Extracted Facts (sparse)</text>
            <text x="500" y="600" textAnchor="middle" fontSize="11" fill="#be123c">only 11% fact retention</text>

            {/* Sparse bars showing low retention */}
            <rect x="320" y="615" width="360" height="8" rx="3" fill="#e7d0d0" />
            <rect x="320" y="615" width="40" height="8" rx="3" fill="#dc2626" opacity="0.8">
              {!reduceMotion && isPlaying && (
                <animate attributeName="width" values="0;0;40;40" keyTimes="0;0.52;0.72;1" dur={SPAWN_DURATION} repeatCount="1" />
              )}
            </rect>
            <text x="500" y="636" textAnchor="middle" fontSize="9" fill="#334155">code understands structure but loses factual detail</text>
          </SpawnGroup>

          {/* ── Return arrow ───────────────────────────── */}
          <SpawnPath
            d="M 720 600 H 870 V 180 H 700"
            timing="0;0.72;0.88;1"
            reduceMotion={reduceMotion}
            animate={isPlaying}
          />
          <text x="888" y="400" fontSize="10" fill="#334155" writingMode="vertical-rl">sparse knowledge</text>
        </svg>
      </div>
    </AnimationCard>
  );
}
