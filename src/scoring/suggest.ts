import { catalogEntries, getExercise } from "./catalog";
import { REGION_META, regionVerb, type RegionId } from "./regions";
import { gradeSplit } from "./score";
import type {
  ExerciseDef,
  Grade,
  PlannedSet,
  RegionBreakdown,
  ScoreInput,
  Split,
} from "./types";

export type ScoreSnapshot = {
  coverage: number;
  growth: number;
  recovery: number;
  overall: number;
};

export type SuggestionKind = "add" | "swap" | "add_sets" | "cut_sets" | "move";

export type Suggestion = {
  id: string;
  kind: SuggestionKind;
  title: string;
  reason: string;
  dayTitle: string;
  region?: RegionId;
  before: ScoreSnapshot;
  after: ScoreSnapshot;
};

export type Plan = {
  steps: Suggestion[];
  start: ScoreSnapshot;
  end: ScoreSnapshot;
};

type Candidate = {
  kind: SuggestionKind;
  key: string;
  split: Split;
  title: string;
  dayTitle: string;
  region?: RegionId;
  reason: string;
};

const MAX_STEPS = 5;
const MIN_GAIN = 0.08;
const MAX_METRIC_DROP = 0.8;
const HEAVY_REGIONS: RegionId[] = ["chest_mid", "chest_upper", "quads", "hamstrings", "lats", "erectors"];
/** Small tie-breaks so a swap or extra sets beat adding a whole new movement at equal gain. */
const KIND_COST: Record<SuggestionKind, number> = {
  add_sets: 0,
  swap: 0,
  cut_sets: 0,
  move: 0.02,
  add: 0.04,
};

export function snapshot(grade: Grade): ScoreSnapshot {
  return {
    coverage: grade.coverage.score,
    growth: grade.growth.score,
    recovery: grade.recovery.score,
    overall: grade.overall,
  };
}

/**
 * No split scores 10/10/10, and chasing one metric usually costs another.
 * Reward the overall, lift the weakest metric, and penalise a lopsided spread.
 */
export function balanceScore(scores: ScoreSnapshot): number {
  const values = [scores.coverage, scores.growth, scores.recovery];
  const min = Math.min(...values);
  const max = Math.max(...values);
  return scores.overall + 0.5 * min - 0.2 * (max - min);
}

function normalSets(count: number): PlannedSet[] {
  return Array.from({ length: count }, () => ({ type: "normal" as const }));
}

function workingCount(sets: PlannedSet[]): number {
  return sets.filter((set) => set.type !== "warmup").length;
}

function primaryRegion(def: ExerciseDef): RegionId | undefined {
  return def.stimulus
    .filter((stim) => stim.role === "primary")
    .sort((a, b) => b.weight - a.weight)[0]?.region;
}

const FATIGUE_RANK: Record<ExerciseDef["fatigue"], number> = { low: 0, moderate: 1, high: 2 };

function optionsFor(region: RegionId): ExerciseDef[] {
  return catalogEntries()
    .filter((def) => primaryRegion(def) === region)
    .sort((a, b) => FATIGUE_RANK[a.fatigue] - FATIGUE_RANK[b.fatigue])
    .slice(0, 2);
}

function label(region: RegionId): string {
  return REGION_META[region].label;
}

function lower(region: RegionId): string {
  return label(region).toLowerCase();
}

function needReason(row: RegionBreakdown): string {
  const name = label(row.region);
  const verb = regionVerb(row.region);
  const range = `${row.targetLow}–${row.targetHigh}`;
  if (row.priority === "lagging" && !row.hasPrimary) {
    return `${name} ${verb} lagging, and nothing in your split trains ${verb === "are" ? "them" : "it"} directly.`;
  }
  if (row.priority === "lagging") {
    return `${name} ${verb} lagging and ${verb === "are" ? "get" : "gets"} ${row.effectiveSets} effective sets a week. Lagging tissue needs about ${range}.`;
  }
  return `${name} ${verb === "are" ? "get" : "gets"} ${row.effectiveSets} effective sets a week, under the ${range} range.`;
}

function targetRegions(grade: Grade): RegionBreakdown[] {
  return grade.regions
    .filter((row) => {
      if (row.priority === "overdeveloped") return false;
      if (row.priority === "lagging") return row.effectiveSets < row.targetHigh || !row.hasPrimary;
      return row.coverageScore < 6.5;
    })
    .sort((a, b) => {
      const lagA = a.priority === "lagging" ? 0 : 1;
      const lagB = b.priority === "lagging" ? 0 : 1;
      return lagA - lagB || a.coverageScore - b.coverageScore;
    })
    .slice(0, 4);
}

