"use client";

import { PhotoHandlingCopy } from "@/components/HowItWorks";
import { Button } from "@/components/ui";
import { loadHevySession } from "@/hevy/session";
import { subscribeSession } from "@/lib/sessionStore";
import { peekPendingPhotos, stashPendingPhotos } from "@/physique/pendingAnalysis";
import { PHYSIQUE_VIEWS, type PhysiqueView } from "@/physique/types";
import { useSessionReady } from "@/report/ReportContext";
import { resetReportProgress, saveLagOverrides, savePhysique } from "@/report/state";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ACCEPTED_LABEL, PhotoAngleUpload } from "./PhotoAngleUpload";
import { SetupProgress, SetupShell } from "./SetupShell";

const serverNull = () => null;

export function PhotosScreen() {
  const router = useRouter();
  const ready = useSessionReady();
  const hevy = useSyncExternalStore(subscribeSession, loadHevySession, serverNull);
  const [photos, setPhotos] = useState<Partial<Record<PhysiqueView, File>>>(() => peekPendingPhotos() ?? {});
  const views = PHYSIQUE_VIEWS.filter((view) => photos[view]);

  useEffect(() => {
    if (ready && !hevy) router.replace("/connect");
  }, [ready, hevy, router]);

  function finish() {
    resetReportProgress();
    router.push("/reveal");
  }

  function continueWithout() {
    savePhysique({ status: "skipped", lagMap: {}, findings: [], views: [] });
    saveLagOverrides({});
    finish();
  }

  function analyze() {
    stashPendingPhotos(photos);
    router.push("/preparing");
  }

  if (!ready || !hevy) {
    return (
      <SetupShell>
        <p className="text-ink-2">Loading…</p>
      </SetupShell>
    );
  }

  return (
    <SetupShell
      demo={hevy.demo}
      aside={
        hevy.demo ? null : (
          <span>
            Hevy connected · {hevy.workoutCount} workout{hevy.workoutCount === 1 ? "" : "s"}
          </span>
        )
      }
    >
      <SetupProgress current={2} />

      <h1 className="hg-h1 mt-10">Add context with photos</h1>
      <p className="mt-4 max-w-[560px] text-ink-2">
        Optional photos can help identify visual priorities. Your workout history is enough to get started.
      </p>

      {hevy.demo ? (
        <div className="mt-8 rounded-card border border-line bg-surface p-5 md:p-6">
          <p className="text-ink-2">Photo analysis isn&apos;t part of the demo report. It uses example priorities instead.</p>
          <Button className="mt-5" onClick={continueWithout}>
            Continue to the demo <span aria-hidden>→</span>
          </Button>
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-1 gap-3 min-[480px]:grid-cols-3">
            {PHYSIQUE_VIEWS.map((view) => (
              <PhotoAngleUpload
                key={view}
                view={view}
                file={photos[view]}
                onFile={(file) => setPhotos((current) => ({ ...current, [view]: file }))}
                onRemove={() =>
                  setPhotos((current) => {
                    const next = { ...current };
                    delete next[view];
                    return next;
                  })
                }
              />
            ))}
          </div>

          <div className="mt-5 flex flex-col gap-1 text-[14px] leading-[22px] text-ink-2">
            <p>Good light · Relaxed stance · Similar framing. Keep your face out of frame if you prefer.</p>
            <p className="text-ink-3">{ACCEPTED_LABEL}. Front, side, and back are recommended.</p>
            {views.length > 0 && views.length < 3 ? (
              <p>Fewer angles means fewer muscles can be judged. Those keep a standard priority.</p>
            ) : null}
          </div>

          <details className="mt-4 text-[14px] leading-[22px]">
            <summary className="inline-flex min-h-11 cursor-pointer items-center text-accent hover:text-accent-hover">
              How photos are used and retained
            </summary>
            <PhotoHandlingCopy />
          </details>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button onClick={analyze} disabled={views.length === 0}>
              Continue with photos <span aria-hidden>→</span>
            </Button>
            <Button variant="ghost" onClick={continueWithout}>
              Continue without photos
            </Button>
          </div>
          <p className="mt-3 text-[13px] leading-[20px] text-ink-3">
            {views.length > 0 ? "Continuing sends these photos to Anthropic for analysis." : ""}
          </p>
        </>
      )}
    </SetupShell>
  );
}
