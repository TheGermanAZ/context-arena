# Official Benchmark Scoreboard

Generated: 2026-02-26T23:22:18.245Z
Manifest: `results/official-benchmarks-manifest-1772148138220.json`
Window: 2026-02-26T23:18:46.081Z -> 2026-02-26T23:22:18.220Z

## Results
| Benchmark | Strategy | Score | Avg Latency | Cost | Scoring Mode |
|---|---|---|---:|---:|---|
| LongMemEval | Full Context | 2/3 (66.7%) | 7.5s | $0.2516 | deterministic fallback |
| LongMemEval | RLM(8) | 3/3 (100.0%) | 5.8s | $0.2125 | deterministic fallback |
| MemoryArena | Full Context | 2/4 (50.0%) | 24.2s | $0.0471 | deterministic fallback |
| MemoryArena | RLM(8) | 3/4 (75.0%) | 28.7s | $0.0616 | deterministic fallback |
| MemoryAgentBench (EventQA + FactConsolidation) | Full Context | 1/4 (25.0%) | 12.2s | $0.0614 | deterministic fallback |
| MemoryAgentBench (EventQA + FactConsolidation) | RLM(8) | 1/4 (25.0%) | 13.7s | $0.0625 | deterministic fallback |

## Artifacts
- official-longmemeval: `results/official-longmemeval-1772148096443.json` (exit 0)
- official-memoryarena: `results/official-memoryarena-1772148138212.json` (exit 0)
- official-memoryagentbench: `results/official-memoryagentbench-1772148094598.json` (exit 0)

## Summary
- Official benchmark datasets/splits were used for LongMemEval, MemoryArena, and MemoryAgentBench.
- Official LLM-judge evaluation steps require external judge credentials not available in this runtime.
- Deterministic fallback scoring was used for this run and is explicitly labeled above.
