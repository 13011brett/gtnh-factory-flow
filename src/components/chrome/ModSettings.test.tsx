// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { readDeviceSettings, resetDeviceSettingsForTests, writeDeviceSettings } from "@/lib/device-settings";
import { DEFAULT_UI_SCALE_PERCENT, UI_SCALE_STORAGE_KEY } from "@/lib/ui-scale-boot";
import { getUiScalePercent } from "@/lib/ui-scale";
import { areBoardSoundsEnabled, getBoardSoundVolume } from "@/lib/board-sounds";
import { OPEN_CONTROLS_EVENT } from "./chrome-events";
import { ModSettings } from "./ModSettings";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});
beforeEach(() => {
  window.localStorage.clear();
  resetDeviceSettingsForTests();
});
afterEach(() => cleanup());

const sections = () => [...document.querySelectorAll(".ms-section")].map((element) => element.textContent);
const rowLabels = () => [...document.querySelectorAll(".ms-row .ms-label")].map((element) => element.textContent);

describe("the settings box", () => {
  it("is a centred box with the mod's sections and a picture beside the rows", () => {
    render(<ModSettings onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Settings" })).toBeTruthy();
    expect(sections()).toEqual(["Board", "Minimap", "Sound", "Controls"]);
    expect(rowLabels()).toEqual(["Size", "Names when zoomed out", "Circuit as an input", "Font"]);
    expect(document.querySelector(".ms-preview .sp-board")).toBeTruthy();
  });

  it("Size is Tiny, Small, Normal or Large, and picking one sets the interface size", () => {
    render(<ModSettings onClose={vi.fn()} />);
    const choices = [...document.querySelectorAll('[role="radiogroup"][aria-label="Size"] .ms-choice')].map((element) => element.textContent);
    expect(choices).toEqual(["Tiny", "Small", "Normal", "Large"]);
    expect(document.querySelector('[aria-label="Size"] [data-picked]')?.textContent).toBe("Normal");
    fireEvent.click(screen.getByText("Large"));
    expect(getUiScalePercent()).toBe(130);
    expect(window.localStorage.getItem(UI_SCALE_STORAGE_KEY)).toBe("130");
    fireEvent.click(screen.getByText("Normal"));
    expect(getUiScalePercent()).toBe(DEFAULT_UI_SCALE_PERCENT);
  });

  it("the switches flip with a click anywhere on the row, and persist in the device settings", () => {
    render(<ModSettings onClose={vi.fn()} />);
    expect(readDeviceSettings().zoomedOutNames).toBe(true);
    fireEvent.click(screen.getByText("Names when zoomed out"));
    expect(readDeviceSettings().zoomedOutNames).toBe(false);
    expect(JSON.parse(window.localStorage.getItem("gtnh-factory-flow.device-settings.v1")!).zoomedOutNames).toBe(false);
    fireEvent.click(screen.getByText("Circuit as an input"));
    expect(readDeviceSettings().circuitAsInput).toBe(false);
    // The picture shows the effect at once.
    expect(document.querySelector(".sp-board")?.hasAttribute("data-circuit")).toBe(false);
    expect(document.querySelector(".sp-board")?.hasAttribute("data-names")).toBe(false);
  });

  it("Minimap is a section of the minimap's own rows", () => {
    render(<ModSettings onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Minimap"));
    const names = [...document.querySelectorAll(".mmap-row-name")].map((element) => (element.firstChild?.textContent ?? "").trim());
    expect(names).toEqual(["Show the minimap", "Size", "Shape", "Position", "Centre on the card you select"]);
  });

  it("opens on the section it was left on", () => {
    const { unmount } = render(<ModSettings onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Sound"));
    expect(document.querySelector(".ms-section[data-picked]")?.textContent).toBe("Sound");
    unmount();
    render(<ModSettings onClose={vi.fn()} />);
    expect(document.querySelector(".ms-section[data-picked]")?.textContent).toBe("Sound");
    expect(rowLabels()).toEqual(["Sounds"]);
  });

  it("Sounds is Off, Quiet, Normal or Loud", () => {
    render(<ModSettings onClose={vi.fn()} />);
    fireEvent.click(screen.getByText("Sound"));
    expect(document.querySelector('[aria-label="Sounds"] [data-picked]')?.textContent).toBe("Normal");
    fireEvent.click(screen.getByText("Off"));
    expect(areBoardSoundsEnabled()).toBe(false);
    fireEvent.click(screen.getByText("Loud"));
    expect(areBoardSoundsEnabled()).toBe(true);
    expect(getBoardSoundVolume()).toBeGreaterThan(0.8);
  });

  it("Controls hands over to the controls list, and Escape and the close key close the box", () => {
    const close = vi.fn();
    render(<ModSettings onClose={close} />);
    fireEvent.click(screen.getByText("Controls"));
    const heard = vi.fn((event: Event) => event.preventDefault());
    window.addEventListener(OPEN_CONTROLS_EVENT, heard);
    vi.useFakeTimers();
    fireEvent.click(screen.getByText("Open"));
    expect(close).toHaveBeenCalledTimes(1);
    vi.runAllTimers();
    expect(heard).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
    window.removeEventListener(OPEN_CONTROLS_EVENT, heard);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(2);
  });

});
