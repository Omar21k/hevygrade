"use client";

import { useEffect, useState } from "react";

/** A limb drawn as an outlined tube: a wide ink stroke under a slightly narrower fill stroke. */
function Limb({ d, width }: { d: string; width: number }) {
  return (
    <>
      <path d={d} fill="none" strokeWidth={width + 5} strokeLinecap="round" className="stroke-ink" />
      <path d={d} fill="none" strokeWidth={width} strokeLinecap="round" className="stroke-raised" />
    </>
  );
}

/** A big guy in glasses, fist on chin, working out your score. Decorative. */
function ThinkerFigure() {
  return (
    <svg viewBox="0 0 250 262" width={220} height={230} aria-hidden className="overflow-visible">
      {/* Thought bubbles */}
      <g className="hg-float">
        <circle cx="166" cy="72" r="4" className="fill-surface stroke-ink" strokeWidth="2.5" />
        <circle cx="180" cy="54" r="6.5" className="fill-surface stroke-ink" strokeWidth="2.5" />
        <ellipse cx="214" cy="30" rx="30" ry="22" className="fill-surface stroke-ink" strokeWidth="2.5" />
        {[202, 214, 226].map((cx, index) => (
          <circle
            key={cx}
            cx={cx}
            cy="30"
            r="3.6"
            className="hg-think-dot fill-brand"
            style={{ animationDelay: `${index * 160}ms` }}
          />
        ))}
      </g>

      {/* Hanging arm, behind the torso */}
      <Limb d="M62 168 Q 34 208 54 250" width={36} />

      {/* Torso: tank top over a wide back */}
      <path
        d="M104 118 L 62 138 C 44 146 42 170 54 184 L 80 262 L 160 262 L 186 184 C 198 170 196 146 178 138 L 136 118 Z"
        className="fill-raised stroke-ink"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M90 150 C 98 142 108 140 112 150 L 128 150 C 132 140 142 142 150 150 L 160 262 L 80 262 Z"
        className="fill-brand stroke-ink"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      {/* Left delt cap */}
      <path d="M44 172 C 38 146 56 132 80 140 C 70 150 62 162 60 178 Z" className="fill-raised stroke-ink" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M96 188 Q 120 198 144 188" fill="none" className="stroke-ink" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M120 196 L 120 236" fill="none" className="stroke-ink" strokeWidth="2" strokeLinecap="round" opacity="0.35" />

      {/* Neck */}
      <path d="M106 104 L 106 126 Q 120 134 134 126 L 134 104 Z" className="fill-raised stroke-ink" strokeWidth="2.5" />

      {/* Head, tilting while it thinks */}
      <g className="hg-ponder">
        <ellipse cx="88" cy="84" rx="5" ry="8" className="fill-raised stroke-ink" strokeWidth="2.5" />
        <ellipse cx="152" cy="84" rx="5" ry="8" className="fill-raised stroke-ink" strokeWidth="2.5" />
        <ellipse cx="120" cy="80" rx="31" ry="35" className="fill-raised stroke-ink" strokeWidth="2.5" />
        {/* Hair */}
        <path d="M89 76 Q 88 42 120 42 Q 153 42 151 76 Q 146 58 120 58 Q 96 58 89 76 Z" className="fill-ink" />
        {/* Brows: the right one lifts now and then */}
        <path d="M99 66 L 114 64" fill="none" className="stroke-ink" strokeWidth="3" strokeLinecap="round" />
        <path d="M127 62 L 142 66" fill="none" className="hg-brow stroke-ink" strokeWidth="3" strokeLinecap="round" />
        {/* Glasses */}
        <path d="M95 80 L 90 78 M145 80 L 150 78 M117 81 Q 120 78 123 81" fill="none" className="stroke-ink" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="106" cy="81" r="11" className="fill-bg stroke-ink" strokeWidth="3" />
        <circle cx="134" cy="81" r="11" className="fill-bg stroke-ink" strokeWidth="3" />
        {/* Eyes look up and to the side, at the thought */}
        <circle cx="110" cy="77" r="2.8" className="fill-ink" />
        <circle cx="138" cy="77" r="2.8" className="fill-ink" />
        <path d="M99 78 L 104 73" fill="none" className="hg-glint stroke-surface" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M127 78 L 132 73" fill="none" className="hg-glint stroke-surface" strokeWidth="2.5" strokeLinecap="round" />
        {/* "Hmm" */}
        <path d="M112 101 Q 120 98 129 100" fill="none" className="stroke-ink" strokeWidth="2.5" strokeLinecap="round" />
      </g>

      {/* Thinking arm: big upper arm, forearm up to the chin */}
      <Limb d="M178 166 Q 208 196 178 224" width={38} />
      <Limb d="M178 224 Q 150 178 138 124" width={27} />
      <path d="M188 182 Q 202 196 192 212" fill="none" className="stroke-ink" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      {/* Right delt cap, over the arm */}
      <path d="M196 172 C 202 146 184 132 160 140 C 170 150 178 162 180 178 Z" className="fill-raised stroke-ink" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="136" cy="118" r="13" className="fill-raised stroke-ink" strokeWidth="2.5" />
      <path d="M128 112 L 140 110 M128 118 L 141 117" fill="none" className="stroke-ink" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
    </svg>
  );
}

/**
 * The suspense beat before a score: the thinker ponders while a short line
 * says what's being checked. Lines swap evenly across `duration`.
 */
export function Thinker({ lines, duration }: { lines: string[]; duration: number }) {
  const [line, setLine] = useState(0);

  useEffect(() => {
    if (lines.length < 2) return;
    const every = duration / lines.length;
    const timers = lines.slice(1).map((_, index) => window.setTimeout(() => setLine(index + 1), every * (index + 1)));
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [lines, duration]);

  return (
    <div className="flex flex-col items-center">
      <ThinkerFigure />
      <p key={line} className="hg-swap mt-4 min-h-[26px] text-[16px] leading-[26px] text-ink-2">
        {lines[line]}
      </p>
    </div>
  );
}
