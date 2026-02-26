import { test, expect, describe } from "bun:test";
import { PersistentRLMStrategy } from "./persistent-rlm";

describe("PersistentRLMStrategy", () => {
  test("implements MemoryStrategy interface", () => {
    const strategy = new PersistentRLMStrategy();
    expect(strategy.name).toBe("PersistentRLM");
    expect(typeof strategy.reset).toBe("function");
    expect(typeof strategy.addMessage).toBe("function");
    expect(typeof strategy.getContext).toBe("function");
  });

  test("has enableLogging and delegationLog like RLMStrategy", () => {
    const strategy = new PersistentRLMStrategy();
    strategy.enableLogging = true;
    expect(Array.isArray(strategy.delegationLog)).toBe(true);
  });
});

describe("parseSections", () => {
  test("parses clean sub-LLM output into typed sections", () => {
    const output = `IDENTIFIERS:
- Kenji's phone: 090-8765-4321
- Policy ID: POL-2024-8891

ENTITIES:
- Sarah Chen: project lead, based in Portland
- Acme Corp: client, Fortune 500

QUANTITIES:
- Q3 marketing budget: $45,000
- Team size: 12 developers

DATES:
- Project deadline: March 15, 2026

CORRECTIONS:
- Hotel changed: Marriott → Hilton Garden Inn
- Budget revised: $40,000 → $45,000

STRUCTURAL:
- Floor 3: conference room, capacity 50
- Chose React over Vue for frontend`;

    const result = PersistentRLMStrategy.parseSections(output);

    expect(result.IDENTIFIERS).toHaveLength(2);
    expect(result.IDENTIFIERS[0].key).toBe("Kenji's phone");
    expect(result.IDENTIFIERS[0].value).toContain("090-8765-4321");

    expect(result.ENTITIES).toHaveLength(2);
    expect(result.ENTITIES[0].key).toBe("Sarah Chen");

    expect(result.QUANTITIES).toHaveLength(2);
    expect(result.QUANTITIES[0].value).toContain("$45,000");

    expect(result.DATES).toHaveLength(1);
    expect(result.DATES[0].value).toContain("March 15, 2026");

    expect(result.CORRECTIONS).toHaveLength(2);
    expect(result.CORRECTIONS[0].value).toContain("Marriott");

    expect(result.STRUCTURAL).toHaveLength(2);
    expect(result.STRUCTURAL[0].value).toContain("capacity 50");
  });

  test("handles missing sections gracefully", () => {
    const output = `IDENTIFIERS:
- Phone: 555-1234

ENTITIES:
- Bob: manager`;

    const result = PersistentRLMStrategy.parseSections(output);

    expect(result.IDENTIFIERS).toHaveLength(1);
    expect(result.ENTITIES).toHaveLength(1);
    expect(result.QUANTITIES).toHaveLength(0);
    expect(result.DATES).toHaveLength(0);
    expect(result.CORRECTIONS).toHaveLength(0);
    expect(result.STRUCTURAL).toHaveLength(0);
  });

  test("handles numbered list format", () => {
    const output = `IDENTIFIERS:
1. Kenji's phone: 090-8765-4321
2. Policy ID: POL-2024-8891`;

    const result = PersistentRLMStrategy.parseSections(output);
    expect(result.IDENTIFIERS).toHaveLength(2);
    expect(result.IDENTIFIERS[0].value).toContain("090-8765-4321");
  });

  test("handles bullet variants (* and •)", () => {
    const output = `ENTITIES:
* Alice: developer
• Bob: designer`;

    const result = PersistentRLMStrategy.parseSections(output);
    expect(result.ENTITIES).toHaveLength(2);
  });

  test("routes lines before first section to OVERFLOW", () => {
    const output = `Here is the extracted information:

Some important context about the project.

IDENTIFIERS:
- Phone: 555-0000`;

    const result = PersistentRLMStrategy.parseSections(output);
    expect(result.IDENTIFIERS).toHaveLength(1);
    expect(result.OVERFLOW.length).toBeGreaterThan(0);
    expect(result.OVERFLOW.some((e) => e.value.includes("important context"))).toBe(true);
  });

  test("handles section header without trailing colon", () => {
    const output = `IDENTIFIERS
- Phone: 555-1111

ENTITIES
- Alice: lead`;

    const result = PersistentRLMStrategy.parseSections(output);
    expect(result.IDENTIFIERS).toHaveLength(1);
    expect(result.ENTITIES).toHaveLength(1);
  });

  // ── Section alias tests ──

  test("maps NUMBERS to QUANTITIES", () => {
    const output = `NUMBERS:
- Widget-A inventory: 370 units
- Total cost: $5,000`;

    const result = PersistentRLMStrategy.parseSections(output);
    expect(result.QUANTITIES).toHaveLength(2);
    expect(result.QUANTITIES[0].value).toContain("370");
  });

  test("maps CURRENT STATE to STRUCTURAL", () => {
    const output = `CURRENT STATE:
- Project is in Phase 2
- Team relocated to Building C`;

    const result = PersistentRLMStrategy.parseSections(output);
    expect(result.STRUCTURAL).toHaveLength(2);
  });

  test("maps UPDATES to CORRECTIONS", () => {
    const output = `UPDATES:
- Budget changed from $5000 to $8500
- Hotel switched from Marriott to Aman`;

    const result = PersistentRLMStrategy.parseSections(output);
    expect(result.CORRECTIONS).toHaveLength(2);
  });

  test("maps LOCATIONS to STRUCTURAL", () => {
    const output = `LOCATIONS:
- Floor 3: conference room
- East warehouse: Widget-B storage`;

    const result = PersistentRLMStrategy.parseSections(output);
    expect(result.STRUCTURAL).toHaveLength(2);
  });

  test("maps DECISIONS to STRUCTURAL", () => {
    const output = `DECISIONS:
- Chose React over Vue
- Approved Q3 budget`;

    const result = PersistentRLMStrategy.parseSections(output);
    expect(result.STRUCTURAL).toHaveLength(2);
  });

  test("maps ITEMS to ENTITIES", () => {
    const output = `ITEMS:
- Widget-A: main product, $24.99 each
- Gadget-X: discontinued, clearance`;

    const result = PersistentRLMStrategy.parseSections(output);
    expect(result.ENTITIES).toHaveLength(2);
  });

  test("maps DATES/TIMES to DATES", () => {
    const output = `DATES/TIMES:
- Meeting: June 10, 3pm
- Deadline: March 15`;

    const result = PersistentRLMStrategy.parseSections(output);
    expect(result.DATES).toHaveLength(2);
  });

  // ── Multi-line entry tests ──

  test("merges indented continuation lines with previous entry", () => {
    const output = `ENTITIES:
- Sarah Chen: project lead, based in Portland,
    reports to VP of Engineering, manages team of 5`;

    const result = PersistentRLMStrategy.parseSections(output);
    expect(result.ENTITIES).toHaveLength(1);
    expect(result.ENTITIES[0].value).toContain("project lead");
    expect(result.ENTITIES[0].value).toContain("manages team of 5");
  });

  // ── Markdown formatting tests ──

  test("handles **bold** section headers", () => {
    const output = `**IDENTIFIERS:**
- Phone: 555-1234

**ENTITIES:**
- Alice: developer`;

    const result = PersistentRLMStrategy.parseSections(output);
    expect(result.IDENTIFIERS).toHaveLength(1);
    expect(result.ENTITIES).toHaveLength(1);
  });

  test("handles ## markdown section headers", () => {
    const output = `## IDENTIFIERS
- Phone: 555-1234

## ENTITIES
- Alice: developer`;

    const result = PersistentRLMStrategy.parseSections(output);
    expect(result.IDENTIFIERS).toHaveLength(1);
    expect(result.ENTITIES).toHaveLength(1);
  });

  // ── Overflow tests ──

  test("routes content under unrecognized headers to OVERFLOW", () => {
    const output = `IDENTIFIERS:
- Phone: 555-1234

SUMMARY:
- The project is going well
- Team morale is high

ENTITIES:
- Bob: manager`;

    const result = PersistentRLMStrategy.parseSections(output);
    expect(result.IDENTIFIERS).toHaveLength(1);
    expect(result.ENTITIES).toHaveLength(1);
    // "SUMMARY" is not a recognized section, so its content goes to overflow
    expect(result.OVERFLOW.length).toBeGreaterThan(0);
  });
});

