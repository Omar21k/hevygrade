import { describe, expect, it } from "vitest";
import { fixtures } from "./fixtures";
import { gradeSplit } from "./score";

describe("gradeSplit", () => {
  it("penalizes supinated-only arm work when the front of the arm is lagging", () => {
    const withoutHammers = gradeSplit({
      split: fixtures.armsSmallFromFront,
      lagMap: { brachialis: "lagging" },
    });
    const withHammers = gradeSplit({
      split: fixtures.armsWithHammers,
      lagMap: { brachialis: "lagging" },
    });

    const before = withoutHammers.regions.find((row) => row.region === "brachialis");
    const after = withHammers.regions.find((row) => row.region === "brachialis");

    expect(before?.hasPrimary).toBe(false);
    expect(before?.coverageScore).toBeLessThan(4);
    expect(after?.hasPrimary).toBe(true);
    expect(after?.coverageScore).toBeGreaterThan(before!.coverageScore);
    expect(withoutHammers.coverage.score).toBeLessThan(withHammers.coverage.score);
    expect(
      withoutHammers.findings.some((finding) =>
        finding.suggestedChange?.toLowerCase().includes("hammer"),
      ),
    ).toBe(true);
  });

  it("treats incline presence as insufficient when upper chest volume is missing", () => {
    const noIncline = gradeSplit({
      split: fixtures.laggingUpperChest,
      lagMap: { chest_upper: "lagging" },
    });
    const someIncline = gradeSplit({
      split: fixtures.upperChestWithVolume,
      lagMap: { chest_upper: "lagging" },
    });

    const missing = noIncline.regions.find((row) => row.region === "chest_upper");
    const present = someIncline.regions.find((row) => row.region === "chest_upper");

    expect(missing?.hasPrimary).toBe(false);
    expect(present?.hasPrimary).toBe(true);
    expect(present?.effectiveSets).toBeGreaterThan(missing!.effectiveSets);
    expect(present!.effectiveSets).toBeLessThan(present!.targetLow);
    expect(
      someIncline.findings.some(
        (finding) =>
          finding.region === "chest_upper" &&
          finding.detail.toLowerCase().includes("enough stimulus"),
      ),
    ).toBe(true);
    expect(noIncline.coverage.score).toBeLessThan(someIncline.coverage.score);
  });

  it("caps growth without Hevy history and lifts the cap when load trends up", () => {
    const projected = gradeSplit({
      split: fixtures.armsWithHammers,
      lagMap: { brachialis: "lagging" },
    });
    expect(projected.flags.growthCappedWithoutHistory).toBe(true);
    expect(projected.growth.score).toBeLessThanOrEqual(7);

    const history = Array.from({ length: 12 }, (_, index) => ({
      date: `2026-09-${String(index + 1).padStart(2, "0")}`,
      exerciseId: "hammer_curl",
      weightKg: 12 + index,
      reps: 10,
      type: "normal" as const,
    }));

    const observed = gradeSplit({
      split: fixtures.armsWithHammers,
      lagMap: { brachialis: "lagging" },
      history,
    });
    expect(observed.flags.usedHistory).toBe(true);
    expect(observed.growth.score).toBeGreaterThan(projected.growth.score);
  });

  it("drops recovery when the same heavy region is trained on consecutive days", () => {
    const split = {
      title: "Stacked chest",
      cycleDays: 7,
      days: [
        {
          id: "a",
          title: "Chest A",
          exercises: [
            {
              exerciseId: "barbell_bench_press",
              sets: Array.from({ length: 6 }, () => ({ type: "normal" as const })),
            },
            {
              exerciseId: "incline_dumbbell_press",
              sets: Array.from({ length: 6 }, () => ({ type: "normal" as const })),
            },
          ],
        },
        {
          id: "b",
          title: "Chest B",
          exercises: [
            {
              exerciseId: "incline_barbell_press",
              sets: Array.from({ length: 8 }, () => ({ type: "normal" as const })),
            },
            {
              exerciseId: "barbell_bench_press",
              sets: Array.from({ length: 8 }, () => ({ type: "normal" as const })),
            },
          ],
        },
      ],
    };

    const grade = gradeSplit({ split, lagMap: {} });
    expect(grade.recovery.score).toBeLessThan(8);
    expect(
      grade.findings.some((finding) => finding.id.includes("recovery-consecutive")),
    ).toBe(true);
  });
});
