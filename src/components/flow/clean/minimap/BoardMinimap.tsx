"use client";

import { useReactFlow, useStore, useStoreApi } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useFactoryStore } from "@/store/factory-store";
import { fitZoomIndex, toBoard } from "./minimap-draw";
import { MinimapEngine } from "./minimap-engine";
import { getMinimap, MINIMAP_SIZES, MINIMAP_ZOOMS, setMinimap, stepMinimapZoom, useMinimapSettings } from "./minimap-settings";
import { MinimapSettingsPanel } from "./MinimapSettingsPanel";
import "./minimap.css";

/**
 * The minimap (the mod's, on the board): the plan zoomed far out in a corner, drawn on ONE canvas from the
 * board's own state, never from the DOM per frame (`MinimapEngine`). It centres on what the board shows (or on the
 * selected card), draws the board's view as a frame, and a press or drag on it carries the board there. The
 * wheel over it, or the [ and ] keys, zoom the map; N shows or hides it. Mount it inside the board's ReactFlow.
 */

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

export function BoardMinimap({ hidden = false }: { hidden?: boolean }) {
  const settings = useMinimapSettings();
  const flow = useReactFlow();
  const storeApi = useStoreApi();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<MinimapEngine | null>(null);
  const dragRef = useRef<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const planName = useFactoryStore((s) => s.project.name);
  const visible = settings.show && !hidden;
  const size = MINIMAP_SIZES[settings.size];
  const circle = settings.shape === "circle";

  // The camera scrolls the flow's own container, so the map lives on the board's root instead.
  const domNode = useStore((s) => s.domNode);
  const host = domNode?.closest<HTMLElement>(".factory-flow-board") ?? null;

  // The frame loop, while the map is up.
  useEffect(() => {
    if (!visible || !host) return;
    const engine = new MinimapEngine(storeApi, () => canvasRef.current);
    engineRef.current = engine;
    const stop = engine.start();
    return () => {
      stop();
      engineRef.current = null;
    };
  }, [visible, host, storeApi]);

  useEffect(() => {
    engineRef.current?.schedule("draw");
  }, [settings]);

  // N, [ and ]: not while typing, not with a modifier.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTyping(event.target)) return;
      if ((event.key === "n" || event.key === "N") && !event.shiftKey) setMinimap({ show: !getMinimap().show });
      else if (event.key === "[" && getMinimap().show) stepMinimapZoom(-1);
      else if (event.key === "]" && getMinimap().show) stepMinimapZoom(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The wheel zooms the map (a native listener: React's wheel is passive).
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || !visible || !host) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      stepMinimapZoom(event.deltaY > 0 ? -1 : 1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [visible, host]);

  const carryTo = useCallback(
    (event: React.PointerEvent) => {
      const canvas = canvasRef.current;
      const engine = engineRef.current;
      const view = engine?.view;
      if (!canvas || !engine || !view) return;
      const rect = canvas.getBoundingClientRect();
      const p = toBoard(view, event.clientX - rect.left, event.clientY - rect.top);
      // The map holds still where it is while the board moves under the press.
      engine.frozen ??= { x: view.cx, y: view.cy };
      void flow.setCenter(p.x, p.y, { zoom: storeApi.getState().transform[2], duration: 0 });
    },
    [flow, storeApi],
  );

  const release = (): void => {
    dragRef.current = null;
    const engine = engineRef.current;
    if (engine) {
      engine.frozen = undefined;
      engine.schedule("draw");
    }
  };

  if (!visible || !host) return null;
  return createPortal(
    <div
      ref={wrapRef}
      className="mm nodrag nopan nowheel"
      data-minimap=""
      data-corner={settings.corner}
      data-shape={settings.shape}
      style={{ width: size, height: size, opacity: 1 - settings.fade / 100 }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        className="mm-canvas"
        style={{ width: size, height: size }}
        aria-label="Minimap"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          dragRef.current = event.pointerId;
          carryTo(event);
        }}
        onPointerMove={(event) => {
          if (dragRef.current === event.pointerId) carryTo(event);
        }}
        onPointerUp={(event) => {
          if (dragRef.current === event.pointerId) release();
        }}
        onPointerCancel={release}
        onDoubleClick={() => {
          setMinimap({ zoom: fitZoomIndex(engineRef.current?.scene?.bounds, size, MINIMAP_ZOOMS) });
        }}
      />
      <div className="mm-title" data-circle={circle ? "" : undefined} title={planName}>
        {planName}
      </div>
      <div
        role="button"
        aria-label="Minimap settings"
        title="Minimap settings"
        className="mm-gear"
        onClick={() => setSettingsOpen((open) => !open)}
      />
      {settingsOpen ? <MinimapSettingsPanel onClose={() => setSettingsOpen(false)} /> : null}
    </div>,
    host,
  );
}
