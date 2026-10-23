import { describe, expect, it } from "vitest";
import { mockForced, mockUnneeded } from "@/lib/solver/plan/__fixtures__/mock-extras";
import type { ThroughputResult } from "@/lib/model/types";
import type { PlanNote, PlanSolveExtras } from "@/lib/solver/plan/types";
import { buildNotices, byUrgency } from "./notices";
import type { FactoryProject } from "@/lib/model/types";
import { calculateThroughput } from "@/lib/solver";
import { attachStranded } from "../../stranded-surplus";
import { node, project, recipe, wire } from "@/lib/solver/plan/adapter/test-kit";
import { cardLabel, cardLabelText } from "../card-label";
import cbdPlan from "../../__fixtures__/stranded/cbd.json";
import loopPlan from "../../__fixtures__/stranded/hydrogen-loop.json";

const withExtras = (
  mock: typeof mockForced,
  extras: Partial<PlanSolveExtras>,
): ThroughputResult => ({
  ...mock.result,
  plan: { ...mock.result.plan!, ...extras },
});

const note = (message: PlanNote["message"], ...args: PlanNote["args"]): PlanNote => ({
  message,
  args,
});

describe("the notices' sentences", () => {
  it("says what a drawer asked and what the plan does instead", () => {
    const notices = buildNotices(mockUnneeded.project, mockUnneeded.result);
    expect(notices).toEqual([
      {
        id: "unmet:steel",
        severity: "warn",
        text: "The Steel Plate drawer wants 10 /s, but the plan can only make 6 /s",
        focus: ["steel"],
      },
    ]);
  });

  it("names exactly, and the supply wording for a source", () => {
    const exact = withExtras(mockUnneeded, {
      notes: [note("DRAWER_UNMET", "Steel Plate", note("RULE_EXACTLY"), 10, 6)],
    });
    expect(buildNotices(mockUnneeded.project, exact)[0]!.text).toBe(
      "The Steel Plate drawer wants exactly 10 /s, but the plan can only make 6 /s",
    );
    const over = withExtras(mockUnneeded, {
      notes: [note("DRAWER_UNMET", "Steel Plate", note("RULE_AT_MOST"), 6, 10)],
    });
    expect(buildNotices(mockUnneeded.project, over)[0]!.text).toBe(
      "The Steel Plate drawer allows at most 6 /s, but the plan makes 10 /s",
    );
    const supply = withExtras(mockUnneeded, {
      unmetDrawers: ["iron"],
      notes: [note("DRAWER_UNMET", "Iron Ingot", note("RULE_AT_MOST"), 12, 15)],
    });
    expect(buildNotices(mockUnneeded.project, supply)[0]).toMatchObject({
      text: "The Iron Ingot supply allows at most 12 /s, but the plan needs 15 /s",
      focus: ["iron"],
    });
    const short = withExtras(mockUnneeded, {
      unmetDrawers: ["iron"],
      notes: [note("DRAWER_UNMET", "Iron Ingot", note("RULE_EXACTLY"), 12, 9)],
    });
    expect(buildNotices(mockUnneeded.project, short)[0]!.text).toBe(
      "The Iron Ingot supply should give exactly 12 /s, but the plan can only use 9 /s",
    );
  });

  it("names what holds a short drawer back", () => {
    const machine = mockUnneeded.project.recipes.find(
      (r) => r.id === mockUnneeded.project.nodes.find((n) => n.id === "comp")!.recipeId,
    )!.machineType;
    const full = withExtras(mockUnneeded, {
      shortfalls: [
        {
          drawerId: "steel",
          rule: "AT_LEAST",
          target: 10,
          reachable: 6,
          limitingCards: ["comp"],
          limitingDrawers: [],
        },
      ],
      upTo: { comp: { capacity: 6, reached: 6, reason: "FULL" } },
    });
    expect(buildNotices(mockUnneeded.project, full)[0]).toMatchObject({
      text: `The Steel Plate drawer gets 6 /s of 10 /s. The ${machine} is full.`,
      focus: ["steel", "comp"],
    });
    const starved = withExtras(mockUnneeded, {
      shortfalls: [
        {
          drawerId: "steel",
          rule: "AT_LEAST",
          target: 10,
          reachable: 6,
          limitingCards: ["comp"],
          limitingDrawers: ["iron"],
        },
      ],
      upTo: { comp: { capacity: 8, reached: 6, reason: "STARVED" } },
    });
    expect(buildNotices(mockUnneeded.project, starved)[0]!.text).toBe(
      `The Steel Plate drawer gets 6 /s of 10 /s. The ${machine} is starved. The Iron Ingot drawer's rate holds it back.`,
    );
  });

  it("says a drawer with a rate that does nothing", () => {
    const result = withExtras(mockUnneeded, {
      unmetDrawers: [],
      notes: [
        note("DRAWER_NOT_CONNECTED", "Plank", "planks"),
        note("DRAWER_WIRED_IGNORED", "Log", "logs"),
      ],
    });
    const notices = buildNotices(mockUnneeded.project, result);
    expect(notices.map((n) => n.text)).toEqual([
      "The Plank drawer has a rate, but nothing is wired to it",
      "The Log drawer's rate does nothing: the ports it's on are wired",
    ]);
    expect(notices.map((n) => n.focus)).toEqual([["planks"], ["logs"]]);
  });

  it("reports a made-past-target output with the card to show", () => {
    const result = withExtras(mockForced, {
      notes: [note("OVERSHOOTS_TARGET", "Furnace", "Iron Ingot", 3, 2, "furn")],
    });
    expect(buildNotices(mockForced.project, result)).toEqual([
      {
        id: "overshoot:furn:Iron Ingot",
        severity: "warn",
        text: "The Furnace makes 3 /s of Iron Ingot, more than its 2 /s target, because another of its outputs needs more",
        focus: ["furn"],
      },
    ]);
  });

  it("reports a stored choice that no longer fits", () => {
    const result = withExtras(mockForced, { notes: [note("CHOICE_NO_LONGER_FITS")] });
    expect(buildNotices(mockForced.project, result)[0]).toMatchObject({
      severity: "warn",
      text: "Your saved choice no longer fits this plan, so the planner's own answer is shown",
      focus: [],
    });
  });

  it("turns each failure into what the player can do about it", () => {
    const text = (failure: PlanNote) =>
      buildNotices(mockForced.project, withExtras(mockForced, { failure }))[0]!;
    expect(text(note("NO_PIN"))).toMatchObject({
      severity: "info",
      text: "Nothing to calculate yet: set a rate on a drawer, or pin a machine count",
    });
    expect(
      text(
        note("PIN_CONFLICT", [
          note("PIN_DROPPED", "Macerator", note("PIN_COUNT"), "mac"),
          note("PIN_DROPPED", "Furnace", note("PIN_TARGET"), "furn"),
        ]),
      ),
    ).toEqual({
      id: "pin-conflict",
      severity: "error",
      text: "The pinned counts on Macerator and Furnace can't all be met at once: unpin one",
      focus: ["mac", "furn"],
    });
    expect(text(note("BALANCE_FAILED", note("SOLVER_UNSATISFIABLE", "infeasible")))).toMatchObject({
      severity: "error",
      text: "There's no way to meet all these rates and pinned counts: change a rate or unpin a count",
    });
    expect(text(note("VALIDATION_FAILED", "residual"))).toMatchObject({
      severity: "error",
      text: "The planner couldn't solve this plan (the details are in the log)",
    });
  });

  it("lists the most pressing first: a failed solve, then alarms, then warnings, then the rest", () => {
    const result = withExtras(mockForced, {
      failure: note("BALANCE_FAILED", note("SOLVER_UNSATISFIABLE", "infeasible")),
      notes: [note("OVERSHOOTS_TARGET", "Furnace", "Iron Ingot", 3, 2, "furn")],
      loops: [{ kind: "CLOG_LOCK", cards: ["furn"], portKeys: [], resourceKeys: [] }],
    });
    expect(buildNotices(mockForced.project, result).map((n) => [n.severity, n.tag])).toEqual([
      ["error", undefined],
      ["error", "CLOG LOCK"],
      ["warn", undefined],
    ]);
    const info = { severity: "info" as const, text: "info" };
    const warn = { severity: "warn" as const, text: "warn" };
    const alarm = { severity: "error" as const, tag: "DEAD LOOP", text: "alarm" };
    const failed = { severity: "error" as const, text: "failed" };
    expect(byUrgency([info, warn, alarm, failed, warn])).toEqual([failed, alarm, warn, warn, info]);
  });

  it("says nothing for an empty board, a clean plan or an old-mode result", () => {
    expect(
      buildNotices(
        { ...mockForced.project, nodes: [] },
        withExtras(mockForced, { failure: note("NO_PIN") }),
      ),
    ).toEqual([]);
    expect(
      buildNotices(
        { ...mockForced.project, nodes: [] },
        withExtras(mockForced, { failure: note("EMPTY_GRAPH") }),
      ),
    ).toEqual([]);
    expect(buildNotices(mockForced.project, mockForced.result)).toEqual([]);
    expect(buildNotices(mockForced.project, undefined)).toEqual([]);
    expect(buildNotices(mockForced.project, { ...mockForced.result, plan: undefined })).toEqual([]);
  });
});

