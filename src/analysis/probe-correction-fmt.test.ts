import { test, expect, describe } from "bun:test";
import {
  CORRECTION_FORMATS,
  buildCorrectionPrompt,
  type CorrectionFormat,
} from "./probe-correction-fmt";

describe("CORRECTION_FORMATS", () => {
  test("has exactly 7 formats", () => {
    expect(CORRECTION_FORMATS).toHaveLength(7);
  });

  test("each format has name and promptFragment", () => {
    for (const format of CORRECTION_FORMATS) {
      expect(typeof format.name).toBe("string");
      expect(format.name.length).toBeGreaterThan(0);
      expect(typeof format.promptFragment).toBe("string");
      expect(format.promptFragment.length).toBeGreaterThan(0);
    }
  });

  test("format names are unique", () => {
    const names = CORRECTION_FORMATS.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test("contains the expected format names", () => {
    const names = CORRECTION_FORMATS.map((f) => f.name);
    expect(names).toContain("Explicit Negation");
    expect(names).toContain("Contrastive Pair");
    expect(names).toContain("Temporal Supersession");
    expect(names).toContain("Authoritative Override");
    expect(names).toContain("Self-Generated Re-Derivation");
    expect(names).toContain("Structured Diff");
    expect(names).toContain("Socratic Elicitation");
  });
});

describe("buildCorrectionPrompt", () => {
  test("contains all 5 question categories", () => {
    const format = CORRECTION_FORMATS[0]!;
    const prompt = buildCorrectionPrompt(format);

    expect(prompt).toContain("ENTITIES");
    expect(prompt).toContain("DECISIONS");
    expect(prompt).toContain("NUMBERS");
    expect(prompt).toContain("CURRENT STATE");
  });

  test("inserts the format promptFragment into question 3", () => {
    for (const format of CORRECTION_FORMATS) {
      const prompt = buildCorrectionPrompt(format);
      // The format's promptFragment content should appear in the generated prompt
      // Check that a distinctive part of the fragment is present
      expect(prompt).toContain(format.promptFragment.slice(0, 40));
    }
  });

  test("replaces the default CORRECTIONS question", () => {
    const format = CORRECTION_FORMATS[0]!;
    const prompt = buildCorrectionPrompt(format);

    // The original generic "List BOTH the old value and the new value" text
    // should NOT be present — it's replaced by the format's fragment
    expect(prompt).not.toContain(
      "List BOTH the old value and the new value explicitly",
    );
  });

  test("preserves the sub-agent instruction prefix", () => {
    const format = CORRECTION_FORMATS[0]!;
    const prompt = buildCorrectionPrompt(format);

    expect(prompt).toContain("You are a sub-agent processing a conversation segment");
    expect(prompt).toContain("COMPLETE knowledge state");
  });
});
