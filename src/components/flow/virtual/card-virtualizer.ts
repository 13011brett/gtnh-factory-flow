/**
 * WHICH CARDS HAVE THEIR CONTENTS IN THE DOM.
 *
 * Every card of a plan keeps its React Flow node wrapper and a fixed-size shell, but the card's contents (the
 * clean card is 48-65 elements) are mounted only for the cards on or near the screen: at 1,000 cards that is 190k
 * elements down to the 15k the performance budget allows (docs/design/backport/spec-performance.md, 6 and 10.4).
 *
 * This file is the pure part: a spatial index over the published card boxes (flow space, never the DOM), the set
 * of mounted cards, and the rules for who is in it.
 *
 * - IN: a card whose box meets the camera's rectangle grown by `margin` of its size on every side, the nearest
 *   `cap` of them, a few at a time (`batch` a step) so a zoom out does not mount a hundred cards in one frame.
 * - OUT: a card leaves once it is outside the larger `keepMargin` rectangle for `releaseMs`. The gap between the
 *   two rectangles and the delay are the hysteresis: a camera parked on a boundary never flickers a card.
 * - PINNED: hovered, focused, selected, being refreshed after a change: in whatever the camera says.
 * - HELD: everything, for the image export and the screenshot panel (they photograph the whole plan).
 * - A card never drawn (a plan just opened, a card whose layout changed while it was away) is queued to be drawn
 *   once behind the near ones, the background pass: React Flow has measured its shell at the estimated size, and
 *   its real size and handles come from that one draw. A plan of a thousand cards opens as shells and fills in over
 *   a second or two, nearest the camera first, a few cards a frame, with no frame over a few milliseconds.
 * - Zoomed out to the glance step nothing is in (the shell paints the glance face) except the background pass.
 *
 * It never reads the DOM and never schedules: `step(now)` does one round of work and says whether another is
 * wanted. The controller (VirtualizationController.tsx) calls it from requestAnimationFrame.
 */

export interface VRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VirtualizerConfig {
  /** The most cards mounted because of the camera (pins, holds and the background pass come on top). */
  cap: number;
  /** How far past the screen a card still counts as near, as a share of the screen's own size. */
  margin: number;
  /** How far past it a mounted card is kept; larger than `margin`. */
  keepMargin: number;
  /** How long a card must stay out of the keep rectangle before it goes. */
  releaseMs: number;
  /** The same at the glance step. */
  glanceReleaseMs: number;
  /** The most cards one step mounts. */
  batch: number;
  /** A card is not released sooner than this after it mounted: React Flow measures it in the meantime. */
  minMountMs: number;
}

export const VIRTUAL_DEFAULTS: VirtualizerConfig = {
  cap: 150,
  margin: 0.5,
  keepMargin: 0.9,
  releaseMs: 300,
  glanceReleaseMs: 0,
  batch: 24,
  minMountMs: 120,
};

/** The coarse index's cell, in flow px (the mod's BoardCanvas.getChildren uses the same 512). */
export const VIRTUAL_CELL = 512;

function cellKey(cx: number, cy: number): number {
  // Boards live within a few hundred thousand px of the origin; the pair is packed into one integer key.
  return (cx + 32768) * 65536 + (cy + 32768);
}

export function grow(rect: VRect, share: number): VRect {
  const dx = rect.w * share;
  const dy = rect.h * share;
  return { x: rect.x - dx, y: rect.y - dy, w: rect.w + 2 * dx, h: rect.h + 2 * dy };
}

