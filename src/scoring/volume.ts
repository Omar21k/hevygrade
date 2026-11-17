import { getExercise } from "./catalog";
import {
  MAJOR_PHYSIQUE_REGIONS,
  REGION_IDS,
  REGION_META,
  targetsFor,
  type RegionId,
} from "./regions";
import { perWeekOf } from "./logged";
import { round1 } from "./math";
import type { LagMap, PlannedSet, Split } from "./types";

export function isWorkingSet(set: PlannedSet): boolean {
  return set.type !== "warmup";
}

export type RegionVolume = {
  region: RegionId;
  effectiveSets: number;
  primarySets: number;
  frequency: number;
  hasPrimary: boolean;
  planes: Set<string>;
  /** Days that hit the region; frequency is how many times a week those happen. */
  dayIds: string[];
};

export function analyzeVolume(split: Split, lagMap: LagMap) {
  const byRegion = new Map<RegionId, RegionVolume>();

  const ensure = (region: RegionId): RegionVolume => {
    const existing = byRegion.get(region);
    if (existing) return existing;
    const created: RegionVolume = {
      region,
      effectiveSets: 0,
      primarySets: 0,
      frequency: 0,
      hasPrimary: false,
      planes: new Set(),
      dayIds: [],
    };
    byRegion.set(region, created);
    return created;
  };

  const sessionWorkingSets: {
    dayId: string;
    title: string;
    workingSets: number;
    highFatigue: number;
    perWeek: number;
  }[] = [];
  const frequency = new Map<RegionId, number>();

  for (const day of split.days) {
    // Volume is per week, so each day counts as often as it's actually done.
    const perWeek = perWeekOf(day);
    if (perWeek <= 0) continue;
    const dayRegions = new Set<RegionId>();
    let workingSets = 0;
    let highFatigue = 0;

    for (const item of day.exercises) {
      const exercise = getExercise(item.exerciseId);
      const count = item.sets.filter(isWorkingSet).length;
      workingSets += count;
      if (exercise.fatigue === "high") highFatigue += count;

      for (const stim of exercise.stimulus) {
        const row = ensure(stim.region);
        row.effectiveSets += count * stim.weight * perWeek;
        if (stim.role === "primary") {
          row.primarySets += count * perWeek;
          row.hasPrimary = row.hasPrimary || count > 0;
        }
        if (stim.plane) row.planes.add(stim.plane);
        if (count * stim.weight >= 0.5) {
          dayRegions.add(stim.region);
        }
      }
    }

    for (const region of dayRegions) {
      const row = ensure(region);
      if (!row.dayIds.includes(day.id)) {
        row.dayIds.push(day.id);
        frequency.set(region, (frequency.get(region) ?? 0) + perWeek);
      }
    }

    sessionWorkingSets.push({
      dayId: day.id,
      title: day.title,
      workingSets,
      highFatigue,
      perWeek,
    });
  }

  for (const row of byRegion.values()) {
    row.frequency = round1(frequency.get(row.region) ?? 0);
  }

  const scoredRegions = new Set<RegionId>([
    ...MAJOR_PHYSIQUE_REGIONS,
    ...(Object.keys(lagMap) as RegionId[]),
    ...byRegion.keys(),
  ]);

  return {
    byRegion,
    scoredRegions: REGION_IDS.filter((id) => scoredRegions.has(id)),
    sessionWorkingSets,
    weeklyWorkingSets: sessionWorkingSets.reduce(
      (sum, session) => sum + session.workingSets * session.perWeek,
      0,
    ),
  };
}

export function regionTargets(region: RegionId, lagMap: LagMap) {
  return targetsFor(region, lagMap[region]);
}

export function regionLabel(region: RegionId): string {
  return REGION_META[region].label;
}
