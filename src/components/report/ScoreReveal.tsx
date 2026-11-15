"use client";

import { Button, DemoBadge, StatusLabel, Wordmark } from "@/components/ui";
import { useReport } from "@/report/ReportContext";
import { markRevealSeen } from "@/report/state";
import {
  METRIC_LABEL,
  METRIC_PROMPT,
  METRICS,
  scoreStatus,
  scoreTone,
  strengthLines,
  type Metric,
  type MetricStory,
} from "@/report/view";
import type { Grade } from "@/scoring";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ScoreRing } from "./ScoreRing";

const READ_MS = 1200;
const COUNT_MS = 1100;
const CHAR_MS = 26;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isMetric(value: string | null): value is Metric {
  return value !== null && (METRICS as readonly string[]).includes(value);
}

/** Types lines one after another. The full text is in the DOM for screen readers. */
function TypedLines({ lines, onDone }: { lines: string[]; onDone: () => void }) {
  const [reduced] = useState(prefersReducedMotion);
  const [lineIndex, setLineIndex] = useState(reduced ? lines.length : 0);
  const [chars, setChars] = useState(0);
  useEffect(() => {
    if (reduced || lineIndex >= lines.length) onDone();
  }, [reduced, lineIndex, lines.length, onDone]);

  useEffect(() => {
    if (reduced || lineIndex >= lines.length) return;
    const line = lines[lineIndex];
    const wait = chars < line.length ? CHAR_MS : 480;
    const timer = window.setTimeout(() => {
      if (chars < line.length) setChars((current) => current + 1);
      else {
        setLineIndex((current) => current + 1);
        setChars(0);
      }
    }, wait);
    return () => window.clearTimeout(timer);
  }, [chars, lineIndex, lines, reduced]);

  const done = reduced || lineIndex >= lines.length;
  const visible = reduced
    ? lines
    : [...lines.slice(0, lineIndex), ...(lineIndex < lines.length ? [lines[lineIndex].slice(0, chars)] : [])];

  return (
    <div>
      <div className="sr-only">{lines.join(" ")}</div>
      <div aria-hidden className="flex flex-col gap-4">
        {visible.map((line, index) => (
          <p key={lines[index]} className="text-[22px] font-medium leading-[32px] text-ink md:text-[26px] md:leading-[36px]">
            {line}
            {!done && index === visible.length - 1 ? (
              <span className="ml-0.5 inline-block h-[0.9em] w-[3px] translate-y-[0.08em] bg-accent motion-safe:animate-pulse" />
            ) : null}
          </p>
        ))}
      </div>
      {done ? <span className="sr-only">Strengths finished.</span> : null}
    </div>
  );
}

function Reading({ label }: { label: string }) {
  return (
    <div className="flex h-[168px] flex-col items-center justify-center gap-5">
      <p className="text-[17px] text-ink-2">Reading {label.toLowerCase()}…</p>
      <div className="relative h-1 w-56 overflow-hidden rounded-full bg-line">
        <div className="hg-scan absolute inset-y-0 w-1/3 rounded-full bg-accent" />
      </div>
    </div>
  );
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
  const [reduced] = useState(prefersReducedMotion);
  const [phase, setPhase] = useState<"reading" | "counting" | "done">(reduced ? "done" : "reading");

  useEffect(() => {
    if (reduced) return;
    const toCount = window.setTimeout(() => setPhase("counting"), READ_MS);
    const toDone = window.setTimeout(() => setPhase("done"), READ_MS + COUNT_MS);
    return () => {
      window.clearTimeout(toCount);
      window.clearTimeout(toDone);
    };
  }, [reduced]);

  return (
    <section className="mt-10 flex flex-col items-center text-center">
      <p className="hg-eyebrow">{METRIC_LABEL[metric]}</p>
      <h1 ref={headingRef} tabIndex={-1} className="hg-h2 mt-2 outline-none">
        {METRIC_PROMPT[metric]}
      </h1>
      <div className="mt-8">
        {phase === "reading" ? <Reading label={METRIC_LABEL[metric]} /> : <ScoreRing score={score} duration={COUNT_MS} />}
      </div>
      {phase === "done" ? (
        <div className="hg-rise flex w-full flex-col items-center">
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
        </div>
      ) : (
        <p className="sr-only" role="status">
          {phase === "reading" ? `Reading ${METRIC_LABEL[metric]}` : `${METRIC_LABEL[metric]} ${score.toFixed(1)} out of 10`}
        </p>
      )}
    </section>
  );
}