describe("a stranded spare's notice", () => {
  const solved = (plan: FactoryProject): ThroughputResult => {
    const result = calculateThroughput(plan);
    attachStranded(plan, result);
    return result;
  };
  const cbd = () => structuredClone(cbdPlan) as unknown as FactoryProject;
  const loop = () => structuredClone(loopPlan) as unknown as FactoryProject;
  const HEAVY_LCR = "node-bbba4208-fadf-4819-be90-87206c39142c";

  it("names the spare, the rate, the card that makes it and how many cards stop, with a drawer to add", () => {
    const plan = cbd();
    const result = solved(plan);
    const notices = buildNotices(plan, result);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      id: `stranded:drawer:${HEAVY_LCR}|o|output:fluid:liquid_heavy_fuel`,
      severity: "warn",
      // Four cards are Large Chemical Reactors: only one makes Heavy Fuel.
      text: "Spare Heavy Fuel at the Large Chemical Reactor that makes it stops 7 cards: 28.58 L/s has nowhere to go",
      focus: [HEAVY_LCR],
    });
    expect(notices[0]!.tag).toBeUndefined();
    expect(notices[0]!.fix?.label).toBe("Add a drawer");
    expect(notices[0]!.fix?.tip).toBe("Adds a drawer for Heavy Fuel at the Large Chemical Reactor that makes it.");
    expect(notices[0]!.fix?.vent).toBe(result.plan?.stranded?.vents[0]);
  });

  it("offers no key while the books are stale or their search still runs, so a press cannot act on old books", () => {
    const plan = cbd();
    const notices = buildNotices(plan, { ...solved(plan), stale: true });
    expect(notices).toHaveLength(1);
    expect(notices[0]!.fix).toBeUndefined();
    const result = solved(plan);
    const pending = buildNotices(plan, { ...result, plan: { ...result.plan!, strandedPending: true } });
    expect(pending).toHaveLength(1);
    expect(pending[0]!.fix).toBeUndefined();
  });

  it("says nothing of a card the books name that is gone, and offers no wire to a card that is gone", () => {
    const plan = cbd();
    const result = solved(plan);
    expect(buildNotices({ ...plan, nodes: plan.nodes.filter((n) => n.id !== HEAVY_LCR) }, result)).toEqual([]);

    const wired = loop();
    wired.edges = wired.edges.filter((e) => e.id !== "w11");
    const books = solved(wired);
    const noTaker = buildNotices({ ...wired, nodes: wired.nodes.filter((n) => n.id !== "crLight") }, books);
    expect(noTaker).toHaveLength(1);
    expect(noTaker[0]!.text).toBe("Spare Hydrogen Cell at the Electrolyzer stops 8 cards: 0.023 /s has nowhere to go");
    expect(noTaker[0]!.focus).toEqual(["electro"]);
    expect(noTaker[0]!.fix).toBeUndefined();
  });

  it("offers the wire, and names both cards, when another card takes the spare from outside", () => {
    const plan = loop();
    plan.edges = plan.edges.filter((e) => e.id !== "w11");
    const notices = buildNotices(plan, solved(plan));
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      text: "Spare Hydrogen Cell at the Electrolyzer stops 8 cards: 0.023 /s has nowhere to go, and the Hydrogen Cell input of the Chemical Reactor that makes Light Fuel is not wired",
      focus: ["electro", "crLight"],
    });
    expect(notices[0]!.fix?.label).toBe("Wire it");
    expect(notices[0]!.fix?.tip).toBe(
      "Wires Hydrogen Cell from the Electrolyzer to the Chemical Reactor that makes Light Fuel.",
    );
  });

  it("ranks below a failed solve and the ring alarms", () => {
    const plan = cbd();
    const result = solved(plan);
    const failed: ThroughputResult = {
      ...result,
      plan: {
        ...result.plan!,
        failure: note("BALANCE_FAILED", note("SOLVER_UNSATISFIABLE", "infeasible")),
        loops: [{ kind: "CLOG_LOCK", cards: [HEAVY_LCR], portKeys: [], resourceKeys: [] }],
      },
    };
    const ids = buildNotices(plan, failed).map((n) => n.id);
    expect(ids[0]).toBe("no-way");
    expect(ids.at(-1)).toBe(`stranded:drawer:${HEAVY_LCR}|o|output:fluid:liquid_heavy_fuel`);
    expect(ids.length).toBe(3);
  });

  it("names a shared machine's spare by the recipe it is on, and falls back to what a card takes", () => {
    // Two Mock Machines: the shared card's first recipe makes y, its second (where the spare is) makes h and l.
    const shared = project({
      recipes: [
        recipe("make-a", [], [["a", 1]]),
        recipe("make-x", [], [["x", 1]]),
        recipe("other", [["x", 1]], [["y", 1]]),
        recipe("tower", [["a", 1]], [["h", 3], ["l", 10]]),
        recipe("mix", [["h", 1], ["l", 5]], [["f", 1]]),
      ],
      nodes: [
        node("src", "make-a", { solvePin: 2 }),
        node("srcx", "make-x", { solvePin: 0.5 }),
        node("sh", "other", { extraRecipes: [{ recipeId: "tower" }] }),
        node("mix1", "mix"),
      ],
      edges: [
        wire("w0", "srcx", "sh", "x"),
        wire("w1", "src", "sh", "a", { to: 1 }),
        wire("w2", "sh", "mix1", "h", { from: 1 }),
        wire("w3", "sh", "mix1", "l", { from: 1 }),
      ],
    });
    const notices = buildNotices(shared, solved(shared));
    expect(notices).toHaveLength(1);
    expect(notices[0]!.text).toBe("Spare h at the Mock Machine that makes it stops 3 cards: 2 /s has nowhere to go");

    // Two cards that make the same things: told apart by what one takes that the other does not.
    const twins = {
      ...shared,
      recipes: [...shared.recipes, recipe("tower2", [["b", 1]], [["h", 3], ["l", 10]])],
      nodes: [...shared.nodes, node("tw2", "tower2")],
    };
    expect(cardLabel(twins, "tw2")).toEqual({ name: "Mock Machine", takes: "b" });
    expect(cardLabelText(cardLabel(twins, "tw2"))).toBe("Mock Machine that takes b");
    // A section's own recipe: the shared card's h is on its second recipe, which the twin makes too.
    expect(cardLabel(twins, "sh", "h", "sh#r1")).toEqual({ name: "Mock Machine", takes: "a" });
  });

  it("says nothing on the working loop", () => {
    const plan = loop();
    expect(buildNotices(plan, solved(plan))).toEqual([]);
  });
});
