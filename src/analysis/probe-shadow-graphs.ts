/**
 * Probe: Structural Shadow Graphs (SSG)
 *
 * Feasibility probe for Proposal #3. Tests whether a parallel graph structure
 * can rescue fact types where RLM's text flattening fails:
 *   - spatial: 0%
 *   - phone/id: 0%
 *   - decisions: 0%
 *   - relationships: 33%
 *
 * The hypothesis: a lightweight graph (never compressed, only accumulated)
 * adds ~200-500 tokens to the system prompt but preserves structure that
 * text flattening destroys.
 */

import type { LLMMessage } from "../utils/llm";
import type { Scenario } from "../tasks/scenarios";
import {
  type ProbeStrategy,
  type ProbeRunResult,
  type FeasibilityResult,
  runScenarioWithProbes,
  aggregateRetentionByType,
  printRetentionTable,
  saveResults,
  checkProbeRetained,
  buildTranscript,
  getScenarioByName,
} from "./probe-utils";

// ── Parsed triple types ───────────────────────────────────────────

export interface ParsedEntity {
  name: string;
  attrs: Record<string, string>;
}

export interface ParsedSpatial {
  location: string;
  child: string;
  attrs: string;
}

export interface ParsedRelation {
  entity1: string;
  type: string;
  entity2: string;
}

export interface ParsedDecision {
  subject: string;
  decision: string;
  outcome: string;
}

export interface ParsedSupersession {
  key: string;
  newValue: string;
  oldValue: string;
}

export interface ParsedTriples {
  entities: ParsedEntity[];
  spatial: ParsedSpatial[];
  relations: ParsedRelation[];
  decisions: ParsedDecision[];
  supersessions: ParsedSupersession[];
}

// ── ShadowGraph ───────────────────────────────────────────────────

export class ShadowGraph {
  identifiers = new Map<string, Map<string, string>>();
  spatial: { location: string; child: string; attrs: string }[] = [];
  relations: { entity1: string; type: string; entity2: string }[] = [];
  decisions: { subject: string; decision: string; outcome: string }[] = [];
  corrections: { key: string; oldValue: string; newValue: string }[] = [];

  addIdentifier(entity: string, attr: string, value: string): void {
    if (!this.identifiers.has(entity)) {
      this.identifiers.set(entity, new Map());
    }
    this.identifiers.get(entity)!.set(attr, value);
  }

  addSpatial(location: string, child: string, attrs: string): void {
    this.spatial.push({ location, child, attrs });
  }

  addRelation(entity1: string, type: string, entity2: string): void {
    this.relations.push({ entity1, type, entity2 });
  }

  addDecision(subject: string, decision: string, outcome: string): void {
    this.decisions.push({ subject, decision, outcome });
  }

  addSupersession(key: string, oldValue: string, newValue: string): void {
    this.corrections.push({ key, oldValue, newValue });

    // Update identifier if the key matches entity.attr pattern
    const dotIdx = key.indexOf(".");
    if (dotIdx > 0) {
      const entity = key.slice(0, dotIdx);
      const attr = key.slice(dotIdx + 1);
      if (this.identifiers.has(entity)) {
        const attrs = this.identifiers.get(entity)!;
        if (attrs.has(attr)) {
          attrs.set(attr, newValue);
        }
      }
    }
  }

  isEmpty(): boolean {
    return (
      this.identifiers.size === 0 &&
      this.spatial.length === 0 &&
      this.relations.length === 0 &&
      this.decisions.length === 0 &&
      this.corrections.length === 0
    );
  }

