# CTX-1: Characterize RLM information loss by type

## Goal
Measure what types of information RLM's sub-LLM drops at each compression cycle. Produce a retention-by-type report that shows which fact categories decay fastest.

## Approach

### 1. Define probe facts for each scenario
Add a `probes` array to each scenario — specific facts tagged by type that we can check for in the sub-LLM output.

Types: `entity`, `phone/id`, `relationship`, `quantity`, `date`, `decision`, `correction`, `spatial`

Example for Contradiction Resolution:
```ts
{ fact: "Kenji's phone", type: "phone/id", patterns: ["090-8765-4321"] }
{ fact: "Kenji's neighborhood", type: "entity", patterns: ["shinjuku"] }
{ fact: "hotel nightly rate", type: "quantity", patterns: ["500"] }
{ fact: "trip dates", type: "date", patterns: ["june 1", "june 18"] }
{ fact: "hotel correction", type: "correction", patterns: ["aman"] }
```

### 2. Instrument RLM to capture sub-LLM outputs
Add a `delegationLog` array to RLMStrategy that stores the sub-LLM content at each compression cycle. Gated behind an opt-in flag so it doesn't affect normal benchmark runs.

### 3. Build analysis runner
New file `src/analysis/rlm-loss.ts` that:
- Runs RLM across all 8 scenarios with logging enabled
- After each run, checks every probe against every delegation log entry
- Outputs a matrix: scenario × compression cycle × probe → retained (true/false)

### 4. Output report
Aggregate across scenarios to produce:
- Retention rate by fact type (e.g. "phone/id: 40% retained after 2 cycles, quantities: 85%")
- Retention curve by cycle number (does loss accelerate?)
- Per-scenario breakdown for the worst performers

## Files to create/modify
- `src/tasks/scenarios.ts` — add `probes` field to Scenario interface and probe definitions
- `src/strategies/rlm.ts` — add `delegationLog` capture
- `src/analysis/rlm-loss.ts` — new file, the analysis runner + report generator

## Acceptance criteria
- Probes defined for all 8 scenarios (at least 5 probes each)
- Analysis runs and produces a typed retention report
- We can answer: "what fact type does RLM lose first?"
