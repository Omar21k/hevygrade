import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPendingPhotos, postPendingPhotos, stashPendingPhotos } from "./pendingAnalysis";

afterEach(() => {
  clearPendingPhotos();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("postPendingPhotos", () => {
  it("shares one parsed read when the preparing page asks twice", async () => {
    const assessment = {
      viewsPresent: ["front"],
      developments: [{ region: "delt_side", development: 4.4, confidence: 0.9 }],
      blindSpots: [],
      notes: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ assessment, lagMap: { delt_side: "maintain" }, findings: [] })),
    );

    stashPendingPhotos({ front: new File(["photo"], "front.jpg", { type: "image/jpeg" }) });
    const [first, second] = await Promise.all([postPendingPhotos(), postPendingPhotos()]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(first.payload.assessment).toEqual(assessment);
    expect(second.payload.assessment).toEqual(assessment);
    expect(first.views).toEqual(["front"]);
  });
});
