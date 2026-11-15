import { readSessionJson, writeSessionJson } from "@/lib/sessionStore";
import type { ExerciseDef, HistorySet, Split } from "@/scoring";

export type HevyPayload = {
  user: { name: string; id?: string };
  split: Split;
  exercises: ExerciseDef[];
  history: HistorySet[];
  unmatched: string[];
  days: { id: string; title: string; movements: number }[];
  workoutCount: number;
  /** ISO time the data was imported (or the demo was opened). */
  importedAt?: string;
  /** Fixture data, not a real Hevy account. */
  demo?: boolean;
};

const KEY = "hevygrade.hevy";

export function saveHevySession(payload: HevyPayload) {
  writeSessionJson(KEY, payload);
}

export function loadHevySession(): HevyPayload | null {
  return readSessionJson<HevyPayload>(KEY);
}
