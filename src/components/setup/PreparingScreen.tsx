"use client";

import { Button, Wordmark } from "@/components/ui";
import { clearPendingPhotos, hasPendingPhotos, postPendingPhotos } from "@/physique/pendingAnalysis";
import { resetReportProgress, saveLagOverrides, savePhysique } from "@/report/state";
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
      () => setStep((current) => (current + 1) % LINES.length),
      reduced ? 40 : STEP_MS,
    );

    let cancelled = false;
    (async () => {
      try {
        const result = await postPendingPhotos();
        if (cancelled) return;
        if (!result.ok || !result.payload.assessment) {
          throw new Error(
            result.status === 501
              ? "Photo analysis isn't set up on this server yet, so it can't read photos."
              : (result.payload.error ?? "Photo analysis came back without a read."),
          );
        }
        savePhysique({
          status: "graded",
          lagMap: result.payload.lagMap ?? {},
          findings: result.payload.findings ?? [],
          assessment: result.payload.assessment,
          views: result.views,
        });
        saveLagOverrides({});
        resetReportProgress();
        const wait = reduced ? 0 : Math.max(0, MIN_MS - (performance.now() - started));
        await new Promise((resolve) => window.setTimeout(resolve, wait));
        if (cancelled) return;
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

  const line = LINES[step];

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
            <p key={line} className="hg-swap mt-6 min-h-[36px] text-[26px] font-medium leading-[34px] text-ink" aria-live="polite">
              {line}…
            </p>
            <div className="relative mt-8 h-1 w-full max-w-[240px] overflow-hidden rounded-full bg-line">
              <div className="hg-scan absolute inset-y-0 w-1/3 rounded-full bg-accent" />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
