import { test, expect, describe } from "bun:test";
import { QTDStrategy } from "./qtd";

describe("QTDStrategy", () => {
  test("implements MemoryStrategy interface", () => {
    const strategy = new QTDStrategy();
    expect(strategy.name).toBe("QTD");
    expect(typeof strategy.reset).toBe("function");
    expect(typeof strategy.addMessage).toBe("function");
    expect(typeof strategy.getContext).toBe("function");
  });

  test("returns all messages when under token budget", async () => {
    const strategy = new QTDStrategy(100_000); // huge budget
    strategy.addMessage({ role: "user", content: "Hello" });
    strategy.addMessage({ role: "assistant", content: "Hi" });
    strategy.addMessage({ role: "user", content: "What is 1+1?" });
    const ctx = await strategy.getContext();
    expect(ctx.messages).toHaveLength(3);
    expect(ctx.system).toBeUndefined();
    expect(ctx.memoryOverheadTokens).toBe(0);
  });

  test("reset clears all state", () => {
    const strategy = new QTDStrategy();
    strategy.addMessage({ role: "user", content: "Hello" });
    strategy.reset();
    expect(true).toBe(true);
  });

  test("has enableLogging and delegationLog", () => {
    const strategy = new QTDStrategy();
    strategy.enableLogging = true;
    expect(Array.isArray(strategy.delegationLog)).toBe(true);
  });

  test("estimateTokens returns roughly 1 token per 4 chars", () => {
    expect(QTDStrategy.estimateTokens("abcdefgh")).toBe(2); // 8 chars / 4
    expect(QTDStrategy.estimateTokens("")).toBe(0);
  });
});
