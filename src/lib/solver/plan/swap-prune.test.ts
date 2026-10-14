/**
 * The alternatives search skips swaps the shortfall duals rule out (`gatesThatMayHelp`). Skipping is only allowed to drop
 * swaps that are infeasible: here every gate it drops is asked about the long way and must come back unbalanced.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { initLpEngine } from "../lp-engine";
import { loadInput } from "./__fixtures__/load";
import { SolveContext } from "./context";
import { evaluateSupport } from "./enumerate";
import { gatesThatMayHelp } from "./probes";
import { settle } from "./solve-core";
import { planExtensions } from "./solve-plan";

beforeAll(async () => {
  await initLpEngine();
});

describe("gatesThatMayHelp drops only swaps that cannot balance", () => {
  it.each(["gtnh-flow-two_decisions", "alumina-line-shared-reactor", "gtnh-flow-jet_fuel", "gtnh-flow-palladium_line"])("%s", (name) => {
    const input = loadInput(name);
    const { ctx } = settle(input, new SolveContext(input), planExtensions);
    const point = ctx.point!;
    const open = ctx.openGates.size === 0 ? point.support : ctx.openGates;
    let dropped = 0;
    let kept = 0;
    for (const out of [...point.support].sort((a, b) => a - b)) {
      const rest = new Set(open);
      rest.delete(out);
      const candidates: number[] = [];
      for (let g = 0; g < ctx.model.gates.length; g++) if (!open.has(g)) candidates.push(g);
      const may = new Set(gatesThatMayHelp(ctx, rest, candidates));
      for (const into of candidates) {
        if (may.has(into)) {
          kept++;
          continue;
        }
        dropped++;
        const trial = new Set(rest);
        trial.add(into);
        expect(evaluateSupport(ctx, trial), `${name}: ${out} -> ${into}`).toBeNull();
      }
    }
    expect(kept + dropped).toBeGreaterThan(0);
    // the screen is not a no-op on a plan with real decisions
    if (name === "alumina-line-shared-reactor" || name === "gtnh-flow-palladium_line") expect(dropped).toBeGreaterThan(0);
  }, 120_000);
});
