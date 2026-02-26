import { test, expect } from "bun:test";
import {
  ShadowGraph,
  parseGraphTriples,
} from "./probe-shadow-graphs";

// ── ShadowGraph: add identifier and serialize ─────────────────────

test("ShadowGraph: add identifier and serialize", () => {
  const g = new ShadowGraph();
  g.addIdentifier("Dr. Sarah Chen", "role", "project lead");
  g.addIdentifier("Dr. Sarah Chen", "project", "Mercury");
  g.addIdentifier("Kenji", "phone", "090-8765-4321");

  const out = g.serialize();
  expect(out).toContain("STRUCTURAL MEMORY:");
  expect(out).toContain("[Entities]");
  expect(out).toContain("Dr. Sarah Chen");
  expect(out).toContain("role: project lead");
  expect(out).toContain("project: Mercury");
  expect(out).toContain("Kenji");
  expect(out).toContain("phone: 090-8765-4321");
});

// ── ShadowGraph: add spatial and serialize ────────────────────────

test("ShadowGraph: add spatial and serialize", () => {
  const g = new ShadowGraph();
  g.addSpatial("Floor 3", "Conference Room", "capacity: 50");
  g.addSpatial("us-east-1", "Production", "AWS");

  const out = g.serialize();
  expect(out).toContain("[Spatial]");
  expect(out).toContain("Floor 3 > Conference Room");
  expect(out).toContain("capacity: 50");
  expect(out).toContain("us-east-1 > Production");
});

// ── ShadowGraph: supersession creates correction chain ────────────

test("ShadowGraph: supersession creates correction chain", () => {
  const g = new ShadowGraph();
  g.addIdentifier("Kenji", "phone", "090-1234-5678");
  g.addIdentifier("Kenji", "neighborhood", "Shibuya");

  // Supersede both
  g.addSupersession("Kenji.phone", "090-1234-5678", "090-8765-4321");
  g.addSupersession("Kenji.neighborhood", "Shibuya", "Shinjuku");

  const out = g.serialize();

  // Correction chain should be recorded
  expect(out).toContain("[Corrections]");
  expect(out).toContain("090-1234-5678");
  expect(out).toContain("090-8765-4321");
  expect(out).toContain("Shibuya");
  expect(out).toContain("Shinjuku");

  // Identifiers should be updated to the new value
  expect(out).toContain("[Entities]");
  // The current entity attr should reflect the new value
  const entitiesSection = out.split("[Spatial]")[0]!;
  expect(entitiesSection).toContain("phone: 090-8765-4321");
  expect(entitiesSection).toContain("neighborhood: Shinjuku");
});

// ── ShadowGraph: isEmpty is correct ──────────────────────────────

test("ShadowGraph: isEmpty when new", () => {
  const g = new ShadowGraph();
  expect(g.isEmpty()).toBe(true);

  g.addIdentifier("Test", "key", "value");
  expect(g.isEmpty()).toBe(false);
});

// ── ShadowGraph: add relation and decision ───────────────────────

test("ShadowGraph: add relation and decision", () => {
  const g = new ShadowGraph();
  g.addRelation("Paul", "couple", "Quinn");
  g.addDecision("Gadget-X", "discontinue", "moved to clearance");

  const out = g.serialize();
  expect(out).toContain("[Relations]");
  expect(out).toContain("Paul -- couple -- Quinn");
  expect(out).toContain("[Decisions]");
  expect(out).toContain("Gadget-X");
  expect(out).toContain("discontinue");
  expect(out).toContain("moved to clearance");
});

// ── parseGraphTriples: extracts ENTITY, SPATIAL, RELATION lines ──

test("parseGraphTriples: extracts ENTITY lines", () => {
  const output = `
ENTITY: Dr. Sarah Chen | role: project lead | project: Mercury
ENTITY: Kenji | phone: 090-8765-4321 | neighborhood: Shinjuku
Some other text that should be ignored
ENTITY: Mercury | budget: $347,250
  `.trim();

  const parsed = parseGraphTriples(output);
  expect(parsed.entities.length).toBe(3);
  expect(parsed.entities[0]!.name).toBe("Dr. Sarah Chen");
  expect(parsed.entities[0]!.attrs).toEqual({ role: "project lead", project: "Mercury" });
  expect(parsed.entities[1]!.name).toBe("Kenji");
  expect(parsed.entities[1]!.attrs).toEqual({ phone: "090-8765-4321", neighborhood: "Shinjuku" });
});

test("parseGraphTriples: extracts SPATIAL lines", () => {
  const output = `
SPATIAL: Floor 3 > Conference Room | capacity: 50
SPATIAL: us-east-1 > Production | AWS region
  `.trim();

  const parsed = parseGraphTriples(output);
  expect(parsed.spatial.length).toBe(2);
  expect(parsed.spatial[0]!.location).toBe("Floor 3");
  expect(parsed.spatial[0]!.child).toBe("Conference Room");
  expect(parsed.spatial[0]!.attrs).toBe("capacity: 50");
});

test("parseGraphTriples: extracts RELATION lines", () => {
  const output = `
RELATION: Paul -- couple -- Quinn
RELATION: Jack -- conflict -- Iris
  `.trim();

  const parsed = parseGraphTriples(output);
  expect(parsed.relations.length).toBe(2);
  expect(parsed.relations[0]!.entity1).toBe("Paul");
  expect(parsed.relations[0]!.type).toBe("couple");
  expect(parsed.relations[0]!.entity2).toBe("Quinn");
});

test("parseGraphTriples: extracts DECISION lines", () => {
  const output = `
DECISION: Gadget-X | discontinue | moved to clearance
DECISION: Frontend | framework choice | Svelte over React
  `.trim();

  const parsed = parseGraphTriples(output);
  expect(parsed.decisions.length).toBe(2);
  expect(parsed.decisions[0]!.subject).toBe("Gadget-X");
  expect(parsed.decisions[0]!.decision).toBe("discontinue");
  expect(parsed.decisions[0]!.outcome).toBe("moved to clearance");
});

test("parseGraphTriples: extracts SUPERSEDES lines", () => {
  const output = `
SUPERSEDES: Kenji.phone | 090-8765-4321 | was: 090-1234-5678
SUPERSEDES: hotel.rate | $500/night | was: $800/night
  `.trim();

  const parsed = parseGraphTriples(output);
  expect(parsed.supersessions.length).toBe(2);
  expect(parsed.supersessions[0]!.key).toBe("Kenji.phone");
  expect(parsed.supersessions[0]!.newValue).toBe("090-8765-4321");
  expect(parsed.supersessions[0]!.oldValue).toBe("090-1234-5678");
});

test("parseGraphTriples: handles mixed output with noise", () => {
  const output = `
Here are the extracted triples:

ENTITY: Mercury | type: project | budget: $347,250
This is some explanatory text from the LLM.
SPATIAL: Floor 3 > Conference Room | seats: 50
RELATION: Sequoia -- lead investor -- Mercury
DECISION: Frontend | use Svelte | rejected React
More text.
SUPERSEDES: budget | $8,500 | was: $5,000
  `.trim();

  const parsed = parseGraphTriples(output);
  expect(parsed.entities.length).toBe(1);
  expect(parsed.spatial.length).toBe(1);
  expect(parsed.relations.length).toBe(1);
  expect(parsed.decisions.length).toBe(1);
  expect(parsed.supersessions.length).toBe(1);
});
