"use client";

import type { ReactNode } from "react";
import { LibraryMenu, MenuRule } from "@/components/library/library-menu";
import type { FactoryNodeColorTag } from "@/lib/model/types";
import { NOTE, NOTE_COLOR_MENU, notePalette } from "./note-model";

export interface NoteMenuState {
  x: number;
  y: number;
  view: "main" | "colour";
}

function Row({
  children,
  detail,
  tone,
  onClick,
}: {
  children: ReactNode;
  detail?: string;
  tone?: "danger";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={[
        "flex w-full items-center gap-1.5 whitespace-nowrap px-2 py-1.5 text-left text-xs hover:bg-[var(--mc-61)]",
        tone === "danger" ? "text-red-400" : "text-[var(--mc-ink)]",
      ].join(" ")}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {detail ? <span className="text-[var(--mc-ink-muted)]">{detail}</span> : null}
    </button>
  );
}

/** The sticky note's right-click menu, in the mod's words: write, colour, bigger and smaller text, delete. */
export function NoteMenu({
  state,
  colorTag,
  font,
  onView,
  onClose,
  onWrite,
  onColor,
  onFont,
  onDelete,
}: {
  state: NoteMenuState;
  colorTag: FactoryNodeColorTag | undefined;
  font: number;
  onView: (view: NoteMenuState["view"]) => void;
  onClose: () => void;
  onWrite: () => void;
  onColor: (tag: FactoryNodeColorTag) => void;
  onFont: (steps: number) => void;
  onDelete: () => void;
}) {
  const run = (action: () => void) => () => {
    action();
    onClose();
  };
  if (state.view === "colour") {
    const current = colorTag ?? NOTE.defaultColor;
    return (
      <LibraryMenu left={state.x} top={state.y} label="Note colour" onClose={onClose}>
        <div className="px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-[var(--mc-ink-muted)]">
          Colour
        </div>
        {NOTE_COLOR_MENU.map(([tag, name]) => (
          <Row key={tag} detail={tag === current ? "✓" : undefined} onClick={run(() => onColor(tag))}>
            <span
              aria-hidden
              className="mr-1.5 inline-block h-2.5 w-2.5 align-middle"
              style={{ backgroundColor: notePalette(tag).paper }}
            />
            {name}
          </Row>
        ))}
      </LibraryMenu>
    );
  }
  return (
    <LibraryMenu left={state.x} top={state.y} label="Sticky note" onClose={onClose}>
      <Row onClick={run(onWrite)}>Write on it</Row>
      <Row onClick={() => onView("colour")}>Colour...</Row>
      <Row detail={`${font} px`} onClick={run(() => onFont(1))}>
        Bigger text
      </Row>
      <Row onClick={run(() => onFont(-1))}>Smaller text</Row>
      <MenuRule />
      <Row tone="danger" onClick={run(onDelete)}>
        Delete note
      </Row>
    </LibraryMenu>
  );
}
