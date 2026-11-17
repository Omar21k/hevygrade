"use client";

import { Button, DemoBadge, StatusLabel, Wordmark } from "@/components/ui";
import { useReport } from "@/report/ReportContext";
import { markRevealSeen } from "@/report/state";
import {
  METRIC_LABEL,
  METRIC_PROMPT,
  METRICS,
  overviewHeadline,
  scoreStatus,
  scoreTone,
  strengthReveal,
  type Metric,
  type MetricStory,
} from "@/report/view";
import { OVERALL_FLOOR_MARGIN, OVERALL_WEIGHTS, type Grade } from "@/scoring";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ScoreRing } from "./ScoreRing";
import { StrengthsReveal } from "./StrengthsReveal";
import { Thinker } from "./Thinker";

/** Time the thinker ponders before a score shows. */
const READ_MS = 2800;
const COUNT_MS = 1100;
/** The overall gets a longer build-up and a slower count. */
const OVERALL_READ_MS = 3600;
const OVERALL_COUNT_MS = 1700;

const STEPS = [...METRICS, "overall"] as const;
type Step = (typeof STEPS)[number];
const STEP_LABEL: Record<Step, string> = { ...METRIC_LABEL, overall: "Overall" };

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isStep(value: string | null): value is Step {
  return value !== null && (STEPS as readonly string[]).includes(value);
}

/** What the thinker is "checking" before each score. */
const THINKING: Record<Step, string[]> = {
  coverage: ["Counting the sets you actually logged…", "Checking each muscle against its target…"],
  growth: ["Seeing how often you hit each muscle…", "Checking whether your lifts are moving…"],
  recovery: ["Looking for back-to-back heavy days…", "Making sure it's all recoverable…"],
  overall: ["Weighing all three…", "Okay. Got it."],
};

/** Reading → counting → done on a timer; reduced motion goes straight to done. */
function usePhases(readMs: number, countMs: number) {
  const [reduced] = useState(prefersReducedMotion);
  const [phase, setPhase] = useState<"reading" | "counting" | "done">(reduced ? "done" : "reading");
  useEffect(() => {
    if (reduced) return;
    const toCount = window.setTimeout(() => setPhase("counting"), readMs);
    const toDone = window.setTimeout(() => setPhase("done"), readMs + countMs);
    return () => {
      window.clearTimeout(toCount);
      window.clearTimeout(toDone);
    };
  }, [reduced, readMs, countMs]);
  return phase;
}

