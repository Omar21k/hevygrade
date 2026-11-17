import type { HevyPayload } from "@/hevy/session";
import {
  applyChanges,
  aestheticFeedbackWeight,
  buildPlan,
  gradeSplit,
  LOW_AESTHETIC_PRIORITY_REGIONS,
  MAJOR_PHYSIQUE_REGIONS,
  priorityWeight,
  PROGRESSION_WINDOW_DAYS,
  REGION_META,
  regionVerb,
  snapshot,
  targetsFor,
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
  perWeekOf,
  resumeSuggestions,
  describeTrend,
  exerciseTrend,
  COVERAGE_WEIGHTS,
  type CoverageParts,
  type ExerciseTrend,
  ACTIVE_ROUTINE_WEEKS,
} from "@/scoring";
import type { PhysiqueResult } from "./state";
import { physiqueBalance, type PhysiqueBalance } from "@/physique/balance";
import type { PhysiqueView, RegionDevelopment } from "@/physique/types";

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
  | {
      kind: "seen";
      /**
       * "behind": clearly behind. "weaker": trails this physique's own average,
       * so it's prioritized as a weak point. "possibly-behind": read as behind,
       * but not confidently enough to raise the target.
       */
      relation: "behind" | "weaker" | "possibly-behind" | "in-line" | "ahead";
      limited: boolean;
      note?: string;
    };

/**
 * One judgment per muscle from photos (or your goal) and training together.
 * "both": looks behind and under target. "training-gap": under target, photos
 * don't flag it. "photo-gap": looks behind with logged volume already at the
 * top of its priority range, so more sets would cost recovery.
 */
export type Verdict = "both" | "training-gap" | "photo-gap" | "on-track" | "ahead";

/** A shortfall in a big visible muscle (lats, quads) ranks ahead of the same shortfall in abs or forearms. */
const MAJOR_REGION_WEIGHT = 1.5;

const VERDICT_RANK: Record<Verdict, number> = {
  both: 0,
  "training-gap": 1,
  "photo-gap": 2,
  "on-track": 3,
  ahead: 4,
};

export function needsAttention(row: RegionView): boolean {
  return VERDICT_RANK[row.verdict] <= VERDICT_RANK["photo-gap"];
}

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
  verdict: Verdict;
  /** Short combined read, e.g. "Behind in photos · under target". */
  summary: string;
  /** Full sentence combining the photo (or goal) signal with training volume. */
  assessment: string;
  /** Coverage points this region costs, weighted by priority; higher matters more. */
  drag: number;
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
  const relation =
    tag === "lagging"
      ? physique.weakPoints?.includes(region)
        ? "weaker"
        : "behind"
      : tag === "overdeveloped"
        ? "ahead"
        : row.development <= 2.5
          ? "possibly-behind"
          : "in-line";
  return { kind: "seen", relation, limited: row.confidence < 0.7, note: row.note };
}

export function photoContextLabel(photo: PhotoContext): string {
  if (photo.kind === "no-photos") return "No photos added";
  if (photo.kind === "not-visible") return "Not visible in your photos";
  if (photo.kind === "unclear") return "Too unclear in your photos to judge";
  const relation = {
    behind: "Looks behind the rest of your physique",
    weaker: "Trails the rest of your physique, so it's treated as a weak point",
    "possibly-behind": "Possibly behind, but too uncertain to raise its target",
    ahead: "Looks ahead of the rest of your physique",
    "in-line": "In line with the rest of your physique",
  }[photo.relation];
  return photo.limited && photo.relation !== "possibly-behind" ? `${relation} (limited view)` : relation;
}

