"use client";

import { Button } from "@/components/ui";
import type { StrengthCard, StrengthReveal } from "@/report/view";
import { useEffect, useState, type RefObject } from "react";

/** Two beats of build-up before the first card. */
const INTRO_BEAT_MS = 1100;
const INTRO_MS = 3300;
/** Time on each card before it moves on by itself; longer details get longer. */
const CARD_BASE_MS = 2600;
const CARD_PER_CHAR_MS = 26;
const CARD_MAX_EXTRA_MS = 2600;
const RECAP_STAGGER_MS = 90;

type Phase = { kind: "intro" } | { kind: "card"; index: number } | { kind: "recap" };

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function dwellFor(card: StrengthCard): number {
  return CARD_BASE_MS + Math.min(card.detail.length * CARD_PER_CHAR_MS, CARD_MAX_EXTRA_MS);
}

function nextPhase(current: Phase, total: number): Phase {
  if (current.kind === "intro") return { kind: "card", index: 0 };
  if (current.kind === "card" && current.index < total - 1) return { kind: "card", index: current.index + 1 };
  return { kind: "recap" };
}

function countWord(count: number): string {
  const words = ["Zero", "One", "Two", "Three", "Four", "Five", "Six"];
  return words[count] ?? String(count);
}

/**
 * Hypes the person up on what their photos already show, one strength at a
 * time, before the scores. Auto-advances; a tap moves on sooner.
 */
export function StrengthsReveal({
  reveal,
  headingRef,
  startAtRecap,
  onSeen,
  onNext,
}: {
  reveal: StrengthReveal;
  headingRef: RefObject<HTMLHeadingElement | null>;
  /** Coming back from the scores: skip the build-up. */
  startAtRecap: boolean;
  onSeen: () => void;
  onNext: () => void;
}) {
  if (reveal.kind === "message") {
    return <QuietStage message={reveal.message} headingRef={headingRef} onNext={onNext} onSeen={onSeen} />;
  }
  return (
    <CardsStage
      cards={reveal.cards}
      headingRef={headingRef}
      startAtRecap={startAtRecap}
      onSeen={onSeen}
      onNext={onNext}
    />
  );
}

function QuietStage({
  message,
  headingRef,
  onNext,
  onSeen,
}: {
  message: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onNext: () => void;
  onSeen: () => void;
}) {
  useEffect(() => onSeen(), [onSeen]);
  return (
    <section className="mt-10 flex flex-1 flex-col">
      <p className="hg-eyebrow">Before the scores</p>
      <h1 ref={headingRef} tabIndex={-1} className="hg-h2 mt-2 outline-none">
        What&apos;s already working
      </h1>
      <p className="hg-rise mt-8 text-[20px] font-medium leading-[30px] text-ink md:text-[22px] md:leading-[32px]">
        {message}
      </p>
      <div className="hg-rise mt-10">
        <Button onClick={onNext}>
          See your scores <span aria-hidden>→</span>
        </Button>
      </div>
    </section>
  );
}

function CardsStage({
  cards,
  headingRef,
  startAtRecap,
  onSeen,
  onNext,
}: {
  cards: StrengthCard[];
  headingRef: RefObject<HTMLHeadingElement | null>;
  startAtRecap: boolean;
  onSeen: () => void;
  onNext: () => void;
}) {
  const [reduced] = useState(prefersReducedMotion);
  // Read once: the parent flips startAtRecap as soon as the recap shows.
  const [returning] = useState(startAtRecap);
  const [phase, setPhase] = useState<Phase>(() =>
    reduced || returning ? { kind: "recap" } : { kind: "intro" },
  );
  const [introBeat, setIntroBeat] = useState(0);

  const total = cards.length;
  const advance = () => setPhase((current) => nextPhase(current, total));

  // Auto-advance. Each phase change resets the timer, so a tap never double-skips.
  useEffect(() => {
    if (phase.kind === "recap") return;
    const wait = phase.kind === "intro" ? INTRO_MS : dwellFor(cards[phase.index]);
    const timer = window.setTimeout(() => setPhase((current) => nextPhase(current, total)), wait);
    return () => window.clearTimeout(timer);
  }, [phase, cards, total]);

  useEffect(() => {
    if (phase.kind !== "intro") return;
    const timer = window.setTimeout(() => setIntroBeat(1), INTRO_BEAT_MS);
    return () => window.clearTimeout(timer);
  }, [phase.kind]);

  useEffect(() => {
    if (phase.kind === "recap") onSeen();
  }, [phase.kind, onSeen]);

  const isRecap = phase.kind === "recap";
  const current = phase.kind === "card" ? cards[phase.index] : null;
  const label = `${countWord(total)} ${total === 1 ? "thing" : "things"} already working`;

  return (
    <section className={`${isRecap ? "mt-10" : "mt-6"} flex flex-1 flex-col`}>
      {isRecap ? <p className="hg-eyebrow">Before the scores</p> : null}
      <h1 ref={headingRef} tabIndex={-1} className={isRecap ? "hg-h2 mt-2 outline-none" : "sr-only"}>
        {isRecap ? label : "What's already working"}
      </h1>
      <p className="sr-only" aria-live="polite">
        {current
          ? `Strength ${phase.kind === "card" ? phase.index + 1 : ""} of ${total}: ${current.title} ${current.detail}`
          : ""}
      </p>

      {phase.kind === "intro" ? (
        <button
          type="button"
          onClick={advance}
          className="flex min-h-[420px] flex-1 cursor-pointer flex-col justify-center text-left outline-none"
          aria-label="Continue to your strengths"
        >
          <p className="hg-eyebrow hg-swap">Your photos are in</p>
          <p className="hg-swap mt-5 text-[30px] font-medium leading-[38px] text-ink md:text-[40px] md:leading-[48px]">
            We looked closely.
          </p>
          {introBeat >= 1 ? (
            <p className="hg-swap mt-2 text-[30px] font-medium leading-[38px] text-brand md:text-[40px] md:leading-[48px]">
              Some of this is seriously good.
            </p>
          ) : (
            <p aria-hidden className="mt-2 min-h-[38px] md:min-h-[48px]" />
          )}
        </button>
      ) : null}

      {phase.kind === "card" ? (
        <CardView
          key={phase.index}
          card={cards[phase.index]}
          index={phase.index}
          total={total}
          onNext={advance}
          onSkip={() => setPhase({ kind: "recap" })}
        />
      ) : null}

      {isRecap ? <Recap cards={cards} animate={!reduced && !returning} onNext={onNext} /> : null}
    </section>
  );
}

