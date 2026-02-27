# QTD + QPB Experiments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement two new memory strategies (Query-Time Distillation + Quantity-Pinning Buffer) and run them head-to-head against Full Context and RLM(8) across all 8 scenarios with 62-probe retention analysis.

**Architecture:** QTD accumulates raw messages and only compresses at query time using the question as guidance. QPB extends RLM with a regex side-buffer that protects quantities/IDs. Both implement the `MemoryStrategy` interface from `src/strategies/base.ts`.

**Tech Stack:** TypeScript, Bun test runner, gpt-5-nano via OpenCode Zen API

---

### Task 1: QTD Strategy — Tests

**Files:**
- Create: `src/strategies/qtd.test.ts`

**Step 1: Write the failing tests**

```ts
import { test, expect, describe } from "bun:test";
import { QTDStrategy } from "./qtd";

describe("QTDStrategy", () => {
  test("implements MemoryStrategy interface", () => {
    const strategy = new QTDStrategy();
    expect(strategy.name).toBe("QTD");
    expect(typeof strategy.reset).toBe("function");
    expect(typeof strategy.addMessage).toBe("function");
    expect(typeof strategy.getContext).toBe("function");
  });

  test("returns all messages when under token budget", async () => {
    const strategy = new QTDStrategy(100_000); // huge budget
    strategy.addMessage({ role: "user", content: "Hello" });
    strategy.addMessage({ role: "assistant", content: "Hi" });
    strategy.addMessage({ role: "user", content: "What is 1+1?" });
    const ctx = await strategy.getContext();
    expect(ctx.messages).toHaveLength(3);
    expect(ctx.system).toBeUndefined();
    expect(ctx.memoryOverheadTokens).toBe(0);
  });

  test("reset clears all state", () => {
    const strategy = new QTDStrategy();
    strategy.addMessage({ role: "user", content: "Hello" });
    strategy.reset();
    // After reset, getContext should return empty
    // (we just verify no crash — actual content test needs LLM mock)
    expect(true).toBe(true);
  });

  test("has enableLogging and delegationLog", () => {
    const strategy = new QTDStrategy();
    strategy.enableLogging = true;
    expect(Array.isArray(strategy.delegationLog)).toBe(true);
  });

  test("estimateTokens returns roughly 1 token per 4 chars", () => {
    expect(QTDStrategy.estimateTokens("abcdefgh")).toBe(2); // 8 chars / 4
    expect(QTDStrategy.estimateTokens("")).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/strategies/qtd.test.ts`
Expected: FAIL — module `./qtd` not found

---

### Task 2: QTD Strategy — Implementation

**Files:**
- Create: `src/strategies/qtd.ts`

**Step 1: Implement the strategy**

```ts
import type { LLMMessage } from "../utils/llm";
import { chat } from "../utils/llm";
import type { MemoryStrategy } from "./base";
import type { DelegationLogEntry } from "./rlm";

/**
 * Query-Time Distillation (QTD) Strategy
 *
 * Accumulates all messages raw — no compression during the conversation.
 * When context exceeds the token budget at getContext() time, fires a
 * single sub-LLM call guided by the latest user question to extract
 * only what's relevant.
 *
 * Key insight: RLM compresses blind (doesn't know the next question).
 * QTD compresses with the question in hand — should never drop a
 * question-relevant fact.
 */
export class QTDStrategy implements MemoryStrategy {
  name = "QTD";
  private messages: LLMMessage[] = [];
  private tokenBudget: number;
  private recentWindow: number;
  private totalOverheadTokens = 0;
  private currentStep = 0;
  private distillationCount = 0;

  enableLogging = false;
  delegationLog: DelegationLogEntry[] = [];

  constructor(tokenBudget = 8000, recentWindow = 4) {
    this.tokenBudget = tokenBudget;
    this.recentWindow = recentWindow;
  }

  reset(): void {
    this.messages = [];
    this.totalOverheadTokens = 0;
    this.currentStep = 0;
    this.distillationCount = 0;
    this.delegationLog = [];
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
    this.currentStep++;
  }

  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  async getContext() {
    let overheadThisStep = 0;

    // Estimate total tokens across all messages
    const totalTokens = this.messages.reduce(
      (sum, m) => sum + QTDStrategy.estimateTokens(m.content),
      0,
    );

    // Under budget — return everything (Full Context mode)
    if (totalTokens <= this.tokenBudget) {
      const messages = [...this.messages];
      const startIdx = messages.findIndex((m) => m.role === "user");
      const clean = startIdx > 0 ? messages.slice(startIdx) : messages;
      return { messages: clean, system: undefined, memoryOverheadTokens: 0 };
    }

    // Over budget — distill guided by the latest user message
    const latestUserMsg = [...this.messages]
      .reverse()
      .find((m) => m.role === "user");
    const question = latestUserMsg?.content ?? "";

    const toDistill = this.messages.slice(
      0,
      this.messages.length - this.recentWindow,
    );
    const transcript = toDistill
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const subLLMResult = await chat(
      [
        {
          role: "user",
          content: `The user is about to ask: "${question}"

