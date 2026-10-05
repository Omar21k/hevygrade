import type { ExerciseDef, HistorySet, Split } from "@/scoring";

export type HevyPayload = {
  user: { name: string; id?: string };
  split: Split;
  exercises: ExerciseDef[];
  history: HistorySet[];
  unmatched: string[];
  days: { id: string; title: string; movements: number }[];
  workoutCount: number;
};

const KEY = "hevygrade.hevy";

export function saveHevySession(payload: HevyPayload) {
  sessionStorage.setItem(KEY, JSON.stringify(payload));
}

export function loadHevySession(): HevyPayload | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as HevyPayload;
  } catch {
    return null;
  }
}
