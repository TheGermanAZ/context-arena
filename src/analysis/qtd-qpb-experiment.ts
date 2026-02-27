/**
 * CTX-7: QTD + QPB Experiment
 *
 * Runs 4 strategies across all probe-equipped scenarios:
 * - Full Context (ceiling — checks raw messages)
 * - RLM(8) (incumbent — checks delegation log)
 * - QTD (query-time distillation — checks distillation output)
 * - QPB (quantity-pinning buffer — checks delegation log + pinned buffer)
 *
 * Usage: bun src/analysis/qtd-qpb-experiment.ts
 */
import { ALL_SCENARIOS, type Probe } from "../tasks/scenarios";
import { chat } from "../utils/llm";
import { FullContextStrategy } from "../strategies/full-context";
import { RLMStrategy } from "../strategies/rlm";
import { QTDStrategy } from "../strategies/qtd";
import { QPBStrategy } from "../strategies/qpb";
import type { MemoryStrategy } from "../strategies/base";
import { writeFileSync } from "fs";

interface ProbeResult {
  fact: string;
  type: string;
  retained: boolean;
}

interface StrategyResult {
  strategy: string;
  scenario: string;
  retained: number;
  total: number;
  cycles: number;
  probeResults: ProbeResult[];
}

function checkProbesInText(text: string, probes: Probe[]): ProbeResult[] {
  return probes.map((probe) => ({
    fact: probe.fact,
    type: probe.type,
    retained: probe.patterns.every((p) =>
      text.toLowerCase().includes(p.toLowerCase()),
    ),
  }));
}

const scenarios = ALL_SCENARIOS.filter((s) => s.probes && s.probes.length > 0);
const results: StrategyResult[] = [];

console.log("CTX-7: QTD + QPB Experiment");
console.log(`4 strategies × ${scenarios.length} scenarios\n`);

// ────────────────────────────────────────────────────────────
// Strategy 1: Full Context (ceiling)
// ────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(60));
console.log("Strategy: Full Context");
console.log("=".repeat(60));

for (const scenario of scenarios) {
  const strategy = new FullContextStrategy();
  process.stdout.write(`  ${scenario.name}...`);

  try {
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      strategy.addMessage({ role: "user", content: step });
      const ctx = await strategy.getContext();
      const response = await chat(
        ctx.messages,
        [scenario.systemPrompt, ctx.system].filter(Boolean).join("\n\n"),
      );
      strategy.addMessage({ role: "assistant", content: response.content });
      if ((i + 1) % 5 === 0) process.stdout.write(` [${i + 1}/${scenario.steps.length}]`);
    }

    // For Full Context, check the full transcript
    const ctx = await strategy.getContext();
    const fullText = ctx.messages.map((m) => m.content).join("\n");
    const probes = scenario.probes ?? [];
    const probeResults = checkProbesInText(fullText, probes);
    const kept = probeResults.filter((p) => p.retained).length;

    results.push({
      strategy: "Full Context",
      scenario: scenario.name,
      retained: kept,
      total: probes.length,
      cycles: 0,
      probeResults,
    });

    console.log(` ${kept}/${probes.length} retained`);
  } catch (err) {
    console.error(` FAILED: ${err}`);
  }
}

// ────────────────────────────────────────────────────────────
// Strategy 2: RLM(8) (incumbent)
// ────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(60));
console.log("Strategy: RLM(8)");
console.log("=".repeat(60));

for (const scenario of scenarios) {
  const strategy = new RLMStrategy(8, 4);
  strategy.enableLogging = true;
  process.stdout.write(`  ${scenario.name}...`);

  try {
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      strategy.addMessage({ role: "user", content: step });
      const ctx = await strategy.getContext();
      const response = await chat(
        ctx.messages,
        [scenario.systemPrompt, ctx.system].filter(Boolean).join("\n\n"),
      );
      strategy.addMessage({ role: "assistant", content: response.content });
      if ((i + 1) % 5 === 0) process.stdout.write(` [${i + 1}/${scenario.steps.length}]`);
    }

    // Trigger final compression
    strategy.addMessage({ role: "user", content: scenario.finalQuestion });
    await strategy.getContext();

    const log = strategy.delegationLog;
    const lastEntry = log[log.length - 1];
    const probes = scenario.probes ?? [];
    const probeResults = checkProbesInText(
      lastEntry?.content ?? "",
      probes,
    );
    const kept = probeResults.filter((p) => p.retained).length;

    results.push({
      strategy: "RLM(8)",
      scenario: scenario.name,
      retained: kept,
      total: probes.length,
      cycles: log.length,
      probeResults,
    });

    console.log(` ${kept}/${probes.length} retained (${log.length} cycles)`);
  } catch (err) {
    console.error(` FAILED: ${err}`);
  }
}

// ────────────────────────────────────────────────────────────
// Strategy 3: QTD (Query-Time Distillation)
// ────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(60));
console.log("Strategy: QTD");
console.log("=".repeat(60));