function surplusRegions(grade: Grade): RegionBreakdown[] {
  return grade.regions.filter(
    (row) =>
      row.effectiveSets > row.mrv ||
      (row.priority === "overdeveloped" && row.effectiveSets > row.targetHigh),
  );
}

function primarySetsOnDay(split: Split, dayIndex: number, region: RegionId): number {
  let total = 0;
  for (const item of split.days[dayIndex].exercises) {
    const def = getExercise(item.exerciseId);
    if (def.stimulus.some((stim) => stim.region === region && stim.role === "primary")) {
      total += workingCount(item.sets);
    }
  }
  return total;
}

function dayGroups(split: Split, dayIndex: number): Set<string> {
  const groups = new Set<string>();
  for (const item of split.days[dayIndex].exercises) {
    const primary = primaryRegion(getExercise(item.exerciseId));
    if (primary) groups.add(REGION_META[primary].group);
  }
  return groups;
}

const RELATED_GROUPS: Record<string, string[]> = {
  chest: ["delts", "arms"],
  back: ["arm_flexors"],
  delts: ["chest", "back"],
  arm_flexors: ["back"],
  arms: ["chest", "delts"],
  legs: ["core"],
  core: ["legs"],
};

/**
 * New movements go on a day that already trains that muscle group, then on a
 * day that trains a related one (curls on pull day), and only then anywhere.
 */
function hostsGroup(split: Split, dayIndex: number, region: RegionId): boolean {
  const group = REGION_META[region].group;
  for (const allowed of [[group], RELATED_GROUPS[group] ?? []]) {
    const hosts = split.days
      .map((_, index) => index)
      .filter((index) => allowed.some((name) => dayGroups(split, index).has(name)));
    if (hosts.length > 0) return hosts.includes(dayIndex);
  }
  return true;
}

function dayHas(split: Split, dayIndex: number, exerciseId: string): boolean {
  return split.days[dayIndex].exercises.some((item) => item.exerciseId === exerciseId);
}

function candidates(split: Split, grade: Grade): Candidate[] {
  const out: Candidate[] = [];
  const targets = targetRegions(grade);
  const targetSet = new Set(targets.map((row) => row.region));

  split.days.forEach((day, dayIndex) => {
    day.exercises.forEach((item, itemIndex) => {
      const def = getExercise(item.exerciseId);
      const primary = primaryRegion(def);
      const count = workingCount(item.sets);

      if (primary && targetSet.has(primary)) {
        const row = targets.find((target) => target.region === primary)!;
        const next = structuredClone(split);
        next.days[dayIndex].exercises[itemIndex].sets.push(...normalSets(2));
        out.push({
          kind: "add_sets",
          key: `${day.id}:${item.exerciseId}`,
          split: next,
          title: `Add 2 sets of ${def.name} on ${day.title}`,
          dayTitle: day.title,
          region: primary,
          reason: `${needReason(row)} You already do ${def.name}, so this is the cheapest fix.`,
        });
      }

      if (primary) {
        for (const row of targets) {
          if (row.region === primary) continue;
          if (REGION_META[row.region].group !== REGION_META[primary].group) continue;
          if (targetSet.has(primary) && grade.regions.find((r) => r.region === primary)?.priority === "lagging") {
            continue;
          }
          for (const option of optionsFor(row.region)) {
            if (Math.abs(FATIGUE_RANK[option.fatigue] - FATIGUE_RANK[def.fatigue]) > 1) continue;
            if (dayHas(split, dayIndex, option.id)) continue;
            const next = structuredClone(split);
            next.days[dayIndex].exercises[itemIndex] = {
              exerciseId: option.id,
              sets: normalSets(Math.max(count, 2)),
            };
            out.push({
              kind: "swap",
              key: `${day.id}:${item.exerciseId}`,
              split: next,
              title: `Swap ${def.name} for ${option.name} on ${day.title}`,
              dayTitle: day.title,
              region: row.region,
              reason: `${needReason(row)} ${def.name} is hitting ${lower(primary)} instead. Same ${count} sets, same session length, aimed at the part that's behind.`,
            });
          }
        }
      }
    });

    for (const row of targets) {
      if (primarySetsOnDay(split, dayIndex, row.region) > 0) continue;
      if (!hostsGroup(split, dayIndex, row.region)) continue;
      for (const option of optionsFor(row.region)) {
        if (dayHas(split, dayIndex, option.id)) continue;
        const next = structuredClone(split);
        next.days[dayIndex].exercises.push({ exerciseId: option.id, sets: normalSets(3) });
        out.push({
          kind: "add",
          key: `${day.id}:${option.id}`,
          split: next,
          title: `Add ${option.name} (3 sets) to ${day.title}`,
          dayTitle: day.title,
          region: row.region,
          reason: needReason(row),
        });
      }
    }
  });

  for (const row of surplusRegions(grade)) {
    split.days.forEach((day, dayIndex) => {
      day.exercises.forEach((item, itemIndex) => {
        const def = getExercise(item.exerciseId);
        if (primaryRegion(def) !== row.region) return;
        const count = workingCount(item.sets);
        if (count < 3) return;
        const next = structuredClone(split);
        const sets = next.days[dayIndex].exercises[itemIndex].sets;
        const lastWorking = sets.map((set) => set.type).lastIndexOf("normal");
        sets.splice(lastWorking >= 0 ? lastWorking : sets.length - 1, 1);
        const why =
          row.effectiveSets > row.mrv
            ? `${label(row.region)} ${regionVerb(row.region) === "are" ? "get" : "gets"} ${row.effectiveSets} effective sets a week, past what you can recover from (about ${row.mrv}).`
            : `${label(row.region)} already ${regionVerb(row.region) === "are" ? "look" : "looks"} ahead of the rest of your physique, so these sets are better spent elsewhere.`;
        out.push({
          kind: "cut_sets",
          key: `${day.id}:${item.exerciseId}`,
          split: next,
          title: `Cut ${def.name} on ${day.title} from ${count} to ${count - 1} sets`,
          dayTitle: day.title,
          region: row.region,
          reason: why,
        });
      });
    });
  }

  for (let a = 0; a < split.days.length - 1; a += 1) {
    const b = a + 1;
    for (const region of HEAVY_REGIONS) {
      if (primarySetsOnDay(split, a, region) < 2 || primarySetsOnDay(split, b, region) < 2) continue;
      split.days[b].exercises.forEach((item, itemIndex) => {
        const def = getExercise(item.exerciseId);
        if (primaryRegion(def) !== region) return;
        split.days.forEach((target, targetIndex) => {
          if (Math.abs(targetIndex - b) <= 1) return;
          const next = structuredClone(split);
          const [moved] = next.days[b].exercises.splice(itemIndex, 1);
          next.days[targetIndex].exercises.push(moved);
          out.push({
            kind: "move",
            key: `${split.days[b].id}:${item.exerciseId}`,
            split: next,
            title: `Move ${def.name} from ${split.days[b].title} to ${target.title}`,
            dayTitle: split.days[b].title,
            region,
            reason: `${split.days[a].title} and ${split.days[b].title} both train ${lower(region)} hard on back-to-back days. Moving it gives that tissue time to recover before you load it again.`,
          });
        });
      });
    }
  }

  return out;
}

