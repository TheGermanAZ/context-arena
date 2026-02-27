# CTX-40: Define RLM vNext experiment matrix with stop/go gates

## Scope
Create a concrete, execution-ready RLM vNext experiment matrix that turns current findings into prioritized runs, explicit configurations, measurement plan, and stop/go criteria.

## Approach
1. Synthesize baseline metrics from current findings/scoreboards into a short baseline section.
2. Define phased experiments (high-confidence quick wins first, expensive architectural variants later).
3. For each experiment, specify:
   - hypothesis
   - variants/configurations
   - datasets/scenarios
   - metrics
   - kill criteria
   - go criteria
   - artifacts to produce
4. Add run order and decision tree for what to run next depending on outcomes.

## Key Files
- `docs/research/rlm-vnext-experiment-matrix.md` (new)

## Acceptance Criteria
- Matrix covers all core gaps from recent results: quantity loss, phone/id loss, depth routing, safety-refusal interaction, cross-session weakness.
- Each experiment includes concrete stop/go gates and measurable thresholds.
- Document is concise, actionable, and aligned with existing benchmark naming.
