# Proposal Feasibility Probes — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build 5 standalone analysis scripts that test the feasibility of the top 5 research proposals from `docs/research/proposals.md`, producing concrete retention data to prioritize full implementation.

**Architecture:** Each probe is a standalone TypeScript file under `src/analysis/` following the pattern of `rlm-loss.ts`. Each imports scenarios/probes from `src/tasks/scenarios.ts`, implements the proposal's mechanism, runs targeted scenarios through `chat()`, and outputs JSON results. No existing files are modified.

**Tech Stack:** Bun, TypeScript, OpenAI (gpt-5-nano via opencode.ai/zen/v1), existing `chat()` from `src/utils/llm.ts`, existing scenarios/probes from `src/tasks/scenarios.ts`.

**Design doc:** `docs/plans/2026-02-26-proposal-feasibility-probes-design.md`

---

## Shared Utilities

Before building probes, we need a small shared module that all 5 probes will import. This avoids duplicating probe-checking and scenario-running logic.

### Task 1: Create probe utilities module

**Files:**
- Create: `src/analysis/probe-utils.ts`
- Reference: `src/analysis/rlm-loss.ts` (pattern to follow)
- Reference: `src/tasks/scenarios.ts` (Probe, Scenario, ALL_SCENARIOS types)
- Reference: `src/utils/llm.ts` (chat, LLMMessage types)

**Step 1: Write the test for probe utilities**

```typescript
// src/analysis/probe-utils.test.ts
import { test, expect } from "bun:test";
import { checkProbeRetained, buildTranscript, getScenarioByName } from "./probe-utils";
import type { Probe } from "../tasks/scenarios";

test("checkProbeRetained matches all patterns", () => {
  const probe: Probe = {
    fact: "test phone",
    type: "phone/id",
    patterns: ["555-0147", "mechanic"],
    introducedAtStep: 1,
  };
  expect(checkProbeRetained(probe, "Call the mechanic at 555-0147")).toBe(true);
  expect(checkProbeRetained(probe, "Call the mechanic")).toBe(false);
  expect(checkProbeRetained(probe, "555-0147 is a number")).toBe(false);
});

test("buildTranscript joins messages", () => {
  const messages = [
    { role: "user" as const, content: "Hello" },
    { role: "assistant" as const, content: "Hi there" },
  ];
  expect(buildTranscript(messages)).toBe("user: Hello\nassistant: Hi there");
});

test("getScenarioByName returns correct scenario", () => {
  const s = getScenarioByName("Early Fact Recall");
  expect(s).toBeDefined();
  expect(s!.steps.length).toBe(20);
});

test("getScenarioByName returns undefined for unknown", () => {
  expect(getScenarioByName("Nonexistent")).toBeUndefined();
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/analysis/probe-utils.test.ts`
Expected: FAIL — module not found

**Step 3: Write the probe utilities module**

```typescript
// src/analysis/probe-utils.ts
import type { LLMMessage } from "../utils/llm";
import { chat } from "../utils/llm";
import { ALL_SCENARIOS, type Probe, type ProbeType, type Scenario } from "../tasks/scenarios";
import type { DelegationLogEntry } from "../strategies/rlm";

// ── Probe checking ─────────────────────────────────────────────────

export function checkProbeRetained(probe: Probe, content: string): boolean {
  const lower = content.toLowerCase();
  return probe.patterns.every((p) => lower.includes(p.toLowerCase()));
}

// ── Transcript helpers ─────────────────────────────────────────────

export function buildTranscript(messages: LLMMessage[]): string {
  return messages.map((m) => `${m.role}: ${m.content}`).join("\n");
}

// ── Scenario lookup ────────────────────────────────────────────────

export function getScenarioByName(name: string): Scenario | undefined {
  return ALL_SCENARIOS.find((s) => s.name === name);
}

// ── Probe result types ─────────────────────────────────────────────

export interface ProbeResult {
  fact: string;
  type: ProbeType;
  retained: boolean;
}

export interface ProbeRunResult {
  scenarioName: string;
  strategyName: string;
  rep: number;
  probeResults: ProbeResult[];
  retainedCount: number;
  totalProbes: number;
  overheadTokens: number;
}

export interface FeasibilityResult {
  proposal: string;
  phase1: { passed: boolean; details: Record<string, unknown> };
  phase2: { runs: ProbeRunResult[]; retentionByType: Record<string, number>; comparisonToBaseline: Record<string, number> };
  killCriteriaMet: boolean;
  recommendation: "proceed" | "refine" | "abandon";
}

// ── Run scenario with strategy ─────────────────────────────────────

export interface ProbeStrategy {
  name: string;
  reset(): void;
  addMessage(message: LLMMessage): void;
  getContext(): Promise<{
    messages: LLMMessage[];
    system?: string;
    memoryOverheadTokens: number;
  }>;
}

/**
 * Run a single scenario through a strategy, return probe results.
 * Follows the same pattern as rlm-loss.ts runScenarioWithLogging.
 */
export async function runScenarioWithProbes(
  strategy: ProbeStrategy,
  scenario: Scenario,
): Promise<ProbeRunResult> {
  strategy.reset();
  let totalOverhead = 0;

  for (let i = 0; i < scenario.steps.length; i++) {
    strategy.addMessage({ role: "user", content: scenario.steps[i]! });
    const context = await strategy.getContext();
    totalOverhead += context.memoryOverheadTokens;

    const response = await chat(
      context.messages,
      [scenario.systemPrompt, context.system].filter(Boolean).join("\n\n"),
    );
    strategy.addMessage({ role: "assistant", content: response.content });

    if ((i + 1) % 5 === 0) {
      process.stdout.write(`    Step ${i + 1}/${scenario.steps.length}\n`);
    }
  }

  // Final question
  strategy.addMessage({ role: "user", content: scenario.finalQuestion });
  const context = await strategy.getContext();
  totalOverhead += context.memoryOverheadTokens;

  const finalResponse = await chat(
    context.messages,
    [scenario.systemPrompt, context.system].filter(Boolean).join("\n\n"),
  );

  const probes = scenario.probes ?? [];
  const probeResults: ProbeResult[] = probes.map((probe) => ({
    fact: probe.fact,
    type: probe.type,
    retained: checkProbeRetained(probe, finalResponse.content),
  }));

  return {
    scenarioName: scenario.name,
    strategyName: strategy.name,
    rep: 0,
    probeResults,
    retainedCount: probeResults.filter((p) => p.retained).length,
    totalProbes: probeResults.length,
    overheadTokens: totalOverhead,
  };
}

// ── Aggregation helpers ────────────────────────────────────────────

export function aggregateRetentionByType(runs: ProbeRunResult[]): Record<string, number> {
  const byType = new Map<string, { retained: number; total: number }>();

  for (const run of runs) {
    for (const probe of run.probeResults) {
      const entry = byType.get(probe.type) ?? { retained: 0, total: 0 };
      entry.total++;
      if (probe.retained) entry.retained++;
      byType.set(probe.type, entry);
    }
  }

  const result: Record<string, number> = {};
  for (const [type, { retained, total }] of byType) {
    result[type] = total > 0 ? retained / total : 0;
  }
  return result;
}

export function printRetentionTable(runs: ProbeRunResult[], label: string): void {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  ${label}`);
  console.log("═".repeat(60));

  const byType = aggregateRetentionByType(runs);
  const sorted = Object.entries(byType).sort((a, b) => a[1] - b[1]);

  for (const [type, rate] of sorted) {
    const pct = (rate * 100).toFixed(0);
    const bar = "█".repeat(Math.round(rate * 20)).padEnd(20, "░");
    console.log(`  ${type.padEnd(14)} ${bar} ${pct.padStart(3)}%`);
  }

  const overall = runs.reduce((sum, r) => sum + r.retainedCount, 0);
  const total = runs.reduce((sum, r) => sum + r.totalProbes, 0);
  console.log(`\n  Overall: ${overall}/${total} (${((overall / total) * 100).toFixed(1)}%)`);
  console.log("═".repeat(60));
}

// ── Result persistence ─────────────────────────────────────────────

