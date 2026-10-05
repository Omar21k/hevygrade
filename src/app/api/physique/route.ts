import { NextResponse } from "next/server";
import { toVisionImage } from "@/physique/image";
import { lagMapFromPhysique } from "@/physique/lagMap";
import { PHYSIQUE_VIEWS, type PhysiqueView } from "@/physique/types";
import { assessPhysiqueFromImages } from "@/physique/vision";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Physique photo grading needs OPENAI_API_KEY in .env.local. You can still tag lagging regions manually.",
      },
      { status: 501 },
    );
  }

  const form = await request.formData();
  const images: { view: PhysiqueView; mime: string; base64: string }[] = [];

  for (const view of PHYSIQUE_VIEWS) {
    const file = form.get(view);
    if (!(file instanceof File) || file.size === 0) continue;
    if (file.size > 12_000_000) {
      return NextResponse.json({ error: `${view} photo is over 12MB.` }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    try {
      const converted = await toVisionImage(file.name, file.type, buffer);
      images.push({ view, mime: converted.mime, base64: converted.base64 });
    } catch {
      return NextResponse.json(
        { error: `${view} needs to be JPG, PNG, WebP, or HEIC.` },
        { status: 400 },
      );
    }
  }

  if (images.length === 0) {
    return NextResponse.json({ error: "Upload at least one physique photo." }, { status: 400 });
  }

  try {
    const assessment = await assessPhysiqueFromImages(images, apiKey);
    const { lagMap, findings } = lagMapFromPhysique(assessment);
    return NextResponse.json({ assessment, lagMap, findings });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Physique grading failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
