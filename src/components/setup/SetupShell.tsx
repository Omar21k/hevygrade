"use client";

import { DemoBadge, Wordmark } from "@/components/ui";
import type { ReactNode } from "react";

const STEPS = ["Connect", "Photos", "Results"] as const;

export function SetupProgress({ current }: { current: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Setup progress">
      <ol className="flex items-center gap-2 text-[14px] leading-[22px]">
        {STEPS.map((label, index) => {
          const step = index + 1;
          const done = step < current;
          const active = step === current;
          return (
            <li key={label} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
              {index > 0 ? <span aria-hidden className="h-px w-6 bg-line sm:w-10" /> : null}
              <span
                aria-hidden
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-semibold ${
                  done
                    ? "bg-good/15 text-good"
                    : active
                      ? "bg-accent text-bg"
                      : "border border-line text-ink-3"
                }`}
              >
                {done ? "✓" : step}
              </span>
              <span className={active ? "font-medium text-ink" : done ? "text-ink-2" : "text-ink-3"}>
                {label}
                {done ? <span className="sr-only"> (done)</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function SetupShell({
  aside,
  demo = false,
  children,
}: {
  aside?: ReactNode;
  demo?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line/70">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-5 md:px-8">
          <div className="flex items-center gap-3">
            <Wordmark />
            {demo ? <DemoBadge /> : null}
          </div>
          <div className="text-[14px] leading-[22px] text-ink-2">{aside}</div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[760px] flex-1 px-5 pb-16 pt-10 md:px-8 md:pt-14">{children}</main>
    </div>
  );
}
