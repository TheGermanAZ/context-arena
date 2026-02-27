# CTX-37: Stability-Plasticity + Quantity-Pinning Re-Probe

## Goal
Re-run the Stability-Plasticity probe with quantity-pinning, fresh RLM baseline, all 8 scenarios, and per-hypothesis kill criteria.

## Changes

### probe-stability.ts
1. Add `"quantity"` to `StableClassification` type union
2. Add 3 quantity regex patterns: currency ($X), percentage (N%), number+unit (N people)
3. Update `isStableProbeType()`: add `"quantity"`, remove `"spatial"`
4. Lower Phase 1 kill threshold from 80% to 70%
5. Add false positive rate check in Phase 1
6. Rewrite Phase 2: run ALL 8 scenarios with BOTH StabilityPlasticity + RLM baseline (2 reps each)
7. Replace kill criteria with per-hypothesis deltas

### probe-stability.test.ts
1. Add quantity classifier tests (currency, percentage, number+unit)
2. Add false positive tests (noise text with bare numbers should not match)

## Acceptance Criteria
- `bun test src/analysis/probe-stability.test.ts` passes
- `bunx tsc --noEmit` passes
- Phase 2 runs both strategies on all scenarios
