/**
 * RLM Information Loss Analysis (CTX-1)
 *
 * Runs the RLM strategy across all scenarios with delegation logging enabled,
 * then checks each probe fact against each delegation cycle's sub-LLM output.
 * Produces a retention-by-type report showing which fact categories decay fastest.
 *
 * Usage: bun src/analysis/rlm-loss.ts
 */

import { RLMStrategy, type DelegationLogEntry } from "../strategies/rlm";
import { chat } from "../utils/llm";
import { ALL_SCENARIOS, type Probe, type ProbeType, type Scenario } from "../tasks/scenarios";

// ── Types ──────────────────────────────────────────────────────────

interface ProbeResult {
  fact: string;
  type: ProbeType;
  introducedAtStep: number;
  /** For each delegation cycle, was this probe retained? */
  retainedByCycle: boolean[];
  /** The cycle number where the probe was first lost (0 = never lost) */
  firstLostAtCycle: number;
}

interface ScenarioResult {
  scenarioName: string;
  probeResults: ProbeResult[];
  delegationCycles: number;
  delegationLog: DelegationLogEntry[];
}

interface RetentionByType {
  type: ProbeType;
  totalProbes: number;
  /** Retention rate at each cycle index (0 = after cycle 1) */
  retentionByCycle: number[];
  /** Overall retention rate across all cycles */
  overallRetention: number;
  /** Probes of this type that were lost, with details */
  losses: Array<{ scenario: string; fact: string; lostAtCycle: number }>;
}

// ── Probe checking ─────────────────────────────────────────────────

function checkProbeRetained(probe: Probe, content: string): boolean {
  const lower = content.toLowerCase();
  return probe.patterns.every((pattern) => lower.includes(pattern.toLowerCase()));
}

// ── Run a single scenario with logging ─────────────────────────────

