# CTX-18 Plan

Deliver one-day benchmark coverage with one industry slice and one internal gap benchmark, then publish a combined report.

## Scope
- Run a small LongMemEval slice (target 25 items) with two strategies: `Full Context` and `RLM(8)`.
- Add one internal memory-to-action micro-benchmark scenario with deterministic scoring.
- Produce one combined report table: benchmark name, strategy, success/accuracy, avg tokens, avg latency, estimated cost.

## Implementation Approach
1. Build a standalone analysis runner in `src/analysis/longmemeval-slice.ts`:
   - Download/load LongMemEval-S JSON from Hugging Face URL.
   - Sample first N items (`--sample`, default 25).
   - Convert each item into conversation messages, feed to strategies, ask question, score with deterministic string/alias matching plus optional F1 token overlap.
   - Emit JSON results under `results/`.
2. Build internal micro-benchmark in `src/analysis/memory-action-micro.ts`:
   - Define one deterministic scenario where correct action sequence depends on corrected/updated facts.
   - Evaluate `Full Context` and `RLM(8)` using strict checker.
   - Emit JSON results under `results/`.
3. Build combined report generator in `src/analysis/one-day-report.ts`:
   - Ingest both result JSON files.
   - Output markdown report to `docs/research/one-day-benchmark-report.md` with concise findings and one summary table.
4. Execute runs and generate report; include commands and artifact paths in lattice comments.

## Acceptance Criteria
- LongMemEval slice run completes and saves a timestamped JSON artifact.
- Internal memory-to-action micro-benchmark run completes and saves a timestamped JSON artifact.
- Combined markdown report is generated with side-by-side metrics for the two strategies.
- Task includes lattice comments with artifact paths and observed caveats.
