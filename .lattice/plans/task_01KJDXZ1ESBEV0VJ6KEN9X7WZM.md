# CTX-14: Animate arrows with spawning boxes and remove moving dots

## Scope
Adjust the RLM architecture animation so arrows appear together with spawned depth-1 RLM boxes, and remove floating signal dots from arrow paths.

## Approach
1. Keep root and static arrows as-is.
2. Animate depth-1 and return/delegation arrows with SVG stroke-draw timing aligned to left/right box spawn windows.
3. Remove all moving dot/signal elements and related legend/cosmetic styles.
4. Keep reduced-motion behavior by rendering static arrows (no draw animation).
5. Validate with dashboard build + visual snapshots.

## Acceptance Criteria
- No dots moving along arrows.
- Arrows associated with child branches draw in during child-box spawn.
- Diagram remains readable and functional.
- Dashboard build passes.
