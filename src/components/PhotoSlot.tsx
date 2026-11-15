"use client";

import { BodyFigure } from "@/components/BodyFigure";
import { looksLikeHeic } from "@/physique/image";
import type { PhysiqueView } from "@/physique/types";
import { useEffect, useRef, useState } from "react";

async function asUploadFile(file: File): Promise<File> {
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!looksLikeHeic(file.name, file.type, header)) return file;

  const heic2any = (await import("heic2any")).default;
  const converted = await heic2any({
    blob: file,
    toType: "image/jpeg",
    quality: 0.82,
  });
  const blob = Array.isArray(converted) ? converted[0] : converted;
  const name = file.name.replace(/\.(heic|heif)$/i, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}

function PhotoPreview({ file }: { file: File }) {
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    if (ref.current) ref.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Blob URLs can't go through next/image optimization.
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={ref} alt="" className="h-28 w-auto max-w-full object-contain" />;
}

export function PhotoSlot({
  view,
  file,
  onFile,
}: {
  view: PhysiqueView;
  file?: File;
  onFile: (file: File) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);

  async function take(next?: File) {
    if (!next) return;
    setBusy(true);
    setError(null);
    try {
      onFile(await asUploadFile(next));
    } catch {
      setError("Could not read that HEIC. Try exporting as JPG, or drop the file here.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <label
      className={`flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 px-3 py-4 text-center text-sm ${
        over ? "bg-[#267FE8]/10 text-zinc-200" : "text-zinc-300"
      }`}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        void take(event.dataTransfer.files[0]);
      }}
    >
      <span className="text-base capitalize text-zinc-100">{view}</span>
      {file ? (
        <PhotoPreview file={file} />
      ) : (
        <BodyFigure view={view} />
      )}
      <span>
        {busy ? "Converting HEIC…" : file ? file.name : "Click or drop JPG / HEIC"}
      </span>
      {error ? <span className="text-rose-300">{error}</span> : null}
      <input
        type="file"
        className="hidden"
        onChange={(event) => {
          const chosen = event.target.files?.[0];
          event.target.value = "";
          void take(chosen);
        }}
      />
    </label>
  );
}
