import type { FactoryNode } from "@/lib/model/types";
import { parseAmountWithSuffix } from "../../rate-rule";

/**
 * The rate an open port is held to (the mod's key and box on an unwired port):
 * `FactoryNode.portRates[handleId]`, units per second, absent = the plan decides.
 * Pure parts here; `PortRateControls` draws them.
 */

/** A typed rate: `2.5k`, `1M`, `1/3`, `3`. Positive and finite, else undefined. */
export function parseRateText(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const fraction = trimmed.match(/^([+]?[0-9]*\.?[0-9]+)\s*\/\s*([0-9]*\.?[0-9]+)$/);
  const value = fraction
    ? Number.parseFloat(fraction[1]!) / Number.parseFloat(fraction[2]!)
    : parseAmountWithSuffix(trimmed);
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
}

export interface StepModifiers {
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey?: boolean;
}

/**
 * One wheel step of the box, the mod's (`PortSlot`, `DrawerCard.stepRate`): the shown figure rounded, then plus or
 * minus 1 in the shown unit, 10 with Ctrl, 100 with Shift; from what the port runs at now when nothing is set; a step
 * below 1 clears (undefined). `shown` is in the board's unit.
 */
export function stepShownRate(shown: number, up: boolean, modifiers: StepModifiers): number | undefined {
  const step = modifiers.shiftKey ? 100 : modifiers.ctrlKey || modifiers.metaKey ? 10 : 1;
  const next = Math.max(0, Math.round(shown) + (up ? step : -step));
  return next >= 1 ? next : undefined;
}

/** `portRates` with one handle set or cleared; undefined when none is left. */
export function withPortRate(
  rates: Record<string, number> | undefined,
  handleId: string,
  perSecond: number | undefined,
): Record<string, number> | undefined {
  const next = { ...(rates ?? {}) };
  if (perSecond === undefined || !(perSecond > 0) || !Number.isFinite(perSecond)) delete next[handleId];
  else next[handleId] = perSecond;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function portRatePatch(
  node: Pick<FactoryNode, "portRates">,
  handleId: string,
  perSecond: number | undefined,
): Pick<FactoryNode, "portRates"> {
  return { portRates: withPortRate(node.portRates, handleId, perSecond) };
}