function assessRegion(
  row: RegionBreakdown,
  photo: PhotoContext,
  goalSource: GoalSource,
  fromLogs: boolean,
): Pick<RegionView, "verdict" | "summary" | "assessment"> {
  const plural = regionVerb(row.region) === "are";
  const pick = (one: string, many: string) => (plural ? many : one);
  const name = row.label;
  const lower = name.toLowerCase();
  const range = `${row.targetLow}–${row.targetHigh}`;
  const sets = `${row.effectiveSets} effective sets a week`;
  const mine = goalSource === "you";
  const limited = photo.kind === "seen" && photo.limited ? " (limited view)" : "";

  if (row.priority === "overdeveloped") {
    return {
      verdict: "ahead",
      summary: mine ? "Lower priority (your goal)" : "Ahead in photos",
      assessment: mine
        ? `You set ${lower} to lower priority, so ${pick("its", "their")} target is ${range}. ${pick("It gets", "They get")} ${sets}.`
        : `${name} ${pick("looks", "look")} ahead of the rest of your physique in your photos${limited}, so ${pick("its", "their")} target is lower (${range}). ${pick("It gets", "They get")} ${sets}.`,
    };
  }

  const below = row.effectiveSets < row.targetLow;
  const logged = fromLogs ? `${sets} in your logs` : `${sets} in your routines`;

  if (row.priority === "lagging") {
    const weaker = photo.kind === "seen" && photo.relation === "weaker";
    const photoLead = mine
      ? `${name} ${pick("is", "are")} a priority you set`
      : weaker
        ? `${name} ${pick("trails", "trail")} the rest of your physique in your photos${limited}`
        : `${name} ${pick("looks", "look")} behind in your photos${limited}`;
    const photoTag = weaker ? "Weak point in photos" : "Behind in photos";
    // What most people need for this muscle. Behind despite this much means it responds less than average.
    const normalLow = targetsFor(row.region, "maintain").low;
    // Lagging muscles get more volume until training reaches the top of the priority range.
    if (row.effectiveSets < row.targetHigh) {
      if (!mine && row.effectiveSets >= normalLow) {
        return {
          verdict: "both",
          summary: `${photoTag} · needs more than average`,
          assessment: `${photoLead}, even with ${logged}, a normal amount. Same work, smaller response: ${pick("it isn't", "they aren't")} one of your natural strengths, so ${pick("it needs", "they need")} more than average. The target goes up to ${range}.`,
        };
      }
      return {
        verdict: "both",
        summary: mine ? "Your priority · under target" : `${photoTag} · under target`,
        assessment: mine
          ? `${photoLead} and ${pick("gets", "get")} ${logged} against a ${range} target. Your goal and your training both point here.`
          : `${photoLead}. Your ${fromLogs ? "logged workouts give" : "routines give"} ${pick("it", "them")} ${sets} (target ${range}), which may be why ${pick("it hasn't", "they haven't")} caught up.`,
      };
    }
    return {
      verdict: "photo-gap",
      summary: mine ? "Your priority · already high volume" : `${photoTag} · already high volume`,
      assessment: `${photoLead}, with ${logged}, already at the top of ${pick("its", "their")} ${range} priority range. More sets past this start costing recovery, so keep this volume consistent and keep adding reps or load. ${pick("A muscle", "Muscles")} that ${pick("isn't", "aren't")} a natural strength just ${pick("takes", "take")} longer.`,
    };
  }

  let photoRead: string | null = null;
  if (mine) photoRead = `You set ${lower} to maintain`;
  else if (photo.kind === "seen" && photo.relation === "possibly-behind")
    photoRead = `${name} might be behind in your photos, but the read is too uncertain to raise ${pick("its", "their")} target`;
  else if (photo.kind === "seen")
    photoRead = `${name} ${pick("looks", "look")} in line with the rest of your physique in your photos${limited}`;
  else if (photo.kind === "not-visible") photoRead = `${name} ${pick("isn't", "aren't")} visible in your photos`;
  else if (photo.kind === "unclear") photoRead = `${name} ${pick("is", "are")} too unclear in your photos to judge`;

  if (below) {
    const trainingBit = `${pick("gets", "get")} only ${logged} against a ${range} target`;
    const assessment = photoRead
      ? photo.kind === "seen" && photo.relation === "in-line" && !mine
        ? `${photoRead}. Training is still low (${sets} vs ${range}) — secondary to anything your photos flag, but worth topping up.`
        : photo.kind === "seen" && photo.relation === "possibly-behind" && !mine
          ? `${photoRead}. ${name} ${trainingBit}, which may be contributing.`
          : `${photoRead}. Separately, ${name.toLowerCase()} ${trainingBit}.`
      : `${name} ${trainingBit}.`;
    return {
      verdict: "training-gap",
      summary:
        photo.kind === "seen" && !mine
          ? photo.relation === "possibly-behind"
            ? "Possibly behind in photos · under target"
            : "In line in photos · under target"
          : "Under target",
      assessment,
    };
  }

  const volume =
    row.effectiveSets > row.targetHigh
      ? `${pick("gets", "get")} ${sets}, above the ${range} target`
      : `${pick("gets", "get")} ${sets}, within the ${range} target`;
  return {
    verdict: "on-track",
    summary: "On track",
    assessment: photoRead
      ? `${photoRead}, and ${pick("it", "they")} ${volume}.`
      : `${name} ${volume}.`,
  };
}

