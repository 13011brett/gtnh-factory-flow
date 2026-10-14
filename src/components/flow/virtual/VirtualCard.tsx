"use client";

import { useCallback, useEffect, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";
import { useStoreApi, useUpdateNodeInternals } from "@xyflow/react";
import "./virtual.css";
import { boardVirtualizer, virtualizationEnabled } from "./card-virtualizer";

/** What a shell paints: the card's frame states and the glance face. */
export interface ShellFace {
  selected: boolean;
  cannotRun: boolean;
  unset: boolean;
  /** The count the glance face prints. */
  count: string;
  /** The picture the glance face draws. */
  art?: string;
  /** The box to use when React Flow has not measured the card yet. */
  fallbackHeight: number;
  fallbackWidth: number;
}

/** The layout signature each card had when its contents were last drawn. */
const drawnSignature = new Map<string, string>();

/** Forgets a card that left the plan. */
export function forgetDrawnCard(id: string): void {
  drawnSignature.delete(id);
}

/** Whether this card's contents are in the DOM right now (selected cards always are). */
export function useCardMounted(nodeId: string, selected: boolean): boolean {
  const subscribe = useCallback((listener: () => void) => boardVirtualizer.subscribe(nodeId, listener), [nodeId]);
  const inSet = useSyncExternalStore(
    subscribe,
    () => boardVirtualizer.isMounted(nodeId),
    () => true,
  );
  useEffect(() => {
    if (!selected) return;
    boardVirtualizer.pin(nodeId);
    return () => boardVirtualizer.unpin(nodeId);
  }, [nodeId, selected]);
  return inSet || selected;
}

/**
 * A card that mounts its contents only while it is on or near the screen.
 *
 * `children` is the card; it is rendered only while mounted. While it is not, the card is a shell: a box of
 * the size React Flow measured (so the wrapper, the published geometry and the router see no change) wearing
 * the card's frame and the glance face, which is two elements. The hooks of the card's model keep running
 * (they are cheap next to the DOM), so the shell always knows the card's current state.
 */
export function VirtualCard({
  nodeId,
  selected,
  signature,
  face,
  children,
}: {
  nodeId: string;
  selected: boolean;
  /** Everything that moves the card's box or its handles (cardLayoutSignature). */
  signature: string;
  face: ShellFace;
  children: ReactNode;
}) {
  const enabled = virtualizationEnabled();
  const mounted = useCardMounted(nodeId, selected) || !enabled;
  const storeApi = useStoreApi();
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    if (!enabled) return;
    if (mounted) {
      const before = drawnSignature.get(nodeId);
      drawnSignature.set(nodeId, signature);
      if (!boardVirtualizer.isDrawn(nodeId)) {
        // First draw: React Flow measured the shell, which has no handles. Measure again, for real.
        boardVirtualizer.markDrawn(nodeId);
        updateNodeInternals(nodeId);
      } else if (before !== undefined && before !== signature) {
        // The card was away while its ports or rows changed: React Flow still holds the old handle boxes at the
        // unchanged size, so it is told to measure again.
        updateNodeInternals(nodeId);
      }
      return;
    }
    // Not mounted and its layout changed (an undo far away, a solve that added a forced row): drawn again in
    // the background pass.
    const before = drawnSignature.get(nodeId);
    if (before !== undefined && before !== signature) {
      drawnSignature.delete(nodeId);
      boardVirtualizer.markUndrawn(nodeId);
    }
  }, [enabled, mounted, nodeId, signature, updateNodeInternals]);

  if (mounted) {
    return <>{children}</>;
  }
  const measured = storeApi.getState().nodeLookup.get(nodeId)?.measured;
  const style: CSSProperties = {
    width: measured?.width ?? face.fallbackWidth,
    height: measured?.height ?? face.fallbackHeight,
  };
  return (
    <div
      className="cc-card"
      data-node-glance-root=""
      data-shell=""
      data-selected={face.selected ? "" : undefined}
      data-cannot-run={face.cannotRun ? "" : undefined}
      data-unset={face.unset ? "" : undefined}
      style={style}
    >
      <div
        className="cc-glance"
        data-node-detail="glance"
        data-count={face.count}
        aria-hidden
        style={face.art ? { backgroundImage: `url(${face.art})` } : undefined}
      />
    </div>
  );
}
