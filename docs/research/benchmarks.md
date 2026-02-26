# Benchmark Catalog: Long-Context Agent Memory

> The evaluation landscape — what exists, who leads, and where to run them.
> Compiled 2026-02-26.

---

## How This Document Fits

| Document | Purpose |
|----------|---------|
| [tracer-bullet.md](./tracer-bullet.md) | The problem, the landscape, the gaps, the terminology |
| [reading-list.md](./reading-list.md) | 34 papers — what to read, in what order, and how each connects to our work |
| [findings.md](./findings.md) | Our benchmark results, the depth experiment, and what we learned |
| **This file** (benchmarks.md) | Every relevant benchmark — repos, leaderboards, datasets, how to run them |

---

## Table of Contents

1. [Long-Context LLM Benchmarks](#long-context-llm-benchmarks)
2. [Agent Memory Benchmarks](#agent-memory-benchmarks)
3. [Compression & Faithfulness Benchmarks](#compression--faithfulness-benchmarks)
4. [Production Evaluation Frameworks](#production-evaluation-frameworks)
5. [Aggregate Leaderboards](#aggregate-leaderboards)
6. [Actionable Tools (pip-installable)](#actionable-tools)
7. [Recommended Evaluation Stack](#recommended-evaluation-stack)

---

## Long-Context LLM Benchmarks

### Tier 1: Gold Standards

#### RULER v2 (NVIDIA)

| Field | Detail |
|-------|--------|
| **Paper** | [arXiv:2404.06654](https://arxiv.org/abs/2404.06654) (v1), [OpenReview](https://openreview.net/pdf?id=ZU9tRffRSA) (v2) |
| **Repo** | [github.com/NVIDIA/RULER](https://github.com/NVIDIA/RULER) |
| **Venue** | NeurIPS 2024 (v1), NeurIPS 2025 Workshop (v2) |
| **Tasks** | 13 (v1), 12+ across 3 domains x 4 difficulty levels (v2) |
| **Max context** | 128K |
| **Status** | Active |

V2 domains: Multi-key NIAH, Multi-value NIAH, Multi-doc QA. Each has 4 difficulty levels (basic → hard). No model maintains stable performance 8K→128K, including GPT-5.

**Run it:**
```bash
git clone https://github.com/NVIDIA/RULER.git  # use rulerv2-ns branch
# Docker from docker/Dockerfile (base: nvcr.io/nvidia/pytorch:23.10-py3)
# Configure in scripts/config_tasks.sh; execute via run.sh
```

#### LongBench v2 (Tsinghua)

| Field | Detail |
|-------|--------|
| **Paper** | [arXiv:2412.15204](https://arxiv.org/abs/2412.15204) |
| **Repo** | [github.com/THUDM/LongBench](https://github.com/THUDM/LongBench) |
| **Leaderboard** | [longbench2.github.io](https://longbench2.github.io/) |
| **Dataset** | [HF: zai-org/LongBench-v2](https://huggingface.co/datasets/zai-org/LongBench-v2) |
| **Venue** | ACL 2025 |
| **Tasks** | 503 MCQ across 6 categories |
| **Max context** | 2M words |
| **Status** | Active (leaderboard updating) |

Categories: single-doc QA, multi-doc QA, long ICL, dialogue history, code repo, structured data.

**Leaderboard (top 5 with CoT):**

| Model | Overall | Easy | Hard |
|-------|---------|------|------|
| Gemini 2.5 Pro | 63.3% | 75.0% | 56.1% |
| Gemini 2.5 Flash | 62.1% | 72.3% | 55.8% |
| Qwen3-235B-A22B-Thinking | 60.6% | 70.5% | 54.4% |
| DeepSeek-R1 | 58.3% | 66.1% | 53.4% |
| o1-preview | 57.7% | 66.8% | 52.1% |

Human baseline: 53.7% (15-min constraint). Random: 25.0%.

**Run it:**
```python
from datasets import load_dataset
dataset = load_dataset("zai-org/LongBench-v2")
```

#### HELMET (Princeton)

| Field | Detail |
|-------|--------|
| **Paper** | [arXiv:2410.02694](https://arxiv.org/abs/2410.02694) |
| **Repo** | [github.com/princeton-nlp/HELMET](https://github.com/princeton-nlp/HELMET) |
| **Leaderboard** | [princeton-nlp.github.io/HELMET](https://princeton-nlp.github.io/HELMET/) |
| **Venue** | ICLR 2025 |
| **Tasks** | 7 application categories, 59 models |
| **Max context** | 128K |
| **Status** | Active |

Categories: synthetic recall, long-doc QA, summarization, many-shot ICL, RAG, passage re-ranking, generation with citations.

**Critical finding:** NIAH does NOT predict downstream performance. The 7 categories have LOW correlations with each other.

**Run it:**
```bash
git clone https://github.com/princeton-nlp/HELMET.git
# Supports open-source (vLLM) and API models
# Configurable 4K-128K
```

#### BABILong (NeurIPS 2024)

| Field | Detail |
|-------|--------|
| **Paper** | [arXiv:2406.10149](https://arxiv.org/abs/2406.10149) |
| **Repo** | [github.com/booydar/babilong](https://github.com/booydar/babilong) |
| **Dataset** | [HF: RMT-team/babilong](https://huggingface.co/datasets/RMT-team/babilong) |
| **Venue** | NeurIPS 2024 (Spotlight) |
| **Tasks** | 20 reasoning tasks |
| **Max context** | 10M+ (extensible) |
| **Status** | Active |

Facts from bAbI hidden in PG19 filler text. Configs: 0k through 10M (13 levels).

**Key finding:** Models use only 10-20% of context. RAG: ~60% on single-fact QA regardless of length.

**Run it:**
```python
from datasets import load_dataset
babilong = load_dataset("RMT-team/babilong", "128k")["qa1"]
```

Also in lm-evaluation-harness:
```bash
lm_eval --model hf --model_args pretrained=<model> --tasks babilong --batch_size 1
```

#### MRCR v2 (OpenAI/DeepMind)

| Field | Detail |
|-------|--------|
| **Paper** | [arXiv:2409.12640](https://arxiv.org/abs/2409.12640) (Michelangelo) |
| **Dataset** | [HF: openai/mrcr](https://huggingface.co/datasets/openai/mrcr) |
| **Variants** | 2-needle, 4-needle, 8-needle |
| **Max context** | 1M |
| **Status** | Active (bugfix Dec 2025) |

The current frontier challenge. 8-needle at 1M tokens:

| Model | Score |
|-------|-------|
| Gemini 3 Pro | 26.3% (1M) / 77% (128K) |
| Claude Opus 4.6 | 76% (128K) |
| GPT-5.2 | 98% (4-needle 256K) |

### Tier 2: Complementary

#### LongBench Pro (Tsinghua, Jan 2026)

| Field | Detail |
|-------|--------|
| **Paper** | [arXiv:2601.02872](https://arxiv.org/abs/2601.02872) |
| **Dataset** | [HF: caskcsg/LongBench-Pro](https://huggingface.co/datasets/caskcsg/LongBench-Pro) |
| **Tasks** | 1,500 bilingual (EN+ZH), 11 primary + 25 secondary tasks |
| **Max context** | 256K |
| **Models** | 46 evaluated |

Key finding: long-context optimization contributes more than parameter scaling.

#### NoLiMa (Adobe, ICML 2025)

| Field | Detail |
|-------|--------|
| **Paper** | [arXiv:2502.05167](https://arxiv.org/abs/2502.05167) |
| **Repo** | [github.com/adobe-research/NoLiMa](https://github.com/adobe-research/NoLiMa) |
| **Dataset** | [HF: amodaresi/NoLiMa](https://huggingface.co/datasets/amodaresi/NoLiMa) |
| **Max context** | 128K |

Removes literal lexical cues from NIAH. At 32K, 11/13 models drop below 50% of baseline. Even GPT-4o: 99.3% → 69.7%.

#### LongGenBench (ICLR 2025)

| Field | Detail |
|-------|--------|
| **Paper** | [arXiv:2409.02076](https://arxiv.org/abs/2409.02076) |
| **Repo** | [github.com/mozhu621/LongGenBench](https://github.com/mozhu621/LongGenBench) |
| **Tasks** | 4 scenarios x 3 instruction types x 2 lengths (16K/32K output) |

Tests generation, not just comprehension. All models struggle with long-form output.

#### LOFT (DeepMind)

| Field | Detail |
|-------|--------|
| **Paper** | [arXiv:2406.13121](https://arxiv.org/abs/2406.13121) |
| **Repo** | [github.com/google-deepmind/loft](https://github.com/google-deepmind/loft) |
| **Venue** | NAACL 2025 |
| **Tasks** | 6 categories, 35 datasets |
| **Max context** | 1M |
| **Modalities** | Text, visual, audio |

Can long-context replace RAG/SQL? For many tasks, yes.

#### Context Rot (Chroma Research, July 2025)

| Field | Detail |
|-------|--------|
| **Report** | [research.trychroma.com/context-rot](https://research.trychroma.com/context-rot) |
| **Repo** | [github.com/chroma-core/context-rot](https://github.com/chroma-core/context-rot) |
| **Models** | 18 (GPT-4.1, Claude 4, Gemini 2.5, Qwen3, etc.) |

Key finding: context engineering (curating input) matters more than raw window size.

#### Other Notable

| Benchmark | Venue | Tasks | Max | Key Innovation |
|-----------|-------|-------|-----|----------------|
| **InfiniteBench** | ACL 2024 | 12 tasks | 100K+ | [github.com/OpenBMB/InfiniteBench](https://github.com/OpenBMB/InfiniteBench) |
| **LV-Eval** | OpenReview | 11 datasets | 256K | 5 length levels, confusing facts insertion |
| **L-Eval** | ACL 2024 (Outstanding) | 20 tasks | 200K | N-gram metrics can't evaluate LCLMs |
| **AcademicEval** | TMLR 2025 | 4 tasks | Flexible | Live benchmark, no data leakage |
| **NIAH** | Community (2023) | 1 task | Varies | Solved by frontier models — no longer discriminative |

---

## Agent Memory Benchmarks

### Tier 1: Core Benchmarks

#### LongMemEval (ICLR 2025) — De Facto Standard

| Field | Detail |
|-------|--------|
| **Paper** | [arXiv:2410.10813](https://arxiv.org/abs/2410.10813) |
| **Repo** | [github.com/xiaowu0162/LongMemEval](https://github.com/xiaowu0162/LongMemEval) |
| **Dataset** | [HF: xiaowu0162/longmemeval-cleaned](https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned) |
| **Venue** | ICLR 2025 |
| **Tasks** | 500 curated questions |
| **Status** | Active (414 stars) |

**5 memory abilities:** information extraction, multi-session reasoning, temporal reasoning, knowledge updates, abstention.

**Variants:** LongMemEval_S (~40 sessions, ~115K tokens), LongMemEval_M (~500 sessions), LongMemEval_Oracle (evidence-only ceiling).

**Leaderboard (Feb 2026):**

| # | System | Score | Architecture |
|---|--------|-------|--------------|
| 1 | Mastra Observational Memory (gpt-5-mini) | 94.87% | Observational + RAG |
| 2 | Emergence AI (internal) | 86.00% | RAG-based |
| 3 | Mastra (gpt-4o) | 84.23% | Observational + RAG |
| 4 | Oracle GPT-4o (full context) | 82.40% | Theoretical ceiling |
| 5 | Supermemory | 81.95% | Hybrid |
| 6 | Letta Filesystem | 74.00% | File storage |
| 7 | Zep/Graphiti | ~71-89% | Temporal KG |
| 8 | Mem0 | ~66.9% | Vector+graph+KV |
| 9 | Raw GPT-4o (full history) | ~52-70% | Long context |

**Run it:**
```bash
wget https://huggingface.co/datasets/xiaowu0162/longmemeval-cleaned/resolve/main/longmemeval_s_cleaned.json
pip install -r requirements-lite.txt
python3 src/evaluation/evaluate_qa.py gpt-4o predictions.jsonl data/longmemeval_oracle.json
```

#### MemoryAgentBench (ICLR 2026)

| Field | Detail |
|-------|--------|
| **Paper** | [arXiv:2507.05257](https://arxiv.org/abs/2507.05257) |
| **Repo** | [github.com/HUST-AI-HYZ/MemoryAgentBench](https://github.com/HUST-AI-HYZ/MemoryAgentBench) |
| **Venue** | ICLR 2026 |
| **Tasks** | 17 datasets, "inject once, query multiple times" |
| **Status** | Active (230 stars) |

**4 core competencies:** Accurate Retrieval, Test-Time Learning, Long-Range Understanding, Conflict Resolution.

Includes implementations for Cognee, Letta/MemGPT, Mem0, HippoRAG.

Datasets: EventQA (new), FactConsolidation (new), reformulated RULER/InfBench/HELMET/LongMemEval.

**Run it:**
```bash
conda create --name MABench python=3.10.16
pip install -r requirements.txt
bash bash_files/eniac/run_memagent_longcontext.sh
python llm_based_eval/longmem_qa_evaluate.py
```

#### MemoryArena (Feb 2026) — Memory-to-Action Gap

| Field | Detail |
|-------|--------|
| **Paper** | [arXiv:2602.16313](https://arxiv.org/abs/2602.16313) |
| **Website** | [memoryarena.github.io](https://memoryarena.github.io/) |
| **Dataset** | [HF: ZexueHe/memoryarena](https://huggingface.co/datasets/ZexueHe/memoryarena) |
| **Tasks** | 766 across 5 domains |
| **License** | CC-BY-4.0 |

**Domains:** Bundled Web Shopping (150), Group Travel Planning (270), Progressive Web Search (256), Math Formal Reasoning (40), Physics Formal Reasoning (20).

**Critical finding:** Agents scoring 90%+ on recall benchmarks achieve 0-12% success rate on agentic tasks.

| Domain | Best SR | Best PS |
|--------|---------|---------|
| Web Shopping | 0.12 | 0.79 |
| Travel Planning | 0.00 | 0.06 |
| Web Search | 0.60 | 0.70 |
| Formal Reasoning | 0.55 | 0.60 |

**Run it:**
```python
from datasets import load_dataset
ds = load_dataset("ZexueHe/memoryarena", "bundled_shopping")
```

#### BEAM (ICLR 2026) — Extreme Scale

| Field | Detail |
|-------|--------|
| **Paper** | [arXiv:2510.27246](https://arxiv.org/abs/2510.27246) |
| **Repo** | [github.com/mohammadtavakoli78/BEAM](https://github.com/mohammadtavakoli78/BEAM) |
| **Venue** | ICLR 2026 |
| **Tasks** | 100 conversations, 2,000 validated questions |
| **Scale** | Up to 10M tokens |

Companion LIGHT framework (episodic + working memory + scratchpad) improves 3.5-12.69% over baselines.

#### StructMemEval (Feb 2026)

| Field | Detail |
|-------|--------|
| **Paper** | [arXiv:2602.11243](https://arxiv.org/abs/2602.11243) |
| **Repo** | [github.com/yandex-research/StructMemEval](https://github.com/yandex-research/StructMemEval) |
| **From** | Yandex Research |

Tests whether agents organize memory into the right *structure* (ledgers, to-do lists, trees). LLMs don't naturally recognize the right structure without hints.

#### MemBench (ACL 2025)

| Field | Detail |
|-------|--------|
| **Paper** | [arXiv:2506.21605](https://arxiv.org/abs/2506.21605) |
| **Repo** | [github.com/import-myself/Membench](https://github.com/import-myself/Membench) |
| **Venue** | Findings of ACL 2025 |

Factual + reflective memory under participation and observation scenarios. 4 metrics: accuracy, recall, capacity, temporal efficiency.

### Tier 2: Specialized

| Benchmark | Venue | Focus | Key Finding | Link |
|-----------|-------|-------|-------------|------|
| **MEMTRACK** | NeurIPS 2025 | Enterprise multi-platform (Slack/Linear/Git) | GPT-5: only 60% correctness | [arXiv:2510.01353](https://arxiv.org/abs/2510.01353) |
| **Mem2ActBench** | Jan 2026 | Memory → tool-use action grounding | 91.3% unsolvable without LTM | [arXiv:2601.19935](https://arxiv.org/abs/2601.19935) |
| **LoCoMo-Plus** | Feb 2026 | Cognitive memory — implicit constraints | All models fail on latent constraints | [arXiv:2602.10715](https://arxiv.org/abs/2602.10715) |
| **EverMemBench** | Feb 2026 | Multi-party group chat, 1M+ | Oracle: only 26% on multi-hop | [arXiv:2602.01313](https://arxiv.org/abs/2602.01313) |
| **ConvoMem** | Nov 2025 | 75K QA pairs, RAG transition points | Full-context: 70-82%; Mem0: 30-45% | [arXiv:2511.10523](https://arxiv.org/abs/2511.10523) |
| **Evo-Memory** | Nov 2025 | Self-evolving test-time memory | Google DeepMind + UIUC | [arXiv:2511.20857](https://arxiv.org/abs/2511.20857) |
| **MemoryBench** | Oct 2025 | 20K cases, continual learning | Far from satisfying | [arXiv:2510.17281](https://arxiv.org/abs/2510.17281) |
| **RealMem** | Jan 2026 | 2,000+ cross-session project dialogues | Precision > recall | [arXiv:2601.06966](https://arxiv.org/abs/2601.06966) |
| **MemGUI-Bench** | Feb 2026 | Mobile GUI agent memory (128 tasks) | 89.8% challenge memory | [arXiv:2602.06075](https://arxiv.org/abs/2602.06075) |
| **MemoryRewardBench** | Jan 2026 | Meta: can reward models evaluate memory? | Diminishing open/proprietary gap | [arXiv:2601.11969](https://arxiv.org/abs/2601.11969) |
| **LOCOMO** | ACL 2024 | Original LTM benchmark (300 turns, 35 sessions) | Near-saturated by newer systems | [arXiv:2402.17753](https://arxiv.org/abs/2402.17753) |
| **SWE-bench Pro** | Scale AI | Long-horizon SWE (1,865 tasks, 41 repos) | Top: Claude Opus 4.5 at 45.89% | [scale.com/leaderboard](https://scale.com/leaderboard/swe_bench_pro_public) |

---

## Compression & Faithfulness Benchmarks

### Compression Faithfulness

| Benchmark | What It Measures | Key Result | Link |
|-----------|------------------|------------|------|
| **Scaling Paradox** | Knowledge overwriting + semantic drift | ROUGE stays high while QA accuracy degrades | [arXiv:2602.09789](https://arxiv.org/abs/2602.09789) |
| **Factory.ai Probes** | Type-specific loss (recall/artifact/continuation/decision) | Structured: 3.70 vs Anthropic: 3.44 vs OpenAI: 3.35 | [factory.ai/news/evaluating-compression](https://factory.ai/news/evaluating-compression) |
| **CCF** | Auto-encoding reconstruction fidelity | ROUGE-L 0.99 at 8x compression | [arXiv:2509.09199](https://arxiv.org/abs/2509.09199) |
| **Info Preservation** | Entity preservation, BERTScore, hallucination | 2.7x more entities with fine-grained pre-training | [arXiv:2503.19114](https://arxiv.org/abs/2503.19114) |
| **CGA Framework** | Direct generative faithfulness (teacher-forcing) | Proxy metrics correlate poorly with real faithfulness | [OpenReview](https://openreview.net/forum?id=4M5XbJP3wL) |

### Factual Consistency of Summaries

| Tool | What It Does | Size | Access |
|------|-------------|------|--------|
| **FActScore** | Atomic fact precision against knowledge source | Uses LLM | `pip install factscore` |
| **MiniCheck** | GPT-4-level fact checking at 400x lower cost | 770M | [HF: bespokelabs/Bespoke-MiniCheck-7B](https://huggingface.co/bespokelabs/Bespoke-MiniCheck-7B) |
| **AlignScore** | Unified alignment function, trained on 4.7M examples | 355M | [HF: yzha/AlignScore](https://huggingface.co/yzha/AlignScore) |
| **SummaC** | NLI-based inconsistency detection | NLI model | [github.com/tingofurro/summac](https://github.com/tingofurro/summac) |
| **AggreFact** | Aggregated annotations from 9 existing datasets | Leaderboard | [llm-aggrefact.github.io](https://llm-aggrefact.github.io/blog) |
| **FRANK** | Fine-grained factual error typology | Dataset | [github.com/artidoro/frank](https://github.com/artidoro/frank) |
| **SummEval** | 4-dimension eval (coherence, consistency, fluency, relevance) | Dataset | [github.com/Yale-LILY/SummEval](https://github.com/Yale-LILY/SummEval) |
| **FactCC** | Binary factual consistency (Salesforce) | BERT-based | [github.com/salesforce/factCC](https://github.com/salesforce/factCC) |
| **FaithBench** | Hallucination in summaries by modern LLMs | Dataset | [arXiv:2410.13210](https://arxiv.org/abs/2410.13210) |

### Correction/Update Handling

| Benchmark | What It Tests | Link |
|-----------|---------------|------|
| **FactConsolidation** (MemoryAgentBench) | Only benchmark for correction handling in agent memory | Part of [MemoryAgentBench](https://github.com/HUST-AI-HYZ/MemoryAgentBench) |
| **LongMemEval — Knowledge Updates** | Superseding old facts — hardest subtask | Part of [LongMemEval](https://github.com/xiaowu0162/LongMemEval) |
| **MEMTRACK Contradictions** | Cross-platform conflicting information | [arXiv:2510.01353](https://arxiv.org/abs/2510.01353) |
| **CorrectBench** | LLM self-correction strategies | [arXiv:2510.16062](https://arxiv.org/abs/2510.16062) |

### Agent Compression (Applied)

| System | Result | Link |
|--------|--------|------|
| **ACON** | 26-54% token reduction, 95%+ accuracy preserved | [arXiv:2510.00615](https://arxiv.org/abs/2510.00615) |
| **LLMLingua** (Microsoft) | 20x compression, 1.5% performance loss | [github.com/microsoft/LLMLingua](https://github.com/microsoft/LLMLingua) |
| **LoCoBench-Agent** | Best performers: only 37% retention | [arXiv:2511.13998](https://arxiv.org/abs/2511.13998) |
| **Active Context Compression** | 22.7% token reduction; LLMs don't naturally optimize | [arXiv:2601.07190](https://arxiv.org/abs/2601.07190) |

### Standard Metrics Reference

| Metric | Type | Use Case |
|--------|------|----------|
| **ROUGE-1/2/L** | N-gram overlap | Fast, deterministic, well-understood; fails for abstractive |
| **BERTScore** | Semantic similarity via BERT embeddings | Handles paraphrasing; ignores factual accuracy |
| **BLEU** | Precision-oriented n-gram overlap | Machine translation heritage |
| **Exact Match** | Binary match | QA tasks |
| **Compression Rate** | output_tokens / input_tokens | All compression work |
| **Entity Preservation Rate** | Fraction of named entities surviving compression | Info preservation studies |

---

## Production Evaluation Frameworks

| Framework | Architecture | Benchmark | Result |
|-----------|-------------|-----------|--------|
| **Letta (MemGPT)** | File storage baseline | LoCoMo | 74.0% ("Is a filesystem all you need?") |
| **Mem0** | Vector + graph + KV | LoCoMo | 66.9%, 91% latency reduction, 90% token reduction |
| **Zep/Graphiti** | Temporal knowledge graph | DMR / LongMemEval | 94.8% DMR, 18.5% improvement on LongMemEval |
| **Cognee** | Pipeline (ingest→structure→recall) | HotPotQA | Beat Mem0, Graphiti, LightRAG on multi-hop |
| **SuperMemory** | Unified Bun+TS eval platform | NoLiMa + LongMemEval + LoCoMo | [github.com/supermemoryai/memorybench](https://github.com/supermemoryai/memorybench) |

---

## Aggregate Leaderboards

### HELM Long Context (Stanford CRFM, Sep 2025)

5 curated tasks at up to 128K, fully transparent and reproducible.

| # | Model | Context | Mean | SQuAD | HotPotQA | En.MC | En.Sum | MRCR |
|---|-------|---------|------|-------|----------|-------|--------|------|
| 1 | GPT-4.1 | 1M | 0.588 | 0.88 | 0.70 | 0.97 | 0.174 | 0.214 |
| 2 | GPT-4.1 mini | 1M | 0.530 | 0.82 | 0.64 | 0.82 | 0.160 | 0.208 |
| 3 | Gemini 2.0 Flash | 1M | 0.527 | 0.85 | 0.55 | 0.87 | 0.151 | 0.216 |
| 4 | Palmyra X5 | 1M | 0.525 | 0.78 | 0.57 | 0.87 | 0.146 | 0.256 |
| 5 | Llama 4 Maverick | 10M | 0.519 | 0.78 | 0.55 | 0.89 | 0.161 | 0.215 |

URL: [crfm.stanford.edu/helm/long-context](https://crfm.stanford.edu/helm/long-context/latest/)

### Awesome Agents Composite (Feb 2026)

Tracks MRCR v2, RULER, LongBench v2 across providers.

| # | Model | Provider | Context |
|---|-------|----------|---------|
| 1 | Gemini 3 Pro | Google DeepMind | 10M |
| 2 | Claude Opus 4.6 | Anthropic | 1M |
| 3 | GPT-5.2 | OpenAI | 400K |
| 4 | Claude Sonnet 4.6 | Anthropic | 1M |
| 5 | Grok 4 Fast | xAI | 2M |

URL: [awesomeagents.ai/leaderboards/long-context-benchmarks-leaderboard](https://awesomeagents.ai/leaderboards/long-context-benchmarks-leaderboard/)

### Other Leaderboard Sources

| Source | URL | Notes |
|--------|-----|-------|
| **LLM-Stats.com** | [llm-stats.com/benchmarks/category/long_context](https://llm-stats.com/benchmarks/category/long_context) | MRCR, RULER, LongBench v2 individual rankings |
| **Scale AI SEAL** | [scale.com/leaderboard](https://scale.com/leaderboard) | Expert-driven, 450+ evals, 50+ models |
| **LMSYS Chatbot Arena** | [arena.ai/leaderboard/text](https://arena.ai/leaderboard/text) | Community-driven pairwise Elo; no dedicated LC leaderboard |
| **Artificial Analysis** | [artificialanalysis.ai/leaderboards](https://artificialanalysis.ai/leaderboards/models) | Compares context window, speed, price alongside benchmarks |
| **HF Open LLM** | [huggingface.co/spaces/open-llm-leaderboard](https://huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard) | General; not long-context specific |
| **EleutherAI harness** | [github.com/EleutherAI/lm-evaluation-harness](https://github.com/EleutherAI/lm-evaluation-harness) | PR #3256 adds LongBench v2, BABILong, InfiniteBench |

Note: Papers With Code was sunsetted by Meta in July 2025. HuggingFace is building a successor.

---

## Actionable Tools

The most immediately useful for someone building context compression for agents:

1. **FActScore** — `pip install factscore` — measures atomic fact preservation against any knowledge source. Adaptable to custom corpora.

2. **MiniCheck** — `bespokelabs/Bespoke-MiniCheck-7B` on HuggingFace — GPT-4-level fact checking at 400x lower cost. Production-ready, 770M params.

3. **AlignScore** — `yzha/AlignScore` on HuggingFace — 355M params, trained on 4.7M examples, matches GPT-4 on 22 evaluation datasets. Drop-in factual consistency metric.

4. **Factory.ai probe methodology** — directly applicable evaluation design (recall/artifact/continuation/decision probes) for agent context compression. Closest existing approach to our Context Arena probes.

5. **SuperMemory MemoryBench** — Bun+TS, unified eval across NoLiMa/LongMemEval/LoCoMo. Same tech stack as our project.

---

## Recommended Evaluation Stack

For comprehensive long-context agent memory evaluation in 2026:

| Dimension | Benchmark | Why |
|-----------|-----------|-----|
| **Synthetic retrieval** | RULER v2 | Progressive difficulty, well-maintained |
| **Real-world comprehension** | LongBench v2 or LongBench Pro | Active leaderboard, bilingual |
| **Semantic retrieval** | NoLiMa | Beyond literal matching |
| **Holistic downstream** | HELMET | 7 uncorrelated application categories |
| **Extreme scale** | BABILong or BEAM | Up to 10M tokens |
| **Memory recall** | LongMemEval | De facto standard, 500 questions |
| **Memory → action** | MemoryArena | Exposes recall-action gap |
| **Multi-turn competencies** | MemoryAgentBench | 4 core competencies incl. conflict resolution |
| **Compression faithfulness** | FActScore + AlignScore | Pip-installable, proven |
| **Type-specific retention** | Context Arena (ours) | 62 probes, 8 fact types — uniquely granular |

---

## Key Surveys

| Survey | Link | Notes |
|--------|------|-------|
| **Memory in the Age of AI Agents** | [arXiv:2512.13564](https://arxiv.org/abs/2512.13564) | Taxonomy: factual, experiential, working |
| **Anatomy of Agentic Memory** | [arXiv:2602.19320](https://arxiv.org/abs/2602.19320) | Structure-first taxonomy, identifies saturation |
| **Awesome Memory for Agents** (Tsinghua) | [github.com/TsinghuaC3I/Awesome-Memory-for-Agents](https://github.com/TsinghuaC3I/Awesome-Memory-for-Agents) | Maintained paper collection |
| **Graph-based Agent Memory** | [arXiv:2602.05665](https://arxiv.org/abs/2602.05665) | KGs, temporal graphs, hypergraphs |
| **MemAgents Workshop** (ICLR 2026) | [openreview.net/pdf?id=U51WxL382H](https://openreview.net/pdf?id=U51WxL382H) | Dedicated workshop on agent memory |

---

*Last updated: 2026-02-26*
*Built for: German's Ambition Project (Context Arena)*
