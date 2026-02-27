# CTX-7: Query-Time Distillation + Quantity-Pinning Buffer Experiments

## Goal

Test two new memory strategies that address RLM's core weakness — lossy blind compression — from opposite angles:

1. **Query-Time Distillation (QTD):** Eliminate blind compression entirely by deferring all compression to query time, when the question is known.
2. **Quantity-Pinning Buffer (QPB):** Keep RLM's architecture but add a regex-based side-channel that protects the single highest-loss fact type (quantities, 0-33% retention).

## Baselines

- **Full Context** — ceiling (no compression)
- **RLM(8)** — incumbent delegation strategy

## Strategy 1: Query-Time Distillation

### Architecture

```
addMessage() → push to raw messages (no compression)
getContext() →
  if total tokens < budget:
    return all messages (Full Context mode)
  else:
    sub-LLM call: "Given this question: {latest user msg}, extract everything relevant from: {full transcript}"
    return sub-LLM output as system + recent window
```

### Key Parameters

- `tokenBudget`: 8000 (simulated context limit)
- `recentWindow`: 4 messages kept verbatim
- Token estimation: ~4 chars per token

### Sub-LLM Prompt

The prompt includes the user's question and asks for question-guided extraction:

```
The user is about to ask: "{question}"

Extract EVERY fact from this conversation that could be relevant to answering that question. Include:
- Direct answers and supporting details
- All specific numbers, IDs, codes, measurements
- Any corrections or updates to previously stated facts (both old and new values)
- Entity attributes, relationships, and current state
- Context that helps interpret the answer

Be exhaustive. Include anything that MIGHT matter — the cost of including extra facts is low, the cost of missing one is total.
```

### What We're Testing

Does knowing the question eliminate the lossy guessing that makes RLM drop facts? If QTD scores close to Full Context, the problem was always blind compression, not compression itself.

### Expected Tradeoff

- **Pro:** Should never drop a question-relevant fact
- **Con:** All compression latency is on the critical path (slower at query time)
- **Con:** Only compresses once — no iterative refinement across cycles

## Strategy 2: Quantity-Pinning Buffer

### Architecture

```
Extends RLM(8) — same compression cycle, same sub-LLM call, same prompt

After each sub-LLM delegation:
  1. Regex-scan sub-LLM output for quantities/IDs
  2. Store in pinned Map<string, string> (key = context label, value = full line)
  3. Pinned buffer is additive — new entries merge, existing entries persist

On next sub-LLM call:
  Append: "PINNED QUANTITIES (protected — do not lose): {buffer}"

On getContext():
  System prompt = RLM delegated knowledge + pinned buffer section
```

### Regex Patterns

- Dollar amounts: `\$[\d,]+(?:\.\d{2})?`
- Counts with units: `\d+\s+(?:units?|people|attendees|developers|meals?)`
- Phone numbers: `\d{3}[-.]?\d{3,4}[-.]?\d{4}`
- IDs/codes: `[A-Z]{2,}-\d{3,}`
- Percentages: `\d+(?:\.\d+)?%`
- Dates: `(?:January|February|...|December)\s+\d{1,2}(?:,?\s+\d{4})?`

### Key Difference from PersistentRLM

PersistentRLM parsed ALL output into typed stores and fed structured output back → degraded re-ingestion quality (CTX-5). QPB keeps RLM's natural-language blob untouched and only adds a side-channel for quantities. The sub-LLM still reads its own natural-language output — the pinned buffer is an addendum, not a replacement.

### What We're Testing

Can a minimal, zero-cost side-channel fix the single biggest retention gap (quantities) without degrading other categories?

## Experiment Protocol

- **Model:** gpt-5-nano via OpenCode Zen
- **Scenarios:** All 8 (same as existing benchmarks)
- **Parameters:** compressEvery=8, recentWindow=4 (matching RLM baseline)
- **QTD tokenBudget:** 8000
- **Measurement:** 62 probes across 8 fact types, pass/fail per scenario
- **Baselines:** Full Context + RLM(8) run alongside
- **Output:** `results/qtd-qpb-experiment-{timestamp}.json`
- **Analysis:** Probe-level retention comparison, per-type breakdown

## Success Criteria

- **QTD succeeds if:** it matches or beats RLM(8) on overall probe retention AND scores higher on quantity/phone-ID probes specifically
- **QPB succeeds if:** quantity retention improves >10pp over RLM(8) without degrading other probe types by more than 5pp
- Either strategy matching Full Context (100%) on any previously-failed scenario is a notable result

## Files to Create

- `src/strategies/qtd.ts` — Query-Time Distillation strategy
- `src/strategies/qtd.test.ts` — Unit tests
- `src/strategies/qpb.ts` — Quantity-Pinning Buffer strategy
- `src/strategies/qpb.test.ts` — Unit tests
- `src/analysis/qtd-qpb-experiment.ts` — Benchmark runner (4 strategies × 8 scenarios)
