import { test, expect, describe } from "bun:test";
import { classifyStable, type StableClassification } from "./probe-stability";

describe("classifyStable", () => {
  test("finds phone numbers", () => {
    const results = classifyStable(
      "Call the mechanic at 555-0147 for the oil change."
    );
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "555-0147", type: "phone" }),
      ])
    );
  });

  test("finds phone numbers with dots", () => {
    const results = classifyStable("Kenji's number is 090.8765.4321.");
    expect(results.some((r) => r.type === "phone")).toBe(true);
  });

  test("finds phone numbers without separators", () => {
    const results = classifyStable("Call 5550147234 for info.");
    expect(results.some((r) => r.type === "phone")).toBe(true);
  });

  test("finds ID codes like RMC-2847", () => {
    const results = classifyStable("My patient ID is RMC-2847.");
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "RMC-2847", type: "id" }),
      ])
    );
  });

  test("finds ID codes like HLT-99284-B", () => {
    const results = classifyStable(
      "The policy number is HLT-99284-B."
    );
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "id" }),
      ])
    );
  });

  test("finds ID codes like CLM-2024-0892", () => {
    const results = classifyStable(
      "The claim reference is CLM-2024-0892."
    );
    expect(results.some((r) => r.type === "id")).toBe(true);
  });

  test("finds flight codes like UA447", () => {
    const results = classifyStable(
      "My flight is United flight UA447 departing at 7:15am."
    );
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "UA447", type: "code" }),
      ])
    );
  });

  test("finds gate codes like B12", () => {
    const results = classifyStable("Departing from gate B12.");
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "B12", type: "code" }),
      ])
    );
  });

  test("finds confirmation codes like XKRM47", () => {
    const results = classifyStable("Confirmation code XKRM47.");
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "XKRM47", type: "code" }),
      ])
    );
  });

  test("finds alarm/pin codes near keyword", () => {
    const results = classifyStable(
      "The house alarm code changed to 8472."
    );
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "8472", type: "code" }),
      ])
    );
  });

  test("finds passport numbers like P-847291", () => {
    const results = classifyStable("Passport number is P-847291.");
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "P-847291", type: "id" }),
      ])
    );
  });

  test("returns empty for pure narrative text", () => {
    const results = classifyStable(
      "The weather is nice today. I enjoy walking in the park with my dog."
    );
    expect(results).toEqual([]);
  });

  test("returns empty for generic conversation", () => {
    const results = classifyStable(
      "Can you explain how blockchain works? I keep hearing about it at work."
    );
    expect(results).toEqual([]);
  });

  test("deduplicates results", () => {
    const results = classifyStable(
      "Call 555-0147. Remember, the number is 555-0147."
    );
    const phoneResults = results.filter(
      (r) => r.value === "555-0147"
    );
    expect(phoneResults.length).toBe(1);
  });

  test("finds multiple types in one text", () => {
    const results = classifyStable(
      "Patient ID RMC-2847, phone 555-0147, flight UA447, gate B12, alarm code 8472."
    );
    const types = new Set(results.map((r) => r.type));
    expect(types.has("phone")).toBe(true);
    expect(types.has("id")).toBe(true);
    expect(types.has("code")).toBe(true);
  });

  // ── Quantity classifier tests ──────────────────────────────────────

  test("finds currency amounts like $347,250", () => {
    const results = classifyStable("The budget is exactly $347,250.");
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "$347,250", type: "quantity" }),
      ])
    );
  });

  test("finds currency with suffixes like $1.5M and $175K", () => {
    const results = classifyStable(
      "Sequoia is putting in $1.5M. Monthly burn is $175K."
    );
    const quantities = results.filter((r) => r.type === "quantity");
    expect(quantities.some((q) => q.value.includes("1.5M"))).toBe(true);
    expect(quantities.some((q) => q.value.includes("175K"))).toBe(true);
  });

  test("finds currency with decimals like $24.99", () => {
    const results = classifyStable("Widget-A price change to $24.99 per unit.");
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "$24.99", type: "quantity" }),
      ])
    );
  });

  test("finds percentages like 85% and 16.67%", () => {
    const results = classifyStable(
      "Integration tests cover at least 85% of endpoints. Dilution is 16.67%."
    );
    const quantities = results.filter((r) => r.type === "quantity");
    expect(quantities.some((q) => q.value === "85%")).toBe(true);
    expect(quantities.some((q) => q.value === "16.67%")).toBe(true);
  });

  test("finds number+unit like '24 people' and '50 seats'", () => {
    const results = classifyStable(
      "The engineering team has 24 people. The room holds 50 seats."
    );
    const quantities = results.filter((r) => r.type === "quantity");
    expect(quantities.some((q) => q.value.includes("24 people"))).toBe(true);
    expect(quantities.some((q) => q.value.includes("50 seats"))).toBe(true);
  });

  test("finds number+unit like '13 months' and '7 years'", () => {
    const results = classifyStable(
      "Runway is 13 months. Data retention requires 7 years of logs."
    );
    const quantities = results.filter((r) => r.type === "quantity");
    expect(quantities.some((q) => q.value.includes("13 months"))).toBe(true);
    expect(quantities.some((q) => q.value.includes("7 years"))).toBe(true);
  });

  test("finds number+unit like '10mg'", () => {
    const results = classifyStable("Prescription is for Lisinopril 10mg daily.");
    const quantities = results.filter((r) => r.type === "quantity");
    expect(quantities.some((q) => q.value.includes("10mg"))).toBe(true);
  });

  // ── False positive tests ───────────────────────────────────────────

  test("does not classify bare numbers in noise as quantities", () => {
    const results = classifyStable(
      "Did you see that game last night? The Lakers won 112-108. LeBron had 34 points. Crazy game."
    );
    const quantities = results.filter((r) => r.type === "quantity");
    expect(quantities.length).toBe(0);
  });

  test("does not classify random questions as quantities", () => {
    const results = classifyStable(
      "Can you explain how blockchain works? What about crocodiles vs alligators?"
    );
    expect(results.length).toBe(0);
  });

  test("finds quantities mixed with identifiers", () => {
    const results = classifyStable(
      "Patient ID RMC-2847, budget $347,250, team of 24 people, accuracy 85%."
    );
    const types = new Set(results.map((r) => r.type));
    expect(types.has("id")).toBe(true);
    expect(types.has("quantity")).toBe(true);
    const quantities = results.filter((r) => r.type === "quantity");
    expect(quantities.length).toBeGreaterThanOrEqual(3);
  });
});
