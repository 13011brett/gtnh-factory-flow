import { describe, expect, it } from "vitest";
import { formulaText } from "./formula-lines";
import {
  TGS_FERTILITY,
  TGS_HEIGHT,
  getTgsControls,
  getTgsFormulas,
  getTgsOutputMultiplier,
  getTgsSettings,
  matchTgsTree,
  tgsEuPerTick,
  tgsForestryProduct,
  tgsNeiAmount,
  tgsTier,
  tgsTierMultiplier,
} from "./tree-growth-simulator";
import type { Recipe } from "@/lib/model/types";

// Values from GT5U 5.09.54.205's MTETreeFarm and ForestryMC 4.11.39 (javap), docs/design/bio-vat-and-tgs.md.

const oak: Partial<Recipe> = {
  machineType: "Tree Growth Simulator",
  outputs: [
    { kind: "item", id: "minecraft:log", amount: 5 },
    { kind: "item", id: "minecraft:sapling", amount: 5 },
    { kind: "item", id: "minecraft:leaves", amount: 2 },
    { kind: "item", id: "minecraft:apple", amount: 1 },
  ],
};

describe("Tree Growth Simulator", () => {
  it("multiplies by 2t^2 - 2t + 5 and draws VP[t]", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].map(tgsTierMultiplier)).toEqual([
      5, 9, 17, 29, 45, 65, 89, 117, 149, 185, 225, 269, 317, 369,
    ]);
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(tgsEuPerTick)).toEqual([30, 120, 480, 1920, 7680, 30720, 122880, 491520]);
  });

  it("reads t from the hatches' V x A, rounded up, at least LV", () => {
    expect(tgsTier(32)).toBe(1);
    expect(tgsTier(8)).toBe(1);
    // Two LV hatches of 2 A: 128 EU/t, MV.
    expect(tgsTier(32 * 4)).toBe(2);
    // Three LV hatches: 192 EU/t rounds up to HV.
    expect(tgsTier(32 * 6)).toBe(3);
    expect(tgsTier(8192)).toBe(5);
  });

  it("matches a dataset recipe to its tree, and each output to its mode", () => {
    const match = matchTgsTree(oak);
    expect(match?.tree.sapling.name).toBe("Oak Sapling");
    expect(match?.modes).toEqual(["log", "sapling", "leaves", "fruit"]);
  });

  it("matches by ids when the dataset is missing a mode the pack has", () => {
    // An older export's Common Hazel: no fruit.
    const match = matchTgsTree({
      machineType: "Tree Growth Simulator",
      outputs: [
        { kind: "item", id: "extratrees:log@15", amount: 5 },
        { kind: "item", id: "forestry:sapling", amount: 5 },
        { kind: "item", id: "forestry:leaves", amount: 2 },
      ],
    });
    expect(match?.modes).toEqual(["log", "sapling", "leaves"]);
    expect(match?.tree.forestry).toBeDefined();
  });

  it("scales Oak's outputs by tier and tool", () => {
    const at = (key: string, settings: Record<string, string>, tier: number) =>
      getTgsOutputMultiplier(oak, oak.outputs!.find((output) => output.id === key)!, settings, tier);
    // LV, basic tools: x5 a run (5 NEI logs -> 25).
    expect(at("minecraft:log", {}, 1)).toBe(5);
    // IV, chainsaw: 5 x 45 x 4 = 900 logs a run.
    expect(at("minecraft:log", { tgsLogTool: "log:chainsaw" }, 5) * 5).toBe(900);
    expect(at("minecraft:leaves", { tgsLeavesTool: "leaves:wire_cutter" }, 1) * 2).toBe(20);
    expect(at("minecraft:apple", { tgsFruitTool: "none" }, 8)).toBe(0);
    expect(at("minecraft:apple", { tgsFruitTool: "fruit:multitool" }, 1)).toBe(5);
  });

  it("scales a Forestry sapling by its genes with Java's float maths", () => {
    const sequoia = {
      species: "forestry.treeSequioa",
      height: 1.75,
      girth: 3,
      fertility: 0.025,
      yield: 0.025,
      base: { log: 1, sapling: 1, leaves: 1 },
    };
    const settings = getTgsSettings(undefined, { sapling: { id: "forestry:sapling", name: "Coast Sequoia Sapling" }, outputs: {}, forestry: sequoia });
    // Height 3 x (1.75 - 1) + 1 = 3.25, x girth 3 = 9.75 -> 9 (NEI shows 45).
    expect(tgsForestryProduct(sequoia, "log", settings)).toBe(9);
    // Fertility 0.025 x 10 -> 0.25 -> at least 1.
    expect(tgsForestryProduct(sequoia, "sapling", settings)).toBe(1);
    // Gigantic: 3 x 1 + 1 = 4, x 3 = 12 logs.
    expect(tgsForestryProduct(sequoia, "log", { ...settings, height: 2 })).toBe(12);
    // Highest fertility 0.3 x 10 = 3.0000002 in float -> 3.
    expect(tgsForestryProduct(sequoia, "sapling", { ...settings, fertility: 0.3 })).toBe(3);
    const tree = { sapling: { id: "forestry:sapling", name: "Coast Sequoia Sapling" }, outputs: {}, forestry: sequoia };
    expect(tgsNeiAmount(tree, "log", settings)).toBe(45);
  });

  it("offers a tool per output the tree has, and a Forestry sapling's genes", () => {
    const ids = getTgsControls(oak).map((control) => control.id);
    expect(ids).toEqual(["tgsLogTool", "tgsSaplingTool", "tgsLeavesTool", "tgsFruitTool"]);
    const hazel = getTgsControls({
      machineType: "Tree Growth Simulator",
      outputs: [
        { kind: "item", id: "extratrees:log@15", amount: 5 },
        { kind: "item", id: "forestry:sapling", amount: 5 },
        { kind: "item", id: "forestry:leaves", amount: 2 },
      ],
    });
    expect(hazel.map((control) => control.id)).toEqual([
      "tgsLogTool",
      "tgsSaplingTool",
      "tgsLeavesTool",
      TGS_HEIGHT,
      TGS_FERTILITY,
    ]);
  });

  it("shows its working", () => {
    const lines = getTgsFormulas(oak, { tgsLogTool: "log:chainsaw" }, 8192, 1);
    const text = Object.fromEntries(lines.map((line) => [line.label, `${formulaText(line.math)} = ${line.result}`]));
    expect(text.tier).toBe("8,192 V · 1 A = IV, t = 5");
    expect(text.mult).toBe("2·5^2−2·5+5 = 45x");
    expect(text.logs).toBe("5·45·4 ÷ 5s = 180/s");
    expect(text.fruit).toBe("1·45·1 ÷ 5s = 9/s");
    expect(text.power).toBe("8,192·30/32 = 7,680 EU/t");
  });
});
