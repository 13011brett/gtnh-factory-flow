// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import type { FactoryNode, Recipe, ResourceKind } from "@/lib/model/types";
import type { RailPort } from "../node-verdict";
import { CleanCard } from "./CleanCard";
import type {
  CleanCardActions,
  CleanCardContext,
  CleanCardView,
  CleanPortView,
} from "./clean-model";
import { buildCountView, buildFootView, layoutStrip, reasonStripes } from "./clean-model";

vi.mock("@/lib/compact-view", () => ({ isCompactViewport: () => false }));

const sfx = vi.hoisted(() => ({ sfxClick: vi.fn(), playEditSfx: vi.fn() }));
vi.mock("@/lib/sound/sfx", async (original) => ({
  ...(await original<typeof import("@/lib/sound/sfx")>()),
  sfxClick: sfx.sfxClick,
  playEditSfx: sfx.playEditSfx,
}));

beforeAll(() => {
  // jsdom has no ResizeObserver; React Flow's provider asks for one.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

/**
 * The most elements one reference card may cost: 3 inputs + power + 2 outputs + 2 chips + 3 strip chips + the circuit
 * badge in the well (68). An Up to card with its bar along the foot costs two more (the rule word and the bar): 70.
 */
const BUDGET = 70;

function port(side: "input" | "output", n: number, kind: ResourceKind = "item"): CleanPortView {
  const resource = {
    kind,
    id: `mock:${side}${n}`,
    amount: 1,
    displayName: `Resource ${side} ${n}`,
    iconPath: "/mock.png",
  };
  const rail = {
    side,
    key: `${side}:${n}`,
    kind,
    resourceId: resource.id,
    displayName: resource.displayName,
    handleId: `${side}:${kind}:${resource.id}`,
    resource,
    connected: n !== 3,
    currentPerSecond: 1.5,
  } as unknown as RailPort;
  return {
    key: rail.key,
    nodeId: "n1",
    handleId: rail.handleId,
    side,
    port: rail,
    number: "900",
    unit: "/hr",
    name: resource.displayName,
    title: resource.displayName,
    zero: false,
    gold: n === 1,
    numberSmall: false,
    nameSmall: false,
    nameClipped: false,
    wired: rail.connected,
    choice: n === 2,
    resourceKey: `${kind}:${resource.id}`,
    forced: undefined,
  };
}

const count = (
  rule: "any" | "upTo" | "exact",
  pin: number | undefined,
  value: number,
  unset = false,
) =>
  buildCountView({
    rule,
    pin,
    pinned: rule !== "any",
    value,
    needed: value,
    unset,
    upTo: undefined,
  });

function referenceView(): CleanCardView {
  const strip = layoutStrip([
    { id: "heatingCoil", label: "Coil", value: "Nichrome", title: "" },
    { id: "p", label: "Parallel", value: "×4", reading: true, title: "" },
    { id: "oc", label: "Perfect OC", value: "on", title: "" },
  ]);
  return {
    nodeId: "n1",
    name: "Electric Blast Furnace",
    nameSize: 14,
    hasPicker: true,
    tier: { label: "EV", fixed: false, title: "" },
    amps: { label: "4A", value: 4, editable: true },
    inputs: [port("input", 1), port("input", 2), port("input", 3)],
    outputs: [port("output", 1), port("output", 2)],
    power: { number: "6.93k", unit: "EU/t", name: "Power", stalled: false, title: "" },
    art: "/power-art/electric-blast-furnace.png",
    count: count("any", undefined, 1.2, true),
    circuit: {
      setting: "2",
      resource: {
        kind: "item",
        id: "mock:circuit",
        amount: 1,
        displayName: "Programmed Circuit",
        iconPath: "/c.png",
      },
    } as CleanCardView["circuit"],
    chips: strip.chips,
    stripHeight: strip.height,
    selected: false,
    cannotRun: false,
    unset: true,
  };
}

/** The reference card as an Up to card held back by its first input, its bar along the foot. */
function upToView(): CleanCardView {
  const view = referenceView();
  const upToCount = count("upTo", 24, 18.2);
  return {
    ...view,
    unset: false,
    count: upToCount,
    foot: buildFootView(
      upToCount,
      { capacity: 24, reached: 18.2, reason: "STARVED", resourceKey: "item:mock:input1" },
      { inputs: view.inputs, outputs: view.outputs },
    ),
  };
}

function actionsSpy(): CleanCardActions {
  return {
    stepTier: vi.fn(),
    setAmps: vi.fn(),
    cycleMachine: vi.fn(),
    switchMachine: vi.fn(),
    setCount: vi.fn(),
    stepCount: vi.fn(),
    setRule: vi.fn(),
    stepSetting: vi.fn(),
  };
}
const context = {
  machineHandlers: [],
  selectedMachineHandler: { id: "ebf", label: "Electric Blast Furnace" },
  settings: [],
  handleIds: [],
} as unknown as CleanCardContext;
const recipe = { id: "r" } as unknown as Recipe;
const node = { id: "n1" } as unknown as FactoryNode;

function renderCard(view: CleanCardView, actions: CleanCardActions = actionsSpy()) {
  return render(
    <ReactFlowProvider>
      <CleanCard view={view} actions={actions} context={context} recipe={recipe} node={node} />
    </ReactFlowProvider>,
  );
}

it("costs at most 70 elements for the reference card", () => {
  const { container } = renderCard(referenceView());
  const elements = container.querySelectorAll("*").length;
  // The count is part of the contract: print it so a PR can quote it.
  console.info(`[clean card] reference card DOM elements: ${elements}`);
  expect(elements).toBeLessThanOrEqual(BUDGET);
});

it("costs at most 70 elements as an Up to card with its bar", () => {
  const { container } = renderCard(upToView());
  const elements = container.querySelectorAll("*").length;
  console.info(`[clean card] Up to reference card with its bar, DOM elements: ${elements}`);
  expect(container.querySelector(".cc-foot")).not.toBeNull();
  expect(elements).toBeLessThanOrEqual(BUDGET);
});

it("keeps every control a div, so the button font rule cannot reach it", () => {
  const { container } = renderCard(upToView());
  expect(container.querySelectorAll("button, input, select, textarea").length).toBe(0);
});

it("says what runs big and what is set small, through data attributes", () => {
  const { container } = renderCard(referenceView());
  const any = container.querySelector(".cc-count")!;
  expect(any.getAttribute("data-run")).toBe("×1.2");
  expect(any.getAttribute("data-set")).toBe("(set count)");
  expect(any.hasAttribute("data-prompt")).toBe(true);
  expect(any.querySelector(".cc-rule")).toBeNull();
  cleanup();

  const upTo = renderCard(upToView()).container.querySelector(".cc-count")!;
  expect(upTo.getAttribute("data-run")).toBe("×18.2");
  expect(upTo.getAttribute("data-set")).toBe("24");
  expect(upTo.getAttribute("data-rule")).toBe("upTo");
  expect(upTo.hasAttribute("data-pinned")).toBe(true);
  expect(upTo.hasAttribute("data-prompt")).toBe(false);
  expect(upTo.querySelector(".cc-rule")!.textContent).toBe("up to");
  cleanup();

  const exact = renderCard({
    ...referenceView(),
    unset: false,
    count: count("exact", 24, 24),
  }).container;
  expect(exact.querySelector(".cc-rule")!.textContent).toBe("exactly");
  expect(exact.querySelector(".cc-count")!.getAttribute("data-set")).toBe("24");
  // An Exactly card with nothing forced has no bar; neither has an Any card.
  expect(exact.querySelector(".cc-foot")).toBeNull();
});

it("opens Any, Up to, Exactly from the rule word and sends the pick", () => {
  const actions = actionsSpy();
  const { container } = renderCard(upToView(), actions);
  fireEvent.click(container.querySelector(".cc-rule")!);
  const rows = [...document.querySelectorAll('[role="menuitemradio"]')];
  expect(rows.map((row) => row.querySelector(".cm-name")!.textContent)).toEqual([
    "Any",
    "Up to",
    "Exactly",
  ]);
  expect(rows[1]!.getAttribute("aria-checked")).toBe("true");
  fireEvent.click(rows[2]!);
  expect(actions.setRule).toHaveBeenCalledWith("exact");
  // The rule word's click is its own: it never starts typing a count.
  expect(container.querySelector(".cc-count input")).toBeNull();
});

it("types a count on a click, steps it on the wheel and goes back to Any on a middle click", () => {
  const actions = actionsSpy();
  const { container } = renderCard(upToView(), actions);
  const block = container.querySelector(".cc-count")!;
  fireEvent.wheel(block, { deltaY: -100 });
  expect(actions.stepCount).toHaveBeenCalledWith(1);
  fireEvent.wheel(block, { deltaY: 100 });
  expect(actions.stepCount).toHaveBeenCalledWith(-1);
  fireEvent(block, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
  expect(actions.setCount).toHaveBeenCalledWith(undefined);
  fireEvent.click(block);
  const input = container.querySelector<HTMLInputElement>(".cc-count input")!;
  expect(input.value).toBe("24");
  fireEvent.change(input, { target: { value: "30" } });
  fireEvent.blur(input);
  expect(actions.setCount).toHaveBeenLastCalledWith(30);
});

it("sounds for itself: a click that opens the editor or the rule menu clicks, each wheel step ticks", () => {
  sfx.sfxClick.mockClear();
  sfx.playEditSfx.mockClear();
  const actions = actionsSpy();
  const { container } = renderCard(upToView(), actions);
  const block = container.querySelector(".cc-count")!;
  // The page's own click stands down for it.
  expect(block.hasAttribute("data-sfx-own")).toBe(true);
  fireEvent.wheel(block, { deltaY: -100 });
  fireEvent.wheel(block, { deltaY: 100 });
  expect(sfx.playEditSfx.mock.calls).toEqual([
    ["ui.tick", 1, 1.12],
    ["ui.tick", 1, 0.9],
  ]);
  fireEvent.click(container.querySelector(".cc-rule")!);
  expect(sfx.sfxClick).toHaveBeenCalledTimes(1);
  sfx.playEditSfx.mockClear();
  fireEvent(block, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
  expect(sfx.playEditSfx.mock.calls).toEqual([["board.unpin"]]);
  expect(actions.setCount).toHaveBeenLastCalledWith(undefined);
  cleanup();
  const again = renderCard(upToView(), actions);
  fireEvent.click(again.container.querySelector(".cc-count")!);
  expect(sfx.sfxClick).toHaveBeenCalledTimes(2);
});

it("outlines a problem card in its bar's tone, and leaves Any and a full card alone", () => {
  const starved = renderCard(upToView()).container.querySelector(".cc-card")!;
  expect(starved.getAttribute("data-tone")).toBe("starved");
  cleanup();
  const any = renderCard(referenceView()).container.querySelector(".cc-card")!;
  expect(any.hasAttribute("data-tone")).toBe(false);
  cleanup();
  const view = referenceView();
  const fullCount = count("upTo", 24, 24);
  const full = renderCard({
    ...view,
    count: fullCount,
    foot: buildFootView(
      fullCount,
      { capacity: 24, reached: 24, reason: "FULL" },
      { inputs: view.inputs, outputs: view.outputs },
    ),
  }).container.querySelector(".cc-card")!;
  expect(full.hasAttribute("data-tone")).toBe(false);
  cleanup();
  const exactCount = count("exact", 24, 24);
  const fed = [
    { ...view.inputs[0]!, forced: { number: "720", unit: "L/s" } },
    ...view.inputs.slice(1),
  ];
  const forced = renderCard({
    ...view,
    inputs: fed,
    count: exactCount,
    foot: buildFootView(exactCount, undefined, { inputs: fed, outputs: view.outputs }),
  }).container.querySelector(".cc-card")!;
  expect(forced.getAttribute("data-tone")).toBe("forced");
});

it("marks a card in a ring so its outline pulses in the ring's tone", () => {
  const dead = renderCard({ ...upToView(), loop: "dead" }).container.querySelector(".cc-card")!;
  expect(dead.getAttribute("data-loop")).toBe("dead");
  cleanup();
  const clog = renderCard({ ...upToView(), loop: "clog" }).container.querySelector(".cc-card")!;
  expect(clog.getAttribute("data-loop")).toBe("clog");
  cleanup();
  const none = renderCard(upToView()).container.querySelector(".cc-card")!;
  expect(none.hasAttribute("data-loop")).toBe(false);
});

it("lights the row its reason names", () => {
  const view = upToView();
  const lit = {
    ...view,
    inputs: view.inputs.map((p, i) => (i === 0 ? { ...p, why: "starved" as const } : p)),
  };
  const { container } = renderCard(lit);
  const rows = [...container.querySelectorAll<HTMLElement>(".cc-row[data-port]")];
  expect(rows.map((row) => row.getAttribute("data-why"))).toEqual([
    "starved",
    null,
    null,
    null,
    null,
  ]);
  // Striped in the reason's own mixes, as a free end is in its own.
  expect(rows[0]!.style.getPropertyValue("--cc-why-body")).toBe(reasonStripes("starved")!.body);
  expect(rows[0]!.style.getPropertyValue("--cc-why-stripe")).toBe(reasonStripes("starved")!.stripe);
  expect(rows[1]!.getAttribute("style")).toBeNull();
});

it("keeps each editor the size of what it replaces", () => {
  const { container } = renderCard(upToView());
  fireEvent.click(container.querySelector(".cc-count")!);
  const count = container.querySelector<HTMLInputElement>(".cc-count input")!;
  // "24": three characters and the box's padding, not the input's own wide default.
  expect(count.style.width).toBe("calc(3ch + 8px)");
  fireEvent.change(count, { target: { value: "1250" } });
  expect(count.style.width).toBe("calc(5ch + 8px)");
  fireEvent.blur(count);
  const amps = container.querySelector<HTMLElement>('.cc-head .cc-chip:not([aria-label^="Tier"])')!;
  Object.defineProperty(amps, "offsetWidth", { configurable: true, value: 48 });
  fireEvent.click(amps);
  expect(amps.hasAttribute("data-editing")).toBe(true);
  expect(amps.style.width).toBe("48px");
  expect(amps.querySelector("input")!.getAttribute("size")).toBe("1");
});

it("puts the circuit in the well's corner: its own icon and its tip, no number drawn on it, no row", () => {
  const { container } = renderCard(referenceView());
  const badge = container.querySelector<HTMLElement>(".cc-pic > .cc-circuit")!;
  expect(badge.hasAttribute("data-n")).toBe(false);
  expect(badge.querySelector(".cc-circuit-icon")).not.toBeNull();
  expect(JSON.parse(badge.getAttribute("data-tip")!).title).toBe("Circuit 2");
  expect(badge.textContent).toBe("");
  expect([...container.querySelectorAll(".cc-pname")].map((el) => el.textContent)).not.toContain(
    "Circuit",
  );
});

it("draws the bar as one element: tone, word, line and fraction", () => {
  const { container } = renderCard(upToView());
  const foot = container.querySelector<HTMLElement>(".cc-foot")!;
  expect(foot.children.length).toBe(0);
  expect(foot.getAttribute("data-tone")).toBe("starved");
  expect(foot.getAttribute("data-word")).toBe("STARVED");
  expect(foot.getAttribute("data-frac")).toBe("18.2 / 24");
  expect(foot.textContent).toBe("short of Resource input 1");
  expect(foot.style.getPropertyValue("--fill")).toMatch(/^\d+px$/);
  expect(foot.hasAttribute("data-tip")).toBe(true);
});

it("marks an unwired port and a card that cannot run", () => {
  const { container } = renderCard({ ...referenceView(), cannotRun: true, selected: true });
  expect(container.querySelectorAll('.cc-row[data-wired="false"]').length).toBe(1);
  const card = container.querySelector(".cc-card")!;
  expect(card.hasAttribute("data-cannot-run")).toBe(true);
  expect(card.hasAttribute("data-selected")).toBe(true);
});

it("keeps every port row a wire anchor with its handle", () => {
  const { container } = renderCard(upToView());
  const rows = container.querySelectorAll('.cc-row[data-port][data-resource-edge-anchor="true"]');
  expect(rows.length).toBe(5);
  for (const row of rows) expect(row.querySelector(".react-flow__handle")).not.toBeNull();
});

it("lays strip chips out on whole-cell rows inside the card", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    id: `c${i}`,
    label: "Setting",
    value: `value ${i}`,
    title: "",
  }));
  const { chips, height } = layoutStrip(many);
  expect(height % 20).toBe(0);
  for (const chip of chips) {
    expect(chip.x).toBeGreaterThanOrEqual(8);
    expect(chip.x + chip.width).toBeLessThanOrEqual(320 - 8);
    expect((chip.y - 10) % 20).toBe(0);
  }
  expect(layoutStrip([]).height).toBe(0);
});
