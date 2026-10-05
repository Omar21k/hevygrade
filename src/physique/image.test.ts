import { describe, expect, it } from "vitest";
import { looksLikeHeic } from "./image";

function ftyp(brand: string) {
  const bytes = new Uint8Array(12);
  bytes.set([0, 0, 0, 0]);
  bytes.set([0x66, 0x74, 0x79, 0x70], 4);
  bytes.set([...brand].map((c) => c.charCodeAt(0)), 8);
  return bytes;
}

describe("looksLikeHeic", () => {
  it("accepts iPhone HEIC by extension even with an empty mime", () => {
    expect(looksLikeHeic("IMG_1234.HEIC", "", new Uint8Array())).toBe(true);
  });

  it("accepts HEIC by ftyp brand", () => {
    expect(looksLikeHeic("photo", "", ftyp("heic"))).toBe(true);
    expect(looksLikeHeic("photo", "", ftyp("mif1"))).toBe(true);
  });

  it("rejects jpeg", () => {
    expect(looksLikeHeic("arms.jpg", "image/jpeg", new Uint8Array([0xff, 0xd8]))).toBe(false);
  });
});
