# CTX-27: Fix review findings: manifest resilience, test script robustness, API negative-path tests

## Goal
Address all review findings from the prior code review without broad refactors.

## Scope
1. Make benchmark manifest writes non-fatal:
- Wrap manifest write logic in a safe helper.
- Log warnings instead of throwing on write failures.

2. Harden root test script:
- Replace brittle glob-based root test command with command that runs all tests under `src/` by Bun conventions.

3. Add negative-path API tests:
- Add unit tests for `dashboard/src/lib/api.ts` covering:
  - non-2xx HTTP response error path,
  - schema validation failure path with endpoint context.

## Acceptance Criteria
- Manifest write failures do not crash benchmark execution path.
- `bun run test` is resilient to naming/location drift inside `src/`.
- New API tests fail on malformed payloads and non-2xx responses.
- `bun run check` passes.
