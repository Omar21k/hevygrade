"use client";

import { Button, StatusLabel, TextLink, type StatusTone } from "@/components/ui";
import { useReadyReport } from "@/report/ReportContext";
import {
  BODY_AREAS,
  compareRegions,
  GOAL_LABEL,
  photoContextLabel,
  STATUS_LABEL,
  volumeAxisMax,
  type Goal,
  type RegionStatus,
  type RegionView,
} from "@/report/view";
import { targetsFor, type RegionId, type RegionPriority } from "@/scoring";
import { useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { recAnchor } from "./recAnchor";
import { VolumeRangeBar } from "./VolumeRangeBar";

type Filter = "all" | Exclude<RegionStatus, "insufficient-data">;
type Grouping = "status" | "area";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All regions" },
  { id: "below-target", label: "Below target" },
  { id: "on-track", label: "On track" },
  { id: "above-target", label: "Above target" },
];

const STATUS_GROUPS: { status: RegionStatus; label: string }[] = [
  { status: "below-target", label: "Needs attention" },
  { status: "insufficient-data", label: "Insufficient data" },
  { status: "on-track", label: "On track" },
  { status: "above-target", label: "Above target" },
];

const GOALS: Goal[] = ["auto", "lagging", "maintain", "overdeveloped"];

function statusTone(status: RegionStatus): StatusTone {
  if (status === "on-track") return "good";
  if (status === "insufficient-data") return "muted";
  return "warn";
}

