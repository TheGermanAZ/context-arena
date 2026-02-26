# Proposal Feasibility Probes — Design

**Date:** 2026-02-26
**Scope:** Top 5 proposals from `docs/research/proposals.md`
**Approach:** Two-phase (zero-cost validation → targeted benchmark)
**Budget:** ~$2.50–4.00 at nano pricing (~34 LLM runs)

---

## Proposals Under Test

| # | Proposal | Core Hypothesis |
|---|----------|----------------|
| 1 | Depth-Adaptive RLM | Regex Content Assessor can predict when depth-2 helps vs. hurts |
| 2 | Correction Format Engineering | Correction *format* affects entrenchment bypass rate |
| 3 | Structural Shadow Graphs | Parallel graph rescues 0%-retention fact types |
| 5 | Stability-Plasticity | Dual-channel (Stable/Plastic) routing improves both identifier and correction retention |
| 10 | Schema-Guided Hybrid | LLM-generated schemas adapt better than fixed 5-question prompt |

---

## Architecture

Each probe is a standalone analysis script under `src/analysis/`:

```
src/analysis/
  probe-da-rlm.ts          (#1 Depth-Adaptive RLM)
  probe-correction-fmt.ts   (#2 Correction Format Engineering)
  probe-shadow-graphs.ts    (#3 Structural Shadow Graphs)
  probe-stability.ts        (#5 Stability-Plasticity)
  probe-schema-guided.ts    (#10 Schema-Guided Hybrid)
```

Each file:
1. Imports scenarios + probes from `src/tasks/scenarios.ts`
2. Implements the proposal's novel mechanism
3. Runs targeted scenarios through existing `chat()` infrastructure
4. Outputs JSON to `results/`
5. Prints comparison table against RLM baseline

No changes to existing strategy files. Each probe is additive.

---

## Probe #1: Depth-Adaptive RLM (DA-RLM)

**File:** `src/analysis/probe-da-rlm.ts`

### Phase 1 — Zero-cost validation (no LLM calls)

Build 5 Content Assessor signals as pure functions:
- `informationDensity(text)` — tokens per distinct entity/number (regex)
- `correctionFrequency(text)` — count of contradiction/update markers
- `identifierDensity(text)` — count of phone numbers, IDs, alphanumerics
- `noiseRatio(messages)` — fraction of messages with no extractable facts
- `knowledgeSize(accumulated)` — token count

Run on all 8 scenario transcripts. Cross-reference against known depth-2 results from CTX-2:
- Scenarios where depth-2 helped → assessor should route `d=2`
- Scenarios where depth-2 hurt → assessor should route `d=1`

**Pass criterion:** Assessor correctly classifies ≥6/8 scenarios' optimal depth.

### Phase 2 — Targeted benchmark (4 runs)

Scenarios: #1 (Early Fact Recall — depth-2 best case), #5 (Long Horizon + Noise — depth-2 worst case)
Reps: 2 each

Implement DA-RLM: extend `DeepRLMStrategy` with Content Assessor routing. Before each delegation cycle, compute assessor signals on queued segment, select depth per routing rules.

**Comparison:** Probe retention vs. blanket depth-1 (59.7%) and blanket depth-2 (66.1%) baselines.

**Kill criteria:** Content Assessor can't distinguish >6/8 scenarios.

---

## Probe #2: Correction Format Engineering

**File:** `src/analysis/probe-correction-fmt.ts`

### Phase 1 — None (pure prompt engineering)

### Phase 2 — Targeted benchmark (14 runs)

7 correction formats × 2 reps, all on Scenario 6 (Cascading Corrections).

Take existing RLM strategy. For each format, modify only the correction-related extraction prompt. The 7 formats:

1. **Explicit Negation (baseline):** `[CORRECTED] budget: $12M (was: $10M). The previous value is WRONG.`
2. **Contrastive Pair:** Table with OUTDATED (DISCARD) / CURRENT (USE) columns.
3. **Temporal Supersession:** Timeline with version numbers. Rule: use highest version.
4. **Authoritative Override:** `SYSTEM OVERRIDE (priority: maximum): value is $12M.`
5. **Self-Generated Re-Derivation:** Chain-of-thought the model completes. `Given X shares at $Y, the valuation is: ___`
6. **Structured Diff:** Code-diff format (`- old` / `+ new`).
7. **Socratic Elicitation:** Clarifying question before probe: "Which is the most recent value?"

**Measurement per run:**
- Surface Acknowledgment Rate (SAR): Does corrected value appear?
- Operational Integration Rate (OIR): Does downstream calculation use it?
- Prior Contamination Rate (PCR): Does old value appear?

**Kill criteria:** Best format improves correction retention by <5pp over baseline.

---

## Probe #3: Structural Shadow Graphs (SSG)

**File:** `src/analysis/probe-shadow-graphs.ts`

### Phase 1 — Graph extraction test (2 LLM calls)

Design graph extraction prompt. Run single LLM call on transcripts from:
- Scenario 1 (identifiers, entities, spatial facts)
- Scenario 8 (relationships, spatial assignments)

**Validation:** Does the graph output contain all probe facts from 0%-retention categories (phone/id, spatial, decisions)?

**Pass criterion:** Graph extraction captures >50% of zero-retention probes.

### Phase 2 — Targeted benchmark (4 runs)

