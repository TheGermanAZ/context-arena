/**
 * Feasibility Probe: Schema-Guided Hybrid Extraction
 *
 * Tests whether LLM-generated declarative schemas adapt better to each
 * scenario's fact distribution than RLM's fixed 5-question prompt.
 *
 * The key insight: instead of generating code (which LLMs do unreliably),
 * generate YAML-like schema definitions that describe what to extract.
 * A fixed prompt pipeline then interprets the schema.
 *
 * Phase 1: Schema coverage — does the LLM generate schemas that cover
 *          the fact types present in a scenario?
 * Phase 2: End-to-end retention — does schema-guided extraction beat RLM?
 */

import type { LLMMessage } from "../utils/llm";
import { ALL_SCENARIOS, type ProbeType, type Scenario } from "../tasks/scenarios";
import {
  type ProbeStrategy,
  type ProbeRunResult,
  type FeasibilityResult,
  runScenarioWithProbes,
  aggregateRetentionByType,
  printRetentionTable,
  saveResults,
  buildTranscript,
} from "./probe-utils";

// ── Schema types ──────────────────────────────────────────────────

export interface FactTypeSchema {
  name: string;
  description: string;
  extractionGuidance: string;
  outputFormat: string;
  priority: "low" | "medium" | "high" | "critical";
}

export interface ExtractionSchema {
  contextHint: string;
  factTypes: FactTypeSchema[];
  validationRules: string[];
}

// ── Schema parsing ────────────────────────────────────────────────

const VALID_PRIORITIES = new Set(["low", "medium", "high", "critical"]);

/**
 * Parse YAML-like LLM output into an ExtractionSchema.
 *
 * Expected format:
 * ```
 * context_hint: "description"
 * fact_types:
 *   - name: "identifiers"
 *     description: "Phone numbers, ID codes"
 *     extraction_guidance: "Look for alphanumeric codes"
 *     output_format: "key-value pairs"
 *     priority: high
 * validation_rules:
 *   - "rule 1"
 * ```
 */
export function parseSchema(output: string): ExtractionSchema {
  if (!output.trim()) {
    return { contextHint: "", factTypes: [], validationRules: [] };
  }

  // Extract context_hint
  const contextHintMatch = output.match(/context_hint:\s*"([^"]*)"/);
  const contextHint = contextHintMatch?.[1] ?? "";

  // Extract fact_types section
  const factTypes: FactTypeSchema[] = [];
  const factTypesSection = output.match(/fact_types:\s*\n([\s\S]*?)(?=\nvalidation_rules:|\n[a-z_]+:|\s*$)/);

  if (factTypesSection) {
    // Split on "- name:" to find individual fact type blocks
    const blocks = factTypesSection[1]!.split(/\s+-\s+name:\s*/);

    for (const block of blocks) {
      if (!block.trim()) continue;

      const nameMatch = block.match(/^"?([^"\n]+)"?/);
      const descMatch = block.match(/description:\s*"([^"]*)"/);
      const guidanceMatch = block.match(/extraction_guidance:\s*"([^"]*)"/);
      const formatMatch = block.match(/output_format:\s*"([^"]*)"/);
      const priorityMatch = block.match(/priority:\s*(\S+)/);

      const name = nameMatch?.[1]?.trim() ?? "";
      if (!name) continue;

      const rawPriority = priorityMatch?.[1]?.toLowerCase().replace(/"/g, "") ?? "medium";
      const priority = VALID_PRIORITIES.has(rawPriority)
        ? (rawPriority as FactTypeSchema["priority"])
        : "medium";

      factTypes.push({
        name,
        description: descMatch?.[1] ?? "",
        extractionGuidance: guidanceMatch?.[1] ?? "",
        outputFormat: formatMatch?.[1] ?? "",
        priority,
      });
    }
  }

  // Extract validation_rules
  const validationRules: string[] = [];
  const rulesSection = output.match(/validation_rules:\s*\n([\s\S]*?)(?=\n[a-z_]+:|\s*$)/);

  if (rulesSection) {
    const ruleMatches = rulesSection[1]!.matchAll(/\s*-\s*"([^"]*)"/g);
    for (const match of ruleMatches) {
      if (match[1]?.trim()) {
        validationRules.push(match[1].trim());
      }
    }
  }

  return { contextHint, factTypes, validationRules };
}

// ── Schema generation prompt ──────────────────────────────────────

