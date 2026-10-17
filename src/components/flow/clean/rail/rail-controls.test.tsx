// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { RateBox, RuleKey, wheelHandlerFor } from "./rail-controls";

const sfx = vi.hoisted(() => ({ sfxClick: vi.fn(), playEditSfx: vi.fn() }));
vi.mock("@/lib/sound/sfx", async (original) => ({
  ...(await original<typeof import("@/lib/sound/sfx")>()),
  sfxClick: sfx.sfxClick,
  playEditSfx: sfx.playEditSfx,
}));

afterEach(() => {
  cleanup();
  sfx.sfxClick.mockClear();
  sfx.playEditSfx.mockClear();
});

const tip = () => ({ title: "" }) as never;

it("the rate box clicks for itself and ticks before every wheel step", () => {
  const onStartEdit = vi.fn();
  const onWheel = vi.fn();
  const { container } = render(
    <RateBox
      text="3"
      gold
      editing={false}
      initial="3"
      onStartEdit={onStartEdit}
      onCommit={vi.fn()}
      onCancel={vi.fn()}
      onWheel={onWheel}
      tip={tip}
      label="Rate"
    />,
  );
  const box = container.querySelector(".rail-box")!;
  expect(box.hasAttribute("data-sfx-own")).toBe(true);
  fireEvent.click(box);
  expect(sfx.sfxClick).toHaveBeenCalledTimes(1);
  expect(onStartEdit).toHaveBeenCalledTimes(1);
  const step = wheelHandlerFor(box)!;
  step(1, false, false);
  step(-1, true, false);
  expect(sfx.playEditSfx.mock.calls).toEqual([
    ["ui.tick", 1, 1.12],
    ["ui.tick", 1, 0.9],
  ]);
  expect(onWheel.mock.calls).toEqual([
    [1, false, false],
    [-1, true, false],
  ]);
});

it("a middle click clears a set box or key with the board's unpin sound, and never autoscrolls", () => {
  const onMiddle = vi.fn();
  const { container } = render(
    <>
      <RateBox
        text="3"
        gold
        editing={false}
        initial="3"
        onStartEdit={vi.fn()}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
        onMiddle={onMiddle}
        tip={tip}
        label="Set"
      />
      <RateBox
        text=""
        gold={false}
        editing={false}
        initial=""
        onStartEdit={vi.fn()}
        onCommit={vi.fn()}
        onCancel={vi.fn()}
        onMiddle={onMiddle}
        tip={tip}
        label="Empty"
      />
      <RuleKey mark="=" tone="gold" tip={tip} onMiddle={onMiddle} label="Key" />
    </>,
  );
  const [set, empty] = [...container.querySelectorAll(".rail-box")];
  const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 1 });
  set!.dispatchEvent(down);
  expect(down.defaultPrevented).toBe(true);
  fireEvent(set!, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
  fireEvent(
    container.querySelector(".rail-rule")!,
    new MouseEvent("auxclick", { bubbles: true, button: 1 }),
  );
  expect(onMiddle).toHaveBeenCalledTimes(2);
  expect(sfx.playEditSfx.mock.calls).toEqual([["board.unpin"], ["board.unpin"]]);
  // Nothing set: the clear runs, quietly.
  fireEvent(empty!, new MouseEvent("auxclick", { bubbles: true, button: 1 }));
  expect(onMiddle).toHaveBeenCalledTimes(3);
  expect(sfx.playEditSfx).toHaveBeenCalledTimes(2);
});

it("the rule key clicks for itself", () => {
  const onClick = vi.fn();
  const { container } = render(
    <RuleKey mark="~" tone="muted" tip={tip} onClick={onClick} label="Rule" />,
  );
  const key = container.querySelector(".rail-rule")!;
  expect(key.hasAttribute("data-sfx-own")).toBe(true);
  fireEvent.click(key);
  expect(sfx.sfxClick).toHaveBeenCalledTimes(1);
  expect(onClick).toHaveBeenCalledTimes(1);
});