for (const scenario of scenarios) {
  const strategy = new QTDStrategy(8000, 4);
  strategy.enableLogging = true;
  process.stdout.write(`  ${scenario.name}...`);

  try {
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      strategy.addMessage({ role: "user", content: step });
      const ctx = await strategy.getContext();
      const response = await chat(
        ctx.messages,
        [scenario.systemPrompt, ctx.system].filter(Boolean).join("\n\n"),
      );
      strategy.addMessage({ role: "assistant", content: response.content });
      if ((i + 1) % 5 === 0) process.stdout.write(` [${i + 1}/${scenario.steps.length}]`);
    }

    // Final question triggers distillation
    strategy.addMessage({ role: "user", content: scenario.finalQuestion });
    const finalCtx = await strategy.getContext();

    // Check distilled knowledge (system prompt) + recent messages
    const checkText = [
      finalCtx.system ?? "",
      ...finalCtx.messages.map((m) => m.content),
    ].join("\n");

    const probes = scenario.probes ?? [];
    const probeResults = checkProbesInText(checkText, probes);
    const kept = probeResults.filter((p) => p.retained).length;
    const log = strategy.delegationLog;

    results.push({
      strategy: "QTD",
      scenario: scenario.name,
      retained: kept,
      total: probes.length,
      cycles: log.length,
      probeResults,
    });

    console.log(` ${kept}/${probes.length} retained (${log.length} distillations)`);
  } catch (err) {
    console.error(` FAILED: ${err}`);
  }
}

// ────────────────────────────────────────────────────────────
// Strategy 4: QPB (Quantity-Pinning Buffer)
// ────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(60));
console.log("Strategy: QPB");
console.log("=".repeat(60));

for (const scenario of scenarios) {
  const strategy = new QPBStrategy(8, 4);
  strategy.enableLogging = true;
  process.stdout.write(`  ${scenario.name}...`);

  try {
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      strategy.addMessage({ role: "user", content: step });
      const ctx = await strategy.getContext();
      const response = await chat(
        ctx.messages,
        [scenario.systemPrompt, ctx.system].filter(Boolean).join("\n\n"),
      );
      strategy.addMessage({ role: "assistant", content: response.content });
      if ((i + 1) % 5 === 0) process.stdout.write(` [${i + 1}/${scenario.steps.length}]`);
    }

    // Trigger final compression
    strategy.addMessage({ role: "user", content: scenario.finalQuestion });
    const finalCtx = await strategy.getContext();

    // Check delegated knowledge + pinned buffer + recent messages
    const checkText = [
      finalCtx.system ?? "",
      ...finalCtx.messages.map((m) => m.content),
    ].join("\n");

    const probes = scenario.probes ?? [];
    const probeResults = checkProbesInText(checkText, probes);
    const kept = probeResults.filter((p) => p.retained).length;
    const log = strategy.delegationLog;
    const pinnedCount = strategy.getPinnedBuffer().size;

    results.push({
      strategy: "QPB",
      scenario: scenario.name,
      retained: kept,
      total: probes.length,
      cycles: log.length,
      probeResults,
    });

    console.log(` ${kept}/${probes.length} retained (${log.length} cycles, ${pinnedCount} pinned)`);
  } catch (err) {
    console.error(` FAILED: ${err}`);
  }
}

// ────────────────────────────────────────────────────────────
// Summary
// ────────────────────────────────────────────────────────────
console.log("\n\n" + "═".repeat(70));
console.log("  SUMMARY: CTX-7 QTD + QPB Experiment");
console.log("═".repeat(70));

const strategyNames = ["Full Context", "RLM(8)", "QTD", "QPB"];
const probeTypes = ["entity", "phone/id", "relationship", "quantity", "date", "decision", "correction", "spatial"];

// Overall retention per strategy
console.log("\n  Overall retention:");
for (const sn of strategyNames) {
  const sResults = results.filter((r) => r.strategy === sn);
  const kept = sResults.reduce((s, r) => s + r.retained, 0);
  const total = sResults.reduce((s, r) => s + r.total, 0);
  const pct = total > 0 ? ((kept / total) * 100).toFixed(1) : "0.0";
  const bar = "█".repeat(Math.round((kept / total) * 20)).padEnd(20, "░");
  console.log(`    ${sn.padEnd(15)} ${bar} ${pct.padStart(5)}%  (${kept}/${total})`);
}

// Per-type retention
console.log("\n  Retention by probe type:");
console.log(`    ${"Type".padEnd(15)} ${"Full Ctx".padStart(9)} ${"RLM(8)".padStart(9)} ${"QTD".padStart(9)} ${"QPB".padStart(9)}`);
console.log("    " + "─".repeat(55));

for (const pt of probeTypes) {
  const row = [pt.padEnd(15)];
  for (const sn of strategyNames) {
    const sResults = results.filter((r) => r.strategy === sn);
    const typeProbes = sResults.flatMap((r) => r.probeResults.filter((p) => p.type === pt));
    const kept = typeProbes.filter((p) => p.retained).length;
    const total = typeProbes.length;
    if (total === 0) {
      row.push("  n/a".padStart(9));
    } else {
      row.push(`${((kept / total) * 100).toFixed(0)}%`.padStart(9));
    }
  }
  console.log(`    ${row.join("")}`);
}

// Save results
const ts = Date.now();
const outputPath = `results/qtd-qpb-experiment-${ts}.json`;
writeFileSync(
  outputPath,
  JSON.stringify(
    {
      experiment: "CTX-7: QTD + QPB",
      model: "gpt-5-nano",
      provider: "OpenCode Zen",
      timestamp: new Date().toISOString(),
      strategies: strategyNames,
      scenarioCount: scenarios.length,
      results,
    },
    null,
    2,
  ),
);

console.log(`\n  Results saved to ${outputPath}`);
console.log("═".repeat(70));
