/**
 * The shared state of one island solve (spec-solver 3.2; Java `SolveContext`): the model, the pins, the drawer bounds,
 * the committed point and the notes. Stages mutate it in place; the next stage reads the result.
 */
import { comparePortRef } from "./ids";
import { buildModel, TICKS_PER_SECOND, type ModelData } from "./model";
import type { Trades } from "./trade";
import { NUMERICS, scaleOf, solutionScale, validatePoint } from "./validate";
import type {
  ChoiceKey,
  DrawerRule,
  Id,
  Note,
  PortRef,
  Shortfall,
  SolveInput,
  SolverMessage,
} from "./types";

export type PinKind = "PIN_COUNT" | "PIN_TARGET" | "PIN_EXTENT";

/** Weakest first: the order a conflicting pin is freed in. */
export const PIN_STRENGTH: PinKind[] = ["PIN_COUNT", "PIN_TARGET", "PIN_EXTENT"];

export function note(message: SolverMessage, ...args: Note["args"]): Note {
  return { message, args };
}

/**
 * The guard (docs/up-to.md, `guard.ts`): no forced flow makes up an Up to card's gap. The ports on its wire networks
 * that no drawer is linked to, and the most their externals may trade together.
 */
export interface Guard {
  /** Connected-port indices, ascending. */
  ports: number[];
  /** The most their externals (each times `externalWeight`) come to together; 0 closes every one of them. */
  cap: number;
}

/** One solved point. Arrays are indexed by machine, edge and connected port. */
export interface StageOutcome {
  extents: number[];
  flows: number[];
  externals: number[];
  /** Gate indices carrying a non-negligible external. */
  support: Set<number>;
  /** Craft-weighted external quantity (the trades' unit). */
  externalQuantity: number;
  internalFlow: number;
}

export class SolveContext {
  readonly model: ModelData;
  readonly input: SolveInput;
  /** NaN = free; a zero count is a real pin (it must not run). */
  readonly pinnedExtent: number[];
  readonly pinKind: PinKind[];
  readonly anyPin: boolean;
  readonly anchored: boolean;
  /** Per drawer: NaN for no bound. The drawer relaxation loosens these on a fresh context. */
  readonly drawerLower: number[];
  readonly drawerUpper: number[];
  readonly unmetDrawers: Id[] = [];
  readonly shortfalls: Shortfall[] = [];
  /** Pool rows left out of the models built now (the relaxation's and the read-out's probes only). */
  readonly droppedPools = new Set<number>();
  /** The Up to pools' indices, in pool order (docs/up-to.md). */
  readonly upToPools: number[];
  /** The guard every model this context builds applies; null when none applies (`guard.ts` sets it). */
  guard: Guard | null = null;
  /** The guard has been worked out (once per context, before the first pass). */
  guardReady = false;
  /** Models built now leave the guard out (the pin diagnosis: a drawer shortfall is never a pin conflict). */
  guardOff = false;
  /** The trading (with the push's bands) the committed point was settled under; the Up to read-out probes it. */
  committedTrades: Trades | null = null;
  shortCircuit = false;
  /** Gates the committed answer opens, tiny ones included (set by the flow stage). */
  openGates: Set<number> = new Set();
  point: StageOutcome | null = null;
  /** Why the last model produced nothing usable. */
  rejection: Note = note("SOLVER_UNSATISFIABLE", "infeasible");
  readonly notes: Note[] = [];
  readonly constructionNotes: number;
  /** Notes of the pass currently running (cleared on every pass). */
  stageNotes: Note[] = [];

