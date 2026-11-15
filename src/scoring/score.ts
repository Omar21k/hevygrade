import { getExercise } from "./catalog";
import { clamp, round1, weightedMean } from "./math";
import {
  REGION_META,
  priorityWeight,
  regionVerb,
  type RegionId,
} from "./regions";
import type {
  Finding,
  Grade,
  GrowthParts,
  HistorySet,
  RegionBreakdown,
  ScoreInput,
} from "./types";
import { analyzeVolume, regionLabel, regionTargets } from "./volume";

function coverageForRegion(
  effectiveSets: number,
  targetLow: number,
  targetHigh: number,
  priority: ScoreInput["lagMap"][RegionId],
): number {
  if (effectiveSets <= 0) {
    if (priority === "lagging") return 0;
    if (priority === "overdeveloped") return 8;
    return 3;
  }
  if (effectiveSets < targetLow) {
    const cap = priority === "lagging" ? 7 : 8.5;
    return cap * (effectiveSets / targetLow);
  }
  if (effectiveSets <= targetHigh) {
    const span = Math.max(targetHigh - targetLow, 1);
    return 8 + 2 * ((effectiveSets - targetLow) / span);
  }
  const over = (effectiveSets - targetHigh) / 4;
  return Math.max(7, 10 - over);
}

function buildBreakdown(input: ScoreInput): RegionBreakdown[] {
  const { byRegion, scoredRegions } = analyzeVolume(input.split, input.lagMap);
  return scoredRegions.map((region) => {
    const volume = byRegion.get(region);
    const targets = regionTargets(region, input.lagMap);
    const effectiveSets = volume?.effectiveSets ?? 0;
    const priority = input.lagMap[region];
    return {
      region,
      label: regionLabel(region),
      priority,
      effectiveSets: round1(effectiveSets),
      primarySets: volume?.primarySets ?? 0,
      targetLow: targets.low,
      targetHigh: targets.high,
      mrv: targets.mrv,
      frequency: volume?.frequency ?? 0,
      coverageScore: round1(
        coverageForRegion(effectiveSets, targets.low, targets.high, priority),
      ),
      hasPrimary: volume?.hasPrimary ?? false,
    };
  });
}

function scoreCoverage(
  input: ScoreInput,
  regions: RegionBreakdown[],
): { score: number; findings: Finding[]; notes: string[] } {
  const findings: Finding[] = [];
  const notes: string[] = [];

  const score = weightedMean(
    regions.map((row) => ({
      value: row.coverageScore,
      weight: priorityWeight(row.priority),
    })),
  );

  for (const row of regions) {
    if (row.priority === "lagging" && row.coverageScore < 6) {
      const needsPrimary = !row.hasPrimary;
      findings.push({
        id: `coverage-lag-${row.region}`,
        metric: "coverage",
        severity: row.effectiveSets < 2 ? "blocker" : "warn",
        region: row.region,
        title: `${row.label} ${regionVerb(row.region)} a priority but under-trained`,
        detail: `${row.effectiveSets} effective sets/week vs a priority target of ${row.targetLow}–${row.targetHigh}. ${
          needsPrimary
            ? "Nothing in the split is a primary movement for this region."
            : "The movement is present but weekly volume is too low."
        }`,
        suggestedChange: needsPrimary
          ? suggestionForMissingPrimary(row.region)
          : `Add 4–8 hard sets/week for ${row.label.toLowerCase()}, preferably as primary work.`,
      });
    }
  }

  const redundancy = siblingRedundancyFindings(regions);
  findings.push(...redundancy);

  if (findings.length === 0) {
    notes.push("Lagging regions are receiving stimulus in the target range.");
  }

  return { score: round1(clamp(score, 0, 10)), findings, notes };
}

function suggestionForMissingPrimary(region: RegionId): string {
  if (region === "brachialis") {
    return "Add hammer curls (or neutral-grip curls) as primary work — supinated curls will not fix front-arm thickness.";
  }
  if (region === "chest_upper") {
    return "Add incline pressing as a primary movement, not just flat bench or flys.";
  }
  return `Add a primary exercise for ${regionLabel(region).toLowerCase()}.`;
}

