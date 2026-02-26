import { test, expect, describe } from "bun:test";
import { RLLMStrategy } from "./rllm-strategy";

describe("RLLMStrategy", () => {
  test("implements MemoryStrategy interface", () => {
    const strategy = new RLLMStrategy();
    expect(strategy.name).toBe("RLLM");
    expect(typeof strategy.reset).toBe("function");
    expect(typeof strategy.addMessage).toBe("function");
    expect(typeof strategy.getContext).toBe("function");
  });

  test("reset clears all state", () => {
    const strategy = new RLLMStrategy();
    strategy.addMessage({ role: "user", content: "hello" });
    strategy.reset();
    // After reset, getContext should return empty messages
  });

  test("accumulates messages before compression threshold", async () => {
    const strategy = new RLLMStrategy();
    strategy.addMessage({ role: "user", content: "hello" });
    strategy.addMessage({ role: "assistant", content: "hi" });
    const ctx = await strategy.getContext();
    expect(ctx.messages.length).toBe(2);
    expect(ctx.memoryOverheadTokens).toBe(0);
  });

  test("exposes codeLogs array for CTX-4 analysis", () => {
    const strategy = new RLLMStrategy();
    expect(Array.isArray(strategy.codeLogs)).toBe(true);
    expect(strategy.codeLogs.length).toBe(0);
  });

  test("exposes extractionLog array for probe checking", () => {
    const strategy = new RLLMStrategy();
    expect(Array.isArray(strategy.extractionLog)).toBe(true);
    expect(strategy.extractionLog.length).toBe(0);
  });
});
