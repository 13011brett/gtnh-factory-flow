// @vitest-environment jsdom
import { act } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { setHandHeld } from "./rest-tracker";
import { tipAttrs } from "./tip-spec";

beforeAll(() => {
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

let under: Element | null = null;
let ensureTipHost: () => void;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  document.elementFromPoint = () => under;
  ({ ensureTipHost } = await import("./TipHost"));
  act(() => ensureTipHost());
});
afterEach(() => {
  setHandHeld("wire", false);
  act(() => {
    document.dispatchEvent(new MouseEvent("pointercancel"));
  });
  vi.useRealTimers();
  document.querySelectorAll("[data-test-target]").forEach((el) => el.remove());
});

function target(id: string, title: string): HTMLElement {
  const el = document.createElement("div");
  el.setAttribute("data-test-target", "");
  for (const [name, value] of Object.entries(tipAttrs({ id, title }))) el.setAttribute(name, value);
  document.body.appendChild(el);
  return el;
}

function move(el: Element, buttons = 0) {
  under = el;
  const event = new MouseEvent("pointermove", { bubbles: true, clientX: 50, clientY: 60, buttons });
  act(() => {
    el.dispatchEvent(event);
  });
}

const shown = () => document.querySelector(".tp");

it("shows a tip after 0.8 s of rest and not before", () => {
  const a = target("n|a", "Alpha");
  move(a);
  act(() => vi.advanceTimersByTime(700));
  expect(shown()).toBeNull();
  act(() => vi.advanceTimersByTime(150));
  expect(shown()?.textContent).toContain("Alpha");
});

it("keeps the wait while moving about on the thing, and resets it on another thing", () => {
  const a = target("n|a", "Alpha");
  const b = target("n|b", "Beta");
  move(a);
  act(() => vi.advanceTimersByTime(500));
  move(a);
  act(() => vi.advanceTimersByTime(350));
  expect(shown()?.textContent).toContain("Alpha");
  move(b);
  expect(shown()).toBeNull();
  act(() => vi.advanceTimersByTime(700));
  expect(shown()).toBeNull();
  act(() => vi.advanceTimersByTime(150));
  expect(shown()?.textContent).toContain("Beta");
});

it("hides on leaving everything and waits in full the next time", () => {
  const a = target("n|a", "Alpha");
  move(a);
  act(() => vi.advanceTimersByTime(900));
  expect(shown()).not.toBeNull();
  const nothing = document.createElement("div");
  document.body.appendChild(nothing);
  nothing.setAttribute("data-test-target", "");
  move(nothing);
  expect(shown()).toBeNull();
  move(a);
  act(() => vi.advanceTimersByTime(500));
  expect(shown()).toBeNull();
});

it("shows nothing while a button is down or while something is in hand", () => {
  const a = target("n|a", "Alpha");
  move(a, 1);
  act(() => vi.advanceTimersByTime(2000));
  expect(shown()).toBeNull();
  setHandHeld("wire", true);
  move(a);
  act(() => vi.advanceTimersByTime(2000));
  expect(shown()).toBeNull();
  setHandHeld("wire", false);
  move(a);
  act(() => vi.advanceTimersByTime(900));
  expect(shown()?.textContent).toContain("Alpha");
});

it("shows nothing while a menu is open, unless the pointer is on the menu", () => {
  const a = target("n|a", "Alpha");
  const menu = document.createElement("div");
  menu.setAttribute("role", "menu");
  menu.setAttribute("data-test-target", "");
  document.body.appendChild(menu);
  move(a);
  act(() => vi.advanceTimersByTime(2000));
  expect(shown()).toBeNull();
  const inside = document.createElement("div");
  for (const [name, value] of Object.entries(tipAttrs({ id: "m|x", title: "Inside" }))) inside.setAttribute(name, value);
  menu.appendChild(inside);
  move(inside);
  act(() => vi.advanceTimersByTime(900));
  expect(shown()?.textContent).toContain("Inside");
});

it("hides on a press and on a wheel step", () => {
  const a = target("n|a", "Alpha");
  move(a);
  act(() => vi.advanceTimersByTime(900));
  expect(shown()).not.toBeNull();
  act(() => {
    a.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, buttons: 1 }));
  });
  expect(shown()).toBeNull();
});

it("gives a titled control the same 0.8 s wait on a plan board, and drops the native title", async () => {
  const { setRestWait } = await import("./rest-tracker");
  setRestWait(800);
  const key = document.createElement("button");
  key.setAttribute("data-test-target", "");
  key.setAttribute("title", "Undo\nLast change");
  document.body.appendChild(key);
  move(key);
  expect(key.hasAttribute("title")).toBe(false);
  act(() => vi.advanceTimersByTime(700));
  expect(shown()).toBeNull();
  act(() => vi.advanceTimersByTime(150));
  expect(shown()?.textContent).toContain("Undo");
  expect(shown()?.textContent).toContain("Last change");
  setRestWait(0);
});

it("words the keys the mod words, by aria-label, over the website's short title", async () => {
  const { setRestWait } = await import("./rest-tracker");
  setRestWait(800);
  const key = document.createElement("button");
  key.setAttribute("data-test-target", "");
  key.setAttribute("aria-label", "Rate unit: per second");
  document.body.appendChild(key);
  move(key);
  act(() => vi.advanceTimersByTime(900));
  expect(shown()?.textContent).toContain("Rate unit: per tick, second, minute or hour");
  setRestWait(0);
});

it("leaves titles alone on a classic board", () => {
  const key = document.createElement("button");
  key.setAttribute("data-test-target", "");
  key.setAttribute("title", "Classic");
  document.body.appendChild(key);
  move(key);
  act(() => vi.advanceTimersByTime(2000));
  expect(key.getAttribute("title")).toBe("Classic");
  expect(shown()).toBeNull();
});