function siblingRedundancyFindings(regions: RegionBreakdown[]): Finding[] {
  const findings: Finding[] = [];

  for (const row of regions) {
    if (row.priority !== "lagging" || row.hasPrimary) continue;
    const group = REGION_META[row.region].group;
    const siblings = regions.filter(
      (other) =>
        other.region !== row.region &&
        REGION_META[other.region].group === group &&
        other.primarySets >= 4,
    );
    if (siblings.length === 0) continue;

    findings.push({
      id: `coverage-redundant-${row.region}`,
      metric: "coverage",
      severity: "warn",
      region: row.region,
      title: `Sibling work is covering the wrong tissue`,
      detail: `${siblings.map((s) => s.label).join(", ")} are trained, but ${row.label.toLowerCase()} has no primary stimulus. A generic app would call the parent muscle "trained."`,
      suggestedChange: suggestionForMissingPrimary(row.region),
    });
  }

  return findings;
}

function scoreGrowth(
  input: ScoreInput,
  regions: RegionBreakdown[],
): { score: number; findings: Finding[]; notes: string[]; capped: boolean; parts: GrowthParts } {
  const findings: Finding[] = [];
  const notes: string[] = [];
  const lagging = regions.filter((row) => row.priority === "lagging");

  // Every region counts, weighted like coverage, so one lagging muscle shifts
  // growth instead of becoming the whole score.
  const growthMean = (value: (row: RegionBreakdown) => number, fallback: number) =>
    regions.length === 0
      ? fallback
      : weightedMean(
          regions.map((row) => ({ value: value(row), weight: priorityWeight(row.priority) })),
        );
  const volumeRatio = (row: RegionBreakdown) =>
    clamp(row.effectiveSets / Math.max(row.targetLow, 1), 0, 1);

  const volumePts = growthMean(volumeRatio, 0.75) * 4;

  const freqPts = growthMean((row) => (row.frequency >= 2 ? 2 : row.frequency === 1 ? 1 : 0), 1.5);

  // Indirect work earns up to half credit; a dedicated primary movement earns full.
  const selectionPts =
    growthMean((row) => (row.hasPrimary ? 1 : Math.min(volumeRatio(row), 0.5)), 0.75) * 2;

  const usedHistory = Boolean(input.history && input.history.length > 0);
  let progressionPts = 0;
  if (usedHistory) {
    progressionPts = estimateProgression(input);
    if (progressionPts === UNKNOWN_PROGRESSION) {
      notes.push("Not enough repeat sessions per exercise in Hevy yet to read a progression trend.");
    }
  } else {
    notes.push("No Hevy history yet — growth is projected from the routine only and capped at 7.");
    findings.push({
      id: "growth-no-history",
      metric: "growth",
      severity: "info",
      title: "Growth is projected, not observed",
      detail:
        "Long-term growth uses load × rep trends from logged Hevy workouts. Until history is connected, this score cannot go above 7.",
    });
  }

  for (const row of lagging) {
    if (row.frequency < 2) {
      findings.push({
        id: `growth-freq-${row.region}`,
        metric: "growth",
        severity: "warn",
        region: row.region,
        title: `${row.label} ${regionVerb(row.region) === "are" ? "get" : "gets"} hit only ${row.frequency}× a week`,
        detail:
          "Lagging tissue usually grows faster with 2+ exposures per week than with one junk-filled session.",
        suggestedChange: `Split ${row.label.toLowerCase()} work across two days instead of stacking it on one.`,
      });
    }
    if (row.effectiveSets < row.targetLow) {
      findings.push({
        id: `growth-volume-${row.region}`,
        metric: "growth",
        severity: row.effectiveSets < row.targetLow * 0.5 ? "blocker" : "warn",
        region: row.region,
        title: `${row.label} volume is below a growth range`,
        detail: `Effective weekly sets ${row.effectiveSets} vs ${row.targetLow}–${row.targetHigh} for a lagging region. Presence of an exercise is not the same as enough stimulus.`,
        suggestedChange:
          row.region === "chest_upper"
            ? "Keep incline work and add 4+ weekly sets rather than swapping the whole chest day."
            : `Increase weekly hard sets for ${row.label.toLowerCase()} into the ${row.targetLow}–${row.targetHigh} range.`,
      });
    }
  }

  let score = volumePts + freqPts + selectionPts + progressionPts;
  const capped = !usedHistory;
  if (!usedHistory) score = Math.min(score, 7);

  return {
    score: round1(clamp(score, 0, 10)),
    findings,
    notes,
    capped,
    parts: {
      volume: round1(volumePts),
      frequency: round1(freqPts),
      selection: round1(selectionPts),
      progression: usedHistory ? round1(progressionPts) : null,
    },
  };
}

