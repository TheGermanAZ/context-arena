# CTX-13: Animate depth-1 RLM nodes spawning from root RLM

## Scope
Update the RLM diagram animation so the two depth-1 RLM modules visibly spawn from the root RLM module before settling into their final positions.

## Approach
1. Group left and right depth-1 subgraphs into separate SVG `<g>` wrappers.
2. Add CSS keyframes for left/right spawn transforms (translate+scale from root anchor).
3. Keep existing signal-flow animations intact.
4. Respect reduced-motion by disabling subtree spawn animation.
5. Validate with dashboard build and screenshots.

## Acceptance Criteria
- Both depth-1 RLM panels animate from the root location into final positions.
- Existing flow-dot animation still works.
- Reduced-motion mode disables spawn animation.
- Dashboard build passes.
