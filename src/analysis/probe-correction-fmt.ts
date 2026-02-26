/**
 * Correction Format Feasibility Probe (Proposal #2)
 *
 * Tests whether the *format* of corrections in the RLM delegation prompt
 * affects model belief updating. The RLM strategy delegates old messages to a
 * sub-LLM with 5 targeted questions. We modify only question #3 (CORRECTIONS)
 * and measure whether different formats help the model integrate corrections.
 *
 * Scenario 6 (Cascading Corrections) is the test bed: changing pre-money
 * valuation $10M -> $12M should cascade through 5+ derived values.
 *
 * Usage: bun src/analysis/probe-correction-fmt.ts
 */

import type { LLMMessage } from "../utils/llm";
import type { ProbeStrategy, ProbeRunResult } from "./probe-utils";
import {
  runScenarioWithProbes,
  printRetentionTable,
  aggregateRetentionByType,
  saveResults,
  getScenarioByName,
} from "./probe-utils";

// ── Correction Format Definitions ─────────────────────────────────

export interface CorrectionFormat {
  name: string;
  promptFragment: string;
}

export const CORRECTION_FORMATS: CorrectionFormat[] = [
  {
    name: "Explicit Negation",
    promptFragment: `3. CORRECTIONS: Were any previous facts corrected, updated, or changed? For EACH correction, use this exact format:
[CORRECTED] <field>: <new value> (was: <old value>). The previous value of <old value> is WRONG.
List every instance where something was changed. Flag the old values as incorrect.`,
  },
  {
    name: "Contrastive Pair",
    promptFragment: `3. CORRECTIONS: Were any previous facts corrected, updated, or changed? For EACH correction, present a table:

| OUTDATED (DISCARD) | CURRENT (USE) |
|--------------------|---------------|
| <old value>        | <new value>   |

List every correction as a row. The OUTDATED column values must NEVER be used in answers. Only CURRENT column values are valid.`,
  },
  {
    name: "Temporal Supersession",
    promptFragment: `3. CORRECTIONS: Were any previous facts corrected, updated, or changed? For EACH correction, show a timeline:

- v1 (SUPERSEDED): <field> = <old value>
- v2 (CURRENT): <field> = <new value>

Rule: ALWAYS use the highest version number. Lower versions are obsolete and must not be referenced. List every correction with version numbers.`,
  },
  {
    name: "Authoritative Override",
    promptFragment: `3. CORRECTIONS: Were any previous facts corrected, updated, or changed? For EACH correction, emit:

SYSTEM OVERRIDE (priority: maximum): <field> is <new value>. Previous value <old value> is REVOKED.

Overrides take absolute precedence over any earlier statement. When answering questions, override values always win. List every correction as an override.`,
  },
  {
    name: "Self-Generated Re-Derivation",
    promptFragment: `3. CORRECTIONS: Were any previous facts corrected, updated, or changed? For EACH correction:
a) State the old value and the new value.
b) List every downstream value that depends on the changed value.
c) Re-derive each downstream value step by step using the NEW value.
d) State the final corrected values explicitly.

This chain-of-thought re-derivation is critical. Do not skip steps — show your work for each dependent calculation.`,
  },
  {
    name: "Structured Diff",
    promptFragment: `3. CORRECTIONS: Were any previous facts corrected, updated, or changed? For EACH correction, use code-diff format:

\`\`\`diff
- <field>: <old value>
+ <field>: <new value>
\`\`\`

Lines prefixed with \`-\` are DELETED (no longer true). Lines prefixed with \`+\` are the CURRENT truth. List every correction as a diff block.`,
  },
  {
    name: "Socratic Elicitation",
    promptFragment: `3. CORRECTIONS: Were any previous facts corrected, updated, or changed? For EACH correction:

Q: What was the previous value of <field>?
A: The previous value was <old value>.

Q: What is the MOST RECENT value of <field>?
A: The most recent value is <new value>.

Q: Which value should be used when answering questions?
A: The most recent value (<new value>) must always be used. The old value (<old value>) is obsolete.

Use this Socratic format for every correction. The final answer to "which value" is always the most recent.`,
  },
];

// ── Prompt Builder ────────────────────────────────────────────────

/**
 * Build the full 5-question RLM delegation prompt with question #3
 * replaced by the given CorrectionFormat's promptFragment.
 */
export function buildCorrectionPrompt(format: CorrectionFormat): string {
  return `You are a sub-agent processing a conversation segment. Your job is to extract a COMPLETE knowledge state from this conversation. Answer these specific questions:

1. ENTITIES: List every person, place, organization, product, or system mentioned with ALL their attributes (names, numbers, roles, relationships).
2. DECISIONS: What decisions were made? What was chosen and what was rejected?
${format.promptFragment}
4. NUMBERS: List every specific number, amount, date, time, code, ID, or measurement with its context.
5. CURRENT STATE: What is the current state of affairs as of the end of this segment? Only the latest values.

Be exhaustive. Every specific detail matters. Do NOT generalize.`;
}

// ── FormatRLMStrategy ─────────────────────────────────────────────

/**
 * Implements ProbeStrategy. Identical to RLMStrategy but uses
 * buildCorrectionPrompt for its delegation sub-LLM call.
 */
export class FormatRLMStrategy implements ProbeStrategy {
  name: string;
  private messages: LLMMessage[] = [];
  private delegatedKnowledge: string[] = [];
  private delegateEvery: number;
  private recentWindow: number;
  private totalOverheadTokens = 0;
  private messagesSinceDelegation = 0;
  private format: CorrectionFormat;

