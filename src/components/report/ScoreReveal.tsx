"use client";

import { Button, DemoBadge, StatusLabel, Wordmark } from "@/components/ui";
import { useReport } from "@/report/ReportContext";
import { markRevealSeen } from "@/report/state";
import { METRIC_LABEL, METRIC_PROMPT, METRICS, scoreStatus, scoreTone, type Metric } from "@/report/view";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import { ScoreRing } from "./ScoreRing";

function isMetric(value: string | null): value is Metric {
  return value !== null && (METRICS as readonly string[]).includes(value);
}

export function ScoreReveal() {
  const router = useRouter();
  const params = useSearchParams();
  const report = useReport();
  const stageParam = params.get("stage");
  const stage: Metric = isMetric(stageParam) ? stageParam : "coverage";
  const index = METRICS.indexOf(stage);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const physique = report.status === "ready" ? report.data.physique : null;

  useEffect(() => {
    if (report.status === "no-hevy") router.replace("/connect");
    else if (report.status === "ready" && !physique) router.replace("/photos");
  }, [report.status, physique, router]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [stage]);

  if (report.status !== "ready" || !physique) {
    return <div className="flex flex-1 items-center justify-center text-ink-2">Loading your scores…</div>;
  }

  const { grade, stories, hevy } = report.data;
  const story = stories[stage];
  const score = grade[stage].score;
  const last = index === METRICS.length - 1;

  function go(next: Metric) {
    router.push(`/reveal?stage=${next}`, { scroll: false });
  }

  function finish() {
    markRevealSeen();
    router.push("/report");
  }

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="border-b border-line/70">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-5 md:px-8">
          <div className="flex items-center gap-3">
            <Wordmark />
            {hevy.demo ? <DemoBadge /> : null}
          </div>
          <Link
            href="/report"
            onClick={() => markRevealSeen()}
            className="inline-flex min-h-11 items-center text-[14px] text-ink-2 hover:text-ink"
          >
            Skip to overview
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col px-5 pb-16 pt-8 md:px-8">
        <nav aria-label="Score categories">
          <ol className="flex items-center gap-2">
            {METRICS.map((metric, position) => (
              <li key={metric} className="flex flex-1 flex-col gap-2" aria-current={metric === stage ? "step" : undefined}>
                <span
                  aria-hidden
                  className={`h-1 rounded-full transition-colors ${position <= index ? "bg-accent" : "bg-line"}`}
                />
                <span className={`text-[12px] font-medium leading-[18px] ${metric === stage ? "text-ink" : "text-ink-3"}`}>
                  {METRIC_LABEL[metric]}
                </span>
              </li>
            ))}
          </ol>
        </nav>

        <section key={stage} className="hg-rise mt-10 flex flex-col items-center text-center">
          <p className="hg-eyebrow">{METRIC_LABEL[stage]}</p>
          <h1 ref={headingRef} tabIndex={-1} className="hg-h2 mt-2 outline-none">
            {METRIC_PROMPT[stage]}
          </h1>

          <div className="mt-8">
            <ScoreRing score={score} />
          </div>
          <div className="mt-3 flex items-center gap-2">
            <StatusLabel tone={scoreTone(score)}>{scoreStatus(score)}</StatusLabel>
            {story.projected ? (
              <span className="rounded-full bg-raised px-2.5 py-0.5 text-[12px] leading-[18px] text-ink-2">Projected</span>
            ) : null}
          </div>

          <p className="mt-6 max-w-[520px] text-[17px] leading-[28px] text-ink">{story.takeaway}</p>

          {story.opportunity ? (
            <div className="mt-6 w-full rounded-card bg-surface px-5 py-4 text-left">
              <p className="hg-eyebrow">Main opportunity</p>
              <p className="mt-1 text-ink">{story.opportunity}</p>
            </div>
          ) : null}

          <p className="mt-6 text-[14px] leading-[22px] text-ink-3">{story.evidence}</p>
          <details className="mt-1 w-full max-w-[520px] text-left text-[14px] leading-[22px]">
            <summary className="mx-auto flex min-h-11 w-max cursor-pointer items-center text-accent hover:text-accent-hover">
              How this estimate works
            </summary>
            <div className="flex flex-col gap-2 rounded-card bg-surface px-5 py-4 text-ink-2">
              <p>{story.how}</p>
              <ul className="flex list-disc flex-col gap-1 pl-5">
                {story.limitations.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </details>
        </section>

        {last ? (
          <div className="hg-rise mt-8 flex flex-col items-center gap-1 text-center">
            <span className="text-[13px] font-medium tracking-wide text-ink-3">Overall</span>
            <span className="flex items-baseline gap-1">
              <span
                className={`text-[28px] font-medium leading-none tabular-nums md:text-[32px] ${
                  scoreTone(grade.overall) === "good" ? "text-good" : "text-warn"
                }`}
              >
                {grade.overall.toFixed(1)}
              </span>
              <span className="text-[14px] text-ink-3">/ 10</span>
            </span>
            <StatusLabel tone={scoreTone(grade.overall)}>{scoreStatus(grade.overall)}</StatusLabel>
          </div>
        ) : null}

        <div className="mt-10 flex flex-col items-center gap-3">
          <div className="flex w-full items-center justify-center gap-3">
            {index > 0 ? (
              <Button variant="secondary" onClick={() => go(METRICS[index - 1])}>
                <span aria-hidden>←</span> Back
              </Button>
            ) : null}
            {last ? (
              <Button onClick={finish}>
                See my next steps <span aria-hidden>→</span>
              </Button>
            ) : (
              <Button onClick={() => go(METRICS[index + 1])}>
                Next: {METRIC_LABEL[METRICS[index + 1]]} <span aria-hidden>→</span>
              </Button>
            )}
          </div>
          <p className="text-[14px] leading-[22px] text-ink-3">
            {index + 1} of {METRICS.length}
          </p>
        </div>
      </main>
    </div>
  );
}

export function RevealFallback() {
  return <div className="flex flex-1 items-center justify-center text-ink-2">Loading your scores…</div>;
}
