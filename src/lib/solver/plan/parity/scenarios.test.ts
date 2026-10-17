import { readFileSync } from "node:fs";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { initLpEngine } from "../../lp-engine";
import { calculateThroughput } from "../../throughput";
import { getSolveCore, setSolveCore } from "../adapter/engine";
import type { Answer, MachineIn, SolveInput } from "../types";
import { buildScenario, readBoard, uuid, type Placement, type Scenario } from "./scenario-kit";

/**
 * S1: the website's answers are the mod's, on real board states. Each scenario in `scenarios.json` is built on both
 * sides; the mod's SolveInput, answer and board readouts (`fixtures/mod-answers.json`, written by the mod's own
 * Balancer, Unanchored and board code through a throwaway JUnit) are compared with the website's adapter input, its
 * solver's answer and what its board shows (card counts, set-count prompts, port rows, forced rows, drawers, rail).
 */

interface ModPort {
  name: string;
  perSecond: number;
  extra: number;
  shown: number;
  wired: boolean;
}
interface ModCard {
  count: number;
  pinned: boolean;
  unset: boolean;
  countless: boolean;
  inputs: ModPort[];
  outputs: ModPort[];
}
interface ModExternal {
  node: string;
  port: number;
  input: boolean;
  rate: number;
}
interface ModScenario {
  input: {
    machines: Array<{
      id: string;
      durationTicks: number;
      throughputFactor: number;
      countFixed: boolean;
      machineCount: number;
      inputs: Array<{ amount: number; chance: number; multiplier: number; name: string }>;
      outputs: Array<{ amount: number; chance: number; multiplier: number; name: string }>;
      targetOutputRates: Record<string, number>;
      targetInputRates: Record<string, number>;
    }>;
    edges: Array<{
      id: string;
      source: string;
      sourceOutput: number;
      target: string;
      targetInput: number;
    }>;
    pools: Array<{ machines: string[]; capacity: number; exact: boolean }>;
    drawers: Array<{
      id: string;
      kind: string;
      rule: string;
      rate: number;
      links: Array<{ node: string; port: number }>;
    }>;
  };
  answer: {
    kind: "solved" | "failed";
    failure?: string;
    notes: string[];
    machineCounts?: Record<string, number>;
    edgeFlows?: Record<string, number>;
    gatedSources?: ModExternal[];
    gatedSinks?: ModExternal[];
    terminalInputs?: ModExternal[];
    terminalOutputs?: ModExternal[];
    unneeded?: string[];
    drawerRates?: Record<string, number>;
    unmet?: string[];
    spares?: Array<{
      key: string;
      importing: boolean;
      bearers: Array<{ anchor: string; max: number; share: number; solverPick: boolean }>;
    }>;
  };
  board: {
    nothingToSolveFor: boolean;
    cards: Record<string, ModCard>;
    drawers: Record<string, { rate: number; unset: boolean }>;
    totals: {
      inputs: Record<string, number>;
      outputs: Record<string, number>;
      internal: Record<string, number>;
      machines: Record<string, number>;
    };
    notices: string[];
  };
}

const spec = JSON.parse(readFileSync(new URL("./scenarios.json", import.meta.url), "utf8")) as {
  scenarios: Scenario[];
};
const mod = JSON.parse(
  readFileSync(new URL("./fixtures/mod-answers.json", import.meta.url), "utf8"),
) as Record<string, ModScenario>;

const TOL = 1e-6;
const close = (a: number, b: number) =>
  Math.abs(a - b) <= TOL * Math.max(1, Math.abs(a), Math.abs(b));
/** The mod's card rates go through a float (`Balancer.buildResultFractional`). */
const closeF = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-5 * Math.max(1, Math.abs(a), Math.abs(b));

beforeAll(async () => {
  await initLpEngine();
});
afterEach(() => setSolveCore(undefined));

interface Run {
  input: SolveInput;
  answer: Answer;
  diffs: string[];
}

