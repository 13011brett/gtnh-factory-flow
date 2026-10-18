/**
 * "Open this side column now", asked of a plan board whose window may have folded it (`fitPanels`): the strip's own
 * click, and the recipe book opening when a resource is browsed. The workspace keeps such a column open and gives way
 * elsewhere. Outside the browser, or with nobody listening, a request does nothing.
 */
export type SidePanel = "items" | "overview";

const listeners = new Set<(panel: SidePanel) => void>();

export function requestPanelOpen(panel: SidePanel): void {
  for (const listener of listeners) listener(panel);
}

export function onPanelOpenRequest(listener: (panel: SidePanel) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
