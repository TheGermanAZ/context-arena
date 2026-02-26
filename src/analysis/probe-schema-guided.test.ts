import { test, expect } from "bun:test";
import { parseSchema } from "./probe-schema-guided";

test("parseSchema extracts fact types from YAML-like output", () => {
  const output = `context_hint: "A project management conversation tracking budgets, personnel, and timelines"
fact_types:
  - name: "identifiers"
    description: "Phone numbers, ID codes, reference numbers"
    extraction_guidance: "Look for alphanumeric codes and phone number patterns"
    output_format: "key-value pairs"
    priority: high
  - name: "corrections"
    description: "Updated or changed facts"
    extraction_guidance: "Compare new values against previously stated ones"
    output_format: "old value -> new value"
    priority: critical
  - name: "spatial"
    description: "Locations, addresses, regions"
    extraction_guidance: "Look for place names and geographic references"
    output_format: "labeled list"
    priority: medium
validation_rules:
  - "Always prefer the most recent value when facts conflict"
  - "Flag corrections explicitly"`;

  const schema = parseSchema(output);

  expect(schema.contextHint).toContain("project management");
  expect(schema.factTypes.length).toBe(3);

  expect(schema.factTypes[0]!.name).toBe("identifiers");
  expect(schema.factTypes[0]!.priority).toBe("high");
  expect(schema.factTypes[0]!.description).toContain("Phone numbers");
  expect(schema.factTypes[0]!.extractionGuidance).toContain("alphanumeric");
  expect(schema.factTypes[0]!.outputFormat).toBe("key-value pairs");

  expect(schema.factTypes[1]!.name).toBe("corrections");
  expect(schema.factTypes[1]!.priority).toBe("critical");

  expect(schema.factTypes[2]!.name).toBe("spatial");
  expect(schema.factTypes[2]!.priority).toBe("medium");

  expect(schema.validationRules.length).toBe(2);
  expect(schema.validationRules[0]).toContain("most recent value");
});

test("parseSchema handles empty output gracefully", () => {
  const schema = parseSchema("");

  expect(schema.contextHint).toBe("");
  expect(schema.factTypes).toEqual([]);
  expect(schema.validationRules).toEqual([]);
});

test("parseSchema handles output with no fact_types section", () => {
  const output = `context_hint: "Some context"
validation_rules:
  - "Rule 1"`;

  const schema = parseSchema(output);

  expect(schema.contextHint).toContain("Some context");
  expect(schema.factTypes).toEqual([]);
  expect(schema.validationRules.length).toBe(1);
});

test("parseSchema handles output with missing fields in fact types", () => {
  const output = `context_hint: "test"
fact_types:
  - name: "entities"
    description: "People and things"
    priority: low`;

  const schema = parseSchema(output);

  expect(schema.factTypes.length).toBe(1);
  expect(schema.factTypes[0]!.name).toBe("entities");
  expect(schema.factTypes[0]!.description).toBe("People and things");
  expect(schema.factTypes[0]!.priority).toBe("low");
  expect(schema.factTypes[0]!.extractionGuidance).toBe("");
  expect(schema.factTypes[0]!.outputFormat).toBe("");
});

test("parseSchema handles priority values correctly", () => {
  const output = `context_hint: "test"
fact_types:
  - name: "a"
    description: "d"
    priority: low
  - name: "b"
    description: "d"
    priority: medium
  - name: "c"
    description: "d"
    priority: high
  - name: "d"
    description: "d"
    priority: critical`;

  const schema = parseSchema(output);

  expect(schema.factTypes[0]!.priority).toBe("low");
  expect(schema.factTypes[1]!.priority).toBe("medium");
  expect(schema.factTypes[2]!.priority).toBe("high");
  expect(schema.factTypes[3]!.priority).toBe("critical");
});
