# One-Day Benchmark Coverage Report

Generated: 2026-02-26T22:24:29.184Z

## Scope
- Industry slice: **LongMemEval-S** (sampled proxy run)
- Internal gap check: **Memory-to-Action Micro**
- Strategies: **Full Context**, **RLM(8)**

## Combined Results
| Benchmark | Strategy | Score | Avg Input Tokens | Avg Memory Overhead Tokens | Avg Latency | Cost |
|---|---|---|---:|---:|---:|---:|
| LongMemEval-S Slice (n=6) | Full Context | 4/6 (66.7%) | 103,369 | 0 | 6.7s | $0.5057 |
| LongMemEval-S Slice (n=6) | RLM(8) | 3/6 (50.0%) | 56,200 | 62,942 | 95.5s | $0.5802 |
| Memory-to-Action Micro (1 scenario) | Full Context | PASS (8/8) | 241 | 0 | 24.7s | $0.0110 |
| Memory-to-Action Micro (1 scenario) | RLM(8) | PASS (8/8) | 454 | 3,309 | 54.2s | $0.0134 |

## Artifacts
- LongMemEval slice result: `results/longmemeval-slice-1772144639335.json`
- Memory-action micro result: `results/memory-action-micro-1772143521108.json`

## Notes
- LongMemEval run mode: session-compacted, streamed first N records, ingest-batch=6
- This was a one-day calibration run, not the full official LongMemEval evaluation script.
- Proxy scoring uses normalized exact/substring matching (plus token F1 in raw artifact).
- Micro-benchmark is intentionally deterministic and checks memory-to-action grounding from corrected facts.

## Interpretation
- Use the LongMemEval slice as an external calibration signal.
- Use the micro benchmark as targeted evidence for memory-to-action behavior that our current suite under-covers.
- Next iteration should increase LongMemEval sample size and add 2-3 more action-grounded micro scenarios.
