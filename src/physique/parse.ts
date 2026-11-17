import { REGION_IDS } from "@/scoring/regions";
import {
  isRegionId,
  PHYSIQUE_VIEWS,
  type PhysiqueAssessment,
  type PhysiqueStrength,
  type PhysiqueView,
} from "./types";
import { mergeAssessments } from "./lagMap";

/** Most strengths the reveal will walk through. */
export const MAX_STRENGTHS = 6;

export const PHYSIQUE_VISION_PROMPT = `You grade physique photos for a hypertrophy coach.
Fill every field of the JSON response:
- viewsPresent: which of front, side, back you were given.
- developments: one row per region you can actually see. development 1-5, confidence 0-1, note = short visual reason.
- strengths: what already looks good, written to the person.
- blindSpots: what you cannot see.
- notes: optional overall notes.

Region ids (use only these): ${REGION_IDS.join(", ")}

Grading rules:
- Grade tissue you can actually see. Do not invent lagging back development from a front photo.
- development is relative to THIS physique, not to a bodybuilder magazine.
- 1 = clearly lagging, 3 = in line with the rest of the body, 5 = dominant.
- Brachialis / front-arm thickness: if the arm looks small or flat from the FRONT even with decent biceps peak, score brachialis low.
- Upper chest: if the clavicular shelf is flat vs mid-chest, score chest_upper lower than chest_mid.
- confidence < 0.45 for anything guessed.
- Typical male lifter goals: the muscles that matter are lats, chest, shoulders, arms, and quads. Judge those first.
- Do not mark glutes, calves, or forearms as lagging. Most lifters never train them directly, and indirect work is expected.
- On a back photo, lats are a primary call. A narrow back relative to shoulders and arms is lagging lats, not a glute note.

Strengths rules:
- This person is about to see their scores. First they get hyped up on what is already working, like a friend looking at their progress pic who is genuinely impressed. Be generous, warm, and specific.
- List every real strength you can see, strongest first, up to ${MAX_STRENGTHS}. Muscles you graded 3.5 or higher qualify, and so do whole-physique traits you can see (shoulder-to-waist taper, width, symmetry, proportions, visible separation).
- title: at most 8 words, second person, punchy, the way a hype friend talks ("Your side delts are carrying this photo."). No emoji, no hashtags.
- detail: one sentence naming exactly what in which photo shows it, so it reads as earned, not generic.
- regions: the region ids it is about; empty for whole-physique traits. view: the photo where it is clearest.
- Never praise a region you would grade under 3.5, and never invent a strength. If nothing stands out, return an empty list.
- Only talk about muscle and shape. Never comment on face, skin, height, or weight.`;

const VIEW_ENUM = { type: "string", enum: [...PHYSIQUE_VIEWS] };
const REGION_ENUM = { type: "string", enum: [...REGION_IDS] };

/** JSON schema for structured outputs, so the response always parses. */
export const PHYSIQUE_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["viewsPresent", "developments", "strengths", "blindSpots", "notes"],
  properties: {
    viewsPresent: { type: "array", items: VIEW_ENUM },
    developments: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["region", "development", "confidence", "note"],
        properties: {
          region: REGION_ENUM,
          development: { type: "number" },
          confidence: { type: "number" },
          note: { type: "string" },
        },
      },
    },
    strengths: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "detail", "regions", "view"],
        properties: {
          title: { type: "string" },
          detail: { type: "string" },
          regions: { type: "array", items: REGION_ENUM },
          view: VIEW_ENUM,
        },
      },
    },
    blindSpots: { type: "array", items: { type: "string" } },
    notes: { type: "array", items: { type: "string" } },
  },
} as const;

type RawStrength = { title?: unknown; detail?: unknown; regions?: unknown; view?: unknown };

function parseStrengths(rows: RawStrength[] | undefined): PhysiqueStrength[] {
  return (rows ?? [])
    .flatMap((row): PhysiqueStrength[] => {
      const title = typeof row.title === "string" ? row.title.trim() : "";
      if (!title) return [];
      const detail = typeof row.detail === "string" ? row.detail.trim() : "";
      const regions = Array.isArray(row.regions)
        ? row.regions.filter((region): region is (typeof REGION_IDS)[number] => typeof region === "string" && isRegionId(region))
        : [];
      const view = PHYSIQUE_VIEWS.includes(row.view as PhysiqueView) ? (row.view as PhysiqueView) : undefined;
      return [{ title, detail, regions, ...(view ? { view } : {}) }];
    })
    .slice(0, MAX_STRENGTHS);
}

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
    strengths?: RawStrength[];
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
    strengths: parseStrengths(parsed.strengths),
    blindSpots: parsed.blindSpots ?? [],
    notes: parsed.notes ?? [],
  };
}