export async function saveResults(proposal: string, data: unknown): Promise<string> {
  const outputPath = `results/probe-${proposal}-${Date.now()}.json`;
  await Bun.write(outputPath, JSON.stringify(data, null, 2));
  console.log(`\nResults saved to ${outputPath}`);
  return outputPath;
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/analysis/probe-utils.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/analysis/probe-utils.ts src/analysis/probe-utils.test.ts
git commit -m "feat: add shared probe utilities for feasibility testing"
```

---

## Probe #2: Correction Format Engineering

This is first because it's pure prompt engineering — no new architecture, just swap the correction format in RLM's delegation prompt and measure.

### Task 2: Build correction format probe

**Files:**
- Create: `src/analysis/probe-correction-fmt.ts`
- Reference: `src/strategies/rlm.ts:91-107` (the delegation prompt to modify)
- Reference: `src/tasks/scenarios.ts:558-566` (Scenario 6 probes)
- Reference: `src/analysis/probe-utils.ts` (shared utilities)

**Step 1: Write the test for correction format definitions**

```typescript
// src/analysis/probe-correction-fmt.test.ts
import { test, expect } from "bun:test";
import { CORRECTION_FORMATS, buildCorrectionPrompt } from "./probe-correction-fmt";

test("has 7 correction formats", () => {
  expect(CORRECTION_FORMATS.length).toBe(7);
});

test("each format has name and promptFragment", () => {
  for (const fmt of CORRECTION_FORMATS) {
    expect(fmt.name).toBeTruthy();
    expect(fmt.promptFragment).toBeTruthy();
    expect(typeof fmt.promptFragment).toBe("string");
  }
});

test("buildCorrectionPrompt inserts format into RLM prompt", () => {
  const prompt = buildCorrectionPrompt(CORRECTION_FORMATS[0]!);
  // Should contain the 5 standard RLM questions
  expect(prompt).toContain("ENTITIES");
  expect(prompt).toContain("DECISIONS");
  expect(prompt).toContain("NUMBERS");
  expect(prompt).toContain("CURRENT STATE");
  // Should contain the custom correction format instead of standard #3
  expect(prompt).toContain(CORRECTION_FORMATS[0]!.name);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/analysis/probe-correction-fmt.test.ts`
Expected: FAIL — module not found

**Step 3: Write the correction format probe**

```typescript
// src/analysis/probe-correction-fmt.ts
import type { LLMMessage } from "../utils/llm";
import { chat } from "../utils/llm";
import type { MemoryStrategy } from "../strategies/base";
import { ALL_SCENARIOS, type Probe, type ProbeType } from "../tasks/scenarios";
import {
  checkProbeRetained,
  buildTranscript,
  runScenarioWithProbes,
  aggregateRetentionByType,
  printRetentionTable,
  saveResults,
  type ProbeRunResult,
  type FeasibilityResult,
} from "./probe-utils";

// ── Correction Format Definitions ──────────────────────────────────

export interface CorrectionFormat {
  name: string;
  promptFragment: string;
}

export const CORRECTION_FORMATS: CorrectionFormat[] = [
  {
    name: "Explicit Negation",
    promptFragment: `3. CORRECTIONS: Were any previous facts corrected, updated, or changed? For each correction, state it as:
"[CORRECTED] {attribute}: {new_value} (was: {old_value}). The previous value of {old_value} is WRONG."
List BOTH the old value and the new value explicitly. This is critical.`,
  },
  {
    name: "Contrastive Pair",
    promptFragment: `3. CORRECTIONS: Were any previous facts corrected, updated, or changed? For each correction, format as a table:
| Attribute | OUTDATED (DISCARD) | CURRENT (USE) |
Only include facts that actually changed. ALWAYS use the CURRENT column's values.`,
  },
  {
    name: "Temporal Supersession",
    promptFragment: `3. CORRECTIONS: Were any previous facts corrected, updated, or changed? For each correction, format as a versioned timeline:
"v1 (superseded): {attribute} = {old_value}"
"v2 (ACTIVE): {attribute} = {new_value}"
RULE: Always use the highest version number. Lower versions are expired.`,
  },
  {
    name: "Authoritative Override",
    promptFragment: `3. CORRECTIONS: Were any previous facts corrected, updated, or changed? For each correction, format as:
"SYSTEM OVERRIDE (priority: maximum): {attribute} is {new_value}."
"Note: Previously stated as {old_value}. That value is revoked."
Overrides have absolute priority over any earlier statement.`,
  },
  {
    name: "Self-Generated Re-Derivation",
    promptFragment: `3. CORRECTIONS: Were any previous facts corrected, updated, or changed? For each correction:
a) State the corrected attribute and its new value.
b) Then RE-DERIVE any downstream values that depend on it. Show the calculation step by step.
Example: "Round size corrected to $3M. Post-money = pre-money + round = $12M + $3M = $15M."
Corrections without re-derivation are incomplete.`,
  },
  {
    name: "Structured Diff",
    promptFragment: `3. CORRECTIONS: Were any previous facts corrected, updated, or changed? For each correction, format as a code diff:
\`\`\`
- {attribute}: {old_value}
+ {attribute}: {new_value}
\`\`\`
Lines starting with "-" are deleted (invalid). Lines starting with "+" are the current truth.`,
  },
  {
    name: "Socratic Elicitation",
    promptFragment: `3. CORRECTIONS: Were any previous facts corrected, updated, or changed? For each potential correction:
a) Ask yourself: "Was {attribute} stated differently at different points?"
b) If yes, identify ALL stated values and their order.
c) Conclude: "The most recently stated value for {attribute} is {new_value}. Use this."
List every correction you find through this process.`,
  },
];

// ── Build the modified RLM prompt with a specific correction format ─

export function buildCorrectionPrompt(format: CorrectionFormat): string {
  return `You are a sub-agent processing a conversation segment. Your job is to extract a COMPLETE knowledge state from this conversation. Answer these specific questions:

1. ENTITIES: List every person, place, organization, product, or system mentioned with ALL their attributes (names, numbers, roles, relationships).
2. DECISIONS: What decisions were made? What was chosen and what was rejected?
${format.promptFragment}
4. NUMBERS: List every specific number, amount, date, time, code, ID, or measurement with its context.
5. CURRENT STATE: What is the current state of affairs as of the end of this segment? Only the latest values.

[Format: ${format.name}]

Be exhaustive. Every specific detail matters. Do NOT generalize.`;
}

// ── Format-aware RLM Strategy ──────────────────────────────────────

class FormatRLMStrategy implements MemoryStrategy {
  name: string;
  private messages: LLMMessage[] = [];
  private delegatedKnowledge: string[] = [];
  private delegateEvery: number;
  private recentWindow: number;
  private totalOverheadTokens = 0;
  private messagesSinceDelegation = 0;
  private correctionFormat: CorrectionFormat;

  constructor(format: CorrectionFormat, delegateEvery = 8, recentWindow = 4) {
    this.correctionFormat = format;
    this.delegateEvery = delegateEvery;
    this.recentWindow = recentWindow;
    this.name = `RLM+${format.name}`;
  }

  reset(): void {
    this.messages = [];
    this.delegatedKnowledge = [];
    this.totalOverheadTokens = 0;
    this.messagesSinceDelegation = 0;
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
    this.messagesSinceDelegation++;
  }

  async getContext() {
    let overheadThisStep = 0;

    if (
      this.messagesSinceDelegation >= this.delegateEvery &&
      this.messages.length > this.recentWindow
    ) {
      const toDelegate = this.messages.slice(0, this.messages.length - this.recentWindow);
      const transcript = buildTranscript(toDelegate);

      const existingKnowledge =
        this.delegatedKnowledge.length > 0
          ? `Previously extracted knowledge:\n${this.delegatedKnowledge.join("\n")}\n\n`
          : "";

      const subLLMResult = await chat(
        [
          {
            role: "user",
            content: `${existingKnowledge}New conversation segment:\n${transcript}\n\n${buildCorrectionPrompt(this.correctionFormat)}`,
          },
        ],
        "You are a precise sub-agent in a Recursive Language Model system. Your output will be the ONLY record of this conversation segment. If you miss a detail, it is lost forever. Be thorough and exact.",
      );

      overheadThisStep = subLLMResult.inputTokens + subLLMResult.outputTokens;
      this.totalOverheadTokens += overheadThisStep;
      this.delegatedKnowledge = [subLLMResult.content];
      this.messages = this.messages.slice(-this.recentWindow);
      this.messagesSinceDelegation = 0;
    }

    const messages = [...this.messages];
    const startIdx = messages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? messages.slice(startIdx) : messages;

    const systemParts: string[] = [];
    if (this.delegatedKnowledge.length > 0) {
      systemParts.push(
        `DELEGATED KNOWLEDGE (processed by sub-agent from earlier conversation):\n${this.delegatedKnowledge.join("\n\n")}`,
      );
    }

    return {
      messages: clean,
      system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
      memoryOverheadTokens: overheadThisStep,
    };
  }
}

// ── Measurement: SAR, OIR, PCR ─────────────────────────────────────

interface CorrectionMetrics {
  surfaceAcknowledgment: boolean; // corrected value appears
  priorContamination: boolean; // old value appears
}

/**
 * For Scenario 6 (Cascading Corrections), check if the final answer
 * contains corrected values vs. old values.
 */
function measureCorrectionMetrics(answer: string): CorrectionMetrics[] {
  const lower = answer.toLowerCase();
  // Key corrections in Scenario 6:
  // pre-money: $10M → $12M, round: $2M → $3M, legal: $50K → $75K, burn: $150K → $175K
  const corrections = [
    { newPattern: "12", oldPattern: "10m" },
    { newPattern: "3m", oldPattern: "2m" },
    { newPattern: "75", oldPattern: "50k" },
    { newPattern: "175", oldPattern: "150k" },
  ];

  return corrections.map(({ newPattern, oldPattern }) => ({
    surfaceAcknowledgment: lower.includes(newPattern),
    priorContamination: lower.includes(oldPattern),
  }));
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("Probe #2: Correction Format Engineering");
  console.log("Testing 7 correction formats on Scenario 6 (Cascading Corrections)\n");

  const scenario = ALL_SCENARIOS.find((s) => s.name === "Cascading Corrections");
  if (!scenario) {
    console.error("Scenario 6 (Cascading Corrections) not found!");
    process.exit(1);
  }

  const REPS = 2;
  const allRuns: ProbeRunResult[] = [];
  const formatResults: Array<{
    format: string;
    runs: ProbeRunResult[];
    avgRetention: number;
  }> = [];

  for (const format of CORRECTION_FORMATS) {
    console.log(`\n── Format: ${format.name} ──`);
    const runs: ProbeRunResult[] = [];

    for (let rep = 0; rep < REPS; rep++) {
      console.log(`  Rep ${rep + 1}/${REPS}...`);
      const strategy = new FormatRLMStrategy(format);
      const result = await runScenarioWithProbes(strategy, scenario);
      result.rep = rep + 1;
      runs.push(result);
      allRuns.push(result);
      console.log(`  → ${result.retainedCount}/${result.totalProbes} probes retained`);
    }

    const avgRetention = runs.reduce((s, r) => s + r.retainedCount / r.totalProbes, 0) / runs.length;
    formatResults.push({ format: format.name, runs, avgRetention });
  }

  // Print comparison table
  console.log("\n" + "═".repeat(60));
  console.log("  CORRECTION FORMAT COMPARISON");
  console.log("═".repeat(60));

  const sorted = [...formatResults].sort((a, b) => b.avgRetention - a.avgRetention);
  for (const { format, avgRetention, runs } of sorted) {
    const pct = (avgRetention * 100).toFixed(0);
    const bar = "█".repeat(Math.round(avgRetention * 20)).padEnd(20, "░");
    const perRun = runs.map((r) => `${r.retainedCount}/${r.totalProbes}`).join(", ");
    console.log(`  ${format.padEnd(25)} ${bar} ${pct.padStart(3)}%  (${perRun})`);
  }

  // Kill criteria check
  const baseline = formatResults.find((f) => f.format === "Explicit Negation");
  const best = sorted[0]!;
  const improvement = best.avgRetention - (baseline?.avgRetention ?? 0);

  console.log(`\n  Baseline (Explicit Negation): ${((baseline?.avgRetention ?? 0) * 100).toFixed(0)}%`);
  console.log(`  Best (${best.format}): ${(best.avgRetention * 100).toFixed(0)}%`);
  console.log(`  Improvement: ${(improvement * 100).toFixed(1)}pp`);
  console.log(`  Kill criteria (<5pp improvement): ${improvement < 0.05 ? "TRIGGERED — abandon" : "PASSED — proceed"}`);

  const result: FeasibilityResult = {
    proposal: "Correction Format Engineering",
    phase1: { passed: true, details: { note: "No phase 1 — pure prompt engineering" } },
    phase2: {
      runs: allRuns,
      retentionByType: aggregateRetentionByType(allRuns),
      comparisonToBaseline: Object.fromEntries(
        formatResults.map((f) => [f.format, f.avgRetention]),
      ),
    },
    killCriteriaMet: improvement < 0.05,
    recommendation: improvement >= 0.1 ? "proceed" : improvement >= 0.05 ? "refine" : "abandon",
  };

  await saveResults("correction-fmt", result);
}

main().catch(console.error);
```

**Step 4: Run test to verify it passes**

Run: `bun test src/analysis/probe-correction-fmt.test.ts`
Expected: All 3 tests PASS

**Step 5: Commit**

```bash
git add src/analysis/probe-correction-fmt.ts src/analysis/probe-correction-fmt.test.ts
git commit -m "feat: probe #2 — correction format engineering feasibility test"
```

**Step 6: Run the probe (costs ~$1.00-1.50)**

Run: `bun src/analysis/probe-correction-fmt.ts`
Expected: 14 runs (7 formats × 2 reps) on Scenario 6, comparison table, JSON output.

---

## Probe #1: Depth-Adaptive RLM (DA-RLM)

### Task 3: Build Content Assessor (Phase 1 — zero cost)

**Files:**
- Create: `src/analysis/probe-da-rlm.ts`
- Reference: `src/strategies/deep-rlm.ts` (DeepRLMStrategy to extend)
- Reference: `src/tasks/scenarios.ts` (ALL_SCENARIOS for transcript analysis)

**Step 1: Write the test for Content Assessor signals**

```typescript
// src/analysis/probe-da-rlm.test.ts
import { test, expect } from "bun:test";
import {
  informationDensity,
  correctionFrequency,
  identifierDensity,
  noiseRatio,
  routeDepth,
} from "./probe-da-rlm";

test("informationDensity: high for dense text", () => {
  const dense = "Budget is $347,250. Lead is Dr. Sarah Chen. Deadline March 15, 2027. Framework: Svelte.";
  const sparse = "Sounds good. I agree. Let's move on. Nice weather today.";
  expect(informationDensity(dense)).toBeGreaterThan(informationDensity(sparse));
});

test("correctionFrequency: detects correction markers", () => {
  const text = "Actually, the budget is $12M, not $10M. Wait, the round size changed to $3M.";
  expect(correctionFrequency(text)).toBeGreaterThanOrEqual(2);
});

test("correctionFrequency: zero for no corrections", () => {
  const text = "The project is called Mercury. Budget is $347,250.";
  expect(correctionFrequency(text)).toBe(0);
});

test("identifierDensity: counts phones and IDs", () => {
  const text = "Patient ID: RMC-2847. Phone: 555-0147. Policy: HLT-99284-B.";
  expect(identifierDensity(text)).toBeGreaterThanOrEqual(3);
});

test("identifierDensity: zero for narrative text", () => {
  const text = "The team discussed the project timeline and agreed on next steps.";
  expect(identifierDensity(text)).toBe(0);
});

test("noiseRatio: high for chitchat", () => {
  const messages = [
    "How's it going?",
    "Pretty good, thanks!",
    "Patient ID is RMC-2847",
    "Nice weather today",
    "Agreed!",
  ];
  // 3/5 messages are noise
  expect(noiseRatio(messages)).toBeGreaterThanOrEqual(0.5);
});

test("routeDepth: returns 1 for high noise", () => {
  expect(routeDepth({ noiseRatio: 0.7, identifierDensity: 0, informationDensity: 5, correctionFrequency: 0, knowledgeSize: 100 })).toBe(1);
});

test("routeDepth: returns 2 for dense + corrections", () => {
  expect(routeDepth({ noiseRatio: 0.1, identifierDensity: 0, informationDensity: 20, correctionFrequency: 2, knowledgeSize: 100 })).toBe(2);
});

test("routeDepth: returns 1 for high identifier density", () => {
  expect(routeDepth({ noiseRatio: 0.1, identifierDensity: 4, informationDensity: 15, correctionFrequency: 0, knowledgeSize: 100 })).toBe(1);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/analysis/probe-da-rlm.test.ts`
Expected: FAIL — module not found

**Step 3: Write the DA-RLM probe**

```typescript
// src/analysis/probe-da-rlm.ts
import { DeepRLMStrategy } from "../strategies/deep-rlm";
import type { LLMMessage } from "../utils/llm";
import { chat } from "../utils/llm";
import { ALL_SCENARIOS, type Probe, type ProbeType, type Scenario } from "../tasks/scenarios";
import {
  checkProbeRetained,
  buildTranscript,
  runScenarioWithProbes,
  aggregateRetentionByType,
  printRetentionTable,
  saveResults,
  type ProbeRunResult,
  type FeasibilityResult,
  type ProbeStrategy,
} from "./probe-utils";

// ── Content Assessor Signals ───────────────────────────────────────

/**
 * Tokens per distinct entity/number. Higher = more information-dense.
 * Regex-based: counts named entities (capitalized words), numbers, codes.
 */
export function informationDensity(text: string): number {
  const tokens = text.split(/\s+/).length;
  const entities = new Set<string>();

  // Named entities: capitalized multi-word sequences
  for (const match of text.matchAll(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g)) {
    entities.add(match[0].toLowerCase());
  }
  // Numbers with context
  for (const match of text.matchAll(/\$?[\d,]+\.?\d*[kKmMbB%]?/g)) {
    entities.add(match[0]);
  }
  // Codes/IDs
  for (const match of text.matchAll(/[A-Z]{2,}-[\d-]+[A-Z]?/g)) {
    entities.add(match[0]);
  }

  if (entities.size === 0) return 0;
  return entities.size / (tokens / 100); // entities per 100 tokens
}

/**
 * Count of contradiction/update markers in text.
 */
export function correctionFrequency(text: string): number {
  const markers = [
    /\bactually\b/gi,
    /\bwait\b/gi,
    /\bcorrect(?:ion|ed)\b/gi,
    /\bupdat(?:e|ed|ing)\b/gi,
    /\bchang(?:e|ed|ing)\b/gi,
    /\bnot [\$\d]/gi,
    /\binstead of\b/gi,
    /\brather than\b/gi,
    /\bno longer\b/gi,
    /\bwas\s+\$?[\d,]+.*?(?:now|is)\s+\$?[\d,]+/gi,
  ];

  let count = 0;
  for (const marker of markers) {
    const matches = text.match(marker);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Count of phone numbers, IDs, codes, alphanumeric identifiers.
 */
export function identifierDensity(text: string): number {
  const patterns = [
    /\d{3}[-.]?\d{3,4}[-.]?\d{4}/g, // phone numbers
    /[A-Z]{2,4}-\d{2,6}[-]?[A-Z]?\b/g, // ID codes like RMC-2847, HLT-99284-B
    /\b[A-Z]{2,}\d{3,}\b/g, // codes like UA447
    /\b[A-Z0-9]{4,8}\b(?=.*(?:code|id|number|policy|passport|confirmation))/gi, // contextual codes
  ];

  const found = new Set<string>();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      found.add(match[0]);
    }
  }
  return found.size;
}

/**
 * Fraction of messages containing no extractable facts.
 * A message is "noise" if it has no numbers, no named entities, no identifiers.
 */
export function noiseRatio(messages: string[]): number {
  if (messages.length === 0) return 0;

  let noiseCount = 0;
  for (const msg of messages) {
    const hasNumber = /\$?[\d,]+\.?\d*[kKmMbB%]?/.test(msg) && /\d{2,}/.test(msg);
    const hasNamedEntity = /[A-Z][a-z]{2,}/.test(msg);
    const hasIdentifier = /[A-Z]{2,}-\d+/.test(msg) || /\d{3}[-.]?\d{3,4}[-.]?\d{4}/.test(msg);

    if (!hasNumber && !hasNamedEntity && !hasIdentifier) {
      noiseCount++;
    }
  }
  return noiseCount / messages.length;
}

// ── Depth Router ───────────────────────────────────────────────────

export interface AssessorSignals {
  noiseRatio: number;
  identifierDensity: number;
  informationDensity: number;
  correctionFrequency: number;
  knowledgeSize: number;
}

const INFO_DENSITY_HIGH = 10; // entities per 100 tokens

/**
 * Route to optimal depth based on content assessment signals.
 * Rule-based policy derived from CTX-2 depth experiment results.
 */
export function routeDepth(signals: AssessorSignals): 1 | 2 | 3 {
  if (signals.noiseRatio > 0.5) return 1; // protect against noise amplification
  if (signals.identifierDensity > 3) return 1; // IDs degrade at depth > 1
  if (signals.informationDensity > INFO_DENSITY_HIGH && signals.correctionFrequency > 0) return 2;
  if (signals.correctionFrequency > 3) return 3; // deep reconciliation
  if (signals.knowledgeSize > 4000) return 1; // Scaling Paradox protection
  return 1; // conservative default
}

// ── Assess all 8 scenarios (Phase 1) ──────────────────────────────

interface ScenarioAssessment {
  scenarioName: string;
  signals: AssessorSignals;
  routedDepth: number;
  /** Known from CTX-2: did depth-2 help or hurt? */
  expectedOptimalDepth: number | null;
  match: boolean | null;
}

function assessScenario(scenario: Scenario): ScenarioAssessment {
  const fullTranscript = scenario.steps.join("\n");
  const signals: AssessorSignals = {
    noiseRatio: noiseRatio(scenario.steps),
    identifierDensity: identifierDensity(fullTranscript),
    informationDensity: informationDensity(fullTranscript),
    correctionFrequency: correctionFrequency(fullTranscript),
    knowledgeSize: fullTranscript.length, // rough proxy
  };

  const depth = routeDepth(signals);

  // Known ground truth from CTX-2 (where available):
  // Early Fact Recall: depth-2 helped (1/10 → 8/10)
  // Long Horizon + Noise: depth-2 hurt (7/8 → 3/8)
  // Others: mixed
  const knownOptimal: Record<string, number> = {
    "Early Fact Recall": 2,
    "Long Horizon + Noise": 1,
  };

  const expected = knownOptimal[scenario.name] ?? null;
  const match = expected !== null ? depth === expected : null;

  return { scenarioName: scenario.name, signals, routedDepth: depth, expectedOptimalDepth: expected, match };
}

// ── DA-RLM Strategy (Phase 2) ──────────────────────────────────────

class DARLMStrategy implements ProbeStrategy {
  name = "DA-RLM";
  private inner1: DeepRLMStrategy;
  private inner2: DeepRLMStrategy;
  private messages: LLMMessage[] = [];
  private useDepth: 1 | 2 | 3 = 1;

  constructor() {
    this.inner1 = new DeepRLMStrategy(1, 8, 4);
    this.inner2 = new DeepRLMStrategy(2, 8, 4);
  }

  reset(): void {
    this.inner1.reset();
    this.inner2.reset();
    this.messages = [];
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
    // Mirror to both inner strategies — we'll query the right one in getContext
    this.inner1.addMessage(message);
    this.inner2.addMessage(message);
  }

  async getContext() {
    // Assess the current message buffer to decide depth
    const recentMessages = this.messages.slice(-8).map((m) => m.content);
    const fullText = recentMessages.join("\n");

    const signals: AssessorSignals = {
      noiseRatio: noiseRatio(recentMessages),
      identifierDensity: identifierDensity(fullText),
      informationDensity: informationDensity(fullText),
      correctionFrequency: correctionFrequency(fullText),
      knowledgeSize: fullText.length,
    };

    this.useDepth = routeDepth(signals);

    // Use the inner strategy matching the routed depth
    const strategy = this.useDepth >= 2 ? this.inner2 : this.inner1;
    return strategy.getContext();
  }
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("Probe #1: Depth-Adaptive RLM (DA-RLM)");
  console.log("Phase 1: Content Assessor validation (no LLM calls)\n");

  // ── Phase 1: Assess all scenarios ──
  const assessments = ALL_SCENARIOS.map(assessScenario);

  console.log("═".repeat(70));
  console.log("  CONTENT ASSESSOR — SCENARIO ROUTING");
  console.log("═".repeat(70));
  console.log("");

  for (const a of assessments) {
    const matchStr = a.match === null ? "  (no ground truth)" : a.match ? "  ✓ CORRECT" : "  ✗ WRONG";
    console.log(`  ${a.scenarioName}`);
    console.log(`    noise=${a.signals.noiseRatio.toFixed(2)} ids=${a.signals.identifierDensity} density=${a.signals.informationDensity.toFixed(1)} corrections=${a.signals.correctionFrequency}`);
    console.log(`    → depth-${a.routedDepth}${a.expectedOptimalDepth ? ` (expected: depth-${a.expectedOptimalDepth})` : ""}${matchStr}`);
    console.log();
  }

  const withGroundTruth = assessments.filter((a) => a.match !== null);
  const correct = withGroundTruth.filter((a) => a.match).length;
  const phase1Passed = withGroundTruth.length === 0 || correct / withGroundTruth.length >= 0.75;

  console.log(`  Ground-truth matches: ${correct}/${withGroundTruth.length}`);
  console.log(`  Phase 1: ${phase1Passed ? "PASSED" : "FAILED"}`);

  if (!phase1Passed) {
    console.log("\n  Kill criteria triggered: Content Assessor cannot distinguish scenarios.");
    console.log("  Recommendation: ABANDON or refine assessor signals before Phase 2.");

    const result: FeasibilityResult = {
      proposal: "DA-RLM",
      phase1: { passed: false, details: { assessments, correct, total: withGroundTruth.length } },
      phase2: { runs: [], retentionByType: {}, comparisonToBaseline: {} },
      killCriteriaMet: true,
      recommendation: "abandon",
    };
    await saveResults("da-rlm", result);
    return;
  }

  // ── Phase 2: Targeted benchmark ──
  console.log("\n\nPhase 2: Targeted benchmark (4 runs)\n");

  const targetScenarios = [
    ALL_SCENARIOS.find((s) => s.name === "Early Fact Recall")!,
    ALL_SCENARIOS.find((s) => s.name === "Long Horizon + Noise")!,
  ];

  const REPS = 2;
  const allRuns: ProbeRunResult[] = [];

  for (const scenario of targetScenarios) {
    console.log(`\n── ${scenario.name} ──`);
    for (let rep = 0; rep < REPS; rep++) {
      console.log(`  Rep ${rep + 1}/${REPS}...`);
      const strategy = new DARLMStrategy();
      const result = await runScenarioWithProbes(strategy, scenario);
      result.rep = rep + 1;
      allRuns.push(result);
      console.log(`  → ${result.retainedCount}/${result.totalProbes} probes retained`);
    }
  }

  printRetentionTable(allRuns, "DA-RLM PROBE RESULTS");

  // Comparison to baselines
  console.log("\n  Baselines from CTX-2:");
  console.log("    RLM depth-1: 59.7% overall");
  console.log("    RLM depth-2: 66.1% overall");

  const overall = allRuns.reduce((s, r) => s + r.retainedCount, 0) /
    allRuns.reduce((s, r) => s + r.totalProbes, 0);
  console.log(`    DA-RLM:      ${(overall * 100).toFixed(1)}%`);

  const result: FeasibilityResult = {
    proposal: "DA-RLM",
    phase1: { passed: true, details: { assessments, correct, total: withGroundTruth.length } },
    phase2: {
      runs: allRuns,
      retentionByType: aggregateRetentionByType(allRuns),
      comparisonToBaseline: {
        "RLM depth-1": 0.597,
        "RLM depth-2": 0.661,
        "DA-RLM": overall,
      },
    },
    killCriteriaMet: false,
    recommendation: overall > 0.7 ? "proceed" : overall > 0.6 ? "refine" : "abandon",
  };

  await saveResults("da-rlm", result);
}

main().catch(console.error);
```

**Step 4: Run tests**

Run: `bun test src/analysis/probe-da-rlm.test.ts`
Expected: All 9 tests PASS

**Step 5: Commit**

```bash
git add src/analysis/probe-da-rlm.ts src/analysis/probe-da-rlm.test.ts
git commit -m "feat: probe #1 — depth-adaptive RLM with content assessor"
```

**Step 6: Run Phase 1 only (free)**

Run: `bun src/analysis/probe-da-rlm.ts`

If Phase 1 fails (kill criteria triggered), the script stops. If it passes, it continues to Phase 2 (~$0.50).

---

## Probe #5: Stability-Plasticity Decomposed Memory

### Task 4: Build Stability-Plasticity probe

**Files:**
- Create: `src/analysis/probe-stability.ts`
- Reference: `src/strategies/persistent-rlm.ts` (PersistentRLMStrategy for typed stores pattern)
- Reference: `src/strategies/rlm.ts` (base RLM to wrap)

**Step 1: Write the test for Type Classifier**

```typescript
// src/analysis/probe-stability.test.ts
import { test, expect } from "bun:test";
import { classifyStable, StableClassification } from "./probe-stability";

test("classifies phone numbers as stable", () => {
  const results = classifyStable("Call me at 555-0147 for details.");
  expect(results.some((r) => r.value.includes("555-0147") && r.type === "phone")).toBe(true);
});

test("classifies ID codes as stable", () => {
  const results = classifyStable("Patient ID: RMC-2847 and policy HLT-99284-B.");
  expect(results.length).toBeGreaterThanOrEqual(2);
  expect(results.every((r) => r.type === "id")).toBe(true);
});

test("returns empty for narrative text", () => {
  const results = classifyStable("The team discussed the project timeline and agreed on next steps.");
  expect(results.length).toBe(0);
});

test("classifies flight/gate codes", () => {
  const results = classifyStable("Flight UA447 at gate B12, confirmation code XKRM47.");
  expect(results.length).toBeGreaterThanOrEqual(1);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/analysis/probe-stability.test.ts`
Expected: FAIL — module not found

**Step 3: Write the Stability-Plasticity probe**

```typescript
// src/analysis/probe-stability.ts
import type { LLMMessage } from "../utils/llm";
import { chat } from "../utils/llm";
import type { MemoryStrategy } from "../strategies/base";
import { ALL_SCENARIOS, type Probe, type ProbeType, type Scenario } from "../tasks/scenarios";
import {
  checkProbeRetained,
  buildTranscript,
  runScenarioWithProbes,
  aggregateRetentionByType,
  printRetentionTable,
  saveResults,
  type ProbeRunResult,
  type FeasibilityResult,
  type ProbeStrategy,
} from "./probe-utils";

// ── Type Classifier (regex-based) ──────────────────────────────────

export interface StableClassification {
  value: string;
  type: "phone" | "id" | "code";
}

/**
 * Extract stable facts from text using regex patterns.
 * Stable facts are things that paraphrasing would destroy:
 * phone numbers, ID codes, confirmation codes, alphanumeric identifiers.
 */
export function classifyStable(text: string): StableClassification[] {
  const results: StableClassification[] = [];
  const seen = new Set<string>();

  // Phone numbers: 555-0147, 090-8765-4321, etc.
  for (const match of text.matchAll(/\b\d{3}[-.]?\d{3,4}[-.]?\d{4}\b/g)) {
    if (!seen.has(match[0])) {
      seen.add(match[0]);
      results.push({ value: match[0], type: "phone" });
    }
  }

  // ID codes: RMC-2847, HLT-99284-B, etc.
  for (const match of text.matchAll(/\b[A-Z]{2,4}-\d{2,6}[-]?[A-Z]?\b/g)) {
    if (!seen.has(match[0])) {
      seen.add(match[0]);
      results.push({ value: match[0], type: "id" });
    }
  }

  // Alphanumeric codes: UA447, XKRM47, B12 (when in context of gate/code)
  for (const match of text.matchAll(/\b(?:(?:code|gate|flight|confirmation|passport)\s+)?([A-Z]{1,2}\d{2,6}|[A-Z]{2,6}\d{2,4})\b/gi)) {
    const code = match[1] ?? match[0];
    if (!seen.has(code) && code.length >= 3) {
      seen.add(code);
      results.push({ value: code, type: "code" });
    }
  }

  // Alarm codes: 4-digit codes mentioned with "code"
  for (const match of text.matchAll(/(?:code|pin|alarm)\s+(\d{4,6})\b/gi)) {
    const code = match[1]!;
    if (!seen.has(code)) {
      seen.add(code);
      results.push({ value: code, type: "code" });
    }
  }

  // Passport numbers: P-847291
  for (const match of text.matchAll(/\b[A-Z]-\d{5,8}\b/g)) {
    if (!seen.has(match[0])) {
      seen.add(match[0]);
      results.push({ value: match[0], type: "id" });
    }
  }

  return results;
}

// ── Phase 1: Validate classifier against known probes ──────────────

interface ClassifierValidation {
  scenarioName: string;
  stableProbes: Probe[]; // probes that SHOULD be classified as stable (phone/id, spatial)
  detectedStableValues: StableClassification[];
  recall: number; // of stable probes, how many were detected?
  falsePositives: number; // detected values not matching any stable probe
}

function validateClassifier(scenario: Scenario): ClassifierValidation {
  const probes = scenario.probes ?? [];
  const stableProbes = probes.filter((p) => p.type === "phone/id" || p.type === "spatial");
  const fullTranscript = scenario.steps.join("\n");
  const detected = classifyStable(fullTranscript);

  // Check recall: for each stable probe, does the classifier detect its patterns?
  let hits = 0;
  for (const probe of stableProbes) {
    const probeDetected = probe.patterns.some((pattern) =>
      detected.some((d) => d.value.toLowerCase().includes(pattern.toLowerCase()) ||
        pattern.toLowerCase().includes(d.value.toLowerCase())),
    );
    if (probeDetected) hits++;
  }

  const recall = stableProbes.length > 0 ? hits / stableProbes.length : 1;
  return {
    scenarioName: scenario.name,
    stableProbes,
    detectedStableValues: detected,
    recall,
    falsePositives: Math.max(0, detected.length - hits),
  };
}

// ── Stability-Plasticity Strategy (Phase 2) ────────────────────────

class StabilityPlasticityStrategy implements ProbeStrategy {
  name = "Stability-Plasticity";
  private messages: LLMMessage[] = [];
  private stableBuffer: Map<string, string> = new Map(); // never compressed
  private delegatedKnowledge: string[] = [];
  private delegateEvery: number;
  private recentWindow: number;
  private totalOverheadTokens = 0;
  private messagesSinceDelegation = 0;

  constructor(delegateEvery = 8, recentWindow = 4) {
    this.delegateEvery = delegateEvery;
    this.recentWindow = recentWindow;
  }

  reset(): void {
    this.messages = [];
    this.stableBuffer = new Map();
    this.delegatedKnowledge = [];
    this.totalOverheadTokens = 0;
    this.messagesSinceDelegation = 0;
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
    this.messagesSinceDelegation++;

    // Intercept: extract stable facts BEFORE any compression
    if (message.role === "user") {
      const stables = classifyStable(message.content);
      for (const stable of stables) {
        // Store with context: the sentence containing the stable value
        const sentences = message.content.split(/[.!?]+/).filter((s) => s.includes(stable.value));
        const context = sentences.length > 0 ? sentences[0]!.trim() : stable.value;
        this.stableBuffer.set(stable.value, context);
      }
    }
  }

  async getContext() {
    let overheadThisStep = 0;

    if (
      this.messagesSinceDelegation >= this.delegateEvery &&
      this.messages.length > this.recentWindow
    ) {
      const toDelegate = this.messages.slice(0, this.messages.length - this.recentWindow);
      const transcript = buildTranscript(toDelegate);

      const existingKnowledge =
        this.delegatedKnowledge.length > 0
          ? `Previously extracted knowledge:\n${this.delegatedKnowledge.join("\n")}\n\n`
          : "";

      // Standard RLM delegation (Plastic channel)
      const subLLMResult = await chat(
        [
          {
            role: "user",
            content: `${existingKnowledge}New conversation segment:\n${transcript}\n\nYou are a sub-agent processing a conversation segment. Your job is to extract a COMPLETE knowledge state from this conversation. Answer these specific questions:

1. ENTITIES: List every person, place, organization, product, or system mentioned with ALL their attributes (names, numbers, roles, relationships).
2. DECISIONS: What decisions were made? What was chosen and what was rejected?
3. CORRECTIONS: Were any previous facts corrected, updated, or changed? List BOTH the old value and the new value explicitly. This is critical — flag every instance where something was changed.
4. NUMBERS: List every specific number, amount, date, time, code, ID, or measurement with its context.
5. CURRENT STATE: What is the current state of affairs as of the end of this segment? Only the latest values.

Be exhaustive. Every specific detail matters. Do NOT generalize.`,
          },
        ],
        "You are a precise sub-agent in a Recursive Language Model system. Your output will be the ONLY record of this conversation segment. If you miss a detail, it is lost forever. Be thorough and exact.",
      );

      overheadThisStep = subLLMResult.inputTokens + subLLMResult.outputTokens;
      this.totalOverheadTokens += overheadThisStep;
      this.delegatedKnowledge = [subLLMResult.content];
      this.messages = this.messages.slice(-this.recentWindow);
      this.messagesSinceDelegation = 0;
    }

    const messages = [...this.messages];
    const startIdx = messages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? messages.slice(startIdx) : messages;

    // Recombine: Stable channel (verbatim) + Plastic channel (RLM output)
    const systemParts: string[] = [];

    if (this.stableBuffer.size > 0) {
      const stableEntries = Array.from(this.stableBuffer.entries())
        .map(([value, context]) => `- ${context}`)
        .join("\n");
      systemParts.push(
        `STABLE FACTS (verbatim — do not paraphrase, these are exact values):\n${stableEntries}`,
      );
    }

    if (this.delegatedKnowledge.length > 0) {
      systemParts.push(
        `DELEGATED KNOWLEDGE (processed by sub-agent from earlier conversation):\n${this.delegatedKnowledge.join("\n\n")}`,
      );
    }

    return {
      messages: clean,
      system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
      memoryOverheadTokens: overheadThisStep,
    };
  }
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("Probe #5: Stability-Plasticity Decomposed Memory");
  console.log("Phase 1: Type Classifier validation (no LLM calls)\n");

  // ── Phase 1: Validate regex classifier ──
  const validations = ALL_SCENARIOS
    .filter((s) => s.probes && s.probes.length > 0)
    .map(validateClassifier);

  console.log("═".repeat(70));
  console.log("  TYPE CLASSIFIER VALIDATION");
  console.log("═".repeat(70));

  for (const v of validations) {
    console.log(`\n  ${v.scenarioName}`);
    console.log(`    Stable probes: ${v.stableProbes.length}`);
    console.log(`    Detected stable values: ${v.detectedStableValues.length}`);
    if (v.stableProbes.length > 0) {
      console.log(`    Recall: ${(v.recall * 100).toFixed(0)}%`);
    }
    for (const d of v.detectedStableValues) {
      console.log(`      [${d.type}] ${d.value}`);
    }
  }

  // Overall recall on stable probes
  const totalStableProbes = validations.reduce((s, v) => s + v.stableProbes.length, 0);
  const totalHits = validations.reduce((s, v) => s + Math.round(v.recall * v.stableProbes.length), 0);
  const overallRecall = totalStableProbes > 0 ? totalHits / totalStableProbes : 1;

  console.log(`\n  Overall recall on stable probes: ${totalHits}/${totalStableProbes} (${(overallRecall * 100).toFixed(0)}%)`);
  console.log(`  Phase 1: ${overallRecall >= 0.8 ? "PASSED" : "FAILED"} (threshold: 80%)`);

  if (overallRecall < 0.8) {
    console.log("\n  Kill criteria triggered: Regex classifier misses too many stable facts.");
    console.log("  Recommendation: Refine regex patterns or add LLM classification pass.");

    const result: FeasibilityResult = {
      proposal: "Stability-Plasticity",
      phase1: { passed: false, details: { validations, overallRecall } },
      phase2: { runs: [], retentionByType: {}, comparisonToBaseline: {} },
      killCriteriaMet: true,
      recommendation: "refine",
    };
    await saveResults("stability", result);
    return;
  }

  // ── Phase 2: Targeted benchmark ──
  console.log("\n\nPhase 2: Targeted benchmark (4 runs)\n");

  const targetScenarios = [
    ALL_SCENARIOS.find((s) => s.name === "Early Fact Recall")!,
    ALL_SCENARIOS.find((s) => s.name === "Cascading Corrections")!,
  ];

  const REPS = 2;
  const allRuns: ProbeRunResult[] = [];

  for (const scenario of targetScenarios) {
    console.log(`\n── ${scenario.name} ──`);
    for (let rep = 0; rep < REPS; rep++) {
      console.log(`  Rep ${rep + 1}/${REPS}...`);
      const strategy = new StabilityPlasticityStrategy();
      const result = await runScenarioWithProbes(strategy, scenario);
      result.rep = rep + 1;
      allRuns.push(result);
      console.log(`  → ${result.retainedCount}/${result.totalProbes} probes retained`);
    }
  }

  printRetentionTable(allRuns, "STABILITY-PLASTICITY PROBE RESULTS");

  // Focus on the target types
  const byType = aggregateRetentionByType(allRuns);
  const phoneIdRetention = byType["phone/id"] ?? 0;
  const spatialRetention = byType["spatial"] ?? 0;

  console.log(`\n  Key metrics (vs. 0% RLM baseline):`);
  console.log(`    phone/id retention: ${(phoneIdRetention * 100).toFixed(0)}% (baseline: 0%)`);
  console.log(`    spatial retention:  ${(spatialRetention * 100).toFixed(0)}% (baseline: 0%)`);

  const killMet = phoneIdRetention < 0.6 && spatialRetention < 0.6;
  console.log(`  Kill criteria (<60% on both): ${killMet ? "TRIGGERED" : "PASSED"}`);

  const result: FeasibilityResult = {
    proposal: "Stability-Plasticity",
    phase1: { passed: true, details: { validations, overallRecall } },
    phase2: {
      runs: allRuns,
      retentionByType: byType,
      comparisonToBaseline: { "RLM baseline phone/id": 0, "RLM baseline spatial": 0 },
    },
    killCriteriaMet: killMet,
    recommendation: !killMet ? "proceed" : "refine",
  };

  await saveResults("stability", result);
}

main().catch(console.error);
```

**Step 4: Run tests**

Run: `bun test src/analysis/probe-stability.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/analysis/probe-stability.ts src/analysis/probe-stability.test.ts
git commit -m "feat: probe #5 — stability-plasticity with regex type classifier"
```

**Step 6: Run the probe**

Run: `bun src/analysis/probe-stability.ts`

Phase 1 runs free (regex only). If it passes, Phase 2 costs ~$0.50.

---

## Probe #3: Structural Shadow Graphs

### Task 5: Build Shadow Graphs probe

**Files:**
- Create: `src/analysis/probe-shadow-graphs.ts`
- Reference: `src/strategies/rlm.ts` (base RLM to extend)
- Reference: `src/analysis/probe-utils.ts`

**Step 1: Write the test for graph serialization**

```typescript
// src/analysis/probe-shadow-graphs.test.ts
import { test, expect } from "bun:test";
import { ShadowGraph, parseGraphTriples } from "./probe-shadow-graphs";

test("ShadowGraph: add and serialize entity", () => {
  const graph = new ShadowGraph();
  graph.addIdentifier("Kenji", "phone", "090-8765-4321");
  const serialized = graph.serialize();
  expect(serialized).toContain("Kenji");
  expect(serialized).toContain("090-8765-4321");
});

test("ShadowGraph: add spatial and serialize", () => {
  const graph = new ShadowGraph();
  graph.addSpatial("Floor 3", "conference room", "capacity: 50");
  const serialized = graph.serialize();
  expect(serialized).toContain("Floor 3");
  expect(serialized).toContain("conference room");
});

test("ShadowGraph: corrections create supersession chain", () => {
  const graph = new ShadowGraph();
  graph.addIdentifier("Kenji", "neighborhood", "Shibuya");
  graph.addSupersession("Kenji.neighborhood", "Shibuya", "Shinjuku");
  const serialized = graph.serialize();
  expect(serialized).toContain("Shinjuku");
  expect(serialized).toContain("was: Shibuya");
});

test("parseGraphTriples: extracts ENTITY lines", () => {
  const output = `ENTITY: Kenji | phone: 090-8765-4321 | neighborhood: Shinjuku
SPATIAL: Floor 3 > Conference Room | capacity: 50
RELATION: Paul -- couple -- Quinn`;
  const triples = parseGraphTriples(output);
  expect(triples.entities.length).toBeGreaterThanOrEqual(1);
  expect(triples.spatial.length).toBeGreaterThanOrEqual(1);
  expect(triples.relations.length).toBeGreaterThanOrEqual(1);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/analysis/probe-shadow-graphs.test.ts`
Expected: FAIL — module not found

**Step 3: Write the Shadow Graphs probe**

```typescript
// src/analysis/probe-shadow-graphs.ts
import type { LLMMessage } from "../utils/llm";
import { chat } from "../utils/llm";
import type { MemoryStrategy } from "../strategies/base";
import { ALL_SCENARIOS, type Probe, type ProbeType, type Scenario } from "../tasks/scenarios";
import {
  checkProbeRetained,
  buildTranscript,
  runScenarioWithProbes,
  aggregateRetentionByType,
  printRetentionTable,
  saveResults,
  type ProbeRunResult,
  type FeasibilityResult,
  type ProbeStrategy,
} from "./probe-utils";

// ── Shadow Graph Data Structure ────────────────────────────────────

export class ShadowGraph {
  private identifiers: Map<string, Map<string, string>> = new Map(); // entity → (attr → value)
  private spatial: Array<{ location: string; child: string; attrs: string }> = [];
  private relations: Array<{ entity1: string; type: string; entity2: string }> = [];
  private decisions: Array<{ entity: string; decision: string; outcome: string }> = [];
  private supersessions: Array<{ key: string; oldValue: string; newValue: string }> = [];

  addIdentifier(entity: string, attr: string, value: string): void {
    if (!this.identifiers.has(entity)) {
      this.identifiers.set(entity, new Map());
    }
    this.identifiers.get(entity)!.set(attr, value);
  }

  addSpatial(location: string, child: string, attrs: string): void {
    this.spatial.push({ location, child, attrs });
  }

  addRelation(entity1: string, type: string, entity2: string): void {
    this.relations.push({ entity1, type, entity2 });
  }

  addDecision(entity: string, decision: string, outcome: string): void {
    this.decisions.push({ entity, decision, outcome });
  }

  addSupersession(key: string, oldValue: string, newValue: string): void {
    this.supersessions.push({ key, oldValue, newValue });
    // Also update the identifier if applicable
    const [entity, attr] = key.split(".");
    if (entity && attr && this.identifiers.has(entity)) {
      this.identifiers.get(entity)!.set(attr, newValue);
    }
  }

  serialize(): string {
    const parts: string[] = [];

    if (this.identifiers.size > 0) {
      const entries = Array.from(this.identifiers.entries()).map(([entity, attrs]) => {
        const attrStr = Array.from(attrs.entries()).map(([k, v]) => `${k}=${v}`).join(", ");
        return `  ${entity}: ${attrStr}`;
      });
      parts.push(`[Entities]\n${entries.join("\n")}`);
    }

    if (this.spatial.length > 0) {
      const entries = this.spatial.map((s) =>
        `  ${s.location} > ${s.child} (${s.attrs})`);
      parts.push(`[Spatial]\n${entries.join("\n")}`);
    }

    if (this.relations.length > 0) {
      const entries = this.relations.map((r) =>
        `  ${r.entity1} <--${r.type}--> ${r.entity2}`);
      parts.push(`[Relations]\n${entries.join("\n")}`);
    }

    if (this.decisions.length > 0) {
      const entries = this.decisions.map((d) =>
        `  ${d.entity}: ${d.decision}, ${d.outcome}`);
      parts.push(`[Decisions]\n${entries.join("\n")}`);
    }

    if (this.supersessions.length > 0) {
      const entries = this.supersessions.map((s) =>
        `  ${s.key}: ${s.newValue} (was: ${s.oldValue})`);
      parts.push(`[Corrections]\n${entries.join("\n")}`);
    }

    return parts.length > 0 ? `STRUCTURAL MEMORY:\n${parts.join("\n")}` : "";
  }

  isEmpty(): boolean {
    return (
      this.identifiers.size === 0 &&
      this.spatial.length === 0 &&
      this.relations.length === 0 &&
      this.decisions.length === 0 &&
      this.supersessions.length === 0
    );
  }
}

// ── Graph Triple Parser ────────────────────────────────────────────

export interface ParsedTriples {
  entities: Array<{ name: string; attrs: Record<string, string> }>;
  spatial: Array<{ location: string; child: string; attrs: string }>;
  relations: Array<{ entity1: string; type: string; entity2: string }>;
  decisions: Array<{ entity: string; decision: string; outcome: string }>;
  supersessions: Array<{ key: string; oldValue: string; newValue: string }>;
}

export function parseGraphTriples(output: string): ParsedTriples {
  const result: ParsedTriples = {
    entities: [],
    spatial: [],
    relations: [],
    decisions: [],
    supersessions: [],
  };

  for (const line of output.split("\n")) {
    const trimmed = line.trim();

    // ENTITY: Name | attr: value | attr: value
    const entityMatch = trimmed.match(/^ENTITY:\s*(.+)/i);
    if (entityMatch) {
      const parts = entityMatch[1]!.split("|").map((p) => p.trim());
      const name = parts[0] ?? "";
      const attrs: Record<string, string> = {};
      for (const part of parts.slice(1)) {
        const [k, v] = part.split(":").map((s) => s.trim());
        if (k && v) attrs[k] = v;
      }
      result.entities.push({ name, attrs });
    }

    // SPATIAL: Location > Child | attrs
    const spatialMatch = trimmed.match(/^SPATIAL:\s*(.+?)\s*>\s*(.+?)(?:\s*\|\s*(.+))?$/i);
    if (spatialMatch) {
      result.spatial.push({
        location: spatialMatch[1]!.trim(),
        child: spatialMatch[2]!.trim(),
        attrs: spatialMatch[3]?.trim() ?? "",
      });
    }

    // RELATION: Entity1 -- type -- Entity2
    const relationMatch = trimmed.match(/^RELATION:\s*(.+?)\s*--\s*(.+?)\s*--\s*(.+)/i);
    if (relationMatch) {
      result.relations.push({
        entity1: relationMatch[1]!.trim(),
        type: relationMatch[2]!.trim(),
        entity2: relationMatch[3]!.trim(),
      });
    }

    // DECISION: Entity | decision | outcome
    const decisionMatch = trimmed.match(/^DECISION:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*(.+)/i);
    if (decisionMatch) {
      result.decisions.push({
        entity: decisionMatch[1]!.trim(),
        decision: decisionMatch[2]!.trim(),
        outcome: decisionMatch[3]!.trim(),
      });
    }

    // SUPERSEDES: key | new_value | was: old_value
    const supersedesMatch = trimmed.match(/^SUPERSEDES:\s*(.+?)\s*\|\s*(.+?)\s*\|\s*was:\s*(.+)/i);
    if (supersedesMatch) {
      result.supersessions.push({
        key: supersedesMatch[1]!.trim(),
        newValue: supersedesMatch[2]!.trim(),
        oldValue: supersedesMatch[3]!.trim(),
      });
    }
  }

  return result;
}

// ── Graph Extraction Prompt ────────────────────────────────────────

const GRAPH_EXTRACTION_PROMPT = `Extract structural facts from this conversation segment as typed triples. Use EXACTLY these formats (one per line):

ENTITY: Name | attribute: value | attribute: value
SPATIAL: Location > Child | attributes
RELATION: Entity1 -- relationship_type -- Entity2
DECISION: Subject | decision | outcome
SUPERSEDES: attribute_key | new_value | was: old_value

Focus on:
- Phone numbers, IDs, codes (as ENTITY attributes)
- Location assignments, floor plans, spatial containment (as SPATIAL)
- Relationships between people or things (as RELATION)
- Decisions made and their consequences (as DECISION)
- Any corrections or updates to previously stated facts (as SUPERSEDES)

Output ONLY the typed triples. No prose, no explanation.`;

// ── RLM + Shadow Graph Strategy ────────────────────────────────────

class RLMWithSSGStrategy implements ProbeStrategy {
  name = "RLM+SSG";
  private messages: LLMMessage[] = [];
  private delegatedKnowledge: string[] = [];
  private graph = new ShadowGraph();
  private delegateEvery: number;
  private recentWindow: number;
  private totalOverheadTokens = 0;
  private messagesSinceDelegation = 0;

  constructor(delegateEvery = 8, recentWindow = 4) {
    this.delegateEvery = delegateEvery;
    this.recentWindow = recentWindow;
  }

  reset(): void {
    this.messages = [];
    this.delegatedKnowledge = [];
    this.graph = new ShadowGraph();
    this.totalOverheadTokens = 0;
    this.messagesSinceDelegation = 0;
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
    this.messagesSinceDelegation++;
  }

  async getContext() {
    let overheadThisStep = 0;

    if (
      this.messagesSinceDelegation >= this.delegateEvery &&
      this.messages.length > this.recentWindow
    ) {
      const toDelegate = this.messages.slice(0, this.messages.length - this.recentWindow);
      const transcript = buildTranscript(toDelegate);

      const existingKnowledge =
        this.delegatedKnowledge.length > 0
          ? `Previously extracted knowledge:\n${this.delegatedKnowledge.join("\n")}\n\n`
          : "";

      // Standard RLM delegation (call 1)
      const subLLMResult = await chat(
        [
          {
            role: "user",
            content: `${existingKnowledge}New conversation segment:\n${transcript}\n\nYou are a sub-agent processing a conversation segment. Your job is to extract a COMPLETE knowledge state from this conversation. Answer these specific questions:

1. ENTITIES: List every person, place, organization, product, or system mentioned with ALL their attributes (names, numbers, roles, relationships).
2. DECISIONS: What decisions were made? What was chosen and what was rejected?
3. CORRECTIONS: Were any previous facts corrected, updated, or changed? List BOTH the old value and the new value explicitly.
4. NUMBERS: List every specific number, amount, date, time, code, ID, or measurement with its context.
5. CURRENT STATE: What is the current state of affairs as of the end of this segment? Only the latest values.

Be exhaustive. Every specific detail matters. Do NOT generalize.`,
          },
        ],
        "You are a precise sub-agent in a Recursive Language Model system. Your output will be the ONLY record of this conversation segment. If you miss a detail, it is lost forever. Be thorough and exact.",
      );

      overheadThisStep += subLLMResult.inputTokens + subLLMResult.outputTokens;

      // Graph extraction (call 2 — the SSG addition)
      const graphResult = await chat(
        [
          {
            role: "user",
            content: `${transcript}\n\n${GRAPH_EXTRACTION_PROMPT}`,
          },
        ],
        "You extract structured triples from conversation. Output only typed triples in the exact format specified. Be exhaustive.",
      );

      overheadThisStep += graphResult.inputTokens + graphResult.outputTokens;
      this.totalOverheadTokens += overheadThisStep;

      // Parse graph triples and merge into shadow graph
      const triples = parseGraphTriples(graphResult.content);
      for (const e of triples.entities) {
        for (const [attr, value] of Object.entries(e.attrs)) {
          this.graph.addIdentifier(e.name, attr, value);
        }
      }
      for (const s of triples.spatial) {
        this.graph.addSpatial(s.location, s.child, s.attrs);
      }
      for (const r of triples.relations) {
        this.graph.addRelation(r.entity1, r.type, r.entity2);
      }
      for (const d of triples.decisions) {
        this.graph.addDecision(d.entity, d.decision, d.outcome);
      }
      for (const s of triples.supersessions) {
        this.graph.addSupersession(s.key, s.oldValue, s.newValue);
      }

      this.delegatedKnowledge = [subLLMResult.content];
      this.messages = this.messages.slice(-this.recentWindow);
      this.messagesSinceDelegation = 0;
    }

    const messages = [...this.messages];
    const startIdx = messages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? messages.slice(startIdx) : messages;

    // Combine RLM output + graph serialization
    const systemParts: string[] = [];

    // Graph goes first — it has the structural facts RLM drops
    const graphStr = this.graph.serialize();
    if (graphStr) {
      systemParts.push(graphStr);
    }

    if (this.delegatedKnowledge.length > 0) {
      systemParts.push(
        `DELEGATED KNOWLEDGE (processed by sub-agent from earlier conversation):\n${this.delegatedKnowledge.join("\n\n")}`,
      );
    }

    return {
      messages: clean,
      system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
      memoryOverheadTokens: overheadThisStep,
    };
  }
}

// ── Phase 1: Graph extraction test ─────────────────────────────────

interface GraphExtractionTest {
  scenarioName: string;
  graphOutput: string;
  parsedTriples: ParsedTriples;
  zeroRetentionProbes: Probe[];
  capturedProbes: number;
  captureRate: number;
}

async function testGraphExtraction(scenario: Scenario): Promise<GraphExtractionTest> {
  const transcript = scenario.steps.join("\n");
  const probes = scenario.probes ?? [];
  const zeroRetentionTypes: ProbeType[] = ["phone/id", "spatial", "decision"];
  const zeroRetentionProbes = probes.filter((p) => zeroRetentionTypes.includes(p.type));

  console.log(`  Extracting graph for ${scenario.name}...`);
  const result = await chat(
    [{ role: "user", content: `${transcript}\n\n${GRAPH_EXTRACTION_PROMPT}` }],
    "You extract structured triples from conversation. Output only typed triples. Be exhaustive.",
  );

  const triples = parseGraphTriples(result.content);

  // Check which zero-retention probes are captured in the graph output
  let captured = 0;
  for (const probe of zeroRetentionProbes) {
    if (checkProbeRetained(probe, result.content)) {
      captured++;
    }
  }

  return {
    scenarioName: scenario.name,
    graphOutput: result.content,
    parsedTriples: triples,
    zeroRetentionProbes,
    capturedProbes: captured,
    captureRate: zeroRetentionProbes.length > 0 ? captured / zeroRetentionProbes.length : 1,
  };
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("Probe #3: Structural Shadow Graphs (SSG)");
  console.log("Phase 1: Graph extraction test (2 LLM calls)\n");

  // ── Phase 1 ──
  const testScenarios = [
    ALL_SCENARIOS.find((s) => s.name === "Early Fact Recall")!,
    ALL_SCENARIOS.find((s) => s.name === "Rapid-fire Corrections")!,
  ];

  const extractions: GraphExtractionTest[] = [];
  for (const scenario of testScenarios) {
    const result = await testGraphExtraction(scenario);
    extractions.push(result);
  }

  console.log("\n" + "═".repeat(70));
  console.log("  GRAPH EXTRACTION TEST");
  console.log("═".repeat(70));

  for (const e of extractions) {
    console.log(`\n  ${e.scenarioName}`);
    console.log(`    Zero-retention probes: ${e.zeroRetentionProbes.length}`);
    console.log(`    Captured by graph: ${e.capturedProbes}/${e.zeroRetentionProbes.length} (${(e.captureRate * 100).toFixed(0)}%)`);
    console.log(`    Triples: ${e.parsedTriples.entities.length} entities, ${e.parsedTriples.spatial.length} spatial, ${e.parsedTriples.relations.length} relations, ${e.parsedTriples.decisions.length} decisions`);
    console.log(`    Raw output:\n${e.graphOutput.split("\n").map((l) => "      " + l).join("\n")}`);
  }

  const totalZero = extractions.reduce((s, e) => s + e.zeroRetentionProbes.length, 0);
  const totalCaptured = extractions.reduce((s, e) => s + e.capturedProbes, 0);
  const overallCapture = totalZero > 0 ? totalCaptured / totalZero : 1;

  console.log(`\n  Overall capture rate: ${totalCaptured}/${totalZero} (${(overallCapture * 100).toFixed(0)}%)`);
  console.log(`  Phase 1: ${overallCapture >= 0.5 ? "PASSED" : "FAILED"} (threshold: 50%)`);

  if (overallCapture < 0.5) {
    console.log("\n  Kill criteria triggered: Graph extraction misses too many structural probes.");
    const result: FeasibilityResult = {
      proposal: "Shadow Graphs",
      phase1: { passed: false, details: { extractions: extractions.map((e) => ({ ...e, graphOutput: e.graphOutput.slice(0, 500) })) } },
      phase2: { runs: [], retentionByType: {}, comparisonToBaseline: {} },
      killCriteriaMet: true,
      recommendation: "refine",
    };
    await saveResults("shadow-graphs", result);
    return;
  }

  // ── Phase 2 ──
  console.log("\n\nPhase 2: Targeted benchmark (4 runs)\n");

  const REPS = 2;
  const allRuns: ProbeRunResult[] = [];

  for (const scenario of testScenarios) {
    console.log(`\n── ${scenario.name} ──`);
    for (let rep = 0; rep < REPS; rep++) {
      console.log(`  Rep ${rep + 1}/${REPS}...`);
      const strategy = new RLMWithSSGStrategy();
      const result = await runScenarioWithProbes(strategy, scenario);
      result.rep = rep + 1;
      allRuns.push(result);
      console.log(`  → ${result.retainedCount}/${result.totalProbes} probes retained`);
    }
  }

  printRetentionTable(allRuns, "RLM+SSG PROBE RESULTS");

  const byType = aggregateRetentionByType(allRuns);
  console.log(`\n  Focus metrics (vs. 0% RLM baseline):`);
  console.log(`    phone/id:     ${((byType["phone/id"] ?? 0) * 100).toFixed(0)}%`);
  console.log(`    spatial:      ${((byType["spatial"] ?? 0) * 100).toFixed(0)}%`);
  console.log(`    decision:     ${((byType["decision"] ?? 0) * 100).toFixed(0)}%`);
  console.log(`    relationship: ${((byType["relationship"] ?? 0) * 100).toFixed(0)}%`);

  const result: FeasibilityResult = {
    proposal: "Shadow Graphs",
    phase1: { passed: true, details: { captureRate: overallCapture } },
    phase2: {
      runs: allRuns,
      retentionByType: byType,
      comparisonToBaseline: { "RLM phone/id": 0, "RLM spatial": 0, "RLM decision": 0 },
    },
    killCriteriaMet: false,
    recommendation: (byType["phone/id"] ?? 0) > 0.5 || (byType["spatial"] ?? 0) > 0.5 ? "proceed" : "refine",
  };

  await saveResults("shadow-graphs", result);
}

main().catch(console.error);
```

**Step 4: Run tests**

Run: `bun test src/analysis/probe-shadow-graphs.test.ts`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add src/analysis/probe-shadow-graphs.ts src/analysis/probe-shadow-graphs.test.ts
git commit -m "feat: probe #3 — structural shadow graphs with typed triple extraction"
```

**Step 6: Run the probe (~$0.50-1.00)**

Run: `bun src/analysis/probe-shadow-graphs.ts`

---

## Probe #10: Schema-Guided Hybrid Extraction

### Task 6: Build Schema-Guided probe

**Files:**
- Create: `src/analysis/probe-schema-guided.ts`
- Reference: `src/strategies/rlm.ts` (base RLM)
- Reference: `src/analysis/probe-utils.ts`

**Step 1: Write the test for schema parsing**

```typescript
// src/analysis/probe-schema-guided.test.ts
import { test, expect } from "bun:test";
import { parseSchema, type ExtractionSchema } from "./probe-schema-guided";

test("parseSchema: extracts fact types from YAML-like output", () => {
  const output = `fact_types:
  - name: "identifiers"
    description: "Phone numbers, ID codes"
    priority: high
  - name: "corrections"
    description: "Updated facts"
    priority: critical`;

  const schema = parseSchema(output);
  expect(schema.factTypes.length).toBeGreaterThanOrEqual(2);
  expect(schema.factTypes.some((f) => f.name === "identifiers")).toBe(true);
  expect(schema.factTypes.some((f) => f.name === "corrections")).toBe(true);
});

test("parseSchema: handles empty output gracefully", () => {
  const schema = parseSchema("");
  expect(schema.factTypes.length).toBe(0);
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/analysis/probe-schema-guided.test.ts`
Expected: FAIL — module not found

**Step 3: Write the Schema-Guided probe**

```typescript
// src/analysis/probe-schema-guided.ts
import type { LLMMessage } from "../utils/llm";
import { chat } from "../utils/llm";
import type { MemoryStrategy } from "../strategies/base";
import { ALL_SCENARIOS, type Probe, type ProbeType, type Scenario } from "../tasks/scenarios";
import {
  checkProbeRetained,
  buildTranscript,
  runScenarioWithProbes,
  aggregateRetentionByType,
  printRetentionTable,
  saveResults,
  type ProbeRunResult,
  type FeasibilityResult,
  type ProbeStrategy,
} from "./probe-utils";

// ── Schema Types ───────────────────────────────────────────────────

export interface FactTypeSchema {
  name: string;
  description: string;
  extractionGuidance: string;
  outputFormat: string;
  priority: "low" | "medium" | "high" | "critical";
}

export interface ExtractionSchema {
  contextHint: string;
  factTypes: FactTypeSchema[];
  validationRules: string[];
}

// ── Schema Parser ──────────────────────────────────────────────────

export function parseSchema(output: string): ExtractionSchema {
  const schema: ExtractionSchema = {
    contextHint: "",
    factTypes: [],
    validationRules: [],
  };

  // Extract context hint
  const contextMatch = output.match(/context_hint:\s*"?([^"\n]+)"?/);
  if (contextMatch) schema.contextHint = contextMatch[1]!.trim();

  // Extract fact types — look for name/description/priority blocks
  const factTypeBlocks = output.split(/\n\s*-\s*name:\s*/).slice(1);
  for (const block of factTypeBlocks) {
    const nameMatch = block.match(/^"?([^"\n]+)"?/);
    const descMatch = block.match(/description:\s*"?([^"\n]+)"?/);
    const guidanceMatch = block.match(/extraction_guidance:\s*"?([^"\n]+)"?/);
    const formatMatch = block.match(/output_format:\s*"?([^"\n]+)"?/);
    const priorityMatch = block.match(/priority:\s*"?(low|medium|high|critical)"?/);

    if (nameMatch) {
      schema.factTypes.push({
        name: nameMatch[1]!.trim(),
        description: descMatch ? descMatch[1]!.trim() : "",
        extractionGuidance: guidanceMatch ? guidanceMatch[1]!.trim() : "",
        outputFormat: formatMatch ? formatMatch[1]!.trim() : "",
        priority: (priorityMatch ? priorityMatch[1]!.trim() : "medium") as FactTypeSchema["priority"],
      });
    }
  }

  // Extract validation rules
  const rulesSection = output.match(/validation_rules:\s*\n((?:\s*-\s*.+\n?)+)/);
  if (rulesSection) {
    schema.validationRules = rulesSection[1]!
      .split("\n")
      .map((l) => l.replace(/^\s*-\s*/, "").replace(/^"/, "").replace(/"$/, "").trim())
      .filter(Boolean);
  }

  return schema;
}

// ── Schema Generation Prompt ───────────────────────────────────────

const SCHEMA_GENERATION_PROMPT = `Given these conversation messages, generate a fact extraction schema in YAML-like format.

Analyze what types of information appear in this conversation and create a schema optimized for extracting them.

Output format:
context_hint: "brief description of conversation type"

fact_types:
  - name: "type_name"
    description: "what this type captures"
    extraction_guidance: "how to find and extract facts of this type"
    output_format: "the exact format to output extracted facts"
    priority: high|medium|low|critical

validation_rules:
  - "rule 1"
  - "rule 2"

Be specific to THIS conversation. If you see phone numbers, create a type for them. If you see corrections, create a type for them. Include 4-8 fact types.`;

// ── Schema-Guided Extraction Strategy ──────────────────────────────

class SchemaGuidedStrategy implements ProbeStrategy {
  name = "SGHE";
  private messages: LLMMessage[] = [];
  private schema: ExtractionSchema | null = null;
  private delegatedKnowledge: string[] = [];
  private delegateEvery: number;
  private recentWindow: number;
  private totalOverheadTokens = 0;
  private messagesSinceDelegation = 0;
  private schemaGenerated = false;

  constructor(delegateEvery = 8, recentWindow = 4) {
    this.delegateEvery = delegateEvery;
    this.recentWindow = recentWindow;
  }

  reset(): void {
    this.messages = [];
    this.schema = null;
    this.delegatedKnowledge = [];
    this.totalOverheadTokens = 0;
    this.messagesSinceDelegation = 0;
    this.schemaGenerated = false;
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
    this.messagesSinceDelegation++;
  }

  private async generateSchema(messages: LLMMessage[]): Promise<ExtractionSchema> {
    const preview = messages.slice(0, 5);
    const transcript = buildTranscript(preview);

    const result = await chat(
      [{ role: "user", content: `${transcript}\n\n${SCHEMA_GENERATION_PROMPT}` }],
      "You generate extraction schemas for conversation analysis. Output clean YAML-like format.",
    );

    this.totalOverheadTokens += result.inputTokens + result.outputTokens;
    return parseSchema(result.content);
  }

  private buildSchemaGuidedPrompt(schema: ExtractionSchema): string {
    const sections = schema.factTypes
      .sort((a, b) => {
        const order = { critical: 0, high: 1, medium: 2, low: 3 };
        return order[a.priority] - order[b.priority];
      })
      .map((ft, i) =>
        `${i + 1}. ${ft.name.toUpperCase()}: ${ft.description}\n   Guidance: ${ft.extractionGuidance}\n   Format: ${ft.outputFormat}`,
      )
      .join("\n");

    const rules = schema.validationRules.length > 0
      ? `\n\nVALIDATION RULES:\n${schema.validationRules.map((r) => `- ${r}`).join("\n")}`
      : "";

    return `You are a sub-agent processing a conversation segment. Extract a COMPLETE knowledge state using this schema (${schema.contextHint}):

${sections}${rules}

Be exhaustive. Every specific detail matters. Do NOT generalize.`;
  }

  async getContext() {
    let overheadThisStep = 0;

    // Generate schema on first compression cycle
    if (!this.schemaGenerated && this.messages.length >= 5) {
      this.schema = await this.generateSchema(this.messages);
      this.schemaGenerated = true;
      console.log(`    [SGHE] Schema generated: ${this.schema.factTypes.length} fact types`);
    }

    if (
      this.messagesSinceDelegation >= this.delegateEvery &&
      this.messages.length > this.recentWindow
    ) {
      const toDelegate = this.messages.slice(0, this.messages.length - this.recentWindow);
      const transcript = buildTranscript(toDelegate);

      const existingKnowledge =
        this.delegatedKnowledge.length > 0
          ? `Previously extracted knowledge:\n${this.delegatedKnowledge.join("\n")}\n\n`
          : "";

      const prompt = this.schema
        ? this.buildSchemaGuidedPrompt(this.schema)
        : // Fallback to standard RLM if no schema yet
          `You are a sub-agent processing a conversation segment. Extract a COMPLETE knowledge state. Answer:
1. ENTITIES: Every person, place, org with attributes.
2. DECISIONS: What was decided?
3. CORRECTIONS: Old value → new value for every change.
4. NUMBERS: Every number, date, code, ID.
5. CURRENT STATE: Latest values only.
Be exhaustive.`;

      const subLLMResult = await chat(
        [{ role: "user", content: `${existingKnowledge}New conversation segment:\n${transcript}\n\n${prompt}` }],
        "You are a precise sub-agent. Your output will be the ONLY record. If you miss a detail, it is lost forever.",
      );

      overheadThisStep = subLLMResult.inputTokens + subLLMResult.outputTokens;
      this.totalOverheadTokens += overheadThisStep;
      this.delegatedKnowledge = [subLLMResult.content];
      this.messages = this.messages.slice(-this.recentWindow);
      this.messagesSinceDelegation = 0;
    }

    const messages = [...this.messages];
    const startIdx = messages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? messages.slice(startIdx) : messages;

    const systemParts: string[] = [];
    if (this.delegatedKnowledge.length > 0) {
      systemParts.push(
        `DELEGATED KNOWLEDGE (extracted from earlier conversation):\n${this.delegatedKnowledge.join("\n\n")}`,
      );
    }

    return {
      messages: clean,
      system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
      memoryOverheadTokens: overheadThisStep,
    };
  }
}

// ── Phase 1: Schema coverage test ──────────────────────────────────

interface SchemaCoverageTest {
  scenarioName: string;
  schema: ExtractionSchema;
  probeTypes: Set<string>;
  schemaCoveredTypes: Set<string>;
  coverageRate: number;
}

async function testSchemaCoverage(scenario: Scenario): Promise<SchemaCoverageTest> {
  const probes = scenario.probes ?? [];
  const probeTypes = new Set(probes.map((p) => p.type));

  console.log(`  Generating schema for ${scenario.name}...`);
  const preview = scenario.steps.slice(0, 5).map((s, i) => ({
    role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
    content: s,
  }));

  const transcript = buildTranscript(preview);
  const result = await chat(
    [{ role: "user", content: `${transcript}\n\n${SCHEMA_GENERATION_PROMPT}` }],
    "You generate extraction schemas. Output clean YAML-like format.",
  );

  const schema = parseSchema(result.content);

  // Map schema fact_type names to probe types
  const typeMapping: Record<string, ProbeType[]> = {
    identifiers: ["phone/id"],
    "phone/id": ["phone/id"],
    phones: ["phone/id"],
    ids: ["phone/id"],
    codes: ["phone/id"],
    corrections: ["correction"],
    updates: ["correction"],
    changes: ["correction"],
    entities: ["entity"],
    people: ["entity"],
    organizations: ["entity"],
    quantities: ["quantity"],
    numbers: ["quantity"],
    amounts: ["quantity"],
    dates: ["date"],
    times: ["date"],
    deadlines: ["date"],
    spatial: ["spatial"],
    locations: ["spatial"],
    decisions: ["decision"],
    relationships: ["relationship"],
  };

  const schemaCoveredTypes = new Set<string>();
  for (const ft of schema.factTypes) {
    const mapped = typeMapping[ft.name.toLowerCase()];
    if (mapped) {
      for (const t of mapped) schemaCoveredTypes.add(t);
    }
    // Also check description for type keywords
    for (const [keyword, types] of Object.entries(typeMapping)) {
      if (ft.description.toLowerCase().includes(keyword) || ft.name.toLowerCase().includes(keyword)) {
        for (const t of types) schemaCoveredTypes.add(t);
      }
    }
  }

  const covered = [...probeTypes].filter((t) => schemaCoveredTypes.has(t)).length;
  const coverageRate = probeTypes.size > 0 ? covered / probeTypes.size : 1;

  return { scenarioName: scenario.name, schema, probeTypes, schemaCoveredTypes, coverageRate };
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("Probe #10: Schema-Guided Hybrid Extraction (SGHE)");
  console.log("Phase 1: Schema coverage test (2 LLM calls)\n");

  // ── Phase 1 ──
  const testScenarios = [
    ALL_SCENARIOS.find((s) => s.name === "Early Fact Recall")!,
    ALL_SCENARIOS.find((s) => s.name === "Cascading Corrections")!,
  ];

  const coverageTests: SchemaCoverageTest[] = [];
  for (const scenario of testScenarios) {
    const result = await testSchemaCoverage(scenario);
    coverageTests.push(result);
  }

  console.log("\n" + "═".repeat(70));
  console.log("  SCHEMA COVERAGE TEST");
  console.log("═".repeat(70));

  for (const ct of coverageTests) {
    console.log(`\n  ${ct.scenarioName}`);
    console.log(`    Probe types present: ${[...ct.probeTypes].join(", ")}`);
    console.log(`    Schema covers: ${[...ct.schemaCoveredTypes].join(", ")}`);
    console.log(`    Coverage: ${(ct.coverageRate * 100).toFixed(0)}%`);
    console.log(`    Schema fact types:`);
    for (const ft of ct.schema.factTypes) {
      console.log(`      [${ft.priority}] ${ft.name}: ${ft.description}`);
    }
  }

  const avgCoverage = coverageTests.reduce((s, ct) => s + ct.coverageRate, 0) / coverageTests.length;
  console.log(`\n  Average coverage: ${(avgCoverage * 100).toFixed(0)}%`);
  console.log(`  Phase 1: ${avgCoverage >= 0.7 ? "PASSED" : "FAILED"} (threshold: 70%)`);

  if (avgCoverage < 0.7) {
    console.log("\n  Schema generation misses too many probe types.");
    const result: FeasibilityResult = {
      proposal: "Schema-Guided Hybrid",
      phase1: { passed: false, details: { coverageTests: coverageTests.map((ct) => ({ ...ct, schema: ct.schema })) } },
      phase2: { runs: [], retentionByType: {}, comparisonToBaseline: {} },
      killCriteriaMet: true,
      recommendation: "refine",
    };
    await saveResults("schema-guided", result);
    return;
  }

  // ── Phase 2 ──
  console.log("\n\nPhase 2: Targeted benchmark (4 runs)\n");

  const benchmarkScenarios = [
    ALL_SCENARIOS.find((s) => s.name === "Early Fact Recall")!,
    ALL_SCENARIOS.find((s) => s.name === "Long Horizon + Noise")!,
  ];

  const REPS = 2;
  const allRuns: ProbeRunResult[] = [];

  for (const scenario of benchmarkScenarios) {
    console.log(`\n── ${scenario.name} ──`);
    for (let rep = 0; rep < REPS; rep++) {
      console.log(`  Rep ${rep + 1}/${REPS}...`);
      const strategy = new SchemaGuidedStrategy();
      const result = await runScenarioWithProbes(strategy, scenario);
      result.rep = rep + 1;
      allRuns.push(result);
      console.log(`  → ${result.retainedCount}/${result.totalProbes} probes retained`);
    }
  }

  printRetentionTable(allRuns, "SGHE PROBE RESULTS");

  const byType = aggregateRetentionByType(allRuns);
  const overall = allRuns.reduce((s, r) => s + r.retainedCount, 0) /
    allRuns.reduce((s, r) => s + r.totalProbes, 0);

  console.log(`\n  Comparison:`);
  console.log(`    RLM baseline: 59.7%`);
  console.log(`    SGHE:         ${(overall * 100).toFixed(1)}%`);
  console.log(`    Delta:        ${((overall - 0.597) * 100).toFixed(1)}pp`);

  const killMet = overall - 0.597 < 0.10;
  console.log(`  Kill criteria (<10pp improvement): ${killMet ? "TRIGGERED" : "PASSED"}`);

  const result: FeasibilityResult = {
    proposal: "Schema-Guided Hybrid",
    phase1: { passed: true, details: { avgCoverage } },
    phase2: {
      runs: allRuns,
      retentionByType: byType,
      comparisonToBaseline: { "RLM baseline": 0.597, "SGHE": overall },
    },
    killCriteriaMet: killMet,
    recommendation: !killMet ? "proceed" : "refine",
  };

  await saveResults("schema-guided", result);
}

main().catch(console.error);
```

**Step 4: Run tests**

Run: `bun test src/analysis/probe-schema-guided.test.ts`
Expected: Both tests PASS

**Step 5: Commit**

```bash
git add src/analysis/probe-schema-guided.ts src/analysis/probe-schema-guided.test.ts
git commit -m "feat: probe #10 — schema-guided hybrid extraction"
```

**Step 6: Run the probe (~$0.50-1.00)**

Run: `bun src/analysis/probe-schema-guided.ts`

---

## Task 7: Run all probes and collect results

**Step 1: Run probes in execution order**

```bash
# 1. Correction Format Engineering (14 runs, ~$1.00-1.50)
bun src/analysis/probe-correction-fmt.ts

# 2. DA-RLM (Phase 1 free, Phase 2 4 runs if Phase 1 passes)
bun src/analysis/probe-da-rlm.ts

# 3. Stability-Plasticity (Phase 1 free, Phase 2 4 runs if Phase 1 passes)
bun src/analysis/probe-stability.ts

# 4. Shadow Graphs (2 Phase 1 calls + 4 Phase 2 runs)
bun src/analysis/probe-shadow-graphs.ts

# 5. Schema-Guided (2 Phase 1 calls + 4 Phase 2 runs)
bun src/analysis/probe-schema-guided.ts
```

**Step 2: Verify results were saved**

Run: `ls -la results/probe-*.json`
Expected: 5 JSON files with probe results.

**Step 3: Commit results**

```bash
git add results/probe-*.json
git commit -m "data: feasibility probe results for top 5 proposals"
```
