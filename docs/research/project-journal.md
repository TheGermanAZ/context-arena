# Project Journal: What LLMs Forget

A chronological account of how we built a benchmark for long-context memory strategies, discovered why RLM loses information, tried five architectural fixes (all failed), and landed on a zero-cost regex side-channel that gets 96.8% of Full Context's retention.

---

## Week 1, Day 1: The Benchmark (Feb 24)

We started with a question: **what types of information do memory strategies actually lose?**

The field has sliding windows, recursive summarization, structured extraction, hybrid approaches — but nobody had systematically measured which facts survive and which don't. We built a benchmark to find out.

### The First Commit

The initial harness tested 7 strategies against 5 scenarios:

**Strategies:**
- Full Context (no compression — the ceiling)
- Sliding Window (keep last N messages, drop the rest)
- Summarize (compress old messages into a narrative)
- Structured Extraction (key-value fact extraction)
- Hybrid (dual-track: facts + narrative in parallel)
- RLM (Recursive Language Model — delegate to sub-LLM with 5 targeted questions)
- CorrectionAware (summary-primary with correction tracking)

**Scenarios:**
1. Early Fact Recall — remember details from message 1 after 20+ turns
2. State Change Tracking — track inventory across cumulative updates
3. Contradiction Resolution — handle "actually, change the hotel to..."
4. Multi-hop Reasoning — combine facts from different turns
5. Long Horizon + Noise — extract signal from chit-chat

Each scenario played out as a multi-turn conversation. The agent received information incrementally, then faced a final question requiring synthesis. Regex-based checkers validated answers against ground truth.

Ten benchmark runs on the first day (`results/benchmark-177197*.json`). The leaderboard took shape: Hybrid and Full Context at the top, Sliding Window at the bottom, RLM somewhere in the middle.

### Three More Scenarios

The first five scenarios didn't stress-test corrections hard enough. We added three:

6. Cascading Corrections — corrections that change downstream calculations
7. Implicit Corrections — corrections without signal words ("actually", "wait")
8. Rapid-fire Corrections — 15+ rapid changes to a wedding seating chart

CorrectionAware was rewritten twice (v1 failed on rapid-fire, v2 used a summary-primary architecture) before we realized: a dedicated correction strategy wasn't the answer. The general-purpose strategies handled corrections better than the purpose-built one. CorrectionAware was abandoned.

---

## Week 1, Day 2: Probe Framework and Depth Scaling — Characterization (Feb 25)

### The Probe Framework

Pass/fail on 8 scenarios told us _which_ strategies won, but not _why_ the losers lost. We needed finer-grained measurement.

We instrumented each scenario with **probes** — 62 specific facts tagged by type. Each probe had:
- A fact ("Kenji's phone 090-8765-4321")
- A type (`entity`, `phone/id`, `quantity`, `date`, `correction`, `spatial`, `relationship`, `decision`)
- Patterns to match (all must be present)
- The step where the fact was introduced

Then we traced every probe through every RLM compression cycle. The results were damning:

| Type | Retention |
|------|-----------|
| spatial | 0% |
| decision | 0% |
| phone/id | 0% |
| quantity | 12% |
| entity | 25% |
| relationship | 33% |
| correction | 45% |
| date | 67% |

Phone numbers, IDs, floor plans — completely wiped. Dollar amounts nearly all lost. The sub-LLM's 5 targeted questions specifically asked for corrections and numbers, but the sub-LLM treated identifiers and spatial info as low priority anyway.

**Surprise finding:** The retention curve was non-monotonic. Probes showed LOST at cycle 1, RETAINED at cycles 2-3, then LOST again at cycles 4-5. Cycle 1 processed raw conversation (messy). Cycles 2-3 processed the sub-LLM's own structured output (easier to copy forward). Cycles 4-5 showed compounding loss catching up.

### The Depth Experiment

