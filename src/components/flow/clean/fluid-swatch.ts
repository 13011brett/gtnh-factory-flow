import type { CSSProperties } from "react";
import type { ResourceIconAtlasRef } from "@/lib/model/types";
import { getFallbackFluidColor } from "@/components/nei/ResourceIcon";

/**
 * The dataset's fluid renders are darker than the fluid as the game draws it flat (the renders carry the block face's
 * shading; the mod draws the still texture unshaded: Hyb.fluid, GuiDraw.drawFluidTexture). A gamma of 0.7 takes most of
 * it back without washing out the pale ones: Sulfuric Acid #D64500 to #E26600 (the mod about #FF7A00), Distilled Water
 * #2C38A7 to #4B58BE (about #3355FF), Nitric Acid #B6B387 to #C9C7A3.
 */
const UNSHADE_GAMMA = 0.7;

/** The fluid's colour as the mod's square shows it: the render's dominant colour, its shading taken back out. */
export function fluidSwatchColor(resource: { id: string; dominantColor?: string; iconAtlas?: ResourceIconAtlasRef }): string {
  const base = resource.dominantColor ?? resource.iconAtlas?.dominantColor ?? getFallbackFluidColor(resource.id);
  const match = /^#([0-9a-f]{6})$/i.exec(base);
  if (!match) return base;
  const value = Number.parseInt(match[1], 16);
  const channel = (shift: number) => Math.round(255 * Math.pow(((value >> shift) & 255) / 255, UNSHADE_GAMMA));
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, "0")).join("")}`;
}

/** A fluid's square (the card's, the drawer's, the overview's): the fluid's colour, flat, as the mod draws it. */
export function fluidSwatchStyle(
  resource: { id: string; dominantColor?: string; iconAtlas?: ResourceIconAtlasRef },
): CSSProperties {
  return { backgroundColor: fluidSwatchColor(resource) };
}