  serialize(): string {
    const sections: string[] = ["STRUCTURAL MEMORY:"];

    // Entities — deterministic: sorted by entity name
    sections.push("[Entities]");
    const sortedEntities = [...this.identifiers.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    for (const [entity, attrs] of sortedEntities) {
      const sortedAttrs = [...attrs.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([k, v]) => `${k}: ${v}`)
        .join(" | ");
      sections.push(`  ${entity} | ${sortedAttrs}`);
    }

    // Spatial
    sections.push("[Spatial]");
    for (const s of this.spatial) {
      sections.push(`  ${s.location} > ${s.child} | ${s.attrs}`);
    }

    // Relations
    sections.push("[Relations]");
    for (const r of this.relations) {
      sections.push(`  ${r.entity1} -- ${r.type} -- ${r.entity2}`);
    }

    // Decisions
    sections.push("[Decisions]");
    for (const d of this.decisions) {
      sections.push(`  ${d.subject} | ${d.decision} | ${d.outcome}`);
    }

    // Corrections
    sections.push("[Corrections]");
    for (const c of this.corrections) {
      sections.push(`  ${c.key}: ${c.oldValue} -> ${c.newValue}`);
    }

    return sections.join("\n");
  }
}

// ── parseGraphTriples ─────────────────────────────────────────────

/**
 * Parse LLM output into typed triples. Handles noisy output by
 * only matching lines that start with a known prefix.
 */
export function parseGraphTriples(output: string): ParsedTriples {
  const result: ParsedTriples = {
    entities: [],
    spatial: [],
    relations: [],
    decisions: [],
    supersessions: [],
  };

  for (const rawLine of output.split("\n")) {
    const line = rawLine.trim();

    // ENTITY: Name | attr: value | attr: value
    if (line.startsWith("ENTITY:")) {
      const rest = line.slice("ENTITY:".length).trim();
      const parts = rest.split("|").map((p) => p.trim());
      const name = parts[0] ?? "";
      const attrs: Record<string, string> = {};
      for (let i = 1; i < parts.length; i++) {
        const colonIdx = parts[i]!.indexOf(":");
        if (colonIdx > 0) {
          const k = parts[i]!.slice(0, colonIdx).trim();
          const v = parts[i]!.slice(colonIdx + 1).trim();
          attrs[k] = v;
        }
      }
      result.entities.push({ name, attrs });
      continue;
    }

    // SPATIAL: Location > Child | attrs
    if (line.startsWith("SPATIAL:")) {
      const rest = line.slice("SPATIAL:".length).trim();
      const gtIdx = rest.indexOf(">");
      const pipeIdx = rest.indexOf("|", gtIdx > -1 ? gtIdx : 0);
      if (gtIdx > 0) {
        const location = rest.slice(0, gtIdx).trim();
        const child = rest.slice(gtIdx + 1, pipeIdx > -1 ? pipeIdx : undefined).trim();
        const attrs = pipeIdx > -1 ? rest.slice(pipeIdx + 1).trim() : "";
        result.spatial.push({ location, child, attrs });
      }
      continue;
    }

    // RELATION: Entity1 -- type -- Entity2
    if (line.startsWith("RELATION:")) {
      const rest = line.slice("RELATION:".length).trim();
      const parts = rest.split("--").map((p) => p.trim());
      if (parts.length >= 3) {
        result.relations.push({
          entity1: parts[0]!,
          type: parts[1]!,
          entity2: parts[2]!,
        });
      }
      continue;
    }

    // DECISION: Subject | decision | outcome
    if (line.startsWith("DECISION:")) {
      const rest = line.slice("DECISION:".length).trim();
      const parts = rest.split("|").map((p) => p.trim());
      if (parts.length >= 3) {
        result.decisions.push({
          subject: parts[0]!,
          decision: parts[1]!,
          outcome: parts[2]!,
        });
      }
      continue;
    }

    // SUPERSEDES: key | new_value | was: old_value
    if (line.startsWith("SUPERSEDES:")) {
      const rest = line.slice("SUPERSEDES:".length).trim();
      const parts = rest.split("|").map((p) => p.trim());
      if (parts.length >= 3) {
        const key = parts[0]!;
        const newValue = parts[1]!;
        // Strip "was:" prefix from old value
        const oldRaw = parts[2]!;
        const oldValue = oldRaw.startsWith("was:") ? oldRaw.slice(4).trim() : oldRaw;
        result.supersessions.push({ key, newValue, oldValue });
      }
      continue;
    }
  }

  return result;
}

// ── Graph extraction prompt ───────────────────────────────────────

const GRAPH_EXTRACTION_PROMPT = `Extract ALL structured facts from this conversation as typed triples. Use EXACTLY these formats, one per line:

ENTITY: Name | attr: value | attr: value
SPATIAL: Location > Child | attributes
RELATION: Entity1 -- relationship_type -- Entity2
DECISION: Subject | what_was_decided | outcome
SUPERSEDES: key | new_value | was: old_value

Rules:
- EVERY person, place, organization, product gets an ENTITY line with ALL their attributes.
- EVERY phone number, ID, code, or identifier goes as an attr on an ENTITY line.
- Spatial/containment relationships (X is in/on/at Y) use SPATIAL.
- Use RELATION for non-containment relationships between entities.
- Use DECISION for any choice, approval, or discontinuation.
- Use SUPERSEDES when a value was corrected or updated. Include the key as entity.attribute.
- Be EXHAUSTIVE. If you miss a fact, it is lost forever.
- Output ONLY triple lines. No explanations.`;

// ── RLMWithSSGStrategy ────────────────────────────────────────────

export class RLMWithSSGStrategy implements ProbeStrategy {
  name = "RLM+SSG";
  private messages: LLMMessage[] = [];
  private delegatedKnowledge: string[] = [];
  private graph = new ShadowGraph();
  private delegateEvery: number;
  private recentWindow: number;
  private messagesSinceDelegation = 0;

