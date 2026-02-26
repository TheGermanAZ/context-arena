# Reading List: Long-Context Agent Memory

34 papers/posts ordered by reading priority. Estimated ~30-35 hours total.

- Papers 1-10: Original core list.
- Papers 11-20: Second literature sweep (2026-02-25) — compression faithfulness, RL memory convergence, knowledge conflicts, architecture evolution.
- Papers 21-34: Comprehensive domain sweep (2026-02-26) — positional bias, context-as-tool, belief updating, production systems, agent failures, graph memory, theory.

---

## Phase 1: The Big Picture (start here)

### 1. Anatomy of Agentic Memory (Feb 2026)
- **Link:** https://arxiv.org/abs/2602.19320
- **Type:** Meta-analysis / survey
- **Time:** ~45 min
- **Why read first:** Gives you the bird's-eye view of the entire field. Reveals that the main bottleneck is evaluation validity, not architectural novelty. Introduces the "Context Saturation Gap" concept — if a benchmark's context fits in the window, you're not actually testing memory.
- **Key quote:** "Main bottlenecks lie less in architectural novelty and more in evaluation validity and system scalability."

### 2. Memory in the Age of AI Agents (Tsinghua Survey)
- **Link:** https://github.com/TsinghuaC3I/Awesome-Memory-for-Agents
- **Type:** Paper list + taxonomy
- **Time:** ~30 min (skim the taxonomy, bookmark papers)
- **Why:** Gives you the vocabulary. Short-term vs long-term. Experience (validated) vs memory (unvalidated). Three application scenarios: personalization, learning from experience, long-horizon tasks.

### 3. JetBrains — Efficient Context Management for Coding Agents
- **Link:** https://blog.jetbrains.com/research/2025/12/efficient-context-management/
- **Type:** Blog post (easy read)
- **Time:** ~20 min
- **Why:** The pragmatic baseline. Simple observation masking beats LLM summarization at half the cost. If you can't beat this with a novel approach, your approach isn't worth publishing.

---

## Phase 2: The Four Core Methods

### 4. Active Context Compression / Focus Loop (Jan 2026)
- **Link:** https://arxiv.org/abs/2601.07190
- **Type:** Short paper
- **Time:** ~30 min
- **Why read this one first:** Shortest and simplest. The agent self-prunes mid-task using start/explore/consolidate/withdraw cycles. "Sawtooth" token pattern. Shows the concept works (22.7% savings, identical accuracy) but is fragile. N=5 sample size means opportunity to extend.

### 5. ACON — Context Compression for Long-Horizon Agents (Oct 2025)
- **Link:** https://arxiv.org/abs/2510.00615
- **Type:** Full paper (KAIST + Microsoft)
- **Time:** ~60 min
- **Why:** The systematic approach. Discovers compression guidelines through failure analysis, then distills into small models. 26-54% token reduction. Key insight: compression needs to be learned per-task, not one-size-fits-all. Their "textual gradient descent" for optimizing compression guidelines is novel.

### 6. AgeMem — Agentic Memory (Jan 2026)
- **Link:** https://arxiv.org/abs/2601.01885
- **Type:** Full paper (Alibaba)
- **Time:** ~60 min
- **Why:** The most relevant to our correction-aware strategy. Exposes memory operations (add, update, delete, retrieve, summarize, filter) as tools the agent learns to use via RL. 3-stage progressive training. +23-49% over baselines. This is the closest prior work to what we're building.

### 7. Chain of Agents (NeurIPS 2024)
- **Link:** https://research.google/blog/chain-of-agents-large-language-models-collaborating-on-long-context-tasks/
- **Type:** Blog post (Google Research)
- **Time:** ~20 min
- **Why:** The "distribute the problem" approach. Multiple agents each process a chunk, communicate via natural language. Outperforms RAG on all 8 datasets. ~100% improvement on BookSum for 400K+ inputs. Different philosophy from compression — worth understanding even if we don't use it directly.

---

## Phase 3: Benchmarks

### 8. MemoryArena (Feb 2026)
- **Link:** https://arxiv.org/abs/2602.16313
- **Type:** Benchmark paper
- **Time:** ~45 min
- **Why:** The most important benchmark for our work. Tests whether memory actually guides agent decisions (not just recall). Key finding: models that score near-perfectly on existing memory benchmarks "perform poorly in our agentic setting." This gap between recall and action is our research opportunity.