export function ScoreReveal() {
  const router = useRouter();
  const params = useSearchParams();
  const report = useReport();
  const stageParam = params.get("stage");
  const stage: "strength" | Metric = isMetric(stageParam) ? stageParam : "strength";
  const index = stage === "strength" ? -1 : METRICS.indexOf(stage);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  const [reduced] = useState(() => (typeof window === "undefined" ? false : prefersReducedMotion()));
  const [strengthDone, setStrengthDone] = useState(reduced);
  const markStrengthDone = useCallback(() => setStrengthDone(true), []);

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
  const lines = useMemo(
    () => (readyData ? strengthLines(readyData.physique) : []),
    [readyData],
  );

  if (report.status !== "ready" || !physique) {
    return <div className="flex flex-1 items-center justify-center text-ink-2">Loading your scores…</div>;
  }

  const { grade, stories, hevy } = report.data;
  const last = index === METRICS.length - 1;

  function go(next: "strength" | Metric) {
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
          <StrengthStage
            lines={lines}
            headingRef={headingRef}
            done={strengthDone}
            onDone={markStrengthDone}
            onNext={() => go("coverage")}
          />
        ) : (
          <>
            <nav aria-label="Score categories">
              <ol className="flex items-center gap-2">
                {METRICS.map((metric, position) => (
                  <li
                    key={metric}
                    className="flex flex-1 flex-col gap-2"
                    aria-current={metric === stage ? "step" : undefined}
                  >
                    <span
                      aria-hidden
                      className={`h-1 rounded-full transition-colors ${position <= index ? "bg-accent" : "bg-line"}`}
                    />
                    <span
                      className={`text-[12px] font-medium leading-[18px] ${metric === stage ? "text-ink" : "text-ink-3"}`}
                    >
                      {METRIC_LABEL[metric]}
                    </span>
                  </li>
                ))}
              </ol>
            </nav>
            <div key={stage}>
            <MetricStage metric={stage} score={grade[stage].score} story={stories[stage]} headingRef={headingRef} />
            <ScoreActions
              index={index}
              last={last}
              grade={grade}
              onBack={() => go(index === 0 ? "strength" : METRICS[index - 1])}
              onNext={() => (last ? finish() : go(METRICS[index + 1]))}
            />
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function StrengthStage({
  lines,
  headingRef,
  done,
  onDone,
  onNext,
}: {
  lines: string[];
  headingRef: RefObject<HTMLHeadingElement | null>;
  done: boolean;
  onDone: () => void;
  onNext: () => void;
}) {
  return (
    <section className="mt-10 flex flex-1 flex-col">
      <p className="hg-eyebrow">Before the scores</p>
      <h1 ref={headingRef} tabIndex={-1} className="hg-h2 mt-2 outline-none">
        What&apos;s already working
      </h1>
      <div className="mt-8">
        <TypedLines lines={lines} onDone={onDone} />
      </div>
      {done ? (
        <div className="hg-rise mt-10">
          <Button onClick={onNext}>
            See your scores <span aria-hidden>→</span>
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function ScoreActions({
  index,
  last,
  grade,
  onBack,
  onNext,
}: {
  index: number;
  last: boolean;
  grade: Grade;
  onBack: () => void;
  onNext: () => void;
}) {
  const [reduced] = useState(prefersReducedMotion);
  const [ready, setReady] = useState(reduced);

  useEffect(() => {
    if (reduced || ready) return;
    const timer = window.setTimeout(() => setReady(true), READ_MS + COUNT_MS);
    return () => window.clearTimeout(timer);
  }, [ready, reduced]);

  if (!ready) return null;

  return (
    <>
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
      <div className="hg-rise mt-10 flex flex-col items-center gap-3">
        <div className="flex w-full items-center justify-center gap-3">
          <Button variant="secondary" onClick={onBack}>
            <span aria-hidden>←</span> Back
          </Button>
          <Button onClick={onNext}>
            {last ? "See my next steps" : `Next: ${METRIC_LABEL[METRICS[index + 1]]}`} <span aria-hidden>→</span>
          </Button>
        </div>
        <p className="text-[14px] leading-[22px] text-ink-3">
          {index + 1} of {METRICS.length}
        </p>
      </div>
    </>
  );
}

export function RevealFallback() {
  return <div className="flex flex-1 items-center justify-center text-ink-2">Loading your scores…</div>;
}