  constructor(delegateEvery = 8, recentWindow = 4) {
    this.delegateEvery = delegateEvery;
    this.recentWindow = recentWindow;
  }

  reset(): void {
    this.messages = [];
    this.delegatedKnowledge = [];
    this.graph = new ShadowGraph();
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

      const transcript = toDelegate
        .map((m) => `${m.role}: ${m.content}`)
        .join("\n");

      const existingKnowledge =
        this.delegatedKnowledge.length > 0
          ? `Previously extracted knowledge:\n${this.delegatedKnowledge.join("\n")}\n\n`
          : "";

      // Call 1: Standard RLM 5-question delegation (same as rlm.ts)
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
        "You are a precise sub-agent in a Recursive Language Model system. Your output will be the ONLY record of this conversation segment. If you miss a detail, it is lost forever. Be thorough and exact.",
      );

      overheadThisStep += subLLMResult.inputTokens + subLLMResult.outputTokens;

      // Call 2: Graph extraction — parallel typed triples
      const graphResult = await chat(
        [
          {
            role: "user",
            content: `${existingKnowledge}Conversation segment:\n${transcript}\n\n${GRAPH_EXTRACTION_PROMPT}`,
          },
        ],
        "You are a precise triple extraction engine. Output ONLY typed triple lines. No prose.",
      );

      overheadThisStep += graphResult.inputTokens + graphResult.outputTokens;

      // Parse and merge into graph
      const triples = parseGraphTriples(graphResult.content);
      for (const e of triples.entities) {
        for (const [k, v] of Object.entries(e.attrs)) {
          this.graph.addIdentifier(e.name, k, v);
        }
      }
      for (const s of triples.spatial) {
        this.graph.addSpatial(s.location, s.child, s.attrs);
      }
      for (const r of triples.relations) {
        this.graph.addRelation(r.entity1, r.type, r.entity2);
      }
      for (const d of triples.decisions) {
        this.graph.addDecision(d.subject, d.decision, d.outcome);
      }
      for (const sup of triples.supersessions) {
        this.graph.addSupersession(sup.key, sup.oldValue, sup.newValue);
      }

      // Replace delegated knowledge with latest
      this.delegatedKnowledge = [subLLMResult.content];

      // Keep only recent messages
      this.messages = this.messages.slice(-this.recentWindow);
      this.messagesSinceDelegation = 0;
    }

