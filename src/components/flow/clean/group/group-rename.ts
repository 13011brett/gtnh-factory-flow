/**
 * "Rename" from a group's menu: the menu asks, the title strip's name (GroupName) answers by opening its field. A
 * window event, so the menu needs no handle on the strip.
 */
const EVENT = "gtnh:group-rename";

export function requestGroupRename(pocketId: string): void {
  if (typeof window === "undefined") return;
  // After the menu's own close, so the field keeps the focus it takes.
  window.setTimeout(() => window.dispatchEvent(new CustomEvent(EVENT, { detail: pocketId })), 0);
}

export function onGroupRename(listener: (pocketId: string) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<string>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
