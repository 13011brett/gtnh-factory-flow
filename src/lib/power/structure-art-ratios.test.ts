import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { STRUCTURE_ART_RATIOS, artRatio } from "./structure-art-ratios";

const DIR = join(process.cwd(), "public", "power-art");

describe("structure art ratios", () => {
  it("has every render in public/power-art, at its own width over height", () => {
    const files = readdirSync(DIR).filter((file) => file.endsWith(".png"));
    expect(Object.keys(STRUCTURE_ART_RATIOS).sort()).toEqual(files.map((file) => file.slice(0, -4)).sort());
    for (const file of files) {
      const png = readFileSync(join(DIR, file));
      const ratio = png.readUInt32BE(16) / png.readUInt32BE(20);
      expect(STRUCTURE_ART_RATIOS[file.slice(0, -4)]).toBeCloseTo(ratio, 2);
    }
  });

  it("reads a face's picture by its url, 1 for an icon", () => {
    expect(artRatio("/power-art/large-chemical-reactor.png")).toBeCloseTo(4 / 3, 2);
    expect(artRatio("/icons/gregtech/foo.png")).toBe(1);
    expect(artRatio(undefined)).toBe(1);
  });
});
