/** Where a plan tab sits in the strip, in the strip's own (scrolled) coordinates. */
export interface TabBox {
  id: string;
  left: number;
  width: number;
}

/** A tab must move this far (px) before it is picked up; the board's click slop. */
export const TAB_DRAG_SLOP = 3;
/** How near the strip's edge the pointer scrolls it, and the fastest it scrolls (px a frame). */
export const TAB_EDGE_ZONE = 28;
export const TAB_EDGE_SPEED = 12;
/** The glide of tabs sliding aside, as the board's carried things. */
export const TAB_GLIDE_MS = 120;

/** The slot (0-based, among the other tabs) the dragged tab's centre is over. */
export function slotAt(boxes: TabBox[], dragId: string, center: number): number {
  let slot = 0;
  for (const box of boxes) {
    if (box.id === dragId) continue;
    if (box.left + box.width / 2 <= center) slot++;
  }
  return slot;
}

/** The ids with `dragId` taken out and put back at `slot` among the rest. */
export function orderWith(ids: string[], dragId: string, slot: number): string[] {
  const rest = ids.filter((id) => id !== dragId);
  rest.splice(Math.max(0, Math.min(slot, rest.length)), 0, dragId);
  return rest;
}

/** How far each tab must shift from where it naturally sits for the strip to read in `order`. */
export function shiftsFor(boxes: TabBox[], order: string[], gap: number): Record<string, number> {
  const byId = new Map(boxes.map((box) => [box.id, box]));
  let left = Math.min(...boxes.map((box) => box.left));
  const shifts: Record<string, number> = {};
  for (const id of order) {
    const box = byId.get(id);
    if (!box) continue;
    shifts[id] = left - box.left;
    left += box.width + gap;
  }
  return shifts;
}

/** `ids` with `id` stepped one place (-1 left, +1 right); the same array when it cannot. */
export function stepped(ids: string[], id: string, by: -1 | 1): string[] {
  const at = ids.indexOf(id);
  const to = at + by;
  if (at < 0 || to < 0 || to >= ids.length) return ids;
  const next = [...ids];
  [next[at], next[to]] = [next[to], next[at]];
  return next;
}