### 9. MemoryAgentBench (ICLR 2026)
- **Link:** https://arxiv.org/abs/2507.05257
- **Type:** Benchmark paper
- **Time:** ~30 min (skim)
- **Why:** Defines four core competencies: accurate retrieval, test-time learning, selective forgetting, long-range understanding. No current method masters all four. The "selective forgetting" competency directly relates to our correction-awareness work.

---

## Phase 4: The Frontier

### 10. Recursive Language Models (Oct 2025)
- **Link:** https://www.primeintellect.ai/blog/rlm
- **Type:** Blog post (Prime Intellect)
- **Time:** ~30 min
- **Why read last:** The most architecturally radical approach. The model manages its own context by delegating to sub-LLMs through a Python REPL. Still scaffolding-only (no RL training yet). Our benchmark showed RLM-style delegation handles corrections better than any other strategy — this validates their direction.

---

## Phase 5: The Compression Faithfulness Problem (NEW)

These papers explain *why* your RLM sub-LLM drops phone numbers, IDs, and spatial facts.

### 11. When Less is More: The LLM Scaling Paradox in Context Compression (Feb 2026)
- **Link:** https://arxiv.org/abs/2602.09789
- **Type:** Full paper
- **Time:** ~45 min
- **Why critical for us:** Identifies the "Size-Fidelity Paradox" — bigger compressor models produce *less faithful* output due to two mechanisms: (1) **knowledge overwriting** where the model replaces source facts with its own priors (e.g., "white strawberry" → "red strawberry"), and (2) **semantic drift** where the model paraphrases instead of preserving verbatim (e.g., "Alice hit Bob" → "Bob hit Alice"). This directly explains our CTX-1 finding that phone numbers and IDs get 0% retention — the sub-LLM is literally overwriting specific identifiers with its generic expectations.
- **Effect on our work:** Suggests that for type-specific retention, *smaller* or more constrained compressors may outperform larger ones. Our depth-2 self-correction finding may work *because* the second pass constrains the first pass's drift.

### 12. Understanding and Improving Information Preservation in Prompt Compression (Mar 2025)
- **Link:** https://arxiv.org/abs/2503.19114
- **Type:** Full paper
- **Time:** ~45 min
- **Why:** Proposes exactly the evaluation framework we built independently — measuring compression on three axes: downstream performance, grounding to original text, and information preservation. Their key result: controlling compression *granularity* achieves 2.7x more entities preserved and +23% downstream performance. Our probe framework (62 probes, 8 fact types) is a more granular version of their "information preservation" axis.
- **Effect on our work:** Validates our probe methodology as aligned with emerging best practices in compression evaluation. Their finding that entity preservation is the key bottleneck matches our data. Could cite as methodological precedent.

---

## Phase 6: The RL-Trained Memory Convergence (NEW)

Multiple groups are converging on the same thesis: agents should learn memory management via RL. These three papers (plus AgeMem above) form a cluster.

### 13. Memory-R1 — RL-Trained Memory with Structured Operations (Aug 2025)
- **Link:** https://arxiv.org/abs/2508.19828
- **Type:** Full paper
- **Time:** ~60 min
- **Why:** Two specialized agents — a Memory Manager (ADD/UPDATE/DELETE/NOOP) and an Answer Agent — both fine-tuned with PPO and GRPO. Key difference from AgeMem: trains with only 152 QA pairs and generalizes across question types and model sizes (3B to 14B). Tested on LoCoMo, MSC, and LongMemEval.
- **Effect on our work:** Memory-R1's explicit UPDATE and DELETE operations are the RL-trained version of what our correction-aware strategy does with hand-crafted rules. If we ever move from scaffolding to training, Memory-R1's minimal data requirement (152 examples) is encouraging — our 8 scenarios with 62 probes could serve as training signal. Their cross-backbone generalization results also matter: our CTX-1 vs CTX-2 showed different LLM backends (Haiku vs gpt-4.1-mini) have different retention profiles.

