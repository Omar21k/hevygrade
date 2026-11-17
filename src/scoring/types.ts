import type { RegionId, RegionPriority } from "./regions";

export type SetType = "warmup" | "normal" | "failure" | "dropset";

export type StimulusRole = "primary" | "secondary";

export type ExerciseStimulus = {
  region: RegionId;
  /** 1.0 = a hard primary set, 0.4-ish = meaningful secondary. */
  weight: number;
  role: StimulusRole;
  /** Same-plane work is redundant if a lagging sibling region is empty. */
  plane?: string;
};

export type ExerciseDef = {
  id: string;
  name: string;
  aliases?: string[];
  fatigue: "low" | "moderate" | "high";
  stimulus: ExerciseStimulus[];
};

export type PlannedSet = {
  type: SetType;
};

export type PlannedExercise = {
  exerciseId: string;
  sets: PlannedSet[];
};

export type RoutineDay = {
  id: string;
  title: string;
  /** 0 = Sunday … 6 = Saturday. Optional; used for consecutive-day recovery. */
  weekday?: number;
  /**
   * Sessions of this day per week. Defaults to 1 (a routine done weekly).
   * From logs it's how often you do it; 0 means it's in your routines but you
   * haven't logged it lately.
   */
  perWeek?: number;
  exercises: PlannedExercise[];
};

/** Two days logged on consecutive calendar dates, and how often that happens. */
export type BackToBack = { fromDayId: string; toDayId: string; perWeek: number };

export type Split = {
  title: string;
  /** Microcycle length. Volume is summed over `days` and treated as one cycle. */
  cycleDays: number;
  days: RoutineDay[];
  /** "logged": built from recent workouts. "routines": your saved routines, as if done weekly. */
  source?: "logged" | "routines";
  /** Weeks of logs the split averages over (logged only). */
  weeks?: number;
  /** Calendar back-to-back days (logged only). Without it, routine order is used. */
  backToBack?: BackToBack[];
};

export type LagMap = Partial<Record<RegionId, RegionPriority>>;

export type HistorySet = {
  date: string;
  exerciseId: string;
  weightKg?: number;
  reps?: number;
  type: SetType;
  /** Missing on sessions imported before workouts were tracked. */
  workoutId?: string;
};

/** One logged Hevy workout. */
export type LoggedSession = {
  id: string;
  date: string;
  title: string;
  routineId?: string;
};

export type ScoreInput = {
  split: Split;
  lagMap: LagMap;
  history?: HistorySet[];
  /**
   * Physique balance from photos, 0–10. When present it's 60% of coverage and
   * training is the other 40%. Plan changes only move the training part.
   */
  photoBalance?: number;
  experience?: "beginner" | "intermediate" | "advanced";
};

export type FindingSeverity = "info" | "warn" | "blocker";

export type Finding = {
  id: string;
  metric: "coverage" | "growth" | "recovery";
  severity: FindingSeverity;
  region?: RegionId;
  title: string;
  detail: string;
  suggestedChange?: string;
};

export type RegionBreakdown = {
  region: RegionId;
  label: string;
  priority?: RegionPriority;
  effectiveSets: number;
  primarySets: number;
  targetLow: number;
  targetHigh: number;
  mrv: number;
  frequency: number;
  coverageScore: number;
  hasPrimary: boolean;
};

export type MetricScore = {
  score: number;
  notes: string[];
};

/** Growth components. Max: volume 4, frequency 2, selection 2, progression 2 (null without history). */
export type GrowthParts = {
  volume: number;
  frequency: number;
  selection: number;
  progression: number | null;
};

/** Coverage parts. `photos` is null without a photo read; then training is all of it. */
export type CoverageParts = { photos: number | null; training: number };

export type Grade = {
  coverage: MetricScore & { parts: CoverageParts };
  growth: MetricScore & { parts: GrowthParts };
  recovery: MetricScore;
  overall: number;
  regions: RegionBreakdown[];
  findings: Finding[];
  flags: {
    usedHistory: boolean;
    growthCappedWithoutHistory: boolean;
  };
};
