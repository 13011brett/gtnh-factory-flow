// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useFactoryStore } from "@/store/factory-store";
import { useDesignStore } from "@/store/design-store";
import { writeWorkspaceView } from "@/lib/workspace-view";
import { OPEN_FEEDBACK_EVENT } from "./chrome-events";
import { ModBar } from "./ModBar";
import { registerBoardCommands } from "./board-commands";

vi.mock("@/lib/compact-view", () => ({ isCompactViewport: () => false, useIsCompactViewport: () => false }));

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

const noop = () => undefined;
function renderBar(overrides: Partial<Parameters<typeof ModBar>[0]> = {}) {
  return render(
    <ModBar onShare={noop} onScreenshot={noop} onSettings={noop} onChangelog={noop} onDevMenu={noop} unreadNotes={false} {...overrides} />,
  );
}
const key = (id: string) => document.querySelector<HTMLElement>(`[data-mb="${id}"]`)!;

beforeEach(() => {
  window.localStorage.clear();
  useFactoryStore.setState({ rateUnit: "second", powerDisplayUnit: "eu", undoHistory: [], redoHistory: [], isReadOnly: false });
  useDesignStore.setState({ designs: [], publicViews: [], activeDesignId: undefined });
  writeWorkspaceView({ averageMachineDraw: true });
});
afterEach(() => cleanup());

