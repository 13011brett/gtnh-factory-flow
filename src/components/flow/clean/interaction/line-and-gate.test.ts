import { afterEach, describe, expect, it } from "vitest";
import { Position } from "@xyflow/react";
import { verdictPath } from "./CleanVerdictLine";
import { restLeave, restRemaining } from "./rest-gate";
import { setRestWait } from "./rest-tracker";

describe("the wire in hand's line", () => {
  it("bends at the midpoint, never closer than 16 px to its own port", () => {
    expect(verdictPath({ x: 0, y: 0, position: Position.Right }, { x: 200, y: 50 })).toBe("M0,0 H100 V50 H200");
    expect(verdictPath({ x: 0, y: 0, position: Position.Right }, { x: 10, y: 50 })).toBe("M0,0 H16 V50 H10");
  });

  it("is mirrored for a port on the left", () => {
    expect(verdictPath({ x: 200, y: 0, position: Position.Left }, { x: 0, y: 50 })).toBe("M200,0 H100 V50 H0");
    expect(verdictPath({ x: 200, y: 0, position: Position.Left }, { x: 190, y: 50 })).toBe("M200,0 H184 V50 H190");
  });
});

describe("the rest gate of the older tooltips", () => {
  afterEach(() => {
    setRestWait(0);
    restLeave();
  });

  it("shows at once where waiting is off (classic boards)", () => {
    setRestWait(0);
    expect(restRemaining({} as Element)).toBe(0);
  });

  it("waits on a plan-mode board and starts again on another root", () => {
    setRestWait(800);
    const a = {} as Element;
    const b = {} as Element;
    const first = restRemaining(a);
    expect(first).toBeGreaterThan(700);
    expect(restRemaining(a)).toBeLessThanOrEqual(first);
    expect(restRemaining(b)).toBeGreaterThan(700);
    restLeave();
    expect(restRemaining(b)).toBeGreaterThan(700);
  });
});
