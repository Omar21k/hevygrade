"use client";

import { PhotoSlot } from "@/components/PhotoSlot";
import { loadHevySession, type HevyPayload } from "@/hevy/session";
import { lagMapFromPhysique } from "@/physique/lagMap";
import { PHYSIQUE_VIEWS, type PhysiqueAssessment, type PhysiqueView } from "@/physique/types";
import {
  gradeSplit,
  registerExercises,
  type Finding,
  type LagMap,
  type RegionId,
} from "@/scoring";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

function scoreTone(score: number): string {
  if (score >= 8) return "text-emerald-300";
  if (score >= 5.5) return "text-amber-300";
  return "text-rose-300";
}

const METRICS = ["coverage", "growth", "recovery"] as const;

const METRIC_COPY: Record<(typeof METRICS)[number], string> = {
  coverage:
    "Does the split train the lagging tissue, or just a sibling of the same muscle.",
  growth:
    "Weekly volume, frequency, and whether Hevy history shows the work is actually progressing.",
  recovery:
    "How fatiguing this split is relative to the week — overlap, session size, and rest.",
};

export function ReportBoard() {
  const router = useRouter();
  const [hevy, setHevy] = useState<HevyPayload | null>(null);
  const [photos, setPhotos] = useState<Partial<Record<PhysiqueView, File>>>({});
  const [physiqueLag, setPhysiqueLag] = useState<LagMap>({});
  const [physiqueFindings, setPhysiqueFindings] = useState<Finding[]>([]);
  const [physiqueError, setPhysiqueError] = useState<string | null>(null);
  const [physiqueBusy, setPhysiqueBusy] = useState(false);
  const [lagOverrides, setLagOverrides] = useState<LagMap>({});

  useEffect(() => {
    const session = loadHevySession();
    if (!session) {
      router.replace("/connect");
      return;
    }
    registerExercises(session.exercises ?? []);
    setHevy(session);
  }, [router]);

  const lagMap = useMemo(
    () => ({ ...physiqueLag, ...lagOverrides }),
    [physiqueLag, lagOverrides],
  );

  const grade = useMemo(() => {
    if (!hevy) return null;
    return gradeSplit({
      split: hevy.split,
      lagMap,
      history: hevy.history,
    });
  }, [hevy, lagMap]);

  async function analyzePhysique() {
    setPhysiqueBusy(true);
    setPhysiqueError(null);
    try {
      const form = new FormData();
      for (const view of PHYSIQUE_VIEWS) {
        const file = photos[view];
        if (file) form.append(view, file);
      }
      const response = await fetch("/api/physique", { method: "POST", body: form });
      const payload = (await response.json()) as {
        error?: string;
        assessment?: PhysiqueAssessment;
        lagMap?: LagMap;
        findings?: Finding[];
      };
      if (!response.ok) throw new Error(payload.error ?? "Physique grading failed");
      setPhysiqueLag(payload.lagMap ?? {});
      setPhysiqueFindings(payload.findings ?? []);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Physique grading failed";
      setPhysiqueError(message);
      const tagged = (Object.keys(lagOverrides) as RegionId[]).filter(
        (id) => lagOverrides[id] === "lagging",
      );
      if (tagged.length > 0) {
        const { lagMap: next, findings } = lagMapFromPhysique({
          viewsPresent: PHYSIQUE_VIEWS.filter((view) => photos[view]),
          developments: tagged.map((region) => ({
            region,
            development: 2,
            confidence: 1,
          })),
          blindSpots: [],
          notes: [],
        });
        setPhysiqueLag(next);
        setPhysiqueFindings(findings);
      }
    } finally {
      setPhysiqueBusy(false);
    }
  }

  function cyclePriority(region: RegionId) {
    setLagOverrides((current) => {
      const next = { ...current };
      const effective = next[region] ?? lagMap[region];
      if (effective === "lagging") next[region] = "maintain";
      else next[region] = "lagging";
      return next;
    });
  }

  if (!hevy || !grade) {
    return (
      <div className="flex min-h-full flex-1 items-center justify-center text-base text-zinc-400">
        Loading split…
      </div>
    );
  }

  const findings = [...physiqueFindings, ...grade.findings];
  const grouped = METRICS.map((metric) => ({
    metric,
    rows: findings.filter((finding) => finding.metric === metric),
  }));

  return (
    <div className="min-h-full bg-[#07080a] text-zinc-100">
      <header className="sticky top-0 z-10 border-b border-zinc-900 bg-[#07080a]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-sm font-semibold tracking-[0.28em] text-[#C7FDA0]">
            HEVYGRADE
          </Link>
          <p className="text-sm text-zinc-300">
            {hevy.user.name} · {hevy.days.length} routines · {hevy.workoutCount} workouts
          </p>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-0 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="border-b border-zinc-900 px-6 py-6 lg:sticky lg:top-[57px] lg:h-[calc(100vh-57px)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-zinc-400">
            Score
          </p>
          <p className={`mt-3 text-5xl font-semibold ${scoreTone(grade.overall)}`}>
            {grade.overall.toFixed(1)}
          </p>
          <ul className="mt-8 flex flex-col gap-5">
            {(
              [
                ["Coverage", grade.coverage.score, "coverage"],
                ["Growth", grade.growth.score, "growth"],
                ["Recovery", grade.recovery.score, "recovery"],
              ] as const
            ).map(([label, score, metric]) => (
              <li key={label} className="border-b border-zinc-800 pb-5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-lg font-medium text-zinc-50">{label}</span>
                  <span className={`text-lg font-semibold ${scoreTone(score)}`}>
                    {score.toFixed(1)}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6 text-zinc-300">{METRIC_COPY[metric]}</p>
              </li>
            ))}
          </ul>
        </aside>

        <main className="px-6 py-6">
          <section>
            <div className="mb-3 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-zinc-100">Physique</h2>
                <p className="mt-1 text-sm text-zinc-300">
                  Front, side, and back. HEIC from iPhone is fine — drop the file if the picker hides it.
                </p>
              </div>
              <button
                type="button"
                onClick={analyzePhysique}
                disabled={physiqueBusy || PHYSIQUE_VIEWS.every((view) => !photos[view])}
                className="rounded-full bg-[#267FE8] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-30"
              >
                {physiqueBusy ? "Reading photos…" : "Grade photos"}
              </button>
            </div>
            <div className="grid grid-cols-3 divide-x divide-zinc-900 border-y border-zinc-900">
              {PHYSIQUE_VIEWS.map((view) => (
                <PhotoSlot
                  key={view}
                  view={view}
                  file={photos[view]}
                  onFile={(file) => setPhotos((current) => ({ ...current, [view]: file }))}
                />
              ))}
            </div>
            {physiqueError ? (
              <p className="mt-2 text-sm text-rose-300">{physiqueError}</p>
            ) : null}
          </section>

          {grouped.map((group) => (
            <section key={group.metric} className="mt-10">
              <div className="border-b border-zinc-800 pb-3">
                <h2 className="text-sm font-medium uppercase tracking-[0.18em] text-zinc-300">
                  {group.metric}
                </h2>
              </div>
              {group.rows.length === 0 ? (
                <p className="py-4 text-base text-zinc-400">Nothing flagged.</p>
              ) : (
                <ul>
                  {group.rows.map((finding) => (
                    <li
                      key={finding.id}
                      className="grid gap-2 border-b border-zinc-900 py-4 sm:grid-cols-[96px_minmax(0,1fr)_minmax(0,1fr)] sm:items-start"
                    >
                      <span
                        className={`text-sm font-medium uppercase ${
                          finding.severity === "blocker"
                            ? "text-rose-300"
                            : finding.severity === "warn"
                              ? "text-amber-300"
                              : "text-zinc-400"
                        }`}
                      >
                        {finding.severity}
                      </span>
                      <div>
                        <p className="text-base font-medium text-zinc-50">{finding.title}</p>
                        <p className="mt-1 text-base leading-7 text-zinc-300">{finding.detail}</p>
                      </div>
                      <p className="text-base leading-7 text-zinc-100">
                        {finding.suggestedChange ?? ""}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <section className="mt-10">
            <h2 className="border-b border-zinc-800 pb-2 text-sm font-medium uppercase tracking-[0.18em] text-zinc-300">
              Regions
            </h2>
            <table className="w-full text-left text-base">
              <thead>
                <tr className="text-xs uppercase tracking-[0.14em] text-zinc-400">
                  <th className="py-3 font-medium">Region</th>
                  <th className="py-3 font-medium">Priority</th>
                  <th className="py-3 font-medium">Sets</th>
                  <th className="py-3 font-medium">Target</th>
                  <th className="py-3 font-medium">Freq</th>
                  <th className="py-3 font-medium">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {grade.regions
                  .filter(
                    (row) =>
                      row.priority === "lagging" ||
                      row.effectiveSets > 0 ||
                      row.coverageScore < 6,
                  )
                  .map((row) => (
                    <tr key={row.region} className="border-t border-zinc-900">
                      <td className="py-3 text-zinc-100">{row.label}</td>
                      <td className="py-3">
                        <button
                          type="button"
                          onClick={() => cyclePriority(row.region)}
                          className={
                            row.priority === "lagging" ? "text-amber-300" : "text-zinc-300"
                          }
                        >
                          {row.priority ?? "—"}
                        </button>
                      </td>
                      <td className="py-3 text-zinc-200">
                        {row.effectiveSets}
                        {row.hasPrimary ? "" : " · no primary"}
                      </td>
                      <td className="py-3 text-zinc-300">
                        {row.targetLow}–{row.targetHigh}
                      </td>
                      <td className="py-3 text-zinc-300">{row.frequency}×</td>
                      <td className={`py-3 ${scoreTone(row.coverageScore)}`}>
                        {row.coverageScore}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p className="mt-3 text-sm text-zinc-400">
              Click a priority to mark a region as lagging.{" "}
              {grade.flags.growthCappedWithoutHistory
                ? "Growth stays capped at 7 without enough logged history."
                : "Growth includes Hevy load × rep trend."}
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
