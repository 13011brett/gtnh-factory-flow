// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoticeRow } from "./NoticeBar";

describe("a conversion notice row", () => {
  it("shows its sentence and a Dismiss key that calls its dismiss", () => {
    const dismiss = vi.fn();
    render(
      <NoticeRow
        notice={{ id: "conversion", severity: "info", text: "Converted from a Solve plan. Pins and drawer rates kept.", focus: [], dismiss }}
        onShow={() => undefined}
      />,
    );
    expect(screen.getByText(/Converted from a Solve plan/)).toBeTruthy();
    expect(screen.queryByText("Show me")).toBeNull();
    fireEvent.click(screen.getByText("Dismiss"));
    expect(dismiss).toHaveBeenCalled();
  });
});
