import type { FactoryProject, ThroughputResult } from "../../../model/types";
import { calculateThroughput } from "../../throughput";
import { convertBuildToPlan } from "../convert";

/**
 * A Build (or classic Solve) plan opened on the plan board runs as its
 * conversion (`convertBuildToPlan`): built counts become pins, targets become
 * port rates, buffers become wires. The stored project is never changed; this
 * is a view. A project already in plan mode comes back as it is.
 *
 * Not re-exported from `plan/index.ts`: it imports `calculateThroughput`,
 * which imports that index.
 */
export function projectForPlanBoard(project: FactoryProject): FactoryProject {
  return project.planMode ? project : convertBuildToPlan(project);
}

/** The books the plan board shows for any project. */
export function calculatePlanBoardThroughput(
  project: FactoryProject,
  options: { generatedAt?: string } = {},
): ThroughputResult {
  return calculateThroughput(projectForPlanBoard(project), options);
}
