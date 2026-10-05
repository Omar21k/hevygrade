"use client";

import { PhotoSlot } from "@/components/PhotoSlot";
import { lagMapFromPhysique } from "@/physique/lagMap";
import { PHYSIQUE_VIEWS, type PhysiqueAssessment, type PhysiqueView } from "@/physique/types";
import {
  fixtures,
  gradeSplit,
  REGION_IDS,
  REGION_META,
  registerExercises,
  type ExerciseDef,
  type Finding,
  type HistorySet,
  type LagMap,
  type RegionId,
  type Split,
} from "@/scoring";
import Link from "next/link";
import { useMemo, useState } from "react";

type HevyPayload = {
  user: { name: string; id?: string };
  split: Split;
  exercises: ExerciseDef[];
  history: HistorySet[];
  unmatched: string[];
  days: { id: string; title: string; movements: number }[];
  workoutCount: number;
};

const SCENARIOS: {
  id: string;
  label: string;
  blurb: string;
  split: Split;
  lagMap: LagMap;
}[] = [
  {
    id: "arms",
    label: "Arms look small from the front",
    blurb: "Incline curls + preacher curls. Generic apps call that a complete biceps session.",
    split: fixtures.armsSmallFromFront,
    lagMap: { brachialis: "lagging" },
  },
  {
    id: "arms-hammers",
    label: "Same split + hammer curls",
    blurb: "Smallest diff: keep the curls, add a primary brachialis movement.",
    split: fixtures.armsWithHammers,
    lagMap: { brachialis: "lagging" },
  },
  {
    id: "upper-chest",
    label: "Lagging upper chest, no incline",
    blurb: "Chest day is flat bench + flys.",
    split: fixtures.laggingUpperChest,
    lagMap: { chest_upper: "lagging" },
  },
  {
    id: "upper-chest-volume",
    label: "Incline is there, volume is not",
    blurb: "Incline press is programmed, but weekly effective sets stay below a lagging target.",
    split: fixtures.upperChestWithVolume,
    lagMap: { chest_upper: "lagging" },
  },
];

function scoreTone(score: number): string {
  if (score >= 8) return "text-emerald-300";
  if (score >= 5.5) return "text-amber-300";
  return "text-rose-300";
}