describe("the mod's top bar", () => {
  it("every key is in the Tab order (a disabled one is not) and Enter or Space presses it", () => {
    renderBar();
    for (const id of ["nonrecipe", "arrange", "fit", "rate", "power", "peak", "library", "share", "feedback", "settings", "help"]) {
      expect(key(id).getAttribute("tabindex"), id).toBe("0");
    }
    expect(key("undo").getAttribute("tabindex")).toBe("-1");
    key("rate").focus();
    fireEvent.keyDown(key("rate"), { key: "Enter" });
    expect(useFactoryStore.getState().rateUnit).toBe("minute");
    fireEvent.keyDown(key("rate"), { key: " " });
    expect(useFactoryStore.getState().rateUnit).toBe("hour");
  });

  it("has the keys in the mod's order", () => {
    renderBar();
    const order = [...document.querySelectorAll("[data-mb]")].map((element) => element.getAttribute("data-mb"));
    expect(order).toEqual([
      "nonrecipe", "undo", "redo", "arrange", "fit", "rate", "power", "peak", "library", "share", "feedback", "settings", "help",
    ]);
    expect(key("arrange").textContent).toBe("Arrange");
    expect(key("rate").textContent).toBe("/s");
    expect(key("power").textContent).toBe("EU/t");
    expect(key("peak").textContent).toBe("Avg");
    expect(key("library").textContent).toBe("Library");
    expect(key("nonrecipe").textContent).toBe("Non-recipe");
  });

  it("the rate unit goes round /t /s /min /hr on a click or the wheel, and back on a right-click", () => {
    renderBar();
    const rate = key("rate");
    fireEvent.click(rate);
    expect(useFactoryStore.getState().rateUnit).toBe("minute");
    expect(rate.textContent).toBe("/min");
    fireEvent.click(rate);
    expect(useFactoryStore.getState().rateUnit).toBe("hour");
    fireEvent.click(rate);
    expect(useFactoryStore.getState().rateUnit).toBe("tick");
    fireEvent.contextMenu(rate);
    expect(useFactoryStore.getState().rateUnit).toBe("hour");
    fireEvent.wheel(rate, { deltaY: -100 });
    expect(useFactoryStore.getState().rateUnit).toBe("tick");
    fireEvent.wheel(rate, { deltaY: 100 });
    expect(useFactoryStore.getState().rateUnit).toBe("hour");
  });

  it("EU/t becomes Amps at the tier most machines run at, and Avg and Peak swap", () => {
    renderBar();
    fireEvent.click(key("power"));
    expect(key("power").textContent).toBe("Amps");
    expect(useFactoryStore.getState().powerDisplayUnit).not.toBe("eu");
    fireEvent.click(key("power"));
    expect(key("power").textContent).toBe("EU/t");
    expect(useFactoryStore.getState().powerDisplayUnit).toBe("eu");

    expect(key("peak").textContent).toBe("Avg");
    fireEvent.click(key("peak"));
    expect(key("peak").textContent).toBe("Peak");
    fireEvent.contextMenu(key("peak"));
    expect(key("peak").textContent).toBe("Avg");
  });

  it("Arrange and Fit call the board, and Arrange says what it is doing", () => {
    const calls: string[] = [];
    const off = registerBoardCommands({ arrange: () => calls.push("arrange"), cancelArrange: () => calls.push("cancel"), fit: () => calls.push("fit") });
    renderBar();
    fireEvent.click(key("fit"));
    fireEvent.click(key("arrange"));
    expect(calls).toEqual(["fit", "arrange"]);
    off();
  });

  it("Undo and Redo are greyed until there is something to do", () => {
    renderBar();
    expect(key("undo").hasAttribute("data-off")).toBe(true);
    expect(key("redo").hasAttribute("data-off")).toBe(true);
    act(() => {
      useFactoryStore.setState({ undoHistory: [useFactoryStore.getState().project] });
    });
    expect(key("undo").hasAttribute("data-off")).toBe(false);
  });

  it("the Share key opens its menu: Share to library, Copy plan code, Screenshot", () => {
    renderBar();
    fireEvent.click(key("share"));
    const rows = [...document.querySelectorAll('[role="menu"] [role="menuitem"] .mm-label')].map((element) => element.textContent);
    expect(rows).toEqual(["Share to library...", "Copy plan code", "Export plan file (.json)", "Screenshot..."]);
  });

  it("the Help key opens the tour, the controls list and the website's own links", () => {
    renderBar();
    fireEvent.click(key("help"));
    const rows = [...document.querySelectorAll('[role="menu"] [role="menuitem"] .mm-label')].map((element) => element.textContent);
    expect(rows.slice(0, 2)).toEqual(["Take the tour", "Controls and shortcuts"]);
    fireEvent.click(screen.getByText("Controls and shortcuts"));
    expect(screen.getByRole("dialog", { name: "How the board works" })).toBeTruthy();
    expect(document.querySelectorAll(".mc-controls-row")).toHaveLength(19);
  });

  it("the Help menu's Download the mod opens the mod's newest release", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    renderBar();
    fireEvent.click(key("help"));
    fireEvent.click(screen.getByText("Download the mod"));
    expect(open).toHaveBeenCalledWith("https://github.com/jackwrichards/gtnh-planner-mod/releases/latest", "_blank", "noopener,noreferrer");
    open.mockRestore();
  });

  it("the Feedback key knocks on the feedback door, and a part that answers takes it", () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    renderBar();
    fireEvent.click(key("feedback"));
    expect(open).toHaveBeenCalledTimes(1);
    const heard = vi.fn((event: Event) => event.preventDefault());
    window.addEventListener(OPEN_FEEDBACK_EVENT, heard);
    fireEvent.click(key("feedback"));
    expect(heard).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
    window.removeEventListener(OPEN_FEEDBACK_EVENT, heard);
    open.mockRestore();
  });

  it("the Non-recipe key opens the picker and closes it again", () => {
    renderBar();
    fireEvent.click(key("nonrecipe"));
    expect(useFactoryStore.getState().powerMenuOpen).toBe(true);
    fireEvent.click(key("nonrecipe"));
    expect(useFactoryStore.getState().powerMenuOpen).toBe(false);
  });

  it("every key carries a tip for the tip host", () => {
    renderBar();
    for (const id of ["nonrecipe", "undo", "redo", "arrange", "fit", "rate", "power", "peak", "library", "share", "feedback", "settings", "help"]) {
      expect(key(id).getAttribute("data-tip-id"), id).toBe(`bar|${id}`);
      expect(JSON.parse(key(id).getAttribute("data-tip")!).title.length).toBeGreaterThan(3);
    }
  });
});