async function runScenarioWithLogging(
  scenario: Scenario,
): Promise<ScenarioResult> {
  const strategy = new RLMStrategy(8, 4);
  strategy.enableLogging = true;

  console.log(`\n  Running: RLM × ${scenario.name} (${scenario.steps.length} steps)...`);

  for (let i = 0; i < scenario.steps.length; i++) {
    strategy.addMessage({ role: "user", content: scenario.steps[i]! });

    const context = await strategy.getContext();
    const response = await chat(
      context.messages,
      [scenario.systemPrompt, context.system].filter(Boolean).join("\n\n"),
    );

    strategy.addMessage({ role: "assistant", content: response.content });

    if ((i + 1) % 5 === 0) {
      process.stdout.write(
        `    Step ${i + 1}/${scenario.steps.length} (delegations so far: ${strategy.delegationLog.length})\n`,
      );
    }
  }

  // Also run the final question to trigger any remaining delegation
  strategy.addMessage({ role: "user", content: scenario.finalQuestion });
  await strategy.getContext();

  const probes = scenario.probes ?? [];
  const log = strategy.delegationLog;
  const probeResults: ProbeResult[] = probes.map((probe) => {
    const retainedByCycle = log.map((logEntry) =>
      checkProbeRetained(probe, logEntry.content),
    );

    // Find first cycle where probe was introduced but not retained
    const firstLostIdx = retainedByCycle.findIndex((retained, idx) => {
      // Not yet introduced at this cycle's step — skip
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

  console.log(
    `  Completed: ${strategy.delegationLog.length} delegation cycles, ${probes.length} probes`,
  );

  return {
    scenarioName: scenario.name,
    probeResults,
    delegationCycles: strategy.delegationLog.length,
    delegationLog: strategy.delegationLog,
  };
}

// ── Aggregate results ──────────────────────────────────────────────

function aggregateByType(results: ScenarioResult[]): RetentionByType[] {
  const typeMap = new Map<ProbeType, RetentionByType>();

  // Find max cycles across all scenarios
  const maxCycles = Math.max(...results.map((r) => r.delegationCycles));

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

      // Count retention at each cycle
      for (let c = 0; c < probe.retainedByCycle.length; c++) {
        if (probe.retainedByCycle[c]) {
          entry.retentionByCycle[c]!++;
        }
      }

      // Track losses
      if (probe.firstLostAtCycle > 0) {
        entry.losses.push({
          scenario: result.scenarioName,
          fact: probe.fact,
          lostAtCycle: probe.firstLostAtCycle,
        });
      }
    }
  }

  // Convert counts to rates
  for (const entry of Array.from(typeMap.values())) {
    const countsPerCycle = entry.retentionByCycle;
    entry.retentionByCycle = countsPerCycle.map((count) =>
      entry.totalProbes > 0 ? count / entry.totalProbes : 0,
    );

    // Overall = how many probes survived all their cycles
    const neverLost = entry.totalProbes - entry.losses.length;
    entry.overallRetention = entry.totalProbes > 0
      ? neverLost / entry.totalProbes
      : 0;
  }

  // Sort by retention (worst first)
  return [...typeMap.values()].sort(
    (a, b) => a.overallRetention - b.overallRetention,
  );
}

// ── Report ─────────────────────────────────────────────────────────

function printReport(
  results: ScenarioResult[],
  byType: RetentionByType[],
): void {
  console.log("\n" + "═".repeat(70));
  console.log("  RLM INFORMATION LOSS ANALYSIS — RETENTION BY FACT TYPE");
  console.log("═".repeat(70));

  // 1. Overall retention by type
  console.log("\n── Retention Rate by Fact Type (worst → best) ──\n");
  for (const t of byType) {
    const pct = (t.overallRetention * 100).toFixed(0);
    const bar = "█".repeat(Math.round(t.overallRetention * 20)).padEnd(20, "░");
    console.log(
      `  ${t.type.padEnd(14)} ${bar} ${pct.padStart(3)}%  (${t.totalProbes - t.losses.length}/${t.totalProbes} probes retained)`,
    );
  }

  // 2. Retention curve by cycle
  const maxCycles = Math.max(...results.map((r) => r.delegationCycles));
  if (maxCycles > 0) {
    console.log("\n── Retention Curve by Delegation Cycle ──\n");
    console.log("  Type".padEnd(16) + Array.from({ length: maxCycles }, (_, i) => `C${i + 1}`.padStart(6)).join(""));
    console.log("  " + "─".repeat(14 + maxCycles * 6));
    for (const t of byType) {
      const cells = t.retentionByCycle.slice(0, maxCycles).map((r) => {
        const pct = (r * 100).toFixed(0);
        return `${pct}%`.padStart(6);
      });
      console.log(`  ${t.type.padEnd(14)}${cells.join("")}`);
    }
  }

  // 3. Per-scenario breakdown
  console.log("\n── Per-Scenario Probe Results ──\n");
  for (const result of results) {
    console.log(`  ${result.scenarioName} (${result.delegationCycles} cycles):`);
    for (const probe of result.probeResults) {
      const status = probe.firstLostAtCycle === 0
        ? "  KEPT"
        : `  LOST@C${probe.firstLostAtCycle}`;
      const cycleDetail = probe.retainedByCycle
        .map((r) => (r ? "✓" : "✗"))
        .join("");
      console.log(
        `    ${status}  [${probe.type.padEnd(12)}] ${probe.fact}  (${cycleDetail})`,
      );
    }
    console.log();
  }

  // 4. Worst losses
  const allLosses = byType.flatMap((t) =>
    t.losses.map((l) => ({ ...l, type: t.type })),
  );
  if (allLosses.length > 0) {
    console.log("── Earliest Losses (facts lost at cycle 1) ──\n");
    const earlest = allLosses
      .filter((l) => l.lostAtCycle === 1)
      .sort((a, b) => a.type.localeCompare(b.type));
    for (const l of earlest) {
      console.log(`  [${l.type.padEnd(12)}] ${l.scenario}: ${l.fact}`);
    }
    if (earlest.length === 0) {
      console.log("  None — all losses happen at cycle 2+");
    }
  }

  console.log("\n" + "═".repeat(70));
}

// ── Main ───────────────────────────────────────────────────────────

async function main() {
  console.log("RLM Information Loss Analysis (CTX-1)");
  console.log("Running RLM(8) across all scenarios with delegation logging...\n");

  const scenariosWithProbes = ALL_SCENARIOS.filter(
    (s) => s.probes && s.probes.length > 0,
  );

  if (scenariosWithProbes.length === 0) {
    console.error("No scenarios have probes defined. Aborting.");
    process.exit(1);
  }

  console.log(`Found ${scenariosWithProbes.length} scenarios with probes.\n`);

  const results: ScenarioResult[] = [];
  for (const scenario of scenariosWithProbes) {
    const result = await runScenarioWithLogging(scenario);
    results.push(result);
  }

  const byType = aggregateByType(results);
  printReport(results, byType);

  // Save raw data
  const outputPath = `results/rlm-loss-${Date.now()}.json`;
  await Bun.write(
    outputPath,
    JSON.stringify({ results, byType }, null, 2),
  );
  console.log(`\nRaw data saved to ${outputPath}`);
}

main().catch(console.error);
