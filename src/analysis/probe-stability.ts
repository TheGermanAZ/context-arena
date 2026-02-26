/**
 * Stability-Plasticity Decomposed Memory — Feasibility Probe
 *
 * Hypothesis: RLM achieves 0% retention on phone/ID and spatial facts because
 * they get paraphrased/dropped during text compression. Routing immutable
 * identifiers to an uncompressed "Stable" buffer (architectural protection)
 * while letting narrative flow through the "Plastic" RLM channel should
 * preserve them.
 *
 * Phase 1: Validate that a regex classifier can find stable facts in scenario text.
 * Phase 2: Run StabilityPlasticityStrategy on identifier-heavy scenarios and
 *          measure retention vs the 0% baseline.
 *
 * Kill criteria:
 * - Phase 1: classifier recall <80% on stable probes
 * - Phase 2: both phone/id AND spatial retention <60%
 */

import type { LLMMessage } from "../utils/llm";
import { ALL_SCENARIOS, type Scenario } from "../tasks/scenarios";
import {
  type ProbeStrategy,
  type ProbeRunResult,
  type FeasibilityResult,
  runScenarioWithProbes,
  aggregateRetentionByType,
  printRetentionTable,
  saveResults,
} from "./probe-utils";

// ── Stable classification types ─────────────────────────────────────

export interface StableClassification {
  value: string;
  type: "phone" | "id" | "code";
}

// ── classifyStable: regex-based immutable-identifier extractor ──────

export function classifyStable(text: string): StableClassification[] {
  const results: StableClassification[] = [];
  const seen = new Set<string>();

  const add = (value: string, type: StableClassification["type"]) => {
    if (!seen.has(value)) {
      seen.add(value);
      results.push({ value, type });
    }
  };

  // Phone numbers: supports both 7-digit (555-0147) and 10-digit (090-8765-4321) formats
  // Also supports dot separators and no separators
  const phoneRe = /\b(\d{3}[-.]?\d{3,4}[-.]?\d{4})\b/g;
  for (const m of text.matchAll(phoneRe)) {
    add(m[1]!, "phone");
  }
  // 7-digit local phone numbers: 3 digits, separator, 4 digits (e.g., 555-0147)
  const localPhoneRe = /\b(\d{3}[-.]?\d{4})\b/g;
  for (const m of text.matchAll(localPhoneRe)) {
    const val = m[1]!;
    // Only count as phone if near phone-related context or has a separator
    if (val.includes("-") || val.includes(".")) {
      if (!seen.has(val)) {
        add(val, "phone");
      }
    }
  }

  // Passport numbers: letter-dash-5to8digits (e.g., P-847291)
  const passportRe = /\b([A-Z]-\d{5,8})\b/g;
  for (const m of text.matchAll(passportRe)) {
    add(m[1]!, "id");
  }

  // ID codes: 2-4 uppercase letters, dash, 2-6 digits, optional dash+letter/digits
  // Matches: RMC-2847, HLT-99284-B, CLM-2024-0892
  const idCodeRe = /\b([A-Z]{2,4}-\d{2,6}(?:-[A-Z0-9]{1,4})?)\b/g;
  for (const m of text.matchAll(idCodeRe)) {
    if (!seen.has(m[1]!)) {
      add(m[1]!, "id");
    }
  }

  // Lowercase technical identifiers: region codes like us-east-1, us-west-2
  const techIdRe = /\b([a-z]{2,4}-[a-z]+-\d{1,2})\b/g;
  for (const m of text.matchAll(techIdRe)) {
    if (!seen.has(m[1]!)) {
      add(m[1]!, "id");
    }
  }

  // Alarm/pin codes: 4-6 digit codes near "code"/"pin"/"alarm"
  // Look for the keyword within ~60 chars of a 4-6 digit number
  const alarmRe = /\b(code|pin|alarm)\b/gi;
  for (const m of text.matchAll(alarmRe)) {
    const start = Math.max(0, m.index! - 60);
    const end = Math.min(text.length, m.index! + m[0].length + 60);
    const window = text.slice(start, end);
    const digitMatches = window.matchAll(/\b(\d{4,6})\b/g);
    for (const dm of digitMatches) {
      add(dm[1]!, "code");
    }
  }

  // Alphanumeric codes: flight codes (UA447), gate codes (B12), confirmation codes (XKRM47)
  // Pattern 1: 1-2 uppercase letters + 2-6 digits (e.g., UA447, B12)
  const alphaCode1Re = /\b([A-Z]{1,2}\d{2,6})\b/g;
  for (const m of text.matchAll(alphaCode1Re)) {
    const val = m[1]!;
    // Must be 3+ chars total
    if (val.length >= 3 && !seen.has(val)) {
      add(val, "code");
    }
  }

  // Pattern 2: 2-6 uppercase letters + 2-4 digits (e.g., XKRM47)
  const alphaCode2Re = /\b([A-Z]{2,6}\d{2,4})\b/g;
  for (const m of text.matchAll(alphaCode2Re)) {
    const val = m[1]!;
    // Must be 3+ chars total, and skip things already captured as ID codes
    if (val.length >= 3 && !seen.has(val)) {
      add(val, "code");
    }
  }

  return results;
}

