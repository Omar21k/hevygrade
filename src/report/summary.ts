import type { Finding, Grade, Plan, RegionId } from "@/scoring";
import { REGION_META, regionVerb } from "@/scoring";

export const METRICS = ["coverage", "growth", "recovery"] as const;
export type Metric = (typeof METRICS)[number];

export const METRIC_LABEL: Record<Metric, string> = {
  coverage: "Coverage",
  growth: "Growth",
  recovery: "Recovery",
};

export const METRIC_QUESTION: Record<Metric, string> = {
  coverage: "Are you training the parts that are actually behind?",
  growth: "Is there enough work, often enough, and are your lifts moving?",
  recovery: "Can you recover from this week, or is it burying the work?",
};

const SEVERITY_RANK: Record<Finding["severity"], number> = { blocker: 0, warn: 1, info: 2 };

export function scoreTone(score: number): string {
  if (score >= 8) return "text-emerald-300";
  if (score >= 5.5) return "text-amber-300";
  return "text-rose-300";
}

export function verdict(score: number): string {
  if (score >= 8) return "Strong";
  if (score >= 6.5) return "Solid";
  if (score >= 5) return "Needs work";
  return "Weak point";
}

export function topFindings(findings: Finding[], metric: Metric, limit = 2): Finding[] {
  return findings
    .filter((finding) => finding.metric === metric)
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .slice(0, limit);
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function weakestMetric(grade: Grade): Metric {
  return METRICS.reduce((low, metric) => (grade[metric].score < grade[low].score ? metric : low));
}

export type LackingSummary = {
  headline: string;
  points: string[];
};

export function lackingSummary(grade: Grade, plan: Plan | null, fromPhotos: boolean): LackingSummary {
  const lagging = grade.regions.filter((row) => row.priority === "lagging");
  const short = lagging.filter((row) => row.coverageScore < 8);
  const weakest = weakestMetric(grade);
  const points: string[] = [];

  for (const row of short.slice(0, 3)) {
    points.push(
      row.hasPrimary
        ? `${row.label}: ${row.effectiveSets} effective sets a week, needs ${row.targetLow}–${row.targetHigh}.`
        : `${row.label}: nothing in your split trains ${regionVerb(row.region) === "are" ? "them" : "it"} directly.`,
    );
  }

  if (lagging.length === 0) {
    for (const row of grade.regions.filter((r) => r.coverageScore < 6).slice(0, 3)) {
      points.push(`${row.label}: ${row.effectiveSets} effective sets a week, under ${row.targetLow}.`);
    }
  }

  if (grade.recovery.score >= 8.5) {
    points.push("Recovery has room, so you can add work without burying yourself.");
  } else if (grade.recovery.score < 6) {
    points.push("Recovery is the limiter. Cut junk volume before adding anything.");
  }

  if (grade.flags.growthCappedWithoutHistory) {
    points.push("Growth is capped at 7 until Hevy has enough logged workouts to show progress.");
  }

  const names = lagging.map((row) => row.label.toLowerCase());
  const lead =
    fromPhotos && names.length > 0
      ? `Your photos show ${joinNames(names)} ${names.length === 1 ? regionVerb(lagging[0].region) : "are"} behind.`
      : names.length > 0
        ? `You marked ${joinNames(names)} as lagging.`
        : "Your split is graded on balanced targets.";
  let tail = ` ${METRIC_LABEL[weakest]} is your weakest score.`;
  if (plan && plan.steps.length > 0) {
    const changes = `${plan.steps.length} change${plan.steps.length === 1 ? "" : "s"}`;
    tail +=
      plan.end[weakest] - plan.start[weakest] >= 0.3
        ? ` ${changes} below take it from ${plan.start[weakest].toFixed(1)} to ${plan.end[weakest].toFixed(1)}.`
        : ` ${changes} below lift your overall from ${plan.start.overall.toFixed(1)} to ${plan.end.overall.toFixed(1)}.`;
  }

  return { headline: lead + tail, points };
}

export function regionLabel(region: RegionId): string {
  return REGION_META[region].label;
}
