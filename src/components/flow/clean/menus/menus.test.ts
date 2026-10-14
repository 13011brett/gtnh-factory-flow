// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest";
import { nextFasterAmps, MAX_AMPS, type PowerRun } from "./power-facts";
import { isPinned, steppedOption, toggledPins, type SettingControl } from "./settings-model";
import { rememberSetting } from "@/lib/model/setting-memory";
import { countRowsTip, stripTip } from "./card-tips";
import type { CleanCardView, CleanChipView } from "../clean-model";

const run = (duration: number, parallels: number, amps: number): PowerRun => ({
  duration,
  parallels,
  eut: amps * 30,
  runsPerSecond: (parallels * 20) / duration,
});

it("finds the next amp count that runs faster, and none past the one-tick floor", () => {
  // Overclocks every 4 amps: 120 ticks at 1A, 60 at 4A, 30 at 16A, floor 1 tick.
  const at = (amps: number) => run(Math.max(1, 120 / 2 ** Math.floor(Math.log(Math.max(1, amps)) / Math.log(4))), 1, amps);
  expect(nextFasterAmps(at, 1)?.amps).toBe(4);
  expect(nextFasterAmps(at, 4)?.amps).toBe(16);
  expect(nextFasterAmps(() => run(1, 1, 1), 1)).toBeUndefined();
  expect(MAX_AMPS).toBe(16_777_216);
});

const control = (id: string, pinDefault: boolean, keys = ["a", "b", "c"], current = "a"): SettingControl => ({
  id,
  group: "Machine",
  label: id,
  value: current,
  warn: false,
  options: keys.map((key) => ({ key, label: key })),
  currentKey: current,
  pinDefault,
});

it("pins default to the coil, then follow the plan's own list per machine", () => {
  const coil = control("heatingCoil", true);
  const other = control("x", false);
  expect(isPinned({}, "ebf", coil)).toBe(true);
  expect(isPinned({}, "ebf", other)).toBe(false);
  expect(toggledPins({}, "ebf", [coil, other], "x")).toEqual(["heatingCoil", "x"]);
  expect(toggledPins({ settingPins: { ebf: ["heatingCoil", "x"] } }, "ebf", [coil, other], "heatingCoil")).toEqual(["x"]);
  expect(isPinned({ settingPins: { ebf: [] } }, "ebf", coil)).toBe(false);
  expect(isPinned({ settingPins: { ebf: [] } }, "other", coil)).toBe(true);
});

it("steps through valid options and wraps", () => {
  expect(steppedOption(control("x", false, ["a", "b", "c"], "c"), 1)?.key).toBe("a");
  expect(steppedOption(control("x", false, ["a", "b", "c"], "a"), -1)?.key).toBe("c");
  expect(steppedOption(control("x", false, ["a"]), 1)).toBeUndefined();
});

beforeEach(() => window.localStorage.clear());

it("remembers a machine's setting in the browser, never the parallels", () => {
  rememberSetting("ebf", "heatingCoil", "nichrome");
  rememberSetting("ebf", "machineParallel", "9");
  const stored = JSON.parse(window.localStorage.getItem("gtnh-factory-flow.setting-memory.v1")!);
  expect(stored).toEqual({ "ebf|heatingCoil": "nichrome" });
});

const view = (count: Partial<CleanCardView["count"]>): CleanCardView =>
  ({
    nodeId: "n",
    name: "M",
    count: { text: "×0.001", pinned: false, zero: false, note: "", value: 0.001, title: "", ...count },
  }) as CleanCardView;

it("count tip carries the mod's rows", () => {
  const tip = countRowsTip(view({}), false);
  expect(tip.title).toBe("Required machines");
  expect(tip.rows?.map((r) => r.label)).toEqual(["Calculated", "Whole machines", "Average utilization"]);
  expect(tip.actions?.map((a) => a.label)).toEqual(["Pin count", "+1 / -1"]);
  const pinned = countRowsTip(view({ pinned: true, text: "×3", value: 3 }), false);
  expect(pinned.title).toBe("Pinned machines");
  expect(pinned.rows).toEqual([{ label: "Pinned", value: "×3" }]);
  expect(pinned.actions?.[0]?.label).toBe("Change or unpin");
});

it("strip chip tip: Set to, coil need, pinned note, gestures", () => {
  const chip = { id: "heatingCoil", label: "Heating Coil", value: "Kanthal", title: "", x: 0, y: 0, width: 0 } as CleanChipView;
  const tip = stripTip("n", chip, control("heatingCoil", true), 2140);
  expect(tip.rows).toEqual([
    { label: "Set to", value: "Kanthal" },
    { label: "Recipe needs", value: "2140 K" },
  ]);
  expect(tip.notes?.at(-1)?.text).toBe("Pinned to the card: unpin it in the settings.");
  expect(tip.actions?.map((a) => a.label)).toEqual(["Choose", "Step back", "Step"]);
});
