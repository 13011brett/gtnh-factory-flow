import { describe, expect, it } from "vitest";
import { estimateRecipeCardHeight } from "./card-shell";

const slot = (id: string, kind = "item") => ({ kind, id });

describe("estimateRecipeCardHeight", () => {
  it("is the head and the machine's well for a one-row card", () => {
    expect(estimateRecipeCardHeight({ inputs: [slot("a")], outputs: [slot("b")] }, false)).toBe(
      40 + 120,
    );
  });
  it("grows a row of 40 for each extra port of the longer rail", () => {
    expect(
      estimateRecipeCardHeight(
        { inputs: [slot("a"), slot("b"), slot("c")], outputs: [slot("x")] },
        false,
      ),
    ).toBe(40 + 120);
    expect(
      estimateRecipeCardHeight(
        { inputs: [slot("a")], outputs: [slot("x"), slot("y"), slot("z"), slot("w")] },
        false,
      ),
    ).toBe(40 + 160);
  });
  it("counts the power row on the input rail", () => {
    expect(
      estimateRecipeCardHeight(
        { inputs: [slot("a"), slot("b"), slot("c")], outputs: [slot("x")] },
        true,
      ),
    ).toBe(40 + 160);
  });
  it("counts a resource once however many slots carry it, and a fluid apart from an item of the same id", () => {
    expect(
      estimateRecipeCardHeight(
        { inputs: [slot("a"), slot("a"), slot("a", "fluid")], outputs: [] },
        false,
      ),
    ).toBe(40 + 120);
    expect(
      estimateRecipeCardHeight(
        { inputs: [slot("a"), slot("b"), slot("c"), slot("a", "fluid")], outputs: [] },
        false,
      ),
    ).toBe(40 + 160);
  });
});
