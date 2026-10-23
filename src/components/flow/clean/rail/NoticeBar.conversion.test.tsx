// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoticeRow } from "./NoticeBar";
import type { PlanStrandedVent } from "@/lib/solver/plan/types";

describe("a conversion notice row", () => {
  it("shows its sentence and a Dismiss key that calls its dismiss", () => {
    const dismiss = vi.fn();
    render(
      <NoticeRow
        notice={{
          id: "conversion",
          severity: "info",
          text: "Converted from a Solve plan. Pins and drawer rates kept.",
          focus: [],
          dismiss,
        }}
        onShow={() => undefined}
      />,
    );
    expect(screen.getByText(/Converted from a Solve plan/)).toBeTruthy();
    expect(screen.queryByText("Show me")).toBeNull();
    fireEvent.click(screen.getByText("Dismiss"));
    expect(dismiss).toHaveBeenCalled();
  });
});

describe("a notice row with a fix", () => {
  const vent: PlanStrandedVent = {
    nodeId: "lcr",
    cardId: "lcr",
    portKey: "lcr|o|output:fluid:liquid_heavy_fuel",
    resourceKey: "fluid:liquid_heavy_fuel",
    resourceName: "Heavy Fuel",
    perSecond: 28.58,
    fix: { kind: "drawer" },
    stalled: ["lcr", "crop"],
  };

  it("shows the fix as a key in the row's own link style, after Show me, and takes it on click, Enter and Space", () => {
    const onFix = vi.fn();
    const onShow = vi.fn();
    const { container } = render(
      <NoticeRow
        notice={{
          id: "stranded:x",
          severity: "warn",
          text: "Spare Heavy Fuel at the Large Chemical Reactor that makes it stops 2 cards: 28.58 L/s has nowhere to go",
          focus: ["lcr"],
          fix: { label: "Add a drawer", tip: "Adds a drawer for Heavy Fuel at the Large Chemical Reactor that makes it.", vent },
        }}
        onShow={onShow}
        onFix={onFix}
      />,
    );
    const keys = [...container.querySelectorAll(".rail-notice-show")].map((el) => el.textContent);
    expect(keys).toEqual(["Show me", "Add a drawer"]);
    const key = screen.getByText("Add a drawer");
    expect(key.getAttribute("role")).toBe("button");
    fireEvent.click(key);
    fireEvent.keyDown(key, { key: "Enter" });
    fireEvent.keyDown(key, { key: " " });
    expect(onFix).toHaveBeenCalledTimes(3);
    expect(onFix.mock.calls[0]![0].fix.vent).toBe(vent);
    expect(onShow).not.toHaveBeenCalled();
    // The row is cut on a narrow board: the whole sentence is its tip, and the key's tip says what it adds where.
    expect(container.querySelector(".rail-notice-text")?.getAttribute("title")).toBe(
      "Spare Heavy Fuel at the Large Chemical Reactor that makes it stops 2 cards: 28.58 L/s has nowhere to go",
    );
    expect(key.getAttribute("title")).toBe("Adds a drawer for Heavy Fuel at the Large Chemical Reactor that makes it.");
  });

  it("has no key when the notice offers no fix (stale books)", () => {
    const { container } = render(
      <NoticeRow
        notice={{ id: "stranded:x", severity: "warn", text: "spare", focus: ["lcr"] }}
        onShow={() => undefined}
      />,
    );
    expect([...container.querySelectorAll(".rail-notice-show")].map((el) => el.textContent)).toEqual([
      "Show me",
    ]);
  });
});
