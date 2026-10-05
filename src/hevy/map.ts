import { registerExercises } from "@/scoring/catalog";
import type { ExerciseDef, HistorySet, PlannedSet, Split } from "@/scoring/types";
import { exerciseDefFromHevy } from "./stimulus";
import type { HevyExerciseTemplate, HevyRoutine, HevySet, HevyWorkout } from "./types";

function setType(raw: string | undefined): PlannedSet["type"] {
  if (raw === "warmup") return "warmup";
  if (raw === "failure") return "failure";
  if (raw === "dropset" || raw === "drop_set") return "dropset";
  return "normal";
}

function mapSets(sets: HevySet[] | undefined): PlannedSet[] {
  return (sets ?? []).map((set) => ({ type: setType(set.type) }));
}

export function routinesToSplit(
  routines: HevyRoutine[],
  templates: HevyExerciseTemplate[],
): { split: Split; unmatched: string[]; exercises: ExerciseDef[] } {
  const byId = new Map(templates.map((template) => [template.id, template]));
  const defs: ExerciseDef[] = [];
  const unmatched: string[] = [];

  const days = routines
    .filter((routine) => (routine.exercises ?? []).length > 0)
    .map((routine) => {
      const exercises = (routine.exercises ?? []).flatMap((exercise) => {
        const templateId = exercise.exercise_template_id;
        const title = exercise.title ?? "";
        if (!templateId) {
          unmatched.push(title || "untitled");
          return [];
        }
        const template = byId.get(templateId);
        defs.push(exerciseDefFromHevy(template, title || template?.title || templateId, templateId));
        return [
          {
            exerciseId: templateId,
            sets: mapSets(exercise.sets),
          },
        ];
      });
      return {
        id: routine.id,
        title: routine.title,
        exercises,
      };
    })
    .filter((day) => day.exercises.length > 0);

  registerExercises(defs);

  return {
    split: {
      title: "Hevy routines",
      cycleDays: 7,
      days,
    },
    unmatched: [...new Set(unmatched)],
    exercises: defs,
  };
}

export function workoutsToHistory(workouts: HevyWorkout[]): HistorySet[] {
  const history: HistorySet[] = [];
  for (const workout of workouts) {
    const date = (workout.start_time ?? workout.end_time ?? "").slice(0, 10);
    for (const exercise of workout.exercises ?? []) {
      const exerciseId = exercise.exercise_template_id;
      if (!exerciseId) continue;
      for (const set of exercise.sets ?? []) {
        history.push({
          date: date || "1970-01-01",
          exerciseId,
          weightKg: set.weight_kg ?? undefined,
          reps: set.reps ?? undefined,
          type: setType(set.type),
        });
      }
    }
  }
  return history;
}