function Dots({ index, total }: { index: number; total: number }) {
  return (
    <div aria-hidden className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, position) => (
        <span
          key={position}
          className={`h-2 w-2 rounded-full transition-colors duration-300 ${
            position < index ? "bg-brand/60" : position === index ? "hg-pip bg-brand" : "bg-line"
          }`}
        />
      ))}
    </div>
  );
}

function CardView({
  card,
  index,
  total,
  onNext,
  onSkip,
}: {
  card: StrengthCard;
  index: number;
  total: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const last = index === total - 1;
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[13px] font-medium tabular-nums tracking-wide text-ink-3">
          {String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </p>
        <Dots index={index} total={total} />
      </div>

      <button
        type="button"
        onClick={onNext}
        aria-label={last ? "See all strengths" : "Next strength"}
        className="group relative mt-6 flex min-h-[340px] w-full cursor-pointer flex-col justify-center overflow-hidden rounded-card border border-brand/25 bg-surface px-6 py-10 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent md:px-10"
      >
        <span aria-hidden className="hg-glow pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-brand/25 blur-3xl" />
        <span aria-hidden className="relative flex flex-col">
          {card.tag ? (
            <span className="hg-pop self-start rounded-full bg-brand/15 px-3 py-1 text-[12px] font-medium leading-[18px] text-brand">
              {card.tag}
            </span>
          ) : null}
          <span className="hg-pop mt-5 block text-[30px] font-semibold leading-[36px] tracking-tight text-ink [animation-delay:120ms] md:text-[40px] md:leading-[46px]">
            {card.title}
          </span>
          {card.detail ? (
            <span className="hg-rise mt-4 block max-w-[480px] text-[17px] leading-[27px] text-ink-2 [animation-delay:650ms]">
              {card.detail}
            </span>
          ) : null}
        </span>
        <span aria-hidden className="relative mt-8 text-[13px] text-ink-3 transition-colors group-hover:text-ink-2">
          {last ? "Tap to see them all" : "Tap for the next one"}
        </span>
      </button>

      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onSkip}
          className="inline-flex min-h-11 items-center text-[14px] text-ink-3 hover:text-ink"
        >
          Show all at once
        </button>
        <Button onClick={onNext}>
          {last ? "That's the list" : "Next"} <span aria-hidden>→</span>
        </Button>
      </div>
    </div>
  );
}

function Recap({ cards, animate, onNext }: { cards: StrengthCard[]; animate: boolean; onNext: () => void }) {
  const delay = (position: number) => (animate ? { animationDelay: `${position * RECAP_STAGGER_MS}ms` } : undefined);
  return (
    <div className="flex flex-col">
      <ol className="mt-8 flex flex-col gap-3">
        {cards.map((card, position) => (
          <li
            key={card.title}
            className={`${animate ? "hg-rise" : ""} flex gap-4 rounded-card border border-line bg-surface px-5 py-4`}
            style={delay(position)}
          >
            <span aria-hidden className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[12px] font-semibold text-brand">
              {position + 1}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-[17px] font-medium leading-[26px] text-ink">{card.title}</span>
              {card.tag ? <span className="mt-0.5 text-[13px] leading-[20px] text-ink-3">{card.tag}</span> : null}
            </span>
          </li>
        ))}
      </ol>
      <div className={`${animate ? "hg-rise" : ""} mt-10 flex flex-col gap-4`} style={delay(cards.length + 2)}>
        <p className="text-[17px] leading-[27px] text-ink-2">
          That&apos;s what&apos;s working. Now let&apos;s find what&apos;s holding the rest back.
        </p>
        <div>
          <Button onClick={onNext}>
            Reveal my scores <span aria-hidden>→</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
