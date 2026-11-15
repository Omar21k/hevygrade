"use client";

import { Button, Wordmark } from "@/components/ui";
import {
  clearPendingPhotos,
  hasPendingPhotos,
  pendingPhotoViews,
  postPendingPhotos,
} from "@/physique/pendingAnalysis";
import type { PhysiqueAssessment } from "@/physique/types";
import { resetReportProgress, saveLagOverrides, savePhysique } from "@/report/state";
import type { Finding, LagMap } from "@/scoring";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const LINES = [
  "Reading your photos",
  "Analyzing chest",
  "Checking shoulders and arms",
  "Looking at your back",
  "Comparing that with your routines",
  "Looking at gaps",
];

const STEP_MS = 900;
const MIN_MS = 3200;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function PreparingScreen() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasPendingPhotos()) {
      router.replace("/photos");
      return;
    }
    const reduced = prefersReducedMotion();
    const started = performance.now();
    let timer = 0;
    timer = window.setInterval(
      () => setStep((current) => Math.min(current + 1, LINES.length - 1)),
      reduced ? 40 : STEP_MS,
    );

    let cancelled = false;
    (async () => {
      try {
        const response = await postPendingPhotos();
        const payload = (await response.json().catch(() => ({}))) as {
          error?: string;
          assessment?: PhysiqueAssessment;
          lagMap?: LagMap;
          findings?: Finding[];
        };
        if (!response.ok) {
          throw new Error(
            response.status === 501
              ? "Photo analysis isn't set up on this server yet, so it can't read photos."
              : (payload.error ?? "Photo analysis failed."),
          );
        }
        const wait = reduced ? 0 : Math.max(0, MIN_MS - (performance.now() - started));
        await new Promise((resolve) => window.setTimeout(resolve, wait));
        if (cancelled) return;
        savePhysique({
          status: "graded",
          lagMap: payload.lagMap ?? {},
          findings: payload.findings ?? [],
          assessment: payload.assessment,
          views: pendingPhotoViews(),
        });
        saveLagOverrides({});
        resetReportProgress();
        clearPendingPhotos();
        router.replace("/reveal");
      } catch (caught) {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "Photo analysis failed.");
      }
    })();

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [router]);

  const shown = LINES.slice(0, step + 1);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line/70">
        <div className="mx-auto flex max-w-[1120px] items-center px-5 md:px-8">
          <Wordmark />
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col justify-center px-5 py-16 md:px-8">
        {error ? (
          <div role="alert">
            <h1 className="hg-h1">Could not read those photos</h1>
            <p className="mt-4 text-ink-2">{error}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button onClick={() => router.push("/photos")}>Back to photos</Button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="sr-only">Analyzing your photos</h1>
            <p className="hg-eyebrow">Putting your report together</p>
            <ul className="mt-6 flex flex-col gap-3" aria-live="polite">
              {shown.map((line, index) => {
                const current = index === shown.length - 1;
                return (
                  <li
                    key={line}
                    className={`text-[22px] font-medium leading-[30px] ${current ? "text-ink" : "text-ink-3"}`}
                  >
                    {current ? <span className="mr-2 inline-block h-2 w-2 rounded-full bg-accent align-middle" /> : null}
                    {line}
                    {current ? "…" : ""}
                  </li>
                );
              })}
            </ul>
            <div className="relative mt-8 h-1 w-full max-w-[240px] overflow-hidden rounded-full bg-line">
              <div className="hg-scan absolute inset-y-0 w-1/3 rounded-full bg-accent" />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
