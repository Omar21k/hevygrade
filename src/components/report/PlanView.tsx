"use client";

import { ACTIVE_ROUTINE_WEEKS } from "@/scoring";
import { EvidenceList } from "./Evidence";
import { Button, TextLink } from "@/components/ui";
import { useReadyReport } from "@/report/ReportContext";
import {
  impactLabel,
  METRIC_LABEL,
  METRICS,
  projectChanges,
  type ComparisonRow,
  type Recommendation,
} from "@/report/view";
import { useEffect, useId, useMemo, useState } from "react";
import { recAnchor } from "./recAnchor";

function Slot({ label, slot, empty }: { label: string; slot?: ComparisonRow["current"]; empty: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[12px] font-medium leading-[18px] text-ink-3">{label}</p>
      <p className={`mt-0.5 ${slot ? "text-ink" : "text-ink-3"}`}>
        {slot ? `${slot.name} · ${slot.sets} set${slot.sets === 1 ? "" : "s"}${slot.reps ? ` × ${slot.reps}` : ""}` : empty}
      </p>
    </div>
  );
}

function ResumeComparison({ row, resume }: { row: ComparisonRow; resume: NonNullable<ComparisonRow["resume"]> }) {
  return (
    <div className="rounded-control bg-bg/60 px-4 py-3">
      <p className="hg-eyebrow">{row.dayTitle}</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4">
        <div className="min-w-0">
          <p className="text-[12px] font-medium leading-[18px] text-ink-3">Logged</p>
          <p className="mt-0.5 text-ink-3">Not in the last {ACTIVE_ROUTINE_WEEKS} weeks</p>
        </div>
        <span aria-hidden className="hidden text-ink-3 sm:block">
          →
        </span>
        <div className="min-w-0">
          <p className="text-[12px] font-medium leading-[18px] text-ink-3">Suggested</p>
          <p className="mt-0.5 text-ink">Once a week, as saved in Hevy</p>
        </div>
      </div>
      {resume.exercises.length > 0 ? (
        <p className="mt-2 text-[13px] leading-[20px] text-ink-3">{resume.exercises.join(" · ")}</p>
      ) : null}
    </div>
  );
}

function Comparison({ row }: { row: ComparisonRow }) {
  if (row.resume) return <ResumeComparison row={row} resume={row.resume} />;
  const moved = row.toDayTitle !== undefined;
  return (
    <div className="rounded-control bg-bg/60 px-4 py-3">
      <p className="hg-eyebrow">{moved ? `${row.dayTitle} → ${row.toDayTitle}` : row.dayTitle}</p>
      <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4">
        <Slot label="Current" slot={row.current} empty="Nothing here yet" />
        <span aria-hidden className="hidden text-ink-3 sm:block">
          →
        </span>
        <Slot label="Suggested" slot={row.suggested} empty="Removed" />
      </div>
    </div>
  );
}

