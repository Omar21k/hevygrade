const JPEG = "image/jpeg";
const PNG = "image/png";
const WEBP = "image/webp";
const HEIC = "image/heic";
const HEIF = "image/heif";

const HEIC_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"];

export function looksLikeHeic(name: string, mime: string, bytes: Uint8Array): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith(".heic") || lower.endsWith(".heif")) return true;
  if (mime === HEIC || mime === HEIF || mime === "image/heic-sequence") return true;
  if (bytes.length < 12) return false;
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  const tag = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  return tag === "ftyp" && HEIC_BRANDS.includes(brand);
}

export function isDirectVisionMime(mime: string): boolean {
  return mime === JPEG || mime === PNG || mime === WEBP;
}

export async function toVisionImage(
  name: string,
  mime: string,
  buffer: Buffer,
): Promise<{ mime: string; base64: string }> {
  if (looksLikeHeic(name, mime, buffer)) {
    const convert = (await import("heic-convert")).default;
    const jpeg = await convert({
      buffer,
      format: "JPEG",
      quality: 0.82,
    });
    const out = Buffer.isBuffer(jpeg) ? jpeg : Buffer.from(jpeg);
    return { mime: JPEG, base64: out.toString("base64") };
  }
  if (!isDirectVisionMime(mime) && !isDirectVisionMime(guessMime(name))) {
    throw new Error("Use JPG, PNG, WebP, or HEIC.");
  }
  return { mime: isDirectVisionMime(mime) ? mime : guessMime(name), base64: buffer.toString("base64") };
}

function guessMime(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".png")) return PNG;
  if (lower.endsWith(".webp")) return WEBP;
  return JPEG;
}