Standard RLM uses depth 1: one sub-LLM call per compression cycle. We built DeepRLM: chain N sub-LLM calls. Depth 2 means the first extraction gets re-processed by a second pass with the same questions.

**Expected:** Compounding loss. Photocopying a photocopy.

**Actual:** Depth 2 was net positive (+6.4pp). But bimodal:

- **Self-correction mode** (4 scenarios improved): Early Fact Recall jumped from 1/10 to 8/10. The second pass, working from organized output instead of raw conversation, recovered facts the first pass missed.
- **Noise amplification mode** (3 scenarios degraded): Long Horizon + Noise dropped from 7/8 to 3/8. The first pass filtered signal from noise, but the second pass couldn't distinguish them in the flattened output.

The photocopy metaphor was wrong. The second pass re-reads with fresh eyes — but only when the first pass produces faithful output.

---

## Week 1, Day 2-3: The Code Generation Experiment (Feb 25-26)

### Can the LLM Write Better Extraction Code?

The `rllm` package lets the LLM generate JavaScript that runs in a V8 isolate to extract facts. Hypothesis: a code-writing LLM should outperform fixed prompts. Code is flexible; prompts are rigid templates.

We ran both on gpt-5-nano to eliminate the model confound.

**Result: 79% vs 11%.** Hand-rolled prompts crushed agentic code on every scenario.

| Scenario | Hand-rolled | RLLM | Gap |
|----------|-------------|------|-----|
| Early Fact Recall | 80% | 0% | +80pp |
| Multi-hop Reasoning | 88% | 0% | +88pp |
| Implicit Corrections | 86% | 0% | +86pp |
| **Overall** | **79.0%** | **11.3%** | **+67.7pp** |

In 6 of 8 scenarios, RLLM retained exactly 0 facts.

### What Code Did the LLM Write?

We captured all 168 code blocks and classified them:

| Strategy | % of Blocks |
|----------|------------|
| type_specific | 29% — category-based extraction, mirroring the hand-rolled 5-question prompt |
| flat_extraction | 13% — simple line-by-line parsing |
| chunking | ~5% — splits transcript into chunks |
| unknown/ineffective | 53% — malformed, incomplete, or non-functional |

The LLM _recognized_ it needed type-specific extraction. But over half the code was non-functional, and the code that ran parsed surface patterns without understanding conversational context.

**Key insight:** The 5-question prompt works because it delegates to the LLM's _language understanding_. The code approach adds an unnecessary indirection: understand the task → express as JavaScript → hope the JavaScript implements the understanding. For fact extraction from natural language, the LLM already _is_ the tool. Making it write code to do what it can do with language is like asking a translator to write a translation program instead of translating.

---

## Week 1, Day 3: Literature Sweep (Feb 25-26)

Between experiments, we built the research foundation:

- **Reading list** — 34 papers organized by relevance, from MemoryBank and EverMemOS to retrieval-augmented generation
- **Tracer bullet** — the problem statement, landscape, terminology, gaps
- **Benchmark catalog** — 70+ benchmarks from the field, with repos, datasets, and how to run them
- **10 research proposals** — grounded in literature and our data

This fed directly into the feasibility testing phase.

---

## Week 1, Day 3: The PersistentRLM Experiment (Feb 26)

The Probe Framework identified RLM's root cause: `this.delegatedKnowledge = [subLLMResult.content]` — wholesale replacement every cycle. If the sub-LLM drops a fact, it's gone forever.

The fix seemed obvious: parse the sub-LLM's output into typed stores (identifiers, entities, quantities, dates, corrections, structural) and merge incrementally. Same call, same cost — just parse-then-merge instead of wholesale replace.

**PersistentRLM:** 6 typed stores, 25 alias mappings, overflow bucket, multi-line entry handling.

**Result: Strictly worse.** 6/8 accuracy vs 7/8 for base RLM. Zero probes where PersistentRLM won. Four where base RLM won.