function RecommendationCard({
  rec,
  position,
  expanded,
  selected,
  onToggle,
  onInclude,
  onRemove,
  onDismiss,
}: {
  rec: Recommendation;
  position: number;
  expanded: boolean;
  selected: boolean;
  onToggle: () => void;
  onInclude: () => void;
  onRemove: () => void;
  onDismiss: () => void;
}) {
  const panelId = useId();
  return (
    <article
      id={recAnchor(rec.id)}
      tabIndex={-1}
      className={`scroll-mt-20 rounded-card border bg-surface outline-none ${selected ? "border-accent/60" : "border-line"}`}
    >
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex min-h-14 w-full flex-wrap items-center justify-between gap-x-4 gap-y-1 px-5 py-4 text-left md:px-6"
        >
          <span className="flex gap-3 text-[17px] font-semibold leading-[26px] text-ink">
            <span className="tabular-nums text-ink-3">{String(position + 1).padStart(2, "0")}</span>
            {rec.headline}
          </span>
          <span className="flex items-center gap-3 text-[14px] font-normal">
            {selected ? <span className="text-accent">✓ In your plan</span> : null}
            {position === 0 && !selected ? (
              <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[12px] font-medium leading-[18px] text-accent">
                Start here
              </span>
            ) : null}
            <span className="text-ink-3">{expanded ? "Hide" : "Details"}</span>
          </span>
        </button>
      </h2>
      <div id={panelId} hidden={!expanded} className="border-t border-line px-5 pb-5 pt-4 md:px-6">
        <p className="text-ink">{rec.action}.</p>
        <p className="mt-1 text-[14px] leading-[22px] text-ink-3">
          {rec.sessionImpact} · {impactLabel(rec.impact)}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {rec.rows.map((row, index) => (
            <Comparison key={`${row.dayTitle}-${index}`} row={row} />
          ))}
        </div>
        {rec.evidence.length > 0 ? (
          <div className="mt-5">
            <h3 className="text-[14px] font-medium text-ink">The numbers behind it</h3>
            <div className="mt-2">
              <EvidenceList items={rec.evidence} />
            </div>
          </div>
        ) : null}
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <h3 className="text-[14px] font-medium text-ink">Why this helps</h3>
            <p className="mt-1 text-[15px] leading-[24px] text-ink-2">{rec.why}</p>
          </div>
          <div>
            <h3 className="text-[14px] font-medium text-ink">Trade-off</h3>
            <p className="mt-1 text-[15px] leading-[24px] text-ink-2">{rec.tradeOff}</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-3">
          {selected ? (
            <Button variant="secondary" onClick={onRemove}>
              Remove from my plan
            </Button>
          ) : (
            <>
              <Button onClick={onInclude}>Include in my plan</Button>
              <Button variant="ghost" onClick={onDismiss}>
                Not for me
              </Button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

export function PlanView() {
  const { recommendations, choices, setChoices, scoring, grade } = useReadyReport();
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(recommendations[0] ? [recommendations[0].id] : []),
  );
  const [reviewOpen, setReviewOpen] = useState(false);
  const [lastDismissed, setLastDismissed] = useState<string | null>(null);

  // The router commits the URL after first render, so read the hash a frame later.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const hash = window.location.hash.slice(1);
      const rec = recommendations.find((item) => recAnchor(item.id) === hash);
      if (!rec) return;
      setExpanded((current) => new Set(current).add(rec.id));
      const target = document.getElementById(hash);
      target?.scrollIntoView({ block: "start" });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [recommendations]);

  const ids = new Set(recommendations.map((rec) => rec.id));
  const selectedIds = choices.selected.filter((id) => ids.has(id));
  const dismissedIds = new Set(choices.dismissed.filter((id) => ids.has(id)));
  const visible = recommendations.filter((rec) => !dismissedIds.has(rec.id));
  const dismissed = recommendations.filter((rec) => dismissedIds.has(rec.id));
  const selected = recommendations.filter((rec) => selectedIds.includes(rec.id));

  const projection = useMemo(() => {
    const changes = recommendations
      .filter((rec) => choices.selected.includes(rec.id))
      .flatMap((rec) => rec.changes);
    if (changes.length === 0) return null;
    return projectChanges(scoring, changes);
  }, [recommendations, choices.selected, scoring]);

  function update(next: { selected?: string[]; dismissed?: string[] }) {
    setChoices({
      selected: next.selected ?? choices.selected,
      dismissed: next.dismissed ?? choices.dismissed,
    });
  }

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (recommendations.length === 0) {
    return (
      <div className="max-w-[720px]">
        <h1 className="hg-h1">Your split is at its balance point.</h1>
        <p className="mt-3 text-ink-2">
          No single change improves your scores enough to recommend right now. Keep logging workouts so progression can
          be tracked, and check back after your next training block.
        </p>
        <TextLink href="/report/regions" className="mt-4">
          Review your muscle regions <span aria-hidden>→</span>
        </TextLink>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="hg-h1">Small changes. Clear priorities.</h1>
        <p className="mt-3 max-w-[640px] text-ink-2">Start with one change and review how it fits your training.</p>
        <p className="mt-3 text-[14px] leading-[22px] text-ink-3">
          This plan does not modify your Hevy routines. Make the changes in Hevy when you&apos;re ready.
        </p>
      </section>

      <div className="flex flex-col gap-3">
        {visible.map((rec) => (
          <RecommendationCard
            key={rec.id}
            rec={rec}
            position={recommendations.indexOf(rec)}
            expanded={expanded.has(rec.id)}
            selected={selectedIds.includes(rec.id)}
            onToggle={() => toggle(rec.id)}
            onInclude={() => update({ selected: [...selectedIds, rec.id] })}
            onRemove={() => update({ selected: selectedIds.filter((id) => id !== rec.id) })}
            onDismiss={() => {
              update({ dismissed: [...dismissedIds, rec.id] });
              setLastDismissed(rec.id);
            }}
          />
        ))}
      </div>

      {dismissed.length > 0 ? (
        <section aria-label="Dismissed suggestions" className="flex flex-col gap-1">
          {dismissed.map((rec) => (
            <div
              key={rec.id}
              className="flex min-h-12 items-center justify-between gap-4 rounded-control border border-dashed border-line px-4 text-[14px] text-ink-3"
            >
              <span>
                Dismissed: <span className="text-ink-2">{rec.headline}</span>
              </span>
              <button
                type="button"
                onClick={() => update({ dismissed: [...dismissedIds].filter((id) => id !== rec.id) })}
                className="inline-flex min-h-11 items-center px-2 font-medium text-accent hover:text-accent-hover"
              >
                Undo
              </button>
            </div>
          ))}
          <p className="sr-only" aria-live="polite">
            {lastDismissed ? "Suggestion dismissed. Undo is available." : ""}
          </p>
        </section>
      ) : null}

      <section aria-labelledby="selected-plan" className="rounded-card bg-surface p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="selected-plan" className="hg-eyebrow">
              My selected changes
            </h2>
            <p className="mt-1 text-ink" aria-live="polite">
              {selected.length === 0 ? "Nothing selected yet" : `${selected.length} selected`}
            </p>
          </div>
          <Button
            variant="secondary"
            disabled={selected.length === 0}
            aria-expanded={reviewOpen}
            onClick={() => setReviewOpen((open) => !open)}
          >
            {reviewOpen ? "Hide selected plan" : "Review selected plan"}
          </Button>
        </div>

        {projection ? (
          <div className="mt-4">
            <p className="text-[14px] leading-[22px] text-ink-3">Estimated with these changes</p>
            <dl className="mt-2 grid grid-cols-3 gap-3">
              {METRICS.map((metric) => (
                <div key={metric}>
                  <dt className="text-[12px] leading-[18px] text-ink-3">{METRIC_LABEL[metric]}</dt>
                  <dd className="tabular-nums text-ink-2">
                    {grade[metric].score.toFixed(1)} <span aria-hidden>→</span>
                    <span className="sr-only">to</span>{" "}
                    <span className="font-semibold text-ink">{projection[metric].toFixed(1)}</span>
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}

        {reviewOpen && selected.length > 0 ? (
          <ol className="mt-5 flex list-decimal flex-col gap-2 border-t border-line pl-5 pt-4 text-[15px] leading-[24px] text-ink-2">
            {selected.flatMap((rec) =>
              rec.rows.map((row, index) => (
                <li key={`${rec.id}-${index}`}>
                  <span className="text-ink">{row.dayTitle}:</span>{" "}
                  {row.resume
                    ? "do it once a week again"
                    : row.toDayTitle
                    ? `move ${row.current?.name} to ${row.toDayTitle}`
                    : row.current && row.suggested && row.current.name !== row.suggested.name
                      ? `replace ${row.current.name} with ${row.suggested.name} (${row.suggested.sets} sets)`
                      : row.current && row.suggested
                        ? `${row.current.name} from ${row.current.sets} to ${row.suggested.sets} sets`
                        : `add ${row.suggested?.name} (${row.suggested?.sets} sets)`}
                </li>
              )),
            )}
          </ol>
        ) : null}

        <p className="mt-4 text-[13px] leading-[20px] text-ink-3">
          Selections are saved in this browser tab until you close it. Estimates come from the same scoring engine and
          are not guarantees.
        </p>
      </section>
    </div>
  );
}
