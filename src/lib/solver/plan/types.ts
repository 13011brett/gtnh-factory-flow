/**
 * Contracts of the merged ("plan mode") solver, frozen by WP0.
 *
 * Sections 1 and 2 of the solver port spec (`SolveInput`, `Answer`,
 * `SolutionView`, alternatives, spares, notes) and the adapter's
 * `PlanSolveExtras` (what the board reads off `ThroughputResult.plan`).
 * The engine works in the mod's slot-indexed world (ports are positions in
 * a machine's port lists); the extras speak the website's row keys (`PortKey`)
 * because indices are not stable across solves here. Changes to this file
 * go through the integrator.
 */

/**
 * Opaque unique id. Needs a total order: `compareIds` in `ids.ts` (Java signed
 * UUID order for UUIDs), never a plain string sort.
 */
export type Id = string;

/** One port of a machine. Units are per craft BEFORE the machine's parallels and multipliers. */
export interface PortIn {
  /** Units per craft (items, or mB for fluids; fractional allowed). Negative reads as 0. */
  amount: number;
  /** 0..1, a 32-bit float in the Java: `Math.fround()` it when reading. */
  chance: number;
  /** The node's own consumption (inputs) / productivity (outputs) multiplier on this port. */
  multiplier: number;
  /**
   * Ingredient number shared by every port that can connect to each other.
   * Used only by the wiring diagnostics and the stored-choice fallback.
   */
  resource: number;
  /** Ingredient display name; only used in notes. */
  name: string;
  /** The pack gives this ingredient away; silences the wiring diagnostics for it. */
  free: boolean;
}

export interface MachineIn {
  id: Id;
  /** Card/machine display name; only used in notes. */
  name: string;
  /** Ticks per craft after overclock (20 ticks = 1 s). <= 0 reads as 1. */
  durationTicks: number;
  /** NOT read by the solver; kept for the read-out. */
  energyPerTick: number;
  /** Crafts run at once per machine (parallels). Multiplies every port quantity. */
  throughputFactor: number;
  inputs: PortIn[];
  outputs: PortIn[];
  /** The machine count is pinned (a hard pin). */
  countFixed: boolean;
  /** The pin when `countFixed`. 0 with `countFixed` means "must not run". */
  machineCount: number;
  /** Output port index -> units/s the player asked of that port. */
  targetOutputRates: Record<number, number>;
  /** Input port index -> units/s the player asked of that port. */
  targetInputRates: Record<number, number>;
}

export interface EdgeIn {
  id: Id;
  source: Id;
  sourceOutput: number;
  target: Id;
  targetInput: number;
}

/** A machine group with a capacity. Only groups with `capacity > 0` are passed. */
export interface PoolIn {
  machines: Id[];
  /** Machines. */
  capacity: number;
  /** false: a cap (sum of machine time <= capacity). true: the count is pinned (== capacity). */
  exact: boolean;
}

export type DrawerKind = "SOURCE" | "PRODUCT" | "BYPRODUCT" | "TRASH";
export type DrawerRule = "ANY" | "AT_LEAST" | "EXACTLY" | "AT_MOST";

/** SOURCE links point at INPUT ports, every other kind at OUTPUT ports. */
export interface DrawerLink {
  node: Id;
  port: number;
}

export interface DrawerIn {
  id: Id;
  /** The drawer's label, else its resource key; only used in notes. */
  label: string;
  kind: DrawerKind;
  /** Already the EFFECTIVE rule: ANY for TRASH/BYPRODUCT whatever they store. */
  rule: DrawerRule;
  /** Units/s (L/s for fluids); meaningless under ANY. */
  rate: number;
  links: DrawerLink[];
}

export interface PortRef {
  node: Id;
  port: number;
  input: boolean;
}

