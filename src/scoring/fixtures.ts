import type { PlannedSet, Split } from "./types";

function sets(count: number, type: PlannedSet["type"] = "normal"): PlannedSet[] {
  return Array.from({ length: count }, () => ({ type }));
}

function pplBase(pullExtras: { exerciseId: string; setCount: number }[]): Split {
  return {
    title: "PPL",
    cycleDays: 7,
    days: [
      {
        id: "push-1",
        title: "Push 1",
        weekday: 1,
        exercises: [
          { exerciseId: "barbell_bench_press", sets: sets(4) },
          { exerciseId: "incline_dumbbell_press", sets: sets(3) },
          { exerciseId: "overhead_press", sets: sets(3) },
          { exerciseId: "lateral_raise", sets: sets(3) },
          { exerciseId: "tricep_pushdown", sets: sets(3) },
        ],
      },
      {
        id: "pull-1",
        title: "Pull 1",
        weekday: 2,
        exercises: [
          { exerciseId: "lat_pulldown", sets: sets(4) },
          { exerciseId: "barbell_row", sets: sets(4) },
          { exerciseId: "face_pull", sets: sets(3) },
          ...pullExtras.map((item) => ({
            exerciseId: item.exerciseId,
            sets: sets(item.setCount),
          })),
        ],
      },
      {
        id: "legs-1",
        title: "Legs 1",
        weekday: 3,
        exercises: [
          { exerciseId: "squat", sets: sets(4) },
          { exerciseId: "rdl", sets: sets(3) },
          { exerciseId: "leg_press", sets: sets(3) },
          { exerciseId: "calf_raise", sets: sets(4) },
        ],
      },
      {
        id: "push-2",
        title: "Push 2",
        weekday: 5,
        exercises: [
          { exerciseId: "barbell_bench_press", sets: sets(3) },
          { exerciseId: "incline_dumbbell_press", sets: sets(3) },
          { exerciseId: "lateral_raise", sets: sets(4) },
          { exerciseId: "overhead_tricep_extension", sets: sets(3) },
        ],
      },
      {
        id: "pull-2",
        title: "Pull 2",
        weekday: 6,
        exercises: [
          { exerciseId: "pull_up", sets: sets(3) },
          { exerciseId: "seated_cable_row", sets: sets(4) },
          { exerciseId: "rear_delt_fly", sets: sets(3) },
          ...pullExtras.map((item) => ({
            exerciseId: item.exerciseId,
            sets: sets(Math.max(2, item.setCount - 1)),
          })),
        ],
      },
      {
        id: "legs-2",
        title: "Legs 2",
        weekday: 0,
        exercises: [
          { exerciseId: "squat", sets: sets(3) },
          { exerciseId: "lying_leg_curl", sets: sets(3) },
          { exerciseId: "hip_thrust", sets: sets(3) },
          { exerciseId: "calf_raise", sets: sets(3) },
        ],
      },
    ],
  };
}

export const fixtures = {
  armsSmallFromFront: pplBase([
    { exerciseId: "incline_dumbbell_curl", setCount: 3 },
    { exerciseId: "preacher_curl", setCount: 3 },
  ]),
  armsWithHammers: pplBase([
    { exerciseId: "incline_dumbbell_curl", setCount: 3 },
    { exerciseId: "preacher_curl", setCount: 3 },
    { exerciseId: "hammer_curl", setCount: 3 },
  ]),
  laggingUpperChest: {
    ...pplBase([]),
    title: "PPL — flat-heavy chest",
    days: pplBase([]).days.map((day) => {
      if (day.id === "push-1") {
        return {
          ...day,
          exercises: [
            { exerciseId: "barbell_bench_press", sets: sets(5) },
            { exerciseId: "cable_fly", sets: sets(4) },
            { exerciseId: "overhead_press", sets: sets(3) },
            { exerciseId: "lateral_raise", sets: sets(3) },
            { exerciseId: "tricep_pushdown", sets: sets(3) },
          ],
        };
      }
      if (day.id === "push-2") {
        return {
          ...day,
          exercises: [
            { exerciseId: "barbell_bench_press", sets: sets(4) },
            { exerciseId: "cable_fly", sets: sets(3) },
            { exerciseId: "lateral_raise", sets: sets(4) },
            { exerciseId: "overhead_tricep_extension", sets: sets(3) },
          ],
        };
      }
      return day;
    }),
  } satisfies Split,
  upperChestWithVolume: pplBase([
    { exerciseId: "incline_dumbbell_curl", setCount: 3 },
  ]),
};
