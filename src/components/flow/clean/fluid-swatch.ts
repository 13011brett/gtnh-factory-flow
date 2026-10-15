import type { CSSProperties } from "react";
import type { ResourceIconAtlasRef } from "@/lib/model/types";
import { getFallbackFluidColor } from "@/components/nei/ResourceIcon";

/**
 * How much darker the dataset's fluid renders are than the fluid as the game draws it flat: the renders carry the
 * block face's shading (about two thirds), while the mod draws the fluid's still texture unshaded (Hyb.fluid,
 * GuiDraw.drawFluidTexture). Sulfuric Acid's render is #D64500, the mod's square about #FF7A00; Distilled Water
 * #2C38A7 against about #3355FF.
 */
const UNSHADE = 1.5;

/** The fluid's colour as the mod's square shows it: the render's dominant colour, its shading taken back out. */
export function fluidSwatchColor(resource: { id: string; dominantColor?: string; iconAtlas?: ResourceIconAtlasRef }): string {
  const base = resource.dominantColor ?? resource.iconAtlas?.dominantColor ?? getFallbackFluidColor(resource.id);
  const match = /^#([0-9a-f]{6})$/i.exec(base);
  if (!match) return base;
  const value = Number.parseInt(match[1], 16);
  const channel = (shift: number) => Math.min(255, Math.round(((value >> shift) & 255) * UNSHADE));
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

/** A fluid's square (the card's, the drawer's, the overview's): the fluid's colour, flat, as the mod draws it. */
export function fluidSwatchStyle(
  resource: { id: string; dominantColor?: string; iconAtlas?: ResourceIconAtlasRef },
): CSSProperties {
  return { backgroundColor: fluidSwatchColor(resource) };
}
