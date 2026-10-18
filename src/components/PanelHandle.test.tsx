// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PanelHandle, type PanelHandleProps } from "./PanelHandle";

const scale = vi.hoisted(() => ({ value: 1 }));
vi.mock("@/lib/ui-scale", () => ({ getUiScale: () => scale.value }));

function setup(overrides: Partial<PanelHandleProps> = {}) {
  const props = {
    label: "Resize the overview",
    edge: "right" as const,
    getWidth: () => 300,
    getLimits: () => ({ min: 224, max: 480 }),
    onStart: vi.fn(),
    onDrag: vi.fn(),
    onCommit: vi.fn(),
    onReset: vi.fn(),
    onEnd: vi.fn(),
    ...overrides,
  };
  const view = render(<PanelHandle {...props} />);
  const handle = view.getByRole("separator");
  return { props, handle };
}

const press = (handle: HTMLElement, x: number) => fireEvent.pointerDown(handle, { clientX: x, button: 0, pointerId: 1 });
const move = (handle: HTMLElement, x: number) => fireEvent.pointerMove(handle, { clientX: x, pointerId: 1 });
const release = (handle: HTMLElement) => fireEvent.pointerUp(handle, { pointerId: 1 });

beforeEach(() => {
  scale.value = 1;
});
afterEach(() => cleanup());

describe("the panel handle", () => {
  it("is a vertical separator with the column's width and limits for assistive tech, and takes the keyboard", () => {
    const { handle } = setup();
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-label")).toBe("Resize the overview");
    expect([handle.getAttribute("aria-valuemin"), handle.getAttribute("aria-valuemax"), handle.getAttribute("aria-valuenow")]).toEqual([
      "224",
      "480",
      "300",
    ]);
    expect(handle.getAttribute("tabindex")).toBe("0");
  });

  it("a drag toward the board's far side widens a column on its right edge, and saves the last width once on release", () => {
    const { props, handle } = setup();
    press(handle, 400);
    expect(props.onStart).toHaveBeenCalledTimes(1);
    move(handle, 430);
    expect(props.onDrag).toHaveBeenLastCalledWith(330);
    move(handle, 450);
    expect(props.onDrag).toHaveBeenLastCalledWith(350);
    expect(props.onCommit).not.toHaveBeenCalled();
    release(handle);
    expect(props.onCommit).toHaveBeenCalledTimes(1);
    expect(props.onCommit).toHaveBeenCalledWith(350);
    expect(props.onEnd).toHaveBeenCalledTimes(1);
  });

  it("a column on the board's far side has its handle on its left edge: dragging left widens it", () => {
    const { props, handle } = setup({ edge: "left", getWidth: () => 256, getLimits: () => ({ min: 108, max: 420 }) });
    press(handle, 1700);
    move(handle, 1650);
    expect(props.onDrag).toHaveBeenLastCalledWith(306);
    move(handle, 1750);
    expect(props.onDrag).toHaveBeenLastCalledWith(206);
    release(handle);
    expect(props.onCommit).toHaveBeenCalledWith(206);
  });

  it("holds the width to the limits however far the pointer goes", () => {
    const { props, handle } = setup();
    press(handle, 400);
    move(handle, 5000);
    expect(props.onDrag).toHaveBeenLastCalledWith(480);
    move(handle, -5000);
    expect(props.onDrag).toHaveBeenLastCalledWith(224);
    release(handle);
    expect(props.onCommit).toHaveBeenCalledWith(224);
  });

  it("the pointer is in real px and the width in shell px: a move is divided by the interface size", () => {
    scale.value = 2;
    const { props, handle } = setup();
    press(handle, 400);
    move(handle, 440);
    expect(props.onDrag).toHaveBeenLastCalledWith(320);
  });

  it("reports a width only when it changes, and a press without a move saves nothing", () => {
    const { props, handle } = setup();
    press(handle, 400);
    move(handle, 400);
    move(handle, 400.4);
    expect(props.onDrag).not.toHaveBeenCalled();
    release(handle);
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(props.onEnd).toHaveBeenCalledTimes(1);
  });

  it("a cancelled drag saves nothing", () => {
    const { props, handle } = setup();
    press(handle, 400);
    move(handle, 450);
    fireEvent.pointerCancel(handle, { pointerId: 1 });
    expect(props.onCommit).not.toHaveBeenCalled();
    expect(props.onEnd).toHaveBeenCalledTimes(1);
  });

  it("only the primary button drags", () => {
    const { props, handle } = setup();
    fireEvent.pointerDown(handle, { clientX: 400, button: 2, pointerId: 1 });
    move(handle, 450);
    expect(props.onStart).not.toHaveBeenCalled();
    expect(props.onDrag).not.toHaveBeenCalled();
  });

  it("a double click goes back to the default width", () => {
    const { props, handle } = setup();
    fireEvent.doubleClick(handle);
    expect(props.onReset).toHaveBeenCalledTimes(1);
  });

  it("arrow keys move the edge the way they point, 16 px a press and 64 with Shift, held to the limits", () => {
    const { props, handle } = setup();
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(props.onCommit).toHaveBeenLastCalledWith(316);
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(props.onCommit).toHaveBeenLastCalledWith(284);
    fireEvent.keyDown(handle, { key: "ArrowRight", shiftKey: true });
    expect(props.onCommit).toHaveBeenLastCalledWith(364);
    fireEvent.keyDown(handle, { key: "Home" });
    expect(props.onCommit).toHaveBeenLastCalledWith(224);
    fireEvent.keyDown(handle, { key: "End" });
    expect(props.onCommit).toHaveBeenLastCalledWith(480);
    expect(props.onDrag).toHaveBeenLastCalledWith(480);
  });

  it("on a left edge the arrows point the way the edge moves: Right narrows the column", () => {
    const { props, handle } = setup({ edge: "left", getWidth: () => 256, getLimits: () => ({ min: 108, max: 420 }) });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(props.onCommit).toHaveBeenLastCalledWith(240);
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(props.onCommit).toHaveBeenLastCalledWith(272);
  });

  it("a key that changes nothing (already at the limit) saves nothing", () => {
    const { props, handle } = setup({ getWidth: () => 480 });
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    fireEvent.keyDown(handle, { key: "End" });
    expect(props.onCommit).not.toHaveBeenCalled();
  });

  it("carries a tip naming what it resizes", () => {
    const { handle } = setup();
    expect(JSON.parse(handle.getAttribute("data-tip")!)).toMatchObject({ title: "Resize the overview" });
  });
});
