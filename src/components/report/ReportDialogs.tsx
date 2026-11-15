"use client";

import { StatusLabel } from "@/components/ui";
import type { ReportData } from "@/report/ReportContext";
import {
  focusRegions,
  METRIC_LABEL,
  METRIC_PROMPT,
  METRICS,
  scoreStatus,
  scoreTone,
  type Metric,
} from "@/report/view";
import { OVERALL_FLOOR_MARGIN, OVERALL_WEIGHTS, PROGRESSION_WINDOW_DAYS } from "@/scoring";

const SEVERITY_RANK = { blocker: 0, warn: 1, info: 2 } as const;

export function OverallExplanation({ data }: { data: ReportData }) {
  const { grade } = data;
  const blend = METRICS.reduce((sum, metric) => sum + OVERALL_WEIGHTS[metric] * grade[metric].score, 0);
  const weakest = [...METRICS].sort((a, b) => grade[a].score - grade[b].score)[0];
  const capped = blend - grade.overall >= 0.05;

  return (
    <div className="flex flex-col gap-5 text-[15px] leading-[24px]">
      <p className="flex items-baseline gap-3">
        <span className="text-[32px] font-semibold leading-[40px] tabular-nums">{grade.overall.toFixed(1)}</span>
        <span className="text-ink-3">/ 10</span>
        <StatusLabel tone={scoreTone(grade.overall)}>{scoreStatus(grade.overall)}</StatusLabel>
      </p>
      <p className="text-ink">A weighted blend of your three scores.</p>
      <dl className="grid grid-cols-[1fr_auto_auto] gap-x-6 gap-y-2">
        {METRICS.map((metric) => (
          <div key={metric} className="contents">
            <dt className="text-ink-2">{METRIC_LABEL[metric]}</dt>
            <dd className="text-right tabular-nums text-ink">{grade[metric].score.toFixed(1)}</dd>
            <dd className="text-right tabular-nums text-ink-3">× {Math.round(OVERALL_WEIGHTS[metric] * 100)}%</dd>
          </div>
        ))}
      </dl>
      <p className="text-ink-2">
        The overall can&apos;t be more than {OVERALL_FLOOR_MARGIN} points above your lowest score, so one weak area
        isn&apos;t hidden by the others.
        {capped
          ? ` Your blend is ${blend.toFixed(1)}, held to ${grade.overall.toFixed(1)} by ${METRIC_LABEL[weakest].toLowerCase()}.`
          : ""}
      </p>
    </div>
  );
}

