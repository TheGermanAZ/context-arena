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
