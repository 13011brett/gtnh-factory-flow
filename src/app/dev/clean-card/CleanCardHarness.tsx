"use client";

import { useEffect } from "react";
import { FactoryPlannerApp } from "@/components/FactoryPlannerApp";
import { mockPlans } from "@/lib/solver/plan/__fixtures__/mock-extras";
import { useFactoryStore } from "@/store/factory-store";

/**
 * Exposes the store and the plan-mode mock results so a browser session can load
 * them into the real board: `__ccStore.setState({ project, lastResult })`.
 */
export function CleanCardHarness() {
  useEffect(() => {
    const w = window as unknown as { __ccStore?: typeof useFactoryStore; __ccMocks?: typeof mockPlans };
    w.__ccStore = useFactoryStore;
    w.__ccMocks = mockPlans;
  }, []);
  return <FactoryPlannerApp />;
}
