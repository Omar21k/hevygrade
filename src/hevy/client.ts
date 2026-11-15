import type {
  HevyExerciseTemplate,
  HevyRoutine,
  HevyUserInfo,
  HevyWorkout,
  Paginated,
} from "./types";

const HEVY_API = "https://api.hevyapp.com";

export class HevyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Seconds, only when Hevy sends a Retry-After header. */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "HevyApiError";
  }
}

async function hevyFetch<T>(apiKey: string, path: string): Promise<T> {
  const response = await fetch(`${HEVY_API}${path}`, {
    headers: { "api-key": apiKey, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const retryAfter = Number(response.headers.get("retry-after"));
    throw new HevyApiError(
      response.status === 401
        ? "Hevy rejected that API key. Create a Pro key at hevy.com/settings?developer."
        : `Hevy ${path} failed (${response.status})${body ? `: ${body.slice(0, 180)}` : ""}`,
      response.status,
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined,
    );
  }
  return (await response.json()) as T;
}

async function paginate<K extends string, T>(
  apiKey: string,
  path: string,
  key: K,
  pageSize: number,
  maxPages: number,
): Promise<T[]> {
  const items: T[] = [];
  let page = 1;
  let pageCount = 1;
  while (page <= pageCount && page <= maxPages) {
    const qs = `${path}${path.includes("?") ? "&" : "?"}page=${page}&pageSize=${pageSize}`;
    const data = await hevyFetch<Paginated<K, T>>(apiKey, qs);
    const batch = data[key] ?? [];
    items.push(...batch);
    pageCount = Math.max(1, data.page_count ?? 1);
    page += 1;
  }
  return items;
}

export async function fetchHevyAccount(apiKey: string) {
  const [user, routines, templates, workouts] = await Promise.all([
    hevyFetch<HevyUserInfo>(apiKey, "/v1/user/info").catch(() => ({}) as HevyUserInfo),
    paginate<"routines", HevyRoutine>(apiKey, "/v1/routines", "routines", 10, 20),
    paginate<"exercise_templates", HevyExerciseTemplate>(
      apiKey,
      "/v1/exercise_templates",
      "exercise_templates",
      100,
      8,
    ),
    paginate<"workouts", HevyWorkout>(apiKey, "/v1/workouts", "workouts", 10, 8),
  ]);

  return { user, routines, templates, workouts };
}
