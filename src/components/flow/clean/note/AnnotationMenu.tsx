"use client";

import { LibraryMenu, MenuHeading, MenuItem, MenuRule } from "@/components/library/library-menu";
import type { FactoryAnnotation, FactoryNodeColorTag } from "@/lib/model/types";
import { useFactoryStore } from "@/store/factory-store";
import { arrowStyle, boxStyleWith, drawingLook, type DrawingSurface } from "./drawing-look";
import { NOTE_COLOR_MENU } from "./note-model";
import { useState } from "react";

/**
 * A box's or an arrow's right-click menu (docs/annotations.md): the same words in the mod. Box and zone: colour, fill
 * (tint, solid, none), border (solid, dashed), marks, delete. Arrow: colour, thickness, heads, delete.
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
  const [view, setView] = useState<"main" | "colour">("main");
  const store = () => useFactoryStore.getState();
  const patch = (change: Partial<FactoryAnnotation>) => () => {
    store().updateAnnotation(annotation.id, change);
    onClose();
  };
  const arrow = annotation.kind === "arrow";

  if (view === "colour") {
    const current = annotation.colorTag ?? "yellow";
    return (
      <LibraryMenu left={x} top={y} label="Colour" onClose={onClose}>
        <MenuHeading>Colour</MenuHeading>
        {NOTE_COLOR_MENU.map(([tag, name]) => (
          <MenuItem
            key={tag}
            label={name}
            checked={tag === current}
            onClick={patch(recolour(annotation, tag))}
          />
        ))}
      </LibraryMenu>
    );
  }

  const look = drawingLook(annotation);
  const box = (change: Parameters<typeof boxStyleWith>[1]) => patch({ style: boxStyleWith(annotation, change) });
  const surface = (value: DrawingSurface, label: string) => (
    <MenuItem label={label} checked={look.surface === value} onClick={box({ fill: value })} />
  );

  return (
    <LibraryMenu left={x} top={y} label={arrow ? "Arrow" : "Box"} onClose={onClose} height={arrow ? 340 : 640}>
      <MenuItem label="Colour..." onClick={() => setView("colour")} />
      {arrow ? <ArrowRows annotation={annotation} patch={patch} /> : null}
      {!arrow ? (
        <>
          <MenuHeading>Fill</MenuHeading>
          {surface("tint", "Tint")}
          {surface("solid", "Solid")}
          {surface("none", "None")}
          <MenuHeading>Border</MenuHeading>
          <MenuItem label="Solid" checked={look.border !== "dashed"} onClick={box({ border: "solid" })} />
          <MenuItem label="Dashed" checked={look.border === "dashed"} onClick={box({ border: "dashed" })} />
          <MenuHeading>Marks</MenuHeading>
          {(["none", "dots", "grid", "graph", "ruled", "hatch"] as const).map((marks) => (
            <MenuItem
              key={marks}
              label={marks[0].toUpperCase() + marks.slice(1)}
              checked={look.marks === marks}
              onClick={box({ marks })}
            />
          ))}
        </>
      ) : null}
      <MenuRule />
      <MenuItem
        label={arrow ? "Delete arrow" : annotation.kind === "zone" ? "Delete zone" : "Delete box"}
        tone="danger"
        onClick={() => {
          store().deleteAnnotation(annotation.id);
          onClose();
        }}
      />
    </LibraryMenu>
  );
}

function ArrowRows({
  annotation,
  patch,
}: {
  annotation: FactoryAnnotation;
  patch: (change: Partial<FactoryAnnotation>) => () => void;
}) {
  const style = arrowStyle(annotation);
  const mod = style.width / (380 / 320);
  const thickness = (value: number, label: string) => (
    <MenuItem label={label} checked={Math.round(mod) === value} onClick={patch({ arrowWidth: value })} />
  );
  return (
    <>
      <MenuHeading>Thickness</MenuHeading>
      {thickness(1, "Thin")}
      {thickness(2, "Normal")}
      {thickness(4, "Thick")}
      <MenuHeading>Heads</MenuHeading>
      <MenuItem label="One end" checked={!style.both} onClick={patch({ arrowHeads: "end" })} />
      <MenuItem label="Both ends" checked={style.both} onClick={patch({ arrowHeads: "both" })} />
    </>
  );
}

/** One colour for the whole drawing: the tag, with any separate border or fill colour let go. */
export function recolour(annotation: FactoryAnnotation, tag: FactoryNodeColorTag): Partial<FactoryAnnotation> {
  if (!annotation.style) return { colorTag: tag };
  const { borderColor: _border, fillColor: _fill, fillTheme: _theme, ...rest } = annotation.style;
  void _border;
  void _fill;
  void _theme;
  return { colorTag: tag, style: rest };
}