    const messages: LLMMessage[] = [...this.messages];
    const startIdx = messages.findIndex((m) => m.role === "user");
    const clean = startIdx > 0 ? messages.slice(startIdx) : messages;

    // Build system prompt: graph first, then delegated knowledge
    const systemParts: string[] = [];

    if (!this.graph.isEmpty()) {
      systemParts.push(this.graph.serialize());
    }

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

// ── Phase 1: Graph extraction test ────────────────────────────────

/**
 * Test graph extraction on a full scenario transcript. Single LLM call.
 * Returns capture rate for zero-retention probe types (phone/id, spatial, decision).
 */
async function testGraphExtraction(scenario: Scenario): Promise<{
  captureRate: number;
  capturedProbes: string[];
  missedProbes: string[];
  tripleCount: number;
}> {
  const { chat } = await import("../utils/llm");

  // Build full transcript from all steps
  const messages: LLMMessage[] = scenario.steps.map((step) => ({
    role: "user" as const,
    content: step,
  }));
  const transcript = buildTranscript(messages);

  // Single LLM call for graph extraction
  const result = await chat(
    [
      {
        role: "user",
        content: `${transcript}\n\n${GRAPH_EXTRACTION_PROMPT}`,
      },
    ],
    "You are a precise triple extraction engine. Output ONLY typed triple lines. No prose.",
    "gpt-5-nano",
    2048,
  );

  const triples = parseGraphTriples(result.content);
  const totalTriples =
    triples.entities.length +
    triples.spatial.length +
    triples.relations.length +
    triples.decisions.length +
    triples.supersessions.length;

  // Check which zero-retention probes (phone/id, spatial, decision) are captured
  // by checking if the graph output contains the probe patterns
  const zeroRetentionTypes = new Set(["phone/id", "spatial", "decision", "relationship"]);
  const targetProbes = (scenario.probes ?? []).filter((p) =>
    zeroRetentionTypes.has(p.type),
  );

  const captured: string[] = [];
  const missed: string[] = [];

  for (const probe of targetProbes) {
    if (checkProbeRetained(probe, result.content)) {
      captured.push(probe.fact);
    } else {
      missed.push(probe.fact);
    }
  }

  const captureRate =
    targetProbes.length > 0 ? captured.length / targetProbes.length : 0;

  return { captureRate, capturedProbes: captured, missedProbes: missed, tripleCount: totalTriples };
}

// ── Main entry point ──────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("=== Probe: Structural Shadow Graphs (SSG) ===\n");

  const scenario1 = getScenarioByName("Early Fact Recall")!;
  const scenario8 = getScenarioByName("Rapid-fire Corrections")!;

  // ── Phase 1: Graph extraction test ──────────────────────────
  console.log("Phase 1: Testing graph extraction capability...\n");

  console.log(`  Scenario: ${scenario1.name}`);
  const ext1 = await testGraphExtraction(scenario1);
  console.log(`    Triples extracted: ${ext1.tripleCount}`);
  console.log(`    Target probes captured: ${ext1.capturedProbes.length}/${ext1.capturedProbes.length + ext1.missedProbes.length} (${(ext1.captureRate * 100).toFixed(0)}%)`);
  if (ext1.missedProbes.length > 0) {
    console.log(`    Missed: ${ext1.missedProbes.join(", ")}`);
  }

  console.log(`\n  Scenario: ${scenario8.name}`);
  const ext8 = await testGraphExtraction(scenario8);
  console.log(`    Triples extracted: ${ext8.tripleCount}`);
  console.log(`    Target probes captured: ${ext8.capturedProbes.length}/${ext8.capturedProbes.length + ext8.missedProbes.length} (${(ext8.captureRate * 100).toFixed(0)}%)`);
  if (ext8.missedProbes.length > 0) {
    console.log(`    Missed: ${ext8.missedProbes.join(", ")}`);
  }

  const avgCaptureRate = (ext1.captureRate + ext8.captureRate) / 2;
  const phase1Passed = avgCaptureRate >= 0.5;

