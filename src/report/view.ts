import type { HevyPayload } from "@/hevy/session";
import {
  applyChanges,
  gradeSplit,
  REGION_META,
  regionVerb,
  snapshot,
  tryGetExercise,
  type ExerciseSlot,
  type Grade,
  type LagMap,
  type Plan,
  type PlannedChange,
  type RegionBreakdown,
  type RegionId,
  type RegionPriority,
  type ScoreSnapshot,
  type Split,
  type Suggestion,
  type SuggestionKind,
} from "@/scoring";
import type { PhysiqueResult } from "./state";

export const METRICS = ["coverage", "growth", "recovery"] as const;
export type Metric = (typeof METRICS)[number];

export const METRIC_LABEL: Record<Metric, string> = {
  coverage: "Coverage",
  growth: "Growth",
  recovery: "Recovery",
};

export const METRIC_PROMPT: Record<Metric, string> = {
  coverage: "Is your split covering your priorities?",
  growth: "Does your recorded training support progression?",
  recovery: "How balanced is your recorded training load?",
};

/** Only the last 80 workouts are imported (10 per page × 8 pages in the Hevy client). */
export const MAX_IMPORTED_WORKOUTS = 80;

// ---------------------------------------------------------------------------
// Score status

export type Tone = "good" | "warn";

export function scoreTone(score: number): Tone {
  return score >= 8 ? "good" : "warn";
}

export function scoreStatus(score: number): string {
  if (score >= 8) return "Strong";
  if (score >= 6.5) return "Solid";
  if (score >= 5) return "Room to improve";
  return "Needs attention";
}

// ---------------------------------------------------------------------------
// Regions

export type RegionStatus = "below-target" | "on-track" | "above-target" | "insufficient-data";

export const STATUS_LABEL: Record<RegionStatus, string> = {
  "below-target": "Below target",
  "on-track": "On track",
  "above-target": "Above target",
  "insufficient-data": "Insufficient data",
};

export const BODY_AREAS = ["Chest", "Back", "Shoulders", "Arms", "Legs", "Core"] as const;
export type BodyArea = (typeof BODY_AREAS)[number];

const GROUP_AREA: Record<string, BodyArea> = {
  chest: "Chest",
  back: "Back",
  delts: "Shoulders",
  arm_flexors: "Arms",
  arms: "Arms",
  legs: "Legs",
  core: "Core",
};

export const GOAL_LABEL: Record<RegionPriority, string> = {
  lagging: "Prioritize",
  maintain: "Maintain",
  overdeveloped: "Lower priority",
};

export type Goal = "auto" | RegionPriority;
export type GoalSource = "you" | "photos" | "default";

export type PhotoContext =
  | { kind: "no-photos" }
  | { kind: "not-visible" }
  | { kind: "unclear" }
  | { kind: "seen"; relation: "behind" | "in-line" | "ahead"; limited: boolean; note?: string };

export type Contribution = {
  name: string;
  days: string[];
  directSets: number;
  indirectSets: number;
};

