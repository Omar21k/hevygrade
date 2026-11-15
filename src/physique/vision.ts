import { PHYSIQUE_VISION_PROMPT, parsePhysiqueJson } from "./parse";
import type { PhysiqueView } from "./types";
import type { PhysiqueAssessment } from "./types";

const ANTHROPIC_VERSION = "2026-10-21";
const DEFAULT_MODEL = "claude-sonnet-4-5";

type AnthropicMedia = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function asMediaType(mime: string): AnthropicMedia {
  if (mime === "image/png" || mime === "image/webp" || mime === "image/gif") {
    return mime;
  }
  return "image/jpeg";
}

export async function assessPhysiqueFromImages(
  images: { view: PhysiqueView; mime: string; base64: string }[],
  apiKey: string,
  model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
): Promise<PhysiqueAssessment> {
  const content = [
    ...images.map((image) => ({
      type: "image" as const,
      source: {
        type: "base64" as const,
        media_type: asMediaType(image.mime),
        data: image.base64,
      },
    })),
    {
      type: "text" as const,
      text: `Views in order: ${images.map((image) => image.view).join(", ")}.\n\n${PHYSIQUE_VISION_PROMPT}`,
    },
  ];

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      temperature: 0.2,
      system: "You are a strict visual hypertrophy assessor. Return JSON only.",
      messages: [{ role: "user", content }],
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Vision request failed (${response.status}): ${text.slice(0, 240)}`);
  }

  const payload = (await response.json()) as {
    content?: { type?: string; text?: string }[];
  };
  const raw =
    payload.content?.find((block) => block.type === "text")?.text ??
    payload.content?.[0]?.text ??
    "";
  return parsePhysiqueJson(
    raw,
    images.map((image) => image.view),
  );
}