### 14. MemSearcher — Multi-Context GRPO for Memory + Search (Nov 2025)
- **Link:** https://arxiv.org/abs/2511.02805
- **Type:** Full paper
- **Time:** ~45 min
- **Why:** Jointly optimizes reasoning, search, and memory management via "multi-context GRPO" — propagates trajectory-level advantages across conversations. Remarkable result: a 3B model outperforms 7B baselines by learning better memory strategies. This inverts the usual scaling assumption.
- **Effect on our work:** Their multi-context training approach could train a model that adapts compression depth per-scenario — our "adaptive depth" hypothesis (depth 2 for info-dense, depth 1 for noisy) could be the reward signal. The 3B > 7B result rhymes with the Scaling Paradox paper: smaller models with better memory strategies beat bigger models with naive strategies.

### 15. MemRL — Non-Parametric RL on Episodic Memory (Jan 2026)
- **Link:** https://arxiv.org/abs/2601.03192
- **Type:** Full paper
- **Time:** ~45 min
- **Why:** Decouples stable reasoning from plastic memory. Uses a Two-Phase Retrieval mechanism: first filter by semantic relevance, then select by learned Q-values from environmental feedback. No weight updates needed — the agent improves by learning which past experiences are useful.
- **Effect on our work:** MemRL's "stability-plasticity" framing maps to our correction challenge: stable facts (phone numbers, names) need stability; corrections need plasticity. Their two-phase retrieval (semantic match → utility score) could be applied to our probe types — high-utility for corrections, high-stability for identifiers.

---

## Phase 7: Knowledge Conflicts and Contradiction Handling (NEW)

These papers directly relate to our correction scenarios (3, 6, 7, 8).

### 16. Knowledge Conflicts for LLMs: A Survey (EMNLP 2024)
- **Link:** https://arxiv.org/abs/2403.08319
- **Type:** Survey (EMNLP main conference)
- **Time:** ~60 min
- **Why:** The definitive taxonomy of how LLMs handle contradictions. Three conflict types: (1) **context-memory** — new input contradicts what the model "knows", (2) **inter-context** — different parts of the prompt contradict each other, (3) **intra-memory** — the model's own knowledge is inconsistent. Our correction scenarios map perfectly: explicit corrections are inter-context conflicts, implicit corrections are context-memory conflicts.
- **Effect on our work:** This taxonomy gives formal language for what our scenarios test. Our finding that implicit corrections (scenario 7) are harder than explicit corrections (scenario 3) maps to their finding that context-memory conflicts are harder to resolve than inter-context conflicts — the model must override its own priors rather than just choosing between two presented options.

### 17. When Two LLMs Debate, Both Think They'll Win (May 2025)
- **Link:** https://arxiv.org/abs/2505.19184
- **Type:** Full paper
- **Time:** ~30 min
- **Why:** Discovers "anti-Bayesian drift" — when LLMs encounter contradicting evidence across turns, their confidence *increases* rather than updating rationally (72.9% → 83.3% over debate rounds). This is the mechanism behind correction failures in memory systems: the LLM becomes *more* confident in outdated information as it processes corrections.
- **Effect on our work:** Directly explains why our cascading corrections (scenario 6) and rapid-fire corrections (scenario 8) are hard: each correction round should reduce confidence in old values, but the model does the opposite. This also explains the depth-2 noise amplification effect — the second pass amplifies the first pass's confident-but-wrong outputs.

---

## Phase 8: Memory Architecture Evolution (NEW)

### 18. A-MEM — Zettelkasten-Style Memory Networks (Feb 2025, NeurIPS 2025)
- **Link:** https://arxiv.org/abs/2502.12110
- **Type:** Full paper (NeurIPS poster)
- **Time:** ~45 min
- **Why:** Instead of flat memory operations, A-MEM creates interconnected knowledge networks following the Zettelkasten method — each memory gets contextual descriptions, keywords, tags, and bidirectional links to related memories. New memories trigger updates to existing ones. Outperforms baselines across 6 foundation models.
- **Effect on our work:** A-MEM's linked memory structure could preserve the *relationships* our RLM drops (0% spatial, 33% relationship retention). If "Floor 3 has conference room" is linked to "conference room capacity 50", the link preserves the relationship even if one node gets compressed. Worth considering as an alternative memory representation for our Hybrid-RLM fusion.