export interface SolveInput {
  /** Other modes are not ported. */
  mode: "AUTO";
  /** A stored gate choice (a ChoiceKey's anchors) to honour. */
  choice?: PortRef[] | null;
  /** ORDER MATTERS: machines in id order. */
  machines: MachineIn[];
  /** ORDER MATTERS. */
  edges: EdgeIn[];
  pools: PoolIn[];
  drawers: DrawerIn[];
  /** Extra per-machine pins in CRAFTS per second; the app passes {} (a test hook). */
  extentPins: Record<Id, number>;
  /** Stored leftover splits: leftover key -> bearer key -> share. */
  spares: Record<string, Record<string, number>>;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export type SolverMessage =
  | "NO_PIN"
  | "EMPTY_GRAPH"
  | "BALANCE_FAILED"
  | "STAGE_FAILED"
  | "VALIDATION_FAILED"
  | "PIN_CONFLICT"
  | "PIN_DROPPED"
  | "PIN_COUNT"
  | "PIN_TARGET"
  | "PIN_EXTENT"
  | "SOLVER_UNSATISFIABLE"
  | "SOLVER_BUDGET"
  | "SOLVER_NOT_CONSERVING"
  | "OVERSHOOTS_TARGET"
  | "DRAWER_NOT_CONNECTED"
  | "DRAWER_WIRED_IGNORED"
  | "DRAWER_ONLY_UPPER_BOUNDS"
  | "DRAWER_UNMET"
  | "DRAWER_LIMITED_BY"
  | "RULE_ANY"
  | "RULE_AT_LEAST"
  | "RULE_EXACTLY"
  | "RULE_AT_MOST"
  | "LIMIT_PIN"
  | "LIMIT_DRAWER"
  | "LIMIT_GROUP"
  | "WIRING_IMPORT"
  | "WIRING_UNLINKED"
  | "CHOICE_NO_LONGER_FITS"
  | "CHOICE_NEEDS_MORE_GATES"
  | "SHOWING_CLOSEST"
  | "STOPPED_EARLY";

export type NoteArg = string | number | Note | Note[];

/** Never a rendered string: goldens record `message` as the enum name. */
export interface Note {
  message: SolverMessage;
  args: NoteArg[];
}

export interface External {
  port: PortRef;
  /** Units/s. */
  ratePerSecond: number;
}

/** The anchors of the open gates: what a stored choice is. Sorted by `comparePortRef`. */
export interface ChoiceKey {
  gateAnchors: PortRef[];
}

export interface Shortfall {
  drawer: Id;
  rule: DrawerRule;
  target: number;
  reachable: number;
  limitingNodes: Id[];
  limitingDrawers: Id[];
  limitingGroups: number;
}

export interface DrawerReadout {
  /** Every drawer's total in units/s at the point. */
  rates: Record<Id, number>;
  /** Drawers whose rule the point does not keep. */
  unmet: Id[];
  shortfalls: Shortfall[];
}

export interface SolutionView {
  /** Crafts/s, every machine (0 for idle). */
  extentsPerSecond: Record<Id, number>;
  /** extent * durTicks / 20, fractional. */
  machineCounts: Record<Id, number>;
  /** Every retained edge (dropped edges are absent). */
  edgeFlowsPerSecond: Record<Id, number>;
  /** FORCED INPUTS: a wired INPUT port where the solve brings material in. */
  gatedSources: External[];
  /** FORCED OUTPUTS: a wired OUTPUT port where the solve sends material out. */
  gatedSinks: External[];
  /** Unwired inputs and the rate they draw. */
  terminalInputs: External[];
  /** Unwired outputs and the rate they make. */
  terminalOutputs: External[];
  /** Unpinned machines the answer leaves at zero. */
  unneeded: Id[];
  openGates: number;
  /** Sum of the reported gated externals (raw units, not crafts). */
  externalQuantity: number;
  totalInternalFlow: number;
  notes: Note[];
  key: ChoiceKey;
  drawers: DrawerReadout;
  spares: Leftover[];
}

export type Rank =
  | "DEFAULT"
  | "EQUALLY_VALID"
  | "BUYS_MORE"
  | "SELLS_MORE"
  | "MOVES_MORE"
  | "MOVES_LESS";

export interface Alternative {
  /** The WHOLE support this option implies (what gets stored when picked). */
  key: ChoiceKey;
  /** The decision it belongs to: the anchor of the gate the incumbent answer opens. */
  replaces: PortRef;
  /** The anchor of the gate it uses instead (== replaces for the current answer). */
  opens: PortRef;
  /** The flows at `opens` only. */
  externals: External[];
  /** Why it is not the default; DEFAULT = the answer on screen. */
  rank: Rank;
}

export interface Alternatives {
  /** The committed support's key. */
  chosen: ChoiceKey | null;
  options: Alternative[];
  /** false if the search was truncated. */
  complete: boolean;
  /** SHOWING_CLOSEST, STOPPED_EARLY. */
  notes: Note[];
}

export interface Bearer {
  /** A gate, named by its anchor port. */
  anchor: PortRef;
  /** What crosses at the gate's ports now (> dust). */
  flows: External[];
  /** What crosses there when it bears the whole leftover. */
  max: number;
  /** Its part of the leftover now, 0..1. */
  share: number;
  /** The solver's own placement. */
  solverPick: boolean;
}

export interface Leftover {
  /** Bearers' keys sorted (UTF-16 order) and joined by "|". A bearer key is `${node}:${i|o}:${port}`. */
  key: string;
  /** A shortfall brought in (true) or a surplus sent out (false). */
  importing: boolean;
  /** In the alternatives list order (the DEFAULT/current row first). */
  bearers: Bearer[];
  /** A stored split is in force. */
  custom: boolean;
}

export type Answer =
  | { kind: "solved"; solution: SolutionView; alternatives: Alternatives }
  | { kind: "failed"; failure: Note; notes: Note[]; drawers: DrawerReadout };

// ---------------------------------------------------------------------------
// What the board reads: `ThroughputResult.plan`
// ---------------------------------------------------------------------------

/**
 * A port named by row, stable across solves:
 * `nodeId|i or o|canonicalHandle`, where `nodeId` is the SOLVE node id (a
 * shared section is `card#rN`) and the handle is the canonical, section-free
 * handle id of the row (`output:item:foo`). See `port-key.ts`.
 */
export type PortKey = string;

export type PlanSide = "in" | "out";

/** A planner-facing note: the solver's note, ids already website ids. */
export type PlanNote = Note;

/** Material the solve brings in or sends out at a wired port that has no drawer. */
export interface PlanForced {
  nodeId: Id;
  portKey: PortKey;
  side: PlanSide;
  /** `kind:id` of the port's row. */
  resourceKey: string;
  perSecond: number;
}

export interface PlanBearer {
  portKey: PortKey;
  /** What crosses at this place when it bears the whole leftover. */
  maxPerSecond: number;
  /** 0..1 */
  share: number;
  solverPick: boolean;
  /** What crosses at the gate's ports now. */
  flows: Array<{ portKey: PortKey; perSecond: number }>;
}

export interface PlanLeftover {
  /**
   * Stable key (`spareShares` is keyed on it): the bearers' PortKeys sorted
   * and joined by U+001F (`makeLeftoverKey` in `port-key.ts`). Never `|`:
   * a PortKey holds it.
   */
  key: string;
  importing: boolean;
  custom: boolean;
  bearers: PlanBearer[];
}

/** An unwired port: a free terminal that imports or exports at its own rate. */
export interface PlanTerminal {
  nodeId: Id;
  portKey: PortKey;
  side: PlanSide;
  perSecond: number;
}

export interface PlanSolveExtras {
  forced: PlanForced[];
  leftovers: PlanLeftover[];
  /** Unpinned machines the answer leaves at zero (nothing pinned feeds or needs them). */
  unneeded: Id[];
  /** Recipes AND drawers in a part of the plan that nothing sets ("(set count)" / "Set rate"). */
  unanchored: Id[];
  terminals: PlanTerminal[];
  notes: PlanNote[];
  openGates: number;
  /** Set when the solve failed (NO_PIN included: "nothing sets the plan's size"). */
  failure?: PlanNote;
  /** Drawers whose rule the answer does not keep. */
  unmetDrawers?: Id[];
}
