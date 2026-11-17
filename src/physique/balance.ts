import { aestheticFeedbackWeight, MAJOR_PHYSIQUE_REGIONS, type RegionId } from "@/scoring/regions";
import type { PhysiqueAssessment } from "./types";

/** Reads below this confidence don't count toward balance. */
const MIN_CONFIDENCE = 0.45;
/** Front/side/back photos show these poorly, so they only count when the read is confident. */
const HARD_TO_SEE = new Set<RegionId>(["traps", "erectors", "forearms", "abs"]);
const HARD_TO_SEE_CONFIDENCE = 0.7;
/** Points off per development point under your own average, across the physique and for the worst major muscle. */
const MEAN_GAP_PENALTY = 2.5;
const WORST_MAJOR_GAP_PENALTY = 1.5;

export type PhysiqueBalance = {
  /** 0–10. 10 means nothing visibly trails the rest of your physique. */
  score: number;
  /** Average development of the muscles that counted (1–5). */
  average: number;
  /** Largest gap under that average among lats, chest, shoulders, arms and legs. */
  worst?: { region: RegionId; development: number; gap: number };
  /** Development (1–5) per muscle that counted. */
  developments: Partial<Record<RegionId, number>>;
};

/**
 * How even the physique looks, from the photo read alone. Muscles that trail
 * your own average cost points, big visible ones most, and the single worst
 * major muscle costs extra so one clear lag isn't averaged away. This is where
 * you are now; it only moves with new photos.
 */
export function physiqueBalance(assessment: PhysiqueAssessment): PhysiqueBalance | null {
  const usable = assessment.developments.filter(
    (row) =>
      Number.isFinite(row.development) &&
      row.development >= 1 &&
      row.development <= 5 &&
      row.confidence >= (HARD_TO_SEE.has(row.region) ? HARD_TO_SEE_CONFIDENCE : MIN_CONFIDENCE),
  );
  if (usable.length < 3) return null;

  const weightOf = (region: RegionId) => aestheticFeedbackWeight(region);
  const totalWeight = usable.reduce((sum, row) => sum + weightOf(row.region), 0);
  const average = usable.reduce((sum, row) => sum + row.development * weightOf(row.region), 0) / totalWeight;
  const meanGap =
    usable.reduce((sum, row) => sum + Math.max(0, average - row.development) * weightOf(row.region), 0) / totalWeight;

  let worst: PhysiqueBalance["worst"];
  for (const row of usable) {
    if (!MAJOR_PHYSIQUE_REGIONS.includes(row.region)) continue;
    const gap = average - row.development;
    if (gap > 0 && (!worst || gap > worst.gap)) worst = { region: row.region, development: row.development, gap };
  }

  const raw = 10 - MEAN_GAP_PENALTY * meanGap - WORST_MAJOR_GAP_PENALTY * (worst?.gap ?? 0);
  return {
    score: Math.round(Math.min(10, Math.max(0, raw)) * 10) / 10,
    average: Math.round(average * 10) / 10,
    worst: worst ? { ...worst, gap: Math.round(worst.gap * 10) / 10 } : undefined,
    developments: Object.fromEntries(usable.map((row) => [row.region, row.development])),
  };
}
