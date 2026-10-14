import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { FactoryStorage } from "@/lib/model/types";
import { parseAmountWithSuffix } from "../../rate-rule";
import { drawerMixes } from "../tokens";
import { buildDrawerView, drawerKindFor, formatRateField, supportsCleanDrawer } from "./drawer-model";

function storage(patch: Partial<FactoryStorage> = {}): FactoryStorage {
  return { id: "s", kind: "item", resourceId: "x", displayName: "X", position: { x: 0, y: 0 }, ...patch };
}

describe("which drawers are clean", () => {
  it("draws source, product, byproduct, trash and an unwired drawer", () => {
    for (const role of ["source", "product", "byproduct", "trash", "idle"] as const) {
      expect(supportsCleanDrawer({ kind: "item" }, role)).toBe(true);
    }
  });
  it("leaves power drawers and buffers to the classic card", () => {
    expect(supportsCleanDrawer({ kind: "power" }, "product")).toBe(false);
    expect(supportsCleanDrawer({ kind: "item" }, "buffer")).toBe(false);
  });
  it("folds a byproduct into a product, as the mod does", () => {
    expect(drawerKindFor("byproduct", {})).toBe("product");
    expect(drawerKindFor("idle", { targetPerSecond: -2 })).toBe("source");
    expect(drawerKindFor("idle", {})).toBe("product");
  });
});

describe("the drawer view", () => {
  const base = { label: "Hydrogen", unanchored: false, unmet: false, linked: true };

  it("prints the flow without a sign and the glance pill with one", () => {
    const view = buildDrawerView({ ...base, storage: storage(), role: "source", result: { netPerSecond: -6 } as never });
    expect(view.number).toBe("6");
    expect(view.unit).toBe("/s");
    expect(view.glanceRate).toBe("-6");
    const product = buildDrawerView({ ...base, storage: storage(), role: "product", result: { netPerSecond: 2 } as never });
    expect(product.glanceRate).toBe("+2");
    const idle = buildDrawerView({ ...base, storage: storage(), role: "product", result: { netPerSecond: 0 } as never });
    expect(idle.zero).toBe(true);
    expect(idle.glanceRate).toBe("0");
  });

  it("reads a rule with a number as its mark, and no number as Any", () => {
    const set = buildDrawerView({ ...base, storage: storage({ targetPerSecond: 2, targetMode: "at-most" }), role: "product", result: undefined });
    expect(set.rule).toBe("at-most");
    expect(set.ruleMark).toBe("≤");
    expect(set.target).toEqual({ number: "2", unit: "/s" });
    const none = buildDrawerView({ ...base, storage: storage(), role: "product", result: undefined });
    expect(none.rule).toBe("ignore");
    expect(none.ruleMark).toBe("~");
    expect(none.target).toBeUndefined();
    expect(none.boxText).toBe("Set");
  });

  it("a byproduct reads as Any whatever rule is stored", () => {
    const view = buildDrawerView({ ...base, storage: storage({ targetPerSecond: 2, targetMode: "at-least" }), role: "byproduct", result: undefined });
    expect(view.rule).toBe("ignore");
  });

  it("prompts with Set rate only where nothing sets the plan", () => {
    const asked = buildDrawerView({ ...base, storage: storage(), role: "source", result: undefined, unanchored: true });
    expect(asked.prompt).toBe(true);
    expect(asked.boxText).toBe("Set rate");
    const set = buildDrawerView({ ...base, storage: storage({ targetPerSecond: -1, targetMode: "exact" }), role: "source", result: undefined, unanchored: true });
    expect(set.prompt).toBe(false);
  });

  it("trash says Voided and has no progress", () => {
    const view = buildDrawerView({ ...base, storage: storage({ drainMode: "trash" }), role: "trash", result: { netPerSecond: 1 } as never });
    expect(view.boxText).toBe("Voided");
    expect(view.hasRule).toBe(false);
    expect(view.progress).toBeUndefined();
  });

  it("reports how far the rate has got, and calm for an at-most limit", () => {
    const view = buildDrawerView({ ...base, storage: storage({ targetPerSecond: 4, targetMode: "at-most" }), role: "product", result: { netPerSecond: 1 } as never });
    expect(view.progress).toBe(0.25);
    expect(view.tone).toBe("calm");
    const over = buildDrawerView({ ...base, storage: storage({ targetPerSecond: 1, targetMode: "at-least" }), role: "product", result: { netPerSecond: 3 } as never });
    expect(over.progress).toBe(1);
  });

  it("shortens big figures the way the box does", () => {
    expect(formatRateField(2500, "item")).toBe("2.5k");
    expect(formatRateField(3_000_000, "item")).toBe("3M");
  });
});

describe("the rate shorthand", () => {
  it("reads 2.5k, 1M and fractions", () => {
    expect(parseAmountWithSuffix("2.5k")).toBe(2500);
    expect(parseAmountWithSuffix("1M")).toBe(1_000_000);
    expect(parseAmountWithSuffix("1/3")).toBeCloseTo(0.3333333, 6);
    expect(parseAmountWithSuffix("2.5k/2")).toBe(1250);
    expect(parseAmountWithSuffix("1/0")).toBeUndefined();
    expect(parseAmountWithSuffix("1/2/3")).toBeUndefined();
    expect(parseAmountWithSuffix("abc")).toBeUndefined();
  });
});

describe("drawer.css", () => {
  const css = readFileSync(join(__dirname, "drawer.css"), "utf8").toLowerCase();
  for (const kind of ["source", "product", "trash"] as const) {
    it(`${kind}'s colours are the tokens' mixes`, () => {
      const mixes = drawerMixes(kind);
      const block = css.slice(css.indexOf(`.cd[data-kind="${kind}"] {`));
      const rule = block.slice(0, block.indexOf("}"));
      expect(rule).toContain(`--cd-frame: ${mixes.frameEdge.toLowerCase()}`);
      expect(rule).toContain(`--cd-edge: ${mixes.edge.toLowerCase()}`);
      expect(rule).toContain(`--cd-bar: ${mixes.barFill.toLowerCase()}`);
      expect(rule).toContain(`--cd-body: ${mixes.bodyFill.toLowerCase()}`);
      expect(rule).toContain(`--cd-stripe: ${mixes.stripe.toLowerCase()}`);
      expect(rule).toContain(`--cd-glance: ${mixes.glanceFill.toLowerCase()}`);
      expect(rule).toContain(`--cd-name: ${mixes.nameInk.toLowerCase()}`);
    });
  }
});