const SCHEMA_GENERATION_PROMPT = `You are an expert at analyzing conversations and designing extraction schemas.

Given the conversation below, generate a declarative schema that describes what types of facts are present and how to extract them.

Output in this EXACT format (YAML-like):

context_hint: "brief description of the conversation domain"
fact_types:
  - name: "type_name"
    description: "what this fact type captures"
    extraction_guidance: "how to identify and extract these facts"
    output_format: "how to format the extracted facts"
    priority: high
validation_rules:
  - "validation rule 1"

Analyze the conversation carefully. Identify ALL distinct categories of facts present. Assign priority based on:
- critical: facts that have been corrected/updated (MUST track old and new values)
- high: unique identifiers, specific numbers, key entities
- medium: relationships, decisions, dates
- low: general context, descriptions

Be thorough — missing a fact category means losing those facts forever.`;

// ── Keyword mapping: schema fact_type names → probe types ─────────

const PROBE_TYPE_KEYWORDS: Record<ProbeType, string[]> = {
  "phone/id": ["identifier", "phone", "id", "code", "number", "reference", "passport", "policy", "confirmation"],
  "correction": ["correction", "update", "change", "revised", "amend", "override", "modified"],
  "spatial": ["spatial", "location", "place", "region", "address", "area", "floor", "room", "neighborhood"],
  "entity": ["entity", "person", "people", "name", "organization", "product", "team", "guest"],
  "quantity": ["quantity", "amount", "number", "count", "price", "cost", "budget", "salary", "rate", "measurement"],
  "date": ["date", "time", "deadline", "schedule", "appointment", "when"],
  "decision": ["decision", "chose", "select", "approve", "reject", "plan", "strategy"],
  "relationship": ["relationship", "connect", "depend", "link", "report", "couple", "conflict"],
};

function mapSchemaToProbeTypes(schema: ExtractionSchema): Set<ProbeType> {
  const mapped = new Set<ProbeType>();

  for (const factType of schema.factTypes) {
    const combinedText = `${factType.name} ${factType.description}`.toLowerCase();

    for (const [probeType, keywords] of Object.entries(PROBE_TYPE_KEYWORDS)) {
      if (keywords.some((kw) => combinedText.includes(kw))) {
        mapped.add(probeType as ProbeType);
      }
    }
  }

  return mapped;
}

// ── SchemaGuidedStrategy ──────────────────────────────────────────

