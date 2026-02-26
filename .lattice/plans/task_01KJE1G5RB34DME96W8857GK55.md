# CTX-26 Plan

Implement and run all requested benchmark tracks in parallel, then publish one unified scoreboard.

## Scope
- Industry tracks:
  - LongMemEval slice (existing runner)
  - MemoryArena slice (new adapter)
  - MemoryAgentBench subset (new adapter)
- Internal tracks:
  - Cross-session benchmark
  - Multi-agent shared-memory benchmark
  - Scale ladder benchmark (8K/32K/128K/1M)
  - Backbone robustness matrix (3-4 models)
- Unified aggregation/report over all tracks.

## Approach
1. Add new analysis runners as isolated files under `src/analysis/`:
   - `memoryarena-slice.ts`
   - `memoryagentbench-slice.ts`
   - `internal-cross-session.ts`
   - `internal-multi-agent.ts`
   - `internal-scale-ladder.ts`
   - `internal-backbone-matrix.ts`
2. Add orchestrator `parallel-benchmarks.ts` to run all runners concurrently via child processes.
3. Add aggregator `parallel-scoreboard.ts` to merge all JSON outputs into one markdown report in `docs/research/`.
4. Execute orchestrator with bounded samples to finish today; capture artifact paths in Lattice comments.

## Acceptance Criteria
- All 7 tracks produce JSON results in `results/` from one orchestrated parallel run.
- Unified report generated with side-by-side metrics (score, tokens, latency, cost).
- Lattice review comment includes artifact paths and caveats (proxy vs official pipelines).
