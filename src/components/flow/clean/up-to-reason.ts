/**
 * How the board says why an Up to card runs less than its count (docs/up-to.md): one short word and a colour, shared
 * by the overview and the tooltips. Pure.
 */
import type { PlanUpTo } from "@/lib/solver/plan/types";
import { CC } from "./tokens";

type Reason = NonNullable<PlanUpTo["reason"]>;

/** The word for a reason. FULL is the quiet case and has none. */
export const UP_TO_WORD: Record<Reason, string> = {
  FULL: "Full",
  BOTTLENECK: "Bottleneck",
  STARVED: "Starved",
  CLOGGED: "Clogged",
  UNUSED: "Unused",
  LIMITED: "Limited",
};

/** The colour of a reason's word. */
export const UP_TO_COLOR: Record<Reason, string> = {
  FULL: CC.ok,
  BOTTLENECK: CC.gold,
  STARVED: CC.amber,
  CLOGGED: CC.amber,
  UNUSED: CC.muted,
  LIMITED: CC.muted,
};

/** The reason worth showing: none when the card is full or the solver gave none. */
export function shownReason(upTo: PlanUpTo | undefined): Reason | undefined {
  const reason = upTo?.reason;
  return reason && reason !== "FULL" ? reason : undefined;
}

/** A sentence for a tooltip about why the card runs as it does. */
export function upToSentence(upTo: PlanUpTo | undefined): string | undefined {
  switch (upTo?.reason) {
    case "FULL":
      return "Every machine runs flat out.";
    case "BOTTLENECK":
      return upTo.wants !== undefined
        ? `The plan would use ${round(upTo.wants)}.`
        : "The plan would use more.";
    case "STARVED":
      return "An input is short.";
    case "CLOGGED":
      return "An output has nowhere to go.";
    case "UNUSED":
      return "Nothing uses what it makes.";
    case "LIMITED":
      return "The plan holds it back.";
    default:
      return undefined;
  }
}

function round(value: number): string {
  return String(Math.round(value * 100) / 100);
}
