import { PHYSIQUE_VISION_PROMPT, parsePhysiqueJson } from "./parse";
import type { PhysiqueView } from "./types";
import type { PhysiqueAssessment } from "./types";

export async function assessPhysiqueFromImages(
  images: { view: PhysiqueView; mime: string; base64: string }[],
  apiKey: string,
): Promise<PhysiqueAssessment> {
  const content: unknown[] = [
    { type: "text", text: PHYSIQUE_VISION_PROMPT },
    ...images.map((image) => ({
      type: "image_url",
      image_url: {
        url: `data:${image.mime};base64,${image.base64}`,
      },
    })),
  ];

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a strict visual hypertrophy assessor. JSON only.",
        },
        { role: "user", content },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Vision request failed (${response.status}): ${text.slice(0, 240)}`);
  }

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = payload.choices?.[0]?.message?.content ?? "";
  return parsePhysiqueJson(
    raw,
    images.map((image) => image.view),
  );
}
