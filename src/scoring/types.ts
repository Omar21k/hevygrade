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
  exercises: PlannedExercise[];
};

export type Split = {
  title: string;
  /** Microcycle length. Volume is summed over `days` and treated as one cycle. */
  cycleDays: number;
  days: RoutineDay[];
};

export type LagMap = Partial<Record<RegionId, RegionPriority>>;

export type HistorySet = {
  date: string;
  exerciseId: string;
  weightKg?: number;
  reps?: number;
  type: SetType;
};

export type ScoreInput = {
  split: Split;
  lagMap: LagMap;
  history?: HistorySet[];
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

export type Grade = {
  coverage: MetricScore;
  growth: MetricScore;
  recovery: MetricScore;
  overall: number;
  regions: RegionBreakdown[];
  findings: Finding[];
  flags: {
    usedHistory: boolean;
    growthCappedWithoutHistory: boolean;
  };
};
