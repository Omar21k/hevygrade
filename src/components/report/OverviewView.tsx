"use client";

import { EvidenceList } from "./Evidence";
import { Dialog, StatusLabel, TextLink } from "@/components/ui";
import { useReadyReport } from "@/report/ReportContext";
import {
  focusRegions,
  impactLabel,
  METRIC_LABEL,
  METRICS,
  lackingFromPhotos,
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
    const lacking = data.regions.filter(lackingFromPhotos);
    const photos = data.regions.some((row) => row.photo.kind !== "no-photos");
    if (photos) {
      if (lacking.length === 0) return "Photos don't show a clear lag";
      return lacking.length === 1 ? `${lacking[0].name} behind in photos` : `${lacking.length} muscles behind in photos`;
    }
    const below = data.regions.filter((row) => row.status === "below-target").length;
    if (below === 0) return "Every muscle on target";
    return `${below} area${below === 1 ? "" : "s"} below target`;
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
  const focus = focusRegions(regions);
  const attentionCount = focus.length;
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
            className="group flex shrink-0 items-baseline gap-2 self-start text-left md:mt-1"
          >
            <span className="text-[13px] font-medium tracking-wide text-ink-3">Overall</span>
            <span
              className={`text-[22px] font-medium leading-none tabular-nums ${
                overallTone === "good" ? "text-good" : "text-ink-2"
              }`}
            >
              {grade.overall.toFixed(1)}
            </span>
            <span className="text-[13px] text-ink-3">/ 10</span>
            <span aria-hidden className="text-[13px] text-ink-3 transition-colors group-hover:text-accent">
              ↗
            </span>
            <span className="sr-only">
              {scoreStatus(grade.overall)}. How the overall score is calculated.
            </span>
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
        <div className="flex flex-wrap items-center justify-between gap-x-6">
          <h2 id="next-move" className="hg-eyebrow">
            {recommendations.length > 1 ? `Your next moves · ${recommendations.length}` : "Your next move"}
          </h2>
          {recommendations.length > 0 ? (
            <TextLink href="/report/plan" className="text-[14px]">
              View your plan <span aria-hidden>→</span>
            </TextLink>
          ) : null}
        </div>
        {recommendations.length > 0 ? (
          <ol className="mt-3 flex flex-col gap-3">
            {recommendations.map((rec, position) => (
              <li key={rec.id}>
                <article
                  className={`rounded-card border bg-surface p-5 md:p-6 ${position === 0 ? "border-accent/40" : "border-line"}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <h3 className="flex gap-3 text-[18px] font-semibold leading-[26px]">
                      <span className="tabular-nums text-ink-3">{String(position + 1).padStart(2, "0")}</span>
                      {rec.headline}
                    </h3>
                    {position === 0 ? (
                      <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[12px] font-medium leading-[18px] text-accent">
                        Start here
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-3 text-ink">{rec.action}.</p>
                  <p className="mt-1 text-[14px] leading-[22px] text-ink-3">{rec.sessionImpact}</p>
                  {rec.evidence.length > 0 ? (
                    <div className="mt-4">
                      <EvidenceList
                        compact
                        items={rec.evidence.filter((item) => item.label === "Photos" || item.label === "Your logs" || item.label === "Trend")}
                      />
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
                    <TextLink href={`/report/plan#${recAnchor(rec.id)}`}>
                      View suggested change <span aria-hidden>→</span>
                    </TextLink>
                    <p className="text-[14px] leading-[22px] text-ink-2">{impactLabel(rec.impact)}</p>
                  </div>
                </article>
              </li>
            ))}
          </ol>
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
          With photos, this list is only what the photos show as behind. Your sets explain a likely cause. Glutes, calves, and forearms stay off it unless you set that goal.
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
