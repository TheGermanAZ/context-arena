CTX-1 complete. Probes defined for all 8 scenarios (62 total, 8 types). RLM instrumented with opt-in delegationLog. Analysis runner produces retention-by-type report.

Key findings:
- phone/id, spatial: 0% retention (worst)
- quantity: 12%, entity: 25%
- correction: 45%, date: 67% (best)
- Retention curve is non-monotonic — C1 drops facts, C2-C3 recover from structured sub-LLM output, C4-C5 compound loss catches up

Results saved to results/rlm-loss-1771975745614.json. Committed as d94d3a9.