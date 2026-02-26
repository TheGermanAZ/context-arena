import { test, expect } from "bun:test";
import { checkProbeRetained, buildTranscript, getScenarioByName } from "./probe-utils";
import type { Probe } from "../tasks/scenarios";

test("checkProbeRetained matches all patterns", () => {
  const probe: Probe = {
    fact: "test phone",
    type: "phone/id",
    patterns: ["555-0147", "mechanic"],
    introducedAtStep: 1,
  };
  expect(checkProbeRetained(probe, "Call the mechanic at 555-0147")).toBe(true);
  expect(checkProbeRetained(probe, "Call the mechanic")).toBe(false);
  expect(checkProbeRetained(probe, "555-0147 is a number")).toBe(false);
});

test("buildTranscript joins messages", () => {
  const messages = [
    { role: "user" as const, content: "Hello" },
    { role: "assistant" as const, content: "Hi there" },
  ];
  expect(buildTranscript(messages)).toBe("user: Hello\nassistant: Hi there");
});

test("getScenarioByName returns correct scenario", () => {
  const s = getScenarioByName("Early Fact Recall");
  expect(s).toBeDefined();
  expect(s!.steps.length).toBe(20);
});

test("getScenarioByName returns undefined for unknown", () => {
  expect(getScenarioByName("Nonexistent")).toBeUndefined();
});
