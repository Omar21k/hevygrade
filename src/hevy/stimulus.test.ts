import { describe, expect, it } from "vitest";
import { exerciseDefFromHevy, matchCatalogExercise } from "./stimulus";

describe("Hevy exercise mapping", () => {
  it("maps hammer curls to brachialis even when Hevy tags them as biceps", () => {
    const def = exerciseDefFromHevy(
      {
        id: "HAMMER1",
        title: "Hammer Curl (Dumbbell)",
        primary_muscle_group: "biceps",
        secondary_muscle_groups: ["forearms"],
      },
      "Hammer Curl (Dumbbell)",
      "HAMMER1",
    );
    expect(def.stimulus.some((row) => row.region === "brachialis" && row.role === "primary")).toBe(
      true,
    );
  });

  it("maps incline bench to upper chest, not generic chest", () => {
    const def = exerciseDefFromHevy(
      {
        id: "INC1",
        title: "Incline Bench Press (Dumbbell)",
        primary_muscle_group: "chest",
      },
      "Incline Bench Press (Dumbbell)",
      "INC1",
    );
    expect(def.stimulus.some((row) => row.region === "chest_upper" && row.role === "primary")).toBe(
      true,
    );
  });

  it("reuses catalog stimulus when the Hevy title matches a known lift", () => {
    const matched = matchCatalogExercise("Bench Press (Barbell)");
    expect(matched?.id).toBe("barbell_bench_press");
  });
});
