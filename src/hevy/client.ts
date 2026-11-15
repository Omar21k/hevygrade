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

const RATE_LIMIT_RETRIES = 2;
const MAX_RETRY_WAIT_SECONDS = 5;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function hevyFetch<T>(apiKey: string, path: string, attempt = 0): Promise<T> {
  const response = await fetch(`${HEVY_API}${path}`, {
    headers: { "api-key": apiKey, Accept: "application/json" },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const retryAfter = Number(response.headers.get("retry-after"));
    if (response.status === 429 && attempt < RATE_LIMIT_RETRIES) {
      const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : attempt + 1;
      if (wait <= MAX_RETRY_WAIT_SECONDS) {
        await sleep(wait * 1000);
        return hevyFetch<T>(apiKey, path, attempt + 1);
      }
    }
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

/** Pages fetched at once after the first; keeps a long history fast without hammering Hevy. */
const PAGE_CONCURRENCY = 4;

/**
 * Reads page 1 to learn page_count, then the rest a few at a time.
 * `truncated` is true only when the account has more than maxPages pages.
 */
async function paginate<K extends string, T>(
  apiKey: string,
  path: string,
  key: K,
  pageSize: number,
  maxPages: number,
): Promise<{ items: T[]; truncated: boolean }> {
  const url = (page: number) => `${path}${path.includes("?") ? "&" : "?"}page=${page}&pageSize=${pageSize}`;
  const first = await hevyFetch<Paginated<K, T>>(apiKey, url(1));
  const pageCount = Math.max(1, first.page_count ?? 1);
  const lastPage = Math.min(pageCount, maxPages);
  const pages: T[][] = [first[key] ?? []];
  for (let start = 2; start <= lastPage; start += PAGE_CONCURRENCY) {
    const batch = Array.from({ length: Math.min(PAGE_CONCURRENCY, lastPage - start + 1) }, (_, i) => start + i);
    const results = await Promise.all(batch.map((page) => hevyFetch<Paginated<K, T>>(apiKey, url(page))));
    pages.push(...results.map((data) => data[key] ?? []));
  }
  return { items: pages.flat(), truncated: pageCount > maxPages };
}

/** Hevy caps workouts at 10 per page; 300 pages is 3,000 workouts. */
const MAX_WORKOUT_PAGES = 300;

export async function fetchHevyAccount(apiKey: string) {
  const [user, routines, templates, workouts] = await Promise.all([
    hevyFetch<HevyUserInfo>(apiKey, "/v1/user/info").catch(() => ({}) as HevyUserInfo),
    paginate<"routines", HevyRoutine>(apiKey, "/v1/routines", "routines", 10, 50),
    paginate<"exercise_templates", HevyExerciseTemplate>(
      apiKey,
      "/v1/exercise_templates",
      "exercise_templates",
      100,
      30,
    ),
    paginate<"workouts", HevyWorkout>(apiKey, "/v1/workouts", "workouts", 10, MAX_WORKOUT_PAGES),
  ]);

  return {
    user,
    routines: routines.items,
    templates: templates.items,
    workouts: workouts.items,
    workoutsTruncated: workouts.truncated,
  };
}
