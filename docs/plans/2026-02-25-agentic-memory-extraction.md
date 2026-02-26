# Agentic Memory Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an RLLMStrategy that lets the LLM program its own memory extraction, then analyze the code it writes, reverse-engineer its best patterns, and benchmark everything head-to-head.

**Architecture:** Three sequential experiments (CTX-3 → CTX-4 → CTX-5). CTX-3 wraps the `rllm` package as a `MemoryStrategy`, running it across all 8 scenarios with probe + code logging. CTX-4 analyzes the captured JavaScript code offline. CTX-5 turns the best patterns into fixed prompts and runs a full leaderboard.

**Tech Stack:** TypeScript, Bun, `rllm` (v1.2.0), OpenAI API (`gpt-5-nano`), existing probe infrastructure from CTX-1.

---

## Task 1: Create RLLMStrategy — Failing Test

**Files:**
- Create: `src/strategies/rllm-strategy.test.ts`

**Step 1: Write the failing test**

```typescript
import { test, expect, describe } from "bun:test";
import { RLLMStrategy } from "./rllm-strategy";

describe("RLLMStrategy", () => {
  test("implements MemoryStrategy interface", () => {
    const strategy = new RLLMStrategy();
    expect(strategy.name).toBe("RLLM");
    expect(typeof strategy.reset).toBe("function");
    expect(typeof strategy.addMessage).toBe("function");
    expect(typeof strategy.getContext).toBe("function");
  });

  test("reset clears all state", () => {
    const strategy = new RLLMStrategy();
    strategy.addMessage({ role: "user", content: "hello" });
    strategy.reset();
    // After reset, getContext should return empty messages
    // (no compression needed with 1 message)
  });

  test("accumulates messages before compression threshold", async () => {
    const strategy = new RLLMStrategy();
    strategy.addMessage({ role: "user", content: "hello" });
    strategy.addMessage({ role: "assistant", content: "hi" });
    const ctx = await strategy.getContext();
    expect(ctx.messages.length).toBe(2);
    expect(ctx.memoryOverheadTokens).toBe(0);
  });

  test("exposes codeLogs array for CTX-4 analysis", () => {
    const strategy = new RLLMStrategy();
    expect(Array.isArray(strategy.codeLogs)).toBe(true);
    expect(strategy.codeLogs.length).toBe(0);
  });

  test("exposes extractionLog array for probe checking", () => {
    const strategy = new RLLMStrategy();
    expect(Array.isArray(strategy.extractionLog)).toBe(true);
    expect(strategy.extractionLog.length).toBe(0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/strategies/rllm-strategy.test.ts`
Expected: FAIL with "Cannot find module './rllm-strategy'"

---

## Task 2: Create RLLMStrategy — Implementation

**Files:**
- Create: `src/strategies/rllm-strategy.ts`

**Step 1: Write the implementation**

```typescript
import { createRLLM, type RLMResult, type RLMEvent } from "rllm";
import type { LLMMessage } from "../utils/llm";
import type { MemoryStrategy } from "./base";

/**
 * Log entry for each JavaScript code block the LLM writes during extraction.
 * Used in CTX-4 to classify what strategies the LLM invents.
 */
export interface CodeLogEntry {
  cycle: number;
  iteration: number;
  code: string;
  timestamp: number;
}

/**
 * Log entry for the final extraction output of each compression cycle.
 * Used for probe-based retention analysis (same format as CTX-1).
 */
export interface ExtractionLogEntry {
  cycle: number;
  step: number;
  content: string;
  messagesCompressed: number;
  subCalls: number;
  totalTokens: number;
  executionTimeMs: number;
  iterations: number;
}

/**
 * RLLM Strategy — Agentic Memory Extraction
 *
 * Instead of hand-designed prompts (RLM) or generic summarization,
 * this strategy hands the transcript to the `rllm` package and lets
 * the LLM write JavaScript code to process it however it wants.
 *
 * The LLM can: chunk text, regex-match, run sub-LLM queries in parallel,
 * multi-pass extract-then-verify — whatever it decides.
 */
export class RLLMStrategy implements MemoryStrategy {
  name = "RLLM";
  private messages: LLMMessage[] = [];
  private delegatedKnowledge: string[] = [];
  private compressEvery: number;
  private recentWindow: number;
  private maxIterations: number;
  private totalOverheadTokens = 0;
  private messagesSinceCompression = 0;
  private currentStep = 0;
  private compressionCycle = 0;

  /** Code logs: every JS snippet the LLM writes (for CTX-4) */
  codeLogs: CodeLogEntry[] = [];
  /** Extraction logs: final output per compression cycle (for probes) */
  extractionLog: ExtractionLogEntry[] = [];

  constructor(compressEvery = 8, recentWindow = 4, maxIterations = 5) {
    this.compressEvery = compressEvery;
    this.recentWindow = recentWindow;
    this.maxIterations = maxIterations;
  }

  reset(): void {
    this.messages = [];
    this.delegatedKnowledge = [];
    this.totalOverheadTokens = 0;
    this.messagesSinceCompression = 0;
    this.currentStep = 0;
    this.compressionCycle = 0;
    this.codeLogs = [];
    this.extractionLog = [];
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
    this.messagesSinceCompression++;
    this.currentStep++;
  }

  async getContext() {
    let overheadThisStep = 0;

    if (
      this.messagesSinceCompression >= this.compressEvery &&
      this.messages.length > this.recentWindow
    ) {
      const toCompress = this.messages.slice(
        0,
        this.messages.length - this.recentWindow,
      );

      const transcript = toCompress
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const existingKnowledge =
        this.delegatedKnowledge.length > 0
          ? `Previously extracted knowledge:\n${this.delegatedKnowledge.join("\n")}\n\n`
          : "";

      this.compressionCycle++;
      const cycle = this.compressionCycle;

      // Capture code blocks via onEvent
      const onEvent = (event: RLMEvent) => {
        if (event.type === "code_execution_start" && event.code) {
          this.codeLogs.push({
            cycle,
            iteration: event.iteration ?? 0,
            code: event.code,
            timestamp: event.timestamp,
          });
        }
      };

      const rlm = createRLLM({
        model: "gpt-5-nano",
        provider: "openai",
        verbose: false,
      });

      const prompt = `You are a memory extraction agent. Your job is to extract a COMPLETE knowledge state from this conversation transcript so that NOTHING is lost. The extracted knowledge will be the ONLY record — if you miss a detail, it is lost forever.

