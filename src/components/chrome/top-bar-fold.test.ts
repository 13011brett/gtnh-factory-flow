import { describe, expect, it } from "vitest";
import {
  STEP_ROOM,
  TAB_LEAST_WIDTH,
  TABS_ROOM_ONE,
  TABS_ROOM_TWO,
  TOP_BAR_HYSTERESIS,
  stepSaving,
  topBarStep,
  type StepSavings,
  type TopBarStep,
} from "./top-bar-fold";

/**
 * A bar as the browser lays it out: everything but the tabs takes `fixed[step]`, the tabs take the rest (never under
 * their least and the +). The savings are what the browser would measure at each step.
 */
const FIXED = [270, 190, 182] as const;
const SAVINGS: StepSavings = [FIXED[0] - FIXED[1], FIXED[1] - FIXED[2]];
const tabsAt = (bar: number, step: TopBarStep) => Math.max(TAB_LEAST_WIDTH + 2 + 16, bar - FIXED[step]);

/** The bar at each of these widths in turn; at each the bar steps until it settles, as the hook does. */
function walk(bars: readonly number[], start: TopBarStep) {
  let step = start;
  const trail: Array<{ bar: number; step: TopBarStep; tabs: number }> = [];
  for (const bar of bars) {
    for (let guard = 0; guard < 5; guard++) {
      const next = topBarStep(step, tabsAt(bar, step), SAVINGS);
      if (next === step) break;
      step = next;
    }
    trail.push({ bar, step, tabs: tabsAt(bar, step) });
  }
  return trail;
}
/** Every px from one width to the other. */
function sweep(from: number, to: number, start: TopBarStep) {
  const move = from <= to ? 1 : -1;
  return walk(Array.from({ length: Math.abs(to - from) + 1 }, (_, at) => from + at * move), start);
}
const changes = (trail: ReturnType<typeof sweep>) => trail.filter((entry, at) => at > 0 && entry.step !== trail[at - 1].step).length;

describe("the room each step keeps for the tabs", () => {
  it("is two full tabs and the + before the keys become icons, one before the gaps tighten", () => {
    expect(STEP_ROOM).toEqual([TABS_ROOM_TWO, TABS_ROOM_ONE]);
    expect(TABS_ROOM_ONE).toBe(138);
    expect(TABS_ROOM_TWO).toBe(260);
  });
});

describe("stepping down", () => {
  it("stays roomy while the tabs keep room for two full tabs and the +", () => {
    expect(topBarStep(0, TABS_ROOM_TWO, SAVINGS)).toBe(0);
    expect(topBarStep(0, 700, SAVINGS)).toBe(0);
  });

  it("the keys become icons first, when the tabs would keep less than that", () => {
    expect(topBarStep(0, TABS_ROOM_TWO - 1, SAVINGS)).toBe(1);
  });

  it("the gaps tighten next, when even the icon keys leave the tabs under one full tab and the +", () => {
    expect(topBarStep(1, TABS_ROOM_ONE, SAVINGS)).toBe(1);
    expect(topBarStep(1, TABS_ROOM_ONE - 1, SAVINGS)).toBe(2);
  });

  it("goes no further: the last step holds however narrow the bar", () => {
    expect(topBarStep(2, 0, SAVINGS)).toBe(2);
  });
});

describe("stepping back", () => {
  it("needs the room the earlier dress would leave, plus a little", () => {
    const roomy = SAVINGS[0] + TABS_ROOM_TWO + TOP_BAR_HYSTERESIS;
    expect(topBarStep(1, roomy - 1, SAVINGS)).toBe(1);
    expect(topBarStep(1, roomy, SAVINGS)).toBe(0);
    const icons = SAVINGS[1] + TABS_ROOM_ONE + TOP_BAR_HYSTERESIS;
    expect(topBarStep(2, icons - 1, SAVINGS)).toBe(2);
    expect(topBarStep(2, icons, SAVINGS)).toBe(1);
  });

  it("steps down once and back once over a sweep, never flickering between", () => {
    const down = sweep(900, 200, 0);
    expect(changes(down)).toBe(2);
    expect(down.map((entry) => entry.step).filter((step, at, all) => at === 0 || step !== all[at - 1])).toEqual([0, 1, 2]);
    const up = sweep(200, 900, 2);
    expect(changes(up)).toBe(2);
    expect(up[up.length - 1].step).toBe(0);
  });

  it("is steady with the bar jittering a pixel either way at each edge", () => {
    for (const edge of [FIXED[0] + TABS_ROOM_TWO, FIXED[1] + TABS_ROOM_ONE]) {
      const settled = sweep(edge + 30, edge - 3, edge === FIXED[0] + TABS_ROOM_TWO ? 0 : 1);
      const resting = settled[settled.length - 1].step;
      const jitter = walk([edge, edge + 1, edge - 1, edge + 4, edge - 3, edge + 2, edge], resting);
      expect(new Set(jitter.map((entry) => entry.step))).toEqual(new Set([resting]));
    }
  });

  it("without a measured saving it would step back on the spot: the saving is what holds it", () => {
    // The icon dress gives the tabs the saving: at the edge the tabs are just under two tabs roomy, a good deal over in icons.
    const justDown = TABS_ROOM_TWO - 1 + SAVINGS[0];
    expect(topBarStep(1, justDown, [0, 0])).toBe(0);
    expect(topBarStep(1, justDown, SAVINGS)).toBe(1);
  });
});

describe("the tabs keep their least", () => {
  it("at every width the bar reaches, the strip holds the open tab at its narrowest and the +", () => {
    for (const { bar, tabs } of sweep(1000, 0, 0)) {
      expect(tabs, `${bar}`).toBeGreaterThanOrEqual(TAB_LEAST_WIDTH + 2 + 16);
    }
  });
});

describe("what a step gave", () => {
  it("is how much wider the strip got at the same bar width", () => {
    expect(stepSaving({ tabs: 250, bar: 500 }, { tabs: 330, bar: 500 })).toBe(80);
  });

  it("leaves out what the bar's own width gave when it moved between the two reads", () => {
    expect(stepSaving({ tabs: 250, bar: 500 }, { tabs: 335, bar: 505 })).toBe(80);
    expect(stepSaving({ tabs: 250, bar: 500 }, { tabs: 325, bar: 495 })).toBe(80);
  });

  it("is never negative", () => {
    expect(stepSaving({ tabs: 250, bar: 500 }, { tabs: 240, bar: 500 })).toBe(0);
  });
});
