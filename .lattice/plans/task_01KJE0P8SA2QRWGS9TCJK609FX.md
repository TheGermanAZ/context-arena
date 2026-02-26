# CTX-24: Add execution animations for remaining memory strategies

## Scope
Extend the landing-page strategy animation section so all benchmarked strategies have a playable execution animation.

## Approach
1. Build a reusable animation component for strategy cards with shared play/replay behavior, one-cycle arrow drawing, and reduced-motion fallback.
2. Create configuration entries for the remaining strategies not yet animated:
   - Window(10)
   - Summarize(8)
   - Structured(8)
   - CorrectionAware
   - Hybrid
3. Keep existing custom Full Context / Windowed / RLM animations intact and append the new strategy animations below them in a responsive grid.
4. Ensure naming in panels matches benchmark strategy names where applicable.

## Files
- `dashboard/src/components/GenericStrategyFlowAnimation.tsx` (new)
- `dashboard/src/pages/Landing.tsx` (render additional strategy animation cards)
- `dashboard/src/index.css` (small shared classes only if needed by generic component)

## Acceptance Criteria
- Landing page shows playable animation panels for all strategy variants represented in the benchmark set.
- New panels follow existing interaction model: manual Play/Replay only, no autoplay.
- Reduced-motion users get static diagrams with disabled play controls.
- Build succeeds (or document unrelated pre-existing failures).
