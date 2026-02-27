/**
 * Stability-Plasticity Decomposed Memory — Feasibility Probe (v2)
 *
 * Hypothesis H1: RLM loses phone/ID facts during text compression. Routing
 * identifiers to an uncompressed "Stable" buffer should preserve them.
 *
 * Hypothesis H2: RLM loses exact quantities (currency, percentages, counts).
 * Pinning detected quantities to the stable buffer should improve retention.
 *
 * Phase 1: Validate regex classifier recall on phone/id + quantity probes.
 * Phase 2: Run StabilityPlasticity AND baseline RLM on ALL 8 scenarios (2 reps).
 *          Compare per-type retention deltas.
 *
 * Kill criteria (per-hypothesis):
 * - Phase 1: classifier recall <70% on stable probes
 * - H1: phone/id delta < +15pp vs baseline
 * - H2: quantity delta < +10pp vs baseline
 * - Side effects: any other type drops > 15pp
 * Kill if BOTH H1 and H2 fail, or any side effect exceeds threshold.
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
  type: "phone" | "id" | "code" | "quantity";
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

  // ── Quantity patterns (conservative: currency, percentage, number+unit) ──

  // Currency: $347,250 | $1.5M | $175K | $24.99 | $12,400
  const currencyRe = /(\$[\d,]+(?:\.\d+)?[KkMmBb]?)\b/g;
  for (const m of text.matchAll(currencyRe)) {
    add(m[1]!, "quantity");
  }

  // Percentages: 85% | 16.67% | 20%
  const pctRe = /\b(\d+(?:\.\d+)?%)/g;
  for (const m of text.matchAll(pctRe)) {
    add(m[1]!, "quantity");
  }

  // Number + unit: "24 people" | "10mg" | "50 seats" | "13 months" | "7 years"
  const numUnitRe = /\b(\d[\d,.]*\s*(?:people|persons?|seats?|rooms?|units?|months?|years?|days?|hours?|minutes?|meals?|buses|requests?|engineers?|mg|oz|ml|lbs?|kg|miles?|km|floors?|screens?|shares?))\b/gi;
  for (const m of text.matchAll(numUnitRe)) {
    const val = m[1]!.replace(/\s+/g, " ").trim();
    if (!seen.has(val.toLowerCase())) {
      seen.add(val.toLowerCase());
      results.push({ value: val, type: "quantity" });
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
  return type === "phone/id" || type === "quantity";
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

// ── Main: Phase 1 (classifier) + Phase 2 (strategy comparison) ──────

async function main() {
  console.log("=== Stability-Plasticity + Quantity-Pinning Probe (v2) ===\n");

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

  // False positive check on noise text (Scenario 5 chit-chat steps)
  const noiseSteps = [
    "Oh by the way, did you see that game last night? The Lakers won 112-108. LeBron had 34 points. Crazy game.",
    "What's a good recipe for chicken tikka masala? I want to make it this weekend.",
    "Can you explain how blockchain works? I keep hearing about it at work.",
    "What's the weather usually like in Cancun in April? We might go for spring break.",
    "Random thought: do you think AI will replace software engineers? I've been thinking about this a lot.",
    "Can you write me a haiku about winter?",
    "What are some good books about leadership? My manager recommended one but I forgot the title.",
    "Tell me a fun fact about octopuses.",
    "What's the difference between a crocodile and an alligator?",
    "Can you help me understand the difference between term life and whole life insurance?",
  ];
  const noiseText = noiseSteps.join("\n");
  const noiseFPs = classifyStable(noiseText);
  console.log(`\n  False positives on noise text: ${noiseFPs.length}`);
  if (noiseFPs.length > 0) {
    for (const fp of noiseFPs) {
      console.log(`    FP: "${fp.value}" (${fp.type})`);
    }
  }

  if (overallRecall < 70) {
    console.log(
      "\n  KILL: Classifier recall <70% on stable probes. Cannot proceed to Phase 2."
    );
    const feasibility: FeasibilityResult = {
      proposal: "stability-plasticity-v2",
      phase1: {
        passed: false,
        details: {
          recall: overallRecall,
          validations,
          falsePositives: noiseFPs.length,
        },
      },
      phase2: { runs: [], retentionByType: {}, comparisonToBaseline: {} },
      killCriteriaMet: true,
      recommendation: "abandon",
    };
    await saveResults("stability-plasticity-v2", feasibility);
    return;
  }

  console.log("\n  Phase 1 PASSED. Proceeding to Phase 2.\n");

  // ── Phase 2: Run BOTH strategies on ALL scenarios ─────────────────
  console.log("--- Phase 2: Strategy Comparison (all 8 scenarios × 2 reps) ---\n");

  // Lazy-import the baseline RLM strategy (avoids eager OpenAI init)
  const { RLMStrategy } = await import("../strategies/rlm");

  const spRuns: ProbeRunResult[] = [];
  const rlmRuns: ProbeRunResult[] = [];
  const repsPerScenario = 2;

  for (const scenario of ALL_SCENARIOS) {
    if (!scenario.probes || scenario.probes.length === 0) continue;

    console.log(`\n  Scenario: ${scenario.name}`);
    for (let rep = 0; rep < repsPerScenario; rep++) {
      // StabilityPlasticity run
      console.log(`    [SP] Rep ${rep + 1}/${repsPerScenario}...`);
      const sp = new StabilityPlasticityStrategy(8, 4);
      const spResult = await runScenarioWithProbes(sp, scenario);
      spResult.rep = rep + 1;
      spRuns.push(spResult);
      console.log(
        `      ${spResult.retainedCount}/${spResult.totalProbes} retained`
      );

      // RLM baseline run
      console.log(`    [RLM] Rep ${rep + 1}/${repsPerScenario}...`);
      const rlm = new RLMStrategy(8, 4);
      // RLMStrategy implements MemoryStrategy which is structurally identical to ProbeStrategy
      const rlmResult = await runScenarioWithProbes(rlm as ProbeStrategy, scenario);
      rlmResult.rep = rep + 1;
      rlmRuns.push(rlmResult);
      console.log(
        `      ${rlmResult.retainedCount}/${rlmResult.totalProbes} retained`
      );
    }
  }

  // Print results side by side
  printRetentionTable(spRuns, "StabilityPlasticity Results");
  printRetentionTable(rlmRuns, "RLM(8) Baseline Results");

  const spByType = aggregateRetentionByType(spRuns);
  const rlmByType = aggregateRetentionByType(rlmRuns);

  // Compute deltas
  const allTypes = new Set([...Object.keys(spByType), ...Object.keys(rlmByType)]);
  const comparisonToBaseline: Record<string, number> = {};

  console.log("\n  Per-type delta (StabilityPlasticity - RLM baseline):");
  for (const type of [...allTypes].sort()) {
    const spRate = spByType[type] ?? 0;
    const rlmRate = rlmByType[type] ?? 0;
    const delta = spRate - rlmRate;
    comparisonToBaseline[type] = delta;
    const sign = delta >= 0 ? "+" : "";
    console.log(
      `    ${type.padEnd(14)} SP: ${(spRate * 100).toFixed(0).padStart(3)}%  RLM: ${(rlmRate * 100).toFixed(0).padStart(3)}%  Δ: ${sign}${(delta * 100).toFixed(0)}pp`
    );
  }

  // ── Per-hypothesis kill criteria ──────────────────────────────────
  const phoneIdDelta = comparisonToBaseline["phone/id"] ?? 0;
  const quantityDelta = comparisonToBaseline["quantity"] ?? 0;

  const h1Pass = phoneIdDelta >= 0.15; // phone/id improves ≥ +15pp
  const h2Pass = quantityDelta >= 0.10; // quantity improves ≥ +10pp

  // Side effects: any non-target type drops > 15pp
  const targetTypes = new Set(["phone/id", "quantity"]);
  let sideEffectFail = false;
  for (const [type, delta] of Object.entries(comparisonToBaseline)) {
    if (!targetTypes.has(type) && delta < -0.15) {
      sideEffectFail = true;
      console.log(
        `\n  SIDE EFFECT: ${type} dropped ${(delta * 100).toFixed(0)}pp (exceeds -15pp threshold)`
      );
    }
  }

  let recommendation: "proceed" | "refine" | "abandon";
  let killCriteriaMet: boolean;

  if (sideEffectFail) {
    recommendation = "abandon";
    killCriteriaMet = true;
    console.log("\n  KILL: Side effect threshold exceeded.");
  } else if (!h1Pass && !h2Pass) {
    recommendation = "abandon";
    killCriteriaMet = true;
    console.log(
      `\n  KILL: Both hypotheses failed.`
    );
    console.log(`    H1 (phone/id): Δ ${(phoneIdDelta * 100).toFixed(0)}pp (need ≥+15pp)`);
    console.log(`    H2 (quantity): Δ ${(quantityDelta * 100).toFixed(0)}pp (need ≥+10pp)`);
  } else if (h1Pass && h2Pass) {
    recommendation = "proceed";
    killCriteriaMet = false;
    console.log(
      `\n  PROCEED: Both hypotheses pass. Stability-Plasticity + Quantity-Pinning is viable.`
    );
    console.log(`    H1 (phone/id): Δ +${(phoneIdDelta * 100).toFixed(0)}pp ✓`);
    console.log(`    H2 (quantity): Δ +${(quantityDelta * 100).toFixed(0)}pp ✓`);
  } else {
    recommendation = "refine";
    killCriteriaMet = false;
    console.log(`\n  REFINE: Partial success.`);
    console.log(`    H1 (phone/id): Δ ${(phoneIdDelta * 100).toFixed(0)}pp ${h1Pass ? "✓" : "✗"}`);
    console.log(`    H2 (quantity): Δ ${(quantityDelta * 100).toFixed(0)}pp ${h2Pass ? "✓" : "✗"}`);
  }

  const feasibility: FeasibilityResult = {
    proposal: "stability-plasticity-v2",
    phase1: {
      passed: true,
      details: {
        recall: overallRecall,
        validations,
        falsePositives: noiseFPs.length,
        rlmRetentionByType: rlmByType,
      },
    },
    phase2: {
      runs: [...spRuns, ...rlmRuns],
      retentionByType: spByType,
      comparisonToBaseline,
    },
    killCriteriaMet,
    recommendation,
  };

  await saveResults("stability-plasticity-v2", feasibility);
  console.log("\nDone.");
}

// Run when executed directly (not when imported by tests)
const isMainModule =
  typeof Bun !== "undefined" && Bun.main === import.meta.path;
if (isMainModule) {
  main().catch(console.error);
}