// ── Phase 1: Validate classifier against known probes ───────────────

interface ClassifierValidation {
  scenarioName: string;
  totalStableProbes: number;
  hits: number;
  misses: string[];
}

function isStableProbeType(type: string): boolean {
  return type === "phone/id" || type === "spatial";
}

export function validateClassifier(scenario: Scenario): ClassifierValidation {
  const allText = scenario.steps.join("\n");
  const classified = classifyStable(allText);
  const classifiedValues = classified.map((c) => c.value.toLowerCase());

  const probes = (scenario.probes ?? []).filter((p) =>
    isStableProbeType(p.type)
  );

  let hits = 0;
  const misses: string[] = [];

  for (const probe of probes) {
    // A probe is "hit" if any classified value matches any of the probe's patterns
    const isHit = probe.patterns.some((pattern) =>
      classifiedValues.some(
        (cv) =>
          cv.includes(pattern.toLowerCase()) ||
          pattern.toLowerCase().includes(cv)
      )
    );
    if (isHit) {
      hits++;
    } else {
      misses.push(probe.fact);
    }
  }

  return {
    scenarioName: scenario.name,
    totalStableProbes: probes.length,
    hits,
    misses,
  };
}

// ── StabilityPlasticityStrategy ─────────────────────────────────────

export class StabilityPlasticityStrategy implements ProbeStrategy {
  name = "StabilityPlasticity";
  private messages: LLMMessage[] = [];
  private delegatedKnowledge: string[] = [];
  private stableBuffer: Map<string, string> = new Map(); // value -> sentence context
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
    this.stableBuffer = new Map();
    this.totalOverheadTokens = 0;
    this.messagesSinceDelegation = 0;
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
    this.messagesSinceDelegation++;

    // Only classify user messages for stable facts
    if (message.role === "user") {
      const classified = classifyStable(message.content);
      for (const item of classified) {
        // Extract sentence context: find the sentence containing the value
        const sentences = message.content.split(/[.!?]+/).filter(Boolean);
        const context =
          sentences.find((s) =>
            s.toLowerCase().includes(item.value.toLowerCase())
          ) || message.content;
        this.stableBuffer.set(item.value, context.trim());
      }
    }
  }

  async getContext(): Promise<{
    messages: LLMMessage[];
    system?: string;
    memoryOverheadTokens: number;
  }> {
    let overheadThisStep = 0;

    // Plastic channel: standard RLM delegation when threshold reached
    if (
      this.messagesSinceDelegation >= this.delegateEvery &&
      this.messages.length > this.recentWindow
    ) {
      // Lazy import to avoid OpenAI client initialization at module load time
      const { chat } = await import("../utils/llm");

      const toDelegate = this.messages.slice(
        0,
        this.messages.length - this.recentWindow
      );

      const transcript = toDelegate
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const existingKnowledge =
        this.delegatedKnowledge.length > 0
          ? `Previously extracted knowledge:\n${this.delegatedKnowledge.join("\n")}\n\n`
          : "";

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
        "You are a precise sub-agent in a Recursive Language Model system. Your output will be the ONLY record of this conversation segment. If you miss a detail, it is lost forever. Be thorough and exact."
      );

      overheadThisStep = subLLMResult.inputTokens + subLLMResult.outputTokens;
      this.totalOverheadTokens += overheadThisStep;

      this.delegatedKnowledge = [subLLMResult.content];
      this.messages = this.messages.slice(-this.recentWindow);
      this.messagesSinceDelegation = 0;
    }

    // Build recombined system prompt: Stable + Plastic channels
    const messages: LLMMessage[] = [...this.messages];
    const startIdx = messages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? messages.slice(startIdx) : messages;

    const systemParts: string[] = [];

    // Stable channel: uncompressed verbatim facts
    if (this.stableBuffer.size > 0) {
      const stableEntries = Array.from(this.stableBuffer.entries())
        .map(([value, context]) => `- ${value}: ${context}`)
        .join("\n");
      systemParts.push(`STABLE FACTS (verbatim):\n${stableEntries}`);
    }

    // Plastic channel: RLM-delegated knowledge
    if (this.delegatedKnowledge.length > 0) {
      systemParts.push(
        `DELEGATED KNOWLEDGE:\n${this.delegatedKnowledge.join("\n\n")}`
      );
    }

    return {
      messages: clean,
      system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
      memoryOverheadTokens: overheadThisStep,
    };
  }
}

// ── Main: Phase 1 (classifier) + Phase 2 (LLM runs) ────────────────

