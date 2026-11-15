export const REGION_IDS = [
  "chest_upper",
  "chest_mid",
  "chest_lower",
  "lats",
  "upper_back",
  "traps",
  "erectors",
  "delt_front",
  "delt_side",
  "delt_rear",
  "biceps",
  "brachialis",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs",
] as const;

export type RegionId = (typeof REGION_IDS)[number];

export type RegionPriority = "lagging" | "maintain" | "overdeveloped";

/** Weekly working-set landmarks (effective sets). Lagging regions shift toward the high end. */
export type VolumeLandmarks = {
  mev: number;
  mavLow: number;
  mavHigh: number;
  mrv: number;
};

export const REGION_META: Record<
  RegionId,
  { label: string; group: string; landmarks: VolumeLandmarks }
> = {
  chest_upper: {
    label: "Upper chest",
    group: "chest",
    landmarks: { mev: 6, mavLow: 8, mavHigh: 14, mrv: 20 },
  },
  chest_mid: {
    label: "Mid chest",
    group: "chest",
    landmarks: { mev: 6, mavLow: 10, mavHigh: 16, mrv: 22 },
  },
  chest_lower: {
    label: "Lower chest",
    group: "chest",
    landmarks: { mev: 4, mavLow: 6, mavHigh: 12, mrv: 18 },
  },
  lats: {
    label: "Lats",
    group: "back",
    landmarks: { mev: 8, mavLow: 10, mavHigh: 18, mrv: 24 },
  },
  upper_back: {
    label: "Upper back",
    group: "back",
    landmarks: { mev: 8, mavLow: 10, mavHigh: 16, mrv: 22 },
  },
  traps: {
    label: "Traps",
    group: "back",
    landmarks: { mev: 4, mavLow: 6, mavHigh: 12, mrv: 18 },
  },
  erectors: {
    label: "Spinal erectors",
    group: "back",
    landmarks: { mev: 4, mavLow: 6, mavHigh: 10, mrv: 16 },
  },
  delt_front: {
    label: "Front delts",
    group: "delts",
    landmarks: { mev: 4, mavLow: 6, mavHigh: 12, mrv: 18 },
  },
  delt_side: {
    label: "Side delts",
    group: "delts",
    landmarks: { mev: 8, mavLow: 10, mavHigh: 18, mrv: 26 },
  },
  delt_rear: {
    label: "Rear delts",
    group: "delts",
    landmarks: { mev: 6, mavLow: 8, mavHigh: 14, mrv: 20 },
  },
  biceps: {
    label: "Biceps",
    group: "arm_flexors",
    landmarks: { mev: 6, mavLow: 8, mavHigh: 14, mrv: 20 },
  },
  brachialis: {
    label: "Brachialis / front-arm thickness",
    group: "arm_flexors",
    landmarks: { mev: 4, mavLow: 6, mavHigh: 12, mrv: 18 },
  },
  triceps: {
    label: "Triceps",
    group: "arms",
    landmarks: { mev: 6, mavLow: 8, mavHigh: 16, mrv: 22 },
  },
  forearms: {
    label: "Forearms",
    group: "arm_flexors",
    landmarks: { mev: 4, mavLow: 6, mavHigh: 12, mrv: 20 },
  },
  quads: {
    label: "Quads",
    group: "legs",
    landmarks: { mev: 8, mavLow: 10, mavHigh: 18, mrv: 24 },
  },
  hamstrings: {
    label: "Hamstrings",
    group: "legs",
    landmarks: { mev: 6, mavLow: 8, mavHigh: 14, mrv: 20 },
  },
  glutes: {
    label: "Glutes",
    group: "legs",
    landmarks: { mev: 6, mavLow: 8, mavHigh: 16, mrv: 22 },
  },
  calves: {
    label: "Calves",
    group: "legs",
    landmarks: { mev: 6, mavLow: 8, mavHigh: 16, mrv: 24 },
  },
  abs: {
    label: "Abs",
    group: "core",
    landmarks: { mev: 4, mavLow: 6, mavHigh: 12, mrv: 20 },
  },
};

/** Always graded for a balanced-physique split, even with zero volume. */
export const MAJOR_PHYSIQUE_REGIONS: RegionId[] = [
  "chest_upper",
  "chest_mid",
  "lats",
  "upper_back",
  "delt_side",
  "delt_rear",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
];

/**
 * Muscles many male lifters rarely train directly and usually don't want called
 * out in photo-led feedback unless the read is unmistakable.
 */
export const LOW_AESTHETIC_PRIORITY_REGIONS: RegionId[] = ["glutes", "calves", "forearms"];

export function aestheticFeedbackWeight(region: RegionId): number {
  if (LOW_AESTHETIC_PRIORITY_REGIONS.includes(region)) return 0.25;
  if (MAJOR_PHYSIQUE_REGIONS.includes(region)) return 1;
  return 0.65;
}

/** Coverage and growth weight. Low-priority muscles barely move the score. */
export function regionScoreWeight(region: RegionId, priority: RegionPriority | undefined): number {
  return priorityWeight(priority) * aestheticFeedbackWeight(region);
}

export function targetsFor(
  region: RegionId,
  priority: RegionPriority | undefined,
): { low: number; high: number; mrv: number; mev: number } {
  const { mev, mavLow, mavHigh, mrv } = REGION_META[region].landmarks;
  if (priority === "lagging") {
    return {
      mev,
      low: mavLow + 4,
      high: Math.min(mavHigh + 4, mrv - 1),
      mrv,
    };
  }
  if (priority === "overdeveloped") {
    return { mev, low: mev, high: mev + 4, mrv };
  }
  return { mev, low: mavLow, high: mavHigh, mrv };
}

const PLURAL_REGIONS = new Set<RegionId>([
  "lats",
  "traps",
  "erectors",
  "delt_front",
  "delt_side",
  "delt_rear",
  "biceps",
  "triceps",
  "forearms",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "abs",
]);

export function regionVerb(region: RegionId): "is" | "are" {
  return PLURAL_REGIONS.has(region) ? "are" : "is";
}

export function priorityWeight(priority: RegionPriority | undefined): number {
  if (priority === "lagging") return 3;
  if (priority === "overdeveloped") return 0.35;
  return 1;
}
