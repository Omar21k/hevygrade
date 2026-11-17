import type { HevyPayload } from "@/hevy/session";
import { lagMapFromPhysique } from "@/physique/lagMap";
import type { PhysiqueAssessment } from "@/physique/types";
import { fixtures, REGION_IDS, type LagMap, type RegionId } from "@/scoring";
import { describe, expect, it } from "vitest";
import type { PhysiqueResult } from "./state";
import { targetsFor } from "@/scoring/regions";
import { getExercise } from "@/scoring/catalog";
import { buildReport, focusRegions, needsAttention, strengthReveal } from "./view";

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
    // Lats already get a normal amount of work in this split, so the gap is response, not effort.
    expect(byId("lats").summary).toBe("Behind in photos · needs more than average");
    expect(byId("lats").assessment).toMatch(/behind in your photos.*normal amount.*natural strengths/i);
    const trainingOnly = regions.filter((row) => row.verdict === "training-gap");
    expect(trainingOnly.length).toBeGreaterThan(0);
    for (const row of trainingOnly) expect(row.assessment).toMatch(/photos|Hevy|routines/i);
  });

  it("falls back to region praise for older reads, skipping muscles the photos score as behind", () => {
    const withDelts = photosFlagging(["lats"]);
    withDelts.assessment!.developments = withDelts.assessment!.developments.map((row) =>
      row.region === "delt_side" ? { ...row, development: 4.6 } : row,
    );
    const reveal = strengthReveal(withDelts);
    expect(reveal.kind).toBe("cards");
    const text = reveal.kind === "cards" ? reveal.cards.map((card) => card.title).join(" ") : "";
    expect(text).toBe("Delts look full and strong.");
    expect(text.toLowerCase()).not.toContain("lats");
    expect(text.toLowerCase()).not.toMatch(/sets|week|routine/);
  });

  it("shows every written strength except ones about a lagging or low-graded muscle", () => {
    const graded = photosFlagging(["lats"]);
    graded.assessment!.developments = graded.assessment!.developments.map((row) =>
      row.region === "biceps" ? { ...row, development: 2.6 } : row,
    );
    graded.assessment!.strengths = [
      { title: "Your side delts are carrying this photo.", detail: "Wide caps in the front shot.", regions: ["delt_side"], view: "front" },
      { title: "That taper is real.", detail: "Shoulders to waist from the back.", regions: [], view: "back" },
      { title: "Lats for days.", detail: "Wide from the back.", regions: ["lats"], view: "back" },
      { title: "Biceps peak.", detail: "From the front.", regions: ["biceps"], view: "front" },
      { title: "Quads have sweep.", detail: "Outer quad from the front.", regions: ["quads"] },
    ];
    const reveal = strengthReveal(graded);
    expect(reveal.kind).toBe("cards");
    if (reveal.kind !== "cards") return;
    expect(reveal.cards.map((card) => card.title)).toEqual([
      "Your side delts are carrying this photo.",
      "That taper is real.",
      "Quads have sweep.",
    ]);
    expect(reveal.cards[0].tag).toBe("Side delts · Front photo");
    expect(reveal.cards[1].tag).toBe("Back photo");
  });

  it("says so when the read found no strengths, and when there were no photos", () => {
    const none = photosFlagging([]);
    none.assessment!.strengths = [];
    expect(strengthReveal(none)).toMatchObject({ kind: "message", message: expect.stringMatching(/Nothing/) });
    expect(strengthReveal(null)).toMatchObject({ kind: "message", message: expect.stringMatching(/No photos/) });
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

describe("muscles that look behind despite the volume", () => {
  // A muscle this split already trains past the normal target.
  const trainedHard = report(null).regions.find(
    (row) =>
      !["glutes", "calves", "forearms", "traps", "erectors", "abs"].includes(row.id) &&
      row.effectiveSets >= targetsFor(row.id, "maintain").low &&
      row.effectiveSets < targetsFor(row.id, "lagging").high,
  );

  it("has a well-trained muscle in the fixture to test with", () => {
    expect(trainedHard).toBeDefined();
  });

  it("gets more volume first, never a 'train harder' card", () => {
    const { regions, recommendations, stories } = report(photosFlagging([trainedHard!.id]));
    const row = regions.find((item) => item.id === trainedHard!.id)!;
    expect(row.verdict).toBe("both");
    expect(row.summary).toMatch(/needs more than average/);
    expect(row.assessment).toMatch(/natural strengths?/);
    expect(focusRegions(regions, 10).map((item) => item.id)).toContain(trainedHard!.id);
    expect(recommendations.some((rec) => /harder/.test(rec.headline))).toBe(false);
    expect(stories.coverage.takeaway).not.toMatch(/harder sets/);
  });

  it("at the top of its priority range, keeps volume steady and pushes progression", () => {
    const region = trainedHard!.id;
    const high = targetsFor(region, "lagging").high;
    const trains = (exerciseId: string) =>
      getExercise(exerciseId).stimulus.some((stim) => stim.region === region && stim.role === "primary");
    // Pile sets onto an exercise that trains it directly until it's past the top of the range.
    const heavy = structuredClone(split);
    const day = heavy.days.find((item) => item.exercises.some((exercise) => trains(exercise.exerciseId)))!;
    const exercise = day.exercises.find((item) => trains(item.exerciseId))!;
    exercise.sets.push(...Array.from({ length: high }, () => ({ type: "normal" as const })));
    const physique = photosFlagging([region]);
    const { regions, stories } = buildReport({ hevy, split: heavy, lagMap: physique.lagMap, physique, overrides: {} });
    const row = regions.find((item) => item.id === region)!;
    expect(row.verdict).toBe("photo-gap");
    expect(row.summary).toMatch(/already high volume/);
    expect(row.assessment).toMatch(/reps or load/);
    expect(stories.coverage.takeaway).toMatch(/reps or load/);
  });
});

describe("next moves", () => {
  it("name the muscle, carry reps, and show the numbers behind them", () => {
    const { recommendations } = report(photosFlagging(["chest_upper", "lats"]));
    const moves = recommendations.filter((rec) => rec.kind !== "resume");
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.length).toBeLessThanOrEqual(3);
    for (const rec of moves) {
      expect(rec.headline).toMatch(/^[A-Z][^:]+: /);
      const labels = rec.evidence.map((item) => item.label);
      expect(labels).toContain("Photos");
      expect(labels).toContain("Your logs");
      expect(labels).toContain("Check");
      for (const row of rec.rows) if (row.suggested) expect(row.suggested.reps).toMatch(/^\d+(–\d+)?$/);
    }
  });
});

describe("without photos", () => {
  const skipped: PhysiqueResult = { status: "skipped", lagMap: {}, findings: [], views: [] };

  it("talks about training gaps, never what photos show", () => {
    const { stories } = report(skipped);
    expect(stories.coverage.takeaway).not.toMatch(/photos show|in your photos|your photos/i);
    expect(stories.coverage.takeaway).toMatch(/your logs show/i);
  });

  it("labels a goal you set as your goal, not photos", () => {
    const { stories, recommendations } = report(skipped, { chest_upper: "lagging" });
    expect(stories.coverage.takeaway).toMatch(/upper chest is a priority you set/i);
    expect(stories.coverage.takeaway).not.toMatch(/photos show|in your photos/i);
    const labels = recommendations.flatMap((rec) => rec.evidence.map((item) => item.label));
    expect(labels).not.toContain("Photos");
    expect(labels).toContain("Your goal");
  });
});
