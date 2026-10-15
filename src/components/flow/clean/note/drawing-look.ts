import { BOARD_GRID } from "@/lib/board-grid";
import type {
  FactoryAnnotation,
  FactoryAnnotationBorderStyle,
  FactoryAnnotationMarks,
} from "@/lib/model/types";
import { GT_NODE_COLORS } from "../../node-colors";

/**
 * How the drawn annotations (box, zone, arrow, image) look on a plan board: the clean card's flat, square,
 * thin-chrome style, identical to the mod's `ui/note/DrawingPaint` (docs/annotations.md). Sizes are the mod's board
 * px one to one, as the cards are (320 wide on both).
 */

export const DRAWING = {
  /** Border and arrow line, 2 mod px. */
  line: 2,
  /** Dashes: 8 on, 6 off, in mod px. */
  dashOn: 8,
  dashOff: 6,
  /** Arrowhead: length and full width. */
  headLength: 14,
  headWidth: 10,
  /** Surface alphas, in 256ths: a tint and a solid. */
  tintAlpha: 0x14,
  solidAlpha: 0x47,
  /** Marks' alpha. */
  marksAlpha: 0x40,
  selection: "#22d3ee",
} as const;

export type DrawingSurface = "tint" | "solid" | "none";

export interface DrawingLook {
  border: FactoryAnnotationBorderStyle;
  borderColor: string;
  fillColor: string;
  surface: DrawingSurface;
  marks: FactoryAnnotationMarks;
}

const LEGACY_MARKS = new Set<string>(["dots", "grid", "graph", "ruled", "hatch"]);

function swatch(tag: string | undefined): string {
  return (GT_NODE_COLORS[(tag ?? "yellow") as keyof typeof GT_NODE_COLORS] ?? GT_NODE_COLORS.yellow).swatch;
}

/** The resolved look: colour tags to swatches, legacy fills to a surface and marks. */
export function drawingLook(annotation: FactoryAnnotation): DrawingLook {
  const style = annotation.style;
  const raw = style?.fill;
  const surface: DrawingSurface = raw === "none" || raw === "solid" ? raw : raw === "paper" ? "solid" : "tint";
  const marks = (style?.marks ?? (raw && LEGACY_MARKS.has(raw) ? raw : "none")) as FactoryAnnotationMarks;
  return {
    border: style?.border ?? "solid",
    borderColor: swatch(style?.borderColor ?? annotation.colorTag),
    fillColor: swatch(style?.fillColor ?? annotation.colorTag),
    surface,
    marks,
  };
}

/** "#rrggbb" and an alpha in 256ths as "#rrggbbaa". */
export function withAlpha(hex: string, alpha: number): string {
  return `${hex}${Math.max(0, Math.min(255, Math.round(alpha))).toString(16).padStart(2, "0")}`;
}

/** The surface fill, or undefined when there is none. */
export function surfaceFill(look: DrawingLook): string | undefined {
  if (look.surface === "none") return undefined;
  return withAlpha(look.fillColor, look.surface === "solid" ? DRAWING.solidAlpha : DRAWING.tintAlpha);
}

/** The marks layer's CSS (a box); the zone uses the same gradients clipped to its outline. */
export function marksCss(
  marks: FactoryAnnotationMarks,
  ink: string,
  unit: number = BOARD_GRID,
): { backgroundImage?: string; backgroundSize?: string } {
  const a = (alpha: number) => withAlpha(ink, alpha);
  switch (marks) {
    case "dots":
      return {
        backgroundImage: `radial-gradient(${a(0x66)} 1px, transparent 1.5px)`,
        backgroundSize: `${unit}px ${unit}px`,
      };
    case "grid":
      return {
        backgroundImage: `repeating-linear-gradient(0deg, ${a(0x30)} 0 1px, transparent 1px ${unit}px), repeating-linear-gradient(90deg, ${a(0x30)} 0 1px, transparent 1px ${unit}px)`,
      };
    case "graph":
      return {
        backgroundImage: [
          `repeating-linear-gradient(0deg, ${a(0x66)} 0 1px, transparent 1px ${unit * 5}px)`,
          `repeating-linear-gradient(90deg, ${a(0x66)} 0 1px, transparent 1px ${unit * 5}px)`,
          `repeating-linear-gradient(0deg, ${a(0x28)} 0 1px, transparent 1px ${unit}px)`,
          `repeating-linear-gradient(90deg, ${a(0x28)} 0 1px, transparent 1px ${unit}px)`,
        ].join(", "),
      };
    case "ruled":
      return {
        backgroundImage: `repeating-linear-gradient(180deg, transparent 0 ${unit * 2 - 1}px, ${a(0x48)} ${unit * 2 - 1}px ${unit * 2}px)`,
      };
    case "hatch":
      return {
        backgroundImage: `repeating-linear-gradient(45deg, ${a(0x3a)} 0 2px, transparent 2px ${unit * 0.9}px)`,
      };
    default:
      return {};
  }
}

