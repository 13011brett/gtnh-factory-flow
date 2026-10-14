// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { useDialogA11y } from "./use-dialog-a11y";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => cleanup());

function Box({ onClose, escape }: { onClose: () => void; escape?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogA11y(ref, { onClose, escape });
  return (
    <div ref={ref} role="dialog" aria-label="box">
      <button data-testid="a">a</button>
      <button data-testid="b">b</button>
    </div>
  );
}

function Host({ escape }: { escape?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button data-testid="opener" onClick={() => setOpen(true)}>
        open
      </button>
      {open ? <Box onClose={() => setOpen(false)} escape={escape} /> : null}
    </>
  );
}

describe("useDialogA11y", () => {
  it("moves focus in on open, traps Tab, closes on Escape and gives focus back", () => {
    const { getByTestId, queryByRole } = render(<Host />);
    const opener = getByTestId("opener");
    opener.focus();
    fireEvent.click(opener);
    expect(document.activeElement).toBe(getByTestId("a"));
    getByTestId("b").focus();
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(document.activeElement).toBe(getByTestId("a"));
    fireEvent.keyDown(document.activeElement!, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(getByTestId("b"));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("leaves Escape alone for a dialog that closes itself", () => {
    const onClose = vi.fn();
    render(<Box onClose={onClose} escape={false} />);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();
  });
});
