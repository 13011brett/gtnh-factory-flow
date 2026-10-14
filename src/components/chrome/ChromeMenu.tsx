"use client";

import "./chrome.css";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDropdownDismiss } from "@/lib/hooks/use-dropdown-dismiss";
import { getUiScale } from "@/lib/ui-scale";
import { playBoardSound } from "@/lib/board-sounds";

/** Where a menu hangs from, in real (unzoomed) screen pixels. */
export interface ChromeAnchor {
  left: number;
  top: number;
  bottom: number;
  right?: number;
}

export function chromeAnchorOf(element: Element): ChromeAnchor {
  const r = element.getBoundingClientRect();
  return { left: r.left, top: r.top, bottom: r.bottom, right: r.right };
}

/** A row of a menu: its label, a quiet detail at the right, and what it does. */
export interface MenuEntry {
  label: string;
  detail?: string;
  tone?: "red";
  current?: boolean;
  disabled?: boolean;
  /** A thin rule above this row. */
  ruleAbove?: boolean;
  onSelect: () => void;
}

/** The attribute that makes a press on an element count as inside the menu it opens (the key toggles it). */
export const MENU_ANCHOR_ATTR = "data-menu-anchor";

/**
 * The mod's PickList in Popup's frame: rows 20 high, the label left, the detail right in muted ink, the hovered
 * row lit, the current one shaded. A body portal closed by Escape, a press outside, a scroll or the camera
 * moving (the app's one dropdown rule); picking a row closes it, then does what the row says.
 */
export function ChromeMenu({
  anchor,
  entries,
  label,
  title,
  minWidth,
  align = "left",
  onClose,
}: {
  anchor: ChromeAnchor;
  entries: MenuEntry[];
  label: string;
  title?: string;
  minWidth?: number;
  /** `right` hangs the menu's right edge from the anchor's right edge (the keys at the bar's end). */
  align?: "left" | "right";
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDropdownDismiss(true, {
    refs: [ref],
    onClose,
    insideSelector: `[${MENU_ANCHOR_ATTR}]`,
  });
  useEffect(() => {
    playBoardSound("pageOpen");
  }, []);
  const scale = getUiScale();
  const shell = (px: number) => px / scale;
  const vw = shell(window.innerWidth);
  const spaceBelow = shell(window.innerHeight - anchor.bottom) - 8;
  const style: React.CSSProperties = {
    minWidth: minWidth ?? 100,
    maxHeight: Math.max(80, spaceBelow),
    top: shell(anchor.bottom) + 2,
  };
  if (align === "right" && anchor.right !== undefined) {
    style.right = Math.max(2, vw - shell(anchor.right));
  } else {
    style.left = Math.max(2, shell(anchor.left));
  }
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      data-mod-menu=""
      className="mm ui-zoom nodrag nowheel"
      style={style}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {title ? <div className="mm-title">{title}</div> : null}
      <div className="mm-scroll">
        {entries.map((entry, index) => (
          <MenuRow key={`${entry.label}:${index}`} entry={entry} onClose={onClose} />
        ))}
      </div>
    </div>,
    document.body,
  );
}

function MenuRow({ entry, onClose }: { entry: MenuEntry; onClose: () => void }): ReactNode {
  return (
    <>
      {entry.ruleAbove ? <div className="mm-rule" /> : null}
      <div
        role="menuitem"
        className="mm-row"
        data-tone={entry.tone}
        data-current={entry.current ? "" : undefined}
        data-off={entry.disabled ? "" : undefined}
        aria-disabled={entry.disabled || undefined}
        onClick={() => {
          if (entry.disabled) return;
          playBoardSound("tick");
          onClose();
          entry.onSelect();
        }}
      >
        <span className="mm-label">{entry.label}</span>
        {entry.detail ? <span className="mm-detail">{entry.detail}</span> : null}
      </div>
    </>
  );
}
