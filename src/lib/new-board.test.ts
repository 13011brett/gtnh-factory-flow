import { afterEach, describe, expect, it } from "vitest";
import { createEmptyProject } from "@/examples";
import { getNewBoard, setNewBoard, subscribeNewBoard, withNewBoardDefault } from "./new-board";

describe("the New board device setting", () => {
  afterEach(() => setNewBoard(false));

  it("is off by default and leaves new designs as they were", () => {
    expect(getNewBoard()).toBe(false);
    expect(withNewBoardDefault(createEmptyProject()).planMode).toBeUndefined();
  });

  it("only sets the default for new designs, with both flags", () => {
    setNewBoard(true);
    const fresh = withNewBoardDefault(createEmptyProject());
    expect(fresh.planMode).toBe(true);
    expect(fresh.solveMode).toBe(true);
  });

  it("notifies listeners", () => {
    let calls = 0;
    const off = subscribeNewBoard(() => {
      calls += 1;
    });
    setNewBoard(true);
    off();
    setNewBoard(false);
    expect(calls).toBe(1);
  });
});