**Why:** The sub-LLM processes its own natural-language blob with full language understanding — "Gadget-X moved to clearance, count unchanged at 200" is one compound fact. When it receives typed stores (`QUANTITIES: Gadget-X: 200 units` and `STRUCTURAL: Gadget-X: moved to clearance`), it treats them as independent facts. Structure splits associations that natural language keeps together.

This was the inverse of the Code Generation experiment. There, prompts beat code because code adds indirection. Here, typed stores beat natural language at _storage_ but lose at _re-ingestion_. The format you feed the sub-LLM shapes what it attends to.

**The lesson:** Don't parse output into stores. Keep the natural-language blob AND maintain a side-channel for facts the blob drops. This pointed directly at QPB, though we didn't build it yet.

---

## Week 1, Day 3: The Feasibility Sprint (Feb 26)

Five proposals from the research list, each tested with a two-phase probe: Phase 1 validates the core mechanism at zero LLM cost, Phase 2 runs benchmarks with kill criteria.

### Proposal #1: Depth-Adaptive RLM

Route to depth 1/2/3 based on content signals (information density, noise ratio, correction frequency, identifier density). The Content Assessor used 4 regex-based signals.

**Kill:** 50% routing accuracy. Early Fact Recall — the scenario where depth 2 helps most — was routed to depth 1 because its information density (7.3) fell below threshold (10). Signals too coarse.

### Proposal #2: Correction Format Engineering

Seven prompt formats for communicating corrections to the sub-LLM: explicit negation, contrastive pairs, temporal supersession, authoritative override, self-generated re-derivation, structured diff, Socratic elicitation.

**Kill:** 0pp spread. All 7 formats scored identically (57.1%). The sub-LLM treats all correction formats equivalently. The bottleneck was never _how_ we communicate corrections — it was the types we don't protect at all (quantities: 0%).

### Proposal #3: Structural Shadow Graphs

Maintain a parallel knowledge graph alongside RLM. Extract triples (ENTITY, SPATIAL, RELATION, DECISION, SUPERSEDES) into a `ShadowGraph` each cycle.

**Kill:** +4pp gain at 2x token cost. Dates and relationships improved, but entities and quantities _degraded_ — the graph extraction consumed attention budget.

### Proposal #5: Stability-Plasticity

Inspired by neuroscience's complementary learning systems. Separate stable facts (phones, IDs, codes) from plastic ones. Regex classifier routes at extraction time.

**Inconclusive:** Phase 1 passed (80% recall), but Phase 2 tested on the wrong scenarios — Scenario 1 has zero phone/ID probes. Deferred for proper re-testing.

### Proposal #10: Schema-Guided Hybrid

Generate a context-specific extraction schema from the first few messages, then use it to guide extraction.

**Kill:** 65% schema coverage (below 70% threshold). The generator produced domain-specific types (`pre_money_valuation`) instead of abstract categories (`correction`, `quantity`). Semantic gap between generated and expected types.

**Across all five probes:** Quantities remained at 0-33% retention. None of the architectural proposals solved the quantity problem.

---

## Week 1, Day 3: The Leaderboard and External Benchmarks (Feb 26)

### Full Leaderboard on gpt-5-nano

Re-ran all strategies on gpt-5-nano for a clean same-model comparison:

| Strategy | Accuracy | Retention |
|----------|----------|-----------|
| **Hybrid** | 7/8 (88%) | 71% |
| **Full Context** | 7/8 (88%) | 66% |
| **Structured(8)** | 6/8 (75%) | 60% |
| **RLM(8)** | 5/8 (63%) | 53% |
| **DiscoveredRLM** | 4/8 (50%) | 56% |
| **Summarize(8)** | 3/8 (38%) | 48% |
| **RLLM** | 3/8 (38%) | 42% |
| **Window(10)** | 2/8 (25%) | 45% |

