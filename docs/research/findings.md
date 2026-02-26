# What LLMs Forget

### Benchmarking Long-Context Memory Strategies: Why Deeper Delegation Beats Agentic Code

---

## The Problem

Large language models forget. Not gracefully — catastrophically. When an agent runs for 50+ conversational turns, the context window fills up and something has to give. Every long-context memory strategy is a bet on what to keep and what to lose. Get the bet wrong and your agent forgets a phone number, ignores a correction, or hallucinates a budget figure that was updated three turns ago.

The field has produced increasingly sophisticated solutions — from sliding windows to recursive summarization to neuroscience-inspired memory architectures like EverMemOS. But a basic question remains underexplored: **what types of information do these strategies actually lose, and when?**

We built a benchmark to find out. Then we found something we didn't expect.

---

## The Benchmark

### 8 Scenarios, 8 Failure Modes

We designed eight conversational scenarios, each targeting a specific way memory can fail:

| # | Scenario | Steps | What It Tests |
|---|---|---|---|
| 1 | Early Fact Recall | 20 | Remembering details from message 1 after 20+ exchanges |
| 2 | State Change Tracking | 15 | Tracking inventory across cumulative updates |
| 3 | Contradiction Resolution | 15 | Handling explicit corrections ("actually, change the hotel to...") |
| 4 | Multi-hop Reasoning | 15 | Computing answers that require combining facts from different turns |
| 5 | Long Horizon + Noise | 20 | Extracting signal from irrelevant chit-chat |
| 6 | Cascading Corrections | 14 | Following corrections that change downstream calculations |
| 7 | Implicit Corrections | 16 | Detecting corrections without signal words ("actually", "wait") |
| 8 | Rapid-fire Corrections | 16 | Tracking 15+ rapid changes to a wedding seating chart |

Each scenario plays out as a multi-turn conversation. The agent receives information incrementally, then faces a final question that requires synthesizing everything it was told. A regex-based checker validates the answer against ground truth.

### Probes: Measuring What Disappears

Beyond pass/fail scoring, we instrumented each scenario with **probes** — specific facts tagged by type that we can search for in the strategy's internal state. Each probe has:

- A **fact** (e.g., "Kenji's phone 090-8765-4321")
- A **type** (`entity`, `phone/id`, `quantity`, `date`, `correction`, `spatial`, `relationship`, `decision`)
- **Patterns** to match (all must be present for the probe to count as retained)
- The **step** where the fact was introduced

62 probes across 8 scenarios. This lets us answer not just "did the strategy pass?" but "which specific facts survived compression, and which didn't?"

---

## The Leaderboard

We tested 8 strategies. Each uses a different approach to managing memory when the conversation exceeds a threshold (typically 8 messages before compression triggers):

| Strategy | Accuracy | Approach |
|---|---|---|
| **Full Context** | 8/8 (100%) | No compression — send everything. The ceiling. |
| **Hybrid** | 8/8 (100%) | Extract facts + narrative summary in parallel |
| **RLM(8)** | 7/8 (88%) | Delegate to sub-LLM with targeted questions |
| **Summarize(8)** | 6/8 (75%) | Compress old messages into a summary |
| **CorrectionAware** | 6/8 (75%) | Narrative summary + correction log overlay |
| **Structured(8)** | 5/8 (63%) | Key-value fact extraction |
| **Window(10)** | 4/6 (67%) | Keep last 10 messages, drop the rest |
| **Window(6)** | 4/8 (50%) | Keep last 6 messages, drop the rest |

### What Separates the Winners

**Hybrid** (8/8) works because it runs two tracks in parallel: one extracts facts as natural-language sentences (preserving relationships like "Floor 3 has a conference room with capacity 50"), while the other produces a narrative summary. Neither track alone scores 8/8 — the combination does.

**RLM** (7/8) uses a fundamentally different approach. Instead of summarizing, it delegates old messages to a sub-LLM with five targeted questions (ENTITIES, DECISIONS, CORRECTIONS, NUMBERS, CURRENT STATE). Theoretically elegant — task-directed extraction should preserve more than generic summarization. In practice, it fails Early Fact Recall while passing all the correction-heavy scenarios.

**Sliding Window** (4-5/8) is the baseline everyone uses in production. It works until it doesn't — anything older than the window is gone forever.

---

## Zooming Into RLM

