import { describe, expect, it } from "vitest";
import { lagMapFromPhysique } from "./lagMap";
import { parsePhysiqueJson } from "./parse";

describe("physique lag map", () => {
  it("marks relative underdevelopment as lagging even if the absolute score is mid", () => {
    const { lagMap, findings } = lagMapFromPhysique({
      viewsPresent: ["front"],
      developments: [
        { region: "chest_upper", development: 2.1, confidence: 0.8, note: "flat clavicular shelf" },
        { region: "chest_mid", development: 4.2, confidence: 0.85 },
        { region: "biceps", development: 3.2, confidence: 0.7 },
        { region: "brachialis", development: 1.8, confidence: 0.75, note: "arms look small from front" },
      ],
      blindSpots: ["No back photo — lats not graded"],
      notes: [],
    });

    expect(lagMap.chest_upper).toBe("lagging");
    expect(lagMap.brachialis).toBe("lagging");
    expect(lagMap.chest_mid).not.toBe("lagging");
    expect(findings.some((finding) => finding.region === "brachialis")).toBe(true);
  });

  it("does not tag regions that are only guesses", () => {
    const { lagMap } = lagMapFromPhysique({
      viewsPresent: ["front"],
      developments: [{ region: "lats", development: 2, confidence: 0.2 }],
      blindSpots: [],
      notes: [],
    });
    expect(lagMap.lats).toBeUndefined();
  });

  it("does not mark glutes lagging from photos, even when they look small", () => {
    const { lagMap, findings } = lagMapFromPhysique({
      viewsPresent: ["front", "side", "back"],
      developments: [
        { region: "lats", development: 2, confidence: 0.9 },
        { region: "chest_mid", development: 3.5, confidence: 0.85 },
        { region: "glutes", development: 1.4, confidence: 0.9 },
      ],
      blindSpots: [],
      notes: [],
    });
    expect(lagMap.lats).toBe("lagging");
    expect(lagMap.glutes).not.toBe("lagging");
    expect(findings.some((finding) => finding.region === "glutes")).toBe(false);
  });

  it("needs a confident read before calling a hard-to-see region lagging", () => {
    const base = [
      { region: "chest_mid" as const, development: 4, confidence: 0.8 },
      { region: "quads" as const, development: 4, confidence: 0.8 },
    ];
    const shaky = lagMapFromPhysique({
      viewsPresent: ["front", "side"],
      developments: [...base, { region: "traps", development: 2, confidence: 0.55 }],
      blindSpots: [],
      notes: [],
    });
    expect(shaky.lagMap.traps).toBe("maintain");
    expect(shaky.findings.some((finding) => finding.region === "traps")).toBe(false);

    const clear = lagMapFromPhysique({
      viewsPresent: ["front", "back"],
      developments: [...base, { region: "traps", development: 2, confidence: 0.8 }],
      blindSpots: [],
      notes: [],
    });
    expect(clear.lagMap.traps).toBe("lagging");
  });

  it("parses vision JSON and ignores unknown region ids", () => {
    const assessment = parsePhysiqueJson(
      JSON.stringify({
        viewsPresent: ["front"],
        developments: [
          { region: "chest_upper", development: 2, confidence: 0.9 },
          { region: "not_a_muscle", development: 1, confidence: 1 },
        ],
        blindSpots: [],
        notes: [],
      }),
      ["front"],
    );
    expect(assessment.developments).toHaveLength(1);
    expect(assessment.developments[0].region).toBe("chest_upper");
  });
});
