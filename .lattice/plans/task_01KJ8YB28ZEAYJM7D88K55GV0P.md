# CTX-2: Test RLM at delegation depth 2+

## Goal
Determine whether RLM information loss scales linearly or exponentially with delegation depth. Produce depth-scaling curves by fact type.

## Approach

### 1. Create DeepRLMStrategy
New file `src/strategies/deep-rlm.ts` — a thin wrapper around RLM's compression logic that chains N sub-LLM calls per compression cycle.

At each compression trigger:
- Pass 1: sub-LLM processes (existing knowledge + transcript) → output₁
- Pass 2: sub-LLM processes output₁ with the same targeted questions → output₂
- Pass N: sub-LLM processes outputₙ₋₁ → outputₙ (becomes delegatedKnowledge)

The strategy takes `depth` as a constructor param. Depth 1 = current RLM behavior.

### 2. Create depth analysis runner
New file `src/analysis/rlm-depth.ts` that:
- Runs DeepRLM at depth 1, 2, 3 across all 8 scenarios with probe logging
- Checks probes against the **final** sub-LLM output at each compression cycle
- Produces: retention by type × depth, with comparison to depth-1 baseline

### 3. Output
- Depth-scaling curve: does retention drop linearly or exponentially?
- Per-type breakdown: which types are most/least sensitive to depth?
- Cost comparison: is depth-N proportionally more expensive?

## Files to create/modify
- `src/strategies/deep-rlm.ts` — new, DeepRLMStrategy with depth param
- `src/analysis/rlm-depth.ts` — new, depth-scaling analysis runner

## Acceptance criteria
- DeepRLM at depth 1 matches current RLM behavior
- Analysis runs at depth 1, 2, 3 and produces typed retention report
- We can answer: "does RLM loss compound linearly or exponentially?"
