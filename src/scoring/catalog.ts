import type { ExerciseDef } from "./types";

const catalogList: ExerciseDef[] = [
  {
    id: "barbell_bench_press",
    name: "Barbell Bench Press",
    aliases: ["bench press"],
    fatigue: "high",
    stimulus: [
      { region: "chest_mid", weight: 1, role: "primary", plane: "flat_press" },
      { region: "chest_upper", weight: 0.3, role: "secondary", plane: "flat_press" },
      { region: "chest_lower", weight: 0.35, role: "secondary", plane: "flat_press" },
      { region: "delt_front", weight: 0.45, role: "secondary" },
      { region: "triceps", weight: 0.4, role: "secondary" },
    ],
  },
  {
    id: "incline_dumbbell_press",
    name: "Incline Dumbbell Press",
    aliases: ["incline bench press dumbbell", "incline db press"],
    fatigue: "high",
    stimulus: [
      { region: "chest_upper", weight: 1, role: "primary", plane: "incline_press" },
      { region: "chest_mid", weight: 0.4, role: "secondary", plane: "incline_press" },
      { region: "delt_front", weight: 0.5, role: "secondary" },
      { region: "triceps", weight: 0.3, role: "secondary" },
    ],
  },
  {
    id: "incline_barbell_press",
    name: "Incline Barbell Press",
    fatigue: "high",
    stimulus: [
      { region: "chest_upper", weight: 1, role: "primary", plane: "incline_press" },
      { region: "chest_mid", weight: 0.35, role: "secondary", plane: "incline_press" },
      { region: "delt_front", weight: 0.55, role: "secondary" },
      { region: "triceps", weight: 0.35, role: "secondary" },
    ],
  },
  {
    id: "cable_fly",
    name: "Cable Fly",
    fatigue: "low",
    stimulus: [
      { region: "chest_mid", weight: 1, role: "primary", plane: "fly" },
      { region: "chest_upper", weight: 0.25, role: "secondary", plane: "fly" },
      { region: "chest_lower", weight: 0.25, role: "secondary", plane: "fly" },
    ],
  },
  {
    id: "overhead_press",
    name: "Overhead Press",
    fatigue: "high",
    stimulus: [
      { region: "delt_front", weight: 1, role: "primary" },
      { region: "delt_side", weight: 0.35, role: "secondary" },
      { region: "triceps", weight: 0.4, role: "secondary" },
      { region: "traps", weight: 0.25, role: "secondary" },
    ],
  },
  {
    id: "lateral_raise",
    name: "Lateral Raise",
    fatigue: "low",
    stimulus: [{ region: "delt_side", weight: 1, role: "primary" }],
  },
  {
    id: "rear_delt_fly",
    name: "Rear Delt Fly",
    fatigue: "low",
    stimulus: [
      { region: "delt_rear", weight: 1, role: "primary" },
      { region: "upper_back", weight: 0.25, role: "secondary" },
    ],
  },
  {
    id: "face_pull",
    name: "Face Pull",
    fatigue: "low",
    stimulus: [
      { region: "delt_rear", weight: 1, role: "primary" },
      { region: "upper_back", weight: 0.45, role: "secondary" },
    ],
  },
  {
    id: "tricep_pushdown",
    name: "Tricep Pushdown",
    fatigue: "low",
    stimulus: [{ region: "triceps", weight: 1, role: "primary" }],
  },
  {
    id: "overhead_tricep_extension",
    name: "Overhead Tricep Extension",
    fatigue: "moderate",
    stimulus: [{ region: "triceps", weight: 1, role: "primary" }],
  },
  {
    id: "lat_pulldown",
    name: "Lat Pulldown",
    fatigue: "moderate",
    stimulus: [
      { region: "lats", weight: 1, role: "primary" },
      { region: "biceps", weight: 0.35, role: "secondary" },
      { region: "upper_back", weight: 0.25, role: "secondary" },
    ],
  },
  {
    id: "pull_up",
    name: "Pull Up",
    fatigue: "high",
    stimulus: [
      { region: "lats", weight: 1, role: "primary" },
      { region: "biceps", weight: 0.4, role: "secondary" },
      { region: "upper_back", weight: 0.3, role: "secondary" },
    ],
  },
  {
    id: "barbell_row",
    name: "Barbell Row",
    fatigue: "high",
    stimulus: [
      { region: "upper_back", weight: 1, role: "primary" },
      { region: "lats", weight: 0.5, role: "secondary" },
      { region: "erectors", weight: 0.35, role: "secondary" },
      { region: "biceps", weight: 0.3, role: "secondary" },
    ],
  },
  {
    id: "seated_cable_row",
    name: "Seated Cable Row",
    fatigue: "moderate",
    stimulus: [
      { region: "upper_back", weight: 1, role: "primary" },
      { region: "lats", weight: 0.45, role: "secondary" },
      { region: "biceps", weight: 0.3, role: "secondary" },
    ],
  },
  {
    id: "dumbbell_shrug",
    name: "Dumbbell Shrug",
    aliases: ["shrug", "db shrug"],
    fatigue: "low",
    stimulus: [
      { region: "traps", weight: 1, role: "primary" },
      { region: "forearms", weight: 0.25, role: "secondary" },
    ],
  },
  {
    id: "barbell_shrug",
    name: "Barbell Shrug",
    fatigue: "moderate",
    stimulus: [
      { region: "traps", weight: 1, role: "primary" },
      { region: "forearms", weight: 0.3, role: "secondary" },
    ],
  },
  {
    id: "incline_dumbbell_curl",
    name: "Incline Dumbbell Curl",
    aliases: ["incline bicep curl"],
    fatigue: "low",
    stimulus: [
      { region: "biceps", weight: 1, role: "primary", plane: "supinated_curl" },
    ],
  },
  {
    id: "preacher_curl",
    name: "Preacher Curl",
    fatigue: "low",
    stimulus: [
      { region: "biceps", weight: 1, role: "primary", plane: "supinated_curl" },
    ],
  },
  {
    id: "barbell_curl",
    name: "Barbell Curl",
    fatigue: "moderate",
    stimulus: [
      { region: "biceps", weight: 1, role: "primary", plane: "supinated_curl" },
    ],
  },
  {
    id: "hammer_curl",
    name: "Hammer Curl",
    fatigue: "low",
    stimulus: [
      { region: "brachialis", weight: 1, role: "primary", plane: "neutral_curl" },
      { region: "biceps", weight: 0.4, role: "secondary", plane: "neutral_curl" },
      { region: "forearms", weight: 0.5, role: "secondary" },
    ],
  },
  {
    id: "squat",
    name: "Barbell Squat",
    fatigue: "high",
    stimulus: [
      { region: "quads", weight: 1, role: "primary" },
      { region: "glutes", weight: 0.5, role: "secondary" },
      { region: "erectors", weight: 0.3, role: "secondary" },
    ],
  },
  {
    id: "leg_press",
    name: "Leg Press",
    fatigue: "moderate",
    stimulus: [
      { region: "quads", weight: 1, role: "primary" },
      { region: "glutes", weight: 0.4, role: "secondary" },
    ],
  },
  {
    id: "rdl",
    name: "Romanian Deadlift",
    fatigue: "high",
    stimulus: [
      { region: "hamstrings", weight: 1, role: "primary" },
      { region: "glutes", weight: 0.6, role: "secondary" },
      { region: "erectors", weight: 0.5, role: "secondary" },
    ],
  },
  {
    id: "lying_leg_curl",
    name: "Lying Leg Curl",
    fatigue: "low",
    stimulus: [{ region: "hamstrings", weight: 1, role: "primary" }],
  },
  {
    id: "hip_thrust",
    name: "Hip Thrust",
    fatigue: "moderate",
    stimulus: [
      { region: "glutes", weight: 1, role: "primary" },
      { region: "hamstrings", weight: 0.25, role: "secondary" },
    ],
  },
  {
    id: "calf_raise",
    name: "Standing Calf Raise",
    fatigue: "low",
    stimulus: [{ region: "calves", weight: 1, role: "primary" }],
  },
  {
    id: "plank",
    name: "Plank",
    fatigue: "low",
    stimulus: [{ region: "abs", weight: 1, role: "primary" }],
  },
];

export const EXERCISE_CATALOG: Record<string, ExerciseDef> = Object.fromEntries(
  catalogList.map((exercise) => [exercise.id, exercise]),
);

const runtimeCatalog = new Map<string, ExerciseDef>();

export function resetRuntimeCatalog() {
  runtimeCatalog.clear();
}

export function registerExercises(defs: ExerciseDef[]) {
  for (const def of defs) runtimeCatalog.set(def.id, def);
}

export function getExercise(id: string): ExerciseDef {
  const exercise = EXERCISE_CATALOG[id] ?? runtimeCatalog.get(id);
  if (!exercise) {
    throw new Error(`Unknown exercise id: ${id}`);
  }
  return exercise;
}

export function tryGetExercise(id: string): ExerciseDef | undefined {
  return EXERCISE_CATALOG[id] ?? runtimeCatalog.get(id);
}

export function catalogEntries(): ExerciseDef[] {
  return catalogList;
}