${existingKnowledge}Extract ALL facts from this conversation transcript. Be exhaustive — every name, number, ID, phone number, date, location, decision, correction, and relationship matters.

Conversation transcript:
${transcript}`;

      let result: RLMResult;
      try {
        result = await rlm.completion(prompt, {
          context: transcript,
          onEvent,
        });
      } catch (err) {
        // Fallback: if rllm fails, store the raw transcript excerpt
        console.error(`  RLLM failed on cycle ${cycle}: ${err}`);
        this.delegatedKnowledge = [transcript.slice(0, 2000)];
        this.messages = this.messages.slice(-this.recentWindow);
        this.messagesSinceCompression = 0;
        return {
          messages: this.messages,
          system: `DELEGATED KNOWLEDGE:\n${this.delegatedKnowledge.join("\n")}`,
          memoryOverheadTokens: 0,
        };
      }

      const extractedContent = result.answer.message;
      overheadThisStep = result.usage.tokenUsage.totalTokens;
      this.totalOverheadTokens += overheadThisStep;

      // Log extraction for probe analysis
      this.extractionLog.push({
        cycle,
        step: this.currentStep,
        content: extractedContent,
        messagesCompressed: toCompress.length,
        subCalls: result.usage.subCalls,
        totalTokens: result.usage.tokenUsage.totalTokens,
        executionTimeMs: result.usage.executionTimeMs,
        iterations: result.iterations,
      });

      this.delegatedKnowledge = [extractedContent];
      this.messages = this.messages.slice(-this.recentWindow);
      this.messagesSinceCompression = 0;
    }

    const messages: LLMMessage[] = [...this.messages];
    const startIdx = messages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? messages.slice(startIdx) : messages;

    const systemParts: string[] = [];
    if (this.delegatedKnowledge.length > 0) {
      systemParts.push(
        `DELEGATED KNOWLEDGE (extracted by agentic process from earlier conversation):\n${this.delegatedKnowledge.join("\n\n")}`,
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

**Step 2: Run tests to verify they pass**

Run: `bun test src/strategies/rllm-strategy.test.ts`
Expected: All 5 tests PASS

**Step 3: Commit**

```bash
git add src/strategies/rllm-strategy.ts src/strategies/rllm-strategy.test.ts
git commit -m "feat(ctx-3): add RLLMStrategy wrapping rllm package as MemoryStrategy"
```

---

## Task 3: Create RLLM Extraction Analysis Runner

**Files:**
- Create: `src/analysis/rllm-extraction.ts`

This mirrors `src/analysis/rlm-loss.ts` but uses `RLLMStrategy` instead of `RLMStrategy`, and also captures code logs.

**Step 1: Write the analysis runner**

```typescript
/**
 * RLLM Agentic Extraction Analysis (CTX-3)
 *
 * Runs the RLLMStrategy across all scenarios with code + extraction logging,
 * then checks each probe fact against extraction outputs.
 * Produces: retention-by-type report + raw code logs for CTX-4.
 *
 * Usage: bun src/analysis/rllm-extraction.ts
 */

import { RLLMStrategy, type ExtractionLogEntry, type CodeLogEntry } from "../strategies/rllm-strategy";
import { chat } from "../utils/llm";
import { ALL_SCENARIOS, type Probe, type ProbeType, type Scenario } from "../tasks/scenarios";

// ── Types ──────────────────────────────────────────────────────────

interface ProbeResult {
  fact: string;
  type: ProbeType;
  introducedAtStep: number;
  retainedByCycle: boolean[];
  firstLostAtCycle: number;
}

interface ScenarioResult {
  scenarioName: string;
  probeResults: ProbeResult[];
  compressionCycles: number;
  extractionLog: ExtractionLogEntry[];
  codeLogs: CodeLogEntry[];
  totalSubCalls: number;
  totalTokens: number;
  totalLatencyMs: number;
}

interface RetentionByType {
  type: ProbeType;
  totalProbes: number;
  retentionByCycle: number[];
  overallRetention: number;
  losses: Array<{ scenario: string; fact: string; lostAtCycle: number }>;
}

// ── Probe checking ─────────────────────────────────────────────────

function checkProbeRetained(probe: Probe, content: string): boolean {
  const lower = content.toLowerCase();
  return probe.patterns.every((p) => lower.includes(p.toLowerCase()));
}

// ── Run a single scenario ──────────────────────────────────────────

async function runScenario(scenario: Scenario): Promise<ScenarioResult> {
  const strategy = new RLLMStrategy(8, 4, 5);

  console.log(`\n  Running: RLLM × ${scenario.name} (${scenario.steps.length} steps)...`);

  for (let i = 0; i < scenario.steps.length; i++) {
    strategy.addMessage({ role: "user", content: scenario.steps[i]! });

    let context;
    try {
      context = await strategy.getContext();
    } catch (err) {
      console.error(`    Error at step ${i + 1}: ${err}`);
      // Continue with basic context
      context = {
        messages: [{ role: "user" as const, content: scenario.steps[i]! }],
        memoryOverheadTokens: 0,
      };
    }

    const response = await chat(
      context.messages,
      [scenario.systemPrompt, context.system].filter(Boolean).join("\n\n"),
    );

    strategy.addMessage({ role: "assistant", content: response.content });

    if ((i + 1) % 5 === 0) {
      process.stdout.write(
        `    Step ${i + 1}/${scenario.steps.length} (compressions: ${strategy.extractionLog.length}, code blocks: ${strategy.codeLogs.length})\n`,
      );
    }
  }

  // Trigger any remaining compression with the final question
  strategy.addMessage({ role: "user", content: scenario.finalQuestion });
  try {
    await strategy.getContext();
  } catch (err) {
    console.error(`    Error on final question: ${err}`);
  }

  // Check probes against extraction log
  const probes = scenario.probes ?? [];
  const log = strategy.extractionLog;
  const probeResults: ProbeResult[] = probes.map((probe) => {
    const retainedByCycle = log.map((entry) =>
      checkProbeRetained(probe, entry.content),
    );

    const firstLostIdx = retainedByCycle.findIndex((retained, idx) => {
      if (probe.introducedAtStep > log[idx]!.step) return false;
      return !retained;
    });

    return {
      fact: probe.fact,
      type: probe.type,
      introducedAtStep: probe.introducedAtStep,
      retainedByCycle,
      firstLostAtCycle: firstLostIdx === -1 ? 0 : firstLostIdx + 1,
    };
  });

  const totalSubCalls = log.reduce((s, e) => s + e.subCalls, 0);
  const totalTokens = log.reduce((s, e) => s + e.totalTokens, 0);
  const totalLatencyMs = log.reduce((s, e) => s + e.executionTimeMs, 0);

  console.log(
    `  Done: ${log.length} compressions, ${strategy.codeLogs.length} code blocks, ${totalSubCalls} sub-calls`,
  );

  return {
    scenarioName: scenario.name,
    probeResults,
    compressionCycles: log.length,
    extractionLog: log,
    codeLogs: strategy.codeLogs,
    totalSubCalls,
    totalTokens,
    totalLatencyMs,
  };
}