### 19. MemEvolve — Meta-Evolution of Memory Architectures (Dec 2025)
- **Link:** https://arxiv.org/abs/2512.18746
- **Type:** Full paper
- **Time:** ~60 min
- **Why:** The memory architecture *itself* evolves, not just the content. EvolveLab distills 12 representative memory systems into a modular design space (encode, store, retrieve, manage) — a standardized framework for comparing memory architectures. Up to 17% improvement with strong cross-task and cross-LLM generalization.
- **Effect on our work:** EvolveLab's modular design space (encode/store/retrieve/manage) could be the framework for systematically testing which module combinations work best for each of our 8 scenarios. Instead of designing strategies by hand, let evolution find the optimal memory architecture per-task. This is ACON's "learned compression per task" idea taken to the architecture level.

### 20. Hindsight is 20/20 — Structured Agent Memory (Dec 2025)
- **Link:** https://arxiv.org/abs/2512.12818
- **Type:** Full paper
- **Time:** ~45 min
- **Why:** Organizes memory into four logical networks: world facts, agent experiences, entity summaries, and evolving beliefs. Three core operations: retain, recall, reflect. Achieved 83.6% on LongMemEval (vs 39% baseline) and 89.6% on LoCoMo (vs 75.8% for prior open systems). Outperformed full-context GPT-4o.
- **Effect on our work:** Their four-network decomposition maps to our probe types: world facts ≈ entities/quantities, entity summaries ≈ relationships/spatial, evolving beliefs ≈ corrections/decisions. The "reflect" operation (updating memory in a traceable way) is the cleanest formalization of what our correction-aware strategy tries to do. Their result of beating full-context GPT-4o suggests structured memory can outperform even unlimited context.

---

## Phase 9: Positional Bias — Why Early Facts Get Lost

These papers explain the fundamental attention mechanism that causes your Scenario 1 (Early Fact Recall) failures.

### 21. Lost in the Middle: How Language Models Use Long Contexts (Jul 2023)
- **Link:** https://arxiv.org/abs/2307.03172
- **Type:** Foundational paper
- **Time:** ~45 min
- **Why:** The paper that launched the field. Demonstrates that LLM performance degrades significantly when relevant information is in the middle of long contexts — a U-shaped curve with best performance at the beginning (primacy) and end (recency). This is the mechanism behind our Scenario 1 failures: early facts get buried in the middle as conversation grows.
- **Effect on our work:** Explains *why* RLM depth-1 gets 1/10 on Early Fact Recall — early project details are in the worst position for attention. Depth-2's improvement to 8/10 may work by restructuring information into a format where position bias is neutralized.

### 22. Positional Biases Shift as Inputs Approach Context Window Limits (Aug 2025)
- **Link:** https://arxiv.org/abs/2508.07479
- **Type:** Full paper
- **Time:** ~30 min
- **Why:** Extends Lost in the Middle with a critical finding: the primacy bias weakens beyond 50% context fill, while recency bias stays stable. This means the positional bias pattern *changes* depending on how full the context window is — and our compression triggers at different fill levels across scenarios.
- **Effect on our work:** Our compression triggers every 8 messages. At the start (low fill), primacy bias helps retain early facts. After several cycles (high fill), the bias profile shifts. This could explain the non-monotonic retention curve in our CTX-1 data — probes are LOST at cycle 1, RETAINED at cycles 2-3, then LOST again as the context dynamics change.

---

## Phase 10: Context Management as a Decision

These papers treat context management not as a background process but as an active agent decision — exactly what our RLLM strategy does.

### 23. CAT — Context as a Tool for SWE-Agents (Dec 2025)
- **Link:** https://arxiv.org/abs/2512.22087
- **Type:** Full paper
- **Time:** ~45 min
- **Why:** Elevates context maintenance from a passive heuristic to a callable tool integrated into the agent's decision-making. Uses a structured workspace: stable task semantics + condensed long-term memory + high-fidelity short-term interactions. Trains a SWE-Compressor model via trajectory-level supervision. 57.6% on SWE-Bench-Verified.
- **Effect on our work:** CAT's three-tier workspace (stable semantics / condensed LTM / fresh STM) maps directly to what our Hybrid strategy does (fact extraction / narrative summary / recent messages). Their key insight — teaching the agent *when* to compress, not just *how* — is what makes RLLM's agentic approach more powerful than fixed-trigger compression. Their SWE-Compressor training pipeline could be adapted to train a compression model on our 8 scenarios.

