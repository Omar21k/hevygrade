"use client";

import {
  lackingSummary,
  METRIC_LABEL,
  METRIC_QUESTION,
  METRICS,
  scoreTone,
  topFindings,
  verdict,
  type Metric,
} from "@/report/summary";
import { useReport } from "@/report/useReport";
import type { Finding, Grade } from "@/scoring";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type ScoreStageId = Metric | "overall";
type Stage = "intro" | ScoreStageId | "summary";
const STAGES: Stage[] = ["intro", ...METRICS, "overall", "summary"];
type Phase = "reading" | "counting" | "feedback";

const READ_MS = 1400;
const OVERALL_READ_MS = 2200;
const COUNT_MS = 1100;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isScoreStage(stage: Stage): stage is ScoreStageId {
  return stage !== "intro" && stage !== "summary";
}

function useCountUp(target: number, run: boolean, reduced: boolean): number {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    if (!run || reduced) return;
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const next = Math.min(1, (now - start) / COUNT_MS);
      setProgress(next);
      if (next < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [run, reduced]);
  if (!run) return 0;
  if (reduced) return target;
  return target * (1 - Math.pow(1 - progress, 3));
}

function ScoreRing({ value, final, size = 220 }: { value: number; final: number; size?: number }) {
  const radius = size / 2 - 10;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${final.toFixed(1)} out of 10`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={8} className="stroke-zinc-800" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - value / 10)}
          className={`stroke-current ${scoreTone(final)}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-6xl font-semibold tabular-nums ${scoreTone(final)}`}>{value.toFixed(1)}</span>
        <span className="mt-1 text-sm text-zinc-500">out of 10</span>
      </div>
    </div>
  );
}

function Reading({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-5">
      <p className="text-lg text-zinc-300">{text}</p>
      <div className="relative h-1 w-56 overflow-hidden rounded-full bg-zinc-800">
        <div className="hg-scan absolute inset-y-0 w-1/3 rounded-full bg-[#267FE8]" />
      </div>
    </div>
  );
}

/** Mounted once per stage (keyed), so its reading → counting → feedback timers start fresh. */
function ScoreStage({
  stage,
  grade,
  splitOnly,
  findings,
  fromPhotos,
  onReady,
}: {
  stage: ScoreStageId;
  grade: Grade;
  splitOnly: Grade;
  findings: Finding[];
  fromPhotos: boolean;
  onReady: () => void;
}) {
  const [reduced] = useState(prefersReducedMotion);
  const [phase, setPhase] = useState<Phase>(reduced ? "feedback" : "reading");
  const target = stage === "overall" ? grade.overall : grade[stage].score;
  const counted = useCountUp(target, phase !== "reading", reduced);

  useEffect(() => {
    if (reduced) {
      onReady();
      return;
    }
    const read = stage === "overall" ? OVERALL_READ_MS : READ_MS;
    const toCount = window.setTimeout(() => setPhase("counting"), read);
    const toFeedback = window.setTimeout(() => {
      setPhase("feedback");
      onReady();
    }, read + COUNT_MS + 150);
    return () => {
      window.clearTimeout(toCount);
      window.clearTimeout(toFeedback);
    };
  }, [onReady, reduced, stage]);

  const rows = stage === "overall" ? [] : topFindings(findings, stage);

  return (
    <div className="flex w-full flex-col items-center">
      <p className="hg-rise text-sm uppercase tracking-[0.2em] text-zinc-500">
        {stage === "overall" ? "Overall" : METRIC_LABEL[stage]}
      </p>
      <p className="hg-rise mt-3 text-xl text-zinc-200">
        {stage === "overall" ? "Putting it together." : METRIC_QUESTION[stage]}
      </p>

      <div className="mt-10 flex min-h-[240px] items-center justify-center">
        {phase === "reading" ? (
          <Reading
            text={stage === "overall" ? "Balancing all three…" : `Reading ${METRIC_LABEL[stage].toLowerCase()}…`}
          />
        ) : (
          <div className="hg-pop">
            <ScoreRing value={counted} final={target} />
          </div>
        )}
      </div>

      {phase === "feedback" ? (
        <div className="mt-8 flex w-full flex-col gap-4">
          <p className={`hg-rise text-2xl font-semibold ${scoreTone(target)}`}>{verdict(target)}</p>

          {stage === "overall" ? (
            <>
              <div className="hg-rise grid grid-cols-3 gap-3" style={{ animationDelay: "120ms" }}>
                {METRICS.map((metric) => (
                  <div key={metric} className="rounded-2xl border border-zinc-800 px-3 py-3">
                    <p className="text-xs uppercase tracking-[0.14em] text-zinc-500">{METRIC_LABEL[metric]}</p>
                    <p className={`mt-1 text-2xl font-semibold tabular-nums ${scoreTone(grade[metric].score)}`}>
                      {grade[metric].score.toFixed(1)}
                    </p>
                  </div>
                ))}
              </div>
              <p className="hg-rise text-base leading-7 text-zinc-300" style={{ animationDelay: "260ms" }}>
                Pushing one score usually costs another. This is your balance point today.
              </p>
            </>
          ) : (
            <>
              {rows.map((finding, position) => (
                <div
                  key={finding.id}
                  className="hg-rise rounded-2xl border border-zinc-800 bg-zinc-950 px-5 py-4 text-left"
                  style={{ animationDelay: `${150 + position * 180}ms` }}
                >
                  <p className="text-lg font-medium text-zinc-50">{finding.title}</p>
                  <p className="mt-1 text-base leading-7 text-zinc-400">{finding.detail}</p>
                </div>
              ))}
              {rows.length === 0 ? (
                <p className="hg-rise text-base text-zinc-300">
                  {grade[stage].notes[0] ?? "Nothing holding this score back."}
                </p>
              ) : null}
              {fromPhotos && Math.abs(splitOnly[stage].score - grade[stage].score) >= 0.1 ? (
                <p className="hg-rise text-sm text-zinc-500" style={{ animationDelay: "500ms" }}>
                  On paper your split scores {splitOnly[stage].score.toFixed(1)}. Against your physique it&apos;s{" "}
                  {grade[stage].score.toFixed(1)}.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ScoreReveal() {
  const router = useRouter();
  const { loaded, hevy, physique, grade, splitOnly, plan, findings } = useReport();
  const [index, setIndex] = useState(0);
  const [readyIndex, setReadyIndex] = useState(-1);
  const stage = STAGES[index];

  useEffect(() => {
    if (loaded && hevy && !physique) router.replace("/report");
  }, [loaded, hevy, physique, router]);

  const markReady = useCallback(() => setReadyIndex(index), [index]);
  const canAdvance = !isScoreStage(stage) || readyIndex === index;

  const next = useCallback(() => {
    if (!canAdvance) return;
    if (index >= STAGES.length - 1) router.push("/report");
    else setIndex(index + 1);
  }, [canAdvance, index, router]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowRight") {
        event.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next]);

  if (!grade || !splitOnly || !hevy || !physique) {
    return <div className="flex min-h-full flex-1 items-center justify-center text-zinc-400">Loading…</div>;
  }

  const fromPhotos = physique.status === "graded";
  const summary = lackingSummary(grade, plan, fromPhotos);

  return (
    <div className="flex min-h-full flex-1 flex-col bg-[#07080a] text-zinc-100">
      <header className="flex items-center justify-between px-6 py-5">
        <span className="text-sm font-semibold tracking-[0.28em] text-[#C7FDA0]">HEVYGRADE</span>
        <Link href="/report" className="text-sm text-zinc-400 hover:text-zinc-200">
          Skip to results
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-xl gap-1.5 px-6" aria-hidden>
        {STAGES.map((item, position) => (
          <span
            key={item}
            className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
              position <= index ? "bg-[#267FE8]" : "bg-zinc-800"
            }`}
          />
        ))}
      </div>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-12 text-center">
        {stage === "intro" ? (
          <div key="intro" className="hg-rise flex flex-col items-center">
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">
              {fromPhotos ? `${physique.views.length} photo${physique.views.length === 1 ? "" : "s"} · ` : ""}
              {hevy.days.length} routines · {hevy.workoutCount} workouts
            </p>
            <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
              {fromPhotos ? "We read your photos and your split." : "We read your split."}
            </h1>
            <p className="mt-5 text-lg leading-8 text-zinc-300">
              {fromPhotos
                ? "Your scores weigh what your Hevy data says you train against what your photos show is behind."
                : "Without photos, your split is graded on balanced targets. Add photos later to grade it against your physique."}
            </p>
            <p className="mt-4 text-base text-zinc-500">Nobody scores 10 across the board.</p>
          </div>
        ) : null}

        {isScoreStage(stage) ? (
          <ScoreStage
            key={stage}
            stage={stage}
            grade={grade}
            splitOnly={splitOnly}
            findings={findings}
            fromPhotos={fromPhotos}
            onReady={markReady}
          />
        ) : null}

        {stage === "summary" ? (
          <div key="summary" className="hg-rise flex w-full flex-col items-center">
            <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">What you&apos;re missing</p>
            <h2 className="mt-5 text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">{summary.headline}</h2>
            <ul className="mt-8 flex w-full flex-col gap-3 text-left">
              {summary.points.map((point, position) => (
                <li
                  key={point}
                  className="hg-rise rounded-2xl border border-zinc-800 px-5 py-4 text-base leading-7 text-zinc-200"
                  style={{ animationDelay: `${120 + position * 140}ms` }}
                >
                  {point}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-12 h-12">
          {canAdvance ? (
            <button
              type="button"
              onClick={next}
              className="hg-rise rounded-full bg-[#267FE8] px-10 py-3 text-base font-semibold text-white transition hover:bg-[#1f6fd0]"
            >
              {stage === "intro"
                ? "Show my scores"
                : stage === "summary"
                  ? "See your next steps"
                  : stage === "overall"
                    ? "What am I missing?"
                    : "Next"}
            </button>
          ) : null}
        </div>
      </main>
    </div>
  );
}
