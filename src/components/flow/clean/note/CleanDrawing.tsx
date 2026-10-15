"use client";

import { NodeResizer, type NodeProps } from "@xyflow/react";
import { memo, useState } from "react";
import { ANNOTATION_MIN_ARROW, ANNOTATION_MIN_BOX } from "@/lib/board-grid";
import { useFactoryStore } from "@/store/factory-store";
import { ANNOTATION_DRAG_HANDLE_CLASS, type AnnotationFlowNode } from "../../AnnotationNode";
import {
  DRAWING,
  arrowEnds,
  arrowHead,
  drawingLook,
  marksCss,
  scalePoints,
  surfaceFill,
  type DrawingLook,
} from "./drawing-look";
import "./drawing.css";

const HANDLE = ANNOTATION_DRAG_HANDLE_CLASS;

/**
 * A box, zone, arrow or image on a plan board, in the clean card's look (docs/annotations.md): flat, square, a thin
 * line, the card's font. The mod draws the same (`ui/note/DrawingPaint`). Interiors are click-through; the line,
 * border or panel is what moves it, the corners resize it.
 */
function CleanDrawingComponent({ data, selected, width, height }: NodeProps<AnnotationFlowNode>) {
  const { annotation } = data;
  const updateAnnotation = useFactoryStore((state) => state.updateAnnotation);
  const w = width ?? annotation.size.width;
  const h = height ?? annotation.size.height;
  const look = drawingLook(annotation);
  const kind = annotation.kind;

  return (
    <div className="dw" data-kind={kind} data-selected={selected ? "true" : undefined} style={{ width: w, height: h }}>
      <NodeResizer
        isVisible={selected}
        minWidth={kind === "arrow" ? ANNOTATION_MIN_ARROW : ANNOTATION_MIN_BOX}
        minHeight={kind === "arrow" ? ANNOTATION_MIN_ARROW : ANNOTATION_MIN_BOX}
        keepAspectRatio={kind === "image"}
        lineStyle={{ pointerEvents: "none", borderColor: DRAWING.selection }}
        handleStyle={{
          pointerEvents: "all",
          width: 10,
          height: 10,
          borderRadius: 0,
          backgroundColor: DRAWING.selection,
          border: "1px solid #0e7490",
          zIndex: 10,
        }}
        onResizeEnd={(_, p) =>
          updateAnnotation(annotation.id, {
            position: { x: p.x, y: p.y },
            size: { width: p.width, height: p.height },
            ...(kind === "zone" && annotation.points
              ? { points: scalePoints(annotation.points, { width: w, height: h }, p) }
              : undefined),
          })
        }
      />
      {kind === "box" ? <Box look={look} /> : null}
      {kind === "zone" ? <Zone id={annotation.id} points={annotation.points ?? []} w={w} h={h} look={look} /> : null}
      {kind === "arrow" ? <Arrow direction={annotation.arrowDirection} w={w} h={h} color={look.borderColor} /> : null}
      {kind === "image" ? <ImagePanel url={annotation.imageUrl} caption={annotation.text} look={look} /> : null}
    </div>
  );
}

function Box({ look }: { look: DrawingLook }) {
  const line = look.border === "none" ? 0 : DRAWING.line;
  return (
    <>
      <div
        className="dw-box"
        style={{
          borderWidth: line,
          borderStyle: look.border === "dashed" ? "dashed" : "solid",
          borderColor: look.borderColor,
          backgroundColor: surfaceFill(look),
        }}
      />
      {look.marks !== "none" ? (
        <div className="dw-box" style={{ ...marksCss(look.marks, look.fillColor), border: "none" }} />
      ) : null}
      <div className={`${HANDLE} dw-strip dw-top`} />
      <div className={`${HANDLE} dw-strip dw-bottom`} />
      <div className={`${HANDLE} dw-strip dw-left`} />
      <div className={`${HANDLE} dw-strip dw-right`} />
    </>
  );
}

function Zone({
  id,
  points,
  w,
  h,
  look,
}: {
  id: string;
  points: Array<{ x: number; y: number }>;
  w: number;
  h: number;
  look: DrawingLook;
}) {
  if (points.length < 3) return null;
  const outline = `${points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")} Z`;
  const fill = surfaceFill(look);
  const clip = `dw-clip-${id}`;
  return (
    <svg className="dw-svg" viewBox={`0 0 ${Math.max(w, 1)} ${Math.max(h, 1)}`} preserveAspectRatio="none">
      <clipPath id={clip}>
        <path d={outline} />
      </clipPath>
      {fill ? <path d={outline} fill={fill} stroke="none" /> : null}
      {look.marks !== "none" ? (
        <foreignObject x={0} y={0} width={w} height={h} clipPath={`url(#${clip})`}>
          <div style={{ width: w, height: h, ...marksCss(look.marks, look.fillColor) }} />
        </foreignObject>
      ) : null}
      {look.border !== "none" ? (
        <path
          d={outline}
          fill="none"
          stroke={look.borderColor}
          strokeWidth={DRAWING.line}
          strokeDasharray={look.border === "dashed" ? `${DRAWING.dashOn} ${DRAWING.dashOff}` : undefined}
          strokeLinejoin="miter"
        />
      ) : null}
      <path d={outline} className={`${HANDLE} dw-hit`} fill="none" stroke="transparent" strokeWidth={24} />
    </svg>
  );
}

function Arrow({
  direction,
  w,
  h,
  color,
}: {
  direction: "down-right" | "down-left" | "up-right" | "up-left" | undefined;
  w: number;
  h: number;
  color: string;
}) {
  const { from, to } = arrowEnds(direction, w, h);
  const head = arrowHead(from, to);
  const line = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  return (
    <svg className="dw-svg" viewBox={`0 0 ${Math.max(w, 1)} ${Math.max(h, 1)}`} preserveAspectRatio="none">
      <path d={line} stroke={color} strokeWidth={DRAWING.line} strokeLinecap="butt" fill="none" />
      <polygon points={head.map((p) => `${p.x},${p.y}`).join(" ")} fill={color} />
      <path d={line} className={`${HANDLE} dw-hit`} stroke="transparent" strokeWidth={24} fill="none" />
    </svg>
  );
}

function ImagePanel({
  url,
  caption,
  look,
}: {
  url: string | undefined;
  caption: string | undefined;
  look: DrawingLook;
}) {
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const frame = look.border === "none" ? 0 : DRAWING.frame;
  const text = (caption ?? "").trim();
  const shown = Boolean(url) && state !== "failed";
  return (
    <div
      className={`${HANDLE} dw-image`}
      style={{
        borderWidth: frame,
        borderStyle: look.border === "dashed" ? "dashed" : "solid",
        borderColor: look.borderColor,
        padding: DRAWING.inset,
      }}
    >
      <div className="dw-picture">
        {shown ? (
          // crossOrigin so the exporter may read the pixels back; the image bucket serves open CORS.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={text || "Board image"}
            crossOrigin="anonymous"
            draggable={false}
            onLoad={() => setState("ready")}
            onError={() => setState("failed")}
          />
        ) : null}
        {!shown || state === "loading" ? <span className="dw-missing">{shown ? "loading" : "image unavailable"}</span> : null}
      </div>
      {text ? (
        <div className="dw-caption" style={{ height: DRAWING.caption, fontSize: DRAWING.captionFont }}>
          {text}
        </div>
      ) : null}
    </div>
  );
}

export const CleanDrawing = memo(CleanDrawingComponent);
