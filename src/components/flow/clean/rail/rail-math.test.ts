import { describe, expect, it } from "vitest";
import {
  allAt,
  evenShares,
  nudged,
  parseRateInput,
  sameShares,
  shareAtX,
  steppedRate,
} from "./rail-math";

describe("parseRateInput", () => {
  it("reads the mod's shorthand", () => {
    expect(parseRateInput("2.5k")).toBe(2500);
    expect(parseRateInput("1M")).toBe(1_000_000);
    expect(parseRateInput("3,200")).toBe(3200);
    expect(parseRateInput(".5")).toBe(0.5);
    expect(parseRateInput("1/3")).toBeCloseTo(1 / 3, 12);
    expect(parseRateInput("10k/4")).toBe(2500);
  });

  it("refuses what is not a number instead of guessing", () => {
    expect(parseRateInput("")).toBeUndefined();
    expect(parseRateInput("abc")).toBeUndefined();
    expect(parseRateInput("1/0")).toBeUndefined();
    expect(parseRateInput("1/2/3")).toBeUndefined();
  });
});

describe("spare shares", () => {
  it("nudges one place and the others give or take in proportion", () => {
    const out = nudged([0.5, 0.3, 0.2], 0, 0.25);
    expect(out[0]).toBeCloseTo(0.75, 12);
    expect(out[1]! / out[2]!).toBeCloseTo(0.3 / 0.2, 9);
    expect(out.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });

  it("splits evenly when the others had nothing", () => {
    const out = nudged([1, 0, 0], 0, -0.5);
    expect(out[0]).toBeCloseTo(0.5, 12);
    expect(out[1]).toBeCloseTo(0.25, 12);
    expect(out[2]).toBeCloseTo(0.25, 12);
  });

  it("clamps a share to 0..1", () => {
    expect(nudged([0.5, 0.5], 0, 3)).toEqual([1, 0]);
    expect(nudged([0.5, 0.5], 0, -3)).toEqual([0, 1]);
  });

  it("builds even and all-at splits", () => {
    expect(evenShares(4)).toEqual([0.25, 0.25, 0.25, 0.25]);
    expect(allAt(3, 1)).toEqual([0, 1, 0]);
  });

  it("reads a press on the bar in fiftieths", () => {
    expect(shareAtX(100, 100, 78)).toBe(0);
    expect(shareAtX(178, 100, 78)).toBe(1);
    expect(shareAtX(139, 100, 78)).toBe(0.5);
    expect(shareAtX(60, 100, 78)).toBe(0);
    expect(shareAtX(900, 100, 78)).toBe(1);
    expect(shareAtX(10, 0, 0)).toBe(0);
  });

  it("compares splits", () => {
    expect(sameShares([0.5, 0.5], [0.5, 0.5])).toBe(true);
    expect(sameShares([0.5, 0.5], [0.4, 0.6])).toBe(false);
    expect(sameShares([1], [1, 0])).toBe(false);
  });
});

describe("the wheel", () => {
  it("steps 1, Ctrl 10, Shift 100 and never below zero", () => {
    expect(steppedRate(5, 1, false, false)).toBe(6);
    expect(steppedRate(5, 1, true, false)).toBe(15);
    expect(steppedRate(5, 1, false, true)).toBe(105);
    expect(steppedRate(5, -1, true, false)).toBe(0);
    expect(steppedRate(2.6, 1, false, false)).toBe(4);
  });
});
