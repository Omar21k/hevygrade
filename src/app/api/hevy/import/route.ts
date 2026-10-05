import { NextResponse } from "next/server";
import { fetchHevyAccount, HevyApiError } from "@/hevy/client";
import { routinesToSplit, workoutsToHistory } from "@/hevy/map";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as { apiKey?: string };
  const apiKey = body.apiKey?.trim();
  if (!apiKey) {
    return NextResponse.json({ error: "Paste your Hevy Pro API key." }, { status: 400 });
  }

  try {
    const { user, routines, templates, workouts } = await fetchHevyAccount(apiKey);
    const { split, unmatched, exercises } = routinesToSplit(routines, templates);
    const history = workoutsToHistory(workouts);
    const name = user.name ?? user.username ?? "Hevy athlete";

    return NextResponse.json({
      user: { name, id: user.id },
      routineCount: routines.length,
      workoutCount: workouts.length,
      split,
      exercises,
      history,
      unmatched,
      days: split.days.map((day) => ({
        id: day.id,
        title: day.title,
        movements: day.exercises.length,
      })),
    });
  } catch (error) {
    if (error instanceof HevyApiError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "Hevy import failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
