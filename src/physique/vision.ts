import Anthropic from "@anthropic-ai/sdk";
import { PHYSIQUE_RESPONSE_SCHEMA, PHYSIQUE_VISION_PROMPT, parsePhysiqueJson } from "./parse";
import type { PhysiqueAssessment, PhysiqueView } from "./types";

const DEFAULT_MODEL = "claude-sonnet-5-5";

type AnthropicMedia = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

function asMediaType(mime: string): AnthropicMedia {
  if (mime === "image/png" || mime === "image/webp" || mime === "image/gif") {
    return mime;
  }
  return "image/jpeg";
}

/** Turns SDK errors into something the preparing page can show as-is. */
function readableError(error: unknown): Error {
  if (error instanceof Anthropic.AuthenticationError) {
    return new Error("The server's ANTHROPIC_API_KEY was rejected, so photos can't be read right now.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new Error("Photo analysis is busy right now. Try again in a minute.");
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new Error(`Claude couldn't take these photos: ${error.message.slice(0, 200)}`);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new Error("Couldn't reach Claude to read the photos. Check the connection and try again.");
  }
  if (error instanceof Anthropic.APIError) {
    return new Error(`Photo analysis failed (${error.status ?? "unknown"}). Try again.`);
  }
  return error instanceof Error ? error : new Error("Photo analysis failed.");
}

export async function assessPhysiqueFromImages(
  images: { view: PhysiqueView; mime: string; base64: string }[],
  apiKey: string,
  model = process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL,
): Promise<PhysiqueAssessment> {
  const views = images.map((image) => image.view);
  const client = new Anthropic({ apiKey, timeout: 120_000 });

  let response: Anthropic.Beta.BetaMessage;
  try {
    response = await client.beta.messages.create({
      model,
      // Thinking counts against this, so leave room for it plus the JSON.
      max_tokens: 16000,
      // Re-runs declines in the categories the server knows how to route.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: "You are a strict visual hypertrophy assessor who is also generous about what is genuinely good.",
      output_config: { format: { type: "json_schema", schema: PHYSIQUE_RESPONSE_SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
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
              text: `Views in order: ${views.join(", ")}.\n\n${PHYSIQUE_VISION_PROMPT}`,
            },
          ],
        },
      ],
    });
  } catch (error) {
    throw readableError(error);
  }

  if (response.stop_reason === "refusal") {
    throw new Error(
      "Claude declined to grade these photos. Photos in gym or swim wear, in even light, usually go through.",
    );
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The photo read was cut off before it finished. Try again.");
  }

  const text = response.content
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("");
  return parsePhysiqueJson(text, views);
}
