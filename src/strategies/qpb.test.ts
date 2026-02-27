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
    strategy.addMessage({ role: "user", content: "Budget is $420,000" });
    expect(strategy.getPinnedBuffer().size).toBe(1);
    strategy.reset();
    expect(strategy.getPinnedBuffer().size).toBe(0);
  });

  test("addMessage eagerly extracts quantities into pinned buffer", () => {
    const strategy = new QPBStrategy();
    strategy.addMessage({ role: "user", content: "Budget revised to $465,000 after scope expansion." });
    expect(strategy.getPinnedBuffer().size).toBe(1);
    const values = Array.from(strategy.getPinnedBuffer().values());
    expect(values.some((v) => v.includes("$465,000"))).toBe(true);
  });

  test("serializePinnedBuffer returns empty string when buffer is empty", () => {
    const strategy = new QPBStrategy();
    expect(strategy.serializePinnedBuffer()).toBe("");
  });

  test("serializePinnedBuffer returns formatted block with markers", () => {
    const strategy = new QPBStrategy();
    strategy.addMessage({ role: "user", content: "Budget: $465,000\nVendor code: INC-4421" });
    const serialized = strategy.serializePinnedBuffer();
    expect(serialized).toContain("[PINNED VALUES]");
    expect(serialized).toContain("[/PINNED VALUES]");
    expect(serialized).toContain("$465,000");
    expect(serialized).toContain("INC-4421");
  });

  test("cross-session: serialized buffer hydrates after reset", () => {
    const strategy = new QPBStrategy();

    // Session 1: accumulate facts
    strategy.addMessage({ role: "user", content: "Project budget is $420,000." });
    strategy.addMessage({ role: "user", content: "Vendor is Northwind. Policy ID: POL-2024-8891." });
    expect(strategy.getPinnedBuffer().size).toBeGreaterThanOrEqual(2);

    // Serialize before reset
    const serialized = strategy.serializePinnedBuffer();
    expect(serialized).toContain("$420,000");
    expect(serialized).toContain("POL-2024");

    // Reset (simulates session boundary)
    strategy.reset();
    expect(strategy.getPinnedBuffer().size).toBe(0);

    // Session 2: feed persistence note containing serialized buffer
    strategy.addMessage({ role: "user", content: `Previous session note:\nProject Atlas is underway.${serialized}` });

    // Buffer should be hydrated from the persistence note
    const buffer = strategy.getPinnedBuffer();
    expect(buffer.size).toBeGreaterThanOrEqual(2);
    const values = Array.from(buffer.values());
    expect(values.some((v) => v.includes("$420,000"))).toBe(true);
    expect(values.some((v) => v.includes("POL-2024"))).toBe(true);
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
