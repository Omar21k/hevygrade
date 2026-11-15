"use client";

import { DemoBadge, Wordmark } from "@/components/ui";
import { useReport } from "@/report/ReportContext";
import { updatedLabel } from "@/report/view";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

const TABS = [
  { href: "/report", label: "Overview" },
  { href: "/report/plan", label: "Your plan" },
  { href: "/report/regions", label: "Muscle regions" },
] as const;

function ReportTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Report"
      className="sticky top-0 z-20 border-b border-line bg-bg"
    >
      <div className="mx-auto max-w-[1120px] overflow-x-auto px-5 md:px-8">
        <ul className="flex min-w-max gap-1 md:gap-6">
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <li key={tab.href} className="flex-1 md:flex-none">
                <Link
                  href={tab.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-h-12 items-center justify-center whitespace-nowrap px-2 text-[15px] font-medium md:justify-start ${
                    active ? "text-ink" : "text-ink-3 hover:text-ink-2"
                  }`}
                >
                  {tab.label}
                  {active ? (
                    <span aria-hidden className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent" />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

export function ReportShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const report = useReport();
  const needsPhotosStep = report.status === "ready" && !report.data.physique;

  useEffect(() => {
    if (report.status === "no-hevy") router.replace("/connect");
    else if (needsPhotosStep) router.replace("/photos");
  }, [report.status, needsPhotosStep, router]);

  const hevy = report.status === "ready" ? report.data.hevy : null;
  const updated = updatedLabel(hevy?.importedAt);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header>
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-5 md:px-8">
          <div className="flex items-center gap-3">
            <Wordmark />
            {hevy?.demo ? <DemoBadge /> : null}
          </div>
          {hevy?.demo ? (
            <p className="text-right text-[14px] leading-[22px] text-ink-3">Example routines, no workout history</p>
          ) : hevy ? (
            <p className="text-right text-[14px] leading-[22px] text-ink-3">
              {hevy.workoutCount} workout{hevy.workoutCount === 1 ? "" : "s"}
              {updated ? ` · ${updated}` : ""}
            </p>
          ) : null}
        </div>
      </header>
      <ReportTabs />
      <main className="mx-auto w-full max-w-[1120px] flex-1 px-5 pb-20 pt-8 md:px-8 md:pt-12">
        {report.status === "ready" && !needsPhotosStep ? (
          children
        ) : (
          <p className="text-ink-2" role="status">
            Loading your report…
          </p>
        )}
      </main>
    </div>
  );
}
