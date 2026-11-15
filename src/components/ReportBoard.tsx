"use client";

import { PhotoSlot } from "@/components/PhotoSlot";
import { PHYSIQUE_VIEWS, type PhysiqueAssessment, type PhysiqueView } from "@/physique/types";
import type { Finding, LagMap, ScoreSnapshot } from "@/scoring";
import {
  lackingSummary,
  METRIC_LABEL,
  METRIC_QUESTION,
  METRICS,
  scoreTone,
  topFindings,
  verdict,
} from "@/report/summary";
import { useReport } from "@/report/useReport";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const SNAPSHOT_KEYS = ["coverage", "growth", "recovery", "overall"] as const;
const SNAPSHOT_LABEL: Record<(typeof SNAPSHOT_KEYS)[number], string> = {
  coverage: "Coverage",
  growth: "Growth",
  recovery: "Recovery",
  overall: "Overall",
};

function Delta({ before, after }: { before: ScoreSnapshot; after: ScoreSnapshot }) {
  const changes = SNAPSHOT_KEYS.filter((key) => key !== "overall")
    .map((key) => ({ key, diff: Math.round((after[key] - before[key]) * 10) / 10 }))
    .filter((row) => Math.abs(row.diff) >= 0.1);
  if (changes.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {changes.map(({ key, diff }) => (
        <span
          key={key}
          className={`rounded-full px-2.5 py-1 text-xs font-medium tabular-nums ${
            diff > 0 ? "bg-emerald-400/10 text-emerald-300" : "bg-rose-400/10 text-rose-300"
          }`}
        >
          {SNAPSHOT_LABEL[key]} {diff > 0 ? "+" : ""}
          {diff.toFixed(1)}
        </span>
      ))}
    </div>
  );
}

