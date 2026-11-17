import { tryGetExercise } from "./catalog";
import type { BackToBack, HistorySet, LoggedSession, PlannedExercise, RoutineDay, Split } from "./types";

/** How often you do each day is read over this many days of logs, back from the latest workout. */
export const LOGGED_WINDOW_DAYS = 42;
export const LOGGED_WINDOW_WEEKS = LOGGED_WINDOW_DAYS / 7;
/** A routine logged within this many days is part of your current week. */
export const ACTIVE_ROUTINE_DAYS = 28;
export const ACTIVE_ROUTINE_WEEKS = ACTIVE_ROUTINE_DAYS / 7;
/** Below this, a day isn't part of your training: a routine you've stopped, or a one-off workout. */
export const SKIPPED_PER_WEEK = 0.5;
/** Share of a workout's exercises that must match a routine to count as that routine. */
const MATCH_SHARE = 0.6;
const LOGGED_PREFIX = "logged:";

const DAY_MS = 86_400_000;

function dayNumber(date: string): number {
  return Math.floor(Date.parse(`${date.slice(0, 10)}T00:00:00Z`) / DAY_MS);
}

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase().replace(/\s+/g, " ");
}

type Session = { key: string; date: string; title: string; routineId?: string; sets: HistorySet[] };

/** Groups logged sets into sessions: by workout id, or by date for older imports. */
function sessionsFrom(history: HistorySet[], meta: LoggedSession[]): Session[] {
  const byId = new Map(meta.map((session) => [session.id, session]));
  const sessions = new Map<string, Session>();
  for (const set of history) {
    const key = set.workoutId ?? `date:${set.date.slice(0, 10)}`;
    let session = sessions.get(key);
    if (!session) {
      const info = set.workoutId ? byId.get(set.workoutId) : undefined;
      session = {
        key,
        date: set.date.slice(0, 10),
        title: info?.title ?? "",
        routineId: info?.routineId ?? undefined,
        sets: [],
      };
      sessions.set(key, session);
    }
    session.sets.push(set);
  }
  return [...sessions.values()];
}

/** Which routine a workout was: its routine id, else a title match, else most of the same exercises. */
function matchRoutine(session: Session, routines: RoutineDay[]): RoutineDay | undefined {
  if (session.routineId) {
    const exact = routines.find((day) => day.id === session.routineId);
    if (exact) return exact;
  }
  if (session.title) {
    const title = normalizeTitle(session.title);
    const named = routines.find((day) => normalizeTitle(day.title) === title);
    if (named) return named;
  }
  const done = new Set(session.sets.map((set) => set.exerciseId));
  let best: { day: RoutineDay; share: number } | undefined;
  for (const day of routines) {
    const ids = new Set(day.exercises.map((item) => item.exerciseId));
    if (ids.size === 0 || done.size === 0) continue;
    const shared = [...done].filter((id) => ids.has(id)).length;
    const share = shared / Math.max(ids.size, done.size);
    if (share >= MATCH_SHARE && (!best || share > best.share)) best = { day, share };
  }
  return best?.day;
}

/** The day as actually performed: each exercise at its average working sets per session. */
function averagedExercises(sessions: Session[]): PlannedExercise[] {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    for (const set of session.sets) {
      // Imports from before logged exercises were registered can hold ids with no stimulus map.
      if (set.type === "warmup" || !tryGetExercise(set.exerciseId)) continue;
      totals.set(set.exerciseId, (totals.get(set.exerciseId) ?? 0) + 1);
    }
  }
  return [...totals.entries()].flatMap(([exerciseId, total]) => {
    const average = Math.round(total / sessions.length);
    if (average <= 0) return [];
    return [{ exerciseId, sets: Array.from({ length: average }, () => ({ type: "normal" as const })) }];
  });
}

/**
 * The split you're actually training. Each routine you've logged in the last
 * four weeks counts at least once a week, more if your logs show it more
 * often, and uses the sets you logged rather than the ones saved. Routines
 * you haven't logged in four weeks stay in with perWeek 0: no volume, but the
 * planner can suggest getting back to them. Workouts that match no routine
 * count as often as you logged them.
 *
 * Returns the routines unchanged when there are no logs to read.
 */
