import { REGION_IDS } from "@/scoring/regions";
import { isRegionId, PHYSIQUE_VIEWS, type PhysiqueAssessment, type PhysiqueView } from "./types";
import { mergeAssessments } from "./lagMap";

export const PHYSIQUE_VISION_PROMPT = `You grade physique photos for a hypertrophy coach.
Return ONLY JSON with this shape:
{
  "viewsPresent": ["front" | "side" | "back"],
  "developments": [
    { "region": "<id>", "development": 1-5, "confidence": 0-1, "note": "short visual reason" }
  ],
  "blindSpots": ["what you cannot see"],
  "notes": ["optional overall notes"]
}

Region ids (use only these): ${REGION_IDS.join(", ")}
Rules:
- Grade tissue you can actually see. Do not invent lagging back development from a front photo.
- development is relative to THIS physique, not to a bodybuilder magazine.
- 1 = clearly lagging, 3 = in line with the rest of the body, 5 = dominant.
- Brachialis / front-arm thickness: if the arm looks small or flat from the FRONT even with decent biceps peak, score brachialis low.
- Upper chest: if the clavicular shelf is flat vs mid-chest, score chest_upper lower than chest_mid.
- confidence < 0.45 for anything guessed.
- Typical male lifter goals: prioritize visible upper-body shape (lats, chest, shoulders, arms) over glutes/calves. Do not mark glutes lagging on a normal physique unless clearly underdeveloped; indirect leg work often covers them.`;

export function parsePhysiqueJson(raw: string, viewsPresent: PhysiqueView[]): PhysiqueAssessment {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < 0) {
    throw new Error("Physique model did not return JSON.");
  }
  const parsed = JSON.parse(raw.slice(start, end + 1)) as {
    viewsPresent?: string[];
    developments?: {
      region?: string;
      development?: number;
      confidence?: number;
      note?: string;
    }[];
    blindSpots?: string[];
    notes?: string[];
  };

  const views = (parsed.viewsPresent ?? viewsPresent).filter((view): view is PhysiqueView =>
    PHYSIQUE_VIEWS.includes(view as PhysiqueView),
  );

  const developments = mergeAssessments(
    (parsed.developments ?? []).flatMap((row) => {
      if (!row.region || !isRegionId(row.region)) return [];
      return [
        {
          region: row.region,
          development: Number(row.development),
          confidence: Number(row.confidence ?? 0),
          note: row.note,
        },
      ];
    }),
  );

  return {
    viewsPresent: views.length > 0 ? views : viewsPresent,
    developments,
    blindSpots: parsed.blindSpots ?? [],
    notes: parsed.notes ?? [],
  };
}
