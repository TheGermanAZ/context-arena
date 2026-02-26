# Parallel Benchmark Scoreboard

Generated: 2026-02-26T22:51:29.012Z
Manifest: `results/parallel-benchmarks-manifest-1772146260041-latest.json`
Window: 2026-02-26T22:51:00.041Z -> 2026-02-26T22:51:00.041Z

## Unified Results
| Track | Strategy / Model | Score | Avg Latency | Cost | Type |
|---|---|---|---:|---:|---|
| Industry: LongMemEval Slice | Full Context | 1/3 (33.3%) | 12.0s | $0.2549 | proxy |
| Industry: LongMemEval Slice | RLM(8) | 2/3 (66.7%) | 76.8s | $0.2794 | proxy |
| Industry: MemoryArena Slice | Full Context | 3/4 (75.0%) | 25.8s | $0.0462 | proxy |
| Industry: MemoryArena Slice | RLM(8) | 3/4 (75.0%) | 24.0s | $0.0483 | proxy |
| Industry: MemoryAgentBench Subset | Full Context | 1/4 (25.0%) | 13.0s | $0.0651 | proxy |
| Industry: MemoryAgentBench Subset | RLM(8) | 0/4 (0.0%) | 12.8s | $0.0625 | proxy |
| Internal: Cross-Session | Full Context | PASS (4/4) | 22.0s | $0.0090 | internal |
| Internal: Cross-Session | RLM(8) | FAIL (3/4) | 18.8s | $0.0068 | internal |
| Internal: Multi-Agent Handoff | Full Context | PASS (3/3) | 48.6s | $0.0237 | internal |
| Internal: Multi-Agent Handoff | RLM(8) | PASS (3/3) | 40.4s | $0.0161 | internal |
| Internal: Scale Ladder | Full Context | 3/3 (100.0%) | 4.5s | $0.0991 | internal |
| Internal: Scale Ladder | RLM(8) | 3/3 (100.0%) | 3.3s | $0.0993 | internal |
| Internal: Backbone Matrix | gpt-5-nano | PASS | 3.8s | $0.0000 | internal |
| Internal: Backbone Matrix | gpt-5-mini | FAIL | 0.0s | $0.0000 | internal |
| Internal: Backbone Matrix | gpt-4.1-mini | FAIL | 0.0s | $0.0000 | internal |

## Artifacts
- industry-longmemeval: `results/longmemeval-slice-1772146064700.json` (exit 0)
- industry-memoryarena: `results/memoryarena-slice-1772145997802.json` (exit 0)
- industry-memoryagentbench: `results/memoryagentbench-slice-1772146202754.json` (exit 0)
- internal-cross-session: `results/internal-cross-session-1772146247158.json` (exit 0)
- internal-multi-agent: `results/internal-multi-agent-1772145887217.json` (exit 0)
- internal-scale-ladder: `results/internal-scale-ladder-1772145821637.json` (exit 0)
- internal-backbone-matrix: `results/internal-backbone-matrix-1772145802060.json` (exit 0)

## Notes
- Industry tracks are bounded proxy runs for one-day parallel execution.
- Internal tracks are targeted diagnostics for product-specific risk areas.
- Expand sample sizes and switch industry runners to official evaluation pipelines in the next pass.
