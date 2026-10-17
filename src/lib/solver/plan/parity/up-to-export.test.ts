/**
 * The Up to parity export (docs/up-to.md): every hand-built Up to plan of `upto.test.ts` and every corpus plan with
 * each exact count turned Up to, written with this engine's answer for the mod's `UpToParityTest`, which solves each
 * input with the Java engine and compares the two answers by the golden rules (`compare.ts`, the mod's
 * `SolverCorpus.differences`). Skipped unless `UPTO_EXPORT_DIR` names where to write (the mod's
 * `src/test/resources/solver-corpus-upto/`):
 *
 *     UPTO_EXPORT_DIR=C:/path/to/gtnh-planner-mod/src/test/resources/solver-corpus-upto npx vitest run up-to-export
 *
 * Inputs are in the mod's dump format (`SolveInputJson`, what `__fixtures__/load.ts` reads); a hand-built plan's ids
 * become UUIDs first (`upto:<id>` hashed as Java's `UUID.nameUUIDFromBytes`), so both engines solve the very same input.
 * Answers are the golden digest (`__fixtures__/digest.ts`), with `upTo` and `drawers.banked`.
 */
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { initLpEngine } from "../../lp-engine";
import { digest } from "../__fixtures__/digest";
import { caseNames, loadInput, nameUuidFromBytes } from "../__fixtures__/load";
import {
  budgetPlan,
  chain,
  CORPUS_UP_TO,
  everyCountUpTo,
  FIXTURES,
  pinDiagnosis,
  withAlternatives,
} from "../__fixtures__/up-to/plans";
import { solvePlan } from "../solve-plan";
import type { Answer, Id, MachineIn, PortRef, SolveInput } from "../types";

const OUT = process.env.UPTO_EXPORT_DIR;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A hand-built plan's id as a UUID; a UUID stays itself. */
function uuidOf(id: Id): Id {
  return UUID.test(id) ? id : nameUuidFromBytes(Buffer.from(`upto:${id}`, "utf8"));
}

/** The plan with every id a UUID (machines, wires, pools, drawers and their links, the stored choice). */
export function withUuids(i: SolveInput): SolveInput {
  const ref = (r: PortRef): PortRef => ({ ...r, node: uuidOf(r.node) });
  return {
    ...i,
    choice: i.choice ? i.choice.map(ref) : null,
    machines: i.machines.map((m) => ({ ...m, id: uuidOf(m.id) })),
    edges: i.edges.map((e) => ({
      ...e,
      id: uuidOf(e.id),
      source: uuidOf(e.source),
      target: uuidOf(e.target),
    })),
    pools: i.pools.map((p) => ({ ...p, machines: p.machines.map(uuidOf) })),
    drawers: i.drawers.map((d) => ({
      ...d,
      id: uuidOf(d.id),
      links: d.links.map((l) => ({ ...l, node: uuidOf(l.node) })),
      ...(d.takers ? { takers: d.takers.map((l) => ({ ...l, node: uuidOf(l.node) })) } : {}),
    })),
    extentPins: Object.fromEntries(Object.entries(i.extentPins).map(([k, v]) => [uuidOf(k), v])),
  };
}

const rates = (r: Record<number, number>) =>
  Object.fromEntries(Object.entries(r ?? {}).map(([k, v]) => [String(k), v]));

/** The mod's dump format (`SolveInputJson.write`). */
export function toDump(i: SolveInput): Record<string, unknown> {
  const machine = (m: MachineIn) => ({
    id: m.id,
    name: m.name,
    durationTicks: m.durationTicks,
    energyPerTick: m.energyPerTick,
    throughputFactor: m.throughputFactor,
    inputs: m.inputs.map((p) => ({ ...p })),
    outputs: m.outputs.map((p) => ({ ...p })),
    countFixed: m.countFixed,
    machineCount: m.machineCount,
    targetOutputRates: rates(m.targetOutputRates),
    targetInputRates: rates(m.targetInputRates),
  });
  return {
    mode: i.mode,
    ...(i.choice
      ? { choice: i.choice.map((r) => ({ node: r.node, port: r.port, input: r.input })) }
      : {}),
    machines: i.machines.map(machine),
    edges: i.edges.map((e) => ({ ...e })),
    pools: i.pools.map((p) => ({
      machines: [...p.machines],
      capacity: p.capacity,
      exact: p.exact,
      ...(p.upTo ? { upTo: true } : {}),
    })),
    drawers: i.drawers.map((d) => ({
      id: d.id,
      label: d.label,
      kind: d.kind,
      rule: d.rule,
      rate: d.rate,
      links: d.links.map((l) => ({ node: l.node, port: l.port })),
      ...(d.takers && d.takers.length > 0
        ? { takers: d.takers.map((l) => ({ node: l.node, port: l.port })) }
        : {}),
    })),
    extentPins: { ...i.extentPins },
    spares: JSON.parse(JSON.stringify(i.spares ?? {})) as unknown,
  };
}

