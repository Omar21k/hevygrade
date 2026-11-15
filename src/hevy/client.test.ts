import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHevyAccount } from "./client";

function hevyStub(workoutTotal: number) {
  const calls: string[] = [];
  const stub = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url.pathname + url.search);
    const page = Number(url.searchParams.get("page") ?? 1);
    const size = Number(url.searchParams.get("pageSize") ?? 10);
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (url.pathname === "/v1/user/info") return json({ name: "Omar" });
    if (url.pathname === "/v1/workouts") {
      const pageCount = Math.ceil(workoutTotal / size);
      const from = (page - 1) * size;
      const count = Math.max(0, Math.min(size, workoutTotal - from));
      return json({
        page,
        page_count: pageCount,
        workouts: Array.from({ length: count }, (_, i) => ({ id: `w${from + i}`, exercises: [] })),
      });
    }
    const key = url.pathname === "/v1/routines" ? "routines" : "exercise_templates";
    return json({ page: 1, page_count: 1, [key]: [] });
  });
  vi.stubGlobal("fetch", stub);
  return calls;
}

describe("fetchHevyAccount", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads every workout page, not just the first few", async () => {
    const calls = hevyStub(270);
    const { workouts, workoutsTruncated } = await fetchHevyAccount("key");
    expect(workouts).toHaveLength(270);
    expect(new Set(workouts.map((workout) => workout.id)).size).toBe(270);
    expect(workoutsTruncated).toBe(false);
    expect(calls.filter((call) => call.startsWith("/v1/workouts"))).toHaveLength(27);
  });

  it("retries once Hevy stops rate limiting", async () => {
    hevyStub(20);
    const real = globalThis.fetch;
    let limited = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        if (!limited && String(input).includes("/v1/workouts") && String(input).includes("page=2")) {
          limited = true;
          return new Response("slow down", { status: 429, headers: { "retry-after": "0.01" } });
        }
        return real(input);
      }),
    );
    const { workouts } = await fetchHevyAccount("key");
    expect(limited).toBe(true);
    expect(workouts).toHaveLength(20);
  });
});
