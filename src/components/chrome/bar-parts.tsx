"use client";

import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { activateOnKey } from "@/lib/hooks/button-keys";
import { playBoardSound } from "@/lib/board-sounds";
import { sfxTick } from "@/lib/sound/sfx";
import { tipAttrs } from "@/components/flow/clean/interaction";
import { MENU_ANCHOR_ATTR } from "./ChromeMenu";

/** One key of the bar: a label (or a picture), a tip, and the click, right-click and wheel it answers. */
export function BarKey({
  id,
  label,
  width,
  tip,
  tipSub,
  icon,
  off,
  open,
  gap,
  onClick,
  onContext,
  onWheel,
  children,
  glyph,
  ariaLabel,
  menuAnchor,
}: {
  id: string;
  label?: string;
  /** The key's width in the mod's GUI pixels: its widest label's width in the game's font, plus 12 (the mod's `fit`). */
  width?: number;
  tip: string;
  tipSub?: string;
  icon?: boolean;
  off?: boolean;
  open?: boolean;
  gap?: boolean;
  onClick: (event: MouseEvent<HTMLElement>) => void;
  onContext?: () => void;
  /** +1 for wheel up, -1 for wheel down. */
  onWheel?: (step: number) => void;
  children?: ReactNode;
  glyph?: string;
  ariaLabel?: string;
  menuAnchor?: boolean;
}) {
  return (
    <div
      role="button"
      tabIndex={off ? -1 : 0}
      aria-label={ariaLabel ?? label ?? id}
      aria-haspopup={menuAnchor ? "menu" : undefined}
      aria-expanded={menuAnchor ? Boolean(open) : undefined}
      onKeyDown={activateOnKey}
      aria-disabled={off || undefined}
      className={gap ? "mb-key mb-gap" : "mb-key"}
      data-mb={id}
      data-icon={icon ? "" : undefined}
      data-off={off ? "" : undefined}
      data-open={open ? "" : undefined}
      data-glyph={glyph}
      {...(menuAnchor ? { [MENU_ANCHOR_ATTR]: "" } : {})}
      style={width ? { width } : undefined}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        if (off) return;
        playBoardSound("tick");
        onClick(event);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        if (off || !onContext) return;
        playBoardSound("tick");
        onContext();
      }}
      onWheel={
        onWheel
          ? (event) => {
              if (off || event.deltaY === 0) return;
              onWheel(event.deltaY < 0 ? 1 : -1);
              // A top-bar key the wheel steps too ticks (the mod's WheelKey).
              sfxTick(event.deltaY < 0);
            }
          : undefined
      }
      {...tipAttrs({ id: `bar|${id}`, title: tip, sub: tipSub })}
    >
      {children ?? label}
    </div>
  );
}

/**
 * How much room the bar has, in its own pixels. Roomy is the full bar; tight drops what can go without a new picture
 * (Non-recipe to its bolt, Arrange to its label's width, the faces to two and a +N, tighter keys); folded shows Plans
 * and Share as their pictures. The bar never takes a second row (a phone's does: html[data-compact]); past folded the
 * tabs give way. The widths leave the tabs room beside the keys and the faces.
 */
export type BarFit = "roomy" | "tight" | "folded";
/** The top bar's widths; the board toolbar has fewer keys and its own (BoardToolbar). */
export const BAR_FIT_TOP = { tightBelow: 560, foldedBelow: 400 } as const;

export function useBarFit(
  ref: { current: HTMLElement | null },
  { tightBelow, foldedBelow }: { tightBelow: number; foldedBelow: number } = BAR_FIT_TOP,
): BarFit {
  const [fit, setFit] = useState<BarFit>("roomy");
  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    const read = () => {
      // clientWidth is the bar's own px (the shell's zoom and the bar's are outside it).
      const width = bar.clientWidth;
      setFit(width === 0 ? "roomy" : width < foldedBelow ? "folded" : width < tightBelow ? "tight" : "roomy");
    };
    read();
    const observer = new ResizeObserver(read);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [ref, tightBelow, foldedBelow]);
  return fit;
}

