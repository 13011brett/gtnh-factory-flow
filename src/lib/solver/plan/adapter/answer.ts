import { compareIds } from "../ids";
import { makeLeftoverKey } from "../port-key";
import type {
  Answer,
  DrawerReadout,
  External,
  Id,
  Leftover,
  Note,
  PlanForced,
  PlanLeftover,
  PlanSolveExtras,
  PlanTerminal,
  PortKey,
} from "../types";
import type { PlanModel } from "./model";

/** The solver's answer in the website's terms. */
export interface PlanReading {
  solved: boolean;
  /** Machine count the answer asks of each solve node (all 0 when it failed). */
  counts: Map<Id, number>;
  /** Flow of each of the project's wires, per second. */
  edgeFlows: Map<string, number>;
  extras: PlanSolveExtras;
}

const EMPTY_DRAWERS: DrawerReadout = { rates: {}, unmet: [], shortfalls: [] };

/** Rates below this share of the port's own rate are solver dust. */
const DUST = 1e-9;

export function readAnswer(model: PlanModel, answer: Answer): PlanReading {
  const edgeFlows = new Map<string, number>();
  const counts = new Map<Id, number>();

  if (answer.kind === "failed") {
    for (const edge of model.edges) {
      for (const id of model.covers.get(edge.id) ?? [edge.id]) {
        edgeFlows.set(id, 0);
      }
    }
    return {
      solved: false,
      counts,
      edgeFlows,
      extras: {
        forced: [],
        leftovers: [],
        unneeded: [],
        unanchored: model.unanchored,
        terminals: [],
        notes: answer.notes,
        openGates: 0,
        failure: answer.failure,
        unmetDrawers: answer.drawers.unmet,
      },
    };
  }

  const { solution, alternatives } = answer;
  for (const entry of model.machines.values()) {
    counts.set(entry.id, Math.max(0, solution.machineCounts[entry.id] ?? 0));
  }

  // Wires between machines: the engine's own flows.
  const wired = new Map<string, number>();
  const flowOf = new Map<string, number>();
  for (const [id, { edge, source, target }] of model.engineEdges) {
    const flow = Math.max(0, solution.edgeFlowsPerSecond[id] ?? 0);
    flowOf.set(id, flow);
    wired.set(`${edge.source}|o|${source.index}`, (wired.get(`${edge.source}|o|${source.index}`) ?? 0) + flow);
    wired.set(`${edge.target}|i|${target.index}`, (wired.get(`${edge.target}|i|${target.index}`) ?? 0) + flow);
  }

  // Wires to drawers: what the port makes (or takes) that its other wires do
  // not carry. A port has one drawer; should it have more, the first (by id)
  // takes it all.
  const taken = new Map<string, number>();
  for (const link of [...model.drawerEdges.values()].sort((a, b) => compareIds(a.edgeId, b.edgeId))) {
    const entry = model.machines.get(link.ref.node)!;
    const row = (link.ref.input ? entry.inputs : entry.outputs)[link.ref.port]!;
    const extent = solution.extentsPerSecond[entry.id] ?? 0;
    const rate = extent * row.amount * entry.throughputFactor;
    const portId = `${entry.id}|${link.ref.input ? "i" : "o"}|${link.ref.port}`;
    const rest = rate - (wired.get(portId) ?? 0) - (taken.get(portId) ?? 0);
    const flow = rest > DUST * Math.max(1, rate) ? rest : 0;
    taken.set(portId, (taken.get(portId) ?? 0) + flow);
    flowOf.set(link.edgeId, flow);
  }

  // Each of the player's wires carries what the (joined) wires it stands for carry.
  for (const [flatId, flow] of flowOf) {
    for (const original of model.covers.get(flatId) ?? [flatId]) {
      edgeFlows.set(original, (edgeFlows.get(original) ?? 0) + flow);
    }
  }

  const external = (list: External[], side: "in" | "out") =>
    list
      .filter((e) => !model.hidden.has(e.port.node))
      .flatMap((e): Array<{ node: Id; portKey: PortKey; resourceKey: string; perSecond: number; side: "in" | "out" }> => {
        const row = model.row(e.port);
        return row
          ? [{ node: e.port.node, portKey: row.portKey, resourceKey: row.key, perSecond: e.ratePerSecond, side }]
          : [];
      });

  // A drawer on a port claims what crosses there, so the port shows the drawer's row.
  const forced: PlanForced[] = [
    ...external(solution.gatedSources, "in"),
    ...external(solution.gatedSinks, "out"),
  ]
    .filter((e) => !model.drawerPorts.has(e.portKey))
    .map((e) => ({
      nodeId: e.node,
      portKey: e.portKey,
      side: e.side,
      resourceKey: e.resourceKey,
      perSecond: e.perSecond,
    }));

  // An unwired port with a drawer on it is that drawer's, not a free terminal.
  const terminals: PlanTerminal[] = [
    ...external(solution.terminalInputs, "in"),
    ...external(solution.terminalOutputs, "out"),
  ]
    .filter((e) => !model.drawerPorts.has(e.portKey))
    .map((e) => ({ nodeId: e.node, portKey: e.portKey, side: e.side, perSecond: e.perSecond }));

  const leftovers = solution.spares.flatMap((spare) => readLeftover(model, spare));

  const unneeded = solution.unneeded.filter((id) => model.machines.has(id) && !model.hidden.has(id));
  const notes: Note[] = [...solution.notes, ...alternatives.notes];

  return {
    solved: true,
    counts,
    edgeFlows,
    extras: {
      forced,
      leftovers,
      unneeded,
      unanchored: model.unanchored,
      terminals,
      notes,
      openGates: solution.openGates,
      unmetDrawers: (solution.drawers ?? EMPTY_DRAWERS).unmet,
    },
  };
}

function readLeftover(model: PlanModel, spare: Leftover): PlanLeftover[] {
  const bearers = [];
  for (const bearer of spare.bearers) {
    const row = model.row(bearer.anchor);
    if (!row) {
      return [];
    }
    bearers.push({
      portKey: row.portKey,
      maxPerSecond: bearer.max,
      share: bearer.share,
      solverPick: bearer.solverPick,
      flows: bearer.flows.flatMap((flow) => {
        const flowRow = model.row(flow.port);
        return flowRow ? [{ portKey: flowRow.portKey, perSecond: flow.ratePerSecond }] : [];
      }),
    });
  }
  if (bearers.length === 0) {
    return [];
  }
  return [
    {
      key: makeLeftoverKey(bearers.map((b) => b.portKey)),
      importing: spare.importing,
      custom: spare.custom,
      bearers,
    },
  ];
}
