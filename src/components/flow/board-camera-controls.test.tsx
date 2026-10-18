// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { useRef } from "react";
import { writeDeviceSettings } from "@/lib/device-settings";
import { useBoardCameraControls } from "./board-camera-controls";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  cleanup();
  writeDeviceSettings({ scrollChangesValues: true });
});

const setViewport = vi.fn();

function Board() {
  const boardRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef({
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    setViewport,
  });
  useBoardCameraControls({ boardRef, instanceRef });
  return (
    <div ref={boardRef}>
      <div className="react-flow">
        <div className="pane" data-testid="pane" />
        <div className="nowheel" data-wheel-value="" data-testid="value" />
        <div data-wheel-steps="" data-wheel-value="" data-testid="steps" />
        <div className="nowheel" data-testid="popup">
          <div className="nowheel" data-wheel-value="" data-testid="value-in-popup" />
        </div>
      </div>
    </div>
  );
}

function wheelOver(testId: string) {
  const event = new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true });
  document.querySelector(`[data-testid="${testId}"]`)!.dispatchEvent(event);
  return event.defaultPrevented;
}

it("zooms over empty board and leaves a popup that scrolls and a control that steps a value alone", () => {
  render(<Board />);
  expect(wheelOver("pane")).toBe(true);
  expect(wheelOver("popup")).toBe(false);
  expect(wheelOver("value")).toBe(false);
  expect(wheelOver("steps")).toBe(false);
});

it("with Scroll changes values off, zooms over a value control too, but still not over a popup", () => {
  render(<Board />);
  writeDeviceSettings({ scrollChangesValues: false });
  expect(wheelOver("pane")).toBe(true);
  expect(wheelOver("value")).toBe(true);
  expect(wheelOver("steps")).toBe(true);
  expect(wheelOver("popup")).toBe(false);
  // A value control inside a popup stays the popup's.
  expect(wheelOver("value-in-popup")).toBe(false);
});
