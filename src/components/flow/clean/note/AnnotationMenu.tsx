"use client";

import { useState } from "react";
import { LibraryMenu, MenuHeading, MenuItem, MenuRule } from "@/components/library/library-menu";
import type { FactoryAnnotation, FactoryNodeColorTag } from "@/lib/model/types";
import { useFactoryStore } from "@/store/factory-store";
import { K, arrowStyle, boxStyleWith, drawingLook } from "./drawing-look";
import { NOTE_COLOR_MENU } from "./note-model";

type View = "main" | "colour" | "fill" | "border" | "marks" | "thickness" | "heads";

const MARKS = ["none", "dots", "grid", "graph", "ruled", "hatch"] as const;

/**
 * A box's or an arrow's right-click menu (docs/annotations.md), the same words and rows as the mod's. Box and zone:
 * Colour..., Fill..., Border..., Marks..., Delete. Arrow: Colour..., Thickness..., Heads..., Delete. Each "..." row
 * opens a short list with the current choice ticked.
 */
export function AnnotationMenu({
  annotation,
  x,
  y,
  onClose,
}: {
  annotation: FactoryAnnotation;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>("main");
  const patch = (change: Partial<FactoryAnnotation>) => () => {
    useFactoryStore.getState().updateAnnotation(annotation.id, change);
    onClose();
  };
  const box = (change: Parameters<typeof boxStyleWith>[1]) => patch({ style: boxStyleWith(annotation, change) });
  const look = drawingLook(annotation);
  const arrow = annotation.kind === "arrow";
  const arrowLook = arrowStyle(annotation);
  const thick = Math.round(arrowLook.width / K);
  const word = (s: string) => s[0].toUpperCase() + s.slice(1);

  if (view === "colour") {
    const current = annotation.colorTag ?? "yellow";
    return (
      <LibraryMenu left={x} top={y} label="Colour" onClose={onClose}>
        <MenuHeading>Colour</MenuHeading>
        {NOTE_COLOR_MENU.map(([tag, name]) => (
          <MenuItem key={tag} label={name} checked={tag === current} onClick={patch(recolour(annotation, tag))} />
        ))}
      </LibraryMenu>
    );
  }
  if (view !== "main") {
    return (
      <LibraryMenu left={x} top={y} label={word(view)} onClose={onClose}>
        <MenuHeading>{word(view)}</MenuHeading>
        {view === "fill"
          ? (["tint", "solid", "none"] as const).map((fill) => (
              <MenuItem key={fill} label={word(fill)} checked={look.surface === fill} onClick={box({ fill })} />
            ))
          : null}
        {view === "border"
          ? (["solid", "dashed"] as const).map((border) => (
              <MenuItem
                key={border}
                label={word(border)}
                checked={(look.border === "dashed" ? "dashed" : "solid") === border}
                onClick={box({ border })}
              />
            ))
          : null}
        {view === "marks"
          ? MARKS.map((marks) => (
              <MenuItem key={marks} label={word(marks)} checked={look.marks === marks} onClick={box({ marks })} />
            ))
          : null}
        {view === "thickness"
          ? ([[1, "Thin"], [2, "Normal"], [4, "Thick"]] as const).map(([value, name]) => (
              <MenuItem key={value} label={name} checked={thick === value} onClick={patch({ arrowWidth: value })} />
            ))
          : null}
        {view === "heads" ? (
          <>
            <MenuItem label="One end" checked={!arrowLook.both} onClick={patch({ arrowHeads: "end" })} />
            <MenuItem label="Both ends" checked={arrowLook.both} onClick={patch({ arrowHeads: "both" })} />
          </>
        ) : null}
      </LibraryMenu>
    );
  }

  return (
    <LibraryMenu left={x} top={y} label={arrow ? "Arrow" : "Box"} onClose={onClose}>
      <MenuItem label="Colour..." onClick={() => setView("colour")} />
      {arrow ? (
        <>
          <MenuItem label="Thickness..." onClick={() => setView("thickness")} />
          <MenuItem label="Heads..." onClick={() => setView("heads")} />
        </>
      ) : (
        <>
          <MenuItem label="Fill..." onClick={() => setView("fill")} />
          <MenuItem label="Border..." onClick={() => setView("border")} />
          <MenuItem label="Marks..." onClick={() => setView("marks")} />
        </>
      )}
      <MenuRule />
      <MenuItem
        label={arrow ? "Delete arrow" : annotation.kind === "zone" ? "Delete zone" : "Delete box"}
        tone="danger"
        onClick={() => {
          useFactoryStore.getState().deleteAnnotation(annotation.id);
          onClose();
        }}
      />
    </LibraryMenu>
  );
}

/** One colour for the whole drawing: the tag, with any separate border or fill colour let go. */
export function recolour(annotation: FactoryAnnotation, tag: FactoryNodeColorTag): Partial<FactoryAnnotation> {
  if (!annotation.style) return { colorTag: tag };
  const rest = { ...annotation.style };
  delete rest.borderColor;
  delete rest.fillColor;
  delete rest.fillTheme;
  return { colorTag: tag, style: rest };
}