export function ScoreExplanation({ metric, data }: { metric: Metric; data: ReportData }) {
  const { grade, baseline, stories, physique, overrides, regions } = data;
  const story = stories[metric];
  const score = grade[metric].score;
  const findings =
    metric === "coverage"
      ? focusRegions(regions, 6).map((row) => ({ id: row.id, title: `${row.name}: ${row.summary}`, detail: row.assessment }))
      : grade.findings
          .filter((finding) => finding.metric === metric && finding.severity !== "info")
          .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
          .slice(0, 3);
  const contextual = physique?.status === "graded" || Object.keys(overrides).length > 0;
  const baselineScore = baseline[metric].score;

  return (
    <div className="flex flex-col gap-5 text-[15px] leading-[24px]">
      <div>
        <p className="text-ink-2">{METRIC_PROMPT[metric]}</p>
        <p className="mt-2 flex items-baseline gap-3">
          <span className="text-[32px] font-semibold leading-[40px] tabular-nums">{score.toFixed(1)}</span>
          <span className="text-ink-3">/ 10</span>
          <StatusLabel tone={scoreTone(score)}>{scoreStatus(score)}</StatusLabel>
        </p>
        {story.projected ? <p className="text-[14px] text-ink-3">Projected, not observed.</p> : null}
      </div>
      <p className="text-ink">{story.takeaway}</p>
      {story.opportunity ? (
        <div>
          <h3 className="hg-eyebrow">Main opportunity</h3>
          <p className="mt-1 text-ink">{story.opportunity}</p>
        </div>
      ) : null}
      {findings.length > 0 ? (
        <div>
          <h3 className="hg-eyebrow">What&apos;s behind it</h3>
          <ul className="mt-2 flex flex-col gap-3">
            {findings.map((finding) => (
              <li key={finding.id}>
                <p className="text-ink">{finding.title}</p>
                <p className="text-[14px] leading-[22px] text-ink-2">{finding.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div>
        <h3 className="hg-eyebrow">Evidence</h3>
        <p className="mt-1 text-ink-2">{story.evidence}.</p>
        {contextual && Math.abs(baselineScore - score) >= 0.1 ? (
          <p className="mt-1 text-[14px] leading-[22px] text-ink-3">
            With standard targets for every muscle, this would be {baselineScore.toFixed(1)}.
          </p>
        ) : null}
      </div>
      <div>
        <h3 className="hg-eyebrow">How it works</h3>
        <p className="mt-1 text-ink-2">{story.how}</p>
      </div>
      <div>
        <h3 className="hg-eyebrow">Limitations</h3>
        <ul className="mt-1 flex list-disc flex-col gap-1 pl-5 text-ink-2">
          {story.limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ReportDetailsPanel({ data }: { data: ReportData }) {
  const { details } = data;
  const rows: { label: string; value: string }[] = [
    {
      label: "Workout history",
      value: details.dateRange
        ? `${details.workouts} workouts, ${details.dateRange} (${details.timeZone})`
        : "No logged workouts imported",
    },
    { label: `Logged working sets (last ${PROGRESSION_WINDOW_DAYS / 7} weeks)`, value: String(details.loggedSets) },
    { label: "Routines graded", value: String(details.routines) },
    { label: "Photos", value: details.photos },
    {
      label: "Priorities",
      value:
        details.goals.you + details.goals.photos === 0
          ? "Standard targets for every muscle"
          : [
              details.goals.you ? `${details.goals.you} set by you` : null,
              details.goals.photos ? `${details.goals.photos} from photo context` : null,
            ]
              .filter(Boolean)
              .join(" · "),
    },
    { label: "Report generated", value: details.generated ?? "Unknown" },
  ];

  return (
    <div className="flex flex-col gap-6 text-[15px] leading-[24px]">
      {data.hevy.demo ? (
        <p className="rounded-control bg-warn/10 px-4 py-3 text-[14px] text-warn">
          Demo report: example routines and priorities, not a real Hevy account. No photos were analyzed.
        </p>
      ) : null}
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-[180px_1fr]">
        {rows.map((row) => (
          <div key={row.label} className="contents">
            <dt className="text-ink-3">{row.label}</dt>
            <dd className="text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>

      <section>
        <h3 className="font-medium text-ink">Inputs per score</h3>
        <ul className="mt-2 flex flex-col gap-1 text-ink-2">
          {(["coverage", "growth", "recovery"] as const).map((metric) => (
            <li key={metric}>
              <span className="text-ink">{METRIC_LABEL[metric]}:</span> {data.stories[metric].evidence}.
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3 className="font-medium text-ink">Effective sets</h3>
        <p className="mt-2 text-ink-2">
          Each working set in your routines counts fully toward the muscle an exercise mainly trains (direct sets), and
          partially toward muscles it also works (indirect sets). For example, a bench press set adds about 0.4 of a set
          to triceps. Warm-up sets don&apos;t count.
        </p>
      </section>

      <section>
        <h3 className="font-medium text-ink">Targets</h3>
        <p className="mt-2 text-ink-2">
          Each muscle has a weekly range. Muscles you prioritize, or that photos suggest are behind, get a higher range.
          Lower-priority muscles get a lower one. A goal you set overrides photo context.
        </p>
      </section>

      <section>
        <h3 className="font-medium text-ink">Known limitations</h3>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-ink-2">
          <li>Coverage and recovery read your saved routines, not week-to-week logs.</li>
          <li>Growth signals are estimates from logged sets, not proof of muscle growth.</li>
          <li>Recovery is an estimate from training structure, not a readiness measurement.</li>
          {data.hevy.workoutsTruncated ? (
            <li>Your account has more than 3,000 workouts. Only the first 3,000 Hevy returned are counted.</li>
          ) : null}
          {details.unmatched.length > 0 ? (
            <li>
              {details.unmatched.length} exercise{details.unmatched.length === 1 ? " has" : "s have"} no Hevy exercise
              template and {details.unmatched.length === 1 ? "is" : "are"} left out: {details.unmatched.slice(0, 6).join(", ")}
              {details.unmatched.length > 6 ? "…" : ""}.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
