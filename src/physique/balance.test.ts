import { REGION_IDS } from "@/scoring/regions";
import { describe, expect, it } from "vitest";
import { physiqueBalance } from "./balance";
import type { PhysiqueAssessment } from "./types";

function read(values: Partial<Record<(typeof REGION_IDS)[number], number>>, rest = 3.6): PhysiqueAssessment {
  return {
    viewsPresent: ["front", "side", "back"],
    developments: REGION_IDS.map((region) => ({ region, development: values[region] ?? rest, confidence: 0.85 })),
    blindSpots: [],
    notes: [],
  };
}

describe("physiqueBalance", () => {
  it("scores an even physique at 10", () => {
    expect(physiqueBalance(read({}))?.score).toBe(10);
  });

  it("costs more for a clearly lagging major muscle than a slight dip", () => {
    const slight = physiqueBalance(read({ biceps: 3.2 }))!;
    const clear = physiqueBalance(read({ lats: 2 }))!;
    expect(slight.score).toBeGreaterThan(clear.score);
    expect(clear.worst?.region).toBe("lats");
  });

  it("two clear lags land well below an even physique", () => {
    const score = physiqueBalance(read({ lats: 2, chest_upper: 2 }))!.score;
    expect(score).toBeGreaterThan(5);
    expect(score).toBeLessThan(8);
  });

  it("needs a few confident reads", () => {
    const assessment = read({});
    assessment.developments = assessment.developments.map((row) => ({ ...row, confidence: 0.2 }));
    expect(physiqueBalance(assessment)).toBeNull();
  });
});