RLM scored 7/8, but that number hides a deeper story. Using our probe framework, we ran CTX-1: a full information-loss analysis that tracked every probe through every delegation cycle.

### Retention by Fact Type

| Type | Retention | Probes Lost | What This Means |
|---|---|---|---|
| **spatial** | 0% | 3/3 | Floor plans, regions, locations — completely wiped |
| **decision** | 0% | 1/1 | "We chose X over Y" — gone |
| **phone/id** | 0% | 7/7 | Phone numbers, policy IDs, codes — zeroed out |
| **quantity** | 12% | 15/17 | Dollar amounts, counts, rates — nearly all lost |
| **entity** | 25% | 6/8 | People, products, organizations — most lost |
| **relationship** | 33% | 2/3 | "X is part of Y" — fragile |
| **correction** | 45% | 11/20 | "Changed from A to B" — half survive |
| **date** | 67% | 1/3 | Dates and deadlines — best retained |

The sub-LLM's five targeted questions specifically ask for corrections and numbers, which explains why corrections fare relatively well. But phone numbers, IDs, and spatial information get dropped despite the ENTITIES and NUMBERS questions covering them. The sub-LLM treats them as lower priority than names and dates.

### The Non-Monotonic Retention Curve

A surprise in the data: probes often show `LOST` at cycle 1, then `RETAINED` at cycles 2-3, then `LOST` again at cycles 4-5.

This isn't the sub-LLM "learning." Cycle 1 processes raw conversation (messy, easy to miss details). Cycles 2-3 process the sub-LLM's own structured output (organized under ENTITIES, NUMBERS, etc. — easier to copy forward). But cycles 4-5 show compounding loss catching up as the structured output gets re-compressed through successive delegations.

---

## The Depth Experiment

This is where it gets interesting.

Standard RLM uses **depth 1**: one sub-LLM call per compression cycle. We built a DeepRLM variant that chains N sub-LLM calls — depth 2 means the first sub-LLM's output gets re-processed by a second sub-LLM with the same targeted questions.

**The hypothesis:** Compounding loss. Each pass should degrade the information further, like photocopying a photocopy.

**The actual result:**

| Scenario | Depth 1 | Depth 2 | Delta |
|---|---|---|---|
| Early Fact Recall | 1/10 | 8/10 | **+7** |
| State Change Tracking | 2/7 | 3/7 | +1 |
| Contradiction Resolution | 4/8 | 4/8 | 0 |
| Multi-hop Reasoning | 6/8 | 7/8 | +1 |
| Long Horizon + Noise | 7/8 | 3/8 | **-4** |
| Cascading Corrections | 5/7 | 4/7 | -1 |
| Implicit Corrections | 6/7 | 5/7 | -1 |
| Rapid-fire Corrections | 6/7 | 7/7 | +1 |
| **Total** | **37/62 (59.7%)** | **41/62 (66.1%)** | **+6.4pp** |

Depth 2 is **net positive**. Overall retention improved from 59.7% to 66.1%.

### Two Modes

The data reveals that depth 2 has two distinct effects depending on the scenario:

**Self-correction mode** (4 scenarios improved): The second sub-LLM pass reads the first pass's structured output and catches facts that the first pass missed when processing raw conversation. Early Fact Recall jumped from 1/10 to 8/10 — the first pass dropped early project details buried under 20 turns of subsequent conversation, but the second pass, working from an organized knowledge extraction, recovered them.

**Noise amplification mode** (3 scenarios degraded): For scenarios with lots of noise or rapid changes, the second pass amplifies confusion. Long Horizon + Noise dropped from 7/8 to 3/8 — the first pass successfully filtered signal from noise, but the second pass, seeing only the extraction (where signal and noise are flattened into the same format), couldn't distinguish them.

---

## The Agentic Extraction Experiment

