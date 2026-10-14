// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { overlayInsets, workspaceColumns } from "./workspace-columns";

const base = { planLayout: false, itemsOpen: true, inspectorOpen: true, hideBoardPanels: false, overviewWidth: 234 };

describe("workspaceColumns", () => {
  it("classic: items 256 left, inspector 234 right", () => {
    expect(workspaceColumns(base)).toMatchObject({ itemsSide: "left", template: "256px minmax(0,1fr) 234px", inspectorShown: true });
  });

  it("classic: closed columns are 26px rails; a covering page removes the right one", () => {
    expect(workspaceColumns({ ...base, itemsOpen: false, inspectorOpen: false }).template).toBe("26px minmax(0,1fr) 26px");
    expect(workspaceColumns({ ...base, hideBoardPanels: true }).template).toBe("256px minmax(0,1fr) 0px");
  });

  it("plan: overview left at its own width, items right", () => {
    expect(workspaceColumns({ ...base, planLayout: true })).toMatchObject({
      itemsSide: "right",
      leftPx: 234,
      rightPx: 256,
      inspectorShown: false,
    });
    expect(workspaceColumns({ ...base, planLayout: true, overviewWidth: 26, itemsOpen: false }).template).toBe("26px minmax(0,1fr) 26px");
  });

  it("plan: the overview is gone under a covering page, the items stay", () => {
    expect(workspaceColumns({ ...base, planLayout: true, hideBoardPanels: true }).template).toBe("0px minmax(0,1fr) 256px");
  });

  it("plan: the right column ignores the inspector flag", () => {
    expect(workspaceColumns({ ...base, planLayout: true, inspectorOpen: false }).rightPx).toBe(256);
  });
});

describe("overlayInsets", () => {
  it("classic layout falls back to the measured browser", () => {
    document.body.innerHTML = "<main data-items-side='left'></main>";
    expect(overlayInsets(1, () => 256)).toEqual({ left: 256, right: 0 });
  });

  it("plan layout leaves both columns bright", () => {
    document.body.innerHTML = "<main data-items-side='right' data-left-px='234' data-right-px='256'></main>";
    expect(overlayInsets(1, () => 999)).toEqual({ left: 234, right: 256 });
  });

  it("plan compact measures the open items drawer", () => {
    document.body.innerHTML =
      "<main data-items-side='right' data-left-px='0' data-right-px='0' data-compact='true'></main><aside data-help-anchor='browser'></aside>";
    const aside = document.querySelector("aside")!;
    aside.getBoundingClientRect = () => ({ width: 200 }) as DOMRect;
    expect(overlayInsets(2, () => 999)).toEqual({ left: 0, right: 100 });
  });
});
