import type { RegionId } from "@/scoring/regions";
import { REGION_IDS } from "@/scoring/regions";

export const PHYSIQUE_VIEWS = ["front", "side", "back"] as const;
export type PhysiqueView = (typeof PHYSIQUE_VIEWS)[number];

/** 1 = clearly underdeveloped vs the rest of this physique, 5 = dominant. */
export type RegionDevelopment = {
  region: RegionId;
  development: number;
  confidence: number;
  note?: string;
};

/** Something that already looks good in the photos, written by the vision model. */
export type PhysiqueStrength = {
  /** Short, second person, e.g. "Those side delts are capped." */
  title: string;
  /** What in the photo shows it. */
  detail: string;
  /** Empty for whole-physique strengths like taper or symmetry. */
  regions: RegionId[];
  view?: PhysiqueView;
};

export type PhysiqueAssessment = {
  viewsPresent: PhysiqueView[];
  developments: RegionDevelopment[];
  /** Missing on reads saved before strengths were added. */
  strengths?: PhysiqueStrength[];
  blindSpots: string[];
  notes: string[];
};

export function isRegionId(value: string): value is RegionId {
  return (REGION_IDS as readonly string[]).includes(value);
}