/** Weekly sets per exercise for a region, counting each day as often as it's done. */
function contributionsFor(split: Split, region: RegionId): Contribution[] {
  const byName = new Map<string, Contribution>();
  for (const day of split.days) {
    const perWeek = perWeekOf(day);
    if (perWeek <= 0) continue;
    for (const item of day.exercises) {
      const def = tryGetExercise(item.exerciseId);
      if (!def) continue;
      const stim = def.stimulus.find((entry) => entry.region === region);
      if (!stim) continue;
      const count = item.sets.filter((set) => set.type !== "warmup").length * perWeek;
      if (count === 0) continue;
      const row = byName.get(def.name) ?? { name: def.name, days: [], directSets: 0, indirectSets: 0 };
      if (stim.role === "primary") row.directSets += count;
      else row.indirectSets += count * stim.weight;
      if (!row.days.includes(day.title)) row.days.push(day.title);
      byName.set(def.name, row);
    }
  }
  return [...byName.values()]
    .map((row) => ({ ...row, directSets: round1(row.directSets), indirectSets: round1(row.indirectSets) }))
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
    const photo = photoContext(row.region, physique);
    return {
      ...assessRegion(row, photo, goalSource, split.source === "logged"),
      drag: round1(
        priorityWeight(row.priority) *
          aestheticFeedbackWeight(row.region) *
          (MAJOR_PHYSIQUE_REGIONS.includes(row.region) ? MAJOR_REGION_WEIGHT : 1) *
          Math.max(0, 10 - row.coverageScore),
      ),
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
      photo,
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

/** The combined ranking used everywhere a list of muscles is shown. */
export function rankRegions(a: RegionView, b: RegionView): number {
  const photoLead = (row: RegionView) =>
    row.goalSource === "photos" && row.verdict !== "training-gap" ? 0 : 1;
  return (
    VERDICT_RANK[a.verdict] - VERDICT_RANK[b.verdict] ||
    photoLead(a) - photoLead(b) ||
    b.drag - a.drag ||
    a.name.localeCompare(b.name)
  );
}

function userCares(row: RegionView): boolean {
  return row.goalSource === "you" || !LOW_AESTHETIC_PRIORITY_REGIONS.includes(row.id);
}

/** Photos (or a goal you set) say this muscle is behind. Training-only gaps are not "lacking". */
export function lackingFromPhotos(row: RegionView): boolean {
  if (!userCares(row)) return false;
  return row.priority === "lagging" && (row.verdict === "both" || row.verdict === "photo-gap");
}

function photosWereGraded(regions: RegionView[]): boolean {
  return regions.some((row) => row.photo.kind !== "no-photos");
}

/**
 * What the report calls lacking. With photos, only muscles the photos (or your
 * goal) flag — never glutes, calves, or forearms unless you set that goal.
 * Without photos, training shortfalls on muscles people actually train.
 */
function lackingRegions(regions: RegionView[]): RegionView[] {
  if (photosWereGraded(regions)) return regions.filter(lackingFromPhotos).sort(rankRegions);
  return regions
    .filter((row) => needsAttention(row) && userCares(row) && row.status === "below-target")
    .sort(rankRegions);
}

/** Below-target first (in combined order), above-target last. */
export function compareRegions(a: RegionView, b: RegionView): number {
  const rank: Record<RegionStatus, number> = {
    "below-target": 0,
    "insufficient-data": 1,
    "on-track": 2,
    "above-target": 3,
  };
  if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
  if (a.status === "above-target") return b.fill - a.fill;
  return rankRegions(a, b);
}

export function focusRegions(regions: RegionView[], limit = 4): RegionView[] {
  return lackingRegions(regions).slice(0, limit);
}

/** Puts recommendations for higher-ranked regions first; the planner's order breaks ties. */
export function orderRecommendations(recommendations: Recommendation[], regions: RegionView[]): Recommendation[] {
  const position = new Map(lackingRegions(regions).map((row, index) => [row.id, index]));
  const rankOf = (rec: Recommendation) => position.get(rec.region as RegionId) ?? regions.length;
  // Changes to days you train come first; getting back to a skipped routine is an aside.
  const asideOf = (rec: Recommendation) => (rec.kind === "resume" ? 1 : 0);
  return recommendations
    .map((rec, index) => ({ rec, index }))
    .sort((a, b) => asideOf(a.rec) - asideOf(b.rec) || rankOf(a.rec) - rankOf(b.rec) || a.index - b.index)
    .map(({ rec }) => rec);
}

/** "Why this helps" built from the same combined read the regions page shows. */
export function explainRecommendation(rec: Recommendation, regions: RegionView[]): string {
  const row = rec.region ? regions.find((item) => item.id === rec.region) : undefined;
  if (!row || !needsAttention(row)) return rec.why;
  const first = rec.rows[0];
  const plural = regionVerb(row.id) === "are";
  switch (rec.kind) {
    case "add":
      return row.contributions.some((item) => item.directSets > 0)
        ? `${row.assessment} Another day of direct work adds weekly volume without making one session much longer.`
        : `${row.assessment} Nothing you've logged lately trains ${plural ? "them" : "it"} directly.`;
    case "add_sets":
      return `${row.assessment} You already do ${first?.current?.name ?? "an exercise for this"}, so adding sets there is the simplest fix.`;
    case "swap":
      return `${row.assessment} ${first?.current?.name ?? "The current exercise"} mostly trains a neighboring muscle. Same sets, same session length.`;
    default:
      return rec.why;
  }
}

// ---------------------------------------------------------------------------
// Recommendations

export type ScoreDelta = { coverage: number; growth: number; recovery: number };

export type ComparisonRow = {
  dayTitle: string;
  toDayTitle?: string;
  current?: ExerciseSlot;
  suggested?: ExerciseSlot;
  /** A routine to get back to rather than an exercise change. */
  resume?: Suggestion["resume"];
};

export type RecommendationKind = SuggestionKind;

export type Recommendation = {
  id: string;
  kind: RecommendationKind;
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
  /** The numbers behind it: photos, logs, trend, what changes, and how to tell it worked. */
  evidence: Evidence[];
};

export type Evidence = { label: "Photos" | "Your logs" | "Trend" | "After" | "Check"; text: string };

function lowerLabel(region: RegionId | undefined): string {
  return region ? REGION_META[region].label.toLowerCase() : "this area";
}

function listDays(days: string[]): string {
  const unique = [...new Set(days)];
  if (unique.length <= 1) return unique[0] ?? "";
  return `${unique.slice(0, -1).join(", ")} and ${unique[unique.length - 1]}`;
}

/** "Lats: a second weekly exposure". Names the muscle and the move, never a generic category. */
function headlineFor(steps: Suggestion[], grade: Grade): string {
  const first = steps[0];
  const region = first.region;
  const name = region ? REGION_META[region].label : "Training";
  const row = grade.regions.find((item) => item.region === region);
  switch (first.kind) {
    case "add":
      return row?.hasPrimary
        ? `${name}: a ${steps.length > 1 ? "few more" : "second"} weekly exposure${steps.length > 1 ? "s" : ""}`
        : `${name}: a direct exercise`;
    case "add_sets":
      return `${name}: more sets on ${first.current?.name ?? "what you already do"}`;
    case "swap":
      return `${name}: swap ${first.current?.name ?? "a slot"} for ${first.suggested?.name ?? "a direct movement"}`;
    case "cut_sets":
      return `${name}: trim ${first.current?.name ?? "volume"}`;
    case "move":
      return `${name}: stop training ${regionVerb(region ?? "lats") === "are" ? "them" : "it"} hard on back-to-back days`;
    case "resume":
      return `${name}: get back to ${first.dayTitle}`;
  }
}

/** Rep target for a slot: what you've logged lately, else a range that fits the movement. */
function repsFor(exerciseId: string, history: HevyPayload["history"]): string {
  const logged = exerciseTrend(history, exerciseId)?.reps;
  if (logged) return logged;
  const fatigue = tryGetExercise(exerciseId)?.fatigue;
  return fatigue === "high" ? "6–10" : fatigue === "low" ? "10–15" : "8–12";
}

function withReps(slot: ExerciseSlot | undefined, exerciseId: string | undefined, history: HevyPayload["history"]) {
  if (!slot || !exerciseId) return slot;
  return { ...slot, reps: repsFor(exerciseId, history) };
}

function currentExerciseOf(change: PlannedChange): string | undefined {
  if (change.op === "swap") return change.fromId;
  if (change.op === "add" || change.op === "resume") return undefined;
  return change.exerciseId;
}

function suggestedExerciseOf(change: PlannedChange): string | undefined {
  if (change.op === "swap") return change.toId;
  if (change.op === "resume") return undefined;
  return change.exerciseId;
}

function actionFor(steps: Suggestion[]): string {
  if (steps.length === 1 || steps[0].kind === "resume") return steps.map((step) => step.title).join(". ");
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
    case "resume":
      return `+${steps.length} session${steps.length > 1 ? "s" : ""} a week`;
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
    case "resume":
      return `One more session a week. If that doesn't fit, adding sets on days you already train covers part of it.`;
  }
}

function deltaBetween(before: ScoreSnapshot, after: ScoreSnapshot): ScoreDelta {
  return {
    coverage: round1(after.coverage - before.coverage),
    growth: round1(after.growth - before.growth),
    recovery: round1(after.recovery - before.recovery),
  };
}

/** Everything the engine grades from. `photoBalance` is the photo 60% of coverage. */
export type ScoringInput = {
  split: Split;
  lagMap: LagMap;
  history?: HevyPayload["history"];
  photoBalance?: number;
};

export function projectChanges(input: ScoringInput, changes: PlannedChange[]): ScoreSnapshot {
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
  scoring: ScoringInput;
}): Recommendation[] {
  const { plan, grade, scoring } = input;
  const history = scoring.history ?? [];
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
      headline: headlineFor(steps, grade),
      action: actionFor(steps),
      sessionImpact: sessionImpactFor(steps),
      why: steps[0].reason,
      tradeOff: tradeOffFor(steps),
      rows: steps.map((step) => ({
        dayTitle: step.dayTitle,
        toDayTitle: step.toDayTitle,
        current: withReps(step.current, currentExerciseOf(step.change), history),
        suggested: withReps(step.suggested, suggestedExerciseOf(step.change), history),
        resume: step.resume,
      })),
      changes,
      impact: deltaBetween(base, projectChanges(scoring, changes)),
      evidence: [],
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
  /** What the score is made of, when it blends inputs (coverage: photos 60%, training 40%). */
  parts?: { label: string; score: number; weight: number; note: string }[];
};

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Photo muscles only when photos exist. Training volume is the cause, not a second lacking list. */
function coverageTakeaway(regions: RegionView[], withPhotos: boolean): string {
  const lacking = lackingRegions(regions).slice(0, 3);
  if (lacking.length === 0) {
    return withPhotos
      ? "Your photos look even: no muscle that matters trails the rest of your physique enough to call out."
      : "Your training gives each priority muscle work within its target range.";
  }
  const names = joinNames(lacking.map((row) => row.name.toLowerCase()));
  const under = lacking.filter((row) => row.verdict === "both");
  const onVolume = lacking.filter((row) => row.verdict === "photo-gap");
  const sentences: string[] = [];
  const plural = (rows: RegionView[]) => rows.length > 1 || regionVerb(rows[0].id) === "are";
  const namesOf = (rows: RegionView[]) => joinNames(rows.map((row) => row.name.toLowerCase()));
  const yours = under.filter((row) => row.goalSource === "you");
  const fromPhotos = under.filter((row) => row.goalSource !== "you");
  // Under the normal amount: the routine is a likely cause. At or past it: they respond less than average.
  const short = fromPhotos.filter((row) => row.effectiveSets < targetsFor(row.id, "maintain").low);
  const normal = fromPhotos.filter((row) => row.effectiveSets >= targetsFor(row.id, "maintain").low);
  if (yours.length > 0) {
    const many = plural(yours);
    sentences.push(
      `${capitalize(namesOf(yours))} ${many ? "are priorities" : "is a priority"} you set, and ${many ? "aren't" : "isn't"} getting enough weekly work to match that.`,
    );
  }
  if (short.length > 0) {
    const many = plural(short);
    sentences.push(
      `Your photos show ${namesOf(short)} behind the rest of your physique. Your training looks like a cause: ${many ? "they aren't" : "it isn't"} getting enough weekly work.`,
    );
  }
  if (normal.length > 0) {
    const many = plural(normal);
    sentences.push(
      short.length > 0
        ? `${capitalize(namesOf(normal))} ${many ? "trail" : "trails"} too, even with a normal amount of work, so ${many ? "they aren't" : "it isn't"} one of your natural strengths and ${many ? "need" : "needs"} more than average.`
        : `Your photos show ${namesOf(normal)} trailing the rest of your physique even with a normal amount of work, so ${many ? "they aren't" : "it isn't"} one of your natural strengths and ${many ? "need" : "needs"} more than average.`,
    );
  }
  if (onVolume.length > 0) {
    const volumeNames = namesOf(onVolume);
    const many = plural(onVolume);
    sentences.push(
      `${capitalize(volumeNames)} still ${many ? "trail" : "trails"} in your photos with logged volume already at the top of ${many ? "their" : "its"} priority range. More sets would cost recovery there, so keep that work consistent and keep adding reps or load.`,
    );
  }
  if (sentences.length === 0) {
    sentences.push(`Your photos show ${names} behind. That's what this report treats as lacking.`);
  }
  return sentences.join(" ");
}

