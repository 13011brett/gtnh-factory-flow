// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useFactoryStore } from "@/store/factory-store";
import { useDesignStore } from "@/store/design-store";
import { writeWorkspaceView } from "@/lib/workspace-view";
import { OPEN_FEEDBACK_EVENT } from "./chrome-events";
import { ModBar } from "./ModBar";
import { useCommunityAuthStore } from "@/store/community-auth-store";
import { readLibraryTabState } from "@/lib/library/library-tab";

vi.mock("@/lib/compact-view", () => ({ isCompactViewport: () => false, useIsCompactViewport: () => false }));
const modLink = vi.hoisted(() => ({
  findModGame: vi.fn(),
  localNetworkPermission: vi.fn(),
  sendPlanToMod: vi.fn(),
}));
vi.mock("@/lib/mod-link/mod-link", () => modLink);
const clipboard = vi.hoisted(() => ({ copyToClipboard: vi.fn() }));
vi.mock("@/lib/clipboard", () => clipboard);
// jsdom has no CompressionStream; the code itself is plan-code.test.ts's.
vi.mock("@/lib/import-export/plan-code", async (original) => ({
  ...(await original<typeof import("@/lib/import-export/plan-code")>()),
  encodePlanCode: vi.fn(async () => "gtnh1.TEST"),
}));

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
  vi.clearAllMocks();
  modLink.localNetworkPermission.mockResolvedValue("unknown");
  modLink.findModGame.mockResolvedValue(undefined);
  modLink.sendPlanToMod.mockResolvedValue(false);
  clipboard.copyToClipboard.mockResolvedValue(true);
  window.localStorage.clear();
  useFactoryStore.setState({ rateUnit: "second", powerDisplayUnit: "eu", undoHistory: [], redoHistory: [], isReadOnly: false });
  useDesignStore.setState({ designs: [], publicViews: [], activeDesignId: undefined });
  writeWorkspaceView({ averageMachineDraw: true });
  useCommunityAuthStore.setState({ user: undefined, hasHydrated: true });
});
afterEach(() => cleanup());

