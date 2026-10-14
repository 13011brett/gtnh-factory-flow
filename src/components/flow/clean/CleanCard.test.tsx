// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ReactFlowProvider } from "@xyflow/react";
import type { FactoryNode, Recipe, ResourceKind } from "@/lib/model/types";
import type { RailPort } from "../node-verdict";
import { CleanCard } from "./CleanCard";
import type { CleanCardActions, CleanCardContext, CleanCardView, CleanPortView } from "./clean-model";
import { layoutStrip } from "./clean-model";

vi.mock("@/lib/compact-view", () => ({ isCompactViewport: () => false }));

beforeAll(() => {
  // jsdom has no ResizeObserver; React Flow's provider asks for one.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
afterEach(cleanup);

/** The most elements one reference card may cost: 3 inputs + power + 2 outputs + 2 chips + 3 strip chips. */
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
    count: { text: "×1.2", pinned: false, zero: false, note: "(set count)", value: 1.2, title: "" },
    circuit: {
      setting: "2",
      resource: { kind: "item", id: "mock:circuit", amount: 1, displayName: "Programmed Circuit", iconPath: "/c.png" },
    } as CleanCardView["circuit"],
    chips: strip.chips,
    stripHeight: strip.height,
    selected: false,
    cannotRun: false,
    unset: true,
  };
}

const actions: CleanCardActions = {
  stepTier: () => undefined,
  setAmps: () => undefined,
  cycleMachine: () => undefined,
  switchMachine: () => undefined,
  setCount: () => undefined,
  stepSetting: () => undefined,
};
const context = {
  machineHandlers: [],
  selectedMachineHandler: { id: "ebf", label: "Electric Blast Furnace" },
  settings: [],
  handleIds: [],
} as unknown as CleanCardContext;
const recipe = { id: "r" } as unknown as Recipe;
const node = { id: "n1" } as unknown as FactoryNode;

function renderCard(view: CleanCardView) {
  return render(
    <ReactFlowProvider>
      <CleanCard view={view} actions={actions} context={context} recipe={recipe} node={node} />
    </ReactFlowProvider>,
  );
}

it("costs at most 70 elements for the reference card", () => {
  const { container } = renderCard(referenceView());
  const count = container.querySelectorAll("*").length;
  // The count is part of the contract: print it so a PR can quote it.
  console.info(`[clean card] reference card DOM elements: ${count}`);
  expect(count).toBeLessThanOrEqual(BUDGET);
});

it("keeps every control a div, so the button font rule cannot reach it", () => {
  const { container } = renderCard(referenceView());
  expect(container.querySelectorAll("button, input, select, textarea").length).toBe(0);
});

it("sets the count prompt and the pinned note through data attributes", () => {
  const view = referenceView();
  const { container } = renderCard(view);
  const count = container.querySelector(".cc-count")!;
  expect(count.getAttribute("data-note")).toBe("(set count)");
  expect(count.hasAttribute("data-prompt")).toBe(true);
  cleanup();
  const pinned = renderCard({ ...view, unset: false, count: { ...view.count, pinned: true, note: "(pinned)" } });
  const note = pinned.container.querySelector(".cc-count")!;
  expect(note.getAttribute("data-note")).toBe("(pinned)");
  expect(note.hasAttribute("data-pinned")).toBe(true);
  expect(note.hasAttribute("data-prompt")).toBe(false);
});

it("marks an unwired port and a card that cannot run", () => {
  const { container } = renderCard({ ...referenceView(), cannotRun: true, selected: true });
  expect(container.querySelectorAll('.cc-row[data-wired="false"]').length).toBe(1);
  const card = container.querySelector(".cc-card")!;
  expect(card.hasAttribute("data-cannot-run")).toBe(true);
  expect(card.hasAttribute("data-selected")).toBe(true);
});

it("lays strip chips out on whole-cell rows inside the card", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, label: "Setting", value: `value ${i}`, title: "" }));
  const { chips, height } = layoutStrip(many);
  expect(height % 20).toBe(0);
  for (const chip of chips) {
    expect(chip.x).toBeGreaterThanOrEqual(8);
    expect(chip.x + chip.width).toBeLessThanOrEqual(380 - 8);
    expect((chip.y - 10) % 20).toBe(0);
  }
  expect(layoutStrip([]).height).toBe(0);
});