CTX-1 and CTX-2 showed that hand-designed prompts work surprisingly well for memory extraction. But what if we gave the LLM *more freedom* — let it write and execute its own extraction code? The [rllm](https://github.com/nicholasoxford/rllm) package enables exactly this: the LLM generates JavaScript that runs in a V8 isolate to extract facts from conversation transcripts.

**The hypothesis:** A code-writing LLM should outperform fixed prompts. It can adapt its extraction strategy to the content — using regex for phone numbers, structured parsing for corrections, categorization for entities. The prompt-based approach is a rigid template; code is flexible.

### CTX-3: RLLM vs Hand-Rolled RLM (Same Model)

We ran both strategies on gpt-5-nano via OpenCode Zen to eliminate the model confound.

| Scenario | Hand-rolled RLM | RLLM Agentic | Delta |
|---|---|---|---|
| Early Fact Recall | 8/10 (80%) | 0/10 (0%) | +80pp |
| State Change Tracking | 5/7 (71%) | 0/7 (0%) | +71pp |
| Contradiction Resolution | 6/8 (75%) | 0/8 (0%) | +75pp |
| Multi-hop Reasoning | 7/8 (88%) | 0/8 (0%) | +88pp |
| Long Horizon + Noise | 5/8 (63%) | 0/8 (0%) | +63pp |
| Cascading Corrections | 6/7 (86%) | 2/7 (29%) | +57pp |
| Implicit Corrections | 6/7 (86%) | 0/7 (0%) | +86pp |
| Rapid-fire Corrections | 6/7 (86%) | 5/7 (71%) | +15pp |
| **OVERALL** | **49/62 (79.0%)** | **7/62 (11.3%)** | **+67.7pp** |

The hand-rolled approach dominates on every scenario. RLLM agentic retains 11.3% versus 79.0% — a 67.7 percentage-point gap. In 6 of 8 scenarios, RLLM retained exactly 0 facts.

The only scenarios where RLLM showed any retention were Cascading Corrections (2/7) and Rapid-fire Corrections (5/7) — both involve highly structured, repetitive updates that the LLM's generated code could sometimes parse.

### CTX-4: What Code Did the LLM Write?

We captured all 168 code blocks that gpt-5-nano generated across the 8 scenarios. Offline classification revealed three distinct strategy families:

| Strategy | % of Code Blocks | Description |
|---|---|---|
| **type_specific** | 29% | Attempts category-based extraction (entities, quantities, etc.) |
| **flat_extraction** | 13% | Simple line-by-line parsing with minimal structure |
| **chunking** | ~5% | Splits transcript into chunks for batch processing |
| **unknown/ineffective** | 53% | Malformed, incomplete, or non-functional code |

The LLM *recognized* it needed type-specific extraction — mirroring the structure of our hand-rolled 5-question prompt. But over half the code it produced was non-functional. The code that did run tended to parse surface patterns (regex for numbers, string matching for names) without understanding conversational context like corrections or state changes.

### Why Code Fails Where Prompts Succeed

The 5-question prompt works because it delegates to the LLM's *language understanding* capabilities — asking it to comprehend the conversation and extract meaning. The code-generation approach forces the LLM through an unnecessary indirection: first understand the extraction task, then express that understanding as JavaScript, then hope the JavaScript correctly implements the understanding.

For fact extraction from natural language, the LLM already *is* the ideal tool. Making it write code to do what it can already do with language is like asking a translator to write a translation program instead of just translating.

---

## The Persistent Stores Experiment

CTX-1 through CTX-4 identified RLM's root cause: `this.delegatedKnowledge = [subLLMResult.content]` — wholesale replacement. Every compression cycle, the sub-LLM's output completely replaces whatever was stored before. If the sub-LLM drops a fact in cycle N, it's gone forever, even if it was faithfully carried through cycles 1 through N-1.

The fix seemed obvious: borrow Hybrid's incremental merge. Parse the sub-LLM's output into typed stores (identifiers, entities, quantities, dates, corrections, structural) and merge new extractions into persistent maps. Same sub-LLM call, same cost — just parse-then-merge instead of wholesale replace.

### CTX-5: PersistentRLM vs RLM (Same Model)

We built PersistentRLM with 6 typed stores, a section parser with 25 alias mappings, an overflow bucket for unsectioned content, and multi-line entry handling. Then ran it head-to-head against base RLM on gpt-5-nano.

**The hypothesis:** Incremental persistence eliminates the copy-forward failure. Facts the sub-LLM drops in one cycle survive from previous cycles.

**The actual result:**

| Scenario | RLM(8) | PersistentRLM | Delta |
|---|---|---|---|
| Early Fact Recall | PASS | PASS | — |
| State Change Tracking | **PASS** | FAIL | **-1** |
| Contradiction Resolution | PASS | PASS | — |
| Multi-hop Reasoning | PASS | PASS | — |
| Long Horizon + Noise | PASS | PASS | — |
| Cascading Corrections | PASS | PASS | — |
| Implicit Corrections | FAIL | FAIL | — |
| Rapid-fire Corrections | PASS | PASS | — |
| **Total** | **7/8 (88%)** | **6/8 (75%)** | **-1** |

PersistentRLM is strictly worse. It lost State Change Tracking (Gadget-X: 0 instead of 200 clearance units) while gaining nothing.

### Probe-Level Retention

| Type | RLM(8) | PersistentRLM | Delta |
|---|---|---|---|
| **spatial** | 33% (1/3) | 0% (0/3) | **-33pp** |
| **decision** | 100% (1/1) | 0% (0/1) | **-100pp** |
| **quantity** | 24% (4/17) | 18% (3/17) | -6pp |
| **entity** | 63% (5/8) | 63% (5/8) | 0 |
| **relationship** | 67% (2/3) | 67% (2/3) | 0 |
| **correction** | 85% (17/20) | 80% (16/20) | -5pp |
| **phone/id** | 86% (6/7) | 86% (6/7) | 0 |
| **date** | 100% (3/3) | 100% (3/3) | 0 |
| **TOTAL** | **62.9% (39/62)** | **56.5% (35/62)** | **-6.4pp** |

Zero probes where PersistentRLM wins. Four probes where base RLM wins:

1. Gadget-X discontinued/clearance (decision) — status qualifier lost during structured extraction
2. Floor 3 conference room 50 people (spatial) — spatial facts dropped to 0%
3. 3 catered meals (quantity) — quantity association lost
4. 30 ladyfingers corrected from 24 (correction) — correction not carried forward

### Why Persistence Made Things Worse

The hypothesis assumed wholesale replacement was the bottleneck. It wasn't. The bottleneck is the sub-LLM's extraction quality, and the structured format actively degrades it.

**The mechanism:** When the sub-LLM receives base RLM's natural-language blob as "previously extracted knowledge," it processes it with full language understanding — recognizing that "Gadget-X moved to clearance, count unchanged at 200" is a single compound fact. When it receives PersistentRLM's typed stores (`QUANTITIES: - Gadget-X: 200 units` and `STRUCTURAL: - Gadget-X: moved to clearance`), it treats them as independent facts. The structured format *splits associations that the sub-LLM would naturally keep together*.

This is the inverse of the CTX-3 finding. In CTX-3, we learned that prompts beat code because code adds indirection. Here, typed stores beat natural language at *storage* but lose at *re-ingestion* — the sub-LLM processes its own structured output worse than its own natural-language output. The structure that helps humans parse information constrains the LLM's ability to maintain cross-category associations.

**Token cost:** PersistentRLM was cheaper (432K vs 516K total tokens) because serialized stores are more compact. But cheaper doesn't help if accuracy drops.

### Implication: Format Determines Extraction Quality

The sub-LLM's input format is not neutral. It shapes what the sub-LLM attends to and how it organizes its output. Feeding it structured sections causes it to produce structured sections — and in doing so, it fragments facts that naturally span categories. A warehouse item's quantity (200), status (clearance), and history (discontinued) are one fact in natural language but three entries in three stores.

This suggests the right architecture isn't "parse output into stores" but rather "keep the natural-language blob AND maintain a side-channel for facts that the blob historically drops." That's closer to what Hybrid does — dual track, not parse-and-split.

---

## What This Means

### The Photocopy Metaphor Is Wrong

The intuitive model of delegation depth — each pass degrades like a photocopy of a photocopy — doesn't match the data. The second pass isn't copying; it's **re-reading with fresh eyes**. When the first pass produces structured output (organized under ENTITIES, NUMBERS, etc.), the second pass processes that structure and can recover details that were initially missed.

This only works when the structured output is faithful. For noisy scenarios, the structure flattens signal and noise together, and the second pass can't recover what the first pass mis-categorized.

### Implications

1. **Adaptive depth is viable.** Don't use a fixed depth — use depth 2 for information-dense conversations and depth 1 for noisy ones. A simple heuristic (ratio of factual statements to filler in the transcript) could drive this.

2. **RLM's weakness is type-specific.** Phone numbers, IDs, and spatial info get dropped not because of architectural flaws but because the sub-LLM deprioritizes them. Better-targeted extraction questions (or type-specific sub-prompts) could close the gap.

3. **Hybrid-RLM fusion.** Hybrid's narrative summary preserves exactly the types that RLM loses (phone/IDs, spatial). An architecture that uses RLM's targeted extraction for corrections and decisions, plus Hybrid's narrative for identifiers and relationships, could get the best of both.

4. **Prompts beat code for NLU tasks.** The agentic extraction experiment (CTX-3) is a cautionary tale for the "let the LLM write code" school of thought. When the underlying task is natural language understanding — identifying what matters in a conversation — prompting the LLM to *do the understanding directly* outperforms asking it to *write a program* that does the understanding. Code adds indirection without adding capability. The 5-question prompt succeeds because it's a compressed representation of human expertise about what types of information matter. The LLM, when generating code, must rediscover this expertise from scratch each time — and mostly fails.

5. **Structure is the secret.** Across all experiments, the winning approaches share one trait: they give the sub-LLM a structured scaffold to fill in (5 questions, category headers, fact types). The agentic approach fails precisely because it asks the LLM to *invent* its own structure. Even when the LLM recognizes it needs category-based extraction (29% of its code attempts), the code it writes to implement that recognition is unreliable. The hand-designed structure is simultaneously a constraint and a guide.

### Open Questions

- Does the self-correction effect hold at depth 3+? (Our depth-3 run was cut short by API limits.)
- Can the sub-LLM prompt be tuned per-type to eliminate the 0% retention categories?
- Would a larger model (e.g., GPT-4, Claude Sonnet) close the agentic extraction gap? The code quality might improve enough to make the indirection worthwhile.
- Is there a hybrid approach — prompt-guided code generation — that gets the best of both worlds?
- Can a dual-track architecture — natural-language blob for re-ingestion plus a side-channel store for historically-dropped fact types — outperform both base RLM and Hybrid?
- Is the format sensitivity specific to gpt-5-nano, or do larger models also extract worse from structured input than natural-language input?

---

## Appendix

### A. Methodology

- **LLM:** Claude Haiku 4.5 (via OpenRouter) for CTX-1; gpt-4.1-mini (via OpenAI) for CTX-2; gpt-5-nano (via OpenCode Zen) for CTX-3/4/5
- **Compression trigger:** Every 8 messages, with a 4-message recent window
- **Probe matching:** Case-insensitive substring matching; all patterns must be present
- **Retention measurement:** Probes checked against final delegation log entry after the probe's introduction step; CTX-5 checked probes against final answers (no re-run required)
- **RLLM configuration:** rllm v1.2.0, maxIterations=5, V8 isolate code execution
- **Same-model comparison:** CTX-3 hand-rolled RLM baseline re-run on gpt-5-nano to eliminate model confound
- **PersistentRLM configuration:** 6 typed stores (identifiers, entities, quantities, dates, corrections, structural) + overflow bucket; 25 section alias mappings; 25-char prefix key matching for merge; same single sub-LLM call per cycle as base RLM

### B. Full Probe Definitions

62 probes across 8 scenarios, tagged by 8 types:
- `entity` (8 probes): People, products, organizations
- `phone/id` (7 probes): Phone numbers, policy IDs, codes, reference numbers
- `quantity` (17 probes): Dollar amounts, counts, rates, measurements
- `date` (3 probes): Dates, deadlines, scheduled times
- `correction` (20 probes): Facts that changed from a previous value
- `spatial` (3 probes): Locations, floor plans, regions
- `relationship` (3 probes): Structural connections between entities
- `decision` (1 probe): Choices made and alternatives rejected

### C. Repository

All code, data, and analysis scripts: [github.com/TheGermanAZ/context-arena](https://github.com/TheGermanAZ/context-arena)

Key files:
- `src/strategies/` — All 9+ strategy implementations (including `persistent-rlm.ts`, `rllm-strategy.ts`)
- `src/tasks/scenarios.ts` — Scenarios with probe definitions
- `src/analysis/rlm-loss.ts` — CTX-1 retention analysis
- `src/analysis/rlm-depth.ts` — CTX-2 depth-scaling analysis
- `src/analysis/rllm-extraction.ts` — CTX-3 agentic extraction analysis
- `src/analysis/code-analysis.ts` — CTX-4 code strategy classification
- `src/analysis/rlm-nano-baseline.ts` — CTX-3 same-model baseline
- `src/analysis/probe-check.ts` — CTX-5 probe analysis against existing results (no API calls)
- `results/` — Raw benchmark and analysis data
