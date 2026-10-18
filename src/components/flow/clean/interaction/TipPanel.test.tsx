// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, expect, it } from "vitest";
import { writeDeviceSettings } from "@/lib/device-settings";
import { TipPanel } from "./TipPanel";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  cleanup();
  act(() => writeDeviceSettings({ scrollChangesValues: true }));
});

const spec = {
  id: "t",
  title: "Count",
  actions: [
    { input: "left" as const, label: "Type a value" },
    { input: "wheel" as const, label: "Step" },
  ],
};
const actionLabels = (container: HTMLElement) =>
  [...container.querySelectorAll(".tp-action")].map((element) => element.textContent);

it("lists the wheel step while the wheel changes values, and drops it when it does not", () => {
  expect(actionLabels(render(<TipPanel spec={spec} />).container)).toEqual([
    "Type a value",
    "Step",
  ]);
  cleanup();
  act(() => writeDeviceSettings({ scrollChangesValues: false }));
  expect(actionLabels(render(<TipPanel spec={spec} />).container)).toEqual(["Type a value"]);
});
