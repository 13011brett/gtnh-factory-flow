import { describe, expect, it } from "vitest";
import type { PowerSourceDefinition } from "@/lib/power/types";
import {
  powerSettingRows,
  powerSettingValue,
  powerStripRows,
  powerTierChip,
  steppedPowerValue,
} from "./power-settings";

const source = {
  id: "test-turbine",
  name: "Test Turbine",
  group: "turbines",
  unlock: "EV",
  blurb: "",
  settings: [
    {
      type: "select",
      id: "tier",
      label: "Tier",
      defaultKey: "LV",
      options: [
        { key: "LV", label: "LV" },
        { key: "MV", label: "MV" },
        { key: "HV", label: "HV" },
      ],
    },
    {
      type: "select",
      id: "fuel",
      label: "Fuel",
      defaultKey: "a",
      options: [
        { key: "a", label: "Diesel" },
        { key: "b", label: "Gasoline" },
      ],
    },
    {
      type: "number",
      id: "flow",
      label: "Flow",
      min: 0,
      max: 10,
      step: 2,
      defaultValue: 4,
      unit: "L/t",
      enabledWhen: { settingId: "mode", equals: "custom" },
    },
    {
      type: "select",
      id: "mode",
      label: "Mode",
      defaultKey: "optimal",
      options: [
        { key: "optimal", label: "Optimal" },
        { key: "custom", label: "Custom" },
      ],
    },
    { type: "toggle", id: "boost", label: "Boost", defaultOn: false },
  ],
  compute: () => ({ euPerTick: 0, inputs: [], outputs: [], stats: [] }),
} as unknown as PowerSourceDefinition;

describe("a generator's settings as the card shows them", () => {
  it("reads defaults, values and the words for them", () => {
    const rows = powerSettingRows(source, { fuel: "b", boost: "1" });
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    expect(byId.fuel!.value).toBe("Gasoline");
    expect(byId.fuel!.changed).toBe(true);
    expect(byId.boost!.value).toBe("On");
    expect(byId.tier!.changed).toBe(false);
    expect(byId.flow!.value).toBe("4 L/t");
  });

  it("greys a setting another setting switches off", () => {
    const off = powerSettingRows(source, {}).find((row) => row.id === "flow")!;
    expect(off.enabled).toBe(false);
    const on = powerSettingRows(source, { mode: "custom" }).find((row) => row.id === "flow")!;
    expect(on.enabled).toBe(true);
    expect(powerSettingValue(source, { mode: "custom" }, "mode")).toBe("custom");
  });

  it("shows only what is pinned and in play on the strip, never the tier (it is a header chip)", () => {
    const rows = powerSettingRows(source, { mode: "custom" });
    expect(powerStripRows(rows, []).length).toBe(0);
    expect(powerStripRows(rows, ["fuel", "flow", "boost", "tier"]).map((row) => row.id)).toEqual([
      "fuel",
      "flow",
      "boost",
    ]);
    const idle = powerSettingRows(source, {});
    expect(powerStripRows(idle, ["flow"]).length).toBe(0);
  });

  it("has a tier chip only when the source has a tier select", () => {
    expect(powerTierChip(source, { tier: "MV" })).toEqual({
      label: "MV",
      fixed: false,
      options: ["LV", "MV", "HV"],
    });
    const noTier = { ...source, settings: source.settings.slice(1) } as PowerSourceDefinition;
    expect(powerTierChip(noTier, {})).toBeUndefined();
  });

  it("steps a select round, a number to its ends, a toggle over, the tier without wrapping", () => {
    const rows = powerSettingRows(source, { tier: "HV", fuel: "b", mode: "custom", flow: "10" });
    const row = (id: string) => rows.find((entry) => entry.id === id)!;
    expect(steppedPowerValue(row("fuel"), 1)).toBe("a");
    expect(steppedPowerValue(row("tier"), 1)).toBeUndefined();
    expect(steppedPowerValue(row("tier"), -1)).toBe("MV");
    expect(steppedPowerValue(row("flow"), 1)).toBeUndefined();
    expect(steppedPowerValue(row("flow"), -1)).toBe("8");
    expect(steppedPowerValue(row("boost"), 1)).toBe("1");
  });
});