export class SchemaGuidedStrategy implements ProbeStrategy {
  name = "SchemaGuided";
  private messages: LLMMessage[] = [];
  private delegatedKnowledge: string[] = [];
  private schema: ExtractionSchema | null = null;
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
    this.schema = null;
    this.totalOverheadTokens = 0;
    this.messagesSinceDelegation = 0;
  }

  addMessage(message: LLMMessage): void {
    this.messages.push(message);
    this.messagesSinceDelegation++;
  }

  async getContext(): Promise<{
    messages: LLMMessage[];
    system?: string;
    memoryOverheadTokens: number;
  }> {
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
      const transcript = buildTranscript(toDelegate);

      // On the first compression cycle (when we have enough messages),
      // generate a schema from the conversation so far
      if (!this.schema && this.messages.length >= 5) {
        const schemaMessages = this.messages.slice(0, 5);
        const schemaTranscript = buildTranscript(schemaMessages);

        const schemaResult = await chat(
          [
            {
              role: "user",
              content: `${SCHEMA_GENERATION_PROMPT}\n\nConversation:\n${schemaTranscript}`,
            },
          ],
          "You design extraction schemas. Output ONLY the schema in the specified format. No commentary.",
        );
        overheadThisStep += schemaResult.inputTokens + schemaResult.outputTokens;
        this.schema = parseSchema(schemaResult.content);
      }

      // Build extraction prompt — schema-guided if we have a schema, else RLM fallback
      const existingKnowledge =
        this.delegatedKnowledge.length > 0
          ? `Previously extracted knowledge:\n${this.delegatedKnowledge.join("\n")}\n\n`
          : "";

      let extractionPrompt: string;

      if (this.schema && this.schema.factTypes.length > 0) {
        // Schema-guided extraction: sort by priority and build targeted prompt
        const priorityOrder: Record<string, number> = {
          critical: 0,
          high: 1,
          medium: 2,
          low: 3,
        };
        const sortedTypes = [...this.schema.factTypes].sort(
          (a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3),
        );

        const factTypeInstructions = sortedTypes
          .map(
            (ft, i) =>
              `${i + 1}. **${ft.name.toUpperCase()}** [${ft.priority}]: ${ft.description}\n   Guidance: ${ft.extractionGuidance}\n   Format: ${ft.outputFormat}`,
          )
          .join("\n\n");

        const validationInstructions =
          this.schema.validationRules.length > 0
            ? `\n\nValidation rules:\n${this.schema.validationRules.map((r) => `- ${r}`).join("\n")}`
            : "";

        extractionPrompt = `${existingKnowledge}New conversation segment:\n${transcript}\n\nYou are extracting facts from a conversation about: ${this.schema.contextHint}

Extract ALL facts according to these fact types (ordered by priority):

${factTypeInstructions}${validationInstructions}

Be exhaustive. Every specific detail matters. Do NOT generalize. For corrections, ALWAYS include both the old and new values.`;
      } else {
        // Fallback: standard RLM 5-question prompt
        extractionPrompt = `${existingKnowledge}New conversation segment:\n${transcript}\n\nYou are a sub-agent processing a conversation segment. Your job is to extract a COMPLETE knowledge state from this conversation. Answer these specific questions:

1. ENTITIES: List every person, place, organization, product, or system mentioned with ALL their attributes (names, numbers, roles, relationships).
2. DECISIONS: What decisions were made? What was chosen and what was rejected?
3. CORRECTIONS: Were any previous facts corrected, updated, or changed? List BOTH the old value and the new value explicitly. This is critical — flag every instance where something was changed.
4. NUMBERS: List every specific number, amount, date, time, code, ID, or measurement with its context.
5. CURRENT STATE: What is the current state of affairs as of the end of this segment? Only the latest values.

Be exhaustive. Every specific detail matters. Do NOT generalize.`;
      }

      const subLLMResult = await chat(
        [{ role: "user", content: extractionPrompt }],
        "You are a precise sub-agent in a memory extraction system. Your output will be the ONLY record of this conversation segment. If you miss a detail, it is lost forever. Be thorough and exact.",
      );

      overheadThisStep += subLLMResult.inputTokens + subLLMResult.outputTokens;
      this.totalOverheadTokens += overheadThisStep;

      // Replace delegated knowledge with new comprehensive state
      this.delegatedKnowledge = [subLLMResult.content];

      // Keep only recent messages
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

// ── Phase 1: Schema coverage testing ──────────────────────────────

async function testSchemaCoverage(
  scenario: Scenario,
): Promise<{ coverage: number; mappedTypes: ProbeType[]; totalTypes: ProbeType[]; schema: ExtractionSchema }> {
  const { chat } = await import("../utils/llm");

  // Generate schema from first 5 messages
  const first5 = scenario.steps.slice(0, 5);
  const transcript = first5.map((s, i) => `user: ${s}`).join("\n");

  const schemaResult = await chat(
    [
      {
        role: "user",
        content: `${SCHEMA_GENERATION_PROMPT}\n\nConversation:\n${transcript}`,
      },
    ],
    "You design extraction schemas. Output ONLY the schema in the specified format. No commentary.",
  );

  const schema = parseSchema(schemaResult.content);

  // Get the probe types actually present in this scenario
  const probes = scenario.probes ?? [];
  const presentTypes = [...new Set(probes.map((p) => p.type))];

  // Map schema fact types to probe types using keyword matching
  const mappedTypes = mapSchemaToProbeTypes(schema);

  // Compute coverage: what % of present probe types are covered
  const coveredTypes = presentTypes.filter((t) => mappedTypes.has(t));
  const coverage = presentTypes.length > 0 ? coveredTypes.length / presentTypes.length : 0;

  return {
    coverage,
    mappedTypes: coveredTypes,
    totalTypes: presentTypes,
    schema,
  };
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log("=".repeat(60));
  console.log("  FEASIBILITY PROBE: Schema-Guided Hybrid Extraction");
  console.log("=".repeat(60));
  console.log();

  const RLM_BASELINE = 0.597; // 59.7% from CTX-3 findings

  // ── Phase 1: Schema Coverage ──────────────────────────────────

  console.log("PHASE 1: Schema Coverage Analysis");
  console.log("-".repeat(40));
  console.log("Testing if LLM-generated schemas cover the fact types in scenarios...\n");

  const scenario1 = ALL_SCENARIOS[0]!; // Early Fact Recall — broad types
  const scenario6 = ALL_SCENARIOS[5]!; // Cascading Corrections — correction-heavy

  const coverage1 = await testSchemaCoverage(scenario1);
  console.log(`  ${scenario1.name}:`);
  console.log(`    Schema fact types: ${coverage1.schema.factTypes.map((f) => f.name).join(", ")}`);
  console.log(`    Probe types present: ${coverage1.totalTypes.join(", ")}`);
  console.log(`    Mapped coverage: ${coverage1.mappedTypes.join(", ")}`);
  console.log(`    Coverage: ${(coverage1.coverage * 100).toFixed(0)}%\n`);

  const coverage6 = await testSchemaCoverage(scenario6);
  console.log(`  ${scenario6.name}:`);
  console.log(`    Schema fact types: ${coverage6.schema.factTypes.map((f) => f.name).join(", ")}`);
  console.log(`    Probe types present: ${coverage6.totalTypes.join(", ")}`);
  console.log(`    Mapped coverage: ${coverage6.mappedTypes.join(", ")}`);
  console.log(`    Coverage: ${(coverage6.coverage * 100).toFixed(0)}%\n`);

  const avgCoverage = (coverage1.coverage + coverage6.coverage) / 2;
  console.log(`  Average coverage: ${(avgCoverage * 100).toFixed(0)}%`);

  const phase1Passed = avgCoverage >= 0.7;
  console.log(`  Kill criteria (<70%): ${phase1Passed ? "PASSED" : "FAILED - KILLED"}\n`);

  if (!phase1Passed) {
    const result: FeasibilityResult = {
      proposal: "schema-guided",
      phase1: {
        passed: false,
        details: {
          scenario1Coverage: coverage1.coverage,
          scenario6Coverage: coverage6.coverage,
          avgCoverage,
          killThreshold: 0.7,
        },
      },
      phase2: { runs: [], retentionByType: {}, comparisonToBaseline: {} },
      killCriteriaMet: true,
      recommendation: "abandon",
    };
    await saveResults("schema-guided", result);
    console.log("RECOMMENDATION: ABANDON — schemas do not cover enough fact types.");
    return;
  }

  // ── Phase 2: End-to-end retention comparison ──────────────────

  console.log("PHASE 2: End-to-End Retention Comparison");
  console.log("-".repeat(40));
  console.log("Running SchemaGuidedStrategy on 2 scenarios, 2 reps each...\n");

  const scenario5 = ALL_SCENARIOS[4]!; // Long Horizon + Noise
  const testScenarios = [scenario1, scenario5];
  const REPS = 2;

  const allRuns: ProbeRunResult[] = [];

  for (const scenario of testScenarios) {
    for (let rep = 0; rep < REPS; rep++) {
      console.log(`  Running: ${scenario.name} (rep ${rep + 1}/${REPS})`);
      const strategy = new SchemaGuidedStrategy(8, 4);
      const result = await runScenarioWithProbes(strategy, scenario);
      result.rep = rep + 1;
      allRuns.push(result);
      const retention = result.totalProbes > 0
        ? ((result.retainedCount / result.totalProbes) * 100).toFixed(1)
        : "N/A";
      console.log(`    Retention: ${result.retainedCount}/${result.totalProbes} (${retention}%)\n`);
    }
  }

  // Print results
  printRetentionTable(allRuns, "Schema-Guided Strategy Results");

  // Compare to baseline
  const overallRetained = allRuns.reduce((s, r) => s + r.retainedCount, 0);
  const overallTotal = allRuns.reduce((s, r) => s + r.totalProbes, 0);
  const overallRetention = overallTotal > 0 ? overallRetained / overallTotal : 0;
  const improvement = overallRetention - RLM_BASELINE;

  console.log(`\n  RLM Baseline:    ${(RLM_BASELINE * 100).toFixed(1)}%`);
  console.log(`  Schema-Guided:   ${(overallRetention * 100).toFixed(1)}%`);
  console.log(`  Improvement:     ${improvement >= 0 ? "+" : ""}${(improvement * 100).toFixed(1)}pp`);

  const phase2Passed = improvement >= 0.1; // >= 10pp improvement
  console.log(`  Kill criteria (<10pp improvement): ${phase2Passed ? "PASSED" : "FAILED - KILLED"}\n`);

  // Build retention-by-type comparison
  const retentionByType = aggregateRetentionByType(allRuns);
  const comparisonToBaseline: Record<string, number> = {};
  for (const [type, rate] of Object.entries(retentionByType)) {
    comparisonToBaseline[type] = rate - RLM_BASELINE;
  }

  // Determine recommendation
  let recommendation: "proceed" | "refine" | "abandon";
  if (phase2Passed) {
    recommendation = "proceed";
  } else if (improvement >= 0.05) {
    recommendation = "refine";
  } else {
    recommendation = "abandon";
  }

  const result: FeasibilityResult = {
    proposal: "schema-guided",
    phase1: {
      passed: true,
      details: {
        scenario1Coverage: coverage1.coverage,
        scenario6Coverage: coverage6.coverage,
        avgCoverage,
      },
    },
    phase2: {
      runs: allRuns,
      retentionByType,
      comparisonToBaseline,
    },
    killCriteriaMet: !phase2Passed,
    recommendation,
  };

  await saveResults("schema-guided", result);

  console.log("=".repeat(60));
  console.log(`  RECOMMENDATION: ${recommendation.toUpperCase()}`);
  if (recommendation === "proceed") {
    console.log("  Schema-guided extraction shows significant improvement over baseline RLM.");
  } else if (recommendation === "refine") {
    console.log("  Schema-guided shows promise but needs refinement to reach 10pp threshold.");
  } else {
    console.log("  Schema-guided extraction does not meaningfully improve over baseline RLM.");
  }
  console.log("=".repeat(60));
}

main().catch(console.error);
