"use client";

import { Dialog, StatusLabel, TextLink } from "@/components/ui";
import { useReadyReport } from "@/report/ReportContext";
import {
  focusRegions,
  impactLabel,
  METRIC_LABEL,
  METRICS,
  needsAttention,
  overviewHeadline,
  overviewSubline,
  scoreStatus,
  scoreTone,
  type Metric,
} from "@/report/view";
import Link from "next/link";
import { useState } from "react";
import { OverallExplanation, ReportDetailsPanel, ScoreExplanation } from "./ReportDialogs";
import { recAnchor } from "./recAnchor";

function cardDetail(metric: Metric, data: ReturnType<typeof useReadyReport>): string {
  if (metric === "coverage") {
    const attention = data.regions.filter(needsAttention).length;
    const both = data.regions.filter((row) => row.verdict === "both").length;
    if (attention === 0) return "Every muscle on target";
    return both > 0
      ? `${both} flagged and under target`
      : `${attention} area${attention === 1 ? "" : "s"} to look at`;
  }
  if (metric === "growth") {
    return data.stories.growth.projected ? "Projected from routines" : `From ${data.hevy.workoutCount} logged workouts`;
  }
  return "Estimated from your schedule";
}

export function OverviewView() {
  const data = useReadyReport();
  const { grade, regions, recommendations } = data;
  const [openMetric, setOpenMetric] = useState<Metric | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [overallOpen, setOverallOpen] = useState(false);
  const top = recommendations[0];
  const focus = focusRegions(regions);
  const attentionCount = regions.filter(needsAttention).length;
  const overallTone = scoreTone(grade.overall);

  return (
    <div className="flex flex-col gap-10 md:gap-12">
      <section>
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between md:gap-10">
          <div className="min-w-0">
            <p className="hg-eyebrow">Your training, in focus</p>
            <h1 className="hg-h1 mt-2">{overviewHeadline(grade.overall)}</h1>
            <p className="mt-3 max-w-[640px] text-ink-2">{overviewSubline(regions)}</p>
          </div>
          <button
            type="button"
            onClick={() => setOverallOpen(true)}
            aria-haspopup="dialog"
            className="group flex shrink-0 flex-col items-start gap-1 text-left transition-colors hover:text-ink md:items-end md:text-right"
          >
            <span className="flex items-center gap-2 text-[13px] font-medium tracking-wide text-ink-3">
              Overall
              <span aria-hidden className="transition-colors group-hover:text-accent">
                ↗
              </span>
            </span>
            <span className="flex items-baseline gap-1">
              <span
                className={`text-[28px] font-medium leading-none tabular-nums md:text-[32px] ${
                  overallTone === "good" ? "text-good" : "text-warn"
                }`}
              >
                {grade.overall.toFixed(1)}
              </span>
              <span className="text-[14px] text-ink-3">/ 10</span>
            </span>
            <StatusLabel tone={overallTone}>{scoreStatus(grade.overall)}</StatusLabel>
            <span className="sr-only">. How the overall score is calculated.</span>
          </button>
        </div>

        <ul className="mt-8 grid grid-cols-1 gap-3 min-[560px]:grid-cols-3">
          {METRICS.map((metric) => {
            const score = grade[metric].score;
            return (
              <li key={metric}>
                <button
                  type="button"
                  onClick={() => setOpenMetric(metric)}
                  aria-haspopup="dialog"
                  className="group flex h-full w-full flex-col rounded-card border border-line bg-surface p-5 text-left transition-colors hover:border-ink-3/60 hover:bg-raised md:p-6"
                >
                  <span className="flex items-center justify-between text-[15px] font-medium text-ink">
                    {METRIC_LABEL[metric]}
                    <span aria-hidden className="text-ink-3 transition-colors group-hover:text-accent">
                      ↗
                    </span>
                  </span>
                  <span className="mt-4 flex items-baseline gap-1.5">
                    <span className={`hg-score ${scoreTone(score) === "good" ? "text-good" : "text-warn"}`}>
                      {score.toFixed(1)}
                    </span>
                    <span className="text-ink-3">/ 10</span>
                  </span>
                  <span className="mt-1">
                    <StatusLabel tone={scoreTone(score)}>{scoreStatus(score)}</StatusLabel>
                  </span>
                  <span className="mt-1 text-[14px] leading-[22px] text-ink-3">{cardDetail(metric, data)}</span>
                  <span className="sr-only">. Open details.</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex flex-wrap items-center justify-end gap-x-6">
          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            aria-haspopup="dialog"
            className="inline-flex min-h-11 items-center text-[14px] text-accent hover:text-accent-hover"
          >
            How scores work
          </button>
        </div>
      </section>

      <section aria-labelledby="next-move">
        <h2 id="next-move" className="hg-eyebrow">
          Your next move
        </h2>
        {top ? (
          <>
            <article className="mt-3 rounded-card border border-line bg-surface p-5 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <h3 className="flex gap-3 text-[18px] font-semibold leading-[26px]">
                  <span className="tabular-nums text-ink-3">01</span>
                  {top.headline}
                </h3>
                <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[12px] font-medium leading-[18px] text-accent">
                  Start here
                </span>
              </div>
              <p className="mt-3 text-ink">{top.action}.</p>
              <p className="mt-1 text-[14px] leading-[22px] text-ink-3">{top.sessionImpact}</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
                <TextLink href={`/report/plan#${recAnchor(top.id)}`}>
                  View suggested change <span aria-hidden>→</span>
                </TextLink>
                <p className="text-[14px] leading-[22px] text-ink-2">{impactLabel(top.impact)}</p>
              </div>
            </article>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-x-6">
              <p className="text-[14px] leading-[22px] text-ink-3">
                {recommendations.length > 1
                  ? `${recommendations.length - 1} more suggestion${recommendations.length === 2 ? "" : "s"}`
                  : "No other suggestions"}
              </p>
              <TextLink href="/report/plan" className="text-[14px]">
                View your plan <span aria-hidden>→</span>
              </TextLink>
            </div>
          </>
        ) : (
          <div className="mt-3 rounded-card border border-line bg-surface p-5 md:p-6">
            <p className="font-medium text-ink">Keep doing what you&apos;re doing.</p>
            <p className="mt-1 text-ink-2">
              No single change improves your balance enough to recommend right now. Keep logging workouts so progression
              can be tracked, and revisit after your next training block.
            </p>
          </div>
        )}
      </section>

      <section aria-labelledby="focus">
        <div className="flex flex-wrap items-center justify-between gap-x-6">
          <h2 id="focus" className="hg-eyebrow">
            Where to focus
          </h2>
          <TextLink href="/report/regions" className="text-[14px]">
            All muscle regions <span aria-hidden>→</span>
          </TextLink>
        </div>
        {focus.length > 0 ? (
          <ul className="mt-2 divide-y divide-line rounded-card border border-line bg-surface">
            {focus.map((row) => (
              <li key={row.id}>
                <Link
                  href={`/report/regions?open=${row.id}`}
                  className="flex min-h-14 items-center gap-4 px-5 py-3 hover:bg-raised md:px-6"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-4">
                      <span className="font-medium text-ink">{row.name}</span>
                      <StatusLabel tone="warn">{row.summary}</StatusLabel>
                    </span>
                    <span className="mt-0.5 block text-[14px] leading-[22px] text-ink-2">{row.assessment}</span>
                  </span>
                  <span aria-hidden className="text-ink-3">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 rounded-card border border-line bg-surface px-5 py-4 text-ink-2 md:px-6">
            Every muscle is within or above its weekly target.
          </p>
        )}
        <p className="mt-2 text-[14px] leading-[22px] text-ink-3">
          {attentionCount > focus.length ? `${attentionCount - focus.length} more to look at. ` : ""}
          Each muscle is judged on your photos (or the goal you set) and your training together.
        </p>
      </section>

      <footer className="flex flex-col gap-1 border-t border-line pt-6 text-[14px] leading-[22px] sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setDetailsOpen(true)}
          aria-haspopup="dialog"
          className="inline-flex min-h-11 items-center text-left text-ink-2 hover:text-ink"
        >
          Report details: date range · data sources · limitations
        </button>
        <div className="flex flex-wrap gap-x-6">
          <Link href="/reveal" className="inline-flex min-h-11 items-center text-ink-2 hover:text-ink">
            Replay reveal
          </Link>
          <Link href="/photos" className="inline-flex min-h-11 items-center text-ink-2 hover:text-ink">
            Update photos
          </Link>
          <Link href="/connect" className="inline-flex min-h-11 items-center text-ink-2 hover:text-ink">
            Reconnect Hevy
          </Link>
        </div>
      </footer>

      <Dialog
        open={openMetric !== null}
        onClose={() => setOpenMetric(null)}
        title={openMetric ? METRIC_LABEL[openMetric] : ""}
      >
        {openMetric ? <ScoreExplanation metric={openMetric} data={data} /> : null}
      </Dialog>
      <Dialog open={overallOpen} onClose={() => setOverallOpen(false)} title="Overall score">
        <OverallExplanation data={data} />
      </Dialog>
      <Dialog open={detailsOpen} onClose={() => setDetailsOpen(false)} title="How scores work">
        <ReportDetailsPanel data={data} />
      </Dialog>
    </div>
  );
}