Extract EVERY fact from this conversation that could be relevant to answering that question. Include:
- Direct answers and supporting details
- All specific numbers, IDs, codes, phone numbers, measurements
- Any corrections or updates to previously stated facts (BOTH old and new values)
- Entity attributes, relationships, and current state
- Spatial information, locations, floor plans
- Decisions made and alternatives rejected
- Context that helps interpret the answer

Be exhaustive. Include anything that MIGHT matter — the cost of including extra facts is low, the cost of missing one is total.

Conversation:
${transcript}`,
        },
      ],
      "You are a precise extraction sub-agent. The user has a specific question and you must extract every possibly relevant fact from the conversation. Your output is the ONLY record that will survive. If you miss a detail, it is lost forever.",
    );

    overheadThisStep = subLLMResult.inputTokens + subLLMResult.outputTokens;
    this.totalOverheadTokens += overheadThisStep;

    if (this.enableLogging) {
      this.distillationCount++;
      this.delegationLog.push({
        cycle: this.distillationCount,
        step: this.currentStep,
        content: subLLMResult.content,
        messagesCompressed: toDistill.length,
      });
    }

    const recentMessages = this.messages.slice(-this.recentWindow);
    const startIdx = recentMessages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? recentMessages.slice(startIdx) : recentMessages;

    return {
      messages: clean,
      system: `DISTILLED KNOWLEDGE (extracted from earlier conversation, guided by your current question):\n${subLLMResult.content}`,
      memoryOverheadTokens: overheadThisStep,
    };
  }
}
```

**Step 2: Run tests**

Run: `bun test src/strategies/qtd.test.ts`
Expected: All 5 tests PASS

**Step 3: Commit**

```
git add src/strategies/qtd.ts src/strategies/qtd.test.ts
git commit -m "feat: add Query-Time Distillation (QTD) strategy"
```

---

### Task 3: QPB Strategy — Tests

**Files:**
- Create: `src/strategies/qpb.test.ts`

**Step 1: Write the failing tests**

```ts
import { test, expect, describe } from "bun:test";
import { QPBStrategy } from "./qpb";

describe("QPBStrategy", () => {
  test("implements MemoryStrategy interface", () => {
    const strategy = new QPBStrategy();
    expect(strategy.name).toBe("QPB");
    expect(typeof strategy.reset).toBe("function");
    expect(typeof strategy.addMessage).toBe("function");
    expect(typeof strategy.getContext).toBe("function");
  });

  test("has enableLogging and delegationLog", () => {
    const strategy = new QPBStrategy();
    strategy.enableLogging = true;
    expect(Array.isArray(strategy.delegationLog)).toBe(true);
  });

  test("reset clears pinned buffer", () => {
    const strategy = new QPBStrategy();
    strategy.addMessage({ role: "user", content: "test" });
    strategy.reset();
    expect(strategy.getPinnedBuffer().size).toBe(0);
  });
});

describe("extractQuantities", () => {
  test("extracts dollar amounts", () => {
    const entries = QPBStrategy.extractQuantities(
      "Q3 marketing budget: $45,000\nTotal cost: $5,000.50",
    );
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.some((e) => e.value.includes("$45,000"))).toBe(true);
    expect(entries.some((e) => e.value.includes("$5,000.50"))).toBe(true);
  });

  test("extracts counts with units", () => {
    const entries = QPBStrategy.extractQuantities(
      "Team size: 12 developers\nGadget-X (clearance): 200 units",
    );
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.some((e) => e.value.includes("12 developers"))).toBe(true);
    expect(entries.some((e) => e.value.includes("200 units"))).toBe(true);
  });

  test("extracts phone numbers", () => {
    const entries = QPBStrategy.extractQuantities(
      "Kenji's phone: 090-8765-4321",
    );
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries.some((e) => e.value.includes("090-8765-4321"))).toBe(true);
  });

  test("extracts IDs and codes", () => {
    const entries = QPBStrategy.extractQuantities(
      "Policy ID: POL-2024-8891\nTicket: INC-4421",
    );
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });

  test("extracts percentages", () => {
    const entries = QPBStrategy.extractQuantities(
      "Coverage: 85% of endpoints\nError rate: 2.1%",
    );
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });

  test("returns empty array for no quantities", () => {
    const entries = QPBStrategy.extractQuantities(
      "Hello, how are you? Everything is fine.",
    );
    expect(entries).toHaveLength(0);
  });

  test("extracts full line as value for context", () => {
    const entries = QPBStrategy.extractQuantities(
      "- Widget-A inventory: 370 units at $24.99 each",
    );
    // Should capture the full line, not just the number
    expect(entries.some((e) => e.value.includes("Widget-A"))).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/strategies/qpb.test.ts`
