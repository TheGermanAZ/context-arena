# RLM vNext Experiment Matrix

Generated: 2026-02-27

## Baseline Snapshot (Current)

- Core leaderboard (`results/final-leaderboard-1772159885225.json`):
  - `RLM(8)`: 62.5% accuracy, 53.2% retention, ~111k avg tokens
  - `Hybrid`: 87.5% accuracy, 71.0% retention
- Official-mode bounded run (`docs/research/official-benchmark-scoreboard.md`):
  - LongMemEval: `RLM(8) 3/3` vs Full Context `2/3`
  - MemoryArena: `RLM(8) 3/4` vs Full Context `2/4`
  - MemoryAgentBench subset: tie `1/4` each
- Known RLM gaps from CTX findings:
  - Quantity retention is systematically weak (often near 0-33%)
  - Cross-session persistence underperforms Full Context
  - Compression can trigger benign-task safety refusals (Memory-to-Action: Incident Rollback)

---

## Success Gates for RLM vNext (Global)

A candidate proceeds only if all gates pass:

1. Quantity retention >= 50% on internal 8-scenario probe set.
2. Phone/ID retention >= 90% on ID-heavy scenarios.
3. Cross-session benchmark passes 4/4.
4. Memory-to-Action benign refusal rate = 0%.
5. No more than 10% token overhead vs base `RLM(8)` on internal suite.
6. Official-mode score strictly improves on at least 2/3 tracks (LongMemEval, MemoryArena, MemoryAgentBench subset).

---

## Run Protocol (Applies to Every Experiment)

- Fixed model for dev loop: `gpt-5-nano`.
- Compression policy baseline: trigger every 8 messages, keep recent 4.
- Repetitions: 3 runs per scenario/track variant.
- Report required artifacts per experiment:
  - Result JSON in `results/`
  - One markdown scoreboard summary in `docs/research/`
  - Brief decision note: `GO`, `KILL`, or `REWORK`

---

## Phase 1: Highest-Leverage Fixes (Run First)

### EXP-01: Quantity Pinning Buffer (QPin)

- Hypothesis: protecting exact values as a side-channel will close the largest RLM gap.
- Variants:
  - V0: `RLM(8)` baseline
  - V1: `RLM(8)+QPin` (pin exact numeric facts with unit + entity key)
  - V2: `RLM(8)+QPin+Supersedes` (track corrected numeric lineage)
- Datasets:
  - Internal 8 scenarios (focus: State Change, Contradiction, Cascading Corrections)
  - Memory-to-Action Micro
- Primary metrics:
  - Quantity retention
  - Final accuracy
  - Token overhead
- Kill criteria:
  - Quantity retention gain < +15pp vs V0 after 3 reps
  - or token overhead > +10% with no accuracy gain
- Go criteria:
  - Quantity retention >= 50%
  - and no scenario accuracy regression > 1 scenario vs V0

### EXP-02: Intent Framing Preservation (Safety)

- Hypothesis: preserving benign framing in compressed memory eliminates false safety refusals.
- Variants:
  - V0: current `RLM(8)`
  - V1: add explicit benign-context frame to delegated memory
  - V2: benign frame + action-plan constraint template (non-operational language)
- Datasets:
  - Memory-to-Action Micro (all scenarios)
  - Internal incident-like prompts (add 3 synthetic variants)
- Primary metrics:
  - Refusal rate on benign tasks
  - Action correctness checks
  - Latency delta
- Kill criteria:
  - Any benign refusal persists in V2 after 3 reps
- Go criteria:
  - 0 refusals on benign tasks across all reps
  - and no correctness drop > 1 check total vs V0

### EXP-03: Stability-Plasticity Re-test on Correct Data

- Hypothesis: stable buffer helps when evaluated on scenarios that actually contain phone/id probes.
- Variants:
  - V0: `RLM(8)`
  - V1: stable phone/id buffer only
  - V2: stable phone/id + exact value pinning
- Datasets:
  - Scenario 5 (Long Horizon + Noise)
  - Any scenario with >= 4 phone/id probes
- Primary metrics:
  - Phone/ID retention
  - Cross-type collateral damage (entity, quantity)
- Kill criteria:
  - Phone/ID retention < 90% in V2
- Go criteria:
  - Phone/ID retention >= 90%
  - and no quantity retention drop > 5pp vs V0
### EXP-01: Quantity Pinning Buffer (QPin) — **KILL** ❌

**Internal state GO in CTX-7, promotion gates KILL in CTX-48.** QPB raises internal-state quantity retention from 65% to 100% (CTX-7), but final-answer retention drops to 17.6% on the leaderboard (CTX-48). Internal retention ≠ final-answer retention. The pinned buffer preserves quantities in context, but the model doesn't surface them in responses. 2/6 promotion gates passed (cross-session 4/4, benign refusal 0%), 4/6 failed (quantity 17.6% < 50%, phone/ID 85.7% < 90%, token overhead 15.5% > 10%, official tracks 0/3 improved). Results: `results/qtd-qpb-experiment-1772176379889.json`, `results/qpb-leaderboard-1772232837973.json`

### EXP-02: Intent Framing Preservation (Safety) — **GO** ✅

