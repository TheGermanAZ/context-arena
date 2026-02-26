# CTX-11: Add an RLM explainer animation

## Scope
Create a new frontend animation that visually explains the RLM workflow and display it in the product UI.

## Approach
1. Add a reusable React component for an animated RLM pipeline (`RlmFlowAnimation`).
2. Add supporting keyframes/util classes to global CSS for flow-beam and active-stage pulse effects.
3. Embed the animation in the Landing page with concise explanatory text.
4. Verify with dashboard build.

## Acceptance Criteria
- A new animation exists that steps through the RLM process.
- The animation is visible in the app UI.
- Motion has reduced-motion fallback.
- `dashboard` build succeeds.