export function meets(a: VRect, b: VRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export class CardVirtualizer {
  readonly config: VirtualizerConfig;
  private geometry = new Map<string, VRect>();
  private cells = new Map<number, string[]>();
  /** Cards whose contents have been drawn since their layout last changed (their size and handles are real). */
  private drawn = new Set<string>();
  private view: VRect | undefined;
  private boardKey: string | undefined;
  private glance = false;
  private mountedSet = new Set<string>();
  private mountedAt = new Map<string, number>();
  private pins = new Map<string, number>();
  private holds = 0;
  private outSince = new Map<string, number>();
  private listeners = new Map<string, Set<() => void>>();
  /** Bumped on every change of who is mounted; for tests and for the dev readout. */
  version = 0;
  private dirty = true;
  /** Set by the controller: called when geometry or the camera changed and a step is wanted. */
  wake: (() => void) | undefined;

  constructor(config: Partial<VirtualizerConfig> = {}) {
    this.config = { ...VIRTUAL_DEFAULTS, ...config };
  }

  /** The published boxes of every measured card, in flow space. */
  setGeometry(boxes: Iterable<readonly [string, VRect]>): void {
    this.geometry.clear();
    this.cells.clear();
    for (const [id, rect] of boxes) {
      if (!(rect.w > 0 && rect.h > 0)) continue;
      this.geometry.set(id, rect);
      const x0 = Math.floor(rect.x / VIRTUAL_CELL);
      const x1 = Math.floor((rect.x + rect.w) / VIRTUAL_CELL);
      const y0 = Math.floor(rect.y / VIRTUAL_CELL);
      const y1 = Math.floor((rect.y + rect.h) / VIRTUAL_CELL);
      for (let cx = x0; cx <= x1; cx += 1) {
        for (let cy = y0; cy <= y1; cy += 1) {
          const key = cellKey(cx, cy);
          const bucket = this.cells.get(key);
          if (bucket) bucket.push(id);
          else this.cells.set(key, [id]);
        }
      }
    }
    // A card removed from the plan is no longer anyone's to mount.
    for (const id of [...this.mountedSet]) {
      if (!this.geometry.has(id)) {
        this.mountedSet.delete(id);
        this.mountedAt.delete(id);
      }
    }
    for (const id of [...this.drawn]) if (!this.geometry.has(id)) this.drawn.delete(id);
    this.dirty = true;
    this.wake?.();
  }

  boxOf(id: string): VRect | undefined {
    return this.geometry.get(id);
  }

  /** The camera: the rectangle of flow space the screen shows, and whether the board is at the glance step. */
  setView(view: VRect, glance: boolean): void {
    const same =
      this.view &&
      this.glance === glance &&
      this.view.x === view.x &&
      this.view.y === view.y &&
      this.view.w === view.w &&
      this.view.h === view.h;
    if (same) return;
    this.view = view;
    this.glance = glance;
    this.dirty = true;
    this.wake?.();
  }

  viewRect(): VRect | undefined {
    return this.view;
  }

  isGlance(): boolean {
    return this.glance;
  }

  /** The card's contents were drawn: its size and handles are measured for real. */
  markDrawn(id: string): void {
    this.drawn.add(id);
  }

  /** The card's layout changed while it was away: it is drawn once more in the background pass. */
  markUndrawn(id: string): void {
    if (this.drawn.delete(id)) {
      this.dirty = true;
      this.wake?.();
    }
  }

  /** A different plan is on the board: nothing of the last one is known. */
  useBoard(key: string | undefined): void {
    if (key === this.boardKey) return;
    this.boardKey = key;
    this.geometry.clear();
    this.cells.clear();
    this.drawn.clear();
    this.mountedSet.clear();
    this.mountedAt.clear();
    this.outSince.clear();
    this.pins.clear();
    // No notify: this runs while the board renders, and the cards of the old plan are on their way out.
  }

  isDrawn(id: string): boolean {
    return this.drawn.has(id);
  }

  undrawnCount(): number {
    let count = 0;
    for (const id of this.geometry.keys()) if (!this.drawn.has(id)) count += 1;
    return count;
  }

  pin(id: string): void {
    const count = this.pins.get(id) ?? 0;
    this.pins.set(id, count + 1);
    // Pinned means mounted by the ordinary set too, so that when the pin ends the camera's rules decide
    // whether it stays, and nothing changes under a card that is being used.
    if (!this.mountedSet.has(id)) {
      const was = this.isMounted(id);
      this.mountedSet.add(id);
      this.mountedAt.set(id, 0);
      if (!was) this.notify(id);
    }
  }

  unpin(id: string): void {
    const count = this.pins.get(id) ?? 0;
    if (count <= 1) {
      this.pins.delete(id);
      // It stays mounted until a step decides it is out: no flash on a pin that ends.
      this.outSince.delete(id);
      this.dirty = true;
      this.wake?.();
    } else {
      this.pins.set(id, count - 1);
    }
  }

  /** Everything mounted until the returned function is called. Counted, so two exports may overlap. */
  hold(): () => void {
    this.holds += 1;
    if (this.holds === 1) this.notifyAll();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holds -= 1;
      if (this.holds === 0) {
        this.dirty = true;
        this.notifyAll();
        this.wake?.();
      }
    };
  }

  holding(): boolean {
    return this.holds > 0;
  }

  isMounted(id: string): boolean {
    return this.holds > 0 || this.mountedSet.has(id);
  }

  mountedCount(): number {
    return this.mountedSet.size;
  }

  mountedIds(): string[] {
    return [...this.mountedSet];
  }

  subscribe(id: string, listener: () => void): () => void {
    let set = this.listeners.get(id);
    if (!set) {
      set = new Set();
      this.listeners.set(id, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0 && this.listeners.get(id) === set) this.listeners.delete(id);
    };
  }

  private notify(id: string): void {
    this.version += 1;
    const set = this.listeners.get(id);
    if (set) for (const listener of [...set]) listener();
  }

  private notifyAll(): void {
    this.version += 1;
    for (const set of [...this.listeners.values()]) for (const listener of [...set]) listener();
  }

  /** The ids the camera wants mounted, nearest the middle of the screen first, at most `cap`. */
  private wanted(): string[] {
    const view = this.view;
    if (!view || this.glance) return [];
    const reach = grow(view, this.config.margin);
    const x0 = Math.floor(reach.x / VIRTUAL_CELL);
    const x1 = Math.floor((reach.x + reach.w) / VIRTUAL_CELL);
    const y0 = Math.floor(reach.y / VIRTUAL_CELL);
    const y1 = Math.floor((reach.y + reach.h) / VIRTUAL_CELL);
    const seen = new Set<string>();
    const found: Array<[number, string]> = [];
    const cx = view.x + view.w / 2;
    const cy = view.y + view.h / 2;
    const consider = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      const rect = this.geometry.get(id)!;
      if (!meets(rect, reach)) return;
      found.push([Math.hypot(rect.x + rect.w / 2 - cx, rect.y + rect.h / 2 - cy), id]);
    };
    // A camera zoomed far out can span more cells than there are cards: walk the cards instead.
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > this.geometry.size) {
      for (const id of this.geometry.keys()) consider(id);
    } else {
      for (let ix = x0; ix <= x1; ix += 1) {
        for (let iy = y0; iy <= y1; iy += 1) {
          const bucket = this.cells.get(cellKey(ix, iy));
          if (bucket) for (const id of bucket) consider(id);
        }
      }
    }
    found.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
    if (found.length > this.config.cap) found.length = this.config.cap;
    return found.map((entry) => entry[1]);
  }

  /** Cards never drawn, nearest the middle of the screen first (the whole board when there is no camera yet). */
  private undrawn(): string[] {
    const view = this.view;
    const cx = view ? view.x + view.w / 2 : 0;
    const cy = view ? view.y + view.h / 2 : 0;
    const found: Array<[number, string]> = [];
    for (const [id, rect] of this.geometry) {
      if (this.drawn.has(id) || this.mountedSet.has(id)) continue;
      found.push([Math.hypot(rect.x + rect.w / 2 - cx, rect.y + rect.h / 2 - cy), id]);
    }
    found.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : 1));
    return found.map((entry) => entry[1]);
  }

  /**
   * One round: let go of the cards that left, mount the next `batch` that came near (then the next undrawn
   * ones, if the batch has room). Returns whether another round is wanted.
   */
  step(now: number): boolean {
    if (!this.view) return false;
    const wanted = this.wanted();
    const wantedSet = new Set(wanted);
    let again = false;

    // Release first, so a card that left frees its place before one that arrived takes it.
    const keep = this.glance ? undefined : grow(this.view, this.config.keepMargin);
    for (const id of [...this.mountedSet]) {
      const rect = this.geometry.get(id);
      const stays = wantedSet.has(id) || (keep !== undefined && rect !== undefined && meets(rect, keep));
      if (stays || this.pins.has(id) || this.holds > 0) {
        this.outSince.delete(id);
        continue;
      }
      // Not before the card has been drawn and measured (or, if nothing ever draws it, a couple of seconds).
      const age = now - (this.mountedAt.get(id) ?? Number.NEGATIVE_INFINITY);
      if (age < this.config.minMountMs || (!this.drawn.has(id) && age < 2000)) {
        again = true;
        continue;
      }
      // At the glance step the contents go at once: the shell already shows the face, and the board restyles
      // once for the flip instead of once more for every element of cards about to be removed.
      const delay = this.glance ? this.config.glanceReleaseMs : this.config.releaseMs;
      const since = this.outSince.get(id) ?? (delay === 0 ? now : undefined);
      if (since === undefined) {
        this.outSince.set(id, now);
        again = true;
        continue;
      }
      if (now - since >= delay) {
        this.outSince.delete(id);
        this.mountedSet.delete(id);
        this.mountedAt.delete(id);
        this.notify(id);
      } else {
        again = true;
      }
    }

    // Arrivals: the near ones first, then the background pass; a batch a step.
    let mountedNow = 0;
    const mount = (id: string) => {
      this.mountedSet.add(id);
      this.mountedAt.set(id, now);
      this.outSince.delete(id);
      mountedNow += 1;
      this.notify(id);
    };
    const queue = wanted.filter((id) => !this.mountedSet.has(id));
    for (const id of queue) {
      if (mountedNow >= this.config.batch) break;
      mount(id);
    }
    if (mountedNow < queue.length) again = true;
    if (mountedNow < this.config.batch) {
      const rest = this.undrawn();
      for (const id of rest) {
        if (mountedNow >= this.config.batch) break;
        mount(id);
      }
      if (mountedNow < rest.length) again = true;
    }

    this.dirty = again;
    return again;
  }

  /** True when a view or box change has not been stepped yet. */
  needsStep(): boolean {
    return this.dirty;
  }

  /** The mounted set computed from scratch with no batching or delay: what a settled camera converges on. */
  settle(): void {
    if (!this.view) return;
    let now = 0;
    for (let guard = 0; guard < 512; guard += 1) {
      now += 10_000;
      if (!this.step(now)) break;
    }
  }
}

/** The one board's virtualizer. The app shows one board at a time; a tab switch re-feeds the geometry. */
export const boardVirtualizer = new CardVirtualizer();

const DISABLE_KEY = "gtnh-factory-flow.no-virtual";

/** `localStorage["gtnh-factory-flow.no-virtual"] = "1"` turns the shell off (A/B, bugs). */
export function virtualizationEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISABLE_KEY) !== "1";
  } catch {
    return true;
  }
}
