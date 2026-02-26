import { test, expect, describe } from "bun:test";
import {
  informationDensity,
  correctionFrequency,
  identifierDensity,
  noiseRatio,
  routeDepth,
  type AssessorSignals,
} from "./probe-da-rlm";

describe("informationDensity", () => {
  test("high for dense text with entities, numbers, and IDs", () => {
    const text =
      "Dr. Sarah Chen approved $347,250 for Project Mercury. Patient ID RMC-2847 filed on March 15. " +
      "James Rodriguez from VP Engineering confirmed the budget. Policy HLT-99284-B covers 85% of costs.";
    const density = informationDensity(text);
    // Many entities (Dr. Sarah Chen, Project Mercury, James Rodriguez, VP Engineering),
    // numbers ($347,250, 2847, 85), IDs (RMC-2847, HLT-99284-B) in ~35 tokens
    expect(density).toBeGreaterThan(10);
  });

  test("low for sparse/chitchat text", () => {
    const text =
      "Oh by the way, did you see that game last night? It was really exciting. " +
      "I think we should go sometime. What do you think about that?";
    const density = informationDensity(text);
    expect(density).toBeLessThan(5);
  });
});

describe("correctionFrequency", () => {
  test("detects correction markers", () => {
    const text =
      "Actually, the budget was updated. Wait, I need to correct that. " +
      "The price changed from $800 to $600. We corrected the estimate.";
    const count = correctionFrequency(text);
    // "actually", "wait", "updated", "changed", "corrected"
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test("zero for text with no corrections", () => {
    const text =
      "The project is called Mercury. The budget is $347,250. The deadline is March 15.";
    const count = correctionFrequency(text);
    expect(count).toBe(0);
  });
});

describe("identifierDensity", () => {
  test("counts phone numbers and ID codes", () => {
    const text =
      "Call 555-0147 for the mechanic. Patient ID is RMC-2847. " +
      "Policy number HLT-99284-B. Confirmation code XKRM47.";
    const density = identifierDensity(text);
    // 555-0147, RMC-2847, HLT-99284-B, XKRM47 = 4 unique identifiers
    expect(density).toBeGreaterThanOrEqual(4);
  });

  test("zero for pure narrative text", () => {
    const text =
      "What a beautiful day it is today. The sun is shining and the birds are singing. " +
      "I love going for walks in the park.";
    const density = identifierDensity(text);
    expect(density).toBe(0);
  });
});

describe("noiseRatio", () => {
  test("high for chitchat messages", () => {
    const messages = [
      "Did you see the game last night?",
      "What do you think about the weather?",
      "Tell me a fun fact about octopuses.",
      "Can you write me a haiku about winter?",
      "What is the meaning of life?",
    ];
    const ratio = noiseRatio(messages);
    expect(ratio).toBeGreaterThan(0.5);
  });

  test("low for information-dense messages", () => {
    const messages = [
      "The budget is $347,250 and Dr. Sarah Chen is the lead.",
      "Patient ID RMC-2847, appointment at 2:30pm.",
      "Call 555-0147 for the mechanic. Mileage at 38,500.",
      "Policy HLT-99284-B, claim CLM-2024-0892.",
    ];
    const ratio = noiseRatio(messages);
    expect(ratio).toBeLessThan(0.5);
  });
});

describe("routeDepth", () => {
  test("returns 1 for high noise ratio", () => {
    const signals: AssessorSignals = {
      informationDensity: 5,
      correctionFrequency: 0,
      identifierDensity: 1,
      noiseRatio: 0.6,
      knowledgeSize: 1000,
    };
    expect(routeDepth(signals)).toBe(1);
  });

  test("returns 1 for high identifier density", () => {
    const signals: AssessorSignals = {
      informationDensity: 5,
      correctionFrequency: 0,
      identifierDensity: 4,
      noiseRatio: 0.3,
      knowledgeSize: 1000,
    };
    expect(routeDepth(signals)).toBe(1);
  });

  test("returns 2 for dense content with corrections", () => {
    const signals: AssessorSignals = {
      informationDensity: 12,
      correctionFrequency: 2,
      identifierDensity: 2,
      noiseRatio: 0.2,
      knowledgeSize: 2000,
    };
    expect(routeDepth(signals)).toBe(2);
  });

  test("returns 3 for high correction frequency", () => {
    const signals: AssessorSignals = {
      informationDensity: 8,
      correctionFrequency: 4,
      identifierDensity: 1,
      noiseRatio: 0.2,
      knowledgeSize: 2000,
    };
    expect(routeDepth(signals)).toBe(3);
  });

  test("returns 1 for large knowledge size (Scaling Paradox)", () => {
    const signals: AssessorSignals = {
      informationDensity: 8,
      correctionFrequency: 0,
      identifierDensity: 1,
      noiseRatio: 0.2,
      knowledgeSize: 5000,
    };
    expect(routeDepth(signals)).toBe(1);
  });

  test("returns 1 as conservative default", () => {
    const signals: AssessorSignals = {
      informationDensity: 5,
      correctionFrequency: 0,
      identifierDensity: 1,
      noiseRatio: 0.3,
      knowledgeSize: 2000,
    };
    expect(routeDepth(signals)).toBe(1);
  });
});
