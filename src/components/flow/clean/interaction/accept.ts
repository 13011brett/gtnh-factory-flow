import { onWiringConnectionChange } from "../../connection-drag";
import { parseResourceHandleId } from "../../resource-handles";
import { useFactoryStore } from "@/store/factory-store";

/**
 * Wire in hand (spec 5): every card that would take the dragged resource
 * breathes green (the board already marks those cards `data-drop-fit="yes"`;
 * the CSS in interaction.css draws the glow), and so does every port row that
 * would take it; over a card that takes it, that card and the port the wire
 * would land on turn steady and brighter (`data-snapped`). Written straight to
 * the DOM, once per drag and once per change of card under the pointer: a
 * value every card subscribed to would rebuild the board.
 *
 * The card the wire came from never glows: carried back over it, a wire is
 * home (the mod snaps a picked-up port back, shown as it was, no green).
 */

export interface DraggedPort {
  nodeId: string;
  handleId?: string;
  side: "input" | "output";
  kind: string;
  resourceId: string;
}

/** Whether a row (opposite side, same resource) would take the dragged port. Pure: tested. */
export function rowAccepts(dragged: DraggedPort, row: { nodeId: string; handleId: string }): boolean {
  if (row.nodeId === dragged.nodeId) return false;
  const target = parseResourceHandleId(row.handleId);
  if (!target) return false;
  return (
    target.side !== dragged.side && target.kind === dragged.kind && target.resourceId === dragged.resourceId
  );
}

let dragged: DraggedPort | undefined;
let overOrigin = false;
let draggedWired = false;
let snappedCard: Element | undefined;
let snappedRow: Element | undefined;
let installed = false;

function draggedFromDom(): DraggedPort | undefined {
  const handle = document.querySelector<HTMLElement>(".react-flow__handle.connectingfrom");
  const nodeId = handle?.getAttribute("data-nodeid");
  const handleId = handle?.getAttribute("data-handleid") ?? undefined;
  const payload = parseResourceHandleId(handleId);
  if (!nodeId || !payload) return undefined;
  return { nodeId, handleId, side: payload.side, kind: payload.kind, resourceId: payload.resourceId };
}

function rowsOf(scope: ParentNode): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(".cc-row[data-port]")];
}

function rowHandle(row: HTMLElement): { nodeId: string; handleId: string } | undefined {
  const nodeId = row.getAttribute("data-resource-node-id");
  const handleId = row.getAttribute("data-resource-handle-id");
  return nodeId && handleId ? { nodeId, handleId } : undefined;
}

function unsnap(): void {
  snappedCard?.removeAttribute("data-snapped");
  snappedRow?.removeAttribute("data-snapped");
  snappedCard = undefined;
  snappedRow = undefined;
}

function startPaint(): void {
  dragged = draggedFromDom();
  if (!dragged) return;
  const from = dragged;
  draggedWired = useFactoryStore
    .getState()
    .project.edges.some(
      (edge) =>
        (edge.source === from.nodeId && edge.sourceHandle === from.handleId) ||
        (edge.target === from.nodeId && edge.targetHandle === from.handleId),
    );
  for (const card of document.querySelectorAll<HTMLElement>(".cc-card")) {
    const node = card.closest<HTMLElement>(".react-flow__node");
    if (node?.dataset.id === dragged.nodeId) card.setAttribute("data-origin", "");
  }
  for (const row of rowsOf(document)) {
    const handle = rowHandle(row);
    if (!handle) continue;
    if (handle.nodeId === dragged.nodeId && handle.handleId === dragged.handleId) {
      // The port in hand shows as already wired.
      row.setAttribute("data-carried", "");
    }
    if (rowAccepts(dragged, handle)) row.setAttribute("data-accepts", "");
  }
}

function endPaint(): void {
  unsnap();
  dragged = undefined;
  overOrigin = false;
  draggedWired = false;
  for (const element of document.querySelectorAll("[data-accepts], [data-carried], [data-origin], [data-snapped]")) {
    element.removeAttribute("data-accepts");
    element.removeAttribute("data-carried");
    element.removeAttribute("data-origin");
    element.removeAttribute("data-snapped");
  }
}

/** Which port of a card the wire would be wired to: the first that accepts it. */
function snapTo(node: Element): void {
  const card = node.querySelector(".cc-card");
  if (!card || card === snappedCard) return;
  unsnap();
  if (card.hasAttribute("data-origin")) return;
  const row = card.querySelector(".cc-row[data-accepts]");
  snappedCard = card;
  snappedRow = row ?? undefined;
  card.setAttribute("data-snapped", "");
  row?.setAttribute("data-snapped", "");
}

function onMove(event: PointerEvent): void {
  if (!dragged) return;
  overOrigin = Boolean(
    (event.target as Element | null)?.closest?.(".react-flow__node")?.querySelector(".cc-card[data-origin]"),
  );
  const node = (event.target as Element | null)?.closest?.('.react-flow__node[data-drop-fit="yes"]');
  if (node) snapTo(node);
  else if (snappedCard) unsnap();
}

/** A wired port is carried back over its own card: it is home, the line in hand is not drawn. */
export function carriedHome(): boolean {
  return overOrigin && draggedWired;
}

/** Installs the wire-in-hand painter. Idempotent; the first clean card calls it. */
export function installAcceptPaint(): void {
  if (installed || typeof document === "undefined") return;
  installed = true;
  onWiringConnectionChange((active) => {
    if (active) {
      // React Flow marks the source handle `connectingfrom` once its state lands.
      requestAnimationFrame(startPaint);
    } else {
      endPaint();
    }
  });
  document.addEventListener("pointermove", onMove, { capture: true, passive: true });
}
