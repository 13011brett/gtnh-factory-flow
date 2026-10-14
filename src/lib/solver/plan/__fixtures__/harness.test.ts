/** Tests of the corpus harness itself (loader, tiling, id order, digest, comparer). They need no solver. */
import { describe, expect, it } from "vitest";

import { differences, numbersEqual } from "./compare";
import { digest } from "./digest";
import { CHART_NAMES, PLAN_NAMES, TILED_CASES, caseNames, compareId, listFiles, loadGolden, loadInput } from "./load";
import type { Answer, ChoiceKey, External, Leftover, Note, PortRef, SolutionView } from "./types-local";

describe("corpus files", () => {
  it("has 31 inputs and 33 goldens, and every case has both (tiled cases build from platline)", () => {
    expect(PLAN_NAMES).toHaveLength(15);
    expect(CHART_NAMES).toHaveLength(16);
    expect(listFiles("inputs")).toHaveLength(31);
    expect(listFiles("goldens")).toHaveLength(33);
    expect(caseNames()).toHaveLength(33);
    const inputs = new Set(listFiles("inputs"));
    const goldens = new Set(listFiles("goldens"));
    for (const n of caseNames()) {
      expect(goldens.has(n), `golden ${n}`).toBe(true);
      expect(inputs.has(n) || n in TILED_CASES, `input ${n}`).toBe(true);
    }
  });

  // (machines, edges, pools, drawers) from spec 6.1
  const shapes: Record<string, [number, number, number, number]> = {
    "single-card-v2": [1, 0, 0, 0],
    benzene: [1, 0, 0, 3],
    "oxygen-silicon-loop": [3, 3, 0, 2],
    "titanium-line-tour": [6, 8, 0, 5],
    "pa-cell-loop": [6, 11, 0, 3],
    "hv-diesel": [6, 8, 1, 7],
    "sulfuric-acid": [8, 10, 0, 12],
    "titanium-line-chembath": [10, 15, 0, 13],
    glass: [11, 10, 0, 1],
    "alumina-line-shared-reactor": [11, 12, 2, 28],
    "mega-iv-nitrobenzene-power-plant": [25, 24, 0, 18],
    mv: [33, 50, 0, 25],
    "full-platline": [46, 53, 0, 62],
    platline: [49, 60, 0, 58],
    "buffer-drawers": [9, 1, 0, 3],
  };
  it.each(Object.entries(shapes))("%s has the documented shape", (name, [m, e, p, d]) => {
    const input = loadInput(name);
    expect([input.machines.length, input.edges.length, input.pools.length, input.drawers.length]).toEqual([m, e, p, d]);
  });

  it("applies Math.fround to every chance", () => {
    for (const name of caseNames()) {
      const input = loadInput(name);
      for (const m of input.machines)
        for (const p of [...m.inputs, ...m.outputs]) expect(p.chance).toBe(Math.fround(p.chance));
    }
    // the spec's own example: Gson wrote 0.105555564 for a float
    expect(Math.fround(0.105555564)).not.toBe(0.105555564);
  });

  it("chart dumps carry the target rates, pins and no drawers the plan dumps lack", () => {
    const withRates = CHART_NAMES.filter((c) =>
      loadInput(`gtnh-flow-${c}`).machines.some(
        (m) => Object.keys(m.targetOutputRates).length + Object.keys(m.targetInputRates).length > 0,
      ),
    );
    expect(withRates.length).toBeGreaterThan(0);
    for (const c of CHART_NAMES) expect(loadInput(`gtnh-flow-${c}`).drawers).toHaveLength(0);
  });

  it("every edge and pool member refers to a machine of the plan", () => {
    for (const name of caseNames()) {
      const input = loadInput(name);
      const ids = new Set(input.machines.map((m) => m.id));
      expect(ids.size, name).toBe(input.machines.length);
      for (const e of input.edges) {
        expect(ids.has(e.source), `${name} edge source`).toBe(true);
        expect(ids.has(e.target), `${name} edge target`).toBe(true);
      }
      for (const p of input.pools) for (const m of p.machines) expect(ids.has(m), `${name} pool`).toBe(true);
    }
  });
});

