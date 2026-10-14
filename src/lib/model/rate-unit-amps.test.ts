import { afterEach, describe, expect, it } from "vitest";
import {
  powerDisplayFromEuT,
  powerDisplaySuffix,
  rateMultiplierForKind,
  rateSuffixForKind,
  setActivePowerDisplayUnit,
} from "./rate-unit";

afterEach(() => setActivePowerDisplayUnit("eu"));

describe("the Amps key (the mod's): each card counts in its own tier", () => {
  it("a card's EU/t becomes amps of its own machine's tier", () => {
    setActivePowerDisplayUnit("amps");
    expect(powerDisplayFromEuT(1920, "HV")).toBe(1920 / 512);
    expect(powerDisplayFromEuT(1920, "LV")).toBe(1920 / 32);
    expect(powerDisplaySuffix("HV")).toBe("A HV");
    expect(powerDisplaySuffix("LuV")).toBe("A LuV");
  });

  it("anything with no tier of its own stays in EU/t", () => {
    setActivePowerDisplayUnit("amps");
    expect(powerDisplayFromEuT(1920)).toBe(1920);
    expect(powerDisplaySuffix()).toBe("EU/t");
    expect(powerDisplaySuffix("nonsense")).toBe("EU/t");
    expect(rateSuffixForKind("power")).toBe(" EU/t");
    expect(rateMultiplierForKind("power")).toBe(1 / 20);
  });

  it("EU/t mode ignores the tier", () => {
    expect(powerDisplayFromEuT(1920, "HV")).toBe(1920);
    expect(powerDisplaySuffix("HV")).toBe("EU/t");
  });
});