/** A solved answer's digest; a failed one as its failure, which the mod's test reads the same way. */
function answerDigest(answer: Answer): unknown {
  if (answer.kind === "failed") return { failed: answer.failure.message };
  return digest(answer);
}

const lone = (id: string): MachineIn => ({
  id,
  name: id,
  durationTicks: 20,
  energyPerTick: 0,
  throughputFactor: 1,
  inputs: [{ amount: 1, chance: 1, multiplier: 1, resource: 1, name: "ore", free: false }],
  outputs: [{ amount: 1, chance: 1, multiplier: 1, resource: 2, name: "gear", free: false }],
  countFixed: false,
  machineCount: 1,
  targetOutputRates: {},
  targetInputRates: {},
});

const idleNoise = (): SolveInput =>
  JSON.parse(
    readFileSync(path.join(__dirname, "..", "__fixtures__", "up-to", "idle-noise.json"), "utf8"),
  ) as SolveInput;

/** Every case: its name and its input, ids already UUIDs. */
function cases(): Array<[string, () => SolveInput]> {
  const out: Array<[string, () => SolveInput]> = [];
  for (const [name, make] of Object.entries(FIXTURES)) out.push([name, () => withUuids(make())]);
  out.push(["alternatives, chosen", chosen]);
  out.push(["no Up to", () => withUuids(exactly(chain(2, 1)))]);
  out.push(["pin diagnosis", () => withUuids(pinDiagnosis())]);
  out.push(["read-out budget", () => withUuids(budgetPlan())]);
  out.push(["idle noise", () => withUuids(idleNoise())]);
  out.push([
    "idle noise beside a lone card",
    () => {
      const plan = idleNoise();
      return withUuids({
        ...plan,
        machines: [...plan.machines, lone("zz-lone")],
        pools: [...plan.pools, { machines: ["zz-lone"], capacity: 2, exact: false, upTo: true }],
      });
    },
  ]);
  const corpus = new Set<string>(CORPUS_UP_TO);
  for (const name of caseNames()) {
    if (name === "platline-x10" && !corpus.has(name) && !process.env.CORPUS_BENCH) continue;
    out.push([`${name}, every count Up to`, () => everyCountUpTo(loadInput(name))]);
  }
  return out;
}

/** The pools of a plan made Exactly: no Up to pool left. */
function exactly(i: SolveInput): SolveInput {
  return { ...i, pools: i.pools.map((p) => ({ ...p, exact: true, upTo: false })) };
}

/** The alternatives plan with its first other place stored as the choice. */
function chosen(): SolveInput {
  const base = withUuids(withAlternatives());
  const first = solvePlan(base);
  if (first.kind !== "solved") throw new Error("the alternatives plan failed");
  const other = first.alternatives.options.find((o) => o.rank !== "DEFAULT");
  if (!other) throw new Error("the alternatives plan offers no other place");
  return { ...base, choice: other.key.gateAnchors };
}

/** A file name for a case. */
function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

if (!OUT) {
  describe.skip("Up to parity export (set UPTO_EXPORT_DIR to write it)", () => {
    it("writes every Up to plan and its answer", () => {});
  });
} else {
  describe("Up to parity export", () => {
    beforeAll(async () => {
      await initLpEngine();
      mkdirSync(OUT, { recursive: true });
      for (const f of readdirSync(OUT)) if (f.endsWith(".json")) rmSync(path.join(OUT, f));
    });

    it.each(cases())(
      "%s",
      (name, make) => {
        const input = make();
        const answer = solvePlan(input);
        const file = path.join(OUT, `${slug(name)}.json`);
        writeFileSync(
          file,
          `${JSON.stringify({ name, input: toDump(input), answer: answerDigest(answer) }, null, 1)}\n`,
        );
        expect(answer.kind).toBe("solved");
      },
      120_000,
    );
  });
}
