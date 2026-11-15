import { readSessionJson, removeSessionKeys, writeSessionJson } from "@/lib/sessionStore";
import type { PhysiqueAssessment, PhysiqueView } from "@/physique/types";
import type { Finding, LagMap } from "@/scoring";

export type PhysiqueResult = {
  status: "graded" | "skipped";
  lagMap: LagMap;
  findings: Finding[];
  assessment?: PhysiqueAssessment;
  views: PhysiqueView[];
};

const PHYSIQUE_KEY = "hevygrade.physique";
const OVERRIDES_KEY = "hevygrade.lagOverrides";
const NO_OVERRIDES: LagMap = Object.freeze({});

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