describe("the mod's top bar", () => {
  it("every key is in the Tab order and Enter or Space presses it", () => {
    renderBar();
    for (const id of ["share", "plans", "community", "account", "feedback", "settings", "help"]) {
      expect(key(id).getAttribute("tabindex"), id).toBe("0");
    }
    key("plans").focus();
    fireEvent.keyDown(key("plans"), { key: "Enter" });
    expect(readLibraryTabState().active).toBe(true);
    fireEvent.keyDown(key("plans"), { key: " " });
    expect(readLibraryTabState().active).toBe(false);
  });

  it("holds the account's keys only, in order: Share, Plans, Community, the account, feedback, settings, help", () => {
    renderBar();
    const order = [...document.querySelectorAll("[data-mb]")].map((element) => element.getAttribute("data-mb"));
    expect(order).toEqual(["share", "plans", "community", "account", "feedback", "settings", "help"]);
    expect(key("plans").textContent).toBe("Plans");
    expect(key("account").textContent).toBe("Sign in");
  });

  it("the account key is the account's face once signed in, with a menu of the username and Sign out", () => {
    useCommunityAuthStore.setState({ user: { username: "ann_smith" }, hasHydrated: true });
    renderBar();
    expect(key("account").textContent).toBe("AS");
    fireEvent.click(key("account"));
    const rows = [...document.querySelectorAll('[role="menu"] [role="menuitem"] .mm-label')].map((element) => element.textContent);
    expect(rows).toEqual(["ann_smith", "Sign out"]);
  });

  const shareRows = () =>
    [...document.querySelectorAll('[role="menu"] [role="menuitem"] .mm-label')].map((element) => element.textContent);
  const shareRow = (label: string) =>
    [...document.querySelectorAll<HTMLElement>('[role="menu"] [role="menuitem"]')].find(
      (row) => row.querySelector(".mm-label")?.textContent === label,
    )!;
  const openShare = async () => {
    await act(async () => {
      fireEvent.click(key("share"));
    });
  };

  it("the Share key opens its menu in the mod's words: Save to library, the link, the code, the file, the game, a picture", async () => {
    renderBar();
    await openShare();
    expect(shareRows()).toEqual([
      "Copy plan link",
      "Copy plan code",
      "Export plan file",
      "Screenshot...",
      "Open in the game",
      "Post a copy to Community...",
    ]);
  });

  it("a plan already posted offers Update in library and Save as new post, each opening the dialog for it", async () => {
    const onShare = vi.fn();
    useFactoryStore.setState({
      project: { ...useFactoryStore.getState().project, metadata: { communityPlanId: "post-1" } },
    });
    renderBar({ onShare });
    await openShare();
    expect(shareRows().slice(-2)).toEqual(["Update my post...", "Post a new copy..."]);
    fireEvent.click(shareRow("Post a new copy..."));
    expect(onShare).toHaveBeenCalledWith("new");
  });

  it("Open in the mod is greyed with a tip while no game answers", async () => {
    renderBar();
    await openShare();
    const row = shareRow("Open in the game");
    expect(row.getAttribute("aria-disabled")).toBe("true");
    expect(row.getAttribute("data-tip")).toContain("Start the game with GTNH Planner installed");
    fireEvent.click(row);
    expect(modLink.sendPlanToMod).not.toHaveBeenCalled();
  });

  it("Open in the mod sends the plan to the game that answered", async () => {
    modLink.findModGame.mockResolvedValue({ port: 25641, version: "0.2.0" });
    modLink.sendPlanToMod.mockResolvedValue(true);
    renderBar();
    await openShare();
    const row = shareRow("Open in the game");
    expect(row.getAttribute("aria-disabled")).toBeNull();
    await act(async () => {
      fireEvent.click(row);
    });
    await vi.waitFor(() => expect(modLink.sendPlanToMod).toHaveBeenCalled());
    const [code, , game] = modLink.sendPlanToMod.mock.calls[0];
    expect(code).toMatch(/^gtnh1\./);
    expect(game).toEqual({ port: 25641, version: "0.2.0" });
    expect(clipboard.copyToClipboard).not.toHaveBeenCalled();
  });

  it("Open in the mod falls back to copying the plan code when the game cannot be reached", async () => {
    modLink.findModGame.mockResolvedValue({ port: 25640, version: "0.2.0" });
    renderBar();
    await openShare();
    await act(async () => {
      fireEvent.click(shareRow("Open in the game"));
    });
    await vi.waitFor(() => expect(clipboard.copyToClipboard).toHaveBeenCalled());
    expect(clipboard.copyToClipboard.mock.calls[0][0]).toMatch(/^gtnh1\./);
  });

  it("a browser that asks before reaching this computer is not probed until the row is picked", async () => {
    modLink.localNetworkPermission.mockResolvedValue("prompt");
    renderBar();
    await openShare();
    expect(modLink.findModGame).not.toHaveBeenCalled();
    expect(shareRow("Open in the game").getAttribute("aria-disabled")).toBeNull();
  });

  it("a browser told no still reaches a game it may, and else the row copies the code for the + tab", async () => {
    modLink.localNetworkPermission.mockResolvedValue("denied");
    modLink.findModGame.mockResolvedValue({ port: 25640, version: "0.2.0" });
    renderBar();
    await openShare();
    expect(shareRow("Open in the game").getAttribute("aria-disabled")).toBeNull();
    cleanup();
    modLink.findModGame.mockResolvedValue(undefined);
    renderBar();
    await openShare();
    const row = shareRow("Open in the game");
    expect(row.getAttribute("aria-disabled")).toBeNull();
    expect(row.getAttribute("data-tip")).toContain("copies the plan code");
    await act(async () => {
      fireEvent.click(row);
    });
    await vi.waitFor(() => expect(clipboard.copyToClipboard).toHaveBeenCalledWith("gtnh1.TEST"));
    expect(modLink.sendPlanToMod).not.toHaveBeenCalled();
  });

  it("Copy plan link copies this site's link with the plan after #p=, Copy plan code the code alone", async () => {
    renderBar();
    await openShare();
    await act(async () => {
      fireEvent.click(shareRow("Copy plan link"));
    });
    await vi.waitFor(() => expect(clipboard.copyToClipboard).toHaveBeenCalledTimes(1));
    expect(clipboard.copyToClipboard.mock.calls[0][0].startsWith(`${window.location.origin}/#p=gtnh1.`)).toBe(true);
    await openShare();
    await act(async () => {
      fireEvent.click(shareRow("Copy plan code"));
    });
    await vi.waitFor(() => expect(clipboard.copyToClipboard).toHaveBeenCalledTimes(2));
    expect(clipboard.copyToClipboard.mock.calls[1][0]).toMatch(/^gtnh1\./);
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

  it("every key carries a tip for the tip host", () => {
    renderBar();
    for (const id of ["share", "plans", "community", "account", "feedback", "settings", "help"]) {
      expect(key(id).getAttribute("data-tip-id"), id).toBe(`bar|${id}`);
      expect(JSON.parse(key(id).getAttribute("data-tip")!).title.length).toBeGreaterThan(3);
    }
  });
});
