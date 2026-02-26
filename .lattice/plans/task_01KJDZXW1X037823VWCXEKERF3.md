# CTX-20: 1-week quality sprint: dashboard type-safety, lint gate, and reliability checks

## 1-Week Plan

### Day 1-2 (Top Priority)
1. Eliminate dashboard lint blockers:
- Remove all `any` usage in dashboard API/server and affected chart components.
- Fix `react-hooks/static-components` issue in `DepthComparison`.
- Fix `react-refresh/only-export-components` by splitting non-component exports out of `FilterContext`.

2. Make lint a blocking quality gate:
- Update root `check` script to include `dashboard:lint`.
- Update CI to run lint in blocking `quality-gate` job (remove advisory-only pattern).

### Day 3
3. Add dashboard smoke tests for core render paths:
- Leaderboard, TokenCost, and one focus interaction path.
- Include test runner script and CI step.

### Day 4
4. Add runtime response validation on dashboard API client:
- Minimal Zod schemas for high-risk endpoints.
- Fail-fast error messages when payload shape drifts.

### Day 5
5. Reproducibility/reporting hardening:
- Add benchmark run manifest with git SHA, seed, strategy/scenario filters, and timestamp.

### Day 6
6. Performance hardening:
- Route-level code splitting and lazy loading for heavy chart panels.
- Add bundle-size warning budget.

### Day 7
7. Stabilization + docs:
- Close open lint debt, update README with quality commands and CI guarantees.

## Top Items Implemented In This Turn
- Day 1-2 items only: lint/type cleanup + blocking lint gate in `check` and CI.

## Acceptance Criteria for This Turn
- `bun run dashboard:lint` passes.
- `bun run check` passes with lint included.
- CI `quality-gate` runs `bun run check` and fails on lint/test/build regressions.
