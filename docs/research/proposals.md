# Novel Research Proposals: Long-Context Agent Memory

10 research proposals generated from Context Arena findings and 34-paper literature survey.

---

## How This Document Fits

| Document | Purpose |
|----------|---------|
| [tracer-bullet.md](./tracer-bullet.md) | The problem, the landscape, the gaps, the terminology |
| [reading-list.md](./reading-list.md) | 34 papers — what to read, in what order, and how each connects to our work |
| [findings.md](./findings.md) | Our benchmark results, the depth experiment, and what we learned |
| [benchmarks.md](./benchmarks.md) | Every relevant benchmark — repos, leaderboards, datasets, how to run them |
| **This file** (proposals.md) | 10 novel research directions grounded in the literature and our data |

---

## Table of Contents

1. [Depth-Adaptive RLM (DA-RLM)](#1-depth-adaptive-rlm)
2. [Correction Format Engineering](#2-correction-format-engineering)
3. [Structural Shadow Graphs (SSG)](#3-structural-shadow-graphs)
4. [Foresight-Guided Extraction](#4-foresight-guided-extraction)
5. [Stability-Plasticity Decomposed Memory](#5-stability-plasticity-decomposed-memory)
6. [EMAS: Evolutionary Memory Architecture Search](#6-emas-evolutionary-memory-architecture-search)
7. [Pareto-Optimal Memory Compression](#7-pareto-optimal-memory-compression)
8. [Episodic Compression Memory (ECM)](#8-episodic-compression-memory)
9. [Cascade-Aware Compression (CAC)](#9-cascade-aware-compression)
10. [Schema-Guided Hybrid Extraction (SGHE)](#10-schema-guided-hybrid-extraction)

---

## Gap Coverage

| Gap | Proposals |
|-----|-----------|
| **Gap 1**: Memory-Action Integration | #7 (Pareto includes scenario pass/fail) |
| **Gap 2**: Cross-Session Learning | **#8** (ECM — direct attack) |
| **Gap 4**: Memory Write Quality | #4 (Foresight), #5 (Stability-Plasticity), #10 (Schema) |
| **Gap 5**: Selective Forgetting / Corrections | **#2** (Format Engineering), **#9** (Cascade-Aware) |
| **Gap 6**: Cost-Performance Tradeoffs | **#7** (Pareto — direct attack), #1 (Adaptive Depth) |
| **Gap 8**: Backbone Robustness | #6 (EMAS cross-model validation) |
| **0% retention categories** | #3 (Shadow Graphs), #4 (Foresight), #5 (Stability-Plasticity) |

## Composability

Several proposals are explicitly designed to stack:
- **#1 (Adaptive Depth) + #9 (Cascade-Aware)**: Route cascade-heavy segments to deeper compression with anchored critical facts
- **#3 (Shadow Graphs) + #4 (Foresight)**: Graph preserves structure; foresight guides what goes into the graph
- **#5 (Stability-Plasticity) + #2 (Format Engineering)**: Dual channels with entrenchment-bypassing correction formats in the Plastic channel
- **#6 (EMAS)** can search over configurations that include any of the other proposals as module options

---

## 1. Depth-Adaptive RLM

### Title

**Depth-Adaptive Recursive Language Models: Content-Aware Compression Routing for Long-Context Memory**

### Abstract

We propose Depth-Adaptive RLM (DA-RLM), a memory compression architecture that dynamically selects the number of recursive sub-LLM processing passes per compression cycle based on a lightweight content assessment of the incoming conversation segment. Our approach is motivated by an empirical finding from the Context Arena benchmark: depth-2 RLM exhibits a bimodal response pattern, improving retention on information-dense segments (Early Fact Recall: 10% to 80%) while degrading on noisy segments (Long Horizon + Noise: 87.5% to 37.5%). DA-RLM introduces a pre-compression classifier that routes each segment to the optimal depth, unifying the self-correction benefits of deeper processing with the noise-resilience of shallow passes. We predict this will capture 90%+ of the depth-2 gains without incurring its worst-case losses, closing the gap between RLM's current 88% and the oracle Hybrid strategy's 100% on Context Arena.

### Motivation

Recursive Language Models (RLMs) compress conversation history by delegating old context to sub-LLMs that extract structured knowledge states. The Context Arena benchmark evaluates this approach across 8 conversational scenarios with 62 probe facts spanning 8 types (entities, quantities, phone/IDs, dates, corrections, spatial facts, relationships, and decisions). The standard depth-1 RLM achieves 59.7% overall retention — strong on entities and corrections but catastrophically failing on phone numbers, IDs, and spatial facts.

The depth-scaling experiments in Context Arena reveal a surprising and previously undocumented phenomenon. When the sub-LLM re-processes its own output (depth-2), overall retention rises from 59.7% to 66.1% — a 10.7% relative improvement. But this aggregate masks two distinct mechanisms:

**Self-correction mode.** In information-dense, structured scenarios like Early Fact Recall (20 steps of project specification), depth-2 dramatically improves retention (1/10 to 8/10). The second pass catches details the first pass missed and reorganizes the output into a more complete knowledge state.

**Noise amplification mode.** In noisy, low-signal-density scenarios like Long Horizon + Noise (interleaved critical facts and small talk), depth-2 degrades performance (7/8 to 3/8). The second pass, lacking access to the original transcript, cannot distinguish between preserved signal and introduced noise. Each reprocessing compounds semantic drift — exactly the mechanism documented by the Scaling Paradox paper (#11).

This bimodal behavior is precisely the gap that existing work fails to address:

- **SELF-ROUTE** (EMNLP 2024) routes queries to RAG vs. long-context at retrieval time but does not consider compression depth as a variable.
- **ACON** (Oct 2025) optimizes compression guidelines per-task through "textual gradient descent" but treats compression as a single-pass operation.
- **MemEvolve** (Dec 2025) evolves the memory architecture itself per-task, but its evolution operates at architecture topology level, not at the granularity of per-cycle depth selection.
- **MemSearcher** (Nov 2025) demonstrates that smaller models with better strategies outperform larger models with naive strategies, supporting our hypothesis that routing intelligence matters more than raw model capability.

No existing system dynamically adjusts compression depth per-cycle based on content characteristics.

### Proposed Method

DA-RLM extends the standard RLM architecture with three components: a Content Assessor, a Depth Router, and a depth-conditioned compression pipeline.

```
Incoming segment ──> [Content Assessor] ──> [Depth Router] ──> [RLM @ depth d]
                          |                       |
                    feature vector          d in {1, 2, 3}
                    (5 signals)            (or bypass: d=0)
```

**Content Assessor.** Before each compression cycle, extracts five cheap-to-compute signals from the conversation segment queued for delegation:

1. **Information density** (tokens per distinct entity/number). Computed via regex — no LLM call required.
2. **Correction frequency** (count of contradiction/update markers). Regex scan for hedging language.
3. **Identifier density** (count of phone numbers, IDs, codes, alphanumeric strings).
4. **Noise ratio** (fraction of messages containing no extractable facts).
5. **Existing knowledge size** (token count of accumulated delegated knowledge).

The Content Assessor produces a 5-dimensional feature vector in approximately 1ms (regex only, no LLM calls).

**Depth Router.** Maps the feature vector to a depth decision d in {0, 1, 2, 3}:

- **d=0 (bypass):** Skip compression entirely; keep in recent window.
- **d=1 (standard):** Single-pass extraction. Default for noisy segments or high identifier density.
- **d=2 (self-correcting):** Two-pass extraction with verification. For information-dense segments with low noise.
- **d=3 (deep):** Reserved for high correction frequency and complex state reconciliation.

Initial routing policy (rule-based, derived from Context Arena data):

```
if noise_ratio > 0.5:          d = 1    (protect against amplification)
elif identifier_density > 3:   d = 1    (IDs degrade at depth > 1)
elif info_density > threshold_high AND correction_freq > 0:
                               d = 2    (ideal self-correction candidate)
elif correction_freq > 3:      d = 3    (deep reconciliation needed)
elif knowledge_size > 4000:    d = 1    (Scaling Paradox protection)
else:                          d = 1    (conservative default)
```

Phase 2 replaces the rule-based policy with a lightweight classifier trained via ACON-style textual gradient descent.

**Depth-Conditioned Compression.** Two modifications to the DeepRLM pipeline:

1. **Transcript anchoring at depth >= 2.** Pass 2's prompt includes a token-budgeted excerpt of the original transcript (first and last 500 tokens) as a "ground truth anchor."
2. **Type-specific preservation directives.** When the Content Assessor detects high identifier density, the prompt is augmented: "The following identifiers MUST appear verbatim in your output: [list]."

### Expected Results

| Strategy | Predicted retention | Basis |
|----------|-------------------|-------|
| RLM depth-1 (baseline) | 59.7% | Measured |
| RLM depth-2 (blanket) | 66.1% | Measured |
| DA-RLM (rule-based) | 75-80% | Captures depth-2 gains, avoids losses |
| DA-RLM (learned routing) | 82-88% | ACON-style optimization |
| Hybrid (oracle) | 100% | Measured |

Cost efficiency: 75-80% retention at 1.3x cost of depth-1, versus DiscoveredRLM's 79% at 2.0x cost.

### Risks and Limitations

1. The self-correction effect may not be robust (high variance across runs).
2. Regex-based content assessment may be too crude for complex scenarios.
3. Transcript anchoring may not solve the fundamental identifier loss.
4. Cost model assumes sub-LLM calls dominate.
5. Generalization beyond Context Arena's 8 scenarios.
6. Depth-3 may never be optimal (Context Arena's depth-3 showed universal catastrophic failure).

---

## 2. Correction Format Engineering

### Title

**Correction Format Engineering: Bypassing Belief Entrenchment Through Presentation Structure in Long-Context Memory Systems**

### Abstract

Large language models exhibit anti-Bayesian drift — when presented with contradicting evidence, their confidence in the original belief increases rather than updating (72.9% to 83.3% over successive rounds). This work proposes a systematic study of how the *format* in which corrections are presented to an LLM affects whether the model actually integrates the update. We introduce a controlled experimental framework that varies correction presentation across seven distinct formats while holding semantic content constant, measuring the entrenchment bypass rate using Context Arena's correction-heavy scenarios. We hypothesize that formats which force the model to *re-derive* the corrected state from first principles will outperform formats that merely *assert* the new value, because re-derivation disrupts the attention pathway to the entrenched prior.

### Motivation

Three converging lines of evidence motivate this work.

First, Khan et al. (2025, "Anti-Bayesian Drift," #17) demonstrated that LLM confidence moves in the wrong direction when confronted with contradiction. Over successive debate rounds, models holding an incorrect position became *more* confident (72.9% to 83.3%). This is not a simple failure to update — it is an active reinforcement of the prior.

Second, Costello et al. (2025, "Belief Entrenchment," #25) formalized this using a Martingale Score, showing that LLM belief trajectories systematically violate the martingale property required of rational belief updating.

Third, the Context Arena benchmark provides concrete evidence: the Correction-Aware strategy — which explicitly tracks corrections in a dedicated log with `[CORRECTED]` tags and instructions to "trust these over the summary" — scored only 75%. The model has the correct information, sees an explicit instruction to prefer it, and still fails 25% of the time.

What no existing work has studied is whether the *format* of correction presentation — distinct from its semantic content — affects the entrenchment bypass rate.

### Proposed Method

**Seven correction formats to test:**

1. **Explicit Negation (baseline):** "[CORRECTED] budget: $12M (was: $10M). The previous value of $10M is WRONG."
2. **Contrastive Pair:** Table format with OUTDATED (DISCARD) and CURRENT (USE) columns.
3. **Temporal Supersession:** Timeline with version numbers. "RULE: Always use the highest version number."
4. **Authoritative Override:** "SYSTEM OVERRIDE (priority: maximum): The pre-money valuation is $12M."
5. **Self-Generated Re-Derivation:** Present the correction as a chain-of-thought the model must complete. "Given 10M shares outstanding and a new price of $1.20/share, the pre-money valuation is: ___."
6. **Structured Diff Notation:** Code-diff format (`- pre_money: $10M` / `+ pre_money: $12M`).
7. **Socratic Elicitation:** Clarifying question before the probe: "Which is the most recently stated pre-money valuation — $10M or $12M? Use that value."

**Measurement methodology.** Four metrics per correction probe:

- **Surface Acknowledgment Rate (SAR):** Does the model mention the corrected value?
- **Operational Integration Rate (OIR):** Does the downstream calculation use the corrected value?
- **Prior Contamination Rate (PCR):** Does the old value appear in the response?
- **Confidence Delta:** Log-probability analysis on corrected vs. entrenched token.

**Experimental design.** 7 formats × 3 strategies (Full Context, CorrectionAware, DiscoveredRLM) × 3 correction scenarios = 63 conditions × 5 repetitions = 315 runs.

### Expected Results

Predicted hierarchy: Re-Derivation > Structured Diff > Contrastive Pair > Temporal Supersession > Socratic Elicitation > Authoritative Override > Explicit Negation.

Core prediction: formats requiring the model to *reconstruct* the corrected value through computation will outperform formats that *assert* the corrected value declaratively. Explicit Negation should perform worst because negation paradoxically strengthens the association between "budget" and "$10M" in the attention pattern.

### Risks and Limitations

1. Format effects may be small relative to model variance.
2. Re-Derivation may not generalize beyond calculable corrections.
3. Format engineering may be model-specific.
4. Socratic Elicitation modifies the interaction protocol.
5. This examines format effects at the prompt level — a workaround, not an architectural fix.

---

## 3. Structural Shadow Graphs

### Title

**Structural Shadow Graphs: A Lightweight Relational Overlay for Recursive Language Model Memory**

### Abstract

Recursive Language Model (RLM) strategies delegate context compression to sub-LLMs, but empirical evaluation on the Context Arena benchmark reveals catastrophic failure on fact types that encode structural relationships: 0% retention on spatial facts, 0% on decisions, 0% on phone/ID tokens, and only 33% on inter-entity relationships. We propose Structural Shadow Graphs (SSG), a lightweight, typed property graph that runs as a parallel data structure alongside RLM's text-based delegation output. During each compression cycle, the sub-LLM's extraction is parsed into graph triples. On retrieval, the graph is serialized into a deterministic, relationship-preserving text block injected alongside the narrative output. SSG is designed to be minimally invasive to RLM's existing delegation cycle.

### Motivation

Context Arena's CTX-1 analysis reveals:

- **Spatial facts**: 0% retention (3/3 probes lost). Facts like "Floor 3 has conference room with capacity 50" are consistently destroyed during text flattening.
- **Phone/ID tokens**: 0% retention (7/7 probes lost). Identifiers are among the first casualties of compression.
- **Decisions**: 0% retention (1/1 probes lost). The decision and its consequent state change vanish at the first delegation cycle.
- **Relationships**: 33% retention (2/3 probes lost). Facts requiring maintaining *connections* between entities degrade.

The **Hybrid strategy** achieves better results because it preserves relationships as explicit structured sentences and maintains them as discrete, indexable items. This pattern — text representations losing structure that explicit data structures preserve — is well-documented in the graph memory literature (MAGMA #32, A-MEM #18, Graph Memory Survey #33, Hindsight #20).

However, both MAGMA and Hindsight are complete memory architectures that replace the underlying storage layer. The question: **can we add the minimum viable graph structure to RLM's delegation cycle to rescue the fact categories where text flattening fails?**

### Proposed Method

**Graph Representation.** Three node types, five edge types:

**Node types:**
1. **Entity nodes** — persons, places, organizations, products. Key-value attribute bag.
2. **Token nodes** — identifiers, codes, phone numbers. Immutable strings with entity link.
3. **Space nodes** — locations, floors, rooms, regions. Containment hierarchy.

**Edge types:**
1. `LOCATED_AT(entity, space)` — spatial containment
2. `RELATED_TO(entity, entity, type)` — typed relationships
3. `IDENTIFIED_BY(entity, token)` — entity-to-identifier links
4. `DECIDED(entity, decision, outcome)` — decisions with agents and results
5. `SUPERSEDES(node_v2, node_v1)` — correction chains

**Integration with RLM.** A second sub-LLM call during delegation extracts structured triples:

```
ENTITY: Kenji | phone: 090-8765-4321 | neighborhood: Shinjuku
SPATIAL: Floor 3 > Conference Room | capacity: 50
RELATION: Paul -- couple -- Quinn
DECISION: Gadget-X | discontinued | moved to clearance
SUPERSEDES: Kenji.neighborhood | Shinjuku | was: Shibuya
```

**The graph is never compressed.** It accumulates monotonically. Across Context Arena's 8 scenarios, total structural fact count ranges from 7-15 per scenario — well within a few hundred tokens.

**Retrieval is deterministic serialization:**

```
STRUCTURAL MEMORY:
[Entities] Kenji: phone=090-8765-4321, neighborhood=Shinjuku (was: Shibuya)
[Spatial] Floor 3 > Conference Room (capacity: 50), assigned: engineering
[Relations] Paul <--couple--> Quinn; Jack <--conflict--> Iris
[Decisions] Gadget-X: discontinued, moved to clearance
```

### Expected Results

- Spatial: 0% → 80-100%. Space node hierarchy directly preserves containment relationships.
- Phone/ID: 0% → 90-100%. Token nodes are immutable strings, immune to paraphrasing.
- Decisions: 0% → 70-90%. DECIDED edge type provides a structured slot.
- Relationships: 33% → 80-100%. RELATED_TO edges directly encode connections.
- Overall RLM retention: ~55% → 75-85%.
- Overhead: ~30-50% above baseline RLM (one additional sub-LLM call + 200-500 tokens serialization).

### Risks and Limitations

1. Graph extraction reliability (malformed output corrupts the graph).
2. Entity resolution (ambiguous references like "he", "the room").
3. Graph-text divergence (conflicting signals to the main LLM).
4. Generalization beyond Context Arena's specific failure categories.
5. Scalability for very long conversations with many distinct entities.
6. Overhead of second sub-LLM call (could be folded into one call at quality cost).

---

## 4. Foresight-Guided Extraction

### Title

**Foresight-Guided Extraction: Anticipatory Salience Signals for Recursive Language Model Memory**

### Abstract

RLM memory strategies extract knowledge using fixed, retrospective questions, but these provide no signal about which facts will matter for downstream tasks. We propose augmenting the RLM extraction sub-LLM with a foresight module that generates anticipatory salience priors — lightweight predictions of what information types are likely to be queried in the future, conditioned on conversation genre and information-theoretic surprise. By biasing extraction toward facts that score high on anticipatory salience, we expect to close the 0% retention gap on phone/ID and spatial fact types while maintaining or improving correction retention.

### Motivation

Context Arena's CTX-1 reveals a prioritization failure: the sub-LLM's NUMBERS question asks for "every specific number, amount, date, time, code, ID, or measurement," yet phone numbers and IDs achieve 0% retention across 7 probes. The root cause is not coverage but *prioritization*. Without any signal about what will actually be queried, the sub-LLM defaults to domain-salience heuristics: project names and budgets feel important; phone numbers and room capacities do not.

This is what EverMemOS (#29) addresses in a different architecture with "foresight" signals. CAT (#23) teaches the agent *when* to compress. ACE (#24) shows strategies can evolve through execution feedback. Our proposal synthesizes these into a single mechanism tailored to RLM.

### Proposed Method

**Three components:**

**1. Genre Classifier.** Single sub-LLM call at conversation start:

> "Classify this conversation's likely information needs. Rank these fact types by predicted query importance: exact identifiers, quantities, corrections, spatial information, entity names, dates, decisions."

**2. Surprise Detector.** Zero-cost online module using:
- **CORRECTION signals** via value-diff comparison against known keys.
- **HIGH_ENTROPY signals** via Shannon entropy over character bigrams (phone numbers, codes have markedly higher entropy than natural language).

**3. Salience-Augmented Extraction Prompt.** Standard RLM extraction + dynamic preamble:

```
FORESIGHT SIGNALS (pay special attention to these):
- Genre: {genre} — {top 3 fact types} are HIGH-PRIORITY
- High-surprise facts:
  "090-8765-4321" (HIGH_ENTROPY: phone number)
  "Kenji moved to Shinjuku" (CORRECTION: was Shibuya)

Extract a COMPLETE knowledge state. [standard 5 questions]
6. FLAGGED ITEMS: For each high-surprise fact above, confirm you captured it
   with its EXACT value. If missing from sections 1-5, add it here.
```

The FLAGGED ITEMS section creates a verification checkpoint inside the extraction — reflection embedded within extraction, eliminating an extra LLM call.

### Expected Results

- phone/ID: 0% → 50-70%. HIGH_ENTROPY detector flags all 7 probes.
- spatial: 0% → 33-67%. Genre classification elevates spatial facts.
- quantity: 12% → 35-50%. Genre-aware prioritization.
- correction: 45% → 55-65%. CORRECTION signal catches implicit corrections.
- Overall: 59.7% → 70-75%.
- Cost overhead: <5%. One genre call per conversation + ~75 extra tokens per extraction.

### Risks and Limitations

1. Genre misclassification deprioritizes relevant facts.
2. High-entropy false positives (URLs, code snippets).
3. Prompt bloat from many high-surprise facts.
4. Overfitting to Context Arena's 8 fact types.
5. Information-theoretic surprise is a weak proxy for importance.
6. Diminishing returns when combined with DiscoveredRLM's two-pass approach.

---

## 5. Stability-Plasticity Decomposed Memory

### Title

**Stability-Plasticity Decomposed Memory: Dual-Channel Context Management for Type-Aware Fact Retention in Long-Context AI Agents**

### Abstract

We propose a memory architecture that decomposes agent context into two independently managed channels — a *Stable* channel for facts requiring verbatim preservation (identifiers, phone numbers, spatial layouts) and a *Plastic* channel for facts that evolve through corrections and state changes. Each channel applies compression rules matched to its retention requirements: the Stable channel enforces append-only, copy-exact semantics with no summarization, while the Plastic channel maintains a versioned key-value store with explicit supersession chains. A type classifier at ingestion routes facts, and a transition protocol handles facts that cross channels.

### Motivation

Context Arena exposes a fundamental tension no existing strategy addresses. Phone numbers and IDs achieve 0% retention under *every* compression strategy except full-context passthrough. Meanwhile, corrections achieve only 45% retention even with dedicated correction-detection machinery. These are different failure modes requiring different interventions.

This maps directly onto MemRL's (#15) stability-plasticity framing. Memory-R1 (#13) has RL-trained ADD/UPDATE/DELETE operations but applies them uniformly across all fact types. The Knowledge Conflicts Survey (#16) provides the theoretical taxonomy: stable facts suffer from intra-memory corruption during compression; plastic facts suffer from context-memory conflicts when corrections arrive.

The Scaling Paradox (#11) adds an alarming dimension: larger models actively *overwrite* specific facts with parametric priors. For stable facts, more model capacity can actually *hurt*. The implication: stable facts need an architectural protection mechanism, not just better prompting.

### Proposed Method

**1. Type Classifier.** Two passes:
- Regex pass: phone numbers, IDs, confirmation codes → Stable unconditionally.
- LLM pass (~200 tokens): "Would a paraphrase destroy it (STABLE) or does it describe a value that could be updated later (PLASTIC)?"

**2. Stable Memory Channel.** Append-only key-value store with copy-exact semantics. **No compression.** Facts stored as verbatim strings:

```
[STABLE:phone] Kenji's phone: 090-8765-4321
[STABLE:id] Patient ID: RMC-2847
[STABLE:spatial] Floor 3: conference room (50 people), rooms 1-8
```

**3. Plastic Memory Channel.** Versioned key-value store with supersession chains:

- Old values move to `previous` field (not deleted).
- Format: `[CORRECTED] budget: $8,500 (was: $5,000)`.
- For cascading corrections: lightweight dependency graph flags stale entries for recalculation.

**4. Recombination Layer.**

```
STABLE FACTS (verbatim — do not paraphrase):
[list from Stable channel]

CURRENT STATE (latest values — trust over any earlier mention):
[list from Plastic channel, current values only]

CORRECTION LOG (what changed and when):
[list from Plastic channel, supersession chains]
```

**5. Transition Protocol.** When a correction targets a Stable entry:
1. Create Plastic correction record.
2. Update Stable store in-place with new value.
3. Retain Plastic record for one cycle, then garbage-collect.

### Expected Results

- Phone/ID: 0% → 80%+ (Stable channel eliminates summarization-induced paraphrasing).
- Spatial: 0% → 70%+ (structural relationships preserved verbatim).
- Corrections: 45% → 75%+ (versioned store with supersession chains).
- Overall: 79% → 88%+ across 62 probes.

### Risks and Limitations

1. Classification errors (phone number misclassified as Plastic → lost).
2. Stable channel growth in identifier-heavy conversations.
3. Dependency graph complexity for cascading corrections.
4. Evaluation scope limited to Context Arena's 8 fact types.
5. No learning mechanism — hand-designed routing rules.

---

## 6. EMAS: Evolutionary Memory Architecture Search

### Title

**EMAS: Evolutionary Memory Architecture Search for Scenario-Adaptive Long-Context Agents**

### Abstract

We propose EMAS, an evolutionary search framework that discovers optimal memory architecture configurations per conversational scenario rather than relying on a single hand-designed strategy. Building on MemEvolve's modular design space decomposition (encode/store/retrieve/manage) and Context Arena's 62-probe fitness function, EMAS uses a MAP-Elites evolutionary algorithm to co-discover scenario-specific memory configurations and a lightweight router that selects among them at inference time.

### Motivation

No single memory strategy dominates all eight scenarios. Hybrid achieves 100% scenario accuracy but retains only a subset of individual probes. RLM excels on correction scenarios but fails Early Fact Recall. The per-scenario retention profiles differ structurally by fact type, suggesting the architecture should adapt.

ACON (#5) demonstrated per-task compression guidelines. MemEvolve (#19) showed memory architectures can evolve. MemSearcher (#14) showed 3B > 7B with better strategy. But no work combines evolutionary search with a probe-level fitness function for conversational memory.

### Proposed Method

**Design Space (4,320 configurations):**

| Module | Options |
|--------|---------|
| **Encode** | narrative_summary, fact_extraction, targeted_delegation, dual_track, type_specific |
| **Store** | replace, append_deduplicate, layered, versioned |
| **Retrieve** | system_prefix, interleaved, on_demand |
| **Manage** | compress_every: {4,6,8,12}, recent_window: {2,4,6}, depth: {1,2,3}, adaptive_depth: bool |

**Fitness Function.** Three levels:
1. **Scenario pass/fail** (hard constraint: ≥6/8 to survive).
2. **Probe retention** (primary: weighted sum, weights inversely proportional to baseline retention rates).
3. **Cost** (penalize configurations >1.5x Hybrid's overhead).

**MAP-Elites** with 2D behavior descriptors: correction retention rate × identifier retention rate. Each cell contains the highest-fitness configuration achieving that balance. The Pareto front reveals the fundamental tradeoff structure.

**Router.** Lightweight scenario classifier (single LLM call, first 3-5 messages) maps to best evolved configuration per MAP-Elites region.

**Preventing overfitting:** Probe-level evaluation (62 probes, not 8 binary), MAP-Elites diversity pressure, 2 held-out scenarios, cross-model validation.

### Expected Results

- Evolved configurations: 88-92% retention (vs. Hybrid's ~80% probe-level).
- Design space insight: encode module likely dominates fitness variance.
- Router accuracy: 85%+ given distinct scenario structural signatures.

### Risks and Limitations

1. Computational cost (~$200-400 for full sweep at nano pricing).
2. Benchmark saturation (only 8 scenarios).
3. Fitness landscape may be degenerate (one module explains >80% variance).
4. Router fragility on out-of-distribution conversations.
5. Prompt sensitivity (search doesn't optimize within-module prompts).

---

## 7. Pareto-Optimal Memory Compression

### Title

**Pareto-Optimal Memory Compression: A Cost-Retention Frontier for Long-Context Agent Memory**

### Abstract

We propose the first memory compression framework that explicitly optimizes on the cost-retention Pareto frontier, addressing Gap 6: no existing benchmark reports cost alongside accuracy. Every memory strategy is evaluated as a triple (token_cost, probe_retention, latency), and we introduce an algorithm that discovers Pareto-optimal configurations by sweeping the joint space of compression parameters. The system includes both an offline frontier-discovery phase and a runtime adaptive controller that selects the cheapest strategy meeting a user-specified retention threshold.

### Motivation

The field produces sophisticated systems but evaluates them one-dimensionally. Mem0 (#28) reports 91% latency reduction but doesn't characterize retention per savings tier. ACON (#5) reports token reduction with blanket "95%+ accuracy" without disaggregation. Our own findings show: Hybrid is 100% accuracy but 2x LLM calls; RLM is 88% with 1x; Window is 50-67% with 0x overhead. These are clearly different points on a cost-accuracy curve that no framework formalizes.

The Scaling Paradox (#11) deepens the motivation: the cost-retention relationship is non-monotonic. SELF-ROUTE (#31) demonstrates adaptive routing beats either strategy alone, but only for a binary choice. JetBrains (#3) shows the cheapest strategy isn't always the worst.

### Proposed Method

**Configuration Space (720 configurations):**

| Parameter | Range |
|-----------|-------|
| Compression trigger | Every 4, 6, 8, 12, 16 messages |
| Recent window | 2, 4, 6, 8 messages |
| Extraction method | Window, Summarize, Structured, RLM-1Q, RLM-5Q, Hybrid |
| Delegation depth | 1, 2 |
| Sub-LLM model | nano, mini, standard |

**Three retention metrics:**
1. Overall retention (fraction of probes retained).
2. Type-weighted retention (weights learned from scenario pass/fail correlation).
3. Worst-type retention (minimum across 8 fact types — penalizes 0% categories).

**Three-dimensional Pareto frontier** over (cost, overall_retention, worst_type_retention).

**Offline:** Sweep all 720 configs, eliminate dominated configurations, fit Gaussian Process response surface, identify breakpoints (knees of the frontier).

**Runtime Controller:** User specifies retention floor → controller selects cheapest Pareto-optimal configuration. Routing signals: content density (factual statements / filler ratio) and correction frequency.

### Expected Results

1. Frontier sparse at extremes, dense in the middle.
2. Hybrid likely NOT Pareto-optimal despite 100% accuracy.
3. Optimal compression frequency is scenario-dependent.
4. Worst-type retention reveals hidden costs of seemingly efficient strategies.
5. Smaller sub-LLMs Pareto-superior for structured extraction; standard wins on corrections.

### Risks and Limitations

1. 5,760 runs needed for full sweep.
2. Scenario specificity (8 scenarios may not represent real workloads).
3. Controller requires observable proxy signals.
4. API pricing volatility reshapes the frontier.
5. Retention metric may not capture downstream task impact (MemoryArena gap).

---

## 8. Episodic Compression Memory

### Title

**Episodic Compression Memory: Cross-Session Reinforcement Learning for Adaptive Context Extraction in Long-Horizon LLM Agents**

### Abstract

Current memory compression strategies are stateless across sessions: each compression cycle applies identical extraction questions regardless of whether those questions consistently fail to capture certain fact types. We propose Episodic Compression Memory (ECM), a system that stores post-session failure diagnostics as episodic experiences and uses a lightweight, non-parametric RL mechanism — inspired by MemRL's Q-value approach — to dynamically re-weight extraction priorities before each future compression cycle.

### Motivation

In Context Arena's RLM analysis, `phone/id` probes achieve 0% overall retention with losses beginning at cycle 1 across 7/7 probes, while `date` probes retain 67%. The `correction` type reveals a non-monotonic curve [0.40, 0.70, 0.90, 0.45, 0.05] — facts lost at cycle 1 sometimes reappear at cycles 2-3, then are permanently lost. This is the signature of a system that cannot learn: it makes the same extraction mistakes predictably.

Gap 2 (Cross-Session Learning) is rated CRITICAL. The Episodic Memory position paper (#34) argues LLM agents lack biological episodic memory properties. MemRL (#15) demonstrates non-parametric RL over episodic memory without weight updates. ACE (#24) shows evolving playbooks but suffers context collapse from iterative rewriting.

### Proposed Method

**Three phases: Diagnose, Store, Adapt.**

**Phase 1: Diagnose.** After each compression cycle, a lightweight verification pass asks targeted recall questions per fact type. Produces a Compression Outcome Record (COR): `(scenario_type, cycle_number, fact_type, retained_boolean, extraction_question_used)`.

**Phase 2: Store.** CORs are stored in a persistent, append-only experience bank (JSON/SQLite). Indexed by `(scenario_type, fact_type)`. No conversation content — only metadata about compression performance. Avoids ACE's context collapse: no iterative rewriting, only accumulation.

**Phase 3: Adapt.** Before each compression cycle, query the experience bank. Compute Q-values per fact type:

```
Q(fact_type) = sum(reward_i * gamma^(t - t_i)) / sum(gamma^(t - t_i))
```

Fact types with low Q-values get augmented extraction attention. Three intensity levels: standard (default question), augmented (additional sub-questions), dedicated (separate extraction pass focused solely on that type).

**Scenario Type Detection.** Cosine similarity of first 3 messages' embeddings against scenario-type centroids learned from the experience bank. Cold-start defaults to standard RLM questions.

### Expected Results

- phone/id: 0% → 40-60%.
- spatial: 0% → 30-50%.
- quantity: 12% → 35-50%.
- Overall: 59.7% → 70-80%.
- Convergence after 5-8 sessions per scenario type.
- Non-monotonic curve should flatten to monotonically decreasing.

### Risks and Limitations

1. Cold start problem (no benefit on first session).
2. Scenario type drift in real-world conversations.
3. Overfitting to Context Arena's probe distribution.
4. Cost scaling (worst case: 3x extraction cost if all types at low Q).
5. Experience bank staleness after model version changes.
6. Expensive to evaluate (80 sequential benchmark runs to reach convergence).

---

## 9. Cascade-Aware Compression

### Title

**Cascade-Aware Compression: Modeling Error Propagation Chains to Prevent Catastrophic Memory Corruption in Long-Context Agents**

### Abstract

When a long-context agent loses or corrupts a single fact during memory compression, the damage rarely stays local. We propose Cascade-Aware Compression (CAC), a memory strategy that explicitly models dependency graphs among facts, identifies cascade-critical nodes whose corruption would propagate, and uses protective anchoring for high-criticality facts and quarantine detection for corrupted descendants. CAC is a composable layer that wraps any existing compression strategy.

### Motivation

In Scenario 6 (Cascading Corrections), changing the pre-money valuation from $10M to $12M should cascade through post-money, dilution, ownership, share price, and runway. One missed correction at the root renders five+ derived values wrong.

AgentDebug (#30) classifies cascading failures in agent *actions* but not in agent *memory*. Anti-Bayesian drift (#17) means the sub-LLM is systematically biased toward preserving old values — directional corruption, not random loss. The Knowledge Conflicts Survey (#16) shows context-memory conflicts (corrections) are the hardest type. The depth-2 experiment shows the second pass amplifies the first pass's confident-but-wrong outputs on cascade-heavy scenarios.

### Proposed Method

**Three components:**

**1. Dependency Graph Builder.** Pre-compression LLM call identifies dependency relationships:

```
pre_money_valuation ($12M) -> post_money_valuation ($15M = $12M + $3M)
pre_money_valuation ($12M) -> share_price ($1.20 = $12M / 10M shares)
round_size ($3M) -> total_dilution (20% = $3M / $15M)
net_proceeds ($2.925M) -> runway (16.7 months = $2.925M / $175K)
```

**2. Cascade Criticality Scorer.**

```
criticality = fan_out * (1 + depth_weight * max_depth) * recency_multiplier
```

Facts above threshold get:
- **Anchoring:** Injected as explicit constraints in compression prompt.
- **Verbatim preservation:** Separate uncompressed buffer.
- **Consistency checking:** Post-compression verification against anchor values.

**3. Corruption Detector and Quarantine.**
- Root verification against anchored values.
- Propagation check: mark transitive descendants of corrupted roots as `[UNVERIFIED]`.
- Targeted re-derivation for formulaic dependencies.

**Integration:** CAC wraps any strategy (CAC+RLM, CAC+Hybrid, CAC+CorrectionAware). Adds one LLM call per cycle + lightweight graph operations.

### Expected Results

- Scenario 6 (Cascading Corrections): 5-6/7 → 7/7.
- Scenario 8 (Rapid-fire Corrections): moderate improvement on interdependent moves.
- Scenario 2 (State Change Tracking): moderate improvement on cumulative operations.
- Scenarios 1, 3, 5, 7: minimal change (few dependency chains).
- Aggregate: +5-10pp, concentrated in dependency-heavy scenarios.

### Risks and Limitations

1. Dependency extraction accuracy (missed edges = missed protection).
2. Scalability for systems with hundreds of tracked facts.
3. Over-anchoring consumes compression prompt budget.
4. Non-mathematical dependencies can't be automatically re-derived.
5. One additional LLM call per cycle.
6. Only 2 of 8 Context Arena scenarios have strong cascading structure.

---

## 10. Schema-Guided Hybrid Extraction

### Title

**Schema-Guided Hybrid Extraction: Bridging Rigid Prompts and Unreliable Code Generation for Long-Context Memory**

### Abstract

Hand-crafted prompt templates achieve 79% accuracy but cannot adapt to novel conversation structures, while agentic code generation offers flexibility but fails catastrophically (11.3%) due to non-functional code. We propose Schema-Guided Hybrid Extraction (SGHE), in which the LLM generates declarative extraction *schemas* — structured templates specifying what fact types to look for and how to organize them — rather than executable code. Schemas are interpreted by fixed, reliable prompt-based extraction pipelines and evolve across compression cycles through textual gradient signals.

### Motivation

Context Arena's CTX-3 reveals a sharp reliability cliff. The hand-rolled RLM (79%) works because it delegates to language understanding; RLLM agentic extraction (11.3%) fails because it forces an unnecessary indirection through code generation. Yet the fixed 5-question prompt can't adapt: the same questions apply to seating charts, financial models, and noisy conversations.

Critically, the agentic approach *recognized* the problem: 29% of generated code attempted type-specific extraction. The LLM understood it needed specialized strategies — it simply couldn't implement them reliably as code. This gap between recognition and execution is what SGHE targets.

### Proposed Method

**What is a Schema?**

```yaml
schema_version: 1
context_hint: "financial negotiation with evolving deal terms"

fact_types:
  - name: "identifiers"
    description: "Phone numbers, ID codes, reference numbers"
    extraction_guidance: "Look for alphanumeric codes, phone patterns"
    output_format: "key-value pairs: {identifier_type: exact_value}"
    priority: high

  - name: "corrections"
    description: "Any fact that supersedes a previously stated fact"
    extraction_guidance: "Compare each statement against prior knowledge.
    Watch for implicit corrections."
    output_format: "{entity, attribute, old_value, new_value, type: explicit|implicit}"
    priority: critical

  - name: "spatial_assignments"
    description: "Locations, regions, floor assignments, seating"
    extraction_guidance: "Track entity-to-location mappings and movements"
    output_format: "mapping: {entity -> current_location}"
    priority: medium

validation_rules:
  - "Every identifier preserved character-for-character"
  - "Corrections must include both old and new values"
```

**Schema generation at two timescales:**
- **Cycle 0:** Schema proposal prompt generates conversation-specific schema from first few messages.
- **Cycle N+1:** Schema refinement prompt processes verification gaps to evolve the schema.

**Three-stage extraction pipeline:**
1. **Schema-Guided Extraction:** One targeted prompt per fact type (parallel).
2. **Cross-Reference Validation:** Combined output checked against schema validation rules.
3. **Schema Update:** If validation identifies gaps, refinement prompt fires.

```
Conversation Messages
        |
        v
[Schema Proposer] -----> Schema v0
        |
        v
[Schema-Guided Extraction Pipeline]
  |-- Per-type extraction (parallel)
  |-- Cross-reference validation
  |-- Gap identification
        |
        v
[Schema Refiner] -----> Schema v1, v2, ...
        |
        v
Extracted Knowledge State
```

The entire pipeline operates in natural language. No code is generated or executed.

### Expected Results

- Accuracy: ≥85% overall retention (vs. RLM's 79%, RLLM's 11.3%).
- Reliability: 0% non-functional-code-equivalent failures.
- Adaptability: schema evolves to emphasize scenario-specific fact distributions.
- Cost: 2-4x RLM (one call per fact type), versus 5-10x for RLLM.

### Risks and Limitations

1. Schema quality ceiling (novel fact types appearing late).
2. Token cost scaling linearly with schema complexity.
3. Schema drift (overfit to recent patterns).
4. Evaluation scope limited to 8 scenarios.
5. No ground truth for schema quality (noisy textual gradient).
6. Implicit assumption of fact-type separability.

---

*Generated: 2026-02-26*
*Built for: German's Ambition Project (Context Arena)*
*Based on: 34-paper literature survey + Context Arena benchmark findings (CTX-1 through CTX-4)*
