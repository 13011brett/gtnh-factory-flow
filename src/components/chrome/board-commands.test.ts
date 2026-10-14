import { afterEach, describe, expect, it, vi } from "vitest";
import {
  arrangeLabel,
  getBoardCommands,
  pressArrange,
  registerBoardCommands,
  reportArrange,
} from "./board-commands";

afterEach(() => reportArrange(undefined, 6));

describe("the bar's commands to the board", () => {
  it("labels Arrange by its progress, never going back, and Stopping once asked", () => {
    const calls: string[] = [];
    const unregister = registerBoardCommands({
      arrange: () => calls.push("arrange"),
      cancelArrange: () => calls.push("cancel"),
      fit: () => calls.push("fit"),
    });
    expect(arrangeLabel({ running: false, fraction: 0, stopping: false })).toBe("Arrange");
    pressArrange();
    expect(calls).toEqual(["arrange"]);

    reportArrange({ step: 2, done: 1, total: 2 }, 6);
    // (2 + 0.5) / 6 = 41.67%
    expect(arrangeLabel({ running: true, fraction: 2.5 / 6, stopping: false })).toBe("Arranging 42%");
    // A later report with less done does not move the bar back.
    reportArrange({ step: 1, done: 0, total: 3 }, 6);
    pressArrange();
    expect(calls).toEqual(["arrange", "cancel"]);
    expect(arrangeLabel({ running: true, fraction: 0.5, stopping: true })).toBe("Stopping");

    reportArrange(undefined, 6);
    pressArrange();
    expect(calls).toEqual(["arrange", "cancel", "arrange"]);
    getBoardCommands()?.fit();
    expect(calls.at(-1)).toBe("fit");
    unregister();
    expect(getBoardCommands()).toBeUndefined();
  });

  it("a press with no board mounted does nothing", () => {
    const spy = vi.fn();
    expect(getBoardCommands()).toBeUndefined();
    expect(() => pressArrange()).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