// ── Aggregate results ──────────────────────────────────────────────

function aggregateByType(results: ScenarioResult[]): RetentionByType[] {
  const typeMap = new Map<ProbeType, RetentionByType>();
  const maxCycles = Math.max(...results.map((r) => r.compressionCycles));

  for (const result of results) {
    for (const probe of result.probeResults) {
      let entry = typeMap.get(probe.type);
      if (!entry) {
        entry = {
          type: probe.type,
          totalProbes: 0,
          retentionByCycle: new Array(maxCycles).fill(0),
          overallRetention: 0,
          losses: [],
        };
        typeMap.set(probe.type, entry);
      }

      entry.totalProbes++;
      for (let c = 0; c < probe.retainedByCycle.length; c++) {
        if (probe.retainedByCycle[c]) {
          entry.retentionByCycle[c]!++;
        }
      }

      if (probe.firstLostAtCycle > 0) {
        entry.losses.push({
          scenario: result.scenarioName,
          fact: probe.fact,
          lostAtCycle: probe.firstLostAtCycle,
        });
      }
    }
  }

  for (const entry of Array.from(typeMap.values())) {
    const counts = entry.retentionByCycle;
    entry.retentionByCycle = counts.map((c) =>
      entry.totalProbes > 0 ? c / entry.totalProbes : 0,
    );
    const neverLost = entry.totalProbes - entry.losses.length;
    entry.overallRetention = entry.totalProbes > 0
      ? neverLost / entry.totalProbes
      : 0;
  }

  return [...typeMap.values()].sort((a, b) => a.overallRetention - b.overallRetention);
}

// ── Report ─────────────────────────────────────────────────────────

function printReport(results: ScenarioResult[], byType: RetentionByType[]): void {
  console.log("\n" + "═".repeat(70));
  console.log("  RLLM AGENTIC EXTRACTION — RETENTION BY FACT TYPE (CTX-3)");
  console.log("═".repeat(70));

  console.log("\n── Retention Rate by Fact Type (worst → best) ──\n");
  for (const t of byType) {
    const pct = (t.overallRetention * 100).toFixed(0);
    const bar = "█".repeat(Math.round(t.overallRetention * 20)).padEnd(20, "░");
    console.log(
      `  ${t.type.padEnd(14)} ${bar} ${pct.padStart(3)}%  (${t.totalProbes - t.losses.length}/${t.totalProbes} retained)`,
    );
  }

  // Cost summary
  const totalSubCalls = results.reduce((s, r) => s + r.totalSubCalls, 0);
  const totalTokens = results.reduce((s, r) => s + r.totalTokens, 0);
  const totalLatency = results.reduce((s, r) => s + r.totalLatencyMs, 0);
  const totalCodeBlocks = results.reduce((s, r) => s + r.codeLogs.length, 0);

  console.log("\n── Cost Summary ──\n");
  console.log(`  Total sub-LLM calls:  ${totalSubCalls}`);
  console.log(`  Total tokens:         ${totalTokens.toLocaleString()}`);
  console.log(`  Total latency:        ${(totalLatency / 1000).toFixed(1)}s`);
  console.log(`  Code blocks captured: ${totalCodeBlocks}`);

  // Comparison to hand-rolled RLM
  const allProbes = results.flatMap((r) => r.probeResults);
  const retainedCount = allProbes.filter((p) => p.firstLostAtCycle === 0).length;
  const overallRetention = allProbes.length > 0
    ? ((retainedCount / allProbes.length) * 100).toFixed(1)
    : "N/A";

  console.log("\n── Headline Comparison ──\n");
  console.log(`  Hand-rolled RLM (depth 1): 59.7%`);
  console.log(`  RLLM (agentic):            ${overallRetention}%`);
  const diff = parseFloat(overallRetention) - 59.7;
  console.log(`  Delta:                     ${diff > 0 ? "+" : ""}${diff.toFixed(1)}pp`);

  console.log("\n" + "═".repeat(70));
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("RLLM Agentic Extraction Analysis (CTX-3)");
  console.log("Running RLLMStrategy across all scenarios...\n");

  const scenariosWithProbes = ALL_SCENARIOS.filter(
    (s) => s.probes && s.probes.length > 0,
  );

  console.log(`Found ${scenariosWithProbes.length} scenarios with probes.\n`);

  const results: ScenarioResult[] = [];
  for (const scenario of scenariosWithProbes) {
    try {
      const result = await runScenario(scenario);
      results.push(result);
    } catch (err) {
      console.error(`  FATAL error on ${scenario.name}: ${err}`);
    }
  }

  if (results.length === 0) {
    console.error("No results produced. Aborting.");
    process.exit(1);
  }

  const byType = aggregateByType(results);
  printReport(results, byType);

  // Save raw data (retention + code logs)
  const outputPath = `results/rllm-extraction-${Date.now()}.json`;
  await Bun.write(
    outputPath,
    JSON.stringify({ results, byType }, null, 2),
  );
  console.log(`\nRaw data saved to ${outputPath}`);

  // Save code logs separately for CTX-4
  const codeLogsPath = `results/rllm-code-logs-${Date.now()}.json`;
  const allCodeLogs = results.flatMap((r) =>
    r.codeLogs.map((cl) => ({ scenario: r.scenarioName, ...cl })),
  );
  await Bun.write(codeLogsPath, JSON.stringify(allCodeLogs, null, 2));
  console.log(`Code logs saved to ${codeLogsPath} (${allCodeLogs.length} blocks)`);
}