### 24. Agentic Context Engineering (ACE) — Evolving Playbooks (Oct 2025)
- **Link:** https://arxiv.org/abs/2510.04618
- **Type:** Full paper
- **Time:** ~45 min
- **Why:** Treats contexts as "evolving playbooks that accumulate, refine, and organize strategies." Identifies two failure modes of iterative context management: **brevity bias** (dropping domain insights for conciseness) and **context collapse** (iterative rewriting erodes details over time). Prevents collapse via structured incremental updates. +10.6% on agent benchmarks.
- **Effect on our work:** "Context collapse" is *exactly* what our compression cycles cause — each cycle erodes detail. ACE's structured incremental updates are the antidote. Their finding that ACE works without labeled supervision (using natural execution feedback) suggests our probe framework could serve as the feedback signal for a self-improving compression strategy.

---

## Phase 11: Belief Updating and Self-Correction

These extend Phase 7 (Knowledge Conflicts) with mechanistic explanations of how LLMs process contradicting information.

### 25. Belief Entrenchment in LLMs (Dec 2025)
- **Link:** https://arxiv.org/abs/2512.02914
- **Type:** Full paper
- **Time:** ~30 min
- **Why:** Introduces the "Martingale Score" — a metric for measuring whether LLMs update beliefs properly. Key finding: **belief entrenchment is pervasive** across GPT-4o, Llama 4, and others. Future belief updates are predictable from prior beliefs, violating the Martingale property (which requires that new evidence can surprise). This means LLMs systematically fail to integrate contradicting evidence.
- **Effect on our work:** Directly complements #17 (Anti-Bayesian Drift). Together they show: (1) LLMs get *more* confident when contradicted (#17), and (2) this is because their prior beliefs entrench and resist updating (#25). For our correction scenarios, this means the sub-LLM isn't "forgetting" corrections — it's actively *resisting* them. Potential mitigation: present corrections in a format that bypasses the entrenchment mechanism.

### 26. CorrectBench: Can LLMs Self-Correct? (Oct 2025)
- **Link:** https://arxiv.org/abs/2510.16062
- **Type:** Benchmark paper
- **Time:** ~30 min
- **Why:** Systematic evaluation of self-correction strategies (intrinsic, external, fine-tuned) across reasoning tasks. Key findings: (1) self-correction helps on complex reasoning, (2) mixing strategies helps more but reduces efficiency, (3) advanced reasoning models (DeepSeek-R1) show diminishing returns from self-correction, (4) simple chain-of-thought is competitively effective.
- **Effect on our work:** Our depth-2 self-correction finding aligns with their result (1): the second pass corrects the first pass's complex extraction errors. Their finding (3) — advanced models benefit less — suggests our depth-2 advantage might shrink with stronger sub-LLMs. Their finding (4) — CoT is competitive — is worth testing: would a simple "think step by step about what facts to extract" prompt match our depth-2 results at half the cost?

---

## Phase 12: Production Memory Systems

These are deployed systems our work should compare against as practical baselines.

### 27. MemGPT / Letta — LLMs as Operating Systems (Oct 2023)
- **Link:** https://arxiv.org/abs/2310.08560
- **Type:** Full paper (foundational)
- **Time:** ~45 min
- **Why:** The paper that framed memory management as an OS problem. Virtual context management draws from hierarchical memory in traditional operating systems — main context (RAM), archival storage (disk), with the LLM managing its own page-in/page-out. Enabled document analysis beyond context windows and conversational agents with long-term memory.
- **Effect on our work:** MemGPT is the conceptual ancestor of our RLLM strategy. Our approach extends theirs by asking: when the LLM manages its own context, *what does it choose to keep and lose?* Their OS metaphor also frames our depth experiment: depth-2 is like a two-level cache hierarchy.

### 28. Mem0 — Production-Ready Agent Memory (Apr 2025)
- **Link:** https://arxiv.org/abs/2504.19413
- **Type:** Full paper (industry)
- **Time:** ~30 min
- **Why:** The production baseline. Dynamically extracts, consolidates, and retrieves salient information. Results: 26% accuracy improvement on LOCOMO, 91% lower p95 latency vs. full-context, 90%+ token cost savings. Graph-enhanced variant adds ~2% more. This is what "good enough for production" looks like.
- **Effect on our work:** Mem0's cost-performance tradeoff is the bar our strategies must clear to be practically relevant. If our Hybrid or RLM strategies can't match Mem0's cost savings while improving accuracy, they're academic exercises. Their 26% improvement on LOCOMO should be compared against our 100% (Hybrid) on our benchmark — different tasks, but the efficiency question remains.

