# CTX-19: 1-day quality hardening: CI gate + benchmark validity + reproducibility

## Goal
Ship the highest-ROI reliability improvements in one day:
1) enforce automated quality checks in CI,
2) fix a benchmark correctness bug in scenario scoring,
3) make sampled benchmark runs reproducible.

## Scope (Top Items)
- Add a GitHub Actions CI workflow that runs root tests + dashboard lint/build on push/PR.
- Add root-level scripts so checks are runnable with one command (`check`) and usable by CI.
- Fix `State Change Tracking` checker bug so `Gizmo-Z = 0` is actually required for PASS.
- Add deterministic sampling with `--seed=<number>` to `src/index.ts`.

## Out of Scope (for this 1-day slice)
- Full dashboard type-safety cleanup (`any` removal, stricter API types).
- Full dashboard component test suite.
- Large bundle splitting/refactor.

## Implementation Plan
1. Update root `package.json` scripts:
- `test`, `dashboard:lint`, `dashboard:build`, `check`.

2. Add workflow `.github/workflows/ci.yml`:
- Trigger: `push`, `pull_request`.
- Install Bun.
- `bun install` (root + dashboard)
- Run `bun run test` (root), `bun run dashboard:lint`, `bun run dashboard:build`.

3. Fix scenario scoring bug in `src/tasks/scenarios.ts`:
- Include `hasGizmoZ` in return condition for Scenario 2.

4. Add seeded random sampling to `src/index.ts`:
- Parse `--seed` arg.
- Validate positive integer.
- Replace `Math.random()` in Fisher-Yates with deterministic PRNG when seed provided.
- Print seed in run header for reproducibility.

5. Verify:
- Run root tests.
- Run dashboard lint/build via new scripts.
- Confirm CI workflow syntax and tracked file set.

## Acceptance Criteria
- `bun run check` passes locally.
- Scenario 2 cannot pass if Gizmo-Z value is missing/incorrect.
- `--sample + --seed` yields deterministic scenario subset order across reruns.
- CI workflow exists and runs the same checks as local `check`.
