import { afterEach, describe, expect, it } from "vitest";
import { createRestTracker, handFull, onHandChange, setHandHeld, TIP_WAIT_MS } from "./rest-tracker";

describe("the rest wait (the mod's Tip.Wait)", () => {
  it("is 0.8 s", () => {
    expect(TIP_WAIT_MS).toBe(800);
  });

  it("shows only after the pointer has rested on the same thing for the wait", () => {
    const tracker = createRestTracker();
    tracker.point("n1|tier", 0);
    expect(tracker.ready(799)).toBe(false);
    expect(tracker.remaining(500)).toBe(300);
    expect(tracker.ready(800)).toBe(true);
    expect(tracker.remaining(900)).toBe(0);
  });

  it("keeps the wait while the pointer moves about on the same thing", () => {
    const tracker = createRestTracker();
    tracker.point("n1|tier", 0);
    for (let t = 100; t < 800; t += 100) tracker.point("n1|tier", t);
    expect(tracker.ready(800)).toBe(true);
  });

  it("starts again from zero on another thing, even an adjacent control", () => {
    const tracker = createRestTracker();
    tracker.point("n1|tier", 0);
    tracker.point("n1|amps", 700);
    expect(tracker.ready(800)).toBe(false);
    expect(tracker.ready(1500)).toBe(true);
  });

  it("resets on leaving everything and does not quick-show on coming back", () => {
    const tracker = createRestTracker();
    tracker.point("n1|tier", 0);
    tracker.point(undefined, 900);
    expect(tracker.ready(1000)).toBe(false);
    expect(tracker.remaining(1000)).toBe(Number.POSITIVE_INFINITY);
    tracker.point("n1|tier", 1000);
    expect(tracker.ready(1500)).toBe(false);
    expect(tracker.ready(1800)).toBe(true);
  });

  it("can be restarted in place (a press hides the tip and waits again)", () => {
    const tracker = createRestTracker();
    tracker.point("a", 0);
    tracker.restart(700);
    expect(tracker.ready(1000)).toBe(false);
    expect(tracker.ready(1500)).toBe(true);
  });
});

describe("what is in hand", () => {
  afterEach(() => {
    setHandHeld("wire", false);
    setHandHeld("spare", false);
  });

  it("is full while any holder holds and tells listeners when that changes", () => {
    let calls = 0;
    const off = onHandChange(() => {
      calls += 1;
    });
    expect(handFull()).toBe(false);
    setHandHeld("wire", true);
    setHandHeld("spare", true);
    expect(handFull()).toBe(true);
    setHandHeld("wire", false);
    expect(handFull()).toBe(true);
    setHandHeld("spare", false);
    expect(handFull()).toBe(false);
    expect(calls).toBe(4);
    setHandHeld("wire", false);
    expect(calls).toBe(4);
    off();
  });
});
