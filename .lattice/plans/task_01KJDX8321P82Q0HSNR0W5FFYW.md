# CTX-12: Implement animated recursive RLM architecture diagram

## Scope
Replace the existing RLM explainer with an animation that matches the provided recursive RLM architecture diagram (root depth=0, two depth=1 children, query/context/sub-query/sub-context/sub-response flows).

## Approach
1. Rebuild `RlmFlowAnimation` as an SVG diagram matching the reference structure and labels.
2. Add animated "signal" dots moving along key arrows (query/context in, delegation down, responses up, final response out).
3. Add/update CSS classes for diagram styling and reduced-motion behavior.
4. Keep the component embedded in Landing under "How RLM Works".
5. Validate with `dashboard` build and visual capture.

## Acceptance Criteria
- The rendered component visually matches the provided recursive RLM layout.
- Message flow is animated along the major arrows.
- Diagram remains readable on smaller screens (horizontal scroll acceptable).
- Reduced-motion mode hides non-essential motion.
- `bun run build` passes in `dashboard`.