Model matters: gpt-5-nano is weaker than Haiku. Full Context dropped from 100% to 88% (fails Contradiction Resolution even with all messages). Structured jumped from 63% to 75% (key-value extraction plays to nano's strengths). Summarize dropped from 75% to 38% (narrative summarization degrades on weaker models).

### Proxy Benchmark Sweep

One-day parallel run against industry benchmarks:

| Track | Full Context | RLM(8) |
|-------|-------------|--------|
| LongMemEval (proxy) | 1/3 | **2/3** |
| MemoryArena (proxy) | 3/4 | 3/4 |
| MemoryAgentBench (proxy) | **1/4** | 0/4 |
| Cross-session | **4/4** | 3/4 |
| Multi-agent handoff | 3/3 | 3/3 |
| Scale ladder | 3/3 | 3/3 |

RLM won on LongMemEval, tied on MemoryArena, lost on MemoryAgentBench and cross-session. Not uniformly better — task family matters.

### Official-Mode Benchmark Runs

Upgraded from proxy adapters to official datasets/splits:

| Benchmark | Full Context | RLM(8) |
|-----------|-------------|--------|
| LongMemEval | 2/3 | **3/3** |
| MemoryArena | 2/4 | **3/4** |
| MemoryAgentBench | 1/4 | 1/4 |

RLM improved on 2/3 tracks. MemoryAgentBench remained hard for both — model knowledge ceiling, not memory.

### Memory-to-Action Micro

Two scenarios testing whether retained facts translate to correct action plans:

- Conference Logistics: Both strategies passed (8/8).
- Incident Rollback: Full Context 6/8, RLM **0/8 — safety refusal**.

RLM's compression stripped conversational framing, making "rollback to v2.8.3" and "canary at 10%" look like directives to manipulate a production system. The model refused. This was a new failure mode: compression changing perceived intent, not just dropping facts.

**Later realized:** The benchmark was flawed. Asking for "a 4-step action plan" tested model action-planning capability, not memory. Full Context also only scored 6/8 despite having all messages. Redesigned in v2 to use fact-recall questions instead.

---

## Week 1, Day 3: Frontend and Dashboard (Feb 26)

Built a web UI for exploring results: landing page with animated hero, data storytelling page with scroll-driven narrative, multi-panel dashboard with filter bar and URL sync. TanStack Query for data hooks, React for rendering, CSS custom properties for theming.

The dashboard visualized the leaderboard, per-scenario grids, probe retention heatmaps, and cost/latency tradeoffs. Made the data explorable without reading JSON files.

---

## Week 2, Day 1: The Quantity-Pinning Breakthrough (Feb 26-27)

### Design Phase

The first six experiments circled around the same problem: the sub-LLM's extraction is lossy, and no architectural wrapper fixes it. Five proposals all abandoned. The quantity problem persisted.

Two new hypotheses emerged from the findings:

1. **Blind compression is the root cause.** The sub-LLM compresses without knowing what the user will ask. If it knew the question, it could keep relevant facts.
2. **The natural-language blob should be preserved, not parsed.** PersistentRLM proved that structured stores fragment associations. Instead of fixing the blob, add a side-channel for the specific fact types it drops.

### Two New Strategies

**Query-Time Distillation (QTD):** Accumulate all messages raw with zero compression. When context exceeds the token budget at query time, fire a single sub-LLM call guided by the user's actual question. This eliminates blind compression entirely — the sub-LLM knows exactly what matters.

**Quantity-Pinning Buffer (QPB):** Extend RLM with a regex side-channel. After each delegation cycle, scan the sub-LLM's output for dollar amounts, counts, phone numbers, IDs, percentages, and rates. Pin them in a `Map<string, string>` that persists across cycles. The natural-language blob stays untouched. Zero additional LLM calls — just regex after each existing delegation.

### Results

| Strategy | Retention |
|----------|-----------|
| Full Context | 98.4% |
| **QTD** | **98.4%** |
| **QPB** | **96.8%** |
| RLM(8) | 75.8% |

QPB jumped retention from 75.8% to 96.8% (+21pp) with zero additional cost. The gains were exactly where RLM was weakest:

| Type | RLM(8) | QPB |
|------|--------|-----|
| date | 33% | **100%** |
| phone/id | 57% | **100%** |
| quantity | 65% | **100%** |

QTD matched Full Context at 98.4%, proving that question-guided compression eliminates blind loss. But its latency tradeoff (every `getContext()` fires an LLM call) makes it impractical for production. QPB is the ship candidate.

**Important caveat:** These numbers are _probe retention_ — did the fact survive in the strategy's internal state? Not _final-answer accuracy_ — did the strategy produce the correct answer? QPB hasn't been tested on the full leaderboard (8-scenario pass/fail). The leaderboard run is the next validation step.

---

## Week 2, Day 1: The vNext Experiment Matrix (Feb 27)

With the Quantity-Pinning breakthrough, we designed a structured experiment plan for promoting QPB to production:

**Phase 1 (highest-leverage fixes):**
- Quantity Pinning Buffer — **GO** (Quantity-Pinning results)
- Intent Framing Preservation — **REWORK** (benchmark was flawed)
- Stability-Plasticity Re-test — **KILL**

**Phase 2 (architecture upgrades):** Dual-Track RLM, Semantic Depth Router — gated on ≥2 GOs from Phase 1.

**Phase 3 (strategy routing):** Meta-Router across RLM/Hybrid/Full Context — gated on Phase 2 results.

**Promotion criteria:** Quantity retention ≥50%, phone/ID ≥90%, cross-session 4/4, benign refusal rate 0%, ≤10% token overhead, improve on ≥2/3 official tracks.

---

## Week 2, Day 1: Closing the Stability-Plasticity Question (Feb 27)

### Initial Full-Run (Without Quantity-Pinning)

The first proper re-test with 2 reps per strategy across all 8 scenarios. StabilityPlasticity: 65.3% vs RLM: 62.1% (+3.2pp). Kill triggered by side effects: `date -17pp`, `relationship -17pp`.

### Final Re-Test with Quantity-Pinning

The definitive run with three improvements: quantity-pinning classifier (currency/percentages/number+unit via regex), fresh RLM(8) baseline alongside every scenario, and per-hypothesis kill criteria.

Phase 1 passed (24/24 recall, 0 false positives). Phase 2 ran 32 comparisons (2 reps × 8 scenarios × 2 strategies): StabilityPlasticity 64.5% vs RLM 58.9% (+5.6pp overall). Both hypotheses failed:

- **H1 (phone/id):** Δ 0pp. RLM already retains phone/id at 86% — the stable buffer adds nothing.
- **H2 (quantity):** Δ +9pp (18% → 26%). Real but below the +10pp threshold.

Biggest gains were on untargeted medium-retention types: date (+17pp), relationship (+17pp), spatial (+17pp). The stable buffer may free the sub-LLM's attention for non-stable facts — but comparing the initial run (date −17pp) with the re-test (date +17pp), the same types swung 34pp between runs. **The variance is the finding:** per-type deltas are noise, not signal. The mechanism's overall effect (+3-6pp) is too small and too unstable to justify the complexity.

**Verdict: KILL.** Three runs across two configurations, all fail promotion criteria. Abandoned. This definitively validated the Quantity-Pinning direction: the problem isn't _which facts_ to protect but _how_ to compress without losing them (QPB's approach).