### 29. EverMemOS — Self-Organizing Memory Operating System (Jan 2026)
- **Link:** https://arxiv.org/abs/2601.02163
- **Type:** Full paper
- **Time:** ~45 min
- **Why:** Neuroscience-inspired memory with three stages: (1) Episodic Trace Formation converts dialogue into MemCells with atomic facts and "Foresight" signals, (2) Semantic Consolidation organizes MemCells into thematic MemScenes, (3) Reconstructive Recollection composes the right context for downstream reasoning. SOTA on LoCoMo and LongMemEval.
- **Effect on our work:** Already referenced in our findings.md as prior art. Their MemCell → MemScene pipeline is a more structured version of what our Summarizer strategy does (compress into narrative). The key difference: EverMemOS's "Foresight" signals predict what will be needed later — our strategies are purely retrospective. Adding foresight to our RLM's extraction questions could improve retention on facts that matter for the final question.

---

## Phase 13: Agent Failure Patterns

### 30. AgentDebug — Where LLM Agents Fail and How They Learn (Sep 2025)
- **Link:** https://arxiv.org/abs/2509.25370
- **Type:** Full paper
- **Time:** ~45 min
- **Why:** Introduces AgentErrorTaxonomy — a modular classification of failure modes spanning memory, reflection, planning, action, and system-level operations. Key insight: agent architectures amplify vulnerability to **cascading failures** where a single root-cause error propagates through subsequent decisions. Their AgentDebug framework achieves 24% higher accuracy by isolating root causes and providing corrective feedback.
- **Effect on our work:** Their "cascading failure" concept directly maps to our Scenario 6 (Cascading Corrections) — one missed correction propagates through downstream calculations. Their error taxonomy could be adapted to classify our probe failures: is a lost phone number a memory failure, a planning failure, or a system-level deprioritization?

### 31. SELF-ROUTE — RAG vs. Long-Context Hybrid (EMNLP 2024)
- **Link:** https://arxiv.org/abs/2407.16833
- **Type:** Full paper (EMNLP)
- **Time:** ~30 min
- **Why:** Comprehensive comparison of RAG vs. long-context LLMs. Key finding: LC consistently outperforms RAG when resources are sufficient, but RAG wins on cost. SELF-ROUTE routes each query to RAG or LC based on model self-reflection — best of both worlds.
- **Effect on our work:** The routing concept is relevant to our adaptive depth hypothesis: route information-dense conversations to depth-2 RLM and noisy conversations to depth-1. SELF-ROUTE's self-reflection mechanism could be the heuristic: let the agent decide its own compression depth per cycle based on content assessment.

---

## Phase 14: Graph and Multi-Graph Memory

Alternative memory architectures that preserve structure better than flat text.

### 32. MAGMA — Multi-Graph Agentic Memory Architecture (Jan 2026)
- **Link:** https://arxiv.org/abs/2601.03236
- **Type:** Full paper
- **Time:** ~45 min
- **Why:** Represents each memory item across four orthogonal graphs: semantic, temporal, causal, and entity. Formulates retrieval as policy-guided traversal over these relational views. Outperforms SOTA on LoCoMo and LongMemEval.
- **Effect on our work:** MAGMA's four-graph decomposition addresses our 0% spatial and relationship retention directly. Spatial facts live in the entity graph, causal relationships in the causal graph, temporal ordering in the temporal graph. Instead of flattening everything into text (where the sub-LLM deprioritizes spatial info), graph structure preserves it by design. A graph-augmented RLM strategy could be a strong next experiment.

### 33. Graph-based Agent Memory: Taxonomy and Survey (Feb 2026)
- **Link:** https://arxiv.org/abs/2602.05665
- **Type:** Survey
- **Time:** ~45 min (skim)
- **Why:** Comprehensive survey of graph-based memory approaches: knowledge graphs, temporal graphs, hypergraphs, hierarchical trees, and hybrid graphs. Covers the full memory lifecycle: extraction, storage, retrieval, evolution. Includes a GitHub resource list (Awesome-GraphMemory).
- **Effect on our work:** Provides the design space for graph-augmented strategies. If we pursue the MAGMA direction or graph-enhanced RLM, this survey maps the options. Their lifecycle framework (extraction → storage → retrieval → evolution) is a more principled decomposition than our current strategy-level thinking.

