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
      /** "possibly-behind": read as behind, but not confidently enough to raise the target. */
      relation: "behind" | "possibly-behind" | "in-line" | "ahead";
      limited: boolean;
      note?: string;
    };

/**
 * One judgment per muscle from photos (or your goal) and training together.
 * "both": looks behind and under target. "training-gap": under target, photos
 * don't flag it. "photo-gap": looks behind, but volume is already on target.
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
      ? "behind"
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

  if (row.priority === "lagging") {
    const photoLead = mine
      ? `${name} ${pick("is", "are")} a priority you set`
      : `${name} ${pick("looks", "look")} behind in your photos${limited}`;
    if (below) {
      return {
        verdict: "both",
        summary: mine ? "Your priority · under target" : "Behind in photos · under target",
        assessment: mine
          ? `${photoLead} and ${pick("gets", "get")} only ${sets} against a ${range} target. Your goal and your training both point here.`
          : `${photoLead} — that's the main gap. Your Hevy split only gives ${sets} (target ${range}), which may be why ${pick("it", "they")} haven't caught up.`,
      };
    }
    return {
      verdict: "photo-gap",
      summary: mine ? "Your priority · volume on target" : "Behind in photos · volume on target",
      assessment: mine
        ? `${photoLead}, and training already reaches ${pick("its", "their")} priority range (${sets}). Volume isn't the gap here.`
        : `${photoLead}, but your routines already hit the raised target (${sets}). The photo lag is probably effort, selection, or progression — not more sets on paper.`,
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
    const trainingBit = `${pick("gets", "get")} only ${sets} against a ${range} target in your Hevy routines`;
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
    const photo = photoContext(row.region, physique);
    return {
      ...assessRegion(row, photo, goalSource),
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
  return recommendations
    .map((rec, index) => ({ rec, index }))
    .sort((a, b) => rankOf(a.rec) - rankOf(b.rec) || a.index - b.index)
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
        : `${row.assessment} Nothing in your split trains ${plural ? "them" : "it"} directly yet.`;
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

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Photo muscles only when photos exist. Training volume is the cause, not a second lacking list. */
function coverageTakeaway(regions: RegionView[], withPhotos: boolean): string {
  const lacking = lackingRegions(regions).slice(0, 2);
  if (lacking.length === 0) {
    return withPhotos
      ? "Your photos don't show a clear lag in the muscles that matter. Routine shortfalls elsewhere aren't treated as what you're lacking."
      : "Your split gives each priority muscle work within its target range.";
  }
  const many = lacking.length > 1 || regionVerb(lacking[0].id) === "are";
  const pick = (one: string, other: string) => (many ? other : one);
  const names = joinNames(lacking.map((row) => row.name.toLowerCase()));
  const under = lacking.filter((row) => row.verdict === "both");
  const onVolume = lacking.filter((row) => row.verdict === "photo-gap");
  const sentences: string[] = [];
  if (under.length > 0) {
    const underNames = joinNames(under.map((row) => row.name.toLowerCase()));
    const fromYou = under.every((row) => row.goalSource === "you");
    sentences.push(
      fromYou
        ? `${capitalize(underNames)} ${pick("is a priority", "are priorities")} you set, and ${pick("isn't", "aren't")} getting enough weekly work to match that.`
        : `Your photos show ${underNames} behind the rest of your physique. Your routines look like a cause: ${pick("that muscle isn't", "those muscles aren't")} getting enough weekly work for something that looks behind.`,
    );
  }
  if (onVolume.length > 0 && sentences.length < 2) {
    const volumeNames = joinNames(onVolume.map((row) => row.name.toLowerCase()));
    sentences.push(
      `${capitalize(volumeNames)} ${onVolume.length > 1 || regionVerb(onVolume[0].id) === "are" ? "look" : "looks"} behind in your photos, but the routines already hit the raised target. More sets on paper probably isn't the fix.`,
    );
  }
  if (sentences.length === 0) {
    sentences.push(`Your photos show ${names} behind. That's what this report treats as lacking.`);
  }
  return sentences.slice(0, 2).join(" ");
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
  physique: PhysiqueResult | null;
  overrides: LagMap;
}): Record<Metric, MetricStory> {
  const { grade, regions, recommendations, physique, overrides } = input;
  const withPhotos = physique?.status === "graded";
  const goalsSet = Object.keys(overrides).length > 0;

  // Coverage
  const focus = lackingRegions(regions);
  const coverageRec =
    recommendations.find((rec) => rec.region && focus.some((row) => row.id === rec.region)) ??
    recommendations.find((rec) => rec.impact.coverage >= 0.1);
  const coverage: MetricStory = {
    takeaway: coverageTakeaway(regions, withPhotos),
    opportunity: coverageRec
      ? coverageRec.headline
      : focus[0]
        ? `Bring ${focus[0].name.toLowerCase()} closer to ${regionVerb(focus[0].id) === "are" ? "their" : "its"} target range.`
        : undefined,
    evidence: [
      "Based on your Hevy routines",
      withPhotos ? "photo context" : null,
      goalsSet ? "goals you set" : null,
    ]
      .filter(Boolean)
      .join(" + "),
    how: "With photos, what you're lacking is what the photos show as behind — lats, chest, shoulders, arms, and quads ahead of everything else. Glutes, calves, and forearms are left out unless you set that goal. Your Hevy sets explain a likely cause, such as not hitting that muscle enough. Those photo priorities get a higher target and count much more toward this score.",
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
        : `Based on your Hevy routines + your last ${PROGRESSION_WINDOW_DAYS / 7} weeks of logged workouts`,
    how: "Combines weekly volume against each muscle's range, how often each muscle is trained, whether it has a direct exercise, and estimated-strength trends per exercise from your logged sets.",
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
  const scoring = { split, lagMap, history: hevy.history };
  const grade = gradeSplit(scoring);
  const baseline = gradeSplit({ ...scoring, lagMap: {} });
  const plan = buildPlan(scoring);
  const planned = buildRecommendations({ plan, grade, ...scoring });
  const regions = buildRegionViews({ grade, split, physique, overrides, recommendations: planned });
  const lead = new Set(lackingRegions(regions).map((row) => row.id));
  const scoped =
    photosWereGraded(regions) && lead.size > 0
      ? planned.filter((rec) => !rec.region || lead.has(rec.region))
      : planned.filter((rec) => !rec.region || !LOW_AESTHETIC_PRIORITY_REGIONS.includes(rec.region));
  const recommendations = orderRecommendations(scoped, regions).map((rec) => ({
    ...rec,
    why: explainRecommendation(rec, regions),
  }));
  const stories = metricStories({ grade, regions, recommendations, physique, overrides });
  const details = reportDetails({ hevy, physique, regions });
  return { grade, baseline, plan, recommendations, regions, stories, details };
}

// ---------------------------------------------------------------------------
// Overview copy

export function overviewHeadline(overall: number): string {
  if (overall >= 8) return "A strong split. A few refinements left.";
  if (overall >= 6.5) return "A solid foundation. A clearer next move.";
  if (overall >= 5) return "Good structure. Some clear gaps to close.";
  return "Plenty of room to grow. Start with one change.";
}

/** A few true positives, typed before the scores. Never invents a strength the data doesn't show. */
export function strengthLines(regions: RegionView[], grade: Grade): string[] {
  const lines: string[] = [];
  const solid = regions
    .filter(
      (row) =>
        MAJOR_PHYSIQUE_REGIONS.includes(row.id) &&
        row.status !== "below-target" &&
        row.verdict !== "both" &&
        row.verdict !== "photo-gap",
    )
    .sort((a, b) => b.effectiveSets - a.effectiveSets)
    .slice(0, 2);
  if (solid.length > 0) {
    const names = joinNames(solid.map((row) => row.name.toLowerCase()));
    const plural = solid.length > 1 || regionVerb(solid[0].id) === "are";
    lines.push(`Your ${names} ${plural ? "are" : "is"} already getting the work ${plural ? "they need" : "it needs"}.`);
  }
  if (grade.recovery.score >= 8) {
    lines.push("Your week leaves room between hard sessions instead of stacking them.");
  } else if (grade.growth.score >= 7 && grade.growth.parts.progression !== null && grade.growth.parts.progression >= 1) {
    lines.push("Your logged lifts have been moving, not just sitting still.");
  } else if (grade.growth.score >= 7) {
    lines.push("The structure of your training already supports progression.");
  }
  const ahead = regions.find((row) => row.verdict === "ahead" && userCares(row));
  if (ahead && lines.length < 3) {
    const plural = regionVerb(ahead.id) === "are";
    lines.push(`${ahead.name} already ${plural ? "stand" : "stands"} out in your photos.`);
  }
  if (lines.length === 0) {
    lines.push("You have a full split saved in Hevy. That's a real base to build on.");
  }
  return lines.slice(0, 3);
}

export function overviewSubline(regions: RegionView[]): string {
  const focus = focusRegions(regions, 2);
  if (focus.length === 0) {
    return photosWereGraded(regions)
      ? "Your photos don't show a clear lag in the muscles that matter."
      : "Your split is within target across the board. Keep logging to track progression.";
  }
  const names = joinNames(focus.map((row) => row.name.toLowerCase()));
  if (focus.every((row) => row.goalSource === "photos")) {
    return `Your photos say what's lacking: ${names}. Your routines are the context for why.`;
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
