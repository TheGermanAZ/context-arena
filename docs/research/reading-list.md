# Reading List: Long-Context Agent Memory

20 papers/posts ordered by reading priority. Estimated ~16-20 hours total.

Papers 1-10 are the original core list. Papers 11-20 were added 2026-02-25 after a second literature sweep.

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

## Bonus: TTT (if you want to go deeper)

### Test-Time Training (NVIDIA, 2025)
- **Link:** https://developer.nvidia.com/blog/reimagining-llm-memory-using-context-as-training-data-unlocks-models-that-learn-at-test-time
- **Type:** Blog post
- **Time:** ~30 min
- **Why optional:** Fascinating but requires custom pretraining (Layer 1 / architecture level). Compresses context into model weights. 35x speedup at 2M tokens. Theoretical endgame but not something we can use with closed-source models today.

---

## Cross-Reference: How New Papers Map to Our Findings

| Our Finding | Explained/Extended By |
|---|---|
| 0% retention on phone/IDs and spatial facts | #11 Scaling Paradox (knowledge overwriting), #12 Info Preservation (entity bottleneck) |
| Depth-2 self-correction effect | #14 MemSearcher (smaller > bigger with better strategy), #11 Scaling Paradox (drift compounds) |
| Depth-2 noise amplification | #17 Anti-Bayesian Drift (confidence escalation on contradictions) |
| Implicit corrections harder than explicit | #16 Knowledge Conflicts (context-memory > inter-context difficulty) |
| Different retention profiles per scenario | #19 MemEvolve (architecture should adapt per-task), #5 ACON (compression per-task) |
| Hybrid-RLM fusion opportunity | #18 A-MEM (linked networks preserve relationships), #20 Hindsight (four-network decomposition) |
| Correction-aware strategy potential | #13 Memory-R1 (UPDATE/DELETE via RL), #15 MemRL (stability-plasticity tradeoff) |

*Last updated: 2026-02-25*
*Built for: German's Week 4 Ambition Project*
