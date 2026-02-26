import { ALL_SCENARIOS } from "./scenarios";

describe("State Change Tracking checker", () => {
  const scenario = ALL_SCENARIOS.find((s) => s.name === "State Change Tracking");

  test("fails when Gizmo-Z final quantity is missing", () => {
    expect(scenario).toBeDefined();
    const answerWithoutGizmo =
      "Widget-A: 370, Widget-B: 1005, Gadget-X: 200, MegaPart-Q: 400.";
    expect(scenario!.checkAnswer(answerWithoutGizmo)).toBe(false);
  });

  test("passes when Gizmo-Z final quantity is explicitly zero", () => {
    expect(scenario).toBeDefined();
    const correctAnswer =
      "Widget-A: 370, Widget-B: 1005, Gadget-X: 200, Gizmo-Z: 0, MegaPart-Q: 400.";
    expect(scenario!.checkAnswer(correctAnswer)).toBe(true);
  });
});