/**
 * Greedy plan: apply the single change that best improves the balance score,
 * re-grade, repeat. Stops when the next change isn't worth it, so the plan
 * lands on this lifter's best middle ground rather than maxing one metric.
 */
export function buildPlan(input: ScoreInput, maxSteps = MAX_STEPS): Plan {
  let split = structuredClone(input.split);
  let grade = gradeSplit({ ...input, split });
  const start = snapshot(grade);
  const steps: Suggestion[] = [];
  const touched = new Set<string>();
  // One growth change per muscle per day; stacking a second reads as redundant.
  const aimed = new Set<string>();
  const aimKey = (candidate: Candidate) =>
    candidate.kind === "add" || candidate.kind === "swap" || candidate.kind === "add_sets"
      ? `${candidate.dayTitle}:${candidate.region}`
      : undefined;

  for (let step = 0; step < maxSteps; step += 1) {
    const before = snapshot(grade);
    const baseBalance = balanceScore(before);
    let best: { candidate: Candidate; grade: Grade; gain: number } | undefined;

    for (const candidate of candidates(split, grade)) {
      if (touched.has(candidate.key)) continue;
      const aim = aimKey(candidate);
      if (aim && aimed.has(aim)) continue;
      const nextGrade = gradeSplit({ ...input, split: candidate.split });
      const after = snapshot(nextGrade);
      const dropped = (["coverage", "growth", "recovery"] as const).some(
        (metric) => before[metric] - after[metric] > MAX_METRIC_DROP,
      );
      if (dropped) continue;
      const gain = balanceScore(after) - baseBalance - KIND_COST[candidate.kind];
      if (gain < MIN_GAIN) continue;
      if (!best || gain > best.gain) best = { candidate, grade: nextGrade, gain };
    }

    if (!best) break;
    touched.add(best.candidate.key);
    const aim = aimKey(best.candidate);
    if (aim) aimed.add(aim);
    split = best.candidate.split;
    grade = best.grade;
    steps.push({
      id: `${best.candidate.kind}-${best.candidate.key}-${step}`,
      kind: best.candidate.kind,
      title: best.candidate.title,
      reason: best.candidate.reason,
      dayTitle: best.candidate.dayTitle,
      region: best.candidate.region,
      before,
      after: snapshot(grade),
    });
  }

  return { steps, start, end: snapshot(grade) };
}
