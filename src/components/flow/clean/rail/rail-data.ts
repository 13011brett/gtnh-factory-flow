"use client";

import { useMemo } from "react";
import type { FactoryProject, ThroughputResult } from "@/lib/model/types";
import { useFactoryStore } from "@/store/factory-store";
import { buildRailModel, type RailModel } from "./rail-model";
import { buildSpares, type SpareView } from "./spare-model";

/**
 * The rail's and the popup's data for one (project, solve), worked out once
 * and shared: the overview, the spare popup and the notices all read the same
 * model, and a plan of hundreds of cards makes it a real cost.
 */
export interface RailData {
  rail: RailModel;
  spares: SpareView[];
}

let cache:
  | { project: FactoryProject; result: ThroughputResult | undefined; data: RailData }
  | undefined;

export function railData(project: FactoryProject, result: ThroughputResult | undefined): RailData {
  if (cache && cache.project === project && cache.result === result) return cache.data;
  const rail = buildRailModel(project, result);
  const data: RailData = { rail, spares: buildSpares(project, result, rail) };
  cache = { project, result, data };
  return data;
}

export function useRailData(): RailData {
  const project = useFactoryStore((state) => state.project);
  const result = useFactoryStore((state) => state.lastResult);
  return useMemo(() => railData(project, result), [project, result]);
}