describe("id order", () => {
  it("compares UUIDs as Java does: signed longs, so 8..f sort before 0..7", () => {
    const hi = "8f2eeaeb-bbe0-3a78-9d21-651486b92dd5";
    const lo = "0fa87c81-5a2b-3c6b-9879-360e0ff81c98";
    expect(compareId(hi, lo)).toBeLessThan(0);
    expect(hi < lo).toBe(false); // a string sort would get it the other way round
    expect(compareId(lo, lo)).toBe(0);
  });

  it("the dumps list machines in Java UUID order", () => {
    for (const name of caseNames().filter((n) => !(n in TILED_CASES))) {
      const ids = loadInput(name).machines.map((m) => m.id);
      const sorted = [...ids].sort(compareId);
      expect(ids, name).toEqual(sorted);
    }
  });
});

describe("tiling", () => {
  it("platline-x4 is four copies, copy 0 keeping its ids, all ids distinct", () => {
    const base = loadInput("platline");
    const x4 = loadInput("platline-x4");
    expect(x4.machines).toHaveLength(base.machines.length * 4);
    expect(x4.edges).toHaveLength(base.edges.length * 4);
    expect(x4.drawers).toHaveLength(base.drawers.length * 4);
    expect(x4.machines.slice(0, base.machines.length).map((m) => m.id)).toEqual(base.machines.map((m) => m.id));
    expect(new Set(x4.machines.map((m) => m.id)).size).toBe(x4.machines.length);
    const ids = new Set(x4.machines.map((m) => m.id));
    for (const e of x4.edges) {
      expect(ids.has(e.source)).toBe(true);
      expect(ids.has(e.target)).toBe(true);
    }
  });

  it("golden platline-x4 has four times the machine entries of platline", () => {
    const one = Object.keys(loadGolden("platline").solution.extentsPerSecond as object).length;
    const four = Object.keys(loadGolden("platline-x4").solution.extentsPerSecond as object).length;
    expect(four).toBe(one * 4);
  });

  it("renamed ids of the tiled copies are exactly the goldens' ids (verifies nameUUIDFromBytes and the rename)", () => {
    const x4 = loadInput("platline-x4");
    const golden = Object.keys(loadGolden("platline-x4").solution.extentsPerSecond as object).sort();
    expect(x4.machines.map((m) => m.id).sort()).toEqual(golden);
    const edgesGolden = Object.keys(loadGolden("platline-x4").solution.edgeFlowsPerSecond as object);
    const edgeIds = new Set(x4.edges.map((e) => e.id));
    for (const k of edgesGolden) expect(edgeIds.has(k), k).toBe(true);
  });
});

describe("comparer", () => {
  it("uses the relative 1e-6 rule on numbers", () => {
    expect(numbersEqual(530.0000000000003, 530)).toBe(true);
    expect(numbersEqual(1e9, 1e9 + 999)).toBe(true); // 1e-6 relative of 1e9 is 1000
    expect(numbersEqual(1e9, 1e9 + 1100)).toBe(false);
    expect(numbersEqual(0, 9e-7)).toBe(true); // floor of 1 on the scale
    expect(numbersEqual(0, 2e-6)).toBe(false);
  });

  it("requires the same keys, lengths, order and values", () => {
    expect(differences({ a: 1 }, { a: 1, b: 2 })).not.toEqual([]);
    expect(differences({ a: [1, 2] }, { a: [1] })).not.toEqual([]);
    expect(differences({ a: [1, 2] }, { a: [2, 1] })).not.toEqual([]);
    expect(differences({ a: "x", b: true, c: null }, { a: "x", b: true, c: null })).toEqual([]);
    expect(differences({ a: "x" }, { a: "y" })).not.toEqual([]);
    expect(differences({ a: null }, { a: 0 })).not.toEqual([]);
  });

  /** Walks a JSON value and calls `f` on every numeric leaf's holder so a test can perturb it. */
  function perturbFirstNumber(v: unknown, factor: number): boolean {
    if (Array.isArray(v)) {
      for (let i = 0; i < v.length; i++) {
        if (typeof v[i] === "number" && Math.abs(v[i] as number) > 1e-3) {
          v[i] = (v[i] as number) * factor;
          return true;
        }
        if (perturbFirstNumber(v[i], factor)) return true;
      }
    } else if (v !== null && typeof v === "object") {
      const o = v as Record<string, unknown>;
      for (const k of Object.keys(o)) {
        if (typeof o[k] === "number" && Math.abs(o[k] as number) > 1e-3) {
          o[k] = (o[k] as number) * factor;
          return true;
        }
        if (perturbFirstNumber(o[k], factor)) return true;
      }
    }
    return false;
  }

  it.each(caseNames())("%s: golden against itself passes; a visible change fails; a 1e-9 change passes", (name) => {
    const golden = loadGolden(name);
    expect(differences(golden, loadGolden(name))).toEqual([]);

    const visible = loadGolden(name);
    expect(perturbFirstNumber(visible, 1.001)).toBe(true);
    expect(differences(golden, visible)).not.toEqual([]);

    const dust = loadGolden(name);
    perturbFirstNumber(dust, 1 + 1e-9);
    expect(differences(golden, dust)).toEqual([]);

    const dropped = loadGolden(name);
    delete (dropped.solution as Record<string, unknown>).openGates;
    expect(differences(golden, dropped)).not.toEqual([]);
  });
});