const UNKNOWN_PROGRESSION = 0.5;
const MIN_SESSIONS_FOR_TREND = 3;
/** Within ±2% of the starting estimate counts as holding, not progressing. */
const TREND_BAND = 0.02;

/** Epley estimated 1RM for loaded sets; reps for bodyweight sets. */
function setStrength(weightKg: number | undefined, reps: number): number {
  return weightKg && weightKg > 0 ? weightKg * (1 + reps / 30) : reps;
}

/**
 * Progression reads a recent block, not all-time: over years of history almost
 * every lift trends up, which says nothing about the current program.
 */
export const PROGRESSION_WINDOW_DAYS = 84;

/** Sets within PROGRESSION_WINDOW_DAYS of the most recent logged set. */
export function recentHistory(history: HistorySet[]): HistorySet[] {
  const latest = history.reduce((max, set) => (set.date > max ? set.date : max), "");
  if (!latest) return history;
  const cutoff = new Date(`${latest.slice(0, 10)}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - PROGRESSION_WINDOW_DAYS);
  const from = cutoff.toISOString().slice(0, 10);
  return history.filter((set) => set.date.slice(0, 10) >= from);
}

/**
 * Trend per exercise: best set of each session, earliest third of sessions vs
 * latest third, within the recent window. Compared per exercise so rotating
 * movements isn't read as regression. Exercises in the current split are
 * preferred when they have data.
 */
function estimateProgression(input: ScoreInput): number {
  const sessionsByExercise = new Map<string, Map<string, number>>();
  for (const set of recentHistory(input.history ?? [])) {
    if (set.type === "warmup" || !set.reps || set.reps <= 0) continue;
    const strength = setStrength(set.weightKg, set.reps);
    const sessions = sessionsByExercise.get(set.exerciseId) ?? new Map<string, number>();
    const day = set.date.slice(0, 10);
    sessions.set(day, Math.max(sessions.get(day) ?? 0, strength));
    sessionsByExercise.set(set.exerciseId, sessions);
  }

  const trends = new Map<string, number>();
  for (const [exerciseId, sessions] of sessionsByExercise) {
    if (sessions.size < MIN_SESSIONS_FOR_TREND) continue;
    const ordered = [...sessions.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, strength]) => strength);
    const third = Math.ceil(ordered.length / 3);
    const avg = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    const early = avg(ordered.slice(0, third));
    const late = avg(ordered.slice(-third));
    if (early <= 0) continue;
    const change = (late - early) / early;
    trends.set(exerciseId, change > TREND_BAND ? 1 : change >= -TREND_BAND ? 0.5 : 0);
  }
  if (trends.size === 0) return UNKNOWN_PROGRESSION;

  const inSplit = new Set(
    input.split.days.flatMap((day) => day.exercises.map((item) => item.exerciseId)),
  );
  const current = [...trends].filter(([id]) => inSplit.has(id)).map(([, value]) => value);
  const pool = current.length > 0 ? current : [...trends.values()];
  return (pool.reduce((sum, value) => sum + value, 0) / pool.length) * 2;
}

function scoreRecovery(
  input: ScoreInput,
  regions: RegionBreakdown[],
): { score: number; findings: Finding[]; notes: string[] } {
  const findings: Finding[] = [];
  const notes: string[] = [];
  const analysis = analyzeVolume(input.split, input.lagMap);
  let deductions = 0;

  for (const row of regions) {
    if (row.effectiveSets > row.mrv) {
      const hit = row.priority === "lagging" ? 1 : 1.5;
      deductions += hit;
      findings.push({
        id: `recovery-mrv-${row.region}`,
        metric: "recovery",
        severity: "warn",
        region: row.region,
        title: `${row.label} ${regionVerb(row.region)} past recoverable volume`,
        detail: `${row.effectiveSets} effective sets/week vs MRV ~${row.mrv}. Extra sets here steal recovery from the rest of the split.`,
        suggestedChange: `Cut ${row.label.toLowerCase()} toward ${row.targetHigh} sets and keep the hard ones.`,
      });
    }
  }

  for (const session of analysis.sessionWorkingSets) {
    if (session.workingSets > 30) {
      deductions += 0.5;
      findings.push({
        id: `recovery-session-${session.dayId}`,
        metric: "recovery",
        severity: "warn",
        title: `${session.title} is a high-fatigue session`,
        detail: `${session.workingSets} working sets in one day. Quality on the last movements will collapse.`,
        suggestedChange: "Move isolation work to another day or drop redundant sets.",
      });
    }
  }

  if (analysis.weeklyWorkingSets > 140) {
    deductions += 1;
    findings.push({
      id: "recovery-systemic",
      metric: "recovery",
      severity: "warn",
      title: "Weekly set count is systemically high",
      detail: `${analysis.weeklyWorkingSets} working sets across the cycle.`,
      suggestedChange: "Trim maintenance regions first, not lagging ones.",
    });
  }

  deductions += consecutiveOverlap(input, regions, findings);

  const flexorLoad = regions
    .filter((row) => REGION_META[row.region].group === "arm_flexors")
    .reduce((sum, row) => sum + row.effectiveSets, 0);
  if (flexorLoad > 28) {
    deductions += 0.75;
    findings.push({
      id: "recovery-elbows",
      metric: "recovery",
      severity: "info",
      title: "Elbow-flexor load is stacked",
      detail: `Biceps + brachialis + forearms total ${round1(flexorLoad)} effective sets/week.`,
      suggestedChange: "Keep hammers if arms are lagging from the front, but drop a redundant supinated curl.",
    });
  }

  const frontDelts = regions.find((row) => row.region === "delt_front");
  if (frontDelts && frontDelts.effectiveSets > frontDelts.mrv) {
    notes.push("Front delts often blow up from chest + pressing even without isolation.");
  }

  const score = round1(clamp(10 - deductions, 0, 10));
  if (findings.length === 0) {
    notes.push("Volume and spacing look recoverable relative to this split.");
  }
  return { score, findings, notes };
}

function consecutiveOverlap(
  input: ScoreInput,
  regions: RegionBreakdown[],
  findings: Finding[],
): number {
  const days = input.split.days;
  if (days.length < 2) return 0;
  let penalty = 0;
  const pairs: [number, number][] = [];
  for (let i = 0; i < days.length - 1; i += 1) pairs.push([i, i + 1]);

  const primaryOnDay = (dayIndex: number, region: RegionId) => {
    let sets = 0;
    for (const item of days[dayIndex].exercises) {
      const exercise = getExercise(item.exerciseId);
      const count = item.sets.filter((set) => set.type !== "warmup").length;
      for (const stim of exercise.stimulus) {
        if (stim.region === region && stim.role === "primary") sets += count;
      }
    }
    return sets;
  };

  const heavyRegions: RegionId[] = ["chest_mid", "chest_upper", "quads", "hamstrings", "lats", "erectors"];
  for (const [a, b] of pairs) {
    for (const region of heavyRegions) {
      if (primaryOnDay(a, region) >= 2 && primaryOnDay(b, region) >= 2) {
        penalty += 1.25;
        const row = regions.find((item) => item.region === region);
        findings.push({
          id: `recovery-consecutive-${region}-${days[a].id}`,
          metric: "recovery",
          severity: "warn",
          region,
          title: `${row?.label ?? region} ${regionVerb(region)} trained on back-to-back days`,
          detail: `${days[a].title} and ${days[b].title} both include primary work.`,
          suggestedChange: "Put a rest or an unrelated session between those days.",
        });
      }
    }
  }
  return penalty;
}

export const OVERALL_WEIGHTS = { coverage: 0.4, growth: 0.35, recovery: 0.25 } as const;
/** The overall can't sit more than this far above the weakest metric. */
export const OVERALL_FLOOR_MARGIN = 3;

export function gradeSplit(input: ScoreInput): Grade {
  const regions = buildBreakdown(input);
  const coverage = scoreCoverage(input, regions);
  const growth = scoreGrowth(input, regions);
  const recovery = scoreRecovery(input, regions);

  const raw =
    OVERALL_WEIGHTS.coverage * coverage.score +
    OVERALL_WEIGHTS.growth * growth.score +
    OVERALL_WEIGHTS.recovery * recovery.score;
  const floorCap = Math.min(coverage.score, growth.score, recovery.score) + OVERALL_FLOOR_MARGIN;
  const overall = round1(clamp(Math.min(raw, floorCap), 0, 10));

  return {
    coverage: { score: coverage.score, notes: coverage.notes },
    growth: { score: growth.score, notes: growth.notes, parts: growth.parts },
    recovery: { score: recovery.score, notes: recovery.notes },
    overall,
    regions,
    findings: [...coverage.findings, ...growth.findings, ...recovery.findings],
    flags: {
      usedHistory: Boolean(input.history && input.history.length > 0),
      growthCappedWithoutHistory: growth.capped,
    },
  };
}