---

## Week 2, Day 1: Intent Framing — The Flawed Benchmark (Feb 27)

### v1 Run

Tested QPB+Frame (benign-context framing injected into system prompt) to eliminate safety refusals from Memory-to-Action Micro.

Results were confusing: all strategies scored poorly. Full Context averaged 4.7/8 checks and had 0/6 passes. Even the ceiling couldn't pass the test.

### The Realization

The benchmark was testing gpt-5-nano's action-plan generation capability, not memory strategy quality. Asking "Give a concise 4-step action plan" forced selective presentation — the model restructured and omitted facts for narrative flow. The safety refusals were triggered by the action-plan question interacting with compressed context, not by compression alone.

### v2 Redesign

Changed the final question from "Give a concise 4-step action plan with exact values" to "List all the current, corrected details." Same regex scoring, same scenarios. Now tests whether facts survived compression, not whether the model can generate plans.

The v2 rerun should show Full Context near 100% (a proper ceiling) and isolate memory strategy differences from model capability.

---

## Week 2, Day 1 (cont.): Findings Cleanup and Benchmark Redesign (Feb 27)

### Findings Doc Cleanup

A full re-read of findings.md revealed structural problems that had accumulated as new experiments were appended:

1. **Duplicate Official Benchmarks section** — the same results appeared twice (once misplaced between the Feasibility Sprint and Stability-Plasticity, once in the correct position after the Proxy Sweep). Removed the duplicate.
2. **Proxy Benchmarks floating without a header** — the parallel benchmark results were orphaned below the Implications section with no `##` heading. Added a proper section header.
3. **Duplicate implication numbering** — two items both numbered "8." Renumbered.
4. **Orphaned recommendations at the bottom** — 36 lines of pasted suggestions from an earlier analysis, all superseded by work already done (QPB, Stability-Plasticity re-test, intent framing, experiment matrix). Removed.
5. **Open Questions nested incorrectly** — was a `###` subsection of Memory-to-Action Micro instead of its own `##` section. Promoted and updated the dual-track question as partially answered by QPB.

