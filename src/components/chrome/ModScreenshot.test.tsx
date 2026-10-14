// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { FLOW_IMAGE_EXPORT_COMPLETE_EVENT, FLOW_IMAGE_EXPORT_EVENT } from "@/lib/import-export/plan-image";
import { useDesignStore } from "@/store/design-store";
import { ModScreenshot } from "./ModScreenshot";

vi.mock("@/lib/compact-view", () => ({ isCompactViewport: () => false }));

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  URL.createObjectURL = () => "blob:preview";
  URL.revokeObjectURL = () => undefined;
  // jsdom has no layout: the well measures as the mod's (1200 x 720 box less its column).
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 900 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 600 });
});

const asked: Array<{ cardDetail: string; hideAnnotations: boolean }> = [];
const onExport = (event: Event) => {
  const detail = (event as CustomEvent).detail as { requestId: string; cardDetail: string; hideAnnotations: boolean };
  asked.push({ cardDetail: detail.cardDetail, hideAnnotations: detail.hideAnnotations });
  queueMicrotask(() =>
    window.dispatchEvent(
      new CustomEvent(FLOW_IMAGE_EXPORT_COMPLETE_EVENT, {
        detail: {
          requestId: detail.requestId,
          capture: {
            kind: "png",
            blob: new Blob(["x"], { type: "image/png" }),
            width: 1260,
            height: 628,
            pixelRatio: 2,
            viewport: { x: 0, y: 0, zoom: 1 },
            occlusionRects: [],
          },
        },
      }),
    ),
  );
};

beforeEach(() => {
  asked.length = 0;
  useDesignStore.setState({ designs: [], activeDesignId: undefined });
  window.addEventListener(FLOW_IMAGE_EXPORT_EVENT, onExport);
});
afterEach(() => {
  window.removeEventListener(FLOW_IMAGE_EXPORT_EVENT, onExport);
  cleanup();
});

describe("the screenshot box", () => {
  it("shows the picture as it will come out, its size in pixels, and the mod's choices: Cards, Plan name, Inputs and outputs", async () => {
    render(<ModScreenshot onClose={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Screenshot" })).toBeTruthy();
    await waitFor(() => expect(document.querySelector(".mshot-size")?.textContent).toBe("2,520 x 1,256 pixels"));
    expect(asked[0]).toEqual({ cardDetail: "full", hideAnnotations: false });
    expect([...document.querySelectorAll('[aria-label="Cards"] .ms-choice')].map((element) => element.textContent)).toEqual(["Detailed", "Simple"]);
    expect(screen.getByRole("switch", { name: "Plan name" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("switch", { name: "Inputs and outputs" }).getAttribute("aria-checked")).toBe("false");
    // By default it is the plan and nothing else, with the mark every picture carries.
    expect(document.querySelector(".mshot-mark")?.textContent).toBe("GTNH Planner");
  });

  it("Simple takes the zoomed-out look and the picture is taken again", async () => {
    render(<ModScreenshot onClose={vi.fn()} />);
    await waitFor(() => expect(asked).toHaveLength(1));
    await act(async () => {
      fireEvent.click(screen.getByText("Simple"));
    });
    await waitFor(() => expect(asked).toHaveLength(2));
    expect(asked[1].cardDetail).toBe("glance");
  });

  it("Copy and Save wait for the picture, and Escape closes the box", async () => {
    const onClose = vi.fn();
    render(<ModScreenshot onClose={onClose} />);
    await waitFor(() => expect(document.querySelector('.mshot-key[data-save]')?.hasAttribute("data-off")).toBe(false));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });
});
