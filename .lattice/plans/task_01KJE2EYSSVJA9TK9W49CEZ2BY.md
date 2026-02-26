# CTX-30 Plan: Finish remaining quality improvements

## Scope
Complete the remaining open items from the improvement list:
1. Harden CI quality gate.
2. Increase dashboard regression coverage.
3. Resolve DiscoveredRLM CTX-4 TODO with concrete shipped prompt updates.
4. Reduce dashboard bundle size warning via code-splitting.

## Approach
- CI:
  - Update `.github/workflows/ci.yml` to use lockfile-strict installs and explicit gate steps (tests, lint, build) rather than a single opaque step label.
- Dashboard tests:
  - Add `dashboard/src/components/__tests__/Sidebar.test.tsx`.
  - Cover preset application and max-4 panel constraint/disable behavior to protect core dashboard panel state logic.
- DiscoveredRLM:
  - Replace placeholder TODO comments and update extraction/verification prompt content in `src/strategies/discovered-rlm.ts` to encode CTX-4 discovered patterns:
    - exhaustive per-category extraction
    - association-preserving correction semantics
    - explicit missed-fact reconciliation
- Bundle size:
  - Introduce lazy loading for route pages in `dashboard/src/router.tsx`.
  - Introduce lazy loading for dashboard panel components in `dashboard/src/pages/Dashboard.tsx` with Suspense fallback.
  - Rebuild and confirm chunk warning is eliminated or substantially reduced.

## Acceptance criteria
- `bun run check` passes.
- CI workflow is explicit and lockfile-strict in committed YAML.
- New Sidebar test file exists and passes.
- DiscoveredRLM no longer contains the CTX-4 placeholder TODO and uses concrete prompt guidance.
- Dashboard build output shows improved chunking and no large-chunk warning if achievable without risky refactors.