### Scoring Methodology Gap

The re-read also surfaced a critical assumption error: **The Quantity-Pinning experiment's 96.8% measures probe retention (facts in the delegation log), not final-answer accuracy (pass/fail on 8 scenarios).** The original leaderboard scores both, and RLM has 63% accuracy despite 53% retention — the two metrics diverge. QPB has never been run through the full leaderboard. Its probe retention is impressive, but we don't know if it passes 7/8 or 8/8 scenarios.

### Memory-to-Action Benchmark Redesign (v2)

The Memory-to-Action Micro benchmark and the Intent Framing experiment were both flawed: they asked "Give a concise 4-step action plan with exact values," which tested gpt-5-nano's action-plan generation capability, not memory. Full Context scored 0/6 passes on Intent Framing and only 4.7/8 average checks — even the ceiling failed.

**Fix:** Changed the final question from action-plan generation to direct fact recall:
- Conference Logistics: "List all the current, corrected details for this event. Include every specific value, code, name, count, and deadline."
- Incident Rollback: "List all the current, corrected details for this incident. Include the incident ID, affected region, rollback version, canary percentage, verification check, success criteria, and communication channel."

System prompt changed from "planning assistant / operational steps" to "fact-recall assistant / list all facts with exact values." Same regex scoring, same scenarios — now tests whether facts survived compression, not whether the model can write plans.

Updated findings.md: v1 results preserved as historical record, v2 redesign documented, Intent Framing verdict changed to "REWORK (pending v2 re-run)."

### QPB Cross-Session Serialization

The cross-session benchmark (`src/analysis/internal-cross-session.ts`) simulates 3 sessions with `strategy.reset()` between them. The only bridge is a persistence note the model writes. RLM fails 3/4 because exact values get dropped in the note. QPB inherits this problem — its pinned buffer is in-memory and cleared on reset.

**Fix — two changes to `src/strategies/qpb.ts`:**

1. **`serializePinnedBuffer()`** — returns a `[PINNED VALUES]...[/PINNED VALUES]` block. Appended to the persistence note at session end so exact values are in the text.
2. **Eager scan in `addMessage()`** — runs `extractQuantities()` on every incoming message and merges into the pinned buffer immediately. When a persistence note containing `$465,000` and `POL-2024-8891` is fed as a user message at session start, the quantities are captured without waiting for delegation (which may never fire in a short session).