  constructor(format: CorrectionFormat, delegateEvery = 8, recentWindow = 4) {
    this.format = format;
    this.delegateEvery = delegateEvery;
    this.recentWindow = recentWindow;
    this.name = `RLM-Fmt(${format.name})`;
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
    // Lazy import to avoid OpenAI client initialization at module load time
    const { chat } = await import("../utils/llm");

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

      // Use the format-specific delegation prompt
      const delegationPrompt = buildCorrectionPrompt(this.format);

      const subLLMResult = await chat(
        [
          {
            role: "user",
            content: `${existingKnowledge}New conversation segment:\n${transcript}\n\n${delegationPrompt}`,
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

    const messages: LLMMessage[] = [...this.messages];
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

// ── Main ──────────────────────────────────────────────────────────

interface FormatResult {
  formatName: string;
  runs: ProbeRunResult[];
  avgRetention: number;
  retentionByType: Record<string, number>;
}

async function main() {
  console.log("Correction Format Feasibility Probe (Proposal #2)");
  console.log("Testing 7 correction formats on Scenario 6 (Cascading Corrections)\n");

  const scenario = getScenarioByName("Cascading Corrections");
  if (!scenario) {
    console.error("ERROR: Scenario 'Cascading Corrections' not found. Aborting.");
    process.exit(1);
  }
  if (!scenario.probes || scenario.probes.length === 0) {
    console.error("ERROR: Scenario 6 has no probes. Aborting.");
    process.exit(1);
  }

  console.log(`Scenario: ${scenario.name} (${scenario.steps.length} steps, ${scenario.probes.length} probes)`);
  console.log(`Formats: ${CORRECTION_FORMATS.length}`);
  console.log(`Reps per format: 2\n`);

  const REPS = 2;
  const formatResults: FormatResult[] = [];

  for (const format of CORRECTION_FORMATS) {
    console.log(`\n${"─".repeat(50)}`);
    console.log(`  Format: ${format.name}`);
    console.log("─".repeat(50));

    const runs: ProbeRunResult[] = [];

    for (let rep = 0; rep < REPS; rep++) {
      console.log(`\n  Rep ${rep + 1}/${REPS}:`);
      const strategy = new FormatRLMStrategy(format);
      const result = await runScenarioWithProbes(strategy, scenario);
      result.rep = rep + 1;
      result.strategyName = `RLM-Fmt(${format.name})`;
      runs.push(result);
      console.log(`    Retained: ${result.retainedCount}/${result.totalProbes}`);
    }

    const avgRetention =
      runs.reduce((sum, r) => sum + r.retainedCount / r.totalProbes, 0) / runs.length;

    const retentionByType = aggregateRetentionByType(runs);

    formatResults.push({
      formatName: format.name,
      runs,
      avgRetention,
      retentionByType,
    });

    printRetentionTable(runs, `Format: ${format.name}`);
  }

  // ── Comparison table ──────────────────────────────────────────
  console.log("\n" + "═".repeat(60));
  console.log("  CORRECTION FORMAT COMPARISON (sorted by retention)");
  console.log("═".repeat(60));

  const sorted = [...formatResults].sort((a, b) => b.avgRetention - a.avgRetention);

  for (const fr of sorted) {
    const pct = (fr.avgRetention * 100).toFixed(1);
    const bar = "█".repeat(Math.round(fr.avgRetention * 20)).padEnd(20, "░");
    console.log(`  ${fr.formatName.padEnd(30)} ${bar} ${pct.padStart(5)}%`);
  }

  // ── Kill criteria check ───────────────────────────────────────
  const best = sorted[0]!;
  const worst = sorted[sorted.length - 1]!;
  const spread = (best.avgRetention - worst.avgRetention) * 100;

  console.log(`\n  Best:  ${best.formatName} (${(best.avgRetention * 100).toFixed(1)}%)`);
  console.log(`  Worst: ${worst.formatName} (${(worst.avgRetention * 100).toFixed(1)}%)`);
  console.log(`  Spread: ${spread.toFixed(1)}pp`);

  const killCriteriaMet = spread < 5;
  if (killCriteriaMet) {
    console.log("\n  KILL CRITERIA MET: <5pp spread between best and worst format.");
    console.log("  Recommendation: ABANDON — correction format has minimal impact.");
  } else {
    console.log(`\n  Kill criteria NOT met: ${spread.toFixed(1)}pp spread >= 5pp threshold.`);
    console.log("  Recommendation: PROCEED — format choice materially affects retention.");
  }

  console.log("═".repeat(60));

  // ── Save results ──────────────────────────────────────────────
  const output = {
    proposal: "correction-format",
    timestamp: new Date().toISOString(),
    scenario: scenario.name,
    repsPerFormat: REPS,
    formats: formatResults.map((fr) => ({
      name: fr.formatName,
      avgRetention: fr.avgRetention,
      retentionByType: fr.retentionByType,
      runs: fr.runs,
    })),
    comparison: {
      best: best.formatName,
      bestRetention: best.avgRetention,
      worst: worst.formatName,
      worstRetention: worst.avgRetention,
      spreadPP: spread,
      killCriteriaMet,
      recommendation: killCriteriaMet ? "abandon" : "proceed",
    },
  };

  await saveResults("correction-fmt", output);
}

main().catch(console.error);
