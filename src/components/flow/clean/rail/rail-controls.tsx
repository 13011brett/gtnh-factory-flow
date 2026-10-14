"use client";

import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { parseRateInput } from "./rail-math";
import { tipProps, type TipContent } from "./rail-tip";

/**
 * The small controls every rail row shares: the rule key (`~ = >= <=`) and the
 * rate box with its inline editor. They look like the mod's drawer controls:
 * a dark key with the mark in the middle, a sunken box with the figure in gold.
 * Fonts live on spans (the global `button { font: inherit }` trap), the
 * controls are `div role=button`.
 */

export type WheelHandler = (direction: 1 | -1, ctrl: boolean, shift: boolean) => void;

const wheelHandlers = new WeakMap<Element, WheelHandler>();

/** The wheel handler of the control under `target`, if it is on one. */
export function wheelHandlerFor(target: EventTarget | null): WheelHandler | undefined {
  if (!(target instanceof Element)) return undefined;
  const control = target.closest("[data-wheel]");
  return control ? wheelHandlers.get(control) : undefined;
}

function wheelRef(handler: WheelHandler | undefined) {
  return (element: HTMLElement | null) => {
    if (element && handler) wheelHandlers.set(element, handler);
  };
}

/** Stops the middle button from starting the browser's autoscroll. */
const noAutoscroll = (event: MouseEvent) => {
  if (event.button === 1) event.preventDefault();
};

export function RuleKey({
  mark,
  tone,
  tip,
  onClick,
  onContext,
  onMiddle,
  onWheel,
  label,
}: {
  mark: string;
  /** gold = a rule in force, muted = Any / the plan decides */
  tone: "gold" | "muted";
  tip: () => TipContent;
  onClick?: (event: MouseEvent) => void;
  onContext?: (event: MouseEvent) => void;
  onMiddle?: (event: MouseEvent) => void;
  onWheel?: WheelHandler;
  label: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      className="rail-rule"
      data-tone={tone}
      data-wheel={onWheel ? "" : undefined}
      ref={wheelRef(onWheel)}
      {...tipProps(`rule|${label}`, tip)}
      onMouseDown={noAutoscroll}
      onClick={onClick}
      onContextMenu={(event) => {
        if (!onContext) return;
        event.preventDefault();
        onContext(event);
      }}
      onAuxClick={(event) => {
        if (event.button === 1) onMiddle?.(event);
      }}
    >
      <span>{mark}</span>
    </div>
  );
}

export function RateBox({
  text,
  placeholder = "Set",
  gold,
  unmet,
  editing,
  initial,
  onStartEdit,
  onCommit,
  onCancel,
  onMiddle,
  onWheel,
  tip,
  label,
  width,
}: {
  /** What the box shows when it has a value (final string). */
  text: string;
  placeholder?: string;
  /** A value is in force: shown in gold. Otherwise the placeholder in grey. */
  gold: boolean;
  unmet?: boolean;
  editing: boolean;
  /** The text the editor starts with. */
  initial: string;
  onStartEdit: () => void;
  /** Called with the parsed number; 0 for an empty field (clear). Not called for unparseable text. */
  onCommit: (value: number) => void;
  onCancel: () => void;
  onMiddle?: () => void;
  onWheel?: WheelHandler;
  tip: () => TipContent;
  label: string;
  width?: number;
}) {
  const style = width ? { width } : undefined;
  if (editing) {
    return (
      <RateEditor
        initial={initial}
        onCommit={onCommit}
        onCancel={onCancel}
        style={style}
        label={label}
      />
    );
  }
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      className="rail-box"
      data-set={gold ? "" : undefined}
      data-unmet={unmet ? "" : undefined}
      data-wheel={onWheel ? "" : undefined}
      style={style}
      ref={wheelRef(onWheel)}
      {...tipProps(`box|${label}`, tip)}
      onMouseDown={noAutoscroll}
      onClick={onStartEdit}
      onAuxClick={(event) => {
        if (event.button === 1) onMiddle?.();
      }}
    >
      <span>{gold ? text : placeholder}</span>
    </div>
  );
}

function RateEditor({
  initial,
  onCommit,
  onCancel,
  style,
  label,
}: {
  initial: string;
  onCommit: (value: number) => void;
  onCancel: () => void;
  style?: { width: number };
  label: string;
}) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (!commit) {
      onCancel();
      return;
    }
    const trimmed = value.trim();
    if (trimmed === "") {
      onCommit(0);
      return;
    }
    const parsed = parseRateInput(trimmed);
    if (parsed === undefined || !(parsed >= 0)) onCancel();
    else onCommit(parsed);
  };
  return (
    <input
      ref={input}
      className="rail-box rail-box-edit"
      style={style}
      aria-label={`${label} (type a number: 2.5k, 1M, 1/3)`}
      value={value}
      inputMode="decimal"
      spellCheck={false}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(true);
        else if (event.key === "Escape") finish(false);
      }}
    />
  );
}

/** A flat key (Split, Auto, Avg, Peak, fold). */
export function RailKey({
  children,
  onClick,
  onContext,
  disabled,
  tip,
  label,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  onContext?: () => void;
  disabled?: boolean;
  tip?: () => TipContent;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={`rail-key ${className}`}
      data-disabled={disabled ? "" : undefined}
      {...(tip ? tipProps(`key|${label}`, tip) : {})}
      onClick={(event) => {
        event.stopPropagation();
        if (!disabled) onClick?.();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!disabled) (onContext ?? onClick)?.();
      }}
    >
      <span>{children}</span>
    </div>
  );
}