main().catch(console.error);
```

**Step 2: Verify it compiles**

Run: `bun build --no-bundle src/analysis/rllm-extraction.ts`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/analysis/rllm-extraction.ts
git commit -m "feat(ctx-3): add RLLM extraction analysis runner with probe + code logging"
```

---

## Task 4: Run CTX-3 Analysis

**Step 1: Run the analysis**

Run: `bun src/analysis/rllm-extraction.ts`

Expected output:
- Retention-by-type report for RLLM strategy
- Code blocks captured in results/rllm-code-logs-*.json
- Full results in results/rllm-extraction-*.json

**Step 2: Verify output files**

Run: `ls -la results/rllm-*.json`
Expected: Two new JSON files with non-zero sizes

**Step 3: Commit results**

```bash
git add results/rllm-extraction-*.json results/rllm-code-logs-*.json
git commit -m "data(ctx-3): RLLM agentic extraction results and code logs"
```

---

## Task 5: Create Code Analysis Script (CTX-4)

**Files:**
- Create: `src/analysis/code-analysis.ts`

This is a zero-API-call analysis. It reads the code logs from CTX-3 and classifies each snippet by strategy type.

**Step 1: Write the analysis script**

```typescript
/**
 * Code Analysis — What Did the LLM Discover? (CTX-4)
 *
 * Analyzes the JavaScript code the LLM wrote during CTX-3 to determine
 * whether it discovered type-specific extraction strategies.
 *
 * Zero API calls — pure offline analysis of code logs.
 *
 * Usage: bun src/analysis/code-analysis.ts <path-to-code-logs.json>
 */

// ── Types ──────────────────────────────────────────────────────────

type StrategyCategory =
  | "flat_extraction"       // Single prompt, no structure
  | "type_specific"         // Separate handling for numbers, names, IDs
  | "multi_pass"            // Extract → verify → refine
  | "chunking"              // Split text, parallel sub-queries, merge
  | "regex_augmented"       // Code-level pattern matching before LLM queries
  | "hybrid"                // Combines multiple approaches
  | "unknown";

interface CodeLogEntry {
  scenario: string;
  cycle: number;
  iteration: number;
  code: string;
  timestamp: number;
}

interface ClassifiedSnippet {
  scenario: string;
  cycle: number;
  iteration: number;
  categories: StrategyCategory[];
  hasSubLLMCalls: boolean;
  hasRegex: boolean;
  hasChunking: boolean;
  hasLooping: boolean;
  codeLength: number;
  code: string;
}

interface ScenarioSummary {
  scenario: string;
  totalSnippets: number;
  dominantCategory: StrategyCategory;
  categoryCounts: Record<StrategyCategory, number>;
  avgCodeLength: number;
  usesSubLLM: boolean;
  usesRegex: boolean;
  usesChunking: boolean;
}

// ── Classification ─────────────────────────────────────────────────

function classifySnippet(entry: CodeLogEntry): ClassifiedSnippet {
  const code = entry.code;
  const lower = code.toLowerCase();

  const hasSubLLMCalls = /llm_query\s*\(/.test(code) || /llm_query_batched\s*\(/.test(code);
  const hasRegex = /new RegExp|\/.*\/[gimsu]|\.match\(|\.replace\(|\.search\(|\.test\(/.test(code);
  const hasChunking = /chunk|split|slice|substring|\.slice\(/.test(lower) && /for|while|map|forEach/.test(code);
  const hasLooping = /for\s*\(|while\s*\(|\.map\(|\.forEach\(|\.reduce\(/.test(code);

  const categories: StrategyCategory[] = [];

  // Check for type-specific extraction (mentions categories of facts)
  const typeSpecificPatterns = [
    /number|quantit|amount|price|cost/i,
    /name|person|entity|people/i,
    /id\b|identifier|phone|code/i,
    /date|time|deadline|schedule/i,
    /correct|update|change|revis/i,
  ];
  const typeSpecificHits = typeSpecificPatterns.filter((p) => p.test(code)).length;
  if (typeSpecificHits >= 2 && hasSubLLMCalls) {
    categories.push("type_specific");
  }

  // Multi-pass: multiple sequential llm_query calls
  const llmCallCount = (code.match(/llm_query\s*\(/g) || []).length +
    (code.match(/llm_query_batched\s*\(/g) || []).length;
  if (llmCallCount >= 2 && /await/.test(code)) {
    categories.push("multi_pass");
  }

  // Chunking-based: splits text then processes chunks
  if (hasChunking && (hasSubLLMCalls || /llm_query_batched/.test(code))) {
    categories.push("chunking");
  }

  // Regex-augmented: uses regex to find patterns before/alongside LLM
  if (hasRegex) {
    categories.push("regex_augmented");
  }

  // If no specific pattern detected, it's flat extraction
  if (categories.length === 0) {
    if (hasSubLLMCalls) {
      categories.push("flat_extraction");
    } else {
      // Code that doesn't call LLM — likely just data processing
      categories.push("unknown");
    }
  }

  // If multiple patterns, also mark as hybrid
  if (categories.length >= 2) {
    categories.push("hybrid");
  }

  return {
    scenario: entry.scenario,
    cycle: entry.cycle,
    iteration: entry.iteration,
    categories,
    hasSubLLMCalls,
    hasRegex,
    hasChunking,
    hasLooping,
    codeLength: code.length,
    code,
  };
}

// ── Summarize per scenario ─────────────────────────────────────────

function summarizeByScenario(snippets: ClassifiedSnippet[]): ScenarioSummary[] {
  const byScenario = new Map<string, ClassifiedSnippet[]>();
  for (const s of snippets) {
    const arr = byScenario.get(s.scenario) || [];
    arr.push(s);
    byScenario.set(s.scenario, arr);
  }

  return Array.from(byScenario.entries()).map(([scenario, snips]) => {
    const categoryCounts: Record<StrategyCategory, number> = {
      flat_extraction: 0,
      type_specific: 0,
      multi_pass: 0,
      chunking: 0,
      regex_augmented: 0,
      hybrid: 0,
      unknown: 0,
    };

    for (const s of snips) {
      for (const cat of s.categories) {
        categoryCounts[cat]++;
      }
    }

    const dominant = (Object.entries(categoryCounts) as [StrategyCategory, number][])
      .filter(([cat]) => cat !== "hybrid" && cat !== "unknown")
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

    return {
      scenario,
      totalSnippets: snips.length,
      dominantCategory: dominant,
      categoryCounts,
      avgCodeLength: snips.reduce((s, x) => s + x.codeLength, 0) / snips.length,
      usesSubLLM: snips.some((s) => s.hasSubLLMCalls),
      usesRegex: snips.some((s) => s.hasRegex),
      usesChunking: snips.some((s) => s.hasChunking),
    };
  });
}

// ── Report ─────────────────────────────────────────────────────────

function printReport(
  snippets: ClassifiedSnippet[],
  summaries: ScenarioSummary[],
): void {
  console.log("\n" + "═".repeat(70));
  console.log("  CTX-4: CODE ANALYSIS — WHAT DID THE LLM DISCOVER?");
  console.log("═".repeat(70));

  // 1. Overall strategy distribution
  console.log("\n── Strategy Distribution (all scenarios) ──\n");
  const globalCounts: Record<StrategyCategory, number> = {
    flat_extraction: 0, type_specific: 0, multi_pass: 0,
    chunking: 0, regex_augmented: 0, hybrid: 0, unknown: 0,
  };
  for (const s of snippets) {
    for (const cat of s.categories) {
      globalCounts[cat]++;
    }
  }
  const total = snippets.length;
  for (const [cat, count] of Object.entries(globalCounts).sort((a, b) => b[1] - a[1])) {
    if (count === 0) continue;
    const pct = ((count / total) * 100).toFixed(0);
    const bar = "█".repeat(Math.round((count / total) * 30)).padEnd(30, "░");
    console.log(`  ${cat.padEnd(20)} ${bar} ${pct.padStart(3)}% (${count}/${total})`);
  }

  // 2. Per-scenario breakdown
  console.log("\n── Per-Scenario Strategy ──\n");
  console.log(
    "  " +
    "Scenario".padEnd(28) +
    "Dominant".padEnd(20) +
    "Snippets".padStart(8) +
    "SubLLM".padStart(8) +
    "Regex".padStart(8) +
    "Chunk".padStart(8),
  );
  console.log("  " + "─".repeat(80));
  for (const s of summaries) {
    console.log(
      "  " +
      s.scenario.padEnd(28) +
      s.dominantCategory.padEnd(20) +
      String(s.totalSnippets).padStart(8) +
      (s.usesSubLLM ? "  yes" : "  no").padStart(8) +
      (s.usesRegex ? "  yes" : "  no").padStart(8) +
      (s.usesChunking ? "  yes" : "  no").padStart(8),
    );
  }

  // 3. Does the LLM adapt per scenario?
  const uniqueStrategies = new Set(summaries.map((s) => s.dominantCategory));
  console.log("\n── Key Finding ──\n");
  if (uniqueStrategies.size >= 3) {
    console.log("  FINDING: LLM ADAPTS strategy per scenario (" + uniqueStrategies.size + " distinct strategies)");
    console.log("  This suggests the LLM is discovering context-dependent extraction.");
  } else if (uniqueStrategies.size === 2) {
    console.log("  FINDING: LLM shows PARTIAL adaptation (" + uniqueStrategies.size + " distinct strategies)");
  } else {
    console.log("  FINDING: LLM CONVERGES on one strategy: " + [...uniqueStrategies][0]);
    console.log("  This validates hand-designed approaches — the LLM defaults to generic patterns.");
  }

  // 4. Did it address CTX-1's 0% categories?
  const hasTypeSpecific = snippets.some((s) => s.categories.includes("type_specific"));
  const hasRegexForIDs = snippets.some(
    (s) => s.hasRegex && /phone|id\b|code|number/i.test(s.code),
  );
  console.log("\n── CTX-1 Gap Analysis ──\n");
  console.log(`  phone/ID (0% in CTX-1): ${hasRegexForIDs ? "LLM added regex extraction ✓" : "NOT addressed ✗"}`);
  console.log(`  spatial (0% in CTX-1):   ${hasTypeSpecific ? "Type-specific extraction present ?" : "NOT addressed ✗"}`);
  console.log(`  Type-specific overall:   ${hasTypeSpecific ? "DISCOVERED ✓" : "NOT discovered ✗"}`);

  console.log("\n" + "═".repeat(70));
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  const codeLogsPath = process.argv[2];
  if (!codeLogsPath) {
    console.error("Usage: bun src/analysis/code-analysis.ts <path-to-code-logs.json>");
    console.error("  e.g.: bun src/analysis/code-analysis.ts results/rllm-code-logs-12345.json");
    process.exit(1);
  }

  const file = Bun.file(codeLogsPath);
  if (!(await file.exists())) {
    console.error(`File not found: ${codeLogsPath}`);
    process.exit(1);
  }

  const codeLogs: CodeLogEntry[] = await file.json();
  console.log(`Loaded ${codeLogs.length} code blocks from ${codeLogsPath}`);

  const classified = codeLogs.map(classifySnippet);
  const summaries = summarizeByScenario(classified);

  printReport(classified, summaries);

  // Save classified data
  const outputPath = `results/code-analysis-${Date.now()}.json`;
  await Bun.write(
    outputPath,
    JSON.stringify({ classified, summaries }, null, 2),
  );
  console.log(`\nClassified data saved to ${outputPath}`);
}

main().catch(console.error);
```

