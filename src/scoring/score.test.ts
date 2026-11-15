import { describe, expect, it } from "vitest";
import { fixtures } from "./fixtures";
import { gradeSplit, recentHistory } from "./score";

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

  it("lets one lagging region shift growth without becoming the whole score", () => {
    const neutral = gradeSplit({ split: fixtures.laggingUpperChest, lagMap: {} });
    const trapsLag = gradeSplit({ split: fixtures.laggingUpperChest, lagMap: { traps: "lagging" } });
    const twoLag = gradeSplit({
      split: fixtures.laggingUpperChest,
      lagMap: { lats: "lagging", chest_upper: "lagging" },
    });

    expect(trapsLag.growth.score).toBeLessThan(neutral.growth.score);
    expect(neutral.growth.score - trapsLag.growth.score).toBeLessThan(1.5);
    expect(twoLag.growth.score).toBeLessThan(neutral.growth.score);
  });

  it("gives indirect work partial selection credit", () => {
    const grade = gradeSplit({ split: fixtures.laggingUpperChest, lagMap: { chest_upper: "lagging" } });
    const upper = grade.regions.find((row) => row.region === "chest_upper")!;
    expect(upper.hasPrimary).toBe(false);
    expect(upper.effectiveSets).toBeGreaterThan(0);
    expect(grade.growth.score).toBeGreaterThan(3);
  });

  it("reads progression per exercise, so rotating in a lighter lift isn't regression", () => {
    const sessions = (exerciseId: string, start: number, step: number, days: number[]) =>
      days.map((day, index) => ({
        date: `2026-09-${String(day).padStart(2, "0")}`,
        exerciseId,
        weightKg: start + index * step,
        reps: 8,
        type: "normal" as const,
      }));
    const history = [
      ...sessions("barbell_bench_press", 80, 2.5, [1, 4, 8, 11]),
      ...sessions("incline_dumbbell_press", 24, 2, [15, 18, 22, 25]),
    ];
    const split = fixtures.upperChestWithVolume;

    const grade = gradeSplit({ split, lagMap: {}, history });
    const regressing = gradeSplit({
      split,
      lagMap: {},
      history: history.map((set) => ({ ...set, weightKg: 200 - (set.weightKg ?? 0) })),
    });
    expect(grade.growth.score).toBeGreaterThan(regressing.growth.score);
  });

  it("reads progression from the recent block, not all-time history", () => {
    const set = (date: string, weightKg: number) => ({
      date,
      exerciseId: "barbell_bench_press",
      weightKg,
      reps: 8,
      type: "normal" as const,
    });
    // A year ago bench went 60 → 100 kg; the last 12 weeks it has slid back.
    const old = ["2025-06-01", "2025-07-01", "2025-08-01", "2025-09-01"].map((date, i) => set(date, 60 + i * 13));
    const recent = ["2026-09-01", "2026-09-15", "2026-10-01", "2026-10-15", "2026-11-01"].map((date, i) =>
      set(date, 100 - i * 4),
    );
    const history = [...old, ...recent];

    expect(recentHistory(history)).toHaveLength(recent.length);
    const split = fixtures.upperChestWithVolume;
    const allTime = gradeSplit({ split, lagMap: {}, history });
    const recentOnly = gradeSplit({ split, lagMap: {}, history: recent });
    expect(allTime.growth.parts.progression).toBe(recentOnly.growth.parts.progression);
    expect(allTime.growth.parts.progression).toBe(0);
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
