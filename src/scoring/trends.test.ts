import { describe, expect, it } from "vitest";
import { gradeSplit } from "./score";
import { describeTrend, exerciseTrend } from "./trends";
import type { HistorySet, PlannedSet, Split } from "./types";

function sets(count: number): PlannedSet[] {
  return Array.from({ length: count }, () => ({ type: "normal" as const }));
}

function sessions(exerciseId: string, loads: number[], reps = 10): HistorySet[] {
  return loads.flatMap((weightKg, index) => {
    const date = new Date(Date.UTC(2026, 8, 1 + index * 7)).toISOString().slice(0, 10);
    return [0, 1, 2].map(() => ({ date, exerciseId, weightKg, reps, type: "normal" as const }));
  });
}

describe("exerciseTrend", () => {
  it("reads a lift going up", () => {
    const trend = exerciseTrend(sessions("lat_pulldown", [50, 52.5, 55, 57.5, 60, 62.5]), "lat_pulldown")!;
    expect(trend.direction).toBe("up");
    expect(trend.reps).toBe("10");
    expect(describeTrend("Lat Pulldown", trend)).toMatch(/up \d+% since Sep 1, best 62.5 kg × 10/);
  });

  it("calls out a stall", () => {
    const trend = exerciseTrend(sessions("lat_pulldown", [60, 60, 60, 60, 60, 60]), "lat_pulldown")!;
    expect(trend.direction).toBe("flat");
    expect(describeTrend("Lat Pulldown", trend)).toBe("Lat Pulldown: stuck around 60 kg × 10 for 5 sessions.");
  });
});

describe("recovery overreach", () => {
  // Way past the biceps range: curls on three days a week.
  const split: Split = {
    title: "Arms heavy",
    cycleDays: 7,
    days: ["a", "b", "c"].map((id) => ({
      id,
      title: `Day ${id}`,
      exercises: [
        { exerciseId: "barbell_curl", sets: sets(5) },
        { exerciseId: "incline_dumbbell_curl", sets: sets(4) },
      ],
    })),
  };

  it("flags a muscle trained past its range while its lifts go backwards", () => {
    const falling = [
      ...sessions("barbell_curl", [40, 40, 38, 37.5, 36, 35]),
      ...sessions("incline_dumbbell_curl", [14, 14, 13, 12, 12, 11]),
    ];
    const grade = gradeSplit({ split, lagMap: {}, history: falling });
    const finding = grade.findings.find((item) => item.id === "recovery-overreach-biceps");
    expect(finding?.detail).toMatch(/is down \d+% since/);
    const rising = [
      ...sessions("barbell_curl", [35, 36, 37.5, 38, 40, 41]),
      ...sessions("incline_dumbbell_curl", [11, 12, 12, 13, 14, 14]),
    ];
    const steady = gradeSplit({ split, lagMap: {}, history: rising });
    expect(steady.findings.some((item) => item.id === "recovery-overreach-biceps")).toBe(false);
    expect(grade.recovery.score).toBeLessThan(steady.recovery.score);
  });
});

describe("coverage", () => {
  it("is 60% photos and 40% training when there's a photo read", () => {
    const split: Split = { title: "x", cycleDays: 7, days: [{ id: "a", title: "A", exercises: [{ exerciseId: "lat_pulldown", sets: sets(4) }] }] };
    const training = gradeSplit({ split, lagMap: {} }).coverage.score;
    const blended = gradeSplit({ split, lagMap: {}, photoBalance: 8 });
    expect(blended.coverage.parts).toEqual({ photos: 8, training });
    expect(blended.coverage.score).toBeCloseTo(0.6 * 8 + 0.4 * training, 1);
  });
});
