import { NextResponse } from "next/server";
import { fetchHevyAccount, HevyApiError } from "@/hevy/client";
import { routinesToSplit, workoutsToHistory } from "@/hevy/map";
import { recentHistory } from "@/scoring";

export const runtime = "nodejs";

type ImportErrorCode = "missing_key" | "invalid_key" | "no_access" | "rate_limited" | "upstream";

function failure(code: ImportErrorCode, error: string, status: number, retryAfter?: number) {
  return NextResponse.json({ code, error, ...(retryAfter ? { retryAfter } : {}) }, { status });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { apiKey?: string };
  const apiKey = body.apiKey?.trim();
  if (!apiKey) {
    return failure("missing_key", "Paste your Hevy API key.", 400);
  }

  try {
    const { user, routines, templates, workouts, workoutsTruncated } = await fetchHevyAccount(apiKey);
    const { split, unmatched, exercises } = routinesToSplit(routines, templates);
    const fullHistory = workoutsToHistory(workouts);
    const name = user.name ?? user.username ?? "Hevy athlete";
    const dates = workouts
      .map((workout) => (workout.start_time ?? workout.end_time ?? "").slice(0, 10))
      .filter(Boolean)
      .sort();

    return NextResponse.json({
      user: { name, id: user.id },
      routineCount: routines.length,
      workoutCount: workouts.length,
      workoutsTruncated,
      firstWorkoutAt: dates[0],
      lastWorkoutAt: dates[dates.length - 1],
      split,
      exercises,
      // Only the window progression reads; keeps session storage small for long histories.
      history: recentHistory(fullHistory),
      unmatched,
      days: split.days.map((day) => ({
        id: day.id,
        title: day.title,
        movements: day.exercises.length,
      })),
    });
  } catch (error) {
    if (error instanceof HevyApiError) {
      if (error.status === 401) {
        return failure("invalid_key", "Hevy didn't accept that API key. Check it and try again.", 401);
      }
      if (error.status === 403) {
        return failure(
          "no_access",
          "Hevy recognized the key but didn't allow access. API access requires an active Hevy Pro subscription.",
          403,
        );
      }
      if (error.status === 429) {
        return failure("rate_limited", "Hevy is limiting requests right now.", 429, error.retryAfter);
      }
      return failure("upstream", `Hevy returned an error (${error.status}). Try again in a moment.`, 502);
    }
    return failure("upstream", "Couldn't reach Hevy. Check your connection and try again.", 502);
  }
}
