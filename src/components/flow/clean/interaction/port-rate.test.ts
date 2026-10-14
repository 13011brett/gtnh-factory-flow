import { describe, expect, it } from "vitest";
import { parseRateText, portRatePatch, stepShownRate, withPortRate } from "./port-rate";

describe("a typed port rate", () => {
  it("reads numbers, shorthand and fractions", () => {
    expect(parseRateText("12")).toBe(12);
    expect(parseRateText("2.5k")).toBe(2500);
    expect(parseRateText("1M")).toBe(1_000_000);
    expect(parseRateText("1/3")).toBeCloseTo(1 / 3, 12);
    expect(parseRateText(" 3 / 4 ")).toBe(0.75);
  });

  it("refuses what is not a positive number", () => {
    for (const text of ["", "abc", "0", "-2", "1/0", "1/", "k"]) expect(parseRateText(text)).toBeUndefined();
  });
});

describe("the wheel on the rate box", () => {
  const none = { shiftKey: false, ctrlKey: false };
  it("rounds the shown figure then adds 1, Ctrl 10, Shift 100 (the mod, not a landing on whole steps)", () => {
    expect(stepShownRate(2.3, true, none)).toBe(3);
    expect(stepShownRate(3, true, none)).toBe(4);
    expect(stepShownRate(2.7, false, none)).toBe(2);
    expect(stepShownRate(8, true, { shiftKey: false, ctrlKey: true })).toBe(18);
    expect(stepShownRate(14, true, { shiftKey: true, ctrlKey: false })).toBe(114);
  });

  it("clears below 1", () => {
    expect(stepShownRate(1, false, none)).toBeUndefined();
    expect(stepShownRate(0.4, false, none)).toBeUndefined();
    expect(stepShownRate(10, false, { shiftKey: false, ctrlKey: true })).toBeUndefined();
    expect(stepShownRate(5, false, { shiftKey: false, ctrlKey: true })).toBeUndefined();
  });
});

describe("portRates", () => {
  it("sets, replaces and clears one handle without touching the others", () => {
    const a = withPortRate(undefined, "input:item:a", 2);
    expect(a).toEqual({ "input:item:a": 2 });
    const b = withPortRate(a, "output:item:b", 0.5);
    expect(b).toEqual({ "input:item:a": 2, "output:item:b": 0.5 });
    expect(withPortRate(b, "input:item:a", 4)).toEqual({ "input:item:a": 4, "output:item:b": 0.5 });
    expect(withPortRate(b, "input:item:a", undefined)).toEqual({ "output:item:b": 0.5 });
  });

  it("drops the field when none is left, and never stores a non-positive or infinite rate", () => {
    expect(withPortRate({ x: 1 }, "x", undefined)).toBeUndefined();
    expect(withPortRate({ x: 1 }, "y", 0)).toEqual({ x: 1 });
    expect(withPortRate({ x: 1 }, "y", Number.POSITIVE_INFINITY)).toEqual({ x: 1 });
    expect(portRatePatch({ portRates: { x: 1 } }, "x", undefined)).toEqual({ portRates: undefined });
    expect(portRatePatch({}, "x", 3)).toEqual({ portRates: { x: 3 } });
  });
});