export function loggedSplit(routines: Split, history: HistorySet[], meta: LoggedSession[] = []): Split {
  const latest = history.reduce((max, set) => (set.date > max ? set.date : max), "");
  if (!latest) return { ...routines, source: "routines" };

  const end = dayNumber(latest);
  const start = end - LOGGED_WINDOW_DAYS + 1;
  const activeFrom = end - ACTIVE_ROUTINE_DAYS + 1;
  const sessions = sessionsFrom(
    history.filter((set) => dayNumber(set.date) >= start),
    meta,
  );
  // A short history averages over what exists, so a new lifter isn't read as training half as often.
  const hasOlder = history.some((set) => dayNumber(set.date) < start);
  const first = Math.min(...sessions.map((session) => dayNumber(session.date)));
  const weeks = hasOlder ? LOGGED_WINDOW_WEEKS : Math.min(LOGGED_WINDOW_WEEKS, Math.max(1, (end - first + 1) / 7));

  const groups = new Map<string, { id: string; title: string; routine?: RoutineDay; sessions: Session[] }>();
  for (const session of sessions) {
    const routine = matchRoutine(session, routines.days);
    const id = routine?.id ?? `${LOGGED_PREFIX}${normalizeTitle(session.title) || "other"}`;
    const title = routine?.title ?? (session.title.trim() || "Other workouts");
    const group = groups.get(id) ?? { id, title, routine, sessions: [] };
    group.sessions.push(session);
    groups.set(id, group);
  }

  const days: RoutineDay[] = [...groups.values()]
    .map((group) => {
      const rate = group.sessions.length / weeks;
      const active = group.sessions.some((session) => dayNumber(session.date) >= activeFrom);
      // A routine you're doing counts as part of every week, even if you skipped one lately.
      const perWeek = group.routine ? (active ? Math.max(rate, 1) : 0) : rate;
      return { id: group.id, title: group.title, perWeek, exercises: averagedExercises(group.sessions) };
    })
    .filter((day) => day.exercises.length > 0);

  for (const routine of routines.days) {
    const logged = days.find((day) => day.id === routine.id);
    // Not done lately: keep the saved routine so a resume suggestion can describe it.
    if (logged && logged.perWeek === 0) logged.exercises = structuredClone(routine.exercises);
    if (!logged) days.push({ ...structuredClone(routine), perWeek: 0 });
  }

  // Back-to-back pairs on consecutive calendar dates.
  const dayOf = new Map<string, string>();
  for (const group of groups.values()) for (const session of group.sessions) dayOf.set(session.key, group.id);
  const byDate = new Map<number, string[]>();
  for (const session of sessions) {
    const date = dayNumber(session.date);
    byDate.set(date, [...(byDate.get(date) ?? []), dayOf.get(session.key)!]);
  }
  const pairCounts = new Map<string, number>();
  for (const [date, ids] of byDate) {
    for (const next of byDate.get(date + 1) ?? []) {
      for (const id of ids) {
        const key = `${id}\u0000${next}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }
  const backToBack: BackToBack[] = [...pairCounts.entries()].map(([key, count]) => {
    const [fromDayId, toDayId] = key.split("\u0000");
    return { fromDayId, toDayId, perWeek: count / weeks };
  });

  return {
    title: "Your logged training",
    cycleDays: 7,
    days,
    source: "logged",
    weeks: Math.round(weeks * 10) / 10,
    backToBack,
  };
}

export function perWeekOf(day: RoutineDay): number {
  return day.perWeek ?? 1;
}

/** Not part of your current training: a routine you've stopped, or a rare one-off workout. */
export function isSkipped(day: RoutineDay): boolean {
  return perWeekOf(day) < SKIPPED_PER_WEEK;
}

/** A saved Hevy routine, as opposed to a group of logged workouts that match none. */
export function isRoutineDay(day: RoutineDay): boolean {
  return !day.id.startsWith(LOGGED_PREFIX);
}
