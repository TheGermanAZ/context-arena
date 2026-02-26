# CTX-22: Execute week plan days 3-5: dashboard tests, API validation, benchmark manifests

## Goal
Execute Days 3-5 from the week plan in one implementation cycle:
1) add dashboard smoke tests and wire them into CI,
2) add runtime API response validation for high-risk endpoints,
3) write benchmark run manifests for reproducibility.

## Scope
### Day 3: Dashboard smoke tests
- Add Vitest + Testing Library setup in `dashboard/`.
- Add smoke tests for:
  - `Leaderboard` render path.
  - `TokenCost` render path.
  - One focus interaction path (clicking a leaderboard row toggles focused state).
- Add dashboard test scripts and run them in CI `quality-gate`.

### Day 4: Runtime API validation
- Add Zod schemas for high-risk API endpoints in dashboard client layer.
- Update `fetchJson` to parse through schema and throw fail-fast errors with endpoint context.
- Keep existing TypeScript response types as compile-time interfaces, but enforce runtime shape checks.

### Day 5: Benchmark manifest output
- In root benchmark runner (`src/index.ts`), generate a sidecar manifest JSON per run.
- Manifest fields: benchmark output path, git SHA (best effort), seed, filters, sampling mode, concurrency/sequential, started/finished timestamps.
- Save final manifest at run end and include summary in console output.

## Out of Scope
- Broad dashboard E2E suite.
- Visual regression tooling.
- Bundle splitting/perf work (Day 6).

## Acceptance Criteria
- `cd dashboard && bun run test` passes.
- CI `quality-gate` runs dashboard tests in addition to current checks.
- API client rejects malformed payloads with actionable error messages.
- Benchmark runs emit manifest files in `results/` and log their path.
- Root `bun run check` still passes.
