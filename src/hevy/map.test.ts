import { describe, expect, it } from "vitest";
import { resetRuntimeCatalog } from "@/scoring/catalog";
import { gradeSplit } from "@/scoring/score";
import { routinesToSplit, workoutsToHistory } from "./map";

describe("Hevy account mapping", () => {
  it("turns routines into a split the grader can score", () => {
    resetRuntimeCatalog();
    const { split, exercises } = routinesToSplit(
      [
        {
          id: "arm-day",
          title: "Arm day",
          exercises: [
            {
              title: "Incline Bicep Curl (Dumbbell)",
              exercise_template_id: "CURL1",
              sets: [{ type: "normal" }, { type: "normal" }, { type: "normal" }],
            },
            {
              title: "Preacher Curl (Machine)",
              exercise_template_id: "CURL2",
              sets: [{ type: "normal" }, { type: "normal" }, { type: "normal" }],
            },
          ],
        },
      ],
      [
        { id: "CURL1", title: "Incline Bicep Curl (Dumbbell)", primary_muscle_group: "biceps" },
        { id: "CURL2", title: "Preacher Curl (Machine)", primary_muscle_group: "biceps" },
      ],
    );

    expect(exercises).toHaveLength(2);
    const grade = gradeSplit({ split, lagMap: { brachialis: "lagging" } });
    const brachialis = grade.regions.find((row) => row.region === "brachialis");
    expect(brachialis?.hasPrimary).toBe(false);
    expect(grade.findings.some((finding) => finding.suggestedChange?.includes("hammer"))).toBe(
      true,
    );
  });

  it("copies logged load into growth history", () => {
    const history = workoutsToHistory([
      {
        id: "w1",
        title: "Pull",
        start_time: "2026-09-01T18:00:00Z",
        exercises: [
          {
            exercise_template_id: "HAMMER1",
            sets: [{ type: "normal", weight_kg: 16, reps: 10 }],
          },
        ],
      },
    ]);
    expect(history[0]).toMatchObject({
      date: "2026-09-01",
      exerciseId: "HAMMER1",
      weightKg: 16,
      reps: 10,
    });
  });
});
