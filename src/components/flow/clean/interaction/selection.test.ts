import { describe, expect, it } from "vitest";
import type { FactoryNode, Recipe } from "@/lib/model/types";
import { canCombineSelection, type CombineDeps } from "./selection";

const card = (id: string, recipeId: string) => ({ id, recipeId }) as unknown as FactoryNode;
const recipe = (id: string, kind = "normal") => ({ id, kind }) as unknown as Recipe;

/** Cards run on the machines named in their recipe id, "a+b" meaning machines a and b. */
const deps: CombineDeps = {
  handlersOf: (node) => node.recipeId.split("+").map((id) => ({ id })),
  excluded: (r) => (r as unknown as { kind: string }).kind === "power",
};

const project = {
  nodes: [card("n1", "x+y"), card("n2", "y+z"), card("n3", "z"), card("n4", "pw")],
  recipes: [recipe("x+y"), recipe("y+z"), recipe("z"), recipe("pw", "power")],
};

describe("Combine N into one machine", () => {
  it("needs two or more cards", () => {
    expect(canCombineSelection(project, [], deps)).toBe(false);
    expect(canCombineSelection(project, ["n1"], deps)).toBe(false);
  });

  it("is on when one machine runs every selected recipe", () => {
    expect(canCombineSelection(project, ["n1", "n2"], deps)).toBe(true);
  });

  it("is off when no machine runs them all", () => {
    expect(canCombineSelection(project, ["n1", "n3"], deps)).toBe(false);
    expect(canCombineSelection(project, ["n1", "n2", "n3"], deps)).toBe(false);
  });

  it("is off when a drawer, board or note is in the selection (not a selection of cards)", () => {
    expect(canCombineSelection(project, ["n1", "n2", "drawer-1"], deps)).toBe(false);
  });

  it("is off for cards that have no shared machine (power, crops, custom rate)", () => {
    expect(canCombineSelection(project, ["n2", "n4"], deps)).toBe(false);
  });
});