/** Where an arrow's tail and head are in its box. */
export function arrowEnds(
  direction: FactoryAnnotation["arrowDirection"],
  width: number,
  height: number,
): { from: { x: number; y: number }; to: { x: number; y: number } } {
  const d = direction ?? "down-right";
  const left = d.endsWith("left");
  const up = d.startsWith("up");
  return {
    from: { x: left ? width : 0, y: up ? height : 0 },
    to: { x: left ? 0 : width, y: up ? 0 : height },
  };
}

/** The flat arrowhead's three corners for a line ending at `to`, coming from `from`. */
export function arrowHead(
  from: { x: number; y: number },
  to: { x: number; y: number },
  line: number = DRAWING.line,
): Array<{ x: number; y: number }> {
  // 14 long and 10 wide (mod px) on the normal line; a thicker line has a bigger head, as in the mod.
  const length = Math.max(DRAWING.headLength, 4 * line);
  const wide = Math.max(DRAWING.headWidth, 3 * line);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const back = { x: to.x - length * Math.cos(angle), y: to.y - length * Math.sin(angle) };
  const nx = -Math.sin(angle) * (wide / 2);
  const ny = Math.cos(angle) * (wide / 2);
  return [to, { x: back.x + nx, y: back.y + ny }, { x: back.x - nx, y: back.y - ny }];
}

/** A zone's points scaled to a new bounding box (resizing it), from `from` size to `to` size. */
export function scalePoints(
  points: ReadonlyArray<{ x: number; y: number }>,
  from: { width: number; height: number },
  to: { width: number; height: number },
): Array<{ x: number; y: number }> {
  const sx = from.width > 0 ? to.width / from.width : 1;
  const sy = from.height > 0 ? to.height / from.height : 1;
  return points.map((p) => ({ x: Math.round(p.x * sx), y: Math.round(p.y * sy) }));
}

/** An arrow's line thickness (board px) and whether it wears a head at both ends. */
export function arrowStyle(annotation: Pick<FactoryAnnotation, "arrowWidth" | "arrowHeads">): {
  width: number;
  both: boolean;
} {
  const mod = annotation.arrowWidth && annotation.arrowWidth > 0 ? annotation.arrowWidth : 2;
  return { width: mod, both: annotation.arrowHeads === "both" };
}

type Pt = { x: number; y: number };

/**
 * The box and direction an arrow from `tail` to `head` is stored as (board points, any frame): the bounding
 * box's corner, its size, and which corners tail and head are at. Dead straight arrows have a size of 0 on one axis.
 */
export function arrowFromEnds(
  tail: Pt,
  head: Pt,
): { position: Pt; size: { width: number; height: number }; arrowDirection: NonNullable<FactoryAnnotation["arrowDirection"]> } {
  const left = head.x < tail.x;
  const up = head.y < tail.y;
  return {
    position: { x: Math.min(tail.x, head.x), y: Math.min(tail.y, head.y) },
    size: { width: Math.abs(head.x - tail.x), height: Math.abs(head.y - tail.y) },
    arrowDirection: `${up ? "up" : "down"}-${left ? "left" : "right"}` as NonNullable<FactoryAnnotation["arrowDirection"]>,
  };
}

/** The style patch a menu choice makes on a box or zone: fill and marks stay two separate choices. */
export function boxStyleWith(
  annotation: Pick<FactoryAnnotation, "style">,
  change: { fill?: DrawingSurface; marks?: FactoryAnnotationMarks; border?: FactoryAnnotationBorderStyle },
): NonNullable<FactoryAnnotation["style"]> {
  const style = annotation.style ?? {};
  const raw = style.fill;
  // A legacy fill that names a mark keeps wearing it once the surface is chosen on its own.
  const legacyMarks = raw && LEGACY_MARKS.has(raw) ? (raw as FactoryAnnotationMarks) : undefined;
  const next = { ...style };
  if (change.fill) next.fill = change.fill;
  else if (legacyMarks || raw === "paper") next.fill = raw === "paper" ? "solid" : "tint";
  if (change.marks) next.marks = change.marks;
  else if (legacyMarks && !style.marks) next.marks = legacyMarks;
  if (change.border) next.border = change.border;
  return next;
}
