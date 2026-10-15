import { playSfx } from "@/lib/sound/sfx";

/**
 * The group a carried thing would join (docs/groups.md, "Dragging in and out"), shown live while it is carried: the
 * target group's frame and body light up (`data-drop` on `[data-group-frame]` and `[data-board-floor]`), the group it
 * would leave dims (`data-leaving`), and coming over a new group ticks once (the wire snap, quieter). Set on the DOM, so
 * a drag frame re-renders nothing.
 */

let lit: string | undefined;
let leaving: string | undefined;

function mark(id: string | undefined, attr: string, on: boolean): void {
  if (id === undefined || typeof document === "undefined") return;
  const selector = `[data-group-frame="${CSS.escape(id)}"], [data-board-floor="${CSS.escape(id)}"]`;
  for (const element of document.querySelectorAll<HTMLElement>(selector)) {
    if (on) element.setAttribute(attr, "");
    else element.removeAttribute(attr);
  }
}

/** The group the carried things would land in (undefined: the board) and the group they are in now. */
export function showGroupDrop(target: string | undefined, from: string | undefined): void {
  const nextLeaving = target !== from ? from : undefined;
  if (target !== lit) {
    mark(lit, "data-drop", false);
    mark(target, "data-drop", true);
    if (target !== undefined && target !== from) playSfx("wire.snap", 0.6, 1.0);
    lit = target;
  }
  if (nextLeaving !== leaving) {
    mark(leaving, "data-leaving", false);
    mark(nextLeaving, "data-leaving", true);
    leaving = nextLeaving;
  }
}

/** The carry ended: nothing lit. */
export function clearGroupDrop(): void {
  mark(lit, "data-drop", false);
  mark(leaving, "data-leaving", false);
  lit = undefined;
  leaving = undefined;
}

/** The drop's own sound: in (a group took it) higher, out (it left its group) lower. */
export function groupDropSound(joined: number, left: number): void {
  if (joined > 0) playSfx("board.merge", 1, 1.12);
  else if (left > 0) playSfx("board.merge", 0.8, 0.85);
}

/**
 * The open group a carried box lands in: the deepest open frame whose body (under its title strip) holds the box's
 * centre, skipping `excluded` (the carried group and what it holds). Undefined: the board.
 */
export function groupUnder(
  frames: ReadonlyArray<{ id: string; depth: number; x: number; y: number; width: number; height: number }>,
  box: { x: number; y: number; width: number; height: number },
  title: number,
  excluded?: ReadonlySet<string>,
): string | undefined {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  let winner: { id: string; depth: number } | undefined;
  for (const frame of frames) {
    if (excluded?.has(frame.id)) continue;
    const inside = cx >= frame.x && cx <= frame.x + frame.width && cy >= frame.y + title && cy <= frame.y + frame.height;
    if (inside && (!winner || frame.depth > winner.depth)) winner = frame;
  }
  return winner?.id;
}