describe("resolveSection", () => {
  test("resolves canonical names", () => {
    expect(PersistentRLMStrategy.resolveSection("IDENTIFIERS")).toBe("IDENTIFIERS");
    expect(PersistentRLMStrategy.resolveSection("QUANTITIES")).toBe("QUANTITIES");
  });

  test("resolves aliases case-insensitively", () => {
    expect(PersistentRLMStrategy.resolveSection("Numbers")).toBe("QUANTITIES");
    expect(PersistentRLMStrategy.resolveSection("CURRENT STATE")).toBe("STRUCTURAL");
    expect(PersistentRLMStrategy.resolveSection("updates")).toBe("CORRECTIONS");
  });

  test("returns null for unknown headers", () => {
    expect(PersistentRLMStrategy.resolveSection("SUMMARY")).toBeNull();
    expect(PersistentRLMStrategy.resolveSection("NOTES")).toBeNull();
  });
});

describe("parseEntry", () => {
  test("parses key: value format", () => {
    const entry = PersistentRLMStrategy.parseEntry(
      "Kenji's phone: 090-8765-4321",
    );
    expect(entry.key).toBe("Kenji's phone");
    expect(entry.value).toContain("090-8765-4321");
  });

  test("parses arrow format for corrections", () => {
    const entry = PersistentRLMStrategy.parseEntry(
      "Hotel changed: Marriott → Hilton",
    );
    expect(entry.key).toBe("Hotel changed");
  });

  test("handles bare lines without delimiter", () => {
    const entry = PersistentRLMStrategy.parseEntry(
      "Some fact without a clear key-value structure that goes on and on",
    );
    expect(entry.key.length).toBeLessThanOrEqual(40);
    expect(entry.value).toContain("without a clear");
  });

  test("handles quantity with status qualifier", () => {
    const entry = PersistentRLMStrategy.parseEntry(
      "Gadget-X (clearance): 200 units",
    );
    expect(entry.key).toBe("Gadget-X (clearance)");
    expect(entry.value).toContain("200 units");
  });
});

describe("merge semantics", () => {
  test("corrections are deduplicated on merge", () => {
    const output1 = `CORRECTIONS:
- Hotel changed: Marriott → Hilton Garden Inn`;

    const output2 = `CORRECTIONS:
- Hotel changed: Marriott → Hilton Garden Inn
- Budget revised: $40,000 → $45,000`;

    const parsed1 = PersistentRLMStrategy.parseSections(output1);
    const parsed2 = PersistentRLMStrategy.parseSections(output2);

    expect(parsed1.CORRECTIONS).toHaveLength(1);
    expect(parsed2.CORRECTIONS).toHaveLength(2);
  });

  test("identifiers preserve exact values across parses", () => {
    const output = `IDENTIFIERS:
- Kenji's phone: 090-8765-4321
- Policy ID: POL-2024-8891`;

    const parsed = PersistentRLMStrategy.parseSections(output);
    expect(parsed.IDENTIFIERS[0].value).toBe(
      "Kenji's phone: 090-8765-4321",
    );
    expect(parsed.IDENTIFIERS[1].value).toBe("Policy ID: POL-2024-8891");
  });
});
