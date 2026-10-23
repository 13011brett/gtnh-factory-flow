/**
 * How the board says why an Up to card runs less than its count (docs/up-to.md): one short word and a colour, shared
 * by the overview and the tooltips. Pure.
 */
import type { PlanUpTo } from "@/lib/solver/plan/types";

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

/** The colour of a reason's word: the card's foot bar tones (clean.css `.cc-foot[data-tone]`). */
export const UP_TO_COLOR: Record<Reason, string> = {
  FULL: "#5ee9b5",
  BOTTLENECK: "#f06262",
  STARVED: "#e0a63a",
  CLOGGED: "#b49cf0",
  UNUSED: "#8a8e97",
  LIMITED: "#f472b6",
};

/** The reason worth showing: none when the card is full or the solver gave none. */
export function shownReason(upTo: PlanUpTo | undefined): Reason | undefined {
  const reason = upTo?.reason;
  return reason && reason !== "FULL" ? reason : undefined;
}

/** A sentence for a tooltip about why the card runs as it does. */
export function upToSentence(upTo: PlanUpTo | undefined): string | undefined {
  // Stopped by a spare output elsewhere on the line (`stranded-surplus.ts`): that, not its own rows, is the cause.
  // No direction: a starved card's spare is usually before it, a clogged one's after.
  if (
    upTo?.stranded &&
    (upTo.reason === "UNUSED" || upTo.reason === "CLOGGED" || upTo.reason === "STARVED")
  ) {
    return `A spare ${upTo.stranded.resourceName} has nowhere to go, so this line can't run.`;
  }
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
      // CLOGGED at zero. Its output is almost always wired, so "nothing uses it" would point at the wrong fix.
      return "An output backs up, so none run.";
    case "LIMITED":
      return "The plan holds it back.";
    default:
      return undefined;
  }
}

function round(value: number): string {
  return String(Math.round(value * 100) / 100);
}
