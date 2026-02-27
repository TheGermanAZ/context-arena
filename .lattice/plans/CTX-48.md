# Plan: QPB Promotion Gate Run (CTX-48)

## Goal
Add QPB to all remaining benchmark runners and execute the 6 promotion gates.

## Steps
1. Create `src/analysis/qpb-leaderboard.ts` — focused 3-strategy runner (Full Context, RLM(8), QPB)
2. Add QPB to `memory-action-micro.ts` — 2-line change (import + array entry)
3. Add QPB to 3 official runners (longmemeval, memoryarena, memoryagentbench) — same pattern
4. Pre-flight: `bunx tsc --noEmit` + `bun test src/strategies/qpb.test.ts`
5. Run gates: Wave 1 fast (micro + cross-session), Wave 2 leaderboard, Wave 3 official
6. Evaluate against 6 criteria, document verdict

## Acceptance Criteria
- All 4 modified files + 1 new file compile cleanly
- QPB tests pass
- All 6 gates have results
- Verdict documented in findings.md
