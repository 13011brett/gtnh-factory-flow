// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { calculateThroughput } from "@/lib/solver";
import type { FactoryProject, ThroughputResult } from "@/lib/model/types";
import { attachStranded } from "../stranded-surplus";
import { buildRailPorts, deriveNodeVerdict } from "../node-verdict";
import cbdPlan from "../__fixtures__/stranded/cbd.json";
import loopPlan from "../__fixtures__/stranded/hydrogen-loop.json";
import {
  buildCountView,
  buildFootView,
  buildPortView,
  cardCountState,
  cardLabelIn,
  cardNameIn,
  withReasonPorts,
  withStallPorts,
  type CleanPortView,
} from "./clean-model";
import { footTip } from "./menus/card-tips";

/**
 * The board pointing at the culprit, on the real plans the stranded-surplus hint was built for (see
 * `stranded-surplus.test.ts` for what they are): the row a spare is stuck on is lit where it is, the Up to card it
 * stops no longer lights its own row, and its bar goes to the culprit.
 */
const CROP = "node-5fb2f75f-a02b-496a-9fa7-f7685a1e8a75";
const HEAVY_LCR = "node-bbba4208-fadf-4819-be90-87206c39142c";

const cbd = () => structuredClone(cbdPlan) as unknown as FactoryProject;
const loop = () => structuredClone(loopPlan) as unknown as FactoryProject;

function solved(plan: FactoryProject): ThroughputResult {
  const result = calculateThroughput(plan);
  attachStranded(plan, result);
  return result;
}

/** A card's rows and bar as `useCleanCardModel` builds them. */
function card(plan: FactoryProject, result: ThroughputResult, cardId: string) {
  const node = plan.nodes.find((entry) => entry.id === cardId)!;
  const recipe = plan.recipes.find((entry) => entry.id === node.recipeId)!;
  const rails = buildRailPorts(plan, result, cardId, recipe, deriveNodeVerdict(plan, result, cardId));
  const state = cardCountState(result.nodes[cardId], node, result.plan, recipe);
  const light = (rows: typeof rails.inputs) =>
    withStallPorts(
      withReasonPorts(
        rows.map((port) => buildPortView(cardId, port, node, undefined)),
        state.upTo,
      ),
      result.plan,
      cardId,
    );
  const inputs = light(rails.inputs);
  const outputs = light(rails.outputs);
  const foot = buildFootView(
    buildCountView(state),
    state.upTo,
    { inputs, outputs },
    (id) => cardNameIn(plan, id),
    undefined,
    (id, resource, nodeId) => cardLabelIn(plan, id, resource, nodeId),
  );
  return { inputs, outputs, foot, upTo: state.upTo, rows: [...inputs, ...outputs] };
}

const lit = (rows: CleanPortView[]) =>
  rows.filter((row) => row.why).map((row) => `${row.name}=${row.why}`);

/** Every lit row on the board, by card. */
function litBoard(plan: FactoryProject, result: ThroughputResult): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const node of plan.nodes) {
    const rows = lit(card(plan, result, node.id).rows);
    if (rows.length > 0) out[node.id] = rows;
  }
  return out;
}

describe("the board points at a stranded spare", () => {
  it("lights the heavy reactor's Heavy Fuel on CBD, not the crop's own Oil Berry, and the crop's bar goes there", () => {
    const plan = cbd();
    const result = solved(plan);
    expect(litBoard(plan, result)).toEqual({ [HEAVY_LCR]: ["Heavy Fuel=clogged"] });

    const crop = card(plan, result, CROP);
    // Without the hint the crop would light its own row, which only backs up behind the reactor's.
    expect(
      lit(
        withReasonPorts(
          crop.outputs.map((row) => ({ ...row, why: undefined })),
          { ...crop.upTo!, stranded: undefined },
        ),
      ),
    ).toEqual(["Oil Berry=unused"]);
    expect(crop.foot!.say).toBe("spare Heavy Fuel has nowhere to go");
    expect(crop.foot!.show).toEqual([HEAVY_LCR]);
    const tip = footTip(CROP, crop.foot!);
    expect(tip.actions).toEqual([{ input: "left", label: "Show where it is stuck" }]);
    // Four cards are Large Chemical Reactors: the tip names the one the notice names.
    expect(tip.rows?.map((r) => `${r.label}: ${r.value}`)).toContain(
      "Stuck on: Heavy Fuel at the Large Chemical Reactor that makes it",
    );
    expect(tip.notes?.map((note) => note.text)).toEqual([
      "Spare Heavy Fuel at the Large Chemical Reactor that makes it has nowhere to go, so this line can't run. A drawer for it there frees it.",
    ]);
  });

  it("lights nothing and goes nowhere once the drawer is in", () => {
    const plan = cbd();
    plan.storages = [
      ...(plan.storages ?? []),
      {
        id: "spare",
        kind: "fluid",
        resourceId: "liquid_heavy_fuel",
        drainMode: "byproduct",
        position: { x: 0, y: 0 },
      },
    ];
    plan.edges = [
      ...plan.edges,
      {
        id: "to-spare",
        source: HEAVY_LCR,
        target: "spare",
        resourceKind: "fluid",
        resourceId: "liquid_heavy_fuel",
      },
    ];
    const result = solved(plan);
    expect(result.plan?.stranded).toBeUndefined();
    expect(litBoard(plan, result)).toEqual({});
    expect(card(plan, result, CROP).foot!.show).toBeUndefined();
  });

  it("lights the Electrolyzer's Hydrogen Cell when a wire is the fix, and the bar goes to both cards", () => {
    const plan = loop();
    plan.edges = plan.edges.filter((edge) => edge.id !== "w11");
    const result = solved(plan);
    expect(litBoard(plan, result)).toEqual({ electro: ["Hydrogen Cell=clogged"] });
    const crop = card(plan, result, "crop");
    expect(crop.foot!.show).toEqual(["electro", "crLight"]);
    // Two cards are Chemical Reactors: the tip says which one takes it.
    expect(footTip("crop", crop.foot!).notes?.map((note) => note.text)).toEqual([
      "Spare Hydrogen Cell at the Electrolyzer has nowhere to go, so this line can't run. Wiring it to the Chemical Reactor that makes Light Fuel, whose Hydrogen Cell input is not wired, frees it.",
    ]);
  });

  it("keeps the working loop's own read-out: the crop CLOGGED by the tower lights its own row, nothing else", () => {
    const plan = loop();
    const result = solved(plan);
    expect(litBoard(plan, result)).toEqual({ crop: ["Oil Berry=clogged"] });
    expect(card(plan, result, "crop").foot!.show).toBeUndefined();
  });
});
