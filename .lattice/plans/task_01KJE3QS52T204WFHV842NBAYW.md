# CTX-33 Plan

Deliver official-mode benchmark integration and runs for LongMemEval, MemoryArena, and MemoryAgentBench, then produce a unified official-run report.

## Scope
- Add official-mode runners under `src/analysis/`:
  - `official-longmemeval.ts`
  - `official-memoryarena.ts`
  - `official-memoryagentbench.ts`
- Add orchestrator:
  - `official-benchmarks.ts`
- Add report generator:
  - `official-scoreboard.ts`
- Run bounded samples and write report to `docs/research/official-benchmark-scoreboard.md`.

## Definition of Official-Mode (for this repo)
- Uses each benchmark's official public dataset/schema and split names.
- Uses benchmark-native task format and scoring objective (or closest deterministic equivalent when official pipeline requires unavailable infra/judging services).
- Explicitly labels any deviations from fully official external pipeline execution.

## Execution Plan
1. Implement LongMemEval official-mode runner (dataset + multi-session flow + exact/substring metric, with optional official-eval hook if available).
2. Implement MemoryArena official-mode runner for bundled_shopping tasks using benchmark schema and success checks (ASIN + attributes).
3. Implement MemoryAgentBench official-mode runner using official splits and source filters for EventQA + FactConsolidation.
4. Run all 3 in parallel via orchestrator with bounded sample sizes.
5. Generate unified official-mode scoreboard markdown and append summary note in findings.

## Acceptance Criteria
- Three official-mode result JSON artifacts exist under `results/`.
- Unified official scoreboard exists under `docs/research/`.
- Each benchmark entry includes scope, score, latency, and cost.
- Any blocked “fully official” step is called out with concrete reason and fallback used.
