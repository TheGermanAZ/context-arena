/**
 * Probe: Depth-Adaptive RLM (DA-RLM) — Proposal #1
 *
 * Tests whether a regex-based Content Assessor can predict when depth-2
 * helps vs. hurts, then benchmarks the adaptive routing.
 *
 * Background: CTX-2 found depth-2 has bimodal effect:
 *   - Self-correction on dense segments (Early Fact Recall: 10%->80%)
 *   - Noise amplification on noisy segments (Long Horizon + Noise: 87.5%->37.5%)
 * DA-RLM routes to the right depth per-segment.
 */

import type { LLMMessage } from "../utils/llm";
// DeepRLMStrategy is imported lazily to avoid OpenAI client initialization at
// module load time. This keeps the pure signal functions testable without an API key.
import { ALL_SCENARIOS, type Scenario } from "../tasks/scenarios";
import {
  type ProbeStrategy,
  type ProbeRunResult,
  runScenarioWithProbes,
  aggregateRetentionByType,
  printRetentionTable,
  saveResults,
  buildTranscript,
} from "./probe-utils";

// ── Content Assessor Signal Types ─────────────────────────────────

export interface AssessorSignals {
  informationDensity: number;
  correctionFrequency: number;
  identifierDensity: number;
  noiseRatio: number;
  knowledgeSize: number;
}

// ── Signal Functions (all regex-based, zero LLM calls) ────────────

/**
 * Entities per 100 tokens. Counts:
 * - Named entities (capitalized multi-word sequences)
 * - Numbers ($amounts, plain digits with 2+ digits)
 * - ID codes (UPPER-digits patterns)
 */
export function informationDensity(text: string): number {
  // Approximate token count (words)
  const tokens = text.split(/\s+/).filter(Boolean).length;
  if (tokens === 0) return 0;

  // Named entities: capitalized multi-word sequences (e.g., "Dr. Sarah Chen", "Project Mercury")
  const namedEntities = text.match(
    /\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g,
  ) ?? [];

  // Numbers: $amounts, plain digits with 2+ digits
  const numbers = text.match(
    /\$[\d,]+(?:\.\d+)?|\b\d{2,}(?:,\d{3})*(?:\.\d+)?\b/g,
  ) ?? [];

  // ID codes: UPPER-digits patterns (e.g., "RMC-2847", "HLT-99284-B")
  const idCodes = text.match(
    /\b[A-Z]{2,}[-]?\d+(?:[-][A-Z0-9]+)*\b/g,
  ) ?? [];

  const entityCount = namedEntities.length + numbers.length + idCodes.length;
  return (entityCount / tokens) * 100;
}

/**
 * Count of correction markers in text.
 * Markers: "actually", "wait", "corrected", "updated", "changed",
 * "instead of", "rather than", "no longer", "was $X...now $Y"
 */