function MetricStage({
  metric,
  score,
  story,
  headingRef,
}: {
  metric: Metric;
  score: number;
  story: MetricStory;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const phase = usePhases(READ_MS, COUNT_MS);

  return (
    <section className="mt-10 flex flex-col items-center text-center">
      <p className="hg-eyebrow">{METRIC_LABEL[metric]}</p>
      <h1 ref={headingRef} tabIndex={-1} className="hg-h2 mt-2 outline-none">
        {METRIC_PROMPT[metric]}
      </h1>
      <div className="mt-8">
        {phase === "reading" ? (
          <Thinker lines={THINKING[metric]} duration={READ_MS} />
        ) : (
          <div className="hg-pop">
            <ScoreRing score={score} duration={COUNT_MS} />
          </div>
        )}
      </div>
      {phase === "done" ? (
        <div className="hg-rise flex w-full flex-col items-center">
          <div className="mt-3 flex items-center gap-2">
            <StatusLabel tone={scoreTone(score)}>{scoreStatus(score)}</StatusLabel>
            {story.projected ? (
              <span className="rounded-full bg-raised px-2.5 py-0.5 text-[12px] leading-[18px] text-ink-2">Projected</span>
            ) : null}
          </div>
          {story.parts ? <ScoreParts parts={story.parts} /> : null}
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
        </div>
      ) : (
        <p className="sr-only" role="status">
          {phase === "reading" ? `Reading ${METRIC_LABEL[metric]}` : `${METRIC_LABEL[metric]} ${score.toFixed(1)} out of 10`}
        </p>
      )}
    </section>
  );
}

/** The pieces a blended score is made of, e.g. coverage: photos 60%, training 40%. */
function ScoreParts({ parts }: { parts: NonNullable<MetricStory["parts"]> }) {
  return (
    <ul className="mt-6 grid w-full max-w-[520px] grid-cols-1 gap-2 text-left sm:grid-cols-2">
      {parts.map((part) => (
        <li key={part.label} className="rounded-card bg-surface px-4 py-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[14px] font-medium text-ink">
              {part.label} <span className="font-normal text-ink-3">· {part.weight}%</span>
            </span>
            <span
              className={`text-[18px] font-medium tabular-nums ${scoreTone(part.score) === "good" ? "text-good" : "text-warn"}`}
            >
              {part.score.toFixed(1)}
            </span>
          </div>
          <div aria-hidden className="mt-2 h-1.5 rounded-full bg-line">
            <div
              className={`h-full rounded-full ${scoreTone(part.score) === "good" ? "bg-good" : "bg-warn"}`}
              style={{ width: `${Math.max(0, Math.min(100, part.score * 10))}%` }}
            />
          </div>
          <p className="mt-2 text-[13px] leading-[20px] text-ink-3">{part.note}</p>
        </li>
      ))}
    </ul>
  );
}

export function ScoreReveal() {
  const router = useRouter();
  const params = useSearchParams();
  const report = useReport();
  const stageParam = params.get("stage");
  const stage: "strength" | Step = isStep(stageParam) ? stageParam : "strength";
  const index = stage === "strength" ? -1 : STEPS.indexOf(stage);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const [strengthSeen, setStrengthSeen] = useState(false);
  const markStrengthSeen = useCallback(() => setStrengthSeen(true), []);

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

  const readyData = report.status === "ready" ? report.data : null;
  const strengths = useMemo(() => strengthReveal(readyData?.physique ?? null), [readyData]);

  if (report.status !== "ready" || !physique) {
    return <div className="flex flex-1 items-center justify-center text-ink-2">Loading your scores…</div>;
  }

  const { grade, stories, hevy } = report.data;
  const last = index === STEPS.length - 1;

  function go(next: "strength" | Step) {
    router.push(next === "strength" ? "/reveal" : `/reveal?stage=${next}`, { scroll: false });
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
        {stage === "strength" ? (
          <StrengthsReveal
            reveal={strengths}
            headingRef={headingRef}
            startAtRecap={strengthSeen}
            onSeen={markStrengthSeen}
            onNext={() => go("coverage")}
          />
        ) : (
          <>
            <nav aria-label="Score categories">
              <ol className="flex items-center gap-2">
                {STEPS.map((step, position) => (
                  <li
                    key={step}
                    className="flex flex-1 flex-col gap-2"
                    aria-current={step === stage ? "step" : undefined}
                  >
                    <span
                      aria-hidden
                      className={`h-1 rounded-full transition-colors ${position <= index ? "bg-accent" : "bg-line"}`}
                    />
                    <span
                      className={`text-[12px] font-medium leading-[18px] ${step === stage ? "text-ink" : "text-ink-3"}`}
                    >
                      {STEP_LABEL[step]}
                    </span>
                  </li>
                ))}
              </ol>
            </nav>
            <div key={stage}>
              {stage === "overall" ? (
                <OverallStage grade={grade} headingRef={headingRef} />
              ) : (
                <MetricStage metric={stage} score={grade[stage].score} story={stories[stage]} headingRef={headingRef} />
              )}
              <ScoreActions
                index={index}
                last={last}
                delay={stage === "overall" ? OVERALL_READ_MS + OVERALL_COUNT_MS : READ_MS + COUNT_MS}
                onBack={() => go(index === 0 ? "strength" : STEPS[index - 1])}
                onNext={() => (last ? finish() : go(STEPS[index + 1]))}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function ScoreActions({
  index,
  last,
  delay,
  onBack,
  onNext,
}: {
  index: number;
  last: boolean;
  /** Buttons wait until the score has landed. */
  delay: number;
  onBack: () => void;
  onNext: () => void;
}) {
  const [reduced] = useState(prefersReducedMotion);
  const [ready, setReady] = useState(reduced);

  useEffect(() => {
    if (reduced || ready) return;
    const timer = window.setTimeout(() => setReady(true), delay);
    return () => window.clearTimeout(timer);
  }, [ready, reduced, delay]);

  if (!ready) return null;

  return (
    <div className="hg-rise mt-10 flex flex-col items-center gap-3">
      <div className="flex w-full items-center justify-center gap-3">
        <Button variant="secondary" onClick={onBack}>
          <span aria-hidden>←</span> Back
        </Button>
        <Button onClick={onNext}>
          {last ? "See my next steps" : `Next: ${STEP_LABEL[STEPS[index + 1]]}`} <span aria-hidden>→</span>
        </Button>
      </div>
      <p className="text-[14px] leading-[22px] text-ink-3">
        {index + 1} of {STEPS.length}
      </p>
    </div>
  );
}

/** The last reveal: everything rolled into one number. */
function OverallStage({ grade, headingRef }: { grade: Grade; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const phase = usePhases(OVERALL_READ_MS, OVERALL_COUNT_MS);
  const overall = grade.overall;
  const weighted = METRICS.reduce((sum, metric) => sum + OVERALL_WEIGHTS[metric] * grade[metric].score, 0);
  const weakest = METRICS.reduce((low, metric) => (grade[metric].score < grade[low].score ? metric : low), METRICS[0]);
  const capped = weighted - overall >= 0.1;

  return (
    <section className="mt-10 flex flex-col items-center text-center">
      <p className="hg-eyebrow">Overall</p>
      <h1 ref={headingRef} tabIndex={-1} className="hg-h2 mt-2 outline-none">
        So, where does your training land?
      </h1>
      <div className="mt-8">
        {phase === "reading" ? (
          <Thinker lines={THINKING.overall} duration={OVERALL_READ_MS} />
        ) : (
          <div className="hg-pop">
            <ScoreRing score={overall} size={208} duration={OVERALL_COUNT_MS} />
          </div>
        )}
      </div>
      {phase === "done" ? (
        <div className="hg-rise flex w-full flex-col items-center">
          <div className="mt-3">
            <StatusLabel tone={scoreTone(overall)}>{scoreStatus(overall)}</StatusLabel>
          </div>
          <p className="mt-6 max-w-[520px] text-[22px] font-medium leading-[32px] text-ink">{overviewHeadline(overall)}</p>
          <ul className="mt-8 grid w-full grid-cols-3 gap-2">
            {METRICS.map((metric) => (
              <li key={metric} className="flex flex-col items-center gap-1 rounded-card bg-surface px-3 py-4">
                <span className="text-[13px] font-medium text-ink-3">{METRIC_LABEL[metric]}</span>
                <span
                  className={`text-[22px] font-medium leading-none tabular-nums ${
                    scoreTone(grade[metric].score) === "good" ? "text-good" : "text-warn"
                  }`}
                >
                  {grade[metric].score.toFixed(1)}
                </span>
                <span className="text-[12px] text-ink-3">{Math.round(OVERALL_WEIGHTS[metric] * 100)}% of overall</span>
              </li>
            ))}
          </ul>
          {capped ? (
            <p className="mt-4 max-w-[520px] text-[14px] leading-[22px] text-ink-3">
              Held to {overall.toFixed(1)} because {METRIC_LABEL[weakest].toLowerCase()} is at{" "}
              {grade[weakest].score.toFixed(1)}. The overall can&apos;t sit more than {OVERALL_FLOOR_MARGIN} points above
              your weakest score.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="sr-only" role="status">
          {phase === "reading" ? "Adding up your overall score" : `Overall ${overall.toFixed(1)} out of 10`}
        </p>
      )}
    </section>
  );
}

export function RevealFallback() {
  return <div className="flex flex-1 items-center justify-center text-ink-2">Loading your scores…</div>;
}