**Step 2: Verify it compiles**

Run: `bun build --no-bundle src/analysis/code-analysis.ts`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/analysis/code-analysis.ts
git commit -m "feat(ctx-4): add code analysis script for classifying LLM-invented extraction strategies"
```

---

## Task 6: Run CTX-4 Analysis

**Step 1: Run code analysis on CTX-3 output**

Run: `bun src/analysis/code-analysis.ts results/rllm-code-logs-<timestamp>.json`

(Replace `<timestamp>` with the actual file from Task 4.)

Expected output:
- Strategy distribution table
- Per-scenario breakdown
- Key finding: does the LLM adapt?
- CTX-1 gap analysis

**Step 2: Commit results**

```bash
git add results/code-analysis-*.json
git commit -m "data(ctx-4): code analysis results — classified LLM extraction strategies"
```

---

## Task 7: Create DiscoveredRLMStrategy (CTX-5 Part 1)

**Files:**
- Create: `src/strategies/discovered-rlm.test.ts`
- Create: `src/strategies/discovered-rlm.ts`

**Important:** This task depends on CTX-4 results. The implementation below is a **template**. After reviewing the CTX-4 code analysis output, replace the placeholder prompts with the actual patterns the LLM discovered.

**Step 1: Write the failing test**

```typescript
import { test, expect, describe } from "bun:test";
import { DiscoveredRLMStrategy } from "./discovered-rlm";

