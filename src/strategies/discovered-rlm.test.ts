import { test, expect, describe } from "bun:test";
import { DiscoveredRLMStrategy } from "./discovered-rlm";

describe("DiscoveredRLMStrategy", () => {
  test("implements MemoryStrategy interface", () => {
    const strategy = new DiscoveredRLMStrategy();
    expect(strategy.name).toBe("DiscoveredRLM");
    expect(typeof strategy.reset).toBe("function");
    expect(typeof strategy.addMessage).toBe("function");
    expect(typeof strategy.getContext).toBe("function");
  });

  test("has enableLogging and delegationLog like RLMStrategy", () => {
    const strategy = new DiscoveredRLMStrategy();
    strategy.enableLogging = true;
    expect(Array.isArray(strategy.delegationLog)).toBe(true);
  });
});