export function GradePlayground() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0].id);
  const [hevy, setHevy] = useState<HevyPayload | null>(null);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [hevyKey, setHevyKey] = useState("");
  const [hevyError, setHevyError] = useState<string | null>(null);
  const [hevyBusy, setHevyBusy] = useState(false);

  const [photos, setPhotos] = useState<Partial<Record<PhysiqueView, File>>>({});
  const [physique, setPhysique] = useState<PhysiqueAssessment | null>(null);
  const [physiqueFindings, setPhysiqueFindings] = useState<Finding[]>([]);
  const [physiqueLag, setPhysiqueLag] = useState<LagMap>({});
  const [physiqueError, setPhysiqueError] = useState<string | null>(null);
  const [physiqueBusy, setPhysiqueBusy] = useState(false);
  const [lagOverrides, setLagOverrides] = useState<LagMap>({});

  const scenario = SCENARIOS.find((item) => item.id === scenarioId) ?? SCENARIOS[0];

  const split = useMemo(() => {
    if (!hevy) return scenario.split;
    const days = hevy.split.days.filter((day) => selectedDays.includes(day.id));
    return {
      ...hevy.split,
      days: days.length > 0 ? days : hevy.split.days,
    };
  }, [hevy, selectedDays, scenario.split]);

  const lagMap = useMemo(
    () => ({
      ...(hevy ? {} : scenario.lagMap),
      ...physiqueLag,
      ...lagOverrides,
    }),
    [hevy, scenario.lagMap, physiqueLag, lagOverrides],
  );

  const grade = useMemo(
    () =>
      gradeSplit({
        split,
        lagMap,
        history: hevy?.history,
      }),
    [split, lagMap, hevy],
  );

  const findings = [...physiqueFindings, ...grade.findings];

  async function connectHevy() {
    setHevyBusy(true);
    setHevyError(null);
    try {
      const response = await fetch("/api/hevy/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: hevyKey }),
      });
      const payload = (await response.json()) as HevyPayload & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Import failed");
      registerExercises(payload.exercises ?? []);
      setHevy(payload);
      setSelectedDays(payload.split.days.map((day) => day.id));
      setLagOverrides({});
    } catch (error) {
      setHevyError(error instanceof Error ? error.message : "Import failed");
    } finally {
      setHevyBusy(false);
    }
  }

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
      setPhysique(payload.assessment ?? null);
      setPhysiqueLag(payload.lagMap ?? {});
      setPhysiqueFindings(payload.findings ?? []);
    } catch (error) {
      setPhysiqueError(error instanceof Error ? error.message : "Physique grading failed");
    } finally {
      setPhysiqueBusy(false);
    }
  }

  function toggleLag(region: RegionId) {
    setLagOverrides((current) => {
      const next = { ...current };
      const effective = next[region] ?? lagMap[region];
      if (effective === "lagging") next[region] = "maintain";
      else next[region] = "lagging";
      return next;
    });
  }

  function applyManualPhysique() {
    const developments = REGION_IDS.filter((id) => lagOverrides[id] === "lagging" || physiqueLag[id]).map(
      (region) => ({
        region,
        development: (lagOverrides[region] ?? physiqueLag[region]) === "lagging" ? 2 : 3,
        confidence: 1,
      }),
    );
    const { lagMap: next, findings: nextFindings } = lagMapFromPhysique({
      viewsPresent: PHYSIQUE_VIEWS.filter((view) => photos[view]),
      developments:
        developments.length > 0
          ? developments
          : [{ region: "brachialis", development: 2, confidence: 1 }],
      blindSpots: [],
      notes: ["Manual lag tags used without vision."],
    });
    setPhysiqueLag(next);
    setPhysiqueFindings(nextFindings);
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3">
        <Link
          href="/"
          className="text-xs font-semibold tracking-[0.28em] text-[#C7FDA0]"
        >
          HEVYGRADE
        </Link>
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-zinc-50 sm:text-4xl">
          Grade the split you already run — against the physique you actually have.
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-zinc-400">
          Hevy keeps logging. We read your routines through their official API, then score the
          plan against your physique.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
          <h2 className="text-sm font-medium text-zinc-200">Hevy connection</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Hevy does not let third-party apps sit inside theirs. A Pro API key is the official
            handshake: you create it at hevy.com/settings?developer, we use it once to pull
            routines and history, and we never store it.
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              value={hevyKey}
              onChange={(event) => setHevyKey(event.target.value)}
              placeholder="Hevy Pro API key"
              className="flex-1 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-500"
            />
            <button
              type="button"
              onClick={connectHevy}
              disabled={hevyBusy || hevyKey.trim().length < 8}
              className="rounded-xl bg-[#267FE8] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {hevyBusy ? "Importing…" : "Import routines"}
            </button>
          </div>
          {hevyError ? <p className="mt-2 text-sm text-rose-300">{hevyError}</p> : null}
          {hevy ? (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-zinc-300">
                {hevy.user.name} · {hevy.days.length} routines · {hevy.workoutCount} recent workouts
              </p>
              <div className="flex flex-col gap-1">
                {hevy.days.map((day) => {
                  const on = selectedDays.includes(day.id);
                  return (
                    <label key={day.id} className="flex items-center gap-2 text-sm text-zinc-400">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() =>
                          setSelectedDays((current) =>
                            on ? current.filter((id) => id !== day.id) : [...current, day.id],
                          )
                        }
                      />
                      <span className="text-zinc-200">{day.title}</span>
                      <span className="text-xs text-zinc-500">{day.movements} movements</span>
                    </label>
                  );
                })}
              </div>
              {hevy.unmatched.length > 0 ? (
                <p className="text-xs text-amber-300">
                  Unmapped movements: {hevy.unmatched.join(", ")}
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-4">
              <p className="mb-2 text-xs text-zinc-500">No key yet? Run interview fixtures:</p>
              <div className="flex flex-col gap-2">
                {SCENARIOS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setScenarioId(item.id);
                      setLagOverrides({});
                    }}
                    className={`rounded-xl border px-3 py-2 text-left text-sm ${
                      item.id === scenarioId
                        ? "border-zinc-500 bg-zinc-800/80 text-zinc-50"
                        : "border-zinc-800 text-zinc-400"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
          <h2 className="text-sm font-medium text-zinc-200">Physique photos</h2>
          <p className="mt-1 text-xs leading-5 text-zinc-500">
            Front / side / back photos become a lag map. Drop iPhone HEIC files here if the
            picker greys them out — Chrome on Mac often hides HEIC from the image dialog.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {PHYSIQUE_VIEWS.map((view) => (
              <PhotoSlot
                key={view}
                view={view}
                file={photos[view]}
                onFile={(file) => setPhotos((current) => ({ ...current, [view]: file }))}
              />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={analyzePhysique}
              disabled={physiqueBusy || PHYSIQUE_VIEWS.every((view) => !photos[view])}
              className="rounded-xl bg-[#267FE8] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              {physiqueBusy ? "Grading photos…" : "Grade physique"}
            </button>
            <button
              type="button"
              onClick={applyManualPhysique}
              className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300"
            >
              Use tagged regions
            </button>
          </div>
          {physiqueError ? <p className="mt-2 text-sm text-rose-300">{physiqueError}</p> : null}
          {physique ? (
            <p className="mt-2 text-xs text-zinc-500">
              Views: {physique.viewsPresent.join(", ") || "unknown"}.{" "}
              {physique.notes.join(" ")}
            </p>
          ) : null}

          <div className="mt-4">
            <h3 className="mb-2 text-sm font-medium text-zinc-200">Lag map</h3>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  "brachialis",
                  "chest_upper",
                  "chest_mid",
                  "delt_side",
                  "lats",
                  "biceps",
                  "glutes",
                ] as RegionId[]
              ).map((region) => {
                const active = lagMap[region] === "lagging";
                return (
                  <button
                    key={region}
                    type="button"
                    onClick={() => toggleLag(region)}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      active
                        ? "border-amber-400/50 bg-amber-400/10 text-amber-200"
                        : "border-zinc-800 text-zinc-500"
                    }`}
                  >
                    {REGION_META[region].label}
                  </button>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <section className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ScoreCard label="Overall" score={grade.overall} />
          <ScoreCard label="Coverage" score={grade.coverage.score} />
          <ScoreCard label="Growth" score={grade.growth.score} />
          <ScoreCard label="Recovery" score={grade.recovery.score} />
        </div>
        {grade.flags.growthCappedWithoutHistory ? (
          <p className="text-xs text-zinc-500">
            Growth is capped at 7 until Hevy workout history is connected.
          </p>
        ) : (
          <p className="text-xs text-zinc-500">
            Growth includes logged Hevy load × rep trend from recent workouts.
          </p>
        )}

        <div className="rounded-2xl border border-zinc-800 p-5">
          <h2 className="text-sm font-medium text-zinc-200">Findings</h2>
          <ul className="mt-3 flex flex-col gap-3">
            {findings.length === 0 ? (
              <li className="text-sm text-zinc-500">No issues flagged.</li>
            ) : (
              findings.map((finding) => (
                <li
                  key={finding.id}
                  className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3"
                >
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-zinc-500">
                    <span>{finding.metric}</span>
                    <span
                      className={
                        finding.severity === "blocker"
                          ? "text-rose-300"
                          : finding.severity === "warn"
                            ? "text-amber-300"
                            : "text-zinc-400"
                      }
                    >
                      {finding.severity}
                    </span>
                  </div>
                  <p className="mt-1 text-sm font-medium text-zinc-100">{finding.title}</p>
                  <p className="mt-1 text-sm leading-6 text-zinc-400">{finding.detail}</p>
                  {finding.suggestedChange ? (
                    <p className="mt-2 text-sm text-emerald-300/90">{finding.suggestedChange}</p>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-800 p-5">
        <h2 className="text-sm font-medium text-zinc-200">Region breakdown</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="pb-2 font-medium">Region</th>
                <th className="pb-2 font-medium">Priority</th>
                <th className="pb-2 font-medium">Effective sets</th>
                <th className="pb-2 font-medium">Target</th>
                <th className="pb-2 font-medium">Freq</th>
                <th className="pb-2 font-medium">Coverage</th>
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
                  <tr key={row.region} className="border-t border-zinc-800/80">
                    <td className="py-2 text-zinc-200">{row.label}</td>
                    <td className="py-2 text-zinc-400">{row.priority ?? "—"}</td>
                    <td className="py-2 text-zinc-300">
                      {row.effectiveSets}
                      {row.hasPrimary ? "" : " · no primary"}
                    </td>
                    <td className="py-2 text-zinc-400">
                      {row.targetLow}–{row.targetHigh}
                    </td>
                    <td className="py-2 text-zinc-400">{row.frequency}×</td>
                    <td className={`py-2 ${scoreTone(row.coverageScore)}`}>{row.coverageScore}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function ScoreCard({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 p-4">
      <div className="text-xs uppercase tracking-wide text-zinc-500">{label}</div>
      <div className={`mt-2 text-3xl font-semibold ${scoreTone(score)}`}>{score.toFixed(1)}</div>
    </div>
  );
}
