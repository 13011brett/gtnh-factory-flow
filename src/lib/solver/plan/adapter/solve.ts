import type { ThroughputResult } from "../../../model/types";
import type { Answer, SolveInput } from "../types";
import type { PlanSolveArgs } from "./args";
import { readAnswer } from "./answer";
import { getSolveCore } from "./engine";
import { finalizePlanResult } from "./finalize";
import { buildPlanModel, type PlanModel } from "./model";

/** Adapter in, solver core, adapter out. Exposed in parts so tests can look at each. */
export function planSolveWith(
  args: PlanSolveArgs,
  core: (input: SolveInput) => Answer,
): ThroughputResult {
  const model = buildPlanModel(args);
  let answer: Answer;
  try {
    answer = core(model.input);
  } catch (error) {
    // An engine that cannot run (HiGHS missing on a thread without it, a
    // program it rejects) is a failed solve the board can show, never a crash.
    answer = {
      kind: "failed",
      failure: {
        message: "BALANCE_FAILED",
        args: [{ message: "SOLVER_BUDGET", args: [error instanceof Error ? error.message : String(error)] }],
      },
      notes: [],
      drawers: { rates: {}, unmet: [], shortfalls: [], ports: {} },
    };
  }
  return finalizePlanResult(args, model, readAnswer(model, answer));
}

export function planSolveAdapter(args: PlanSolveArgs): ThroughputResult {
  return planSolveWith(args, getSolveCore());
}

export type { PlanModel };