function formatSets(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function GoalEditor({
  row,
  photoPriority,
  hasOverride,
  draft,
  onDraft,
  onApply,
}: {
  row: RegionView;
  photoPriority?: RegionPriority;
  hasOverride: boolean;
  draft: Goal | undefined;
  onDraft: (goal: Goal | undefined) => void;
  onApply: (goal: Goal) => boolean;
}) {
  const selectId = useId();
  const current: Goal = hasOverride ? row.priority : "auto";
  const value = draft ?? current;
  const autoPriority = photoPriority ?? "maintain";
  const resolved: RegionPriority = value === "auto" ? autoPriority : value;
  const preview = targetsFor(row.id, resolved);
  const changed = draft !== undefined && draft !== current;
  const [failed, setFailed] = useState(false);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={selectId} className="text-[14px] font-medium leading-[22px] text-ink">
        Goal
      </label>
      <select
        id={selectId}
        value={value}
        onChange={(event) => {
          const next = event.target.value as Goal;
          setFailed(false);
          onDraft(next === current ? undefined : next);
        }}
        className="min-h-11 w-full max-w-[280px] rounded-control border border-line bg-bg px-3 text-[15px] text-ink"
      >
        {GOALS.map((goal) => (
          <option key={goal} value={goal}>
            {goal === "auto"
              ? `Auto (${GOAL_LABEL[autoPriority]}${photoPriority ? ", from photos" : ""})`
              : GOAL_LABEL[goal]}
          </option>
        ))}
      </select>
      {changed ? (
        <div className="rounded-control border border-accent/40 bg-accent/10 px-4 py-3 text-[14px] leading-[22px]">
          <p className="text-ink">
            Draft: target {preview.low}–{preview.high} sets / week
            {preview.low !== row.targetMin || preview.high !== row.targetMax
              ? ` (now ${row.targetMin}–${row.targetMax})`
              : " (unchanged)"}
            . Scores and your plan will be recalculated.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              onClick={() => {
                if (!onApply(draft)) setFailed(true);
              }}
            >
              {failed ? "Retry" : "Apply and recalculate"}
            </Button>
            <Button variant="ghost" onClick={() => onDraft(undefined)}>
              Discard
            </Button>
          </div>
          {failed ? <p className="mt-2 text-bad">Recalculation failed. Your previous report is unchanged.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function RegionDetails({
  row,
  photoPriority,
  hasOverride,
  draft,
  onDraft,
  onApply,
}: {
  row: RegionView;
  photoPriority?: RegionPriority;
  hasOverride: boolean;
  draft: Goal | undefined;
  onDraft: (goal: Goal | undefined) => void;
  onApply: (goal: Goal) => boolean;
}) {
  const recId = row.recommendationIds[0];
  return (
    <div className="grid grid-cols-1 gap-6 px-5 pb-6 pt-2 md:grid-cols-2 md:px-6">
      <div className="rounded-control bg-raised px-4 py-3 md:col-span-2">
        <p className="hg-eyebrow">Photos + training</p>
        <p className="mt-1 text-ink">{row.assessment}</p>
      </div>
      <div className="flex flex-col gap-4">
        <GoalEditor
          row={row}
          photoPriority={photoPriority}
          hasOverride={hasOverride}
          draft={draft}
          onDraft={onDraft}
          onApply={onApply}
        />
        <div>
          <p className="text-[14px] font-medium leading-[22px] text-ink">Photo context</p>
          <p className="text-[14px] leading-[22px] text-ink-2">{photoContextLabel(row.photo)}</p>
          {row.photo.kind === "seen" && row.photo.note ? (
            <p className="mt-1 text-[14px] leading-[22px] text-ink-3">“{row.photo.note}”</p>
          ) : null}
        </div>
        <div>
          <p className="text-ink">
            <span className="font-semibold tabular-nums">{formatSets(row.effectiveSets)}</span> effective sets / week ·
            target {row.targetMin}–{row.targetMax}
          </p>
          <p className="text-[14px] leading-[22px] text-ink-3">
            {row.trainingDays === 0
              ? "Not trained in what you've done lately"
              : `Trained about ${formatSets(row.trainingDays)}× a week`}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div>
          <p className="hg-eyebrow">Contributing exercises</p>
          {row.contributions.length === 0 ? (
            <p className="mt-1 text-[14px] leading-[22px] text-ink-2">Nothing in your routines trains this region.</p>
          ) : (
            <ul className="mt-1 divide-y divide-line/70">
              {row.contributions.slice(0, 6).map((item) => (
                <li key={item.name} className="flex items-baseline justify-between gap-4 py-2 text-[14px] leading-[22px]">
                  <span className="min-w-0">
                    <span className="text-ink">{item.name}</span>
                    <span className="block truncate text-ink-3">{item.days.join(", ")}</span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums text-ink-2">
                    {item.directSets > 0 ? `${item.directSets} direct` : null}
                    {item.directSets > 0 && item.indirectSets > 0 ? " · " : null}
                    {item.indirectSets > 0 ? `${formatSets(item.indirectSets)} indirect` : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {recId ? (
          <div>
            <p className="text-[14px] font-medium leading-[22px] text-ink">Suggested next step</p>
            <TextLink href={`/report/plan#${recAnchor(recId)}`} className="text-[14px]">
              View recommendation <span aria-hidden>→</span>
            </TextLink>
          </div>
        ) : null}
        <details className="text-[14px] leading-[22px]">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-accent hover:text-accent-hover">
            How effective sets are estimated
          </summary>
          <p className="text-ink-2">
            A working set counts fully toward the muscle an exercise mainly trains (direct) and partially toward muscles
            it also works (indirect, for example about 0.4 of a set to triceps from bench press). Sets come from your saved
            routines.
          </p>
        </details>
      </div>
    </div>
  );
}

function RegionRow({
  row,
  axisMax,
  open,
  onToggle,
  focusOnMount,
  unsaved,
  children,
}: {
  row: RegionView;
  axisMax: number;
  open: boolean;
  onToggle: () => void;
  focusOnMount: boolean;
  unsaved: boolean;
  children: React.ReactNode;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!focusOnMount) return;
    buttonRef.current?.scrollIntoView({ block: "center" });
    buttonRef.current?.focus({ preventScroll: true });
  }, [focusOnMount]);

  return (
    <li className={open ? "bg-surface" : ""}>
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={panelId}
        className="grid min-h-14 w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-2 px-5 py-3 text-left hover:bg-surface md:grid-cols-[minmax(140px,1fr)_minmax(160px,2fr)_170px_130px_16px] md:px-6"
      >
        <span className="col-start-1 row-start-1 min-w-0 font-medium text-ink">
          {row.name}
          {row.priority === "lagging" || unsaved ? (
            <span className="flex gap-2 text-[12px] font-normal leading-4">
              {row.priority === "lagging" ? <span className="text-ink-3">Priority</span> : null}
              {unsaved ? <span className="text-accent">Unsaved goal</span> : null}
            </span>
          ) : null}
        </span>
        <span className="col-span-2 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1">
          <VolumeRangeBar
            value={row.effectiveSets}
            min={row.targetMin}
            max={row.targetMax}
            axisMax={axisMax}
            status={row.status}
          />
        </span>
        <span className="col-span-2 row-start-3 text-[14px] tabular-nums text-ink-2 md:col-span-1 md:col-start-3 md:row-start-1">
          {formatSets(row.effectiveSets)} sets · target {row.targetMin}–{row.targetMax}
        </span>
        <span className="col-start-2 row-start-1 md:col-start-4">
          <StatusLabel tone={statusTone(row.status)}>{STATUS_LABEL[row.status]}</StatusLabel>
        </span>
        <span
          aria-hidden
          className={`hidden text-ink-3 transition-transform md:col-start-5 md:row-start-1 md:block ${open ? "rotate-90" : ""}`}
        >
          ›
        </span>
      </button>
      <div id={panelId} hidden={!open}>
        {open ? children : null}
      </div>
    </li>
  );
}

export function RegionsView() {
  const { regions, physique, overrides, setGoal } = useReadyReport();
  const params = useSearchParams();
  const deepLink = params.get("open") as RegionId | null;
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [grouping, setGrouping] = useState<Grouping>("status");
  const [open, setOpen] = useState<Set<RegionId>>(() => new Set(deepLink ? [deepLink] : []));
  const [drafts, setDrafts] = useState<Partial<Record<RegionId, Goal>>>({});
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const searchId = useId();
  const groupId = useId();
  const axisMax = volumeAxisMax(regions);

  const counts = useMemo(
    () => ({
      all: regions.length,
      "below-target": regions.filter((row) => row.status === "below-target").length,
      "on-track": regions.filter((row) => row.status === "on-track").length,
      "above-target": regions.filter((row) => row.status === "above-target").length,
    }),
    [regions],
  );

  const matches = regions
    .filter((row) => filter === "all" || row.status === filter)
    .filter((row) => row.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort(compareRegions);

  const groups =
    grouping === "status"
      ? STATUS_GROUPS.map((group) => ({
          label: group.label,
          rows: matches.filter((row) => row.status === group.status),
        }))
      : BODY_AREAS.map((area) => ({ label: area, rows: matches.filter((row) => row.bodyArea === area) }));

  function toggle(id: RegionId) {
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function apply(row: RegionView, goal: Goal): boolean {
    try {
      setGoal(row.id, goal);
    } catch {
      return false;
    }
    setDrafts((current) => {
      const next = { ...current };
      delete next[row.id];
      return next;
    });
    const label = goal === "auto" ? "Auto" : GOAL_LABEL[goal];
    setConfirmation(`${row.name} set to ${label}. Targets, scores, and your plan were recalculated.`);
    return true;
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="hg-h1">Muscle regions</h1>
        <p className="mt-3 max-w-[640px] text-ink-2">See where your weekly training aligns with your priorities.</p>
      </section>

      <section aria-label="Filter regions" className="flex flex-col gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Status filter">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={`min-h-11 rounded-full border px-4 text-[14px] font-medium transition-colors ${
                filter === item.id
                  ? "border-accent bg-accent/15 text-ink"
                  : "border-line text-ink-2 hover:border-ink-3 hover:text-ink"
              }`}
            >
              {item.label}
              {item.id !== "all" ? <span className="ml-1.5 tabular-nums text-ink-3">{counts[item.id]}</span> : null}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex w-full max-w-[360px] flex-col gap-1">
            <label htmlFor={searchId} className="text-[12px] font-medium leading-[18px] text-ink-3">
              Search regions
            </label>
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="e.g. delts"
              className="min-h-11 rounded-control border border-line bg-surface px-3 text-[15px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
            />
          </div>
          <div className="flex items-end gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor={groupId} className="text-[12px] font-medium leading-[18px] text-ink-3">
                Group by
              </label>
              <select
                id={groupId}
                value={grouping}
                onChange={(event) => setGrouping(event.target.value as Grouping)}
                className="min-h-11 rounded-control border border-line bg-surface px-3 text-[15px] text-ink"
              >
                <option value="status">Status</option>
                <option value="area">Body area</option>
              </select>
            </div>
          </div>
        </div>
        <details className="text-[14px] leading-[22px]">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-accent hover:text-accent-hover">
            How targets work
          </summary>
          <p className="max-w-[720px] text-ink-2">
            Each muscle has a weekly range of effective sets. Prioritized muscles get a higher range; lower-priority ones get
            a lower range. With the goal on Auto, priority comes from photo context if you added photos, otherwise a
            standard range. Above target isn&apos;t proof of overtraining; it means more volume than this range calls for.
            Needs-attention rows are sorted with priorities first, then by how far below target they are.
          </p>
        </details>
      </section>

      <p className="sr-only" aria-live="polite">
        {confirmation ?? ""}
      </p>
      {confirmation ? (
        <div className="flex items-center justify-between gap-4 rounded-control bg-good/10 px-4 py-2 text-[14px] text-good">
          <span>{confirmation}</span>
          <button
            type="button"
            onClick={() => setConfirmation(null)}
            className="inline-flex min-h-11 items-center px-2 text-ink-2 hover:text-ink"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {matches.length === 0 ? (
        <div className="rounded-card border border-line bg-surface px-5 py-6 text-center">
          <p className="text-ink">No regions match these filters.</p>
          <Button
            variant="secondary"
            className="mt-3"
            onClick={() => {
              setFilter("all");
              setQuery("");
            }}
          >
            Clear filters
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups
            .filter((group) => group.rows.length > 0)
            .map((group) => (
              <section key={group.label} aria-label={group.label}>
                <div className="hidden grid-cols-[minmax(140px,1fr)_minmax(160px,2fr)_170px_130px_16px] gap-x-4 px-6 pb-2 md:grid">
                  <h2 className="hg-eyebrow">{group.label}</h2>
                  <span className="hg-eyebrow">Weekly effective sets</span>
                  <span />
                  <span className="hg-eyebrow">Status</span>
                </div>
                <h2 className="hg-eyebrow pb-2 md:hidden">{group.label}</h2>
                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
                  {group.rows.map((row) => (
                    <RegionRow
                      key={row.id}
                      row={row}
                      axisMax={axisMax}
                      open={open.has(row.id)}
                      onToggle={() => toggle(row.id)}
                      focusOnMount={row.id === deepLink}
                      unsaved={drafts[row.id] !== undefined}
                    >
                      <RegionDetails
                        row={row}
                        photoPriority={physique?.lagMap[row.id]}
                        hasOverride={overrides[row.id] !== undefined}
                        draft={drafts[row.id]}
                        onDraft={(goal) =>
                          setDrafts((current) => {
                            const next = { ...current };
                            if (goal === undefined) delete next[row.id];
                            else next[row.id] = goal;
                            return next;
                          })
                        }
                        onApply={(goal) => apply(row, goal)}
                      />
                    </RegionRow>
                  ))}
                </ul>
              </section>
            ))}
        </div>
      )}

      <p className="text-[14px] leading-[22px] text-ink-3">
        Showing {matches.length} of {regions.length} regions. Targets are estimates informed by your selected priorities.
        Smaller regions you don&apos;t train and haven&apos;t prioritized aren&apos;t listed.
      </p>
    </div>
  );
}
