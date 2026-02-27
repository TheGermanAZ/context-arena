import { test, expect, describe } from "bun:test";
import { QPBStrategy } from "./qpb";

describe("QPBStrategy", () => {
  test("implements MemoryStrategy interface", () => {
    const strategy = new QPBStrategy();
    expect(strategy.name).toBe("QPB");
    expect(typeof strategy.reset).toBe("function");
    expect(typeof strategy.addMessage).toBe("function");
    expect(typeof strategy.getContext).toBe("function");
  });

  test("has enableLogging and delegationLog", () => {
    const strategy = new QPBStrategy();
    strategy.enableLogging = true;
    expect(Array.isArray(strategy.delegationLog)).toBe(true);
  });

  test("reset clears pinned buffer", () => {
    const strategy = new QPBStrategy();
    strategy.addMessage({ role: "user", content: "test" });
    strategy.reset();
    expect(strategy.getPinnedBuffer().size).toBe(0);
  });
});

describe("extractQuantities", () => {
  test("extracts dollar amounts", () => {
    const entries = QPBStrategy.extractQuantities(
      "Q3 marketing budget: $45,000\nTotal cost: $5,000.50",
    );
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.some((e) => e.value.includes("$45,000"))).toBe(true);
    expect(entries.some((e) => e.value.includes("$5,000.50"))).toBe(true);
  });

  test("extracts counts with units", () => {
    const entries = QPBStrategy.extractQuantities(
      "Team size: 12 developers\nGadget-X (clearance): 200 units",
    );
    expect(entries.length).toBeGreaterThanOrEqual(2);
    expect(entries.some((e) => e.value.includes("12 developers"))).toBe(true);
    expect(entries.some((e) => e.value.includes("200 units"))).toBe(true);
  });

  test("extracts phone numbers", () => {
    const entries = QPBStrategy.extractQuantities(
      "Kenji's phone: 090-8765-4321",
    );
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries.some((e) => e.value.includes("090-8765-4321"))).toBe(true);
  });

  test("extracts IDs and codes", () => {
    const entries = QPBStrategy.extractQuantities(
      "Policy ID: POL-2024-8891\nTicket: INC-4421",
    );
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });

  test("extracts percentages", () => {
    const entries = QPBStrategy.extractQuantities(
      "Coverage: 85% of endpoints\nError rate: 2.1%",
    );
    expect(entries.length).toBeGreaterThanOrEqual(2);
  });

  test("returns empty array for no quantities", () => {
    const entries = QPBStrategy.extractQuantities(
      "Hello, how are you? Everything is fine.",
    );
    expect(entries).toHaveLength(0);
  });

  test("extracts full line as value for context", () => {
    const entries = QPBStrategy.extractQuantities(
      "- Widget-A inventory: 370 units at $24.99 each",
    );
    expect(entries.some((e) => e.value.includes("Widget-A"))).toBe(true);
  });
});
