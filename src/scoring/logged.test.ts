import { describe, expect, it } from "vitest";
import { loggedSplit } from "./logged";
import { gradeSplit } from "./score";
import { buildPlan, resumeSuggestions } from "./suggest";
import type { HistorySet, LoggedSession, PlannedSet, Split } from "./types";

function sets(count: number): PlannedSet[] {
  return Array.from({ length: count }, () => ({ type: "normal" as const }));
}

const routines: Split = {
  title: "Hevy routines",
  cycleDays: 7,
  days: [
    {
      id: "push",
      title: "Push",
      exercises: [
        { exerciseId: "barbell_bench_press", sets: sets(4) },
        { exerciseId: "incline_dumbbell_press", sets: sets(3) },
        { exerciseId: "lateral_raise", sets: sets(3) },
      ],
    },
    {
      id: "pull",
      title: "Pull",
      exercises: [
        { exerciseId: "barbell_row", sets: sets(4) },
        { exerciseId: "face_pull", sets: sets(3) },
      ],
    },
    {
      id: "legs",
      title: "Legs",
      exercises: [
        { exerciseId: "squat", sets: sets(4) },
        { exerciseId: "rdl", sets: sets(3) },
      ],
    },
    {
      id: "aesthetic",
      title: "Saturday Aesthetic",
      exercises: [
        { exerciseId: "incline_barbell_press", sets: sets(4) },
        { exerciseId: "cable_fly", sets: sets(3) },
        { exerciseId: "lat_pulldown", sets: sets(4) },
      ],
    },
  ],
};

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

type Log = { sets: HistorySet[]; session: LoggedSession };

/** Logs a routine as saved, on a date. */
function log(dayId: string, date: string, withIds = true): Log {
  const day = routines.days.find((item) => item.id === dayId)!;
  const id = `${dayId}-${date}`;
  return {
    session: { id, date, title: day.title, routineId: day.id },
    sets: day.exercises.flatMap((item) =>
      item.sets.map(() => ({
        date,
        exerciseId: item.exerciseId,
        weightKg: 60,
        reps: 8,
        type: "normal" as const,
        ...(withIds ? { workoutId: id } : {}),
      })),
    ),
  };
}

const MONDAY = "2026-09-21";

/** Eight weeks of Push Mon, Pull Tue, Legs Wed, Push Fri. Saturday Aesthetic never logged. */
function eightWeeks(withIds = true, extra: Log[] = []) {
  const logs = Array.from({ length: 8 }, (_, week) => {
    const start = addDays(MONDAY, week * 7);
    return [
      log("push", start, withIds),
      log("pull", addDays(start, 1), withIds),
      log("legs", addDays(start, 2), withIds),
      log("push", addDays(start, 4), withIds),
    ];
  })
    .flat()
    .concat(extra);
  return { history: logs.flatMap((item) => item.sets), sessions: logs.map((item) => item.session) };
}

describe("loggedSplit", () => {
  const { history, sessions } = eightWeeks();
  const split = loggedSplit(routines, history, sessions);
  const day = (id: string) => split.days.find((item) => item.id === id)!;

  it("counts each routine as often as you actually do it", () => {
    expect(split.source).toBe("logged");
    expect(split.weeks).toBe(6);
    expect(day("push").perWeek).toBeCloseTo(2, 1);
    expect(day("pull").perWeek).toBeCloseTo(1, 1);
  });

  it("gives a routine you haven't done in four weeks no volume", () => {
    expect(day("aesthetic").perWeek).toBe(0);
    const grade = gradeSplit({ split, lagMap: {}, history });
    const asSaved = gradeSplit({ split: routines, lagMap: {}, history });
    const lats = (g: typeof grade) => g.regions.find((row) => row.region === "lats")!.effectiveSets;
    expect(lats(grade)).toBeLessThan(lats(asSaved));
  });

  it("counts a routine done once recently as part of every week", () => {
    const lastWeek = addDays(MONDAY, 7 * 7 + 5);
    const recent = eightWeeks(true, [log("aesthetic", lastWeek)]);
    const withIt = loggedSplit(routines, recent.history, recent.sessions);
    expect(withIt.days.find((item) => item.id === "aesthetic")?.perWeek).toBe(1);
  });

  it("drops a routine last done more than four weeks ago", () => {
    const fiveWeeksBack = addDays(MONDAY, 7 * 2 + 5);
    const old = eightWeeks(true, [log("aesthetic", fiveWeeksBack)]);
    const withOld = loggedSplit(routines, old.history, old.sessions);
    expect(withOld.days.find((item) => item.id === "aesthetic")?.perWeek).toBe(0);
  });

  it("counts a day done twice a week twice", () => {
    const grade = gradeSplit({ split, lagMap: {}, history });
    const delts = grade.regions.find((row) => row.region === "delt_side")!;
    expect(delts.effectiveSets).toBeGreaterThanOrEqual(6);
    expect(delts.frequency).toBeCloseTo(2, 1);
  });

  it("reads back-to-back days from the calendar", () => {
    const pair = split.backToBack?.find((item) => item.fromDayId === "push" && item.toDayId === "pull");
    expect(pair?.perWeek).toBeCloseTo(1, 1);
    expect(split.backToBack?.some((item) => item.fromDayId === "legs" && item.toDayId === "push")).toBe(false);
  });

  it("plans only changes to days you train, and offers the skipped routine separately", () => {
    const input = { split, lagMap: { chest_upper: "lagging" as const, lats: "lagging" as const }, history };
    const plan = buildPlan(input);
    expect(plan.steps.length).toBeGreaterThan(0);
    expect(plan.steps.every((step) => step.kind !== "resume" && step.dayTitle !== "Saturday Aesthetic")).toBe(true);
    const resume = resumeSuggestions(input)[0];
    expect(resume?.dayTitle).toBe("Saturday Aesthetic");
    expect(resume?.reason).toMatch(/haven't logged Saturday Aesthetic in the last 4 weeks/);
    expect(resume?.reason).toMatch(/Lat Pulldown/);
  });

  it("matches older imports without workout ids by their exercises", () => {
    const old = eightWeeks(false);
    const fromOld = loggedSplit(routines, old.history);
    expect(fromOld.days.find((item) => item.id === "push")?.perWeek).toBeCloseTo(2, 1);
    expect(fromOld.days.find((item) => item.id === "aesthetic")?.perWeek).toBe(0);
  });

  it("falls back to routines when nothing is logged", () => {
    expect(loggedSplit(routines, []).source).toBe("routines");
  });
});
