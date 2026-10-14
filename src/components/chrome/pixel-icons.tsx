import type { CSSProperties } from "react";

/** The mod's 9 x 9 pictures (`Icons.java`), drawn from the same rows of text: '#' lit, '.' clear. */
export const PIXEL_ICONS = {
  undo: ["..#......", ".##......", "#######..", "########.", ".##...##.", "..#...##.", "......##.", "..#####..", "..####..."],
  bug: [".#.....#.", "..#...#..", "...###...", "#.#####.#", ".###.###.", "#.##.##.#", ".###.###.", "#.##.##.#", "..##.##.."],
  gear: ["..##.##..", "..#####..", "#########", "###...###", ".##...##.", "###...###", "#########", "..#####..", "..##.##.."],
  help: ["..#####..", ".##...##.", "......##.", ".....##..", "....##...", "....##...", ".........", "....##...", "....##..."],
  bulb: ["...###...", "..##.##..", ".##...##.", ".##...##.", "..##.##..", "...###...", ".........", "...###...", "...###..."],
} as const;

export type PixelIconName = keyof typeof PIXEL_ICONS;

/** The Non-recipe key's bolt, 7 x 11 (`PowerPicker.bolt`): runs of {x, y, width}. */
const BOLT_RUNS: ReadonlyArray<readonly [number, number, number]> = [
  [4, 0, 3],
  [3, 1, 3],
  [3, 2, 2],
  [2, 3, 3],
  [1, 4, 6],
  [0, 5, 6],
  [3, 6, 2],
  [2, 7, 2],
  [2, 8, 1],
  [1, 9, 1],
  [1, 10, 1],
];

export function PixelIcon({
  name,
  mirror = false,
  className,
  style,
}: {
  name: PixelIconName;
  mirror?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const rows = PIXEL_ICONS[name];
  const d: string[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== "#") {
        x += 1;
        continue;
      }
      const from = x;
      while (x < row.length && row[x] === "#") x += 1;
      const left = mirror ? row.length - x : from;
      d.push(`M${left} ${y}h${x - from}v1h-${x - from}z`);
    }
  });
  return (
    <svg
      className={className}
      style={style}
      width="9"
      height="9"
      viewBox="0 0 9 9"
      shapeRendering="crispEdges"
      aria-hidden
      fill="currentColor"
    >
      <path d={d.join("")} />
    </svg>
  );
}

export function PixelBolt({ className }: { className?: string }) {
  const d = BOLT_RUNS.map(([x, y, w]) => `M${x} ${y}h${w}v1h-${w}z`).join("");
  return (
    <svg className={className} width="7" height="11" viewBox="0 0 7 11" shapeRendering="crispEdges" aria-hidden fill="currentColor">
      <path d={d} />
    </svg>
  );
}
