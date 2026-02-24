# Reading List: Long-Context Agent Memory

10 papers/posts ordered by reading priority. Estimated ~8-10 hours total.

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

## Bonus: TTT (if you want to go deeper)

### Test-Time Training (NVIDIA, 2025)
- **Link:** https://developer.nvidia.com/blog/reimagining-llm-memory-using-context-as-training-data-unlocks-models-that-learn-at-test-time
- **Type:** Blog post
- **Time:** ~30 min
- **Why optional:** Fascinating but requires custom pretraining (Layer 1 / architecture level). Compresses context into model weights. 35x speedup at 2M tokens. Theoretical endgame but not something we can use with closed-source models today.