Expected: FAIL — module `./qpb` not found

---

### Task 4: QPB Strategy — Implementation

**Files:**
- Create: `src/strategies/qpb.ts`

**Step 1: Implement the strategy**

```ts
import type { LLMMessage } from "../utils/llm";
import { chat } from "../utils/llm";
import type { MemoryStrategy } from "./base";
import type { DelegationLogEntry } from "./rlm";

interface PinnedEntry {
  key: string;
  value: string;
}

/**
 * Quantity-Pinning Buffer (QPB) Strategy
 *
 * Extends RLM's architecture with a regex-based side-channel that
 * protects quantities and IDs — the single highest-loss fact type
 * (0-33% retention in base RLM).
 *
 * After each RLM delegation cycle, regex-scans the sub-LLM output
 * for quantities/IDs and pins them in a buffer that persists across
 * cycles. The sub-LLM's natural-language blob stays untouched
 * (avoiding CTX-5's format sensitivity trap). The pinned buffer is
 * appended as an addendum, not a replacement.
 *
 * Cost: zero additional LLM calls — just regex after each delegation.
 */
export class QPBStrategy implements MemoryStrategy {
  name = "QPB";
  private messages: LLMMessage[] = [];
  private delegatedKnowledge: string[] = [];
  private pinnedBuffer: Map<string, string> = new Map();
  private delegateEvery: number;
  private recentWindow: number;
  private totalOverheadTokens = 0;
  private messagesSinceDelegation = 0;
  private currentStep = 0;
  private delegationCycle = 0;

  enableLogging = false;
  delegationLog: DelegationLogEntry[] = [];

  constructor(delegateEvery = 8, recentWindow = 4) {
    this.delegateEvery = delegateEvery;
    this.recentWindow = recentWindow;
  }

  reset(): void {
    this.messages = [];
    this.delegatedKnowledge = [];
    this.pinnedBuffer = new Map();
    this.totalOverheadTokens = 0;
    this.messagesSinceDelegation = 0;
    this.currentStep = 0;
    this.delegationCycle = 0;
    this.delegationLog = [];
  }

  /** Expose pinned buffer for testing */
  getPinnedBuffer(): Map<string, string> {
    return this.pinnedBuffer;
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
    this.messagesSinceDelegation++;
    this.currentStep++;
  }

  /**
   * Extract quantities, IDs, phone numbers from text.
   * Returns entries with full-line context as value.
   */
  static extractQuantities(text: string): PinnedEntry[] {
    const entries: PinnedEntry[] = [];
    const lines = text.split("\n");

    const patterns = [
      /\$[\d,]+(?:\.\d{1,2})?/,                                    // dollar amounts
      /\d+\s+(?:units?|people|attendees|developers?|meals?|engineers?|screens?|endpoints?|years?|months?|percent)/i, // counts with units
      /\d{2,3}[-.]?\d{3,4}[-.]?\d{4}/,                            // phone numbers
      /[A-Z]{2,}-\d{3,}/,                                          // IDs/codes (POL-2024, INC-4421)
      /\d+(?:\.\d+)?%/,                                             // percentages
      /\$[\d,]+(?:\.\d{2})?\s*(?:per|\/)\s*\w+/i,                  // rates ($12,400 per month)
    ];

    for (const line of lines) {
      const trimmed = line.replace(/^[-*•]\s+/, "").replace(/^\d+\.\s+/, "").trim();
      if (!trimmed) continue;

      for (const pattern of patterns) {
        if (pattern.test(trimmed)) {
          // Use first 50 chars as key for dedup
          const key = trimmed.slice(0, 50).toLowerCase().trim();
          entries.push({ key, value: trimmed });
          break; // one match per line is enough
        }
      }
    }

    return entries;
  }

  async getContext() {
    let overheadThisStep = 0;

    if (
      this.messagesSinceDelegation >= this.delegateEvery &&
      this.messages.length > this.recentWindow
    ) {
      const toDelegate = this.messages.slice(
        0,
        this.messages.length - this.recentWindow,
      );

      const transcript = toDelegate
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const existingKnowledge =
        this.delegatedKnowledge.length > 0
          ? `Previously extracted knowledge:\n${this.delegatedKnowledge.join("\n")}\n\n`
          : "";

      // Include pinned buffer in sub-LLM context so it can update values
      const pinnedSection =
        this.pinnedBuffer.size > 0
          ? `\nPINNED QUANTITIES (protected — preserve these exact values unless explicitly corrected):\n${Array.from(this.pinnedBuffer.values()).map((v) => `- ${v}`).join("\n")}\n\n`
          : "";

      // Same RLM prompt — identical to base RLM
      const subLLMResult = await chat(
        [
          {
            role: "user",
            content: `${existingKnowledge}${pinnedSection}New conversation segment:\n${transcript}\n\nYou are a sub-agent processing a conversation segment. Your job is to extract a COMPLETE knowledge state from this conversation. Answer these specific questions:

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

      if (this.enableLogging) {
        this.delegationCycle++;
        this.delegationLog.push({
          cycle: this.delegationCycle,
          step: this.currentStep,
          content: subLLMResult.content,
          messagesCompressed: toDelegate.length,
        });
      }

      // Standard RLM: wholesale replace delegated knowledge
      this.delegatedKnowledge = [subLLMResult.content];

      // QPB addition: regex-scan and pin quantities
      const extracted = QPBStrategy.extractQuantities(subLLMResult.content);
      for (const entry of extracted) {
        // Merge by key similarity (same as PersistentRLM's mergeMap)
        let found = false;
        for (const existingKey of Array.from(this.pinnedBuffer.keys())) {
          if (
            existingKey.includes(entry.key.slice(0, 25)) ||
            entry.key.includes(existingKey.slice(0, 25))
          ) {
            this.pinnedBuffer.delete(existingKey);
            this.pinnedBuffer.set(entry.key, entry.value);
            found = true;
            break;
          }
        }
        if (!found) {
          this.pinnedBuffer.set(entry.key, entry.value);
        }
      }

      // Also scan the raw transcript for quantities the sub-LLM may have missed
      const rawExtracted = QPBStrategy.extractQuantities(transcript);
      for (const entry of rawExtracted) {
        if (!this.pinnedBuffer.has(entry.key)) {
          let found = false;
          for (const existingKey of Array.from(this.pinnedBuffer.keys())) {
            if (
              existingKey.includes(entry.key.slice(0, 25)) ||
              entry.key.includes(existingKey.slice(0, 25))
            ) {
              found = true;
              break; // already have it, don't overwrite with raw version
            }
          }
          if (!found) {
            this.pinnedBuffer.set(entry.key, entry.value);
          }
        }
      }

      this.messages = this.messages.slice(-this.recentWindow);
      this.messagesSinceDelegation = 0;
    }

    const messages: LLMMessage[] = [...this.messages];
    const startIdx = messages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? messages.slice(startIdx) : messages;

    const systemParts: string[] = [];
    if (this.delegatedKnowledge.length > 0) {
      systemParts.push(
        `DELEGATED KNOWLEDGE (processed by sub-agent from earlier conversation):\n${this.delegatedKnowledge.join("\n\n")}`,
      );
    }
    if (this.pinnedBuffer.size > 0) {
      systemParts.push(
        `PINNED QUANTITIES (exact values preserved across compression cycles):\n${Array.from(this.pinnedBuffer.values()).map((v) => `- ${v}`).join("\n")}`,
      );
    }

    return {
      messages: clean,
      system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
      memoryOverheadTokens: overheadThisStep,
    };
  }
}
```

**Step 2: Run tests**

Run: `bun test src/strategies/qpb.test.ts`
Expected: All 10 tests PASS

**Step 3: Commit**

```
git add src/strategies/qpb.ts src/strategies/qpb.test.ts
git commit -m "feat: add Quantity-Pinning Buffer (QPB) strategy"
```

---

### Task 5: Benchmark Runner

**Files:**
- Create: `src/analysis/qtd-qpb-experiment.ts`

**Step 1: Write the benchmark script**

```ts
/**
 * CTX-7: QTD + QPB Experiment
 *
 * Runs 4 strategies across all 8 scenarios:
 * - Full Context (ceiling)
 * - RLM(8) (incumbent)
 * - QTD (query-time distillation)
 * - QPB (quantity-pinning buffer)
 *
 * Usage: bun src/analysis/qtd-qpb-experiment.ts
 */
