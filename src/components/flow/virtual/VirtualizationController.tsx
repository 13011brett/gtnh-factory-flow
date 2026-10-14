"use client";

import { memo, useEffect, type RefObject } from "react";
import { useStoreApi } from "@xyflow/react";
import {
  getPublishedNodeDetailLevel,
  NODE_DETAIL_GLANCE,
  subscribeNodeDetailLevel,
} from "../node-detail";
import { CONTAINMENT_HOLD_ATTRIBUTE } from "../node-containment";
import { boardVirtualizer, virtualizationEnabled } from "./card-virtualizer";
import { boardEdges } from "./board-edges";

/**
 * Feeds the camera to the virtualizer and runs its steps (card-virtualizer.ts), culls the wires
 * (board-edges.ts), and pins the cards in use. Renders nothing.
 *
 * - The camera is read from React Flow's store, which the scroll camera mirrors onto the page; the view is the
 *   rectangle of flow space the screen shows.
 * - Steps run in requestAnimationFrame, only while something is moving or waiting.
 * - A card under the pointer or holding focus is pinned (one delegated listener on the board), except at the
 *   glance step where a card has no controls to use.
 * - The image export and the screenshot panel set `data-cv-hold` on the board (node-containment.ts): while it
 *   is there every card and every wire is mounted.
 */
export const VirtualizationController = memo(function VirtualizationController({
  boardRef,
}: {
  boardRef: RefObject<HTMLDivElement | null>;
}) {
  const flowStore = useStoreApi();

  useEffect(() => {
    const board = boardRef.current;
    if (!board || !virtualizationEnabled()) {
      return;
    }
    let frame = 0;

    const applyEdges = () => {
      const next = boardEdges.refresh();
      if (next) {
        flowStore.getState().setEdges(next);
      }
    };

    const pump = () => {
      frame = 0;
      const again = boardVirtualizer.step(performance.now());
      applyEdges();
      if (again) {
        schedule();
      }
    };
    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(pump);
      }
    };
    boardVirtualizer.wake = schedule;

    const feedView = () => {
      const { transform, width, height } = flowStore.getState();
      const zoom = transform[2];
      if (!(zoom > 0) || !(width > 0) || !(height > 0)) {
        return;
      }
      boardVirtualizer.setView(
        { x: -transform[0] / zoom, y: -transform[1] / zoom, w: width / zoom, h: height / zoom },
        getPublishedNodeDetailLevel() === NODE_DETAIL_GLANCE,
      );
    };
    feedView();
    const unsubscribeStore = flowStore.subscribe((state, previous) => {
      if (state.transform !== previous.transform || state.width !== previous.width || state.height !== previous.height) {
        feedView();
      }
    });
    const unsubscribeLevel = subscribeNodeDetailLevel(feedView);
    schedule();

    // The export photographs the whole plan.
    let release: (() => void) | undefined;
    const syncHold = () => {
      const held = board.hasAttribute(CONTAINMENT_HOLD_ATTRIBUTE);
      if (held && !release) {
        release = boardVirtualizer.hold();
        const all = boardEdges.compute();
        boardEdges.shown = all;
        flowStore.getState().setEdges(all);
      } else if (!held && release) {
        release();
        release = undefined;
        schedule();
      }
    };
    const holdObserver = new MutationObserver(syncHold);
    holdObserver.observe(board, { attributes: true, attributeFilter: [CONTAINMENT_HOLD_ATTRIBUTE] });
    syncHold();

    // Pins: the card under the pointer and the card holding focus.
    const idOf = (target: EventTarget | null) =>
      (target as Element | null)?.closest?.(".react-flow__node")?.getAttribute("data-id") ?? undefined;
    let hovered: string | undefined;
    let focused: string | undefined;
    const setHovered = (id: string | undefined) => {
      if (id === hovered) return;
      if (hovered) boardVirtualizer.unpin(hovered);
      hovered = id;
      if (id) boardVirtualizer.pin(id);
    };
    const setFocused = (id: string | undefined) => {
      if (id === focused) return;
      if (focused) boardVirtualizer.unpin(focused);
      focused = id;
      if (id) boardVirtualizer.pin(id);
    };
    const onOver = (event: PointerEvent) => {
      setHovered(boardVirtualizer.isGlance() ? undefined : idOf(event.target));
    };
    const onLeave = () => setHovered(undefined);
    const onFocusIn = (event: FocusEvent) => setFocused(idOf(event.target));
    const onFocusOut = (event: FocusEvent) => {
      if (!idOf(event.relatedTarget)) setFocused(undefined);
    };
    board.addEventListener("pointerover", onOver);
    board.addEventListener("pointerleave", onLeave);
    board.addEventListener("focusin", onFocusIn);
    board.addEventListener("focusout", onFocusOut);

    // Readout for the perf harness and for checking by hand.
    (window as unknown as { __gtnhVirtual?: unknown }).__gtnhVirtual = {
      mounted: () => boardVirtualizer.mountedCount(),
      edgesShown: () => boardEdges.shown.length,
      edgesAll: () => boardEdges.all.length,
      view: () => boardVirtualizer.viewRect(),
    };

    return () => {
      cancelAnimationFrame(frame);
      boardVirtualizer.wake = undefined;
      unsubscribeStore();
      unsubscribeLevel();
      holdObserver.disconnect();
      release?.();
      setHovered(undefined);
      setFocused(undefined);
      board.removeEventListener("pointerover", onOver);
      board.removeEventListener("pointerleave", onLeave);
      board.removeEventListener("focusin", onFocusIn);
      board.removeEventListener("focusout", onFocusOut);
    };
  }, [boardRef, flowStore]);

  return null;
});
