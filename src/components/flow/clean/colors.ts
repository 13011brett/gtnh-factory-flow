/**
 * Colour helpers for the clean look. Pure functions of hex strings so the
 * drawers, forced rows and overview derive their mixes from the same palette
 * the card uses: when a token moves, every mix moves with it.
 */

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const value = Number.parseInt(full, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(channels: readonly [number, number, number]): string {
  return `#${channels.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/**
 * `t` of `a`, the rest of `b`, per channel rounded: the mod's `Hyb.mix`, in the
 * same float32 arithmetic and half-up rounding, so every mix matches its Java twin.
 */
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const s = Math.fround(Math.max(0, Math.min(1, t)));
  const rest = Math.fround(1 - s);
  return toHex(
    [0, 1, 2].map((i) =>
      Math.floor(Math.fround(Math.fround(ca[i]! * s) + Math.fround(cb[i]! * rest)) + 0.5),
    ) as [number, number, number],
  );
}

/** Black or white label for a flat chip: by luminance, not by the table's own text field. */
export function contrastInk(background: string): "#111111" | "#FFFFFF" {
  const [r, g, b] = parseHex(background);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance > 0.5 ? "#111111" : "#FFFFFF";
}

/** rgba() string for a hex colour at an alpha. */
export function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}