---

## Phase 15: Theoretical Foundations

### 34. Episodic Memory Is the Missing Piece for Long-Term LLM Agents (Feb 2025)
- **Link:** https://arxiv.org/abs/2502.06975
- **Type:** Position paper
- **Time:** ~30 min
- **Why:** Argues that episodic memory — the biological mechanism for single-shot learning of instance-specific contexts — should be explicitly integrated into LLM agent design. Identifies five key properties of episodic memory needed for long-term agents and maps existing work to these properties, showing gaps.
- **Effect on our work:** Gives our work a cognitive science grounding. Our probe framework tests exactly the kind of instance-specific context retention that episodic memory provides. Their five-property framework could structure our evaluation: which of the five properties does each strategy satisfy?

---

## Bonus: TTT (if you want to go deeper)

### Test-Time Training (NVIDIA, 2025)
- **Link:** https://developer.nvidia.com/blog/reimagining-llm-memory-using-context-as-training-data-unlocks-models-that-learn-at-test-time
- **Type:** Blog post
- **Time:** ~30 min
- **Why optional:** Fascinating but requires custom pretraining (Layer 1 / architecture level). Compresses context into model weights. 35x speedup at 2M tokens. Theoretical endgame but not something we can use with closed-source models today.

---

## Cross-Reference: How Papers Map to Our Findings

| Our Finding | Explained/Extended By |
|---|---|
| 0% retention on phone/IDs and spatial facts | #11 Scaling Paradox (knowledge overwriting), #12 Info Preservation (entity bottleneck), #32 MAGMA (graph structure preserves by design) |
| Early Fact Recall failure (Scenario 1) | #21 Lost in the Middle (positional bias), #22 Positional Bias Shift (bias changes with fill level) |
| Depth-2 self-correction effect | #14 MemSearcher (smaller > bigger with strategy), #26 CorrectBench (self-correction on complex tasks), #11 Scaling Paradox (drift compounds) |
| Depth-2 noise amplification | #17 Anti-Bayesian Drift (confidence escalation), #25 Belief Entrenchment (prior beliefs resist updating) |
| Non-monotonic retention curve | #22 Positional Bias Shift (bias profile changes with context fill), #24 ACE (context collapse from iterative rewriting) |
| Implicit corrections harder than explicit | #16 Knowledge Conflicts (context-memory > inter-context), #25 Belief Entrenchment (prior beliefs resist updating) |
| Cascading correction failures | #30 AgentDebug (single error propagates through subsequent decisions), #17 Anti-Bayesian Drift |
| Different retention profiles per scenario | #19 MemEvolve (architecture should adapt per-task), #5 ACON (per-task compression), #31 SELF-ROUTE (adaptive routing) |
| Hybrid-RLM fusion opportunity | #18 A-MEM (linked networks), #20 Hindsight (four-network decomposition), #32 MAGMA (multi-graph) |
| Correction-aware strategy potential | #13 Memory-R1 (UPDATE/DELETE via RL), #15 MemRL (stability-plasticity), #29 EverMemOS (Foresight signals) |
| RLLM agentic extraction (CTX-3) | #23 CAT (context-as-tool), #24 ACE (evolving playbooks), #27 MemGPT (LLM-as-OS) |
| Production viability | #28 Mem0 (90% cost savings baseline), #3 JetBrains (50% cost baseline) |

---

## Papers by Layer (Quick Reference)

```
Layer 5 (Application):  #4 #6 #13 #14 #15 #18 #19 #20 #23 #24 #27 #28 #29 #32 #34
Layer 4 (Prompt):        #5 #11 #12 #26
Layer 3 (Orchestration): #7 #10 #19 #30 #31
Layer 2 (Retrieval):     #14 #31 #33
Layer 1 (Architecture):  TTT, #21 #22
Surveys/Meta:            #1 #2 #8 #9 #16 #33
```

*Last updated: 2026-02-26*
*Built for: German's Week 4 Ambition Project*