function Header({ name, routines, workouts }: { name: string; routines: number; workouts: number }) {
  return (
    <header className="border-b border-zinc-900">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-sm font-semibold tracking-[0.28em] text-[#C7FDA0]">
          HEVYGRADE
        </Link>
        <p className="text-sm text-zinc-400">
          {name} · {routines} routines · {workouts} workouts
        </p>
      </div>
    </header>
  );
}

function PhotoStep({
  onGraded,
}: {
  onGraded: (result: {
    status: "graded" | "skipped";
    lagMap: LagMap;
    findings: Finding[];
    assessment?: PhysiqueAssessment;
    views: PhysiqueView[];
  }) => void;
}) {
  const [photos, setPhotos] = useState<Partial<Record<PhysiqueView, File>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const views = PHYSIQUE_VIEWS.filter((view) => photos[view]);

  async function grade() {
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      for (const view of views) form.append(view, photos[view]!);
      const response = await fetch("/api/physique", { method: "POST", body: form });
      const payload = (await response.json()) as {
        error?: string;
        assessment?: PhysiqueAssessment;
        lagMap?: LagMap;
        findings?: Finding[];
      };
      if (!response.ok) throw new Error(payload.error ?? "Physique grading failed.");
      onGraded({
        status: "graded",
        lagMap: payload.lagMap ?? {},
        findings: payload.findings ?? [],
        assessment: payload.assessment,
        views,
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Physique grading failed.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-14">
      <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">Step 2 of 2</p>
      <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Show us what&apos;s behind.</h1>
      <p className="mt-4 max-w-xl text-lg leading-8 text-zinc-300">
        Front, side, and back photos. Your split gets graded against what they show is lagging, not a generic
        checklist. iPhone HEIC is fine.
      </p>
      <div className="mt-10 grid grid-cols-3 divide-x divide-zinc-900 rounded-2xl border border-zinc-900">
        {PHYSIQUE_VIEWS.map((view) => (
          <PhotoSlot
            key={view}
            view={view}
            file={photos[view]}
            onFile={(file) => setPhotos((current) => ({ ...current, [view]: file }))}
          />
        ))}
      </div>
      <div className="mt-8 flex flex-wrap items-center gap-5">
        <button
          type="button"
          onClick={grade}
          disabled={busy || views.length === 0}
          className="rounded-full bg-[#267FE8] px-8 py-3 text-base font-semibold text-white transition hover:bg-[#1f6fd0] disabled:opacity-30"
        >
          {busy ? "Reading your photos…" : "Grade my physique"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onGraded({ status: "skipped", lagMap: {}, findings: [], views: [] })}
          className="text-base text-zinc-400 hover:text-zinc-200 disabled:opacity-30"
        >
          Skip, grade my split only
        </button>
      </div>
      {error ? <p className="mt-4 text-base text-rose-300">{error}</p> : null}
    </main>
  );
}

export function ReportBoard() {
  const router = useRouter();
  const { hevy, physique, grade, plan, findings, setPhysiqueResult, resetPhysique } = useReport();

  if (!hevy || !grade || !plan) {
    return <div className="flex min-h-full flex-1 items-center justify-center text-zinc-400">Loading split…</div>;
  }

  if (!physique) {
    return (
      <div className="flex min-h-full flex-1 flex-col bg-[#07080a] text-zinc-100">
        <Header name={hevy.user.name} routines={hevy.days.length} workouts={hevy.workoutCount} />
        <PhotoStep
          onGraded={(result) => {
            setPhysiqueResult(result);
            router.push("/reveal");
          }}
        />
      </div>
    );
  }

  const summary = lackingSummary(grade, plan, physique.status === "graded");

  return (
    <div className="min-h-full bg-[#07080a] text-zinc-100">
      <Header name={hevy.user.name} routines={hevy.days.length} workouts={hevy.workoutCount} />

      <main className="mx-auto max-w-4xl px-6 pb-20 pt-10">
        <section className="grid gap-4 sm:grid-cols-[1.2fr_repeat(3,1fr)]">
          <div className="rounded-2xl border border-zinc-800 p-5">
            <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">Overall</p>
            <p className={`mt-2 text-5xl font-semibold tabular-nums ${scoreTone(grade.overall)}`}>
              {grade.overall.toFixed(1)}
            </p>
            <p className="mt-1 text-sm text-zinc-400">{verdict(grade.overall)}</p>
          </div>
          {METRICS.map((metric) => (
            <div key={metric} className="rounded-2xl border border-zinc-800 p-5">
              <p className="text-xs uppercase tracking-[0.16em] text-zinc-500">{METRIC_LABEL[metric]}</p>
              <p className={`mt-2 text-3xl font-semibold tabular-nums ${scoreTone(grade[metric].score)}`}>
                {grade[metric].score.toFixed(1)}
              </p>
              <p className="mt-1 text-sm text-zinc-400">{verdict(grade[metric].score)}</p>
            </div>
          ))}
        </section>

        <section className="mt-12">
          <h2 className="text-sm uppercase tracking-[0.18em] text-zinc-500">What you&apos;re missing</h2>
          <p className="mt-3 text-xl leading-8 text-zinc-100">{summary.headline}</p>
          {summary.points.length > 0 ? (
            <ul className="mt-4 flex flex-col gap-2">
              {summary.points.map((point) => (
                <li key={point} className="flex gap-3 text-base leading-7 text-zinc-300">
                  <span aria-hidden className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#267FE8]" />
                  {point}
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="mt-12">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-sm uppercase tracking-[0.18em] text-zinc-500">Next steps</h2>
            <p className="text-sm text-zinc-500">Biggest gain across all three first</p>
          </div>

          {plan.steps.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-zinc-800 p-5 text-base leading-7 text-zinc-300">
              Your split is already at its balance point. From here, any change trades one score for another.
            </p>
          ) : (
            <>
              <ol className="mt-4 flex flex-col gap-3">
                {plan.steps.map((step, position) => (
                  <li key={step.id} className="rounded-2xl border border-zinc-800 p-5">
                    <div className="flex gap-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#267FE8]/15 text-sm font-semibold text-[#7DB6F5]">
                        {position + 1}
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <p className="text-lg font-medium text-zinc-50">{step.title}</p>
                        <p className="text-base leading-7 text-zinc-400">{step.reason}</p>
                        <Delta before={step.before} after={step.after} />
                      </div>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="mt-4 rounded-2xl bg-zinc-900/60 p-5">
                <p className="text-base font-medium text-zinc-100">
                  After {plan.steps.length === 1 ? "this change" : `all ${plan.steps.length} changes`}
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {SNAPSHOT_KEYS.map((key) => (
                    <div key={key}>
                      <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{SNAPSHOT_LABEL[key]}</p>
                      <p className="mt-1 text-lg tabular-nums text-zinc-300">
                        {plan.start[key].toFixed(1)} <span className="text-zinc-600">→</span>{" "}
                        <span className={`font-semibold ${scoreTone(plan.end[key])}`}>{plan.end[key].toFixed(1)}</span>
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-sm leading-6 text-zinc-500">
                  Nobody gets 10 on all three. The plan stops where another change would cost more than it adds.
                </p>
              </div>
            </>
          )}
        </section>

        <section className="mt-12">
          <h2 className="text-sm uppercase tracking-[0.18em] text-zinc-500">Why these scores</h2>
          <div className="mt-4 flex flex-col divide-y divide-zinc-900 rounded-2xl border border-zinc-800">
            {METRICS.map((metric) => {
              const rows = topFindings(findings, metric, 6);
              return (
                <details key={metric} className="group px-5 py-4">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
                    <span>
                      <span className="text-base font-medium text-zinc-100">{METRIC_LABEL[metric]}</span>
                      <span className="ml-3 text-sm text-zinc-500">{METRIC_QUESTION[metric]}</span>
                    </span>
                    <span className={`text-base font-semibold tabular-nums ${scoreTone(grade[metric].score)}`}>
                      {grade[metric].score.toFixed(1)}
                    </span>
                  </summary>
                  <ul className="mt-3 flex flex-col gap-3">
                    {rows.length === 0 ? (
                      <li className="text-base text-zinc-400">{grade[metric].notes[0] ?? "Nothing flagged."}</li>
                    ) : (
                      rows.map((finding) => (
                        <li key={finding.id}>
                          <p className="text-base text-zinc-100">{finding.title}</p>
                          <p className="text-sm leading-6 text-zinc-400">{finding.detail}</p>
                        </li>
                      ))
                    )}
                  </ul>
                </details>
              );
            })}
          </div>
        </section>

        <nav className="mt-10 flex flex-wrap gap-x-6 gap-y-3 text-sm">
          <Link href="/report/regions" className="text-[#7DB6F5] hover:underline">
            Region breakdown
          </Link>
          <Link href="/reveal" className="text-[#7DB6F5] hover:underline">
            Replay score reveal
          </Link>
          <button type="button" onClick={resetPhysique} className="text-zinc-400 hover:text-zinc-200">
            Retake photos
          </button>
        </nav>
      </main>
    </div>
  );
}