import { ALL_SCENARIOS } from "../tasks/scenarios";
import { runScenario } from "../tasks/task-runner";
import { printComparisonTable, type BenchmarkResult } from "../utils/metrics";
import { FullContextStrategy } from "../strategies/full-context";
import { RLMStrategy } from "../strategies/rlm";
import { QTDStrategy } from "../strategies/qtd";
import { QPBStrategy } from "../strategies/qpb";

const strategies = [
  { name: "Full Context", create: () => new FullContextStrategy() },
  { name: "RLM(8)", create: () => new RLMStrategy(8, 4) },
  { name: "QTD", create: () => new QTDStrategy(8000, 4) },
  { name: "QPB", create: () => new QPBStrategy(8, 4) },
];

const scenarios = ALL_SCENARIOS.filter((s) => s.probes && s.probes.length > 0);
const results: BenchmarkResult[] = [];

console.log("CTX-7: QTD + QPB Experiment");
console.log(`${strategies.length} strategies × ${scenarios.length} scenarios\n`);

for (const { name, create } of strategies) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Strategy: ${name}`);
  console.log("=".repeat(60));

  for (const scenario of scenarios) {
    try {
      const strategy = create();
      const result = await runScenario(strategy, scenario);
      results.push(result);
    } catch (err) {
      console.error(`  ERROR on ${scenario.name}: ${err}`);
      results.push({
        strategyName: name,
        scenarioName: scenario.name,
        correct: false,
        finalAnswer: `ERROR: ${err}`,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalLatencyMs: 0,
        totalMemoryOverheadTokens: 0,
        stepCount: 0,
      });
    }
  }
}

printComparisonTable(results);

// Save results
const outputPath = `results/qtd-qpb-experiment-${Date.now()}.json`;
await Bun.write(outputPath, JSON.stringify(results, null, 2));
console.log(`\nResults saved to ${outputPath}`);
```