async function main() {
  console.log("=== Stability-Plasticity Decomposed Memory Probe ===\n");

  // ── Phase 1: Validate classifier ──────────────────────────────────
  console.log("--- Phase 1: Classifier Validation ---\n");

  const scenariosWithProbes = ALL_SCENARIOS.filter(
    (s) => s.probes && s.probes.some((p) => isStableProbeType(p.type))
  );

  let totalStable = 0;
  let totalHits = 0;
  const validations: ClassifierValidation[] = [];

  for (const scenario of scenariosWithProbes) {
    const result = validateClassifier(scenario);
    validations.push(result);
    totalStable += result.totalStableProbes;
    totalHits += result.hits;

    const recall =
      result.totalStableProbes > 0
        ? ((result.hits / result.totalStableProbes) * 100).toFixed(0)
        : "N/A";
    console.log(
      `  ${scenario.name}: ${result.hits}/${result.totalStableProbes} (${recall}%)`
    );
    if (result.misses.length > 0) {
      for (const miss of result.misses) {
        console.log(`    MISS: ${miss}`);
      }
    }
  }

  const overallRecall =
    totalStable > 0 ? (totalHits / totalStable) * 100 : 0;
  console.log(
    `\n  Overall classifier recall: ${totalHits}/${totalStable} (${overallRecall.toFixed(1)}%)`
  );

  if (overallRecall < 80) {
    console.log(
      "\n  KILL: Classifier recall <80% on stable probes. Cannot proceed to Phase 2."
    );
    const feasibility: FeasibilityResult = {
      proposal: "stability-plasticity",
      phase1: {
        passed: false,
        details: {
          recall: overallRecall,
          validations,
        },
      },
      phase2: { runs: [], retentionByType: {}, comparisonToBaseline: {} },
      killCriteriaMet: true,
      recommendation: "abandon",
    };
    await saveResults("stability-plasticity", feasibility);
    return;
  }

  console.log("\n  Phase 1 PASSED. Proceeding to Phase 2.\n");

  // ── Phase 2: Run StabilityPlasticityStrategy ──────────────────────
  console.log("--- Phase 2: LLM Probe Runs ---\n");

  // Scenario 1 (Early Fact Recall — identifier-heavy) + Scenario 6 (Cascading Corrections)
  const targetScenarios = ALL_SCENARIOS.filter(
    (s) =>
      s.name === "Early Fact Recall" || s.name === "Cascading Corrections"
  );

  const allRuns: ProbeRunResult[] = [];
  const repsPerScenario = 2;

  for (const scenario of targetScenarios) {
    console.log(`\n  Scenario: ${scenario.name}`);
    for (let rep = 0; rep < repsPerScenario; rep++) {
      console.log(`    Rep ${rep + 1}/${repsPerScenario}...`);
      const strategy = new StabilityPlasticityStrategy(8, 4);
      const result = await runScenarioWithProbes(strategy, scenario);
      result.rep = rep + 1;
      allRuns.push(result);
      console.log(
        `    Result: ${result.retainedCount}/${result.totalProbes} retained`
      );
    }
  }

  // Print results
  printRetentionTable(allRuns, "Stability-Plasticity Probe Results");

  const retentionByType = aggregateRetentionByType(allRuns);

  // Baseline comparison (RLM baseline: 0% for phone/id and spatial)
  const baseline: Record<string, number> = {
    "phone/id": 0,
    spatial: 0,
  };
  const comparisonToBaseline: Record<string, number> = {};
  for (const [type, rate] of Object.entries(retentionByType)) {
    comparisonToBaseline[type] = rate - (baseline[type] ?? 0);
  }

  console.log("\n  Comparison to RLM baseline (0% phone/id, 0% spatial):");
  for (const [type, delta] of Object.entries(comparisonToBaseline)) {
    const sign = delta >= 0 ? "+" : "";
    console.log(`    ${type}: ${sign}${(delta * 100).toFixed(0)}pp`);
  }

  // Kill criteria: both phone/id AND spatial <60%
  const phoneIdRetention = retentionByType["phone/id"] ?? 0;
  const spatialRetention = retentionByType["spatial"] ?? 0;
  const killCriteriaMet =
    phoneIdRetention < 0.6 && spatialRetention < 0.6;

  let recommendation: "proceed" | "refine" | "abandon";
  if (killCriteriaMet) {
    recommendation = "abandon";
    console.log(
      `\n  KILL: Both phone/id (${(phoneIdRetention * 100).toFixed(0)}%) and spatial (${(spatialRetention * 100).toFixed(0)}%) <60%.`
    );
  } else if (phoneIdRetention >= 0.6 || spatialRetention >= 0.6) {
    recommendation = "proceed";
    console.log(
      `\n  PROCEED: At least one target type >=60%. Stability-Plasticity shows promise.`
    );
  } else {
    recommendation = "refine";
    console.log(`\n  REFINE: Mixed results. Consider tuning classifier.`);
  }

  const feasibility: FeasibilityResult = {
    proposal: "stability-plasticity",
    phase1: {
      passed: true,
      details: {
        recall: overallRecall,
        validations,
      },
    },
    phase2: {
      runs: allRuns,
      retentionByType,
      comparisonToBaseline,
    },
    killCriteriaMet,
    recommendation,
  };

  await saveResults("stability-plasticity", feasibility);
  console.log("\nDone.");
}

// Run when executed directly (not when imported by tests)
const isMainModule =
  typeof Bun !== "undefined" && Bun.main === import.meta.path;
if (isMainModule) {
  main().catch(console.error);
}
