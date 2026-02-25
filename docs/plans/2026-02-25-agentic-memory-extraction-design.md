# Agentic Memory Extraction: Can LLMs Program Their Own Memory Management?

## Design Document

**Date:** 2026-02-25
**Author:** German (Fractal Tech Cohort)
**Status:** Approved

---

## Thesis

The field of long-context memory management is dominated by hand-designed architectures (MemGPT, EverMemOS, Mem0, Hybrid). Each team picks a memory taxonomy, builds around it, and benchmarks. The fundamental assumption: humans design the strategy, LLMs execute it.

We ask: **what if the LLM designs its own memory strategy?**

Using the `rllm` package (a TypeScript implementation of Recursive Language Models where the LLM writes JavaScript to orchestrate its own sub-LLM queries), we let the LLM program its own extraction strategy and compare it against hand-designed approaches.

## Prior Results

### CTX-1: Information Loss by Type (Complete)
Probed RLM's sub-LLM output across 62 facts in 8 scenarios. Found:
- phone/id, spatial: 0% retention (worst)
- quantity: 12%, entity: 25%
- correction: 45%, date: 67% (best)

### CTX-2: Depth Scaling (Partial)
Tested delegation depth 1 vs 2. Found depth 2 is net positive (+6.4pp), but mixed:
- 4/8 scenarios improved (self-correction effect)
- 3/8 scenarios degraded (noise amplification)

## Redesigned Research Plan

### CTX-3: Agentic Extraction via rllm

**Goal:** Test whether an LLM given freedom to program its own extraction beats our hand-designed 5-question RLM.

**Approach:**
- Build `RLLMStrategy` implementing our `MemoryStrategy` interface
- At each compression trigger, call `rllm.completion()` with the transcript
- The LLM writes JavaScript to process the transcript: chunking, regex, sub-LLM queries, multi-pass — whatever it decides
- Cap `maxIterations: 5` to control cost
- Model: `gpt-5-nano` (same as all other strategies)

**Instrumentation:**
- Probe logging: capture final extraction output for retention-by-type analysis (same format as CTX-1)
- Code logging: capture every JavaScript snippet the LLM writes during processing (data for CTX-4)
- Cost tracking: total sub-LLM calls, tokens, latency

**Output:**
- Retention-by-type report for RLLMStrategy (same format as CTX-1)
- Headline comparison: does agentic extraction beat 59.7% (hand-rolled RLM depth 1)?
- Raw code logs for CTX-4 analysis

**Files:**
- `src/strategies/rllm-strategy.ts` — new, wraps `rllm` package as a MemoryStrategy
- `src/analysis/rllm-extraction.ts` — new, runs RLLMStrategy across all scenarios with probe + code logging

**Acceptance criteria:**
- RLLMStrategy runs on all 8 scenarios and produces retention data
- Code logs captured for every compression cycle
- We can compare retention-by-type against our hand-rolled RLM

---

### CTX-4: Code Analysis — What Did the LLM Discover?

**Goal:** Analyze the JavaScript code the LLM wrote during CTX-3 to determine whether it discovered type-specific extraction strategies.

**Approach:**
- Zero API calls — pure analysis of CTX-3 code logs
- Classify each code snippet by strategy type:
  - Flat extraction (single prompt, no structure)
  - Type-specific extraction (separate handling for numbers, names, IDs)
  - Multi-pass (extract → verify → refine)
  - Chunking-based (split transcript, parallel sub-queries, merge)
  - Regex-augmented (code-level pattern matching before LLM queries)
- Compare across scenarios: does the LLM adapt its strategy per scenario or converge on one approach?
- Map discovered strategies against our CTX-1 retention failures: did the LLM address the 0% categories?

**Output:**
- Categorized catalog of extraction strategies the LLM invented
- Per-scenario strategy comparison table
- Finding: "LLM discovered type-specific extraction" (paradigm shift) OR "LLM fell into generic patterns" (validates hand-design)

**Files:**
- `src/analysis/code-analysis.ts` — new, parses code logs and classifies strategies

**Acceptance criteria:**
- Every code snippet from CTX-3 is classified
- Clear answer to: "did the LLM discover what we had to measure?"

---

### CTX-5: Reverse-Engineer and Benchmark

**Goal:** Turn the LLM's best discovered strategies into fixed prompts, then run a definitive head-to-head benchmark.

**Approach (Part 1 — Reverse Engineering):**
- Take the best-performing extraction patterns from CTX-4
- Encode them as fixed sub-LLM prompts in a new `DiscoveredRLMStrategy`
- If rllm discovered a two-pass approach → encode as two fixed calls
- If rllm discovered type-specific regex → add to the prompt
- The goal: same quality as agentic extraction, at the cost of a single fixed strategy

**Approach (Part 2 — Final Leaderboard):**
- Full benchmark re-run on gpt-5-nano, all strategies head-to-head:
  1. Full Context (ceiling)
  2. Hybrid (current champion at 8/8)
  3. RLM (hand-rolled baseline)
  4. RLLMStrategy (agentic, from CTX-3)
  5. DiscoveredRLMStrategy (reverse-engineered)
  6. Summarize, Structured, Window (baselines)
- All strategies measured on: accuracy, cost, retention-by-type, latency

**Output:**
- `DiscoveredRLMStrategy` implementation
- Final leaderboard table with all metrics
- The publishable comparison: hand-designed vs agentic vs reverse-engineered

**Files:**
- `src/strategies/discovered-rlm.ts` — new, reverse-engineered from CTX-4 findings
- `src/analysis/final-leaderboard.ts` — new, full benchmark runner with all strategies

**Acceptance criteria:**
- DiscoveredRLMStrategy implemented based on CTX-4 findings
- Full leaderboard produced with accuracy, cost, and retention-by-type for every strategy
- Clear answer to: "does the discovered strategy close the gap to Hybrid?"

---

## Narrative Arc

1. **We measured where hand-designed RLM fails** (CTX-1: phone/IDs 0%)
2. **We tried making it deeper** (CTX-2: mixed results, +6.4pp net but inconsistent)
3. **We gave the LLM freedom to program its own extraction** (CTX-3: rllm)
4. **We analyzed the code it wrote** (CTX-4: what did it discover?)
5. **We reverse-engineered its strategies into fixed prompts** (CTX-5: practical output)

This arc produces a publishable contribution regardless of outcome:
- If rllm beats hand-designed → the field should invest in agentic memory, not hand-designed architectures
- If rllm loses → hand-designed structure provides value that unconstrained agents can't replicate
- Either way, the reverse-engineered prompts (CTX-5) are a concrete artifact the field can use

## Dependencies

```
CTX-1 (done) → CTX-3 → CTX-4 → CTX-5
CTX-2 (in progress, partial data)
```

CTX-3 depends on CTX-1 (probes, instrumentation infrastructure).
CTX-4 depends on CTX-3 (code logs).
CTX-5 depends on CTX-4 (discovered strategies to reverse-engineer).

## Constraints

- **API budget:** gpt-5-nano for everything. rllm capped at maxIterations: 5 per compression.
- **Model consistency:** All strategies benchmarked on the same model for fair comparison.
- **Existing infrastructure:** Reuse probe system, retention analysis, and benchmark runner from CTX-1/2.