export function correctionFrequency(text: string): number {
  const lower = text.toLowerCase();

  const markers = [
    /\bactually\b/g,
    /\bwait\b/g,
    /\bcorrected\b/g,
    /\bupdated\b/g,
    /\bchanged\b/g,
    /\binstead of\b/g,
    /\brather than\b/g,
    /\bno longer\b/g,
    /\bwas\s+.{1,30}now\b/g,
  ];

  let count = 0;
  for (const pattern of markers) {
    const matches = lower.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

/**
 * Count of unique identifiers: phone numbers, ID codes (ABC-1234 patterns),
 * and alphanumeric codes.
 */
export function identifierDensity(text: string): number {
  const ids = new Set<string>();

  // Phone numbers (various formats: 555-0147, 090-1234-5678, 555.0147)
  const phones = text.match(
    /\b\d{3}[-.]?\d{3,4}[-.]?\d{4}\b|\b\d{3}[-.]?\d{4}\b/g,
  ) ?? [];
  for (const p of phones) ids.add(p);

  // ID codes: UPPER-digits patterns (e.g., "RMC-2847", "HLT-99284-B", "CLM-2024-0892")
  const idCodes = text.match(
    /\b[A-Z]{2,}[-]?\d+(?:[-][A-Z0-9]+)*\b/g,
  ) ?? [];
  for (const id of idCodes) ids.add(id);

  // Alphanumeric codes: mixed letters and digits, at least 4 chars, with both present
  // e.g., "XKRM47", "P-847291"
  const alphanum = text.match(
    /\b[A-Z][-]?\d{3,}\b|\b[A-Z]{2,}\d{2,}\b/g,
  ) ?? [];
  for (const a of alphanum) ids.add(a);

  return ids.size;
}

/**
 * Fraction of messages with no numbers (2+ digits), no named entities
 * (capitalized 3+ chars, mid-sentence to filter out sentence-start caps),
 * and no identifiers.
 */
export function noiseRatio(messages: string[]): number {
  if (messages.length === 0) return 0;

  let noiseCount = 0;
  for (const msg of messages) {
    const hasNumbers = /\d{2,}/.test(msg);
    // Mid-sentence capitalized words (proper nouns) — preceded by space, not sentence start
    const hasNamedEntities = /(?<=\s)[A-Z][a-z]{2,}\b/.test(msg);
    const hasIdentifiers = /\b[A-Z]{2,}[-]?\d+\b/.test(msg);

    if (!hasNumbers && !hasNamedEntities && !hasIdentifiers) {
      noiseCount++;
    }
  }

  return noiseCount / messages.length;
}

// ── Depth Router ──────────────────────────────────────────────────

/**
 * Rule-based router that selects depth based on content assessor signals.
 */
export function routeDepth(signals: AssessorSignals): 1 | 2 | 3 {
  if (signals.noiseRatio > 0.5) return 1; // protect against noise amplification
  if (signals.identifierDensity > 3) return 1; // IDs degrade at depth > 1
  if (signals.informationDensity > 10 && signals.correctionFrequency > 0) return 2;
  if (signals.correctionFrequency > 3) return 3; // deep reconciliation
  if (signals.knowledgeSize > 4000) return 1; // Scaling Paradox protection
  return 1; // conservative default
}

// ── Phase 1: Scenario Assessment ──────────────────────────────────

interface AssessmentResult {
  scenario: string;
  signals: AssessorSignals;
  routedDepth: 1 | 2 | 3;
  expectedDepth: number | null;
  match: boolean | null;
}

/**
 * Ground truth map: scenarios where we know depth-2 behavior from CTX-2 results.
 */
const GROUND_TRUTH: Record<string, number> = {
  "Early Fact Recall": 2,       // depth-2 improved retention dramatically (10%->80%)
  "Long Horizon + Noise": 1,    // depth-2 hurt due to noise amplification (87.5%->37.5%)
};

/**
 * Assess a scenario using content signals and route to depth.
 */
export function assessScenario(scenario: Scenario): AssessmentResult {
  // Build transcript from steps
  const messages = scenario.steps;
  const fullText = messages.join(" ");

  const signals: AssessorSignals = {
    informationDensity: informationDensity(fullText),
    correctionFrequency: correctionFrequency(fullText),
    identifierDensity: identifierDensity(fullText),
    noiseRatio: noiseRatio(messages),
    knowledgeSize: fullText.split(/\s+/).filter(Boolean).length,
  };

  const routedDepth = routeDepth(signals);
  const expectedDepth = GROUND_TRUTH[scenario.name] ?? null;
  const match = expectedDepth !== null ? routedDepth === expectedDepth : null;

  return {
    scenario: scenario.name,
    signals,
    routedDepth,
    expectedDepth,
    match,
  };
}

// ── Phase 2: DA-RLM Strategy ─────────────────────────────────────

/**
 * Depth-Adaptive RLM strategy. Internally maintains two DeepRLMStrategy
 * instances (depth-1 and depth-2), mirrors addMessage to both.
 * In getContext, computes assessor signals on recent messages and
 * delegates to the appropriate inner strategy.
 *
 * Uses lazy initialization + message buffering to avoid triggering
 * OpenAI client initialization at module import time.
 */
export class DARLMStrategy implements ProbeStrategy {
  name = "DA-RLM";
  private depth1: ProbeStrategy | null = null;
  private depth2: ProbeStrategy | null = null;
  private recentMessages: LLMMessage[] = [];
  private pendingMessages: LLMMessage[] = [];
  private initialized = false;
  private delegateEvery: number;
  private recentWindow: number;

  constructor(delegateEvery = 8, recentWindow = 4) {
    this.delegateEvery = delegateEvery;
    this.recentWindow = recentWindow;
  }

  /** Lazy-init inner strategies and replay buffered messages. */
  private async ensureStrategies(): Promise<void> {
    if (this.initialized) return;
    const { DeepRLMStrategy } = await import("../strategies/deep-rlm");
    this.depth1 = new DeepRLMStrategy(1, this.delegateEvery, this.recentWindow);
    this.depth2 = new DeepRLMStrategy(2, this.delegateEvery, this.recentWindow);
    // Replay any buffered messages
    for (const msg of this.pendingMessages) {
      this.depth1.addMessage(msg);
      this.depth2.addMessage(msg);
    }
    this.pendingMessages = [];
    this.initialized = true;
  }

  reset(): void {
    this.depth1?.reset();
    this.depth2?.reset();
    this.recentMessages = [];
    this.pendingMessages = [];
  }

  addMessage(message: LLMMessage): void {
    if (this.initialized) {
      this.depth1!.addMessage(message);
      this.depth2!.addMessage(message);
    } else {
      this.pendingMessages.push(message);
    }
    this.recentMessages.push(message);
    // Keep only last 10 messages for signal computation
    if (this.recentMessages.length > 10) {
      this.recentMessages = this.recentMessages.slice(-10);
    }
  }

  async getContext(): Promise<{
    messages: LLMMessage[];
    system?: string;
    memoryOverheadTokens: number;
  }> {
    await this.ensureStrategies();

    // Compute signals on recent messages
    const recentTexts = this.recentMessages.map((m) => m.content);
    const fullText = recentTexts.join(" ");

    const signals: AssessorSignals = {
      informationDensity: informationDensity(fullText),
      correctionFrequency: correctionFrequency(fullText),
      identifierDensity: identifierDensity(fullText),
      noiseRatio: noiseRatio(recentTexts),
      knowledgeSize: fullText.split(/\s+/).filter(Boolean).length,
    };

    const depth = routeDepth(signals);

    // Delegate to the appropriate inner strategy
    if (depth >= 2) {
      return this.depth2!.getContext();
    } else {
      return this.depth1!.getContext();
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log("=" .repeat(70));
  console.log("  DA-RLM Feasibility Probe (Proposal #1)");
  console.log("=" .repeat(70));

  // ── Phase 1: Assess all scenarios ──
  console.log("\n--- Phase 1: Content Assessor Routing ---\n");

  const assessments: AssessmentResult[] = [];
  for (const scenario of ALL_SCENARIOS) {
    const result = assessScenario(scenario);
    assessments.push(result);
  }

  // Print routing table
  console.log(
    "Scenario".padEnd(30) +
      "Routed".padEnd(8) +
      "Expected".padEnd(10) +
      "Match".padEnd(8) +
      "InfoDens".padEnd(10) +
      "Correct".padEnd(9) +
      "IDDens".padEnd(8) +
      "Noise".padEnd(8) +
      "KnSize"
  );
  console.log("-".repeat(100));

  for (const a of assessments) {
    const expected = a.expectedDepth !== null ? `d=${a.expectedDepth}` : "-";
    const match =
      a.match === null ? "-" : a.match ? "YES" : "NO";
    console.log(
      a.scenario.padEnd(30) +
        `d=${a.routedDepth}`.padEnd(8) +
        expected.padEnd(10) +
        match.padEnd(8) +
        a.signals.informationDensity.toFixed(1).padEnd(10) +
        String(a.signals.correctionFrequency).padEnd(9) +
        String(a.signals.identifierDensity).padEnd(8) +
        a.signals.noiseRatio.toFixed(2).padEnd(8) +
        String(a.signals.knowledgeSize)
    );
  }

  // Check kill criteria: >= 75% ground-truth match
  const withGroundTruth = assessments.filter((a) => a.match !== null);
  const matches = withGroundTruth.filter((a) => a.match === true).length;
  const matchRate = withGroundTruth.length > 0
    ? matches / withGroundTruth.length
    : 0;

  console.log(
    `\nGround truth match: ${matches}/${withGroundTruth.length} (${(matchRate * 100).toFixed(0)}%)`
  );

  const phase1Pass = matchRate >= 0.75;
  console.log(
    `Kill criteria (>=75%): ${phase1Pass ? "PASSED" : "FAILED"}`
  );

  if (!phase1Pass) {
    console.log("\nPhase 1 FAILED. Stopping probe.");
    const result = {
      proposal: "da-rlm",
      phase1: {
        passed: false,
        details: {
          assessments,
          matchRate,
        },
      },
      phase2: { runs: [], retentionByType: {}, comparisonToBaseline: {} },
      killCriteriaMet: true,
      recommendation: "refine" as const,
    };
    await saveResults("da-rlm", result);
    return;
  }

  // ── Phase 2: Run DA-RLM on key scenarios ──
  console.log("\n--- Phase 2: DA-RLM Benchmark ---\n");

  const targetScenarios = ALL_SCENARIOS.filter(
    (s) => s.name === "Early Fact Recall" || s.name === "Long Horizon + Noise"
  );
  const reps = 2;
  const runs: ProbeRunResult[] = [];

  for (const scenario of targetScenarios) {
    for (let rep = 0; rep < reps; rep++) {
      console.log(`  Running ${scenario.name} (rep ${rep + 1}/${reps})...`);
      const strategy = new DARLMStrategy();
      const result = await runScenarioWithProbes(strategy, scenario);
      result.rep = rep + 1;
      runs.push(result);
      const pct = ((result.retainedCount / result.totalProbes) * 100).toFixed(1);
      console.log(
        `    => ${result.retainedCount}/${result.totalProbes} probes retained (${pct}%)\n`
      );
    }
  }

  printRetentionTable(runs, "DA-RLM Retention");

  // Baselines from CTX-2
  const baselines: Record<string, number> = {
    "depth-1": 59.7,
    "depth-2": 66.1,
  };

  const overallRetained = runs.reduce((s, r) => s + r.retainedCount, 0);
  const overallTotal = runs.reduce((s, r) => s + r.totalProbes, 0);
  const overallPct = overallTotal > 0 ? (overallRetained / overallTotal) * 100 : 0;

  console.log("\n--- Comparison to Baselines ---");
  console.log(`  DA-RLM:  ${overallPct.toFixed(1)}%`);
  for (const [name, pct] of Object.entries(baselines)) {
    const delta = overallPct - pct;
    console.log(`  ${name}: ${pct}% (delta: ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}pp)`);
  }

  const retentionByType = aggregateRetentionByType(runs);
  const comparisonToBaseline: Record<string, number> = {};
  for (const [name, pct] of Object.entries(baselines)) {
    comparisonToBaseline[name] = overallPct - pct;
  }

  const result = {
    proposal: "da-rlm",
    phase1: {
      passed: true,
      details: {
        assessments,
        matchRate,
      },
    },
    phase2: {
      runs,
      retentionByType,
      comparisonToBaseline,
    },
    killCriteriaMet: false,
    recommendation: overallPct > baselines["depth-2"]! ? ("proceed" as const) : ("refine" as const),
  };

  await saveResults("da-rlm", result);

  console.log(
    `\nRecommendation: ${result.recommendation.toUpperCase()}`
  );
}

// Run when executed directly
const isMainModule =
  typeof Bun !== "undefined" &&
  Bun.main === import.meta.path;

if (isMainModule) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
