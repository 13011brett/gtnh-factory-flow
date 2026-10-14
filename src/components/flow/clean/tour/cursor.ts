/**
 * The tour's cursor: a gold arrow (so it never passes for the player's) that glides on gentle arcs, leaves a ring
 * when it clicks, shows the button it uses as a small mouse beside it, the keys it presses as key caps, and fades
 * when it steps aside (off the right edge, so it rests on nothing). Drawn imperatively into one layer; nothing
 * here re-renders React.
 */

export type MouseGlyph = "left" | "middle" | "right" | "wheel";

/** Resolves after the page has drawn `n` frames (what is under the pointer is found as the page draws). */
export function draws(n = 2): Promise<void> {
  return new Promise((resolve) => {
    const step = (left: number) => {
      if (left <= 0) resolve();
      else requestAnimationFrame(() => step(left - 1));
    };
    step(n);
  });
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ARROW =
  "<svg width='22' height='28' viewBox='0 0 22 28' xmlns='http://www.w3.org/2000/svg' shape-rendering='crispEdges'>" +
  "<path d='M1 1 L1 22 L6 17 L10 26 L14 24 L10 15 L17 15 Z' fill='#FFD257' stroke='#1b1304' stroke-width='1.5' stroke-linejoin='miter'/></svg>";

const MOUSE: Record<MouseGlyph, string> = {
  left: "<svg width='14' height='20' viewBox='0 0 14 20' xmlns='http://www.w3.org/2000/svg'><rect x='1' y='1' width='12' height='18' rx='5' fill='#23252a' stroke='#e8e9ee'/><path d='M1 8h12M7 1v7' stroke='#e8e9ee' fill='none'/><path d='M1.5 8V6a5 5 0 0 1 5.5-5v7z' fill='#ffd257'/></svg>",
  right:
    "<svg width='14' height='20' viewBox='0 0 14 20' xmlns='http://www.w3.org/2000/svg'><rect x='1' y='1' width='12' height='18' rx='5' fill='#23252a' stroke='#e8e9ee'/><path d='M1 8h12M7 1v7' stroke='#e8e9ee' fill='none'/><path d='M12.5 8V6A5 5 0 0 0 7 1v7z' fill='#ffd257'/></svg>",
  middle:
    "<svg width='14' height='20' viewBox='0 0 14 20' xmlns='http://www.w3.org/2000/svg'><rect x='1' y='1' width='12' height='18' rx='5' fill='#23252a' stroke='#e8e9ee'/><path d='M1 8h12M7 1v7' stroke='#e8e9ee' fill='none'/><rect x='5.5' y='2.5' width='3' height='5' fill='#ffd257'/></svg>",
  wheel:
    "<svg width='14' height='20' viewBox='0 0 14 20' xmlns='http://www.w3.org/2000/svg'><rect x='1' y='1' width='12' height='18' rx='5' fill='#23252a' stroke='#e8e9ee'/><path d='M1 8h12M7 1v7' stroke='#e8e9ee' fill='none'/><rect x='5.5' y='2.5' width='3' height='5' fill='#ffd257'/></svg>",
};

export function mouseGlyphSvg(kind: MouseGlyph): string {
  return MOUSE[kind];
}

export class Cursor {
  readonly el: HTMLElement;
  private readonly badgeEl: HTMLElement;
  private readonly capsEl: HTMLElement;
  private readonly layer: HTMLElement;
  x = -40;
  y = -40;
  /** Set to jump instead of glide (a hurried step). */
  fast = false;
  private sign = 1;
  private visible = false;
  private fadeTimer = 0;
  /** Called with every place the cursor takes while it glides (a drag moves the pointer with it). */
  onMove?: (x: number, y: number) => void;

  constructor(layer: HTMLElement) {
    this.layer = layer;
    this.el = document.createElement("div");
    this.el.className = "tour-cursor";
    this.el.dataset.tour = "cursor";
    this.el.innerHTML = ARROW;
    this.badgeEl = document.createElement("div");
    this.badgeEl.className = "tour-cursor-badge";
    this.capsEl = document.createElement("div");
    this.capsEl.className = "tour-cursor-caps";
    this.el.append(this.badgeEl, this.capsEl);
    layer.append(this.el);
    this.apply();
  }

  private apply(): void {
    this.el.style.transform = `translate(${this.x}px, ${this.y}px)`;
  }

  /** The place the cursor's tip is at, for keeping a note off it. */
  tip(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  place(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.apply();
    this.onMove?.(x, y);
  }

  show(): void {
    window.clearTimeout(this.fadeTimer);
    this.visible = true;
    this.el.dataset.on = "";
  }

  /** Fades out where it is. */
  hide(): void {
    this.visible = false;
    delete this.el.dataset.on;
  }

  /** Off the right edge of the screen, so it rests on nothing, and fades. */
  async stepAside(): Promise<void> {
    if (!this.visible) return;
    await this.glide(window.innerWidth + 30, Math.min(window.innerHeight - 40, this.y + 20), 420);
    this.hide();
  }

  /** A glide on a gentle arc, brisk, never faster than the page draws. Resolves when it arrives. */
  async glide(x: number, y: number, ms?: number): Promise<void> {
    this.show();
    const x0 = this.x;
    const y0 = this.y;
    const dx = x - x0;
    const dy = y - y0;
    const dist = Math.hypot(dx, dy);
    if (this.fast || dist < 1 || x0 < -20) {
      this.place(x, y);
      await draws(2);
      return;
    }
    const duration = ms ?? Math.min(720, 200 + dist * 0.55);
    // The control point sits off the straight line: a gentle arc, bending the other way each time.
    const nx = -dy / dist;
    const ny = dx / dist;
    const bend = Math.min(60, dist * 0.12) * this.sign;
    this.sign = -this.sign;
    const cx = x0 + dx / 2 + nx * bend;
    const cy = y0 + dy / 2 + ny * bend;
    const t0 = performance.now();
    await new Promise<void>((resolve) => {
      const frame = (now: number) => {
        if (this.fast) {
          this.place(x, y);
          resolve();
          return;
        }
        const t = Math.min(1, (now - t0) / duration);
        const e = t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
        const u = 1 - e;
        this.place(u * u * x0 + 2 * u * e * cx + e * e * x, u * u * y0 + 2 * u * e * cy + e * e * y);
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });
    await draws(2);
  }

  /** The ring a click leaves. */
  ripple(button: "left" | "right" | "middle" = "left"): void {
    const ring = document.createElement("div");
    ring.className = "tour-ring";
    ring.dataset.tour = "ring";
    ring.dataset.button = button;
    ring.style.left = `${this.x}px`;
    ring.style.top = `${this.y}px`;
    this.layer.append(ring);
    window.setTimeout(() => ring.remove(), 520);
  }

  /** The small mouse beside the cursor, showing the button it uses; null clears it. */
  badge(kind: MouseGlyph | null): void {
    if (!kind) {
      this.badgeEl.innerHTML = "";
      return;
    }
    this.badgeEl.innerHTML = MOUSE[kind];
  }

  /** Key caps beside the cursor for the keys it presses (R, Shift, Esc, the minimap's keys). */
  caps(keys: string[] | null): void {
    this.capsEl.replaceChildren();
    if (!keys) return;
    for (const key of keys) {
      const cap = document.createElement("span");
      cap.className = "tour-cap";
      cap.textContent = key;
      this.capsEl.append(cap);
    }
  }

  /** A turn of the wheel as a small arrow. */
  wheelArrow(direction: 1 | -1): void {
    this.badge("wheel");
    this.capsEl.replaceChildren();
    const arrow = document.createElement("span");
    arrow.className = "tour-cap tour-cap-arrow";
    arrow.textContent = direction > 0 ? "↓" : "↑";
    this.capsEl.append(arrow);
  }

  destroy(): void {
    window.clearTimeout(this.fadeTimer);
    this.el.remove();
  }
}