The cross-session benchmark was updated to append `serializePinnedBuffer()` to each persistence note and now tests QPB alongside Full Context and RLM. 14 tests pass including a full serialize → reset → hydrate round-trip test.

---

## Current State (Feb 27)

### What Ships

| Strategy | Decision | Rationale |
|----------|----------|-----------|
| QPB | **Ship (behind flag)** | 96.8% probe retention, zero added LLM cost |
| QTD | Research only | Proves question-aware compression works, but query-time latency |
| Stability-Plasticity | Kill | Three runs across two configurations all fail promotion criteria |

### What's Pending

| Gate | Status |
|------|--------|
| QPB final-answer accuracy (leaderboard run) | **Not yet tested** |
| QPB cross-session | **Not yet tested** |
| QPB on official tracks (LongMemEval, MemoryArena, MemoryAgentBench) | **Not yet tested** |
| Intent Framing v2 fact-recall rerun | **Not yet tested** |
| Token overhead measurement | Expected PASS (regex only, no LLM calls) |

### The Arc

The project followed a natural progression:

1. **"Which strategy wins?"** — The leaderboard. Hybrid at the top, Window at the bottom.
2. **"What types of facts break?"** — The probe framework. Quantities, phone/IDs, spatial info destroyed.
3. **"Can we fix it architecturally?"** — Five proposals. All failed.
4. **"Why do they break?"** — Format sensitivity (PersistentRLM), blind compression (Quantity-Pinning), model limits (Intent Framing).
5. **"How do we fix it?"** — QPB: keep the blob, add a side-channel. Zero-cost, +21pp retention.

The biggest pivot was the PersistentRLM experiment. We expected typed stores to fix wholesale replacement. They made it worse. That failure reframed the entire problem: the bottleneck isn't storage architecture, it's the sub-LLM's re-ingestion quality. Once we stopped trying to restructure the blob and started protecting facts alongside it, retention jumped from 75.8% to 96.8%.

---

## Artifacts

### Code

| Path | What It Is |
|------|------------|
| `src/strategies/` | All 9+ strategy implementations |
| `src/strategies/qpb.ts` | QPB — the production candidate |
| `src/strategies/qtd.ts` | QTD — the research ceiling |
| `src/strategies/rlm.ts` | Base RLM — the baseline |
| `src/tasks/scenarios.ts` | 8 scenarios with 62 probe definitions |
| `src/analysis/` | All experiment runners |

### Results

| File | Experiment |
|------|-----------|
| `results/final-leaderboard-*.json` | Full 8-strategy leaderboard on gpt-5-nano |
| `results/rlm-loss-*.json` | Probe retention analysis |
| `results/rlm-depth-*.json` | Depth-scaling data |
| `results/rllm-extraction-*.json` | Agentic extraction results |
| `results/code-analysis-*.json` | Code classification |
| `results/probe-*.json` | Feasibility probes (5 files) |
| `results/qtd-qpb-experiment-*.json` | Quantity-Pinning / QTD results |
| `results/probe-stability-plasticity-v2-*.json` | Stability-Plasticity re-probe results |
| `results/exp-02-intent-framing-*.json` | Intent Framing results (v1) |
| `results/parallel-benchmarks-*.json` | Proxy benchmark sweep |
| `results/official-*.json` | Official benchmark runs |
| `results/memory-action-micro-*.json` | Memory-to-Action Micro results |

### Documentation

| File | What It Is |
|------|------------|
| `docs/research/findings.md` | The main research document — all findings, analysis, and implications |
| `docs/research/rlm-vnext-experiment-matrix.md` | Structured experiment plan with stop/go gates |
| `docs/research/reading-list.md` | 34 papers organized by relevance |
| `docs/research/tracer-bullet.md` | Problem statement, landscape, gaps, terminology |
| `docs/research/benchmarks.md` | 70+ benchmark catalog |
| `docs/research/proposals.md` | 10 research proposals |
| `docs/research/project-journal.md` | This file |
