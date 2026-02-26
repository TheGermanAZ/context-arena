# CTX-17: Add animated execution diagrams for all memory strategies

## Scope
Create animation panels for all three landing-page strategies so users can play a visual execution flow for Full Context, Windowed, and Recursive Summarization (RLM), instead of showing only RLM.

## Approach
1. Keep the current RLM animation component as-is for behavior consistency (manual Play/Replay, one cycle, reduced-motion support).
2. Add two new components:
   - `FullContextFlowAnimation.tsx`: depicts sending full conversation context directly into the model every turn.
   - `WindowedFlowAnimation.tsx`: depicts sliding last-N messages window and dropping older turns.
3. Reuse the same interaction contract in each component:
   - `Play` button in the card header.
   - `Playing...` disabled state during the run.
   - `Replay` state after first run.
   - Stop automatically after a fixed duration (single-cycle run).
   - Respect `prefers-reduced-motion`.
4. Update landing page section from a single RLM panel to a 3-panel grid titled for all strategy flows.
5. Add minimal CSS utilities for line drawing and node glow where shared classes are needed by new SVG diagrams.

## Key Files
- `dashboard/src/components/FullContextFlowAnimation.tsx` (new)
- `dashboard/src/components/WindowedFlowAnimation.tsx` (new)
- `dashboard/src/components/RlmFlowAnimation.tsx` (reuse existing)
- `dashboard/src/pages/Landing.tsx` (render all three panels)
- `dashboard/src/index.css` (shared animation class additions, if required)

## Acceptance Criteria
- Landing page displays three strategy animation panels (Full Context, Windowed, RLM).
- Each panel has a Play/Replay control and does not autoplay.
- Animations run once per click, then return to static state.
- Reduced-motion users get static diagrams and disabled play controls.
- `bun run build` succeeds.
