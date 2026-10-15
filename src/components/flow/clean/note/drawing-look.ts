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
 * px times `K`, the same factor as the cards (380 against 320).
 */
export const K = 380 / 320;

export const DRAWING = {
  /** Border and arrow line, 2 mod px. */
  line: 2 * K,
  /** Dashes: 8 on, 6 off, in mod px. */
  dashOn: 8 * K,
  dashOff: 6 * K,
  /** Arrowhead: length and full width. */
  headLength: 14 * K,
  headWidth: 10 * K,
  /** Image panel: frame, inset and caption strip. */
  frame: 2 * K,
  inset: 3 * K,
  caption: 16 * K,
  captionFont: 10 * K,
  /** Surface alphas, in 256ths: a tint and a solid. */
  tintAlpha: 0x14,
  solidAlpha: 0x47,
  /** Marks' alpha. */
  marksAlpha: 0x40,
  /** The clean card's frame grey and panel dark. */
  frameGrey: "#3c3e45",
  panel: "#26282c",
  captionInk: "#9a9ca4",
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
  const neutral = annotation.kind === "image" && !annotation.colorTag && !style?.borderColor;
  return {
    border: style?.border ?? "solid",
    borderColor: neutral ? DRAWING.frameGrey : swatch(style?.borderColor ?? annotation.colorTag),
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
): Array<{ x: number; y: number }> {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const back = { x: to.x - DRAWING.headLength * Math.cos(angle), y: to.y - DRAWING.headLength * Math.sin(angle) };
  const nx = -Math.sin(angle) * (DRAWING.headWidth / 2);
  const ny = Math.cos(angle) * (DRAWING.headWidth / 2);
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
