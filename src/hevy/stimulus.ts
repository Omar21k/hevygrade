import { catalogEntries } from "@/scoring/catalog";
import { nameSimilarity, normalizeExerciseName } from "@/scoring/matchName";
import type { ExerciseDef, ExerciseStimulus } from "@/scoring/types";
import type { RegionId } from "@/scoring/regions";
import type { HevyExerciseTemplate } from "./types";

const MUSCLE_TO_REGION: Record<string, RegionId> = {
  chest: "chest_mid",
  pectorals: "chest_mid",
  lats: "lats",
  upper_back: "upper_back",
  traps: "traps",
  trapezius: "traps",
  lower_back: "erectors",
  abdominals: "abs",
  abs: "abs",
  shoulders: "delt_front",
  biceps: "biceps",
  triceps: "triceps",
  forearms: "forearms",
  quadriceps: "quads",
  quads: "quads",
  hamstrings: "hamstrings",
  glutes: "glutes",
  calves: "calves",
  abductors: "glutes",
  adductors: "quads",
  neck: "traps",
};

function titleFlags(title: string) {
  const n = normalizeExerciseName(title);
  return {
    n,
    incline: /\bincline\b/.test(n),
    decline: /\bdecline\b/.test(n),
    hammer: /\bhammer\b/.test(n) || /\bneutral\b/.test(n),
    preacher: /\bpreacher\b/.test(n),
    lateral: /\blateral\b/.test(n) || /\bside raise\b/.test(n),
    rear: /\brear\b/.test(n) || /\bface pull\b/.test(n) || /\breverse fly\b/.test(n),
    frontRaise: /\bfront raise\b/.test(n),
    overhead: /\boverhead\b/.test(n) || /\bshoulder press\b/.test(n) || /\bohp\b/.test(n),
    fly: /\bfly\b/.test(n) || /\bflye\b/.test(n),
    curl: /\bcurl\b/.test(n),
    row: /\brow\b/.test(n),
    pulldown: /\bpull ?down\b/.test(n) || /\bpull ?up\b/.test(n) || /\bchin ?up\b/.test(n),
  };
}

export function matchCatalogExercise(title: string): ExerciseDef | undefined {
  const needle = normalizeExerciseName(title);
  let best: { def: ExerciseDef; score: number } | undefined;
  for (const def of catalogEntries()) {
    const names = [def.name, ...(def.aliases ?? [])];
    for (const name of names) {
      if (normalizeExerciseName(name) === needle) return def;
      const score = nameSimilarity(name, title);
      if (score >= 0.72 && (!best || score > best.score)) {
        best = { def, score };
      }
    }
  }
  return best?.def;
}

function stim(
  region: RegionId,
  weight: number,
  role: ExerciseStimulus["role"],
  plane?: string,
): ExerciseStimulus {
  return plane ? { region, weight, role, plane } : { region, weight, role };
}

function fromMuscleGroups(
  title: string,
  primary: string | undefined,
  secondary: string[] | undefined,
): ExerciseStimulus[] {
  const flags = titleFlags(title);
  const primaryKey = (primary ?? "").toLowerCase();
  const result: ExerciseStimulus[] = [];
  const chestMovement =
    primaryKey === "chest" ||
    /\b(bench|chest|pec|fly|flye)\b/.test(flags.n) ||
    (flags.fly && !flags.curl);

  if (chestMovement) {
    if (flags.incline) {
      result.push(
        stim("chest_upper", 1, "primary", "incline_press"),
        stim("chest_mid", 0.35, "secondary", "incline_press"),
        stim("delt_front", 0.5, "secondary"),
        stim("triceps", flags.fly ? 0.15 : 0.3, "secondary"),
      );
    } else if (flags.decline) {
      result.push(
        stim("chest_lower", 1, "primary", "decline_press"),
        stim("chest_mid", 0.4, "secondary"),
        stim("triceps", 0.3, "secondary"),
      );
    } else if (primaryKey === "chest") {
      result.push(
        stim("chest_mid", 1, "primary", flags.fly ? "fly" : "flat_press"),
        stim("chest_upper", 0.3, "secondary"),
        stim("chest_lower", 0.3, "secondary"),
        stim("delt_front", flags.fly ? 0.15 : 0.45, "secondary"),
        stim("triceps", flags.fly ? 0.1 : 0.4, "secondary"),
      );
    }
  }

  if (flags.hammer && flags.curl) {
    result.push(
      stim("brachialis", 1, "primary", "neutral_curl"),
      stim("biceps", 0.4, "secondary", "neutral_curl"),
      stim("forearms", 0.5, "secondary"),
    );
  } else if (primaryKey === "biceps" || flags.curl) {
    result.push(stim("biceps", 1, "primary", "supinated_curl"));
  }

  if (flags.lateral) result.push(stim("delt_side", 1, "primary"));
  else if (flags.rear) result.push(stim("delt_rear", 1, "primary"), stim("upper_back", 0.3, "secondary"));
  else if (flags.frontRaise) result.push(stim("delt_front", 1, "primary"));
  else if (flags.overhead || primaryKey === "shoulders") {
    result.push(
      stim("delt_front", 1, "primary"),
      stim("delt_side", 0.35, "secondary"),
      stim("triceps", 0.4, "secondary"),
    );
  }

  if (flags.pulldown || primaryKey === "lats") {
    result.push(
      stim("lats", 1, "primary"),
      stim("biceps", 0.35, "secondary"),
      stim("upper_back", 0.25, "secondary"),
    );
  }
  if (flags.row || primaryKey === "upper_back") {
    result.push(
      stim("upper_back", 1, "primary"),
      stim("lats", 0.45, "secondary"),
      stim("biceps", 0.3, "secondary"),
    );
  }

  if (result.length === 0) {
    const region = MUSCLE_TO_REGION[primaryKey];
    if (region) result.push(stim(region, 1, "primary"));
  }

  for (const group of secondary ?? []) {
    const region = MUSCLE_TO_REGION[group.toLowerCase()];
    if (region && !result.some((row) => row.region === region)) {
      result.push(stim(region, 0.35, "secondary"));
    }
  }

  return result;
}

function fatigueFor(title: string, primary?: string): ExerciseDef["fatigue"] {
  const n = normalizeExerciseName(title);
  if (/\b(squat|deadlift|bench press|row|pull up|overhead press)\b/.test(n)) return "high";
  if (["quadriceps", "hamstrings", "chest", "lats", "glutes"].includes((primary ?? "").toLowerCase())) {
    return "moderate";
  }
  return "low";
}

export function exerciseDefFromHevy(
  template: HevyExerciseTemplate | undefined,
  title: string,
  templateId: string,
): ExerciseDef {
  const catalog = matchCatalogExercise(title || template?.title || "");
  if (catalog) {
    return { ...catalog, id: templateId, name: title || catalog.name };
  }
  const stimulus = fromMuscleGroups(
    title || template?.title || "",
    template?.primary_muscle_group,
    template?.secondary_muscle_groups,
  );
  return {
    id: templateId,
    name: title || template?.title || templateId,
    fatigue: fatigueFor(title || template?.title || "", template?.primary_muscle_group),
    stimulus:
      stimulus.length > 0
        ? stimulus
        : [stim("upper_back", 0.2, "secondary")],
  };
}
