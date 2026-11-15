"use client";

import { loadHevySession } from "@/hevy/session";
import { subscribeSession } from "@/lib/sessionStore";
import {
  buildPlan,
  gradeSplit,
  registerExercises,
  type LagMap,
  type RegionId,
  type RegionPriority,
} from "@/scoring";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import {
  clearPhysique,
  loadLagOverrides,
  loadPhysique,
  saveLagOverrides,
  savePhysique,
  type PhysiqueResult,
} from "./state";

const NO_OVERRIDES: LagMap = {};
const serverNull = () => null;

export function useReport() {
  const router = useRouter();
  const loaded = useSyncExternalStore(subscribeSession, () => true, () => false);
  const hevy = useSyncExternalStore(subscribeSession, loadHevySession, serverNull);
  const physique = useSyncExternalStore(subscribeSession, loadPhysique, serverNull);
  const overrides = useSyncExternalStore(subscribeSession, loadLagOverrides, () => NO_OVERRIDES);

  useEffect(() => {
    if (loaded && !hevy) router.replace("/connect");
  }, [loaded, hevy, router]);

  /** Hevy exercise ids only resolve after their stimulus defs are registered. */
  const split = useMemo(() => {
    if (!hevy) return null;
    registerExercises(hevy.exercises ?? []);
    return hevy.split;
  }, [hevy]);

  const lagMap = useMemo<LagMap>(
    () => ({ ...(physique?.lagMap ?? {}), ...overrides }),
    [physique, overrides],
  );

  const grade = useMemo(
    () => (split && hevy ? gradeSplit({ split, lagMap, history: hevy.history }) : null),
    [split, hevy, lagMap],
  );

  /** The same split graded with no physique input, to show what the photos changed. */
  const splitOnly = useMemo(
    () => (split && hevy ? gradeSplit({ split, lagMap: {}, history: hevy.history }) : null),
    [split, hevy],
  );

  const plan = useMemo(
    () => (split && hevy ? buildPlan({ split, lagMap, history: hevy.history }) : null),
    [split, hevy, lagMap],
  );

  const findings = useMemo(
    () => [...(physique?.findings ?? []), ...(grade?.findings ?? [])],
    [physique, grade],
  );

  const setPhysiqueResult = useCallback((result: PhysiqueResult) => {
    saveLagOverrides({});
    savePhysique(result);
  }, []);

  const setPriority = useCallback(
    (region: RegionId, priority: RegionPriority) => {
      saveLagOverrides({ ...overrides, [region]: priority });
    },
    [overrides],
  );

  return {
    loaded,
    hevy,
    physique,
    lagMap,
    grade,
    splitOnly,
    plan,
    findings,
    setPhysiqueResult,
    resetPhysique: clearPhysique,
    setPriority,
  };
}
