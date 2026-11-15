"use client";

import { scoreTone } from "@/report/view";
import { useEffect, useState } from "react";

const COUNT_MS = 1100;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function useCountUp(target: number, duration: number): number {
  const [reduced] = useState(prefersReducedMotion);
  const [progress, setProgress] = useState(reduced ? 1 : 0);
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const next = Math.min(1, (now - start) / duration);
      setProgress(next);
      if (next < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [reduced, duration]);
  return target * (1 - Math.pow(1 - progress, 3));
}

/** Decorative ring; the score is also given as text for assistive tech. */
export function ScoreRing({ score, size = 168, duration = COUNT_MS }: { score: number; size?: number; duration?: number }) {
  const value = useCountUp(score, duration);
  const radius = size / 2 - 8;
  const circumference = 2 * Math.PI * radius;
  const tone = scoreTone(score) === "good" ? "text-good" : "text-warn";
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={6} className="stroke-line" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 10)}
          className={`stroke-current ${tone}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span aria-hidden className={`hg-score ${tone}`}>
          {value.toFixed(1)}
        </span>
        <span aria-hidden className="text-[14px] leading-[22px] text-ink-3">
          / 10
        </span>
        <span className="sr-only">{score.toFixed(1)} out of 10</span>
      </div>
    </div>
  );
}