describe("DiscoveredRLMStrategy", () => {
  test("implements MemoryStrategy interface", () => {
    const strategy = new DiscoveredRLMStrategy();
    expect(strategy.name).toBe("DiscoveredRLM");
    expect(typeof strategy.reset).toBe("function");
    expect(typeof strategy.addMessage).toBe("function");
    expect(typeof strategy.getContext).toBe("function");
  });

  test("has enableLogging and delegationLog like RLMStrategy", () => {
    const strategy = new DiscoveredRLMStrategy();
    strategy.enableLogging = true;
    expect(Array.isArray(strategy.delegationLog)).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun test src/strategies/discovered-rlm.test.ts`
Expected: FAIL with "Cannot find module './discovered-rlm'"

**Step 3: Write the template implementation**

```typescript
import type { LLMMessage } from "../utils/llm";
import { chat } from "../utils/llm";
import type { MemoryStrategy } from "./base";
import type { DelegationLogEntry } from "./rlm";

/**
 * Discovered RLM Strategy (CTX-5)
 *
 * Reverse-engineered from the best patterns found in CTX-4.
 * This encodes the LLM's discovered extraction approach as fixed prompts,
 * giving the same quality as agentic extraction at fixed-strategy cost.
 *
 * TODO: After CTX-4, replace the extraction prompts below with the
 * actual patterns the LLM discovered.
 */
export class DiscoveredRLMStrategy implements MemoryStrategy {
  name = "DiscoveredRLM";
  private messages: LLMMessage[] = [];
  private delegatedKnowledge: string[] = [];
  private compressEvery: number;
  private recentWindow: number;
  private totalOverheadTokens = 0;
  private messagesSinceCompression = 0;
  private currentStep = 0;
  private delegationCycle = 0;

  enableLogging = false;
  delegationLog: DelegationLogEntry[] = [];

  constructor(compressEvery = 8, recentWindow = 4) {
    this.compressEvery = compressEvery;
    this.recentWindow = recentWindow;
  }

  reset(): void {
    this.messages = [];
    this.delegatedKnowledge = [];
    this.totalOverheadTokens = 0;
    this.messagesSinceCompression = 0;
    this.currentStep = 0;
    this.delegationCycle = 0;
    this.delegationLog = [];
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
    this.messagesSinceCompression++;
    this.currentStep++;
  }

  async getContext() {
    let overheadThisStep = 0;

    if (
      this.messagesSinceCompression >= this.compressEvery &&
      this.messages.length > this.recentWindow
    ) {
      const toCompress = this.messages.slice(
        0,
        this.messages.length - this.recentWindow,
      );

      const transcript = toCompress
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const existingKnowledge =
        this.delegatedKnowledge.length > 0
          ? `Previously extracted knowledge:\n${this.delegatedKnowledge.join("\n")}\n\n`
          : "";

      // ── Pass 1: Structured extraction ──
      // TODO: Replace with discovered pattern from CTX-4
      const pass1 = await chat(
        [
          {
            role: "user",
            content: `${existingKnowledge}New conversation segment:\n${transcript}\n\nExtract ALL information from this conversation into these categories:

IDENTIFIERS: Every ID, phone number, code, reference number, account number (exact format matters)
NUMBERS: Every quantity, price, measurement, count, percentage, with its context
ENTITIES: Every person, place, organization, product with ALL their attributes
DATES/TIMES: Every date, time, deadline, schedule item
CORRECTIONS: Every instance where a previous fact was updated — state BOTH old and new values
DECISIONS: Every decision made, with what was chosen and what was rejected
SPATIAL: Every location, address, region, floor, room assignment

Be exhaustive. Copy exact values — do not paraphrase numbers or IDs.`,
          },
        ],
        "You extract structured facts with perfect precision. Your output is the ONLY record. Miss nothing.",
      );

      // ── Pass 2: Verification ──
      // TODO: Replace with discovered pattern from CTX-4
      const pass2 = await chat(
        [
          {
            role: "user",
            content: `Original transcript:\n${transcript}\n\nExtracted facts:\n${pass1.content}\n\nVerify the extraction above against the original transcript. For each category:
1. Are there any facts in the transcript that were MISSED in the extraction?
2. Are there any facts that were extracted INCORRECTLY?
3. For corrections/updates: does the extraction have BOTH the old and new values?

Output the FINAL corrected extraction. Include everything from the first pass plus anything that was missed.`,
          },
        ],
        "You are a verification agent. Compare extracted facts against source material. Find what was missed or wrong.",
      );

      overheadThisStep =
        pass1.inputTokens + pass1.outputTokens +
        pass2.inputTokens + pass2.outputTokens;
      this.totalOverheadTokens += overheadThisStep;

      if (this.enableLogging) {
        this.delegationCycle++;
        this.delegationLog.push({
          cycle: this.delegationCycle,
          step: this.currentStep,
          content: pass2.content,
          messagesCompressed: toCompress.length,
        });
      }

      this.delegatedKnowledge = [pass2.content];
      this.messages = this.messages.slice(-this.recentWindow);
      this.messagesSinceCompression = 0;
    }

    const messages: LLMMessage[] = [...this.messages];
    const startIdx = messages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? messages.slice(startIdx) : messages;

    const systemParts: string[] = [];
    if (this.delegatedKnowledge.length > 0) {
      systemParts.push(
        `DELEGATED KNOWLEDGE (extracted and verified from earlier conversation):\n${this.delegatedKnowledge.join("\n\n")}`,
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

**Step 4: Run tests to verify they pass**

Run: `bun test src/strategies/discovered-rlm.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add src/strategies/discovered-rlm.ts src/strategies/discovered-rlm.test.ts
git commit -m "feat(ctx-5): add DiscoveredRLMStrategy template (to be refined after CTX-4 analysis)"
```

---

## Task 8: Create Final Leaderboard Runner (CTX-5 Part 2)

**Files:**
- Create: `src/analysis/final-leaderboard.ts`

**Step 1: Write the leaderboard runner**

```typescript
/**
 * Final Leaderboard — Head-to-Head Benchmark (CTX-5)
 *
 * Runs all strategies across all scenarios and produces the definitive
 * comparison: accuracy, cost, retention-by-type, latency.
 *
 * Strategies benchmarked:
 * 1. Full Context (ceiling)
 * 2. Hybrid (current champion)
 * 3. RLM (hand-rolled baseline)
 * 4. RLLMStrategy (agentic, from CTX-3)
 * 5. DiscoveredRLMStrategy (reverse-engineered)
 * 6. Summarize, Structured, Window (baselines)
 *
 * Usage: bun src/analysis/final-leaderboard.ts
 */

import { chat } from "../utils/llm";
import { ALL_SCENARIOS, type Probe, type ProbeType, type Scenario } from "../tasks/scenarios";
import type { MemoryStrategy } from "../strategies/base";

// Import all strategies
import { FullContextStrategy } from "../strategies/full-context";
import { HybridStrategy } from "../strategies/hybrid";
import { RLMStrategy } from "../strategies/rlm";
import { RLLMStrategy } from "../strategies/rllm-strategy";
import { DiscoveredRLMStrategy } from "../strategies/discovered-rlm";
import { SummarizeStrategy } from "../strategies/summarizer";
import { StructuredStrategy } from "../strategies/structured";
import { SlidingWindowStrategy } from "../strategies/sliding-window";

// ── Types ──────────────────────────────────────────────────────────

interface StrategyResult {
  strategyName: string;
  scenarioName: string;
  correct: boolean;
  answer: string;
  totalTokens: number;
  latencyMs: number;
  retentionByType: Map<ProbeType, { retained: number; total: number }>;
}

interface LeaderboardEntry {
  strategy: string;
  accuracy: number;
  scenariosCorrect: number;
  totalScenarios: number;
  avgTokens: number;
  avgLatencyMs: number;
  overallRetention: number;
  retentionByType: Record<string, number>;
}

// ── Probe checking ─────────────────────────────────────────────────

function checkProbeInAnswer(probe: Probe, answer: string): boolean {
  const lower = answer.toLowerCase();
  return probe.patterns.every((p) => lower.includes(p.toLowerCase()));
}

// ── Run one strategy × one scenario ────────────────────────────────

async function runOne(
  strategy: MemoryStrategy,
  scenario: Scenario,
): Promise<StrategyResult> {
  strategy.reset();

  const startTime = performance.now();
  let totalTokens = 0;

  for (const step of scenario.steps) {
    strategy.addMessage({ role: "user", content: step });
    const context = await strategy.getContext();
    const response = await chat(
      context.messages,
      [scenario.systemPrompt, context.system].filter(Boolean).join("\n\n"),
    );
    totalTokens += response.inputTokens + response.outputTokens + context.memoryOverheadTokens;
    strategy.addMessage({ role: "assistant", content: response.content });
  }

  // Final question
  strategy.addMessage({ role: "user", content: scenario.finalQuestion });
  const finalContext = await strategy.getContext();
  const finalResponse = await chat(
    finalContext.messages,
    [scenario.systemPrompt, finalContext.system].filter(Boolean).join("\n\n"),
  );
  totalTokens += finalResponse.inputTokens + finalResponse.outputTokens + finalContext.memoryOverheadTokens;

  const latencyMs = performance.now() - startTime;
  const correct = scenario.checkAnswer(finalResponse.content);

  // Probe retention on final answer
  const retentionByType = new Map<ProbeType, { retained: number; total: number }>();
  for (const probe of scenario.probes ?? []) {
    const entry = retentionByType.get(probe.type) || { retained: 0, total: 0 };
    entry.total++;
    if (checkProbeInAnswer(probe, finalResponse.content)) {
      entry.retained++;
    }
    retentionByType.set(probe.type, entry);
  }

  return {
    strategyName: strategy.name,
    scenarioName: scenario.name,
    correct,
    answer: finalResponse.content,
    totalTokens,
    latencyMs,
    retentionByType,
  };
}

// ── Aggregate into leaderboard ─────────────────────────────────────

function buildLeaderboard(results: StrategyResult[]): LeaderboardEntry[] {
  const byStrategy = new Map<string, StrategyResult[]>();
  for (const r of results) {
    const arr = byStrategy.get(r.strategyName) || [];
    arr.push(r);
    byStrategy.set(r.strategyName, arr);
  }

  return Array.from(byStrategy.entries()).map(([strategy, runs]) => {
    const correct = runs.filter((r) => r.correct).length;

    // Aggregate retention by type
    const typeAgg = new Map<string, { retained: number; total: number }>();
    for (const r of runs) {
      for (const [type, counts] of r.retentionByType) {
        const entry = typeAgg.get(type) || { retained: 0, total: 0 };
        entry.retained += counts.retained;
        entry.total += counts.total;
        typeAgg.set(type, entry);
      }
    }

    const retentionByType: Record<string, number> = {};
    let totalRetained = 0;
    let totalProbes = 0;
    for (const [type, counts] of typeAgg) {
      retentionByType[type] = counts.total > 0 ? counts.retained / counts.total : 0;
      totalRetained += counts.retained;
      totalProbes += counts.total;
    }

    return {
      strategy,
      accuracy: correct / runs.length,
      scenariosCorrect: correct,
      totalScenarios: runs.length,
      avgTokens: runs.reduce((s, r) => s + r.totalTokens, 0) / runs.length,
      avgLatencyMs: runs.reduce((s, r) => s + r.latencyMs, 0) / runs.length,
      overallRetention: totalProbes > 0 ? totalRetained / totalProbes : 0,
      retentionByType,
    };
  }).sort((a, b) => b.accuracy - a.accuracy || b.overallRetention - a.overallRetention);
}

// ── Report ─────────────────────────────────────────────────────────

function printLeaderboard(entries: LeaderboardEntry[]): void {
  console.log("\n" + "═".repeat(90));
  console.log("  FINAL LEADERBOARD — ALL STRATEGIES HEAD-TO-HEAD (CTX-5)");
  console.log("═".repeat(90));

  console.log("\n── Accuracy & Cost ──\n");
  console.log(
    "  " +
    "Rank".padEnd(6) +
    "Strategy".padEnd(22) +
    "Accuracy".padStart(10) +
    "Correct".padStart(10) +
    "Avg Tokens".padStart(12) +
    "Avg Latency".padStart(14),
  );
  console.log("  " + "─".repeat(74));

  entries.forEach((e, i) => {
    console.log(
      "  " +
      `#${i + 1}`.padEnd(6) +
      e.strategy.padEnd(22) +
      `${(e.accuracy * 100).toFixed(0)}%`.padStart(10) +
      `${e.scenariosCorrect}/${e.totalScenarios}`.padStart(10) +
      `${Math.round(e.avgTokens).toLocaleString()}`.padStart(12) +
      `${(e.avgLatencyMs / 1000).toFixed(1)}s`.padStart(14),
    );
  });

  console.log("\n── Retention by Fact Type ──\n");
  const allTypes = [...new Set(entries.flatMap((e) => Object.keys(e.retentionByType)))].sort();

  console.log(
    "  " + "Strategy".padEnd(22) + allTypes.map((t) => t.padStart(12)).join(""),
  );
  console.log("  " + "─".repeat(22 + allTypes.length * 12));

  for (const e of entries) {
    const cells = allTypes.map((t) => {
      const val = e.retentionByType[t];
      return val !== undefined ? `${(val * 100).toFixed(0)}%`.padStart(12) : "—".padStart(12);
    });
    console.log("  " + e.strategy.padEnd(22) + cells.join(""));
  }

  console.log("\n" + "═".repeat(90));
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("Final Leaderboard Benchmark (CTX-5)");
  console.log("Running all strategies across all scenarios...\n");

  const strategies: MemoryStrategy[] = [
    new FullContextStrategy(),
    new HybridStrategy(),
    new RLMStrategy(),
    new RLLMStrategy(),
    new DiscoveredRLMStrategy(),
    new SummarizeStrategy(),
    new StructuredStrategy(),
    new SlidingWindowStrategy(),
  ];

  const scenarios = ALL_SCENARIOS.filter((s) => s.probes && s.probes.length > 0);
  const totalRuns = strategies.length * scenarios.length;
  let completed = 0;

  const allResults: StrategyResult[] = [];

  for (const strategy of strategies) {
    console.log(`\n── ${strategy.name} ──`);
    for (const scenario of scenarios) {
      completed++;
      process.stdout.write(`  [${completed}/${totalRuns}] ${scenario.name}...`);
      try {
        const result = await runOne(strategy, scenario);
        allResults.push(result);
        console.log(result.correct ? " ✓" : " ✗");
      } catch (err) {
        console.log(` ERROR: ${err}`);
        allResults.push({
          strategyName: strategy.name,
          scenarioName: scenario.name,
          correct: false,
          answer: `ERROR: ${err}`,
          totalTokens: 0,
          latencyMs: 0,
          retentionByType: new Map(),
        });
      }
    }
  }

  const leaderboard = buildLeaderboard(allResults);
  printLeaderboard(leaderboard);

  // Save results
  const outputPath = `results/final-leaderboard-${Date.now()}.json`;

  // Convert Map to plain objects for JSON serialization
  const serializableResults = allResults.map((r) => ({
    ...r,
    retentionByType: Object.fromEntries(r.retentionByType),
  }));

  await Bun.write(
    outputPath,
    JSON.stringify({ results: serializableResults, leaderboard }, null, 2),
  );
  console.log(`\nResults saved to ${outputPath}`);
}

main().catch(console.error);
```

**Step 2: Verify it compiles**

Run: `bun build --no-bundle src/analysis/final-leaderboard.ts`
Expected: No type errors (may need to verify import paths exist)

**Step 3: Commit**

```bash
git add src/analysis/final-leaderboard.ts
git commit -m "feat(ctx-5): add final leaderboard benchmark runner for all strategies"
```

---

## Task 9: Run Final Leaderboard

**Step 1: Run the benchmark**

Run: `bun src/analysis/final-leaderboard.ts`

This will take a while — 8 strategies × 8 scenarios = 64 runs. Each run processes 15-20 conversation steps with LLM calls.

Expected output:
- Leaderboard table with accuracy, cost, and retention-by-type for every strategy
- Results saved to `results/final-leaderboard-*.json`

**Step 2: Commit results**

```bash
git add results/final-leaderboard-*.json
git commit -m "data(ctx-5): final leaderboard results — all strategies head-to-head"
```

---

## Task 10: Update Findings Document

**Files:**
- Modify: `docs/findings.md`

**Step 1: Add CTX-3/4/5 findings to the document**

Append sections covering:
- CTX-3: RLLM agentic extraction results, headline comparison to hand-rolled RLM
- CTX-4: What strategies the LLM discovered (or didn't)
- CTX-5: Final leaderboard with the publishable comparison

Use the same narrative style as the existing findings.md.

**Step 2: Commit**

```bash
git add docs/findings.md
git commit -m "docs: add CTX-3/4/5 findings to research writeup"
```

---

## Dependency Graph

```
Task 1-2 (RLLMStrategy) → Task 3 (analysis runner) → Task 4 (run CTX-3)
                                                            ↓
                                                      Task 5-6 (CTX-4)
                                                            ↓
                                                      Task 7 (DiscoveredRLM)
                                                            ↓
                                                      Task 8 (leaderboard runner)
                                                            ↓
                                                      Task 9 (run CTX-5)
                                                            ↓
                                                      Task 10 (update findings)
```

Tasks 1-3 can be implemented before any API calls. Task 4 is the first API-heavy step. Tasks 5-6 are offline. Tasks 7-9 require API calls again. Task 10 is writing.

## Notes

- **API Budget:** CTX-3 (Task 4) will be the most expensive step — 8 scenarios × multiple rllm iterations × sub-LLM calls per iteration. Monitor costs.
- **CTX-4 depends on CTX-3 data.** Don't start Task 5 until Task 4 has produced code logs.
- **DiscoveredRLMStrategy is a template.** Task 7 writes a 2-pass extract+verify approach as a starting point. After reviewing CTX-4 results, update the prompts to reflect what the LLM actually discovered.
- **The leaderboard strategy constructors use default params** (compressEvery=8, recentWindow=4) to match prior experiments.
