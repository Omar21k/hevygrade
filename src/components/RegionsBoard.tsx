"use client";

import { scoreTone } from "@/report/summary";
import { useReport } from "@/report/useReport";
import Link from "next/link";

export function RegionsBoard() {
  const { grade, lagMap, setPriority } = useReport();

  if (!grade) {
    return <div className="flex min-h-full flex-1 items-center justify-center text-zinc-400">Loading…</div>;
  }

  const rows = grade.regions.filter(
    (row) => row.priority === "lagging" || row.effectiveSets > 0 || row.coverageScore < 6,
  );

  return (
    <div className="min-h-full bg-[#07080a] text-zinc-100">
      <header className="border-b border-zinc-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <Link href="/report" className="text-sm text-zinc-400 hover:text-zinc-200">
            ← Back to results
          </Link>
          <span className="text-sm font-semibold tracking-[0.28em] text-[#C7FDA0]">HEVYGRADE</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-3xl font-semibold tracking-tight">Region breakdown</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-400">
          Weekly effective sets per region against the target for its priority. Tap a priority to change it. Your
          scores and next steps update to match.
        </p>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-base">
            <thead>
              <tr className="text-xs uppercase tracking-[0.14em] text-zinc-500">
                <th className="py-3 font-medium">Region</th>
                <th className="py-3 font-medium">Priority</th>
                <th className="py-3 font-medium">Sets / week</th>
                <th className="py-3 font-medium">Target</th>
                <th className="py-3 font-medium">Days</th>
                <th className="py-3 font-medium">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const current = lagMap[row.region];
                return (
                  <tr key={row.region} className="border-t border-zinc-900">
                    <td className="py-3 text-zinc-100">{row.label}</td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => setPriority(row.region, current === "lagging" ? "maintain" : "lagging")}
                        className={`rounded-full px-3 py-1 text-sm ${
                          current === "lagging"
                            ? "bg-amber-400/10 text-amber-300"
                            : current === "overdeveloped"
                              ? "bg-zinc-800 text-zinc-300"
                              : "text-zinc-400 hover:bg-zinc-900"
                        }`}
                      >
                        {current ?? "maintain"}
                      </button>
                    </td>
                    <td className="py-3 tabular-nums text-zinc-200">
                      {row.effectiveSets}
                      {row.hasPrimary ? "" : <span className="text-zinc-500"> · no primary</span>}
                    </td>
                    <td className="py-3 tabular-nums text-zinc-400">
                      {row.targetLow}–{row.targetHigh}
                    </td>
                    <td className="py-3 tabular-nums text-zinc-400">{row.frequency}×</td>
                    <td className={`py-3 tabular-nums ${scoreTone(row.coverageScore)}`}>{row.coverageScore}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