export type RegionView = {
  id: RegionId;
  name: string;
  bodyArea: BodyArea;
  effectiveSets: number;
  targetMin: number;
  targetMax: number;
  trainingDays: number;
  status: RegionStatus;
  priority: RegionPriority;
  goalSource: GoalSource;
  photo: PhotoContext;
  contributions: Contribution[];
  /** effectiveSets / targetMin; lower is further below. */
  fill: number;
  recommendationIds: string[];
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function regionStatus(row: RegionBreakdown): RegionStatus {
  if (row.effectiveSets < row.targetLow) return "below-target";
  if (row.effectiveSets > row.targetHigh) return "above-target";
  return "on-track";
}

function photoContext(region: RegionId, physique: PhysiqueResult | null): PhotoContext {
  if (!physique || physique.status !== "graded" || !physique.assessment) return { kind: "no-photos" };
  const row = physique.assessment.developments.find((item) => item.region === region);
  if (!row) return { kind: "not-visible" };
  if (row.confidence < 0.45) return { kind: "unclear" };
  const tag = physique.lagMap[region];
  return {
    kind: "seen",
    relation: tag === "lagging" ? "behind" : tag === "overdeveloped" ? "ahead" : "in-line",
    limited: row.confidence < 0.7,
    note: row.note,
  };
}

export function photoContextLabel(photo: PhotoContext): string {
  if (photo.kind === "no-photos") return "No photos added";
  if (photo.kind === "not-visible") return "Not visible in your photos";
  if (photo.kind === "unclear") return "Too unclear in your photos to judge";
  const relation =
    photo.relation === "behind"
      ? "Looks behind the rest of your physique"
      : photo.relation === "ahead"
        ? "Looks ahead of the rest of your physique"
        : "In line with the rest of your physique";
  return photo.limited ? `${relation} (limited view)` : relation;
}

function contributionsFor(split: Split, region: RegionId): Contribution[] {
  const byName = new Map<string, Contribution>();
  for (const day of split.days) {
    for (const item of day.exercises) {
      const def = tryGetExercise(item.exerciseId);
      if (!def) continue;
      const stim = def.stimulus.find((entry) => entry.region === region);
      if (!stim) continue;
      const count = item.sets.filter((set) => set.type !== "warmup").length;
      if (count === 0) continue;
      const row = byName.get(def.name) ?? { name: def.name, days: [], directSets: 0, indirectSets: 0 };
      if (stim.role === "primary") row.directSets += count;
      else row.indirectSets += count * stim.weight;
      if (!row.days.includes(day.title)) row.days.push(day.title);
      byName.set(def.name, row);
    }
  }
  return [...byName.values()]
    .map((row) => ({ ...row, indirectSets: round1(row.indirectSets) }))
    .sort((a, b) => b.directSets + b.indirectSets - (a.directSets + a.indirectSets));
}

export function buildRegionViews(input: {
  grade: Grade;
  split: Split;
  physique: PhysiqueResult | null;
  overrides: LagMap;
  recommendations: Recommendation[];
}): RegionView[] {
  const { grade, split, physique, overrides, recommendations } = input;
  return grade.regions.map((row) => {
    const goalSource: GoalSource = overrides[row.region]
      ? "you"
      : physique?.lagMap[row.region]
        ? "photos"
        : "default";
    return {
      id: row.region,
      name: row.label,
      bodyArea: GROUP_AREA[REGION_META[row.region].group] ?? "Core",
      effectiveSets: row.effectiveSets,
      targetMin: row.targetLow,
      targetMax: row.targetHigh,
      trainingDays: row.frequency,
      status: regionStatus(row),
      priority: row.priority ?? "maintain",
      goalSource,
      photo: photoContext(row.region, physique),
      contributions: contributionsFor(split, row.region),
      fill: row.effectiveSets / Math.max(row.targetLow, 1),
      recommendationIds: recommendations.filter((rec) => rec.region === row.region).map((rec) => rec.id),
    };
  });
}

/** One shared axis so equal distances mean equal set counts across rows. */
export function volumeAxisMax(regions: RegionView[]): number {
  const peak = Math.max(10, ...regions.map((row) => Math.max(row.effectiveSets, row.targetMax)));
  return Math.ceil((peak + 1) / 5) * 5;
}

/** Below-target first (priorities, then furthest below), above-target last. */
export function compareRegions(a: RegionView, b: RegionView): number {
  const rank: Record<RegionStatus, number> = {
    "below-target": 0,
    "insufficient-data": 1,
    "on-track": 2,
    "above-target": 3,
  };
  if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
  if (a.status === "below-target") {
    const pa = a.priority === "lagging" ? 0 : 1;
    const pb = b.priority === "lagging" ? 0 : 1;
    return pa - pb || a.fill - b.fill;
  }
  if (a.status === "above-target") return b.fill - a.fill;
  return a.name.localeCompare(b.name);
}

export function focusRegions(regions: RegionView[], limit = 3): RegionView[] {
  return regions.filter((row) => row.status === "below-target").sort(compareRegions).slice(0, limit);
}

// ---------------------------------------------------------------------------
// Recommendations

export type ScoreDelta = { coverage: number; growth: number; recovery: number };

export type ComparisonRow = {
  dayTitle: string;
  toDayTitle?: string;
  current?: ExerciseSlot;
  suggested?: ExerciseSlot;
};

export type Recommendation = {
  id: string;
  kind: SuggestionKind;
  region?: RegionId;
  headline: string;
  action: string;
  sessionImpact: string;
  why: string;
  tradeOff: string;
  rows: ComparisonRow[];
  changes: PlannedChange[];
  /** Engine-estimated change if this recommendation alone were applied. */
  impact: ScoreDelta;
};

function lowerLabel(region: RegionId | undefined): string {
  return region ? REGION_META[region].label.toLowerCase() : "this area";
}

function listDays(days: string[]): string {
  const unique = [...new Set(days)];
  if (unique.length <= 1) return unique[0] ?? "";
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

function headlineFor(kind: SuggestionKind, region: RegionId | undefined, grade: Grade): string {
  const name = lowerLabel(region);
  const row = grade.regions.find((item) => item.region === region);
  switch (kind) {
    case "add":
      return row?.hasPrimary ? `Spread ${name} work across more days` : `Give ${name} a dedicated slot`;
    case "add_sets":
      return `Add volume where you already train ${name}`;
    case "swap":
      return `Point an existing slot at ${name}`;
    case "cut_sets":
      return `Trim ${name} volume`;
    case "move":
      return `Space out your ${name} sessions`;
  }
}

function actionFor(steps: Suggestion[]): string {
  if (steps.length === 1) return steps[0].title;
  const first = steps[0];
  const sameExercise = steps.every((step) => step.suggested?.name === first.suggested?.name);
  const days = listDays(steps.map((step) => step.dayTitle));
  if (first.kind === "add" && sameExercise) {
    return `Add ${first.suggested?.name} (${first.suggested?.sets} sets) to ${days}`;
  }
  if (first.kind === "add_sets") {
    return `Add 2 sets each to ${steps.map((step) => `${step.current?.name} (${step.dayTitle})`).join(" and ")}`;
  }
  return steps.map((step) => step.title).join(". ");
}

function sessionImpactFor(steps: Suggestion[]): string {
  const days = listDays(steps.map((step) => step.dayTitle));
  const each = steps.length > 1 ? " each" : "";
  switch (steps[0].kind) {
    case "add":
      return `+${steps[0].suggested?.sets ?? 3} sets${each} on ${days}`;
    case "add_sets":
      return `+2 sets${each} on ${days}`;
    case "swap":
      return "Same sets, same session length";
    case "cut_sets":
      return `−1 set${each} on ${days}`;
    case "move":
      return "Same sets, different day";
  }
}

function tradeOffFor(steps: Suggestion[]): string {
  const first = steps[0];
  const days = listDays(steps.map((step) => step.dayTitle));
  switch (first.kind) {
    case "add":
      return `${days} ${steps.length > 1 ? "get" : "gets"} a little longer. If time is tight, a swap may suit you better.`;
    case "add_sets":
      return "More sets here means more fatigue going into the rest of that session.";
    case "swap": {
      const change = first.change.op === "swap" ? first.change : null;
      const from = change ? tryGetExercise(change.fromId) : undefined;
      const fromRegion = from?.stimulus.find((stim) => stim.role === "primary")?.region;
      const fromName = first.current?.name ?? "the current exercise";
      return `Less direct ${lowerLabel(fromRegion)} work from ${fromName}. Keep ${fromName} if it's a strength goal.`;
    }
    case "cut_sets":
      return `Slightly less ${lowerLabel(first.region)} stimulus, traded for recovery elsewhere.`;
    case "move":
      return `${first.current?.name ?? "The exercise"} moves to ${first.toDayTitle ?? "another day"}; check that it fits that session.`;
  }
}

function deltaBetween(before: ScoreSnapshot, after: ScoreSnapshot): ScoreDelta {
  return {
    coverage: round1(after.coverage - before.coverage),
    growth: round1(after.growth - before.growth),
    recovery: round1(after.recovery - before.recovery),
  };
}

export function projectChanges(
  input: { split: Split; lagMap: LagMap; history?: HevyPayload["history"] },
  changes: PlannedChange[],
): ScoreSnapshot {
  return snapshot(gradeSplit({ ...input, split: applyChanges(input.split, changes) }));
}

/**
 * Groups the planner's steps into distinct recommendations (two "add incline
 * press" steps on different days become one), each with an engine-estimated
 * impact of applying it on its own.
 */
export function buildRecommendations(input: {
  plan: Plan;
  grade: Grade;
  split: Split;
  lagMap: LagMap;
  history?: HevyPayload["history"];
}): Recommendation[] {
  const { plan, grade, split, lagMap, history } = input;
  const groups = new Map<string, Suggestion[]>();
  for (const step of plan.steps) {
    const key = `${step.kind}:${step.region ?? "none"}`;
    groups.set(key, [...(groups.get(key) ?? []), step]);
  }
  const base = snapshot(grade);
  return [...groups.entries()].map(([id, steps]) => {
    const changes = steps.map((step) => step.change);
    return {
      id,
      kind: steps[0].kind,
      region: steps[0].region,
      headline: headlineFor(steps[0].kind, steps[0].region, grade),
      action: actionFor(steps),
      sessionImpact: sessionImpactFor(steps),
      why: steps[0].reason,
      tradeOff: tradeOffFor(steps),
      rows: steps.map((step) => ({
        dayTitle: step.dayTitle,
        toDayTitle: step.toDayTitle,
        current: step.current,
        suggested: step.suggested,
      })),
      changes,
      impact: deltaBetween(base, projectChanges({ split, lagMap, history }, changes)),
    };
  });
}

export function impactLabel(impact: ScoreDelta): string {
  const parts = METRICS.filter((metric) => Math.abs(impact[metric]) >= 0.1).map(
    (metric) => `${METRIC_LABEL[metric].toLowerCase()} ${impact[metric] > 0 ? "+" : "−"}${Math.abs(impact[metric]).toFixed(1)}`,
  );
  return parts.length > 0 ? `Estimated ${parts.join(" · ")}` : "Small estimated effect";
}

// ---------------------------------------------------------------------------
// Score explanations

export type MetricStory = {
  takeaway: string;
  opportunity?: string;
  evidence: string;
  how: string;
  limitations: string[];
  /** Score is projected rather than observed (growth without logged workouts). */
  projected: boolean;
};

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function bestRecommendationFor(metric: Metric, recommendations: Recommendation[]): Recommendation | undefined {
  return [...recommendations]
    .filter((rec) => rec.impact[metric] >= 0.1)
    .sort((a, b) => b.impact[metric] - a.impact[metric])[0];
}

export function metricStories(input: {
  grade: Grade;
  regions: RegionView[];
  recommendations: Recommendation[];
  hevy: HevyPayload;
  physique: PhysiqueResult | null;
  overrides: LagMap;
}): Record<Metric, MetricStory> {
  const { grade, regions, recommendations, hevy, physique, overrides } = input;
  const withPhotos = physique?.status === "graded";
  const goalsSet = Object.keys(overrides).length > 0;

  // Coverage
  const below = regions.filter((row) => row.status === "below-target").sort(compareRegions);
  const belowPriorities = below.filter((row) => row.priority === "lagging");
  const coverageNames = (belowPriorities.length > 0 ? belowPriorities : below)
    .slice(0, 2)
    .map((row) => row.name.toLowerCase());
  const coverageRec = bestRecommendationFor("coverage", recommendations);
  const coverage: MetricStory = {
    takeaway:
      coverageNames.length > 0
        ? `Your ${joinNames(coverageNames)} could use more attention in your current split.`
        : "Your split gives each of your priorities work within its target range.",
    opportunity: coverageRec
      ? coverageRec.headline
      : below[0]
        ? `Bring ${below[0].name.toLowerCase()} closer to its target range.`
        : undefined,
    evidence: [
      "Based on your Hevy routines",
      withPhotos ? "photo context" : null,
      goalsSet ? "goals you set" : null,
    ]
      .filter(Boolean)
      .join(" + "),
    how: "Each muscle's weekly effective sets in your routines are compared with a target range. Priority muscles get a higher target and count three times as much toward this score.",
    limitations: [
      "Uses the sets saved in your routines, not what you logged in a given week.",
      withPhotos
        ? "Photo context depends on pose and lighting and can be wrong. Goals you set override it."
        : "No photos, so every muscle uses a standard target unless you set a goal.",
    ],
    projected: false,
  };

  // Growth
  const parts = grade.growth.parts;
  const ratios = [
    { key: "volume", value: parts.volume / 4 },
    { key: "frequency", value: parts.frequency / 2 },
    { key: "selection", value: parts.selection / 2 },
    ...(parts.progression === null ? [] : [{ key: "progression", value: parts.progression / 2 }]),
  ].sort((a, b) => a.value - b.value);
  const weakest = ratios[0];
  const growthTakeaway: Record<string, string> = {
    volume: "Several muscles get less weekly work than their growth range.",
    frequency: "Some muscles are only trained once a week.",
    selection: "Some muscles have no exercise that targets them directly.",
    progression: "Your logged lifts are mostly flat or down across recent sessions.",
  };
  const growthOpportunity: Record<string, string> = {
    volume: "Add sets where muscles fall short of their range.",
    frequency: "Split work for once-a-week muscles across two days.",
    selection: "Add a direct exercise for muscles that only get indirect work.",
    progression: "Aim to add a rep or a little load to your main lifts week over week.",
  };
  const growthRec = bestRecommendationFor("growth", recommendations);
  const growth: MetricStory = {
    takeaway:
      parts.progression === null
        ? "This is projected from your routines. There are no logged workouts to read progression from yet."
        : weakest.value >= 0.8
          ? "Your history shows consistent work and progression signals."
          : growthTakeaway[weakest.key],
    opportunity: growthRec?.headline ?? (weakest.value < 0.8 ? growthOpportunity[weakest.key] : undefined),
    evidence:
      parts.progression === null
        ? "Based on your Hevy routines only"
        : `Based on your Hevy routines + ${hevy.workoutCount} logged workouts`,
    how: "Combines weekly volume against each muscle's range, how often each muscle is trained, whether it has a direct exercise, and estimated-strength trends per exercise from your logged sets.",
    limitations: [
      "Progression signals come from estimated strength in logged sets. They are not proof of muscle growth.",
      parts.progression === null
        ? "Capped at 7 until Hevy has logged workouts to read."
        : `Only your most recent ${MAX_IMPORTED_WORKOUTS} workouts are imported.`,
    ],
    projected: parts.progression === null,
  };

  // Recovery
  const recoveryFindings = grade.findings.filter((finding) => finding.metric === "recovery");
  const recoveryRec = bestRecommendationFor("recovery", recommendations);
  const recovery: MetricStory = {
    takeaway:
      recoveryFindings.length === 0
        ? "Your schedule spaces out repeated heavy sessions and stays within recoverable weekly volume."
        : `${recoveryFindings[0].title}.`,
    opportunity: recoveryRec?.headline ?? recoveryFindings[0]?.suggestedChange,
    evidence: "Based on your routine schedule and set counts",
    how: "Starts at 10 and subtracts for muscles past recoverable volume, very long sessions, a high weekly set total, and heavy work on the same muscle on back-to-back days.",
    limitations: [
      "An estimate from training structure, not a measure of fatigue, sleep, or readiness.",
      "Back-to-back days are judged by your routine order in Hevy, not your calendar.",
    ],
    projected: false,
  };

  return { coverage, growth, recovery };
}

// ---------------------------------------------------------------------------
// Overview copy

export function overviewHeadline(overall: number): string {
  if (overall >= 8) return "A strong split. A few refinements left.";
  if (overall >= 6.5) return "A solid foundation. A clearer next move.";
  if (overall >= 5) return "Good structure. Some clear gaps to close.";
  return "Plenty of room to grow. Start with one change.";
}

export function overviewSubline(regions: RegionView[], recommendations: Recommendation[]): string {
  const top = recommendations[0];
  if (top?.region) {
    const names = [top.region, ...recommendations.slice(1).map((rec) => rec.region)]
      .filter((region, index, all): region is RegionId => Boolean(region) && all.indexOf(region) === index)
      .slice(0, 2)
      .map((region) => REGION_META[region].label.toLowerCase());
    return `Your biggest opportunity is giving your ${joinNames(names)} more attention.`;
  }
  const below = focusRegions(regions, 2).map((row) => row.name.toLowerCase());
  if (below.length > 0) return `Your ${joinNames(below)} ${below.length > 1 ? "are" : "is"} below target.`;
  return "Your split is within target across the board. Keep logging to track progression.";
}

// ---------------------------------------------------------------------------
// Report details

export type ReportDetails = {
  dateRange: string | null;
  timeZone: string;
  workouts: number;
  loggedSets: number;
  routines: number;
  unmatched: string[];
  photos: string;
  goals: { you: number; photos: number };
  generated: string | null;
};

export function reportDetails(input: {
  hevy: HevyPayload;
  physique: PhysiqueResult | null;
  regions: RegionView[];
}): ReportDetails {
  const { hevy, physique, regions } = input;
  const dates = hevy.history.map((set) => set.date).filter(Boolean).sort();
  const format = (iso: string) =>
    new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return {
    dateRange: dates.length > 0 ? `${format(dates[0])} – ${format(dates[dates.length - 1])}` : null,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    workouts: hevy.workoutCount,
    loggedSets: hevy.history.filter((set) => set.type !== "warmup").length,
    routines: hevy.days.length,
    unmatched: hevy.unmatched,
    photos:
      physique?.status === "graded"
        ? `${physique.views.length} photo${physique.views.length === 1 ? "" : "s"} (${physique.views.join(", ")})`
        : "No photos",
    goals: {
      you: regions.filter((row) => row.goalSource === "you").length,
      photos: regions.filter((row) => row.goalSource === "photos" && row.priority !== "maintain").length,
    },
    generated: hevy.importedAt
      ? new Date(hevy.importedAt).toLocaleString(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZoneName: "short",
        })
      : null,
  };
}

export function updatedLabel(importedAt: string | undefined): string | null {
  if (!importedAt) return null;
  const then = new Date(importedAt);
  const now = new Date();
  if (then.toDateString() === now.toDateString()) return "Updated today";
  return `Updated ${then.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
}
