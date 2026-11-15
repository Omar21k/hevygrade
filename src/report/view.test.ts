import type { HevyPayload } from "@/hevy/session";
import { lagMapFromPhysique } from "@/physique/lagMap";
import type { PhysiqueAssessment } from "@/physique/types";
import { fixtures, REGION_IDS, type LagMap, type RegionId } from "@/scoring";
import { describe, expect, it } from "vitest";
import type { PhysiqueResult } from "./state";
import { buildReport, focusRegions, needsAttention, strengthLines } from "./view";

const split = fixtures.laggingUpperChest;
const hevy: HevyPayload = {
  user: { name: "Test" },
  split,
  exercises: [],
  history: [],
  unmatched: [],
  days: split.days.map((day) => ({ id: day.id, title: day.title, movements: day.exercises.length })),
  workoutCount: 0,
};

/** Photos read chosen regions as clearly behind; everything else even. */
function photosFlagging(behind: RegionId[]): PhysiqueResult {
  const assessment: PhysiqueAssessment = {
    viewsPresent: ["front", "side", "back"],
    developments: REGION_IDS.map((region) => ({
      region,
      development: behind.includes(region) ? 2 : 3.5,
      confidence: 0.85,
    })),
    blindSpots: [],
    notes: [],
  };
  const { lagMap, findings } = lagMapFromPhysique(assessment);
  return { status: "graded", lagMap, findings, assessment, views: ["front", "side", "back"] };
}

function report(physique: PhysiqueResult | null, overrides: LagMap = {}) {
  const lagMap = { ...(physique?.lagMap ?? {}), ...overrides };
  return buildReport({ hevy, split, lagMap, physique, overrides });
}

describe("combined photo + training read", () => {
  const physique = photosFlagging(["lats", "glutes"]);
  const { regions, stories, recommendations } = report(physique);
  const byId = (id: RegionId) => regions.find((row) => row.id === id)!;

  it("judges each muscle on both signals", () => {
    expect(byId("lats").verdict).toBe("both");
    expect(byId("lats").assessment).toMatch(/behind in your photos.*Hevy/i);
    const trainingOnly = regions.filter((row) => row.verdict === "training-gap");
    expect(trainingOnly.length).toBeGreaterThan(0);
    for (const row of trainingOnly) expect(row.assessment).toMatch(/photos|Hevy|routines/i);
  });

  it("praises muscles the photos score as strong, and skips ones they score as behind", () => {
    const withDelts = photosFlagging(["lats"]);
    withDelts.assessment!.developments = withDelts.assessment!.developments.map((row) =>
      row.region === "delt_side" ? { ...row, development: 4.6 } : row,
    );
    const text = strengthLines(withDelts).join(" ");
    expect(text).toBe("Delts look full and strong.");
    expect(text.toLowerCase()).not.toContain("lats");
    expect(text.toLowerCase()).not.toMatch(/sets|week|routine/);
  });

  it("says what's lacking is the photo muscle, and does not mention glutes or training-only gaps", () => {
    const takeaway = stories.coverage.takeaway.toLowerCase();
    expect(takeaway).toMatch(/photos show.*lats/);
    expect(takeaway).not.toContain("glutes");
    expect(takeaway).not.toContain("abs");
    expect(focusRegions(regions, 10).map((row) => row.id)).toEqual(["lats"]);
    expect(recommendations.every((rec) => !rec.region || rec.region === "lats")).toBe(true);
  });

  it("leads the plan with a muscle both signals agree on", () => {
    const targeted = recommendations.find((rec) => rec.region && needsAttention(byId(rec.region)));
    expect(targeted).toBeDefined();
    const bothRecs = recommendations.filter((rec) => rec.region && byId(rec.region).verdict === "both");
    if (bothRecs.length > 0) expect(recommendations[0].region && byId(recommendations[0].region).verdict).toBe("both");
    for (const rec of bothRecs) expect(rec.why).toMatch(/behind in your photos/);
  });

  it("doesn't call a low-confidence hard-to-see read in line", () => {
    const shaky = photosFlagging(["traps"]);
    shaky.assessment!.developments = shaky.assessment!.developments.map((row) =>
      row.region === "traps" ? { ...row, confidence: 0.55 } : row,
    );
    const rerun = lagMapFromPhysique(shaky.assessment!);
    const traps = report({ ...shaky, lagMap: rerun.lagMap }).regions.find((row) => row.id === "traps")!;
    expect(traps.photo).toMatchObject({ kind: "seen", relation: "possibly-behind" });
    expect(traps.assessment).not.toMatch(/in line/);
  });

  it("uses your goal as the signal when you set one", () => {
    const traps = report(physique, { traps: "maintain" }).regions.find((row) => row.id === "traps")!;
    expect(traps.goalSource).toBe("you");
    expect(traps.assessment).toMatch(/You set traps to maintain/);
  });
});
