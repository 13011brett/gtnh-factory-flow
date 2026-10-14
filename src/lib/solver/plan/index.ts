import type {
  BottleneckReport,
  FactoryProject,
  FactoryStorage,
  NodeThroughputResult,
  StorageThroughputResult,
  ThroughputResult,
} from "../../model/types";

export * from "./types";
export { makePortKey, parsePortKey } from "./port-key";
export { compareIds, comparePortRef } from "./ids";
export { convertBuildToPlan } from "./convert";

/**
 * Everything `calculateThroughput` has built by the time it reaches the
 * solve-mode branch: the project fully expanded (shared sections, hatch
 * supplies, loose-cell tanks), every enabled node's nameplate report, the
 * storages, and the hidden helpers to strike from the result. The plan solver
 * reads the nameplate flows, so overclocks, parallels, chances and output
 * multipliers are the old solvers' by construction.
 */
export interface PlanSolveArgs {
  project: FactoryProject;
  nodes: Record<string, NodeThroughputResult>;
  storages: Record<string, StorageThroughputResult>;
  projectStorages: FactoryStorage[];
  bottlenecks: BottleneckReport[];
  crossForm: { hiddenNodeIds: string[]; hiddenEdgeIds: string[] };
  options: { generatedAt?: string };
}

/**
 * The plan-mode entry, called from the dispatch seam in `calculateThroughput`
 * for a project with `planMode`. The adapter (WP2) replaces this body; until
 * then plan mode is not available and nothing may turn it on by accident.
 */
export function planSolve(args: PlanSolveArgs): ThroughputResult {
  void args;
  throw new Error("Plan mode solver: not implemented");
}
