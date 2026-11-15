"use client";

import { loadHevySession, type HevyPayload } from "@/hevy/session";
import { subscribeSession } from "@/lib/sessionStore";
import { registerExercises, type Grade, type LagMap, type Plan, type RegionId, type Split } from "@/scoring";
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import {
  loadLagOverrides,
  loadPhysique,
  loadPlanChoices,
  NO_CHOICES,
  saveLagOverrides,
  savePlanChoices,
  type PhysiqueResult,
  type PlanChoices,
} from "./state";
import {
  buildReport,
  type Goal,
  type Metric,
  type MetricStory,
  type Recommendation,
  type RegionView,
  type ReportDetails,
} from "./view";

const NO_OVERRIDES: LagMap = {};
const serverNull = () => null;

export type ReportData = {
  hevy: HevyPayload;
  physique: PhysiqueResult | null;
  split: Split;
  lagMap: LagMap;
  overrides: LagMap;
  grade: Grade;
  /** The same split graded without photo context or goals. */
  baseline: Grade;
  plan: Plan;
  recommendations: Recommendation[];
  regions: RegionView[];
  stories: Record<Metric, MetricStory>;
  details: ReportDetails;
  choices: PlanChoices;
};

export type ReportState =
  | { status: "loading" }
  | { status: "no-hevy" }
  | { status: "ready"; data: ReportData };

type ReportActions = {
  setGoal: (region: RegionId, goal: Goal) => void;
  setChoices: (choices: PlanChoices) => void;
};

const ReportContext = createContext<(ReportState & ReportActions) | null>(null);

export function useSessionReady(): boolean {
  return useSyncExternalStore(subscribeSession, () => true, () => false);
}

function useReportState(): ReportState & ReportActions {
  const loaded = useSessionReady();
  const hevy = useSyncExternalStore(subscribeSession, loadHevySession, serverNull);
  const physique = useSyncExternalStore(subscribeSession, loadPhysique, serverNull);
  const overrides = useSyncExternalStore(subscribeSession, loadLagOverrides, () => NO_OVERRIDES);
  const choices = useSyncExternalStore(subscribeSession, loadPlanChoices, () => NO_CHOICES);

  /** Hevy exercise ids only resolve after their stimulus defs are registered. */
  const split = useMemo(() => {
    if (!hevy) return null;
    registerExercises(hevy.exercises ?? []);
    return hevy.split;
  }, [hevy]);

  const lagMap = useMemo<LagMap>(() => ({ ...(physique?.lagMap ?? {}), ...overrides }), [physique, overrides]);

  const core = useMemo(() => {
    if (!split || !hevy) return null;
    return buildReport({ hevy, split, lagMap, physique, overrides });
  }, [split, hevy, lagMap, physique, overrides]);

  const setGoal = useCallback(
    (region: RegionId, goal: Goal) => {
      const next: LagMap = { ...overrides };
      if (goal === "auto") delete next[region];
      else next[region] = goal;
      saveLagOverrides(next);
    },
    [overrides],
  );

  const actions = useMemo(() => ({ setGoal, setChoices: savePlanChoices }), [setGoal]);

  if (!loaded) return { status: "loading", ...actions };
  if (!hevy || !split || !core) return { status: "no-hevy", ...actions };
  return {
    status: "ready",
    data: { hevy, physique, split, lagMap, overrides, choices, ...core },
    ...actions,
  };
}

export function ReportProvider({ children }: { children: ReactNode }) {
  const value = useReportState();
  return <ReportContext.Provider value={value}>{children}</ReportContext.Provider>;
}

export function useReport() {
  const value = useContext(ReportContext);
  if (!value) throw new Error("useReport must be used inside <ReportProvider>");
  return value;
}

/** For screens that only render once the report is ready (the shell handles other states). */
export function useReadyReport(): ReportData & ReportActions {
  const value = useReport();
  if (value.status !== "ready") throw new Error("Report is not ready");
  return { ...value.data, setGoal: value.setGoal, setChoices: value.setChoices };
}