/** A main opportunity is a change to days you actually train, never a skipped routine. */
function isRoutineChange(rec: Recommendation): boolean {
  return rec.kind !== "resume";
}

function bestRecommendationFor(metric: Metric, recommendations: Recommendation[]): Recommendation | undefined {
  return [...recommendations]
    .filter((rec) => isRoutineChange(rec) && rec.impact[metric] >= 0.1)
    .sort((a, b) => b.impact[metric] - a.impact[metric])[0];
}

export function metricStories(input: {
  grade: Grade;
  split: Split;
  regions: RegionView[];
  recommendations: Recommendation[];
  physique: PhysiqueResult | null;
  overrides: LagMap;
}): Record<Metric, MetricStory> {
  const { grade, split, regions, recommendations, physique, overrides } = input;
  const withPhotos = physique?.status === "graded";
  const fromLogs = split.source === "logged";
  const weeks = Math.round(split.weeks ?? 6);
  const window = `${weeks === 1 ? "last week" : `last ${weeks} weeks`} of logged workouts`;
  const source = fromLogs ? `Based on your ${window}` : "Based on your Hevy routines";
  const goalsSet = Object.keys(overrides).length > 0;

  // Coverage
  const focus = lackingRegions(regions);
  const coverageRec =
    recommendations.find((rec) => isRoutineChange(rec) && rec.region && focus.some((row) => row.id === rec.region)) ??
    recommendations.find((rec) => isRoutineChange(rec) && rec.impact.coverage >= 0.1);
  const coverageParts: CoverageParts = grade.coverage.parts;
  const coverage: MetricStory = {
    parts:
      coverageParts.photos === null
        ? undefined
        : [
            {
              label: "Photos",
              score: coverageParts.photos,
              weight: Math.round(COVERAGE_WEIGHTS.photos * 100),
              note: "How even your physique looks. Moves when you upload new photos.",
            },
            {
              label: "Training",
              score: coverageParts.training,
              weight: Math.round(COVERAGE_WEIGHTS.training * 100),
              note: "Logged work aimed at what the photos flag. Your next moves raise this.",
            },
          ],
    takeaway: coverageTakeaway(regions, withPhotos),
    opportunity: coverageRec
      ? coverageRec.headline
      : focus[0]
        ? `Bring ${focus[0].name.toLowerCase()} closer to ${regionVerb(focus[0].id) === "are" ? "their" : "its"} target range.`
        : undefined,
    evidence: [
      withPhotos ? "Your photos (60%)" : null,
      withPhotos ? `${source.replace("Based on your", "your")} (40%)` : source,
      goalsSet ? "goals you set" : null,
    ]
      .filter(Boolean)
      .join(" + ")
      .replace(/^your/, "Based on your")
      .replace(/^Your photos/, "Based on your photos"),
    how: "With photos, coverage is 60% how even your physique looks (each muscle against your own average, lats, chest, shoulders, arms and quads weighted most, plus extra weight on your single weakest one) and 40% whether your logged training gives the muscles that trail enough weekly work. The photo part only changes with new photos; the training part is what your next moves raise. What you're lacking is what the photos show as behind, plus up to three muscles that trail the rest of your own physique. Everyone responds differently, so a muscle that trails despite normal volume isn't one of your strengths and gets a higher target. Lats, chest, shoulders, arms, and quads count ahead of everything else. Glutes, calves, and forearms are left out unless you set that goal. Your logged sets explain a likely cause, such as not hitting that muscle enough. Those photo priorities get a higher target and count much more toward this score. A muscle that's behind gets more weekly sets first, up to the top of its range.",
    limitations: [
      fromLogs
        ? `Uses the sets you actually logged. A routine you've done in the last ${ACTIVE_ROUTINE_WEEKS} weeks counts at least once a week; one you haven't adds nothing. Your routines are only used to suggest fixes.`
        : "No logged workouts yet, so this uses the sets saved in your routines as if you did each one weekly.",
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
        : `Based on your ${window} + ${PROGRESSION_WINDOW_DAYS / 7} weeks of lift trends`,
    how: "Combines logged weekly volume against each muscle's range, how many times a week you actually train each muscle, whether it gets a direct exercise, and estimated-strength trends per exercise from your logged sets.",
    limitations: [
      "Progression signals come from estimated strength in logged sets. They are not proof of muscle growth.",
      parts.progression === null
        ? "Capped at 7 until Hevy has logged workouts to read."
        : `Progression reads your last ${PROGRESSION_WINDOW_DAYS / 7} weeks of logged sets, so it reflects your current program rather than all-time gains.`,
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
    evidence: fromLogs ? `Based on your ${window}` : "Based on your routine schedule and set counts",
    how: "Starts at 10 and subtracts for muscles past recoverable volume, very long sessions, a high weekly set total, and heavy work on the same muscle on back-to-back days.",
    limitations: [
      "An estimate from training structure, not a measure of fatigue, sleep, or readiness.",
      fromLogs
        ? "Back-to-back days come from the dates you logged, counted when they happen at least every other week."
        : "Back-to-back days are judged by your routine order in Hevy, since there are no logged dates yet.",
    ],
    projected: false,
  };

  return { coverage, growth, recovery };
}

// ---------------------------------------------------------------------------
// Assembly

/** Everything the report screens show, derived from one set of inputs. */
export function buildReport(input: {
  hevy: HevyPayload;
  split: Split;
  lagMap: LagMap;
  physique: PhysiqueResult | null;
  overrides: LagMap;
}) {
  const { hevy, split, lagMap, physique, overrides } = input;
  const balance =
    physique?.status === "graded" && physique.assessment ? physiqueBalance(physique.assessment) : null;
  const scoring: ScoringInput = { split, lagMap, history: hevy.history, photoBalance: balance?.score };
  // The photo part only moves with new photos, so plan on the training part alone.
  const training: ScoringInput = { split, lagMap, history: hevy.history };
  const grade = gradeSplit(scoring);
  const baseline = gradeSplit({ ...scoring, lagMap: {} });
  const plan = buildPlan(training);
  // Resume suggestions are scored on their own, not chained into the plan.
  const planned = buildRecommendations({
    plan: { ...plan, steps: [...plan.steps, ...resumeSuggestions(training)] },
    grade,
    scoring,
  });
  const regions = buildRegionViews({ grade, split, physique, overrides, recommendations: planned });
  const lead = new Set(lackingRegions(regions).map((row) => row.id));
  const scoped =
    photosWereGraded(regions) && lead.size > 0
      ? planned.filter((rec) => !rec.region || lead.has(rec.region))
      : planned.filter((rec) => !rec.region || !LOW_AESTHETIC_PRIORITY_REGIONS.includes(rec.region));
  const ordered = orderRecommendations(
    scoped.map((rec) => ({ ...rec, why: explainRecommendation(rec, regions) })),
    regions,
  );
  // Three moves at most; a skipped routine is an aside after them.
  const recommendations = [
    ...ordered.filter((rec) => rec.kind !== "resume").slice(0, MAX_MOVES),
    ...ordered.filter((rec) => rec.kind === "resume"),
  ].map((rec) => ({ ...rec, evidence: evidenceFor(rec, { grade, regions, physique, balance, scoring }) }));
  for (const row of regions) {
    row.recommendationIds = recommendations.filter((rec) => rec.region === row.id).map((rec) => rec.id);
  }
  const stories = metricStories({ grade, split, regions, recommendations, physique, overrides });
  const details = reportDetails({ hevy, physique, regions });
  return { grade, baseline, plan, recommendations, regions, stories, details, scoring, balance };
}

const MAX_MOVES = 3;

function formatSets(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** The exercise a muscle's evidence is about: the one in the change, else the one doing most of its work. */
function keyExerciseFor(rec: Recommendation, split: Split): string | undefined {
  const fromChange = rec.changes.map(currentExerciseOf).find(Boolean);
  if (fromChange) return fromChange;
  if (!rec.region) return undefined;
  let best: { id: string; sets: number } | undefined;
  for (const day of split.days) {
    if (perWeekOf(day) <= 0) continue;
    for (const item of day.exercises) {
      const def = tryGetExercise(item.exerciseId);
      if (!def?.stimulus.some((stim) => stim.region === rec.region && stim.role === "primary")) continue;
      const sets = item.sets.filter((set) => set.type !== "warmup").length * perWeekOf(day);
      if (!best || sets > best.sets) best = { id: item.exerciseId, sets };
    }
  }
  return best?.id;
}

/**
 * The numbers behind a move, one line each: what the photos show, what you
 * logged, how the main lift is moving, where the change lands you, and what
 * to watch in Hevy to know it worked.
 */
function evidenceFor(
  rec: Recommendation,
  context: {
    grade: Grade;
    regions: RegionView[];
    physique: PhysiqueResult | null;
    balance: PhysiqueBalance | null;
    scoring: ScoringInput;
  },
): Evidence[] {
  const { grade, regions, physique, balance, scoring } = context;
  const history = scoring.history ?? [];
  const evidence: Evidence[] = [];
  const region = rec.region;
  const view = region ? regions.find((row) => row.id === region) : undefined;
  const breakdown = region ? grade.regions.find((row) => row.region === region) : undefined;
  const weeks = Math.round(scoring.split.weeks ?? 6);
  const span = scoring.split.source === "logged" ? `Last ${weeks} weeks` : "Your routines";
  const recovery = rec.kind === "cut_sets" || rec.kind === "move";

  if (region && view) {
    const development = balance?.developments[region];
    const note = physique?.assessment?.developments.find((row) => row.region === region)?.note;
    if (view.goalSource === "you") {
      evidence.push({ label: "Photos", text: `You set ${view.name.toLowerCase()} as a priority yourself.` });
    } else if (development !== undefined && balance) {
      evidence.push({
        label: "Photos",
        text: `${view.name} read ${development.toFixed(1)} out of 5, against your physique's ${balance.average.toFixed(1)} average${note ? `. “${note}”` : "."}`,
      });
    }
  }

  if (view && breakdown) {
    const direct = view.contributions.filter((item) => item.directSets > 0).slice(0, 2);
    const sources =
      direct.length > 0
        ? direct.map((item) => `${item.name} ${formatSets(item.directSets)} sets/wk (${item.days.join(", ")})`).join(", ")
        : "nothing that trains it directly";
    evidence.push({
      label: "Your logs",
      text: recovery
        ? `${span}: ${formatSets(view.effectiveSets)} effective sets a week, past the ${view.targetMin}–${view.targetMax} range; about ${breakdown.mrv} is what most people recover from. From ${sources}.`
        : `${span}: ${formatSets(view.effectiveSets)} effective sets a week, ${formatSets(view.trainingDays)}× a week. From ${sources}.`,
    });
  }

  const keyId = keyExerciseFor(rec, scoring.split);
  const trend: ExerciseTrend | null = keyId ? exerciseTrend(history, keyId) : null;
  const keyName = keyId ? tryGetExercise(keyId)?.name : undefined;
  if (trend && keyName) evidence.push({ label: "Trend", text: describeTrend(keyName, trend) });

  if (region && rec.changes.length > 0) {
    const after = gradeSplit({ ...scoring, split: applyChanges(scoring.split, rec.changes) }).regions.find(
      (row) => row.region === region,
    );
    if (after && breakdown) {
      evidence.push({
        label: "After",
        text: `About ${formatSets(after.effectiveSets)} effective sets a week, ${formatSets(after.frequency)}× a week (target ${breakdown.targetLow}–${breakdown.targetHigh}).`,
      });
    }
  }

  const suggestedId = rec.changes.map(suggestedExerciseOf).find(Boolean);
  const suggestedName = suggestedId ? tryGetExercise(suggestedId)?.name : undefined;
  const suggestedTrend = suggestedId ? exerciseTrend(history, suggestedId) : null;
  let check: string | undefined;
  if (rec.kind === "resume") {
    check = `Log ${rec.rows[0]?.dayTitle ?? "it"} at least once a week for the next 4 weeks.`;
  } else if (recovery) {
    check =
      trend && keyName
        ? `${keyName} holds ${trend.bestSet} or better over the next 3 weeks with fewer sets.`
        : `Your ${(view?.name ?? "").toLowerCase()} lifts hold or go up over the next 3 weeks with fewer sets.`;
  } else if (suggestedTrend && suggestedName) {
    check = `Beat ${suggestedTrend.bestSet} on ${suggestedName} within 3 weeks.`;
  } else if (suggestedName) {
    check = `Log ${suggestedName} for 3 weeks and add a rep or a little load each week.`;
  }
  if (check) evidence.push({ label: "Check", text: check });
  return evidence;
}

// ---------------------------------------------------------------------------
// Overview copy

export function overviewHeadline(overall: number): string {
  if (overall >= 8) return "A strong split. A few refinements left.";
  if (overall >= 6.5) return "A solid foundation. A clearer next move.";
  if (overall >= 5) return "Good structure. Some clear gaps to close.";
  return "Plenty of room to grow. Start with one change.";
}

/** Visual compliments from the photo read. Delts share one line. */
const PHOTO_PRAISE: Partial<Record<RegionId, string>> = {
  chest_upper: "Upper chest has a real shelf to it.",
  chest_mid: "Chest looks full and strong.",
  chest_lower: "Lower chest looks full.",
  lats: "Lats look wide from the back.",
  upper_back: "Upper back looks thick and strong.",
  delt_front: "Delts look full and strong.",
  delt_side: "Delts look full and strong.",
  delt_rear: "Delts look full and strong.",
  biceps: "Arms look full from the front.",
  triceps: "Arms look developed from the side.",
  brachialis: "Arms look thick from the front.",
  quads: "Quads look full and strong.",
  hamstrings: "Hamstrings look developed from the side.",
};

export type StrengthCard = {
  title: string;
  /** What in the photo shows it. Empty for older reads that only have a score. */
  detail: string;
  /** e.g. "Side delts · Front photo". */
  tag: string | null;
};

export type StrengthReveal =
  | { kind: "cards"; cards: StrengthCard[] }
  | { kind: "message"; message: string };

const VIEW_LABEL: Record<PhysiqueView, string> = {
  front: "Front photo",
  side: "Side photo",
  back: "Back photo",
};

function strengthTag(regions: RegionId[], view: PhysiqueView | undefined): string | null {
  const parts: string[] = [];
  if (regions.length > 0) {
    parts.push(joinNames([...new Set(regions.slice(0, 2).map((region) => REGION_META[region].label))]));
  }
  if (view) parts.push(VIEW_LABEL[view]);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Older saved reads have no written strengths, so fall back to region praise. */
function strengthsFromScores(physique: PhysiqueResult, developments: RegionDevelopment[]): StrengthCard[] {
  const rows = developments.filter(
    (row) => row.confidence >= 0.55 && Number.isFinite(row.development) && PHOTO_PRAISE[row.region],
  );
  const baseline =
    rows.length === 0 ? 3 : rows.reduce((sum, row) => sum + row.development, 0) / rows.length;
  const strong = rows
    .filter(
      (row) =>
        physique.lagMap[row.region] !== "lagging" &&
        row.development >= 3.4 &&
        row.development >= baseline + 0.35,
    )
    .sort((a, b) => b.development - a.development);

  const cards: StrengthCard[] = [];
  const used = new Set<string>();
  for (const row of strong) {
    const title = PHOTO_PRAISE[row.region];
    if (!title || used.has(title)) continue;
    used.add(title);
    cards.push({ title, detail: row.note?.trim() ?? "", tag: strengthTag([row.region], undefined) });
  }
  return cards;
}

/**
 * What already looks good in the photos, shown before the scores. Every real
 * strength the read found, never one the photos flag as behind. Training
 * volume does not count as a compliment here.
 */
export function strengthReveal(physique: PhysiqueResult | null): StrengthReveal {
  if (!physique || physique.status !== "graded") {
    return { kind: "message", message: "No photos this time, so this stays quiet. The scores come from your training." };
  }
  const assessment = physique.assessment;
  if (!assessment) {
    return {
      kind: "message",
      message: "Your photos were uploaded, but the read didn't save. Run them again from the photos step.",
    };
  }

  let cards: StrengthCard[];
  if (assessment.strengths) {
    const graded = new Map(
      assessment.developments
        .filter((row) => row.confidence >= 0.45 && Number.isFinite(row.development))
        .map((row) => [row.region, row.development]),
    );
    cards = assessment.strengths
      .filter((strength) =>
        strength.regions.every(
          (region) => physique.lagMap[region] !== "lagging" && (graded.get(region) ?? 3) >= 3,
        ),
      )
      .map((strength) => ({
        title: strength.title,
        detail: strength.detail,
        tag: strengthTag(strength.regions, strength.view),
      }));
  } else {
    cards = strengthsFromScores(physique, assessment.developments);
  }

  if (cards.length === 0) {
    return {
      kind: "message",
      message: "Nothing in the photos stands out ahead of the rest yet. The scores get into where the work goes.",
    };
  }
  return { kind: "cards", cards };
}

export function overviewSubline(regions: RegionView[]): string {
  const focus = focusRegions(regions, 2);
  if (focus.length === 0) {
    return photosWereGraded(regions)
      ? "Your photos don't show a clear lag in the muscles that matter."
      : "Your training is within target across the board. Keep logging to track progression.";
  }
  const names = joinNames(focus.map((row) => row.name.toLowerCase()));
  if (focus.every((row) => row.goalSource === "photos")) {
    return `Your photos say what's lacking: ${names}. Your logged training is the context for why.`;
  }
  if (focus.every((row) => row.verdict === "both")) {
    const source = focus.every((row) => row.goalSource === "you")
      ? "your goals and your training"
      : "your photos and your training";
    return `Your biggest opportunity is your ${names}, where ${source} both point.`;
  }
  return `Your biggest opportunity is giving your ${names} more attention.`;
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
  const first = hevy.firstWorkoutAt ?? dates[0];
  const last = hevy.lastWorkoutAt ?? dates[dates.length - 1];
  // Workout dates are calendar days; formatting in UTC keeps them from shifting a day.
  const format = (day: string) =>
    new Date(`${day.slice(0, 10)}T00:00:00Z`).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  return {
    dateRange: first && last ? `${format(first)} – ${format(last)}` : null,
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
