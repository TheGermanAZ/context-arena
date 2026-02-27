# CTX-41: QTD + QPB Experiments

## Scope
Implement two new memory strategies (QTD and QPB), benchmark them alongside Full Context and RLM(8) across all 8 scenarios, analyze results, and update findings.

## Approach
Follow the implementation plan at `docs/plans/2026-02-26-qtd-qpb-experiments.md` — 8 tasks covering TDD implementation, benchmark runner, execution, analysis, and PR.

## Acceptance Criteria
- QTD and QPB strategies pass all unit tests
- Benchmark runs 4 strategies × 8 scenarios
- Results saved to `results/`
- findings.md updated with CTX-7 analysis
- PR merged to main