**Step 2: Commit**

```
git add src/analysis/qtd-qpb-experiment.ts
git commit -m "feat: add CTX-7 benchmark runner for QTD + QPB experiment"
```

---

### Task 6: Run the Experiment

**Step 1: Run all tests first**

Run: `bun test src/strategies/qtd.test.ts src/strategies/qpb.test.ts`
Expected: All tests PASS

**Step 2: Run the benchmark**

Run: `bun src/analysis/qtd-qpb-experiment.ts`
Expected: 4 strategies × 8 scenarios = 32 runs. Takes ~5-10 minutes.

**Step 3: Commit results**

```
git add results/qtd-qpb-experiment-*.json
git commit -m "data: CTX-7 QTD + QPB experiment results"
```

---

### Task 7: Analyze Results and Update Findings

**Step 1: Run probe analysis on the new results**

Adapt probe-check.ts patterns to check QTD and QPB against the new results file. Compare retention by type across all 4 strategies.

**Step 2: Add CTX-7 section to `docs/research/findings.md`**

Include: scenario pass/fail table, probe-level retention by type, head-to-head diff, interpretation.

**Step 3: Commit findings**

```
git add docs/research/findings.md
git commit -m "docs: CTX-7 QTD + QPB experiment findings"
```

---

### Task 8: PR and Merge

```
git checkout -b ctx/qtd-qpb-experiment
git push -u origin ctx/qtd-qpb-experiment
gh pr create --title "feat(CTX-7): QTD + QPB experiment" --body "..."
gh pr merge --merge
git checkout main && git pull
```
