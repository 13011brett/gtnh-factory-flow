// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignSummary } from "@/lib/designs/design-library";
import { readLibraryTabState, openLibrary } from "@/lib/library/library-tab";
import { useDesignStore } from "@/store/design-store";
import { ModTabs } from "./ModTabs";

vi.mock("@/lib/compact-view", () => ({ isCompactViewport: () => false }));

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

function design(id: string, name: string, extra: Partial<DesignSummary> = {}): DesignSummary {
  return { id, name, createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", ...extra };
}

const actions = {
  switchToDesign: vi.fn(async () => undefined),
  addDesign: vi.fn(async () => undefined),
  closeDesigns: vi.fn(async () => undefined),
  removeDesign: vi.fn(async () => undefined),
  renameDesign: vi.fn(async () => undefined),
};

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  for (const fn of Object.values(actions)) fn.mockClear();
  useDesignStore.setState({
    designs: [design("a", "Benzene"), design("b", "ref-chain"), design("c", "Parked", { closed: true })],
    publicViews: [],
    publicView: undefined,
    activeDesignId: "b",
    ...actions,
  });
});
afterEach(() => cleanup());

const props = { onPaste: vi.fn(), onShare: vi.fn() };
const rows = () => [...document.querySelectorAll('[role="menu"] [role="menuitem"]')].map((element) => element.textContent);

describe("the plan tabs", () => {
  it("shows one tab per open plan, the active one marked, and leaves the parked plan on the shelf", () => {
    render(<ModTabs {...props} />);
    const tabs = [...document.querySelectorAll(".mt-tab")];
    expect(tabs.map((tab) => tab.querySelector(".mt-name")?.textContent)).toEqual(["Benzene", "ref-chain"]);
    expect(tabs[1].hasAttribute("data-active")).toBe(true);
    expect(tabs[0].hasAttribute("data-active")).toBe(false);
  });

  it("a click switches to the plan, and leaves the library", () => {
    openLibrary();
    render(<ModTabs {...props} />);
    fireEvent.click(screen.getByText("Benzene"));
    expect(actions.switchToDesign).toHaveBeenCalledWith("a");
    expect(readLibraryTabState().active).toBe(false);
  });

  it("the x and a middle click close it, keeping the plan, and the next tab takes over", () => {
    render(<ModTabs {...props} />);
    fireEvent.click(screen.getByLabelText("Close Benzene"));
    expect(actions.closeDesigns).toHaveBeenCalledWith(["a"], "b");
    fireEvent(screen.getByText("ref-chain").closest(".mt-tab")!, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
    expect(actions.closeDesigns).toHaveBeenLastCalledWith(["b"], "a");
  });

  it("the last tab has no close key", () => {
    useDesignStore.setState({ designs: [design("a", "Benzene")], activeDesignId: "a" });
    render(<ModTabs {...props} />);
    expect(screen.queryByLabelText("Close Benzene")).toBeNull();
  });

  it("right-click opens the menu the mod's tab has, Delete plan last, in red", () => {
    render(<ModTabs {...props} />);
    fireEvent.contextMenu(screen.getByText("ref-chain"));
    expect(rows()).toEqual([
      "Rename",
      "Copy plan codeto paste or share",
      "Share to library...for other players",
      "Close tabkept in My plans",
      "Close other tabskept in My plans",
      "Delete plan",
    ]);
    const last = document.querySelectorAll('[role="menuitem"]');
    expect(last[last.length - 1].getAttribute("data-tone")).toBe("red");
  });

  it("Delete plan asks first and only Delete it deletes", () => {
    render(<ModTabs {...props} />);
    fireEvent.contextMenu(screen.getByText("ref-chain"));
    fireEvent.click(screen.getByText("Delete plan"));
    expect(actions.removeDesign).not.toHaveBeenCalled();
    expect(document.querySelector(".mm-title")?.textContent).toBe("Delete 'ref-chain' for good?");
    expect(rows()).toEqual(["Delete it", "Keep it"]);
    fireEvent.click(screen.getByText("Keep it"));
    expect(actions.removeDesign).not.toHaveBeenCalled();
    fireEvent.contextMenu(screen.getByText("ref-chain"));
    fireEvent.click(screen.getByText("Delete plan"));
    fireEvent.click(screen.getByText("Delete it"));
    expect(actions.removeDesign).toHaveBeenCalledWith("b");
  });

  it("the + menu: New plan, Open a plan, Paste plan, Browse library", () => {
    render(<ModTabs {...props} />);
    fireEvent.click(screen.getByLabelText("New plan"));
    expect(rows()).toEqual(["New plan", "Open a plan...My plans", "Paste plana plan link or code", "Browse librarypublic plans"]);
    fireEvent.click(screen.getByText("Paste plan"));
    expect(props.onPaste).toHaveBeenCalled();
  });

  it("Rename edits the tab in place and Enter commits it", () => {
    render(<ModTabs {...props} />);
    fireEvent.contextMenu(screen.getByText("Benzene"));
    fireEvent.click(screen.getByText("Rename"));
    const field = screen.getByLabelText("Plan name") as HTMLInputElement;
    fireEvent.change(field, { target: { value: "Aniline" } });
    fireEvent.keyDown(field, { key: "Enter" });
    expect(actions.renameDesign).toHaveBeenCalledWith("a", "Aniline");
  });

  it("every tab and the + carry a tip for the tip host", () => {
    render(<ModTabs {...props} />);
    const tab = screen.getByText("Benzene").closest(".mt-tab")!;
    expect(JSON.parse(tab.getAttribute("data-tip")!)).toMatchObject({ title: "Benzene", sub: "Middle-click to close, right-click for more" });
    expect(JSON.parse(screen.getByLabelText("New plan").getAttribute("data-tip")!).title).toBe("New plan, or open an existing one");
  });
});
