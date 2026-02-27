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

### EXP-01: Quantity Pinning Buffer (QPin) — **GO** ✅

**Completed in CTX-7.** QPB (RLM + regex side-channel) raises quantity retention from 65% to 100%, dates from 33% to 100%, phone/IDs from 57% to 100%. Overall: 96.8% vs RLM's 75.8%. Zero additional LLM cost. All go criteria exceeded. Results: `results/qtd-qpb-experiment-1772176379889.json`

### EXP-02: Intent Framing Preservation (Safety) — **REWORK** 🔄

**Completed.** QPB+Frame reduced but didn't eliminate refusals (1/6 remained). The refusal problem is model-level (gpt-5-nano), not compression-specific — Full Context also refusals. All strategies scored poorly on action-plan generation (avg 4.7/8). Results: `results/exp-02-intent-framing-1772206795415.json`

Possible rework: stronger framing, few-shot examples, or larger model.

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

1. ~~Run EXP-01 and EXP-02 in parallel.~~ **Done.** EXP-01: GO, EXP-02: REWORK.
2. ~~Run EXP-03 after EXP-01 baseline artifacts are finalized.~~ **Done.** EXP-03: KILL.
3. **Current state: 1 GO, 1 REWORK, 1 KILL.** Gate says "fewer than 2 GO → stop and rework." Options:
   - (a) Rework EXP-02 with stronger framing or larger model to get a second GO.
   - (b) Proceed to Phase 2 with QPB as the sole Phase 1 winner (relaxed gate).
   - (c) Accept that safety refusals are a model limitation and focus Phase 2 on retention.
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
