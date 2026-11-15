import { describe, expect, it } from "vitest";
import { fixtures } from "./fixtures";
import { balanceScore, buildPlan } from "./suggest";

describe("buildPlan", () => {
  it("fixes missing brachialis work with a hammer curl instead of more supinated curls", () => {
    const plan = buildPlan({
      split: fixtures.armsSmallFromFront,
      lagMap: { brachialis: "lagging" },
    });

    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps[0].region).toBe("brachialis");
    expect(plan.steps[0].title.toLowerCase()).toContain("hammer");
    expect(plan.end.coverage).toBeGreaterThan(plan.start.coverage);
  });

  it("adds incline work when upper chest is lagging", () => {
    const plan = buildPlan({
      split: fixtures.laggingUpperChest,
      lagMap: { chest_upper: "lagging" },
    });

    expect(plan.steps.some((step) => step.region === "chest_upper")).toBe(true);
    expect(plan.steps.some((step) => step.title.toLowerCase().includes("incline"))).toBe(true);
  });

  it("only takes steps that improve balance and never tanks a metric", () => {
    const plan = buildPlan({
      split: fixtures.laggingUpperChest,
      lagMap: { chest_upper: "lagging", lats: "lagging" },
    });

    for (const step of plan.steps) {
      expect(balanceScore(step.after)).toBeGreaterThan(balanceScore(step.before));
      for (const metric of ["coverage", "growth", "recovery"] as const) {
        expect(step.before[metric] - step.after[metric]).toBeLessThanOrEqual(0.8);
      }
    }
    expect(balanceScore(plan.end)).toBeGreaterThan(balanceScore(plan.start));
  });

  it("never stacks two growth changes for the same muscle on the same day", () => {
    const plan = buildPlan({
      split: fixtures.laggingUpperChest,
      lagMap: { chest_upper: "lagging", lats: "lagging" },
    });

    const aims = plan.steps
      .filter((step) => step.kind !== "cut_sets" && step.kind !== "move")
      .map((step) => `${step.dayTitle}:${step.region}`);
    expect(new Set(aims).size).toBe(aims.length);
  });

  it("does not mutate the caller's split", () => {
    const split = structuredClone(fixtures.armsSmallFromFront);
    const before = JSON.stringify(split);
    buildPlan({ split, lagMap: { brachialis: "lagging" } });
    expect(JSON.stringify(split)).toBe(before);
  });
});
