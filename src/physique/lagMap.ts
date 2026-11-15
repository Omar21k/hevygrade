import type { Finding, LagMap } from "@/scoring/types";
import { REGION_META, regionVerb, type RegionId } from "@/scoring/regions";
import type { PhysiqueAssessment, RegionDevelopment } from "./types";

function mean(values: number[]): number {
  if (values.length === 0) return 3;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Turns a physique reading into the lag map the split grader consumes.
 * Relative underdevelopment beats absolute "looks small" — a 3 is lagging
 * if everything else is a 4.5. Missing/low-confidence regions stay untagged.
 */
export function lagMapFromPhysique(assessment: PhysiqueAssessment): {
  lagMap: LagMap;
  findings: Finding[];
} {
  const usable = assessment.developments.filter(
    (row) =>
      row.confidence >= 0.45 &&
      Number.isFinite(row.development) &&
      row.development >= 1 &&
      row.development <= 5,
  );

  const baseline = mean(usable.map((row) => row.development));
  const lagMap: LagMap = {};
  const findings: Finding[] = [];

  for (const row of usable) {
    const relative = row.development - baseline;
    let priority: LagMap[RegionId] | undefined;
    if (row.development <= 2.2 || relative <= -0.7) priority = "lagging";
    else if (row.development >= 4.3 && relative >= 0.8) priority = "overdeveloped";
    else priority = "maintain";

    lagMap[row.region] = priority;

    if (priority === "lagging") {
      findings.push({
        id: `physique-lag-${row.region}`,
        metric: "coverage",
        severity: row.development <= 2 ? "blocker" : "warn",
        region: row.region,
        title: `${REGION_META[row.region].label} ${regionVerb(row.region)} lagging in your photos`,
        detail:
          row.note?.trim() ||
          `Development ${row.development.toFixed(1)}/5 vs physique baseline ${baseline.toFixed(1)}. The split will be scored against this lag, not generic muscle coverage.`,
        suggestedChange: `Prioritize primary weekly volume for ${REGION_META[row.region].label.toLowerCase()}.`,
      });
    }
  }

  if (assessment.blindSpots.length > 0) {
    findings.push({
      id: "physique-blind-spots",
      metric: "coverage",
      severity: "info",
      title: "Some regions could not be graded from these photos",
      detail: assessment.blindSpots.join(" "),
    });
  }

  return { lagMap, findings };
}

export function mergeAssessments(rows: RegionDevelopment[]): RegionDevelopment[] {
  const byRegion = new Map<RegionId, RegionDevelopment[]>();
  for (const row of rows) {
    const list = byRegion.get(row.region) ?? [];
    list.push(row);
    byRegion.set(row.region, list);
  }
  return [...byRegion.entries()].map(([region, group]) => {
    const weight = group.reduce((sum, row) => sum + row.confidence, 0) || 1;
    const development =
      group.reduce((sum, row) => sum + row.development * row.confidence, 0) / weight;
    const confidence = Math.max(...group.map((row) => row.confidence));
    const note = group
      .map((row) => row.note)
      .filter(Boolean)
      .join(" ");
    return { region, development, confidence, note: note || undefined };
  });
}
