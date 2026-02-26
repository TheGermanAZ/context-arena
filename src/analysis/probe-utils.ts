import type { LLMMessage } from "../utils/llm";
import { ALL_SCENARIOS, type Probe, type ProbeType, type Scenario } from "../tasks/scenarios";

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
  // Lazy import to avoid OpenAI client initialization at module load time.
  // This keeps pure utility functions (checkProbeRetained, buildTranscript, etc.)
  // testable without an API key.
  const { chat } = await import("../utils/llm");

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