// --- digest round trip: golden -> Answer -> digest must give the golden back ---

type PortD = { nodeId: string; portIndex: number; input: boolean };
const pr = (p: PortD): PortRef => ({ node: p.nodeId, port: p.portIndex, input: p.input });
const ext = (e: { port: PortD; ratePerSecond: number }): External => ({ port: pr(e.port), ratePerSecond: e.ratePerSecond });
const ck = (k: { gateAnchors: PortD[] }): ChoiceKey => ({ gateAnchors: k.gateAnchors.map(pr) });
const nt = (n: { message: string; args: unknown[] }): Note => n as unknown as Note;

function answerFromGolden(g: ReturnType<typeof loadGolden>): Answer {
  const s = g.solution as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const a = g.alternatives as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const solution: SolutionView = {
    extentsPerSecond: s.extentsPerSecond,
    machineCounts: s.machineCounts,
    edgeFlowsPerSecond: s.edgeFlowsPerSecond,
    gatedSources: s.gatedSources.map(ext),
    gatedSinks: s.gatedSinks.map(ext),
    terminalInputs: s.terminalInputs.map(ext),
    terminalOutputs: s.terminalOutputs.map(ext),
    unneeded: [...(s.unneeded ?? [])].reverse(), // digest must re-sort; the platline-x10 golden lacks the key
    openGates: s.openGates,
    externalQuantity: s.externalQuantity,
    totalInternalFlow: s.totalInternalFlow,
    notes: s.notes.map(nt),
    key: ck(s.key),
    drawers: {
      ...s.drawers,
      ports: Object.fromEntries(
        Object.entries(s.drawers.ports as Record<string, Array<{ port: PortD; ratePerSecond: number }>>).map(
          ([id, list]) => [id, list.map(ext)],
        ),
      ),
    },
    spares: s.spares.map(
      (l: any): Leftover => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        key: l.key,
        importing: l.importing,
        custom: l.custom,
        bearers: l.bearers.map((b: any) => ({ ...b, anchor: pr(b.anchor), flows: b.flows.map(ext) })), // eslint-disable-line @typescript-eslint/no-explicit-any
      }),
    ),
  };
  return {
    kind: "solved",
    solution,
    alternatives: {
      chosen: a.chosen === null ? null : ck(a.chosen),
      options: a.options.map((o: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
        key: ck(o.key),
        replaces: pr(o.replaces),
        opens: pr(o.opens),
        externals: o.externals.map(ext),
        rank: o.rank,
      })),
      complete: a.complete,
      notes: a.notes.map(nt),
    },
  };
}

describe("digest", () => {
  it.each(caseNames())("%s: digest(answerFromGolden(golden)) matches the golden", (name) => {
    const golden = loadGolden(name);
    const got = digest(answerFromGolden(golden));
    if (!("unneeded" in golden.solution)) delete got.solution.unneeded; // platline-x10 golden predates the field
    const diffs = differences(golden, got);
    expect(diffs, diffs.slice(0, 10).join("\n")).toEqual([]);
  });
});