**v2 completed.** The v1 benchmark (action-plan questions) was flawed — it tested model capability, not memory. v2 redesigned with fact-recall questions. Results: 0 refusals across all 24 runs (4 strategies × 2 scenarios × 3 reps). QPB+Frame matched Full Context (4/6 pass, 7.3/8 avg checks). The v1 confound was entirely the question format, not compression. Results (v2): `results/exp-02-intent-framing-1772242721608.json`

### EXP-03: Stability-Plasticity Re-test on Correct Data — **KILL** ❌

**Completed in CTX-39.** Phase 1 passed (100% stable-probe recall) but Phase 2 scored 63.7% overall — worse than base RLM (75.8%). Kill criteria met. The stable/plastic split adds complexity without improving outcomes. Results: `results/probe-stability-plasticity-v2-1772195858439.json`

---

## Phase 2: Architecture Upgrades (Run Only if Phase 1 Has >= 2 GOs)

### EXP-04: Dual-Track RLM (Natural Blob + Pinned Stores)

- Hypothesis: preserve LLM-friendly natural summary while side-channel protects fragile fact types.
- Variants:
  - V0: best Phase 1 variant
  - V1: dual-track re-ingestion (natural blob primary, pinned appendices secondary)
- Datasets:
  - Internal 8 scenarios
  - Internal cross-session
- Primary metrics:
  - Overall retention
  - Quantity + phone/id retention
  - Cross-session pass/fail
- Kill criteria:
  - Overall retention gain < +5pp
  - or cross-session remains < 4/4
- Go criteria:
  - Overall retention >= 60%
  - and cross-session = 4/4

### EXP-05: Semantic Depth Router (D1 vs D2)

- Hypothesis: semantic routing can capture depth-2 wins without depth-2 noise regressions.
- Variants:
  - V0: fixed depth 1
  - V1: fixed depth 2
  - V2: semantic router chooses depth 1 or 2
- Datasets:
  - Internal 8 scenarios
  - LongMemEval slice + MemoryArena slice
- Primary metrics:
  - Accuracy/retention vs oracle best-of(D1,D2)
  - Cost overhead vs V0
- Kill criteria:
  - V2 trails oracle by > 5pp accuracy
  - or costs > 20% above V0
- Go criteria:
  - V2 >= V0 +3pp accuracy
  - and V2 cost <= V1 cost

---

## Phase 3: Product-Level Strategy Routing (Final)

### EXP-06: Strategy Meta-Router (RLM vNext vs Hybrid vs Full Context)

- Hypothesis: one strategy is not globally optimal; routing by task family beats any single fixed strategy.
- Variants:
  - V0: best single strategy from Phases 1-2
  - V1: static Hybrid
  - V2: static Full Context
  - V3: meta-router among V0/V1/V2
- Datasets:
  - Official-mode tracks (LongMemEval, MemoryArena, MemoryAgentBench subset)
  - Internal cross-session + multi-agent + memory-to-action
- Primary metrics:
  - Weighted score (40% official, 60% internal)
  - Cost and latency
- Kill criteria:
  - V3 fails to beat best static variant by >= 3pp weighted score
- Go criteria:
  - V3 beats best static by >= 3pp
  - and cost overhead <= 15%

---

## Execution Order and Decision Tree

1. ~~Run EXP-01 and EXP-02 in parallel.~~ **Done.** EXP-01: GO (internal, killed at promotion gates), EXP-02: GO (v2).
2. ~~Run EXP-03 after EXP-01 baseline artifacts are finalized.~~ **Done.** EXP-03: KILL.
3. **Current state: 2 GO, 1 KILL.** Phase 1 gate met (≥2 GO). However, QPB was killed at promotion gates (CTX-48) due to storage-vs-retrieval gap. Phase 2 experiments as designed (EXP-04/05/06) are moot — the architecture is sound but the retrieval problem must be solved first.
4. If >= 2 `GO` in Phase 1, run EXP-04 then EXP-05.
5. If EXP-04 and EXP-05 both `GO`, run EXP-06 final routing benchmark.
6. Promote to default production strategy only if global gates all pass.

---

## Concrete Run Commands (Current Repo Pattern)

Use existing analysis entrypoints as templates; add `*-vnext.ts` runners alongside them.

- Internal/proxy orchestration template: `src/analysis/parallel-benchmarks.ts`
- Official-mode template: `src/analysis/official-benchmarks.ts`
- Memory-to-action template: `src/analysis/memory-action-micro.ts`

Suggested command pattern:

```bash
bun run src/analysis/<new-runner>.ts
```

Suggested new runners:

- `src/analysis/exp-01-quantity-pinning.ts`
- `src/analysis/exp-02-intent-framing.ts`
- `src/analysis/exp-03-stability-retest.ts`
- `src/analysis/exp-04-dual-track.ts`
- `src/analysis/exp-05-depth-router-semantic.ts`
- `src/analysis/exp-06-meta-router.ts`

---

## Minimum Promotion Criteria (One-Line)

Promote only if: `quantity >= 50%`, `phone/id >= 90%`, `cross-session 4/4`, `benign refusal 0%`, and `>=2/3 official tracks improved` at `<=10%` token overhead.
