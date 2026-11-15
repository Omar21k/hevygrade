import type { PhysiqueView } from "@/physique/types";

/** Neutral standing silhouette for framing guidance; deliberately not anatomical. */
export function PoseOutline({ view }: { view: PhysiqueView }) {
  const side = view === "side";
  return (
    <svg viewBox="0 0 60 120" className="h-28 w-auto text-ink-3" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="30" cy="12" r="8" />
      {side ? (
        <>
          <path d="M30 21c-5 0-7 4-7 9v26c0 4 2 6 4 7l-1 47h7l1-38 1 38h6l-1-47c2-1 3-3 3-7V30c0-5-3-9-7-9z" />
          <path d="M29 30c-2 8-2 18 0 28" />
        </>
      ) : (
        <>
          <path d="M18 24c-4 1-6 4-6 8l-2 28c0 2 3 2 3 0l3-24v22l2 52h7l3-40 3 40h7l2-52V36l3 24c0 2 3 2 3 0l-2-28c0-4-2-7-6-8z" />
          {view === "back" ? <path d="M30 26v30" /> : null}
        </>
      )}
    </svg>
  );
}
