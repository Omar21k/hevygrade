import { readSessionJson, removeSessionKeys, writeSessionJson } from "@/lib/sessionStore";
import type { PhysiqueAssessment, PhysiqueView } from "@/physique/types";
import { lagMapFromPhysique } from "@/physique/lagMap";
import type { Finding, LagMap, RegionId } from "@/scoring";

export type PhysiqueResult = {
  status: "graded" | "skipped";
  lagMap: LagMap;
  findings: Finding[];
  assessment?: PhysiqueAssessment;
  /** Regions lagging only because they trail this physique's own average. */
  weakPoints?: RegionId[];
  views: PhysiqueView[];
};

/**
 * Re-derives the lag map from the saved assessment, so reads saved under older
 * rules pick up the current ones without uploading photos again.
 */
export function withCurrentLagRules(physique: PhysiqueResult | null): PhysiqueResult | null {
  if (!physique || physique.status !== "graded" || !physique.assessment) return physique;
  const { lagMap, findings, weakPoints } = lagMapFromPhysique(physique.assessment);
  return { ...physique, lagMap, findings, weakPoints };
}

export type PlanChoices = {
  selected: string[];
  dismissed: string[];
};

const PHYSIQUE_KEY = "hevygrade.physique";
const OVERRIDES_KEY = "hevygrade.lagOverrides";
const PLAN_KEY = "hevygrade.planChoices";
const REVEAL_KEY = "hevygrade.revealSeen";
const NO_OVERRIDES: LagMap = Object.freeze({});
export const NO_CHOICES: PlanChoices = Object.freeze({ selected: [], dismissed: [] }) as PlanChoices;

export function loadPhysique(): PhysiqueResult | null {
  return readSessionJson<PhysiqueResult>(PHYSIQUE_KEY);
}

export function savePhysique(result: PhysiqueResult) {
  writeSessionJson(PHYSIQUE_KEY, result);
}

export function clearPhysique() {
  removeSessionKeys(PHYSIQUE_KEY, OVERRIDES_KEY);
}

export function loadLagOverrides(): LagMap {
  return readSessionJson<LagMap>(OVERRIDES_KEY) ?? NO_OVERRIDES;
}

export function saveLagOverrides(overrides: LagMap) {
  writeSessionJson(OVERRIDES_KEY, overrides);
}

export function loadPlanChoices(): PlanChoices {
  return readSessionJson<PlanChoices>(PLAN_KEY) ?? NO_CHOICES;
}

export function savePlanChoices(choices: PlanChoices) {
  writeSessionJson(PLAN_KEY, choices);
}

export function loadRevealSeen(): boolean {
  return readSessionJson<boolean>(REVEAL_KEY) ?? false;
}

export function markRevealSeen() {
  writeSessionJson(REVEAL_KEY, true);
}

/** Inputs changed, so the old reveal, selections and goal edits no longer describe this report. */
export function resetReportProgress() {
  removeSessionKeys(PLAN_KEY, REVEAL_KEY);
}
