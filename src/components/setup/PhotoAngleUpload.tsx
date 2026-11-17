"use client";

import { buttonClass, Spinner } from "@/components/ui";
import { looksLikeHeic } from "@/physique/image";
import type { PhysiqueView } from "@/physique/types";
import { useEffect, useId, useRef, useState } from "react";
import { PoseFigure } from "./PoseFigure";

/** Matches the server's limit in /api/physique. */
export const MAX_PHOTO_BYTES = 12_000_000;
export const ACCEPTED_LABEL = "JPG, PNG, WebP, or HEIC · up to 12 MB each";
const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,.jpg,.jpeg,.png,.webp";
const DIRECT_TYPES = ["image/jpeg", "image/png", "image/webp"];
const DIRECT_EXT = /\.(jpe?g|png|webp)$/i;

/** Long edge sent to Claude. Plenty for a physique read, and well under the API's per-image limits. */
const MAX_EDGE_PX = 2048;
/** Files already this small and this size in pixels go up untouched. */
const SMALL_ENOUGH_BYTES = 1_500_000;

/**
 * Phone photos are often 8–12 MB, which is over what the vision API takes per
 * image. Re-encode to a JPEG no wider than MAX_EDGE_PX. Falls back to the
 * original file if the browser can't decode it.
 */
async function downscale(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= SMALL_ENOUGH_BYTES) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  if (!blob) return file;
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

async function prepareFile(file: File): Promise<File> {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (looksLikeHeic(file.name, file.type, header)) {
    const heic2any = (await import("heic2any")).default;
    const converted = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.82 });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    return downscale(new File([blob], file.name.replace(/\.(heic|heif)$/i, "") + ".jpg", { type: "image/jpeg" }));
  }
  if (!DIRECT_TYPES.includes(file.type) && !DIRECT_EXT.test(file.name)) {
    throw new Error(`${file.name} isn't a supported photo. Use ${ACCEPTED_LABEL.split(" ·")[0]}.`);
  }
  return downscale(file);
}

function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function Thumbnail({ file }: { file: File }) {
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (ref.current) ref.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Blob URLs can't go through next/image optimization.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} alt="" className="h-40 w-full rounded-control object-contain" />;
}

export function PhotoAngleUpload({
  view,
  file,
  disabled,
  onFile,
  onRemove,
}: {
  view: PhysiqueView;
  file?: File;
  disabled?: boolean;
  onFile: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const labelId = useId();
  const errorId = useId();
  const label = view[0].toUpperCase() + view.slice(1);

  async function take(next?: File) {
    if (!next || disabled) return;
    setBusy(true);
    setError(null);
    try {
      const prepared = await prepareFile(next);
      if (prepared.size > MAX_PHOTO_BYTES) {
        throw new Error(`${next.name} is ${megabytes(prepared.size)}. Photos must be 12 MB or smaller.`);
      }
      onFile(prepared);
    } catch (caught) {
      setError(
        caught instanceof Error && caught.message
          ? caught.message
          : `Couldn't read ${next.name}. Try exporting it as a JPG.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      role="group"
      aria-labelledby={labelId}
      aria-describedby={error ? errorId : undefined}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        void take(event.dataTransfer.files[0]);
      }}
      className={`flex flex-col rounded-card border p-4 transition-colors ${
        over ? "border-accent bg-accent/10" : error ? "border-bad/60 bg-surface" : "border-line bg-surface"
      }`}
    >
      <p id={labelId} className="text-[14px] font-medium leading-[22px] text-ink">
        {label}
        {file ? <span className="sr-only"> photo added</span> : null}
      </p>

      <div className="mt-3 flex h-40 items-center justify-center">
        {busy ? <Spinner className="text-ink-3" /> : file ? <Thumbnail file={file} /> : <PoseFigure view={view} />}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          event.target.value = "";
          void take(chosen);
        }}
      />

      {file ? (
        <div className="mt-3 flex flex-col gap-1">
          <p className="truncate text-[12px] leading-[18px] text-ink-3" title={file.name}>
            {file.name}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => inputRef.current?.click()}
              className={buttonClass("secondary", "flex-1 px-3 text-[14px]")}
              aria-label={`Replace ${view} photo`}
            >
              Replace
            </button>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={onRemove}
              className={buttonClass("ghost", "px-3 text-[14px]")}
              aria-label={`Remove ${view} photo`}
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className={buttonClass("secondary", "mt-3 w-full text-[14px]")}
          aria-label={`Add ${view} photo`}
        >
          {busy ? "Preparing…" : "+ Add photo"}
        </button>
      )}

      {error ? (
        <p id={errorId} className="mt-2 text-[13px] leading-[20px] text-bad">
          {error}
        </p>
      ) : null}
    </div>
  );
}
