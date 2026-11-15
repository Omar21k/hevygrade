"use client";

import { loadHevySession } from "@/hevy/session";
import { useSessionReady } from "@/report/ReportContext";
import { loadPhysique } from "@/report/state";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const LINE = "Are you leaving gains on the table?";

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function HomeLanding() {
  const router = useRouter();
  const ready = useSessionReady();
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    if (ready && loadHevySession() && loadPhysique()) router.replace("/report");
  }, [ready, router]);

  useEffect(() => {
    const instant = prefersReducedMotion();
    let index = 0;
    const tick = window.setInterval(() => {
      index = instant ? LINE.length : index + 1;
      setShown(LINE.slice(0, index));
      if (index >= LINE.length) {
        window.clearInterval(tick);
        setDone(true);
      }
    }, 42);
    return () => window.clearInterval(tick);
  }, []);

  useEffect(() => {
    if (!done) return;
    const wait = window.setTimeout(() => setShowButton(true), prefersReducedMotion() ? 0 : 1000);
    return () => window.clearTimeout(wait);
  }, [done]);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-bg text-ink">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <p className="text-sm font-semibold tracking-[0.28em] text-brand">HEVYGRADE</p>
        <h1
          aria-label={LINE}
          className="mt-10 min-h-[1.3em] text-4xl font-semibold leading-[1.15] tracking-tight sm:text-6xl"
        >
          <span aria-hidden>{shown}</span>
          <span
            aria-hidden
            className={`ml-0.5 inline-block h-[0.92em] w-[3px] translate-y-[0.08em] bg-accent ${
              done ? "motion-safe:animate-pulse" : ""
            }`}
          />
        </h1>
        {showButton ? (
          <Link
            href="/connect"
            className="hg-rise mt-12 inline-flex min-h-12 items-center rounded-full bg-accent px-10 text-base font-semibold text-bg transition-colors hover:bg-accent-hover"
          >
            Find out
          </Link>
        ) : (
          <div className="mt-12 h-12" aria-hidden />
        )}
      </main>
    </div>
  );
}