  constructor(input: SolveInput) {
    this.input = input;
    this.model = buildModel(input);
    const n = this.model.machines.length;
    this.pinnedExtent = new Array<number>(n).fill(Number.NaN);
    this.pinKind = new Array<PinKind>(n).fill("PIN_COUNT");
    let any = false;
    for (let m = 0; m < n; m++) {
      const md = this.model.machines[m]!;
      const extra = Object.prototype.hasOwnProperty.call(input.extentPins, md.spec.id)
        ? input.extentPins[md.spec.id]
        : undefined;
      if (extra !== undefined) {
        this.pinnedExtent[m] = extra;
        this.pinKind[m] = "PIN_EXTENT";
        any = true;
      } else if (md.targetExtent > 0) {
        this.pinnedExtent[m] = md.targetExtent;
        this.pinKind[m] = "PIN_TARGET";
        any = true;
        this.noteOvershotTargets(m, md.targetExtent);
      } else if (md.fixedExtent !== null) {
        this.pinnedExtent[m] = md.fixedExtent;
        this.pinKind[m] = "PIN_COUNT";
        any = true;
      }
    }
    this.anyPin = any;

    const d = this.model.drawers.length;
    this.drawerLower = new Array<number>(d).fill(Number.NaN);
    this.drawerUpper = new Array<number>(d).fill(Number.NaN);
    let anchor = false;
    for (let i = 0; i < d; i++) {
      const row = this.model.drawers[i]!;
      if (row.rule === "ANY") continue;
      const asksForFlow = row.rule !== "AT_MOST" && row.rate > 0;
      const hasTerms =
        row.extentMachines.length > 0 || row.flowEdges.length > 0 || row.externalPorts.length > 0;
      if (!hasTerms) {
        // Nothing reaches it: a rule asking for flow cannot be met and would only break the plan.
        if (asksForFlow) {
          this.unmetDrawers.push(row.id);
          this.notes.push(
            note(
              row.externalPorts.length > 0 ? "DRAWER_WIRED_IGNORED" : "DRAWER_NOT_CONNECTED",
              row.label,
              row.id,
            ),
          );
        }
        continue;
      }
      setBounds(this, i, row.rule, row.rate);
      if (asksForFlow) anchor = true;
    }
    // An exact pool sets its part's size; so does an Up to pool (docs/up-to.md, "Anchoring").
    for (const pool of this.model.pools) anchor ||= (pool.exact || pool.upTo) && pool.capacity > 0;
    this.anchored = any || anchor;
    this.upToPools = [];
    this.model.pools.forEach((pool, p) => {
      if (pool.upTo) this.upToPools.push(p);
    });
    this.constructionNotes = this.notes.length;
  }

  /** Says so when a node's port rates cannot all be hit (parallel outputs share one extent). */
  private noteOvershotTargets(m: number, chosenExtent: number): void {
    const md = this.model.machines[m]!;
    for (const [key, rate] of Object.entries(md.spec.targetOutputRates)) {
      if (!(typeof rate === "number") || !(rate > 0)) continue;
      const i = Number(key);
      if (!Number.isInteger(i) || i < 0 || i >= md.outQty.length || !(md.outQty[i]! > 0)) continue;
      const actual = chosenExtent * md.outQty[i]!;
      if (actual > rate * (1 + NUMERICS.tieRel)) {
        this.notes.push(
          note(
            "OVERSHOOTS_TARGET",
            md.spec.name,
            md.spec.outputs[i]!.name,
            actual,
            rate,
            md.spec.id,
          ),
        );
      }
    }
  }

  hasDrawerBounds(): boolean {
    for (let i = 0; i < this.drawerLower.length; i++) {
      if (!Number.isNaN(this.drawerLower[i]!) || !Number.isNaN(this.drawerUpper[i]!)) return true;
    }
    return false;
  }

  /** A drawer's total at a point: unwired links' machine rates plus its wired links' externals; a buffer's, its edges' flows. */
  drawerTotal(
    drawer: number,
    extents: ArrayLike<number>,
    flows: ArrayLike<number>,
    externals: ArrayLike<number>,
  ): number {
    const row = this.model.drawers[drawer]!;
    let total = 0;
    for (let i = 0; i < row.extentMachines.length; i++)
      total += extents[row.extentMachines[i]!]! * row.extentQty[i]!;
    for (const e of row.flowEdges) total += flows[e]!;
    for (const p of row.externalPorts) total += externals[p]!;
    return total;
  }

  drawerHolds(drawer: number, total: number): boolean {
    const lower = this.drawerLower[drawer]!;
    const upper = this.drawerUpper[drawer]!;
    const tol = NUMERICS.validateTol;
    if (!Number.isNaN(lower) && total < lower - tol * Math.max(1, Math.abs(lower))) return false;
    return Number.isNaN(upper) || total <= upper + tol * Math.max(1, Math.abs(upper));
  }

  /** What a unit traded at `port` weighs: the crafts of its machine it makes up. */
  externalWeight(port: number): number {
    const qty = this.model.connectedPorts[port]!.qtyPerCraft;
    return qty > 0 ? 1 / qty : 1;
  }

  /** A source costs a hair more than a sink; used by the permissive probe only. */
  importTilt(gate: number): number {
    return this.model.gates[gate]!.input ? 1 + 1 / 1024 : 1;
  }

  zeroTolerance(values: ArrayLike<number>): number {
    return NUMERICS.zero * scaleOf(values);
  }

  solutionScaleOf(p: Pick<StageOutcome, "extents" | "flows" | "externals">): number {
    return solutionScale(this.model, p.extents, p.flows, p.externals);
  }