Build `RLM+SSG` variant:
- Standard RLM delegation cycle
- One additional sub-LLM call extracts graph triples (5 edge types: LOCATED_AT, RELATED_TO, IDENTIFIED_BY, DECIDED, SUPERSEDES)
- Graph is never compressed — accumulates monotonically
- Deterministic serialization injected into system prompt alongside delegated knowledge

Scenarios: #1 + #8, 2 reps each.

**Focus metrics:** Probe retention on `phone/id`, `spatial`, `decision`, `relationship` types only.

**Kill criteria:** Graph extraction fails to capture >50% of zero-retention probes in Phase 1.

---

## Probe #5: Stability-Plasticity Decomposed Memory

**File:** `src/analysis/probe-stability.ts`

### Phase 1 — Zero-cost validation (no LLM calls)

Build Type Classifier (regex pass only):
- Phone patterns: `\d{3}[-.]?\d{3,4}[-.]?\d{4}`
- ID patterns: `[A-Z]{2,4}-\d{3,5}`, confirmation codes
- Spatial markers: floor/room/location assignments

Run on all scenario transcripts. For each of our 62 probes (whose types we know), measure:
- Precision: Of facts classified as Stable, what % are truly immutable identifiers?
- Recall: Of known stable probes (phone/id, spatial), what % does regex catch?

**Pass criterion:** Recall >80% on identifier/spatial probes.

### Phase 2 — Targeted benchmark (4 runs)

Build strategy variant:
- Regex-detected identifiers/spatial → append-only buffer (never compressed)
- Everything else → standard RLM delegation
- Recombination: `STABLE FACTS (verbatim):\n[buffer]\n\nDELEGATED KNOWLEDGE:\n[RLM output]`

Scenarios: #1 (identifier-heavy) + #6 (correction-heavy), 2 reps each.

**Key insight:** PersistentRLM's typed stores already implement half of this. The `identifiers` store with `Map<string, string>` is conceptually the Stable channel. The probe tests whether *explicit architectural protection* (never compressing identifiers) outperforms *incremental merge* (PersistentRLM's approach).

**Kill criteria:** Stable-channel facts don't achieve >60% retention (vs. 0% baseline).

---

## Probe #10: Schema-Guided Hybrid Extraction (SGHE)

**File:** `src/analysis/probe-schema-guided.ts`

### Phase 1 — Schema generation test (2 LLM calls)

Single LLM call per scenario to generate a YAML-like extraction schema from first 3-5 messages:

```
prompt: "Given these conversation messages, generate a fact extraction schema.
List the fact_types you'd expect to appear (with names, descriptions, extraction
guidance, output format, and priority). Also list validation_rules."
```

Scenarios: #1 (broad fact types) + #6 (correction-heavy).

**Validation:** Does schema's `fact_types` list cover all probe types present?

### Phase 2 — Targeted benchmark (4 runs)

Build strategy:
1. Generate schema from first few messages (cycle 0)
2. Per-fact-type extraction prompts (one per schema fact_type, run in parallel conceptually but sequential in practice)
3. Cross-reference validation against schema rules
4. Schema refinement at cycle N+1 if gaps detected

Scenarios: #1 + #5 (Long Horizon + Noise), 2 reps each.

**Comparison:** SGHE's probe retention vs. RLM's 59.7% on same scenarios.

**Kill criteria:** SGHE doesn't beat RLM by >10pp on either scenario.

---

## Run Budget

| Proposal | Phase 1 (LLM calls) | Phase 2 (full runs) | Total |
|----------|---------------------|---------------------|-------|
| #1 DA-RLM | 0 | 4 | 4 |
| #2 Correction Format | 0 | 14 | 14 |
| #3 Shadow Graphs | 2 | 4 | 6 |
| #5 Stability-Plasticity | 0 | 4 | 4 |
| #10 Schema-Guided | 2 | 4 | 6 |
| **Total** | **4** | **30** | **34** |

Estimated: **~$2.50–4.00** at nano pricing (~$0.08–0.12 per full scenario run).

---

## Execution Order

1. **#2 Correction Format** — Pure prompt engineering, cheapest insight, immediately usable if one format wins.
2. **#1 DA-RLM** — Phase 1 is free. Highest potential impact if routing works.
3. **#5 Stability-Plasticity** — Phase 1 is free. Builds on existing PersistentRLM typed stores.
4. **#3 Shadow Graphs** — Graph extraction is riskiest. Test early to avoid building on shaky foundation.
5. **#10 Schema-Guided** — Most complex. Saved for last as highest risk of Phase 1 failure.

---

## Success Criteria (Overall)

The feasibility probe suite succeeds if:
- At least 2/5 proposals pass their kill criteria and show measurable improvement over baselines
- We have concrete data to prioritize which proposals to fully implement
- Phase 1 catches at least 1 dead-on-arrival idea before spending LLM budget

## Output Format

Each probe script produces:
```json
{
  "proposal": "DA-RLM",
  "phase1": { "passed": true, "details": {...} },
  "phase2": {
    "runs": [...],
    "retentionByType": {...},
    "comparisonToBaseline": {...}
  },
  "killCriteriaMet": false,
  "recommendation": "proceed | refine | abandon"
}
```

Results saved to `results/probe-<proposal>-<timestamp>.json`.
