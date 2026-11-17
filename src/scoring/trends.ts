import type { HistorySet } from "./types";

/**
 * Progression reads a recent block, not all-time: over years of history almost
 * every lift trends up, which says nothing about the current program.
 */
export const PROGRESSION_WINDOW_DAYS = 84;

/** Sets within PROGRESSION_WINDOW_DAYS of the most recent logged set. */
export function recentHistory(history: HistorySet[]): HistorySet[] {
  const latest = history.reduce((max, set) => (set.date > max ? set.date : max), "");
  if (!latest) return history;
  const cutoff = new Date(`${latest.slice(0, 10)}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - PROGRESSION_WINDOW_DAYS);
  const from = cutoff.toISOString().slice(0, 10);
  return history.filter((set) => set.date.slice(0, 10) >= from);
}

/** Within ±2% of the starting estimate counts as holding. Matches growth's progression read. */
const TREND_BAND = 0.02;
/** A new best has to beat the old one by this much to count. */
const PR_MARGIN = 0.01;

export type ExerciseTrend = {
  exerciseId: string;
  sessions: number;
  /** First session in the window (YYYY-MM-DD). */
  since: string;
  /** Latest third of sessions vs earliest third, as a fraction (0.06 = up 6%). */
  change: number;
  direction: "up" | "flat" | "down";
  /** Sessions since the last time the best set improved. */
  sessionsSinceBest: number;
  /** The best set in the window, e.g. "60 kg × 10" or "12 reps". */
  bestSet: string;
  /** Typical working reps lately, e.g. "8–10". */
  reps?: string;
};

type Best = { strength: number; label: string };

/** Epley estimated 1RM for loaded sets; reps for bodyweight sets. */
function setStrength(weightKg: number | undefined, reps: number): number {
  return weightKg && weightKg > 0 ? weightKg * (1 + reps / 30) : reps;
}

function formatWeight(kg: number): string {
  return `${Number.isInteger(kg) ? kg : kg.toFixed(1)} kg`;
}

function setLabel(weightKg: number | undefined, reps: number): string {
  return weightKg && weightKg > 0 ? `${formatWeight(weightKg)} × ${reps}` : `${reps} reps`;
}

/**
 * How one exercise has moved over the progression window (12 weeks), from
 * the best set of each session. Null with fewer than two sessions.
 */
export function exerciseTrend(history: HistorySet[], exerciseId: string): ExerciseTrend | null {
  const byDay = new Map<string, Best>();
  const recentReps: { date: string; reps: number }[] = [];
  for (const set of recentHistory(history)) {
    if (set.exerciseId !== exerciseId || set.type === "warmup" || !set.reps || set.reps <= 0) continue;
    const day = set.date.slice(0, 10);
    const strength = setStrength(set.weightKg, set.reps);
    const current = byDay.get(day);
    if (!current || strength > current.strength) byDay.set(day, { strength, label: setLabel(set.weightKg, set.reps) });
    recentReps.push({ date: day, reps: set.reps });
  }
  if (byDay.size < 2) return null;

  const sessions = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b));
  const values = sessions.map(([, best]) => best.strength);
  const third = Math.max(1, Math.ceil(values.length / 3));
  const avg = (items: number[]) => items.reduce((sum, value) => sum + value, 0) / items.length;
  const early = avg(values.slice(0, third));
  const late = avg(values.slice(-third));
  const change = early > 0 ? (late - early) / early : 0;

  let bestIndex = 0;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] > values[bestIndex] * (1 + PR_MARGIN)) bestIndex = index;
  }

  // Reps from the last two sessions are what you're doing now.
  const lastDays = new Set(sessions.slice(-2).map(([day]) => day));
  const reps = recentReps.filter((item) => lastDays.has(item.date)).map((item) => item.reps);
  const low = Math.min(...reps);
  const high = Math.max(...reps);

  return {
    exerciseId,
    sessions: sessions.length,
    since: sessions[0][0],
    change,
    direction: change > TREND_BAND ? "up" : change < -TREND_BAND ? "down" : "flat",
    sessionsSinceBest: values.length - 1 - bestIndex,
    bestSet: sessions[bestIndex][1].label,
    reps: reps.length === 0 ? undefined : low === high ? String(low) : `${low}–${high}`,
  };
}

export function formatDay(date: string): string {
  return new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** One line on how a lift is moving, e.g. "Lat Pulldown: stuck around 60 kg × 10 for 5 sessions." */
export function describeTrend(name: string, trend: ExerciseTrend): string {
  const percent = Math.round(Math.abs(trend.change) * 100);
  if (trend.direction === "up") return `${name}: up ${percent}% since ${formatDay(trend.since)}, best ${trend.bestSet}.`;
  if (trend.direction === "down") return `${name}: down ${percent}% since ${formatDay(trend.since)}.`;
  if (trend.sessionsSinceBest >= 3) {
    return `${name}: stuck around ${trend.bestSet} for ${trend.sessionsSinceBest} sessions.`;
  }
  return `${name}: holding around ${trend.bestSet} since ${formatDay(trend.since)}.`;
}