  /** Every gate the point puts flow through, however little. */
  carryingGates(externals: ArrayLike<number>, fallback: Iterable<number> = []): Set<number> {
    const carrying = new Set<number>(fallback);
    const dust = NUMERICS.dust * scaleOf(externals);
    for (let p = 0; p < externals.length; p++)
      if (externals[p]! > dust) carrying.add(this.model.portGate[p]!);
    return carrying;
  }

  /** The gates carrying more than `zero` of the largest gate's flow. */
  gateSupport(externals: ArrayLike<number>): Set<number> {
    const gateFlow = new Array<number>(this.model.gates.length).fill(0);
    for (let p = 0; p < externals.length; p++) gateFlow[this.model.portGate[p]!]! += externals[p]!;
    const tol = this.zeroTolerance(gateFlow);
    const support = new Set<number>();
    for (let g = 0; g < gateFlow.length; g++) if (gateFlow[g]! > tol) support.add(g);
    return support;
  }

  /** The point a fresh solve holds, with its derived metrics. `support` overrides the one read off the externals. */
  outcome(
    extents: number[],
    flows: number[],
    externals: number[],
    support?: Set<number>,
  ): StageOutcome {
    let qty = 0;
    for (let p = 0; p < externals.length; p++) qty += externals[p]! * this.externalWeight(p);
    let flowSum = 0;
    for (const f of flows) flowSum += f;
    return {
      extents,
      flows,
      externals,
      support: support ?? this.gateSupport(externals),
      externalQuantity: qty,
      internalFlow: flowSum,
    };
  }

  refOf(port: number): PortRef {
    const p = this.model.connectedPorts[port]!;
    return { node: this.model.machines[p.machine]!.spec.id, port: p.portIndex, input: p.input };
  }

  /** The smallest port (by `comparePortRef`) among ALL the gate's ports. */
  anchorOf(gate: number): PortRef {
    let best: PortRef | null = null;
    for (const p of this.model.gates[gate]!.ports) {
      const ref = this.refOf(p);
      if (best === null || comparePortRef(ref, best) < 0) best = ref;
    }
    return best!;
  }

  keyOf(support: Iterable<number>): ChoiceKey {
    const anchors = [...support].map((g) => this.anchorOf(g));
    anchors.sort(comparePortRef);
    return { gateAnchors: anchors };
  }

  /**
   * Commits the answer with what the solver left at its dust set to exactly zero, so an idle machine reads 0 and
   * `unneeded` works. The point keeps the SAME support it was given.
   */
  commit(committed: StageOutcome): void {
    const tol = NUMERICS.dust * this.solutionScaleOf(committed);
    const extents = committed.extents.slice();
    const flows = committed.flows.slice();
    const externals = committed.externals.slice();
    let snapped = false;
    for (let m = 0; m < extents.length; m++) {
      const md = this.model.machines[m]!;
      let most = 0;
      for (const q of md.inQty) most = Math.max(most, q);
      for (const q of md.outQty) most = Math.max(most, q);
      if (extents[m] !== 0 && Math.abs(extents[m]!) * Math.max(most, 1) <= tol) {
        extents[m] = 0;
        snapped = true;
      }
    }
    for (const values of [flows, externals]) {
      for (let i = 0; i < values.length; i++) {
        if (values[i] !== 0 && Math.abs(values[i]!) <= tol) {
          values[i] = 0;
          snapped = true;
        }
      }
    }
    this.point = snapped ? this.outcome(extents, flows, externals, committed.support) : committed;
  }

  validate(
    extents: ArrayLike<number>,
    flows: ArrayLike<number>,
    externals: ArrayLike<number>,
  ): string | null {
    return validatePoint(this.model, extents, flows, externals);
  }

  /** Machine count at an extent (for display). */
  countOf(m: number, extent: number): number {
    return (extent * this.model.machines[m]!.durTicks) / TICKS_PER_SECOND;
  }

  /** A pool's machine time at a point: the sum over its machines of extent * durTicks / 20. */
  poolTime(pool: number, extents: ArrayLike<number>): number {
    let time = 0;
    for (const m of this.model.pools[pool]!.machines) time += this.countOf(m, extents[m]!);
    return time;
  }
}

/** Sets a drawer's bounds from its rule (shared by the constructor and the relaxation). */
export function setBounds(ctx: SolveContext, drawer: number, rule: DrawerRule, rate: number): void {
  if (rule === "AT_LEAST") ctx.drawerLower[drawer] = rate;
  else if (rule === "AT_MOST") ctx.drawerUpper[drawer] = rate;
  else if (rule === "EXACTLY") {
    ctx.drawerLower[drawer] = rate;
    ctx.drawerUpper[drawer] = rate;
  }
}