/** Every difference between the website and the mod on one scenario, as readable lines. */
function compare(s: Scenario): Run {
  const m = mod[s.name];
  if (!m) throw new Error(`no mod answer for ${s.name}: rerun S1ParityTest`);
  const { project, placement } = buildScenario(s);
  setSolveCore(undefined);
  const real = getSolveCore();
  let input!: SolveInput;
  let answer!: Answer;
  setSolveCore((i) => {
    input = i;
    answer = real(i);
    return answer;
  });
  const result = calculateThroughput(project, { generatedAt: "t" });
  setSolveCore(undefined);
  const diffs: string[] = [];
  const toMod = new Map<string, number>();
  for (const [mid, at] of placement) toMod.set(at.resultId, mid);
  const modId = (webId: string) => uuid(toMod.get(webId) ?? -1);
  const webOf = (modUuid: string): Placement | undefined =>
    placement.get(parseInt(modUuid.slice(-12), 16));

  // ---- 1. the adapter's SolveInput against the mod's SolveInput.of ----
  const perSecond = (
    mm: { durationTicks: number; throughputFactor: number },
    p: { amount: number; chance: number; multiplier: number },
  ) =>
    (Math.max(0, p.amount) * Math.fround(p.chance) * p.multiplier * mm.throughputFactor * 20) /
    (mm.durationTicks > 0 ? mm.durationTicks : 1);
  const webMachines = new Map<string, MachineIn>(input.machines.map((mm) => [modId(mm.id), mm]));
  for (const mm of m.input.machines) {
    const w = webMachines.get(mm.id);
    if (!w) {
      diffs.push(`input: machine ${mm.id} missing on the website`);
      continue;
    }
    const names = (ports: Array<{ name: string }>) => ports.map((p) => p.name).join(",");
    if (names(w.inputs) !== names(mm.inputs) || names(w.outputs) !== names(mm.outputs)) {
      diffs.push(
        `input: ${mm.id} ports ${names(w.inputs)}>${names(w.outputs)} vs mod ${names(mm.inputs)}>${names(mm.outputs)}`,
      );
      continue;
    }
    mm.inputs.forEach((p, i) => {
      if (!close(perSecond(w, w.inputs[i]!), perSecond(mm, p)))
        diffs.push(
          `input: ${mm.id} in ${p.name} ${perSecond(w, w.inputs[i]!)}/s/machine vs mod ${perSecond(mm, p)}`,
        );
    });
    mm.outputs.forEach((p, i) => {
      if (!close(perSecond(w, w.outputs[i]!), perSecond(mm, p)))
        diffs.push(
          `input: ${mm.id} out ${p.name} ${perSecond(w, w.outputs[i]!)}/s/machine vs mod ${perSecond(mm, p)}`,
        );
    });
    if (
      w.countFixed !== mm.countFixed ||
      (mm.countFixed &&
        (w.machineCount * 20) / w.durationTicks !== (mm.machineCount * 20) / mm.durationTicks)
    ) {
      diffs.push(
        `input: ${mm.id} pin ${w.countFixed}/${w.machineCount} vs mod ${mm.countFixed}/${mm.machineCount}`,
      );
    }
    for (const side of ["targetOutputRates", "targetInputRates"] as const) {
      const a = JSON.stringify(
        Object.entries(w[side])
          .filter(([, r]) => r > 0)
          .sort(),
      );
      const b = JSON.stringify(
        Object.entries(mm[side])
          .filter(([, r]) => r > 0)
          .sort(),
      );
      if (a !== b) diffs.push(`input: ${mm.id} ${side} ${a} vs mod ${b}`);
    }
  }
  if (input.machines.length !== m.input.machines.length)
    diffs.push(`input: ${input.machines.length} machines vs mod ${m.input.machines.length}`);
  const edgeSig = (
    e: { id: string; source: string; sourceOutput: number; target: string; targetInput: number },
    map: (id: string) => string,
  ) => `${e.id}:${map(e.source)}.${e.sourceOutput}>${map(e.target)}.${e.targetInput}`;
  const webEdges = input.edges.map((e) => edgeSig(e, modId)).sort();
  const modEdges = m.input.edges.map((e) => edgeSig(e, (x) => x)).sort();
  if (JSON.stringify(webEdges) !== JSON.stringify(modEdges))
    diffs.push(`input: edges ${webEdges} vs mod ${modEdges}`);
  const poolSig = (
    p: { machines: string[]; capacity: number; exact: boolean },
    map: (id: string) => string,
  ) => `${p.machines.map(map).sort()}=${p.capacity}${p.exact ? "!" : ""}`;
  const webPools = input.pools.map((p) => poolSig(p, modId)).sort();
  const modPools = m.input.pools.map((p) => poolSig(p, (x) => x)).sort();
  if (JSON.stringify(webPools) !== JSON.stringify(modPools))
    diffs.push(`input: pools ${webPools} vs mod ${modPools}`);
  const drawerSig = (
    d: {
      id: string;
      kind: string;
      rule: string;
      rate: number;
      links: Array<{ node: string; port: number }>;
    },
    map: (id: string) => string,
  ) =>
    `${d.id}:${d.kind}/${d.rule}/${d.rule === "ANY" ? 0 : d.rate}/${d.links.map((l) => `${map(l.node)}.${l.port}`).sort()}`;
  const webDrawers = input.drawers.map((d) => drawerSig(d, modId)).sort();
  const modDrawers = m.input.drawers.map((d) => drawerSig(d, (x) => x)).sort();
  if (JSON.stringify(webDrawers) !== JSON.stringify(modDrawers))
    diffs.push(`input: drawers ${webDrawers} vs mod ${modDrawers}`);

  // ---- 2. the answer ----
  const ma = m.answer;
  if (answer.kind !== ma.kind) {
    diffs.push(`answer: ${answer.kind} vs mod ${ma.kind} ${ma.failure ?? ""}`);
  } else if (answer.kind === "failed") {
    if (answer.failure.message !== ma.failure)
      diffs.push(`answer: failure ${answer.failure.message} vs mod ${ma.failure}`);
  } else {
    const v = answer.solution;
    for (const [id, count] of Object.entries(v.machineCounts)) {
      const want = ma.machineCounts![modId(id)] ?? 0;
      if (!close(count, want)) diffs.push(`answer: count ${modId(id)} ${count} vs mod ${want}`);
    }
    for (const [id, flow] of Object.entries(v.edgeFlowsPerSecond)) {
      const want = ma.edgeFlows![id];
      if (want === undefined || !close(flow, want))
        diffs.push(`answer: edge ${id} ${flow} vs mod ${want}`);
    }
    const ext = (
      list: Array<{ port: { node: string; port: number; input: boolean }; ratePerSecond: number }>,
    ) =>
      list
        .map(
          (e) =>
            `${modId(e.port.node)}:${e.port.input ? "i" : "o"}${e.port.port}=${+e.ratePerSecond.toFixed(6)}`,
        )
        .sort();
    const modExt = (list: ModExternal[] = []) =>
      list.map((e) => `${e.node}:${e.input ? "i" : "o"}${e.port}=${+e.rate.toFixed(6)}`).sort();
    for (const [name, web, want] of [
      ["gatedSources", ext(v.gatedSources), modExt(ma.gatedSources)],
      ["gatedSinks", ext(v.gatedSinks), modExt(ma.gatedSinks)],
      ["terminalInputs", ext(v.terminalInputs), modExt(ma.terminalInputs)],
      ["terminalOutputs", ext(v.terminalOutputs), modExt(ma.terminalOutputs)],
    ] as const) {
      if (JSON.stringify(web) !== JSON.stringify(want))
        diffs.push(`answer: ${name} ${web} vs mod ${want}`);
    }
    const unneeded = v.unneeded.map(modId).sort();
    if (JSON.stringify(unneeded) !== JSON.stringify([...(ma.unneeded ?? [])].sort()))
      diffs.push(`answer: unneeded ${unneeded} vs mod ${ma.unneeded}`);
    const notes = v.notes.map((n) => n.message);
    if (JSON.stringify(notes) !== JSON.stringify(ma.notes))
      diffs.push(`answer: notes ${notes} vs mod ${ma.notes}`);
    const spares = v.spares.map(
      (l) =>
        `${l.importing ? "in" : "out"}:${l.bearers.map((b) => `${modId(b.anchor.node)}:${b.anchor.input ? "i" : "o"}:${b.anchor.port}@${+b.share.toFixed(6)}`)}`,
    );
    const modSpares = (ma.spares ?? []).map(
      (l) =>
        `${l.importing ? "in" : "out"}:${l.bearers.map((b) => `${b.anchor}@${+b.share.toFixed(6)}`)}`,
    );
    if (JSON.stringify(spares) !== JSON.stringify(modSpares))
      diffs.push(`answer: spares ${spares} vs mod ${modSpares}`);
  }

  // ---- 3. what the board shows ----
  const board = readBoard(s, project, placement, result);
  for (const [mid, card] of board.cards) {
    const want = m.board.cards[uuid(mid)];
    if (!want) continue;
    const who = `${s.machines.find((x) => x.id === mid)!.name}#${mid}`;
    if (!want.countless && !close(card.count, want.count))
      diffs.push(`board: ${who} count ${card.count} vs mod ${want.count}`);
    if (!want.countless && card.unset !== want.unset)
      diffs.push(`board: ${who} set-count prompt ${card.unset} vs mod ${want.unset}`);
    for (const side of ["inputs", "outputs"] as const) {
      const web = card[side];
      const mods = want[side];
      mods.forEach((p) => {
        const w = web.find((x) => x.name === p.name);
        if (!w) {
          diffs.push(`board: ${who} ${side} ${p.name} missing`);
          return;
        }
        if (!closeF(w.shown, p.shown))
          diffs.push(`board: ${who} ${side} ${p.name} reads ${w.shown} vs mod ${p.shown}`);
        if (!closeF(w.extra, p.extra))
          diffs.push(`board: ${who} ${side} ${p.name} forced ${w.extra} vs mod ${p.extra}`);
      });
    }
  }
  for (const [did, reading] of board.drawers) {
    const want = m.board.drawers[uuid(did)];
    if (!want) continue;
    if (!closeF(reading.rate, want.rate))
      diffs.push(`board: drawer ${did} rate ${reading.rate} vs mod ${want.rate}`);
    if (reading.unset !== want.unset)
      diffs.push(`board: drawer ${did} set-rate prompt ${reading.unset} vs mod ${want.unset}`);
  }
  for (const side of ["inputs", "outputs", "internal"] as const) {
    // The website's rail also lists lines and machines at zero (the mod follows): only what flows is compared.
    const web = Object.entries(board.totals[side])
      .filter(([, v]) => Math.abs(v) > 1e-9)
      .map(([k, v]) => `${k}=${+v.toFixed(5)}`)
      .sort();
    const want = Object.entries(m.board.totals[side])
      .filter(([, v]) => Math.abs(v) > 1e-9)
      .map(([k, v]) => `${k}=${+v.toFixed(5)}`)
      .sort();
    if (JSON.stringify(web) !== JSON.stringify(want))
      diffs.push(`board: rail ${side} ${web} vs mod ${want}`);
  }
  // Machine lines, by card (a shared machine's sections are one line on the website: summed on the mod's side).
  const modLines = new Map<string, number>();
  for (const [id, count] of Object.entries(m.board.totals.machines)) {
    const card = webOf(id)?.card ?? id;
    modLines.set(card, (modLines.get(card) ?? 0) + count);
  }
  const lineSig = (entries: Iterable<[string, number]>) =>
    [...entries]
      .filter(([, count]) => count > 1e-9)
      .map(([id, count]) => `${id.slice(-3)}=${+count.toFixed(5)}`)
      .sort();
  const webLines = lineSig(Object.entries(board.totals.machines));
  const wantLines = lineSig(modLines);
  if (JSON.stringify(webLines) !== JSON.stringify(wantLines))
    diffs.push(`board: rail machines ${webLines} vs mod ${wantLines}`);
  const notices = [...board.notices].sort();
  const wantNotices = [...m.board.notices].sort();
  if (JSON.stringify(notices) !== JSON.stringify(wantNotices))
    diffs.push(`board: notices ${notices} vs mod ${wantNotices}`);
  return { input, answer, diffs };
}

describe("S1 parity: the website's board reads what the mod's does", () => {
  for (const s of spec.scenarios) {
    it(s.name, () => {
      const { diffs } = compare(s);
      expect(diffs).toEqual([]);
    });
  }
});