  console.log(`\n  Average capture rate: ${(avgCaptureRate * 100).toFixed(0)}%`);
  console.log(`  Kill criteria (<50%): ${phase1Passed ? "PASSED" : "FAILED -- abandoning"}`);

  if (!phase1Passed) {
    const result: FeasibilityResult = {
      proposal: "shadow-graphs",
      phase1: {
        passed: false,
        details: {
          scenario1: ext1,
          scenario8: ext8,
          avgCaptureRate,
        },
      },
      phase2: { runs: [], retentionByType: {}, comparisonToBaseline: {} },
      killCriteriaMet: true,
      recommendation: "abandon",
    };
    await saveResults("shadow-graphs", result);
    return;
  }

  // ── Phase 2: Full strategy run ──────────────────────────────
  console.log("\n\nPhase 2: Running RLM+SSG strategy...\n");

  const scenarios = [scenario1, scenario8];
  const reps = 2;
  const allRuns: ProbeRunResult[] = [];

  for (const scenario of scenarios) {
    for (let rep = 1; rep <= reps; rep++) {
      console.log(`  ${scenario.name} (rep ${rep}/${reps}):`);
      const strategy = new RLMWithSSGStrategy(8, 4);
      const run = await runScenarioWithProbes(strategy, scenario);
      run.rep = rep;
      allRuns.push(run);
      console.log(`    Retained: ${run.retainedCount}/${run.totalProbes} probes, overhead: ${run.overheadTokens} tokens`);
    }
  }

  // ── Results ─────────────────────────────────────────────────
  printRetentionTable(allRuns, "RLM+SSG Retention by Type");

  const retentionByType = aggregateRetentionByType(allRuns);

  // RLM baseline (from known data): spatial 0%, phone/id 0%, decision 0%, relationship 33%
  const rlmBaseline: Record<string, number> = {
    "phone/id": 0,
    spatial: 0,
    decision: 0,
    relationship: 0.33,
    entity: 0.72,
    quantity: 0.62,
    correction: 0.70,
    date: 0.67,
  };

  const comparison: Record<string, number> = {};
  for (const [type, rate] of Object.entries(retentionByType)) {
    const baseline = rlmBaseline[type] ?? 0;
    comparison[type] = rate - baseline;
  }

  console.log("\n  Comparison to RLM baseline (delta):");
  for (const [type, delta] of Object.entries(comparison).sort(
    (a, b) => b[1] - a[1],
  )) {
    const sign = delta >= 0 ? "+" : "";
    console.log(`    ${type.padEnd(14)} ${sign}${(delta * 100).toFixed(0)}pp`);
  }

  // Determine recommendation
  const targetTypes = ["phone/id", "spatial", "decision", "relationship"];
  const targetImprovement = targetTypes.reduce((sum, t) => {
    return sum + (comparison[t] ?? 0);
  }, 0) / targetTypes.length;

  let recommendation: "proceed" | "refine" | "abandon";
  if (targetImprovement >= 0.3) {
    recommendation = "proceed";
  } else if (targetImprovement >= 0.1) {
    recommendation = "refine";
  } else {
    recommendation = "abandon";
  }

  console.log(`\n  Target type avg improvement: ${(targetImprovement * 100).toFixed(0)}pp`);
  console.log(`  Recommendation: ${recommendation.toUpperCase()}`);

  const result: FeasibilityResult = {
    proposal: "shadow-graphs",
    phase1: {
      passed: true,
      details: {
        scenario1: ext1,
        scenario8: ext8,
        avgCaptureRate,
      },
    },
    phase2: { runs: allRuns, retentionByType, comparisonToBaseline: comparison },
    killCriteriaMet: targetImprovement < 0.1,
    recommendation,
  };

  await saveResults("shadow-graphs", result);
}

// ── Run ───────────────────────────────────────────────────────────

if (import.meta.main) {
  main().catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });
}
