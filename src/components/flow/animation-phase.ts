"use client";

import { useEffect, type RefObject } from "react";

/**
 * Every animation on the board that BREATHES, by keyframe name.
 *
 * The board has one heartbeat: two marks pulsing at different moments read
 * as unrelated faults, pulsing together as one message. That takes one
 * PERIOD (`--board-pulse` in globals.css, every rule's duration) and one
 * PHASE, which this module provides: a CSS animation's clock starts when it
 * is applied, so a card scrolled into view, recycled by React Flow or newly
 * lit by a solve would otherwise start its own cycle.
 *
 * Add a keyframe here when you add a breathing state, and give it
 * `--board-pulse` as its duration. A pulse missing from this list still runs,
 * just out of step. One-shot flashes are deliberately absent: aligning them
 * to the clock would only delay their answer.
 */
export const BOARD_PULSE_ANIMATIONS = [
  // Hovered/selected resource: the glow wash on cards, and the shape-clipped
  // one drawers wear.
  "resource-breathe",
  "resource-breathe-led",
  // A card with a slot nobody wired: the dashed slot, the reason cell, the
  // ring, and the wash layer the cell and the board notice fade on.
  "unwired-port-breathe",
  "unwired-reason-breathe",
  "unwired-wash-breathe",
  "unwired-ring-breathe",
  // A ring of machines feeding each other with nothing coming in, and the
  // wires that close the loop.
  "dead-loop-breathe",
  "dead-loop-wire-breathe",
  // Its mirror: machines frozen because their own surplus filled every
  // escape route, and the wires the jam runs along.
  "clog-lock-breathe",
  "clog-lock-wire-breathe",
] as const;

const BOARD_PULSE_SET: ReadonlySet<string> = new Set(BOARD_PULSE_ANIMATIONS);

/**
 * `startTime = 0` pins an animation to the origin of the document timeline,
 * which every element on the page shares. Set it on every mark and they are all
 * at the same point of the same cycle, whenever each one arrived.
 *
 * `subtree` because a glow is often painted by a ::after, and a pseudo
 * element's animation is not on its element's own list.
 */
function pinToDocumentTimeline(element: Element, names: ReadonlySet<string>) {
  if (!element.getAnimations) {
    return;
  }
  for (const animation of element.getAnimations({ subtree: true })) {
    const name = (animation as Animation & { animationName?: string }).animationName;
    if (!name || !names.has(name)) {
      continue;
    }
    try {
      animation.startTime = 0;
    } catch {
      // A timeline that refuses the write is not worth a broken board; the
      // mark still shows, it just keeps its own phase.
    }
  }
}

/**
 * Puts every breathing mark on the board on one clock. Called once, from the
 * board root, not per card.
 *
 * `animationstart` BUBBLES, so the root hears every pulse that begins
 * beneath it, including the board's notices, which live outside any card.
 * Pinning does not restart an animation, so the handler cannot feed itself,
 * and it runs once per mark rather than per frame. The mount sweep covers
 * what was already running before the listener existed.
 */
export function useBoardPulseSync(ref: RefObject<Element | null>) {
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    // One frame's grace: an animation does not exist on the element until
    // styles have been applied, and an effect can run before that. Without the
    // wait getAnimations() returns nothing and the mark stays adrift.
    const frame = requestAnimationFrame(() => {
      pinToDocumentTimeline(element, BOARD_PULSE_SET);
    });
    const onStart = (event: Event) => {
      const { animationName, target } = event as AnimationEvent;
      if (!BOARD_PULSE_SET.has(animationName) || !(target instanceof Element)) {
        return;
      }
      pinToDocumentTimeline(target, BOARD_PULSE_SET);
    };
    element.addEventListener("animationstart", onStart);
    return () => {
      cancelAnimationFrame(frame);
      element.removeEventListener("animationstart", onStart);
    };
  }, [ref]);
}

/**
 * HOW MUCH OF THE BOARD MAY BREATHE AT ONCE.
 *
 * Every running CSS animation is a compositor layer and a style tick, and on
 * a board of a few hundred marked cards they cost more than everything else
 * the board does: 200 cards with an unwired port, idle, kept the main thread
 * 100% busy (35 ms a frame; 2,580 layers) and cut a pan or a zoom to 2-11 fps.
 * With the animations off the same page idles at 0.1 s of work in 2 s.
 *
 * So the board keeps a budget, in three tiers on `data-pulse`:
 *
 * - none (a small board): every mark breathes, as designed. A card with an
 *   unwired port runs five animations.
 * - `ring`: only the card-level ring breathes (one animation a card); the
 *   slot, reason-cell and wash marks, and a hovered resource's glow, are held
 *   at a steady mid brightness.
 * - `still`: nothing breathes; every mark is a steady colour.
 *
 * The tier follows the number of cards that carry a mark, counted from the
 * node wrappers (a thousand cheap reads, not a walk of the whole DOM), twice
 * a second at most and only when the board is on screen. It moves down at
 * once and back up only with some slack, so a board near a limit does not
 * flicker between two looks. The rules are in globals.css ("pulse tiers").
 */
export const PULSE_ATTRIBUTE = "data-pulse";

/** Cards with a mark: up to this many, every mark breathes. */
export const PULSE_FULL_MARKED = 12;
/** Cards on the board: up to this many, a hovered resource's glow breathes. */
export const PULSE_FULL_CARDS = 100;
/** Cards with a mark: up to this many, their rings breathe. */
export const PULSE_RING_MARKED = 60;

export type PulseTier = "full" | "ring" | "still";

/** The tier for a board with `marked` marked cards out of `cards`, given the tier it is in. */
export function pulseTier(marked: number, cards: number, current: PulseTier = "full"): PulseTier {
  // A tier is kept up to its limit and climbed back into only below 80% of it.
  const limit = (cap: number, inside: boolean) => (inside ? cap : cap * 0.8);
  const insideFull = current === "full";
  if (
    marked <= limit(PULSE_FULL_MARKED, insideFull) &&
    cards <= limit(PULSE_FULL_CARDS, insideFull)
  ) {
    return "full";
  }
  return marked <= limit(PULSE_RING_MARKED, current !== "still") ? "ring" : "still";
}

/** The verdicts whose card carries a breathing mark (see globals.css). */
const MARKED_VERDICTS: ReadonlySet<string> = new Set(["unwired", "dead-loop", "clogged"]);

/** Counts the board's cards and the ones carrying a breathing mark, from the node wrappers. */
export function countPulseMarks(board: Element): { cards: number; marked: number } {
  const nodes = board.querySelector(".react-flow__nodes")?.children;
  let cards = 0;
  let marked = 0;
  if (!nodes) {
    return { cards, marked };
  }
  for (let i = 0; i < nodes.length; i++) {
    cards++;
    const verdict = nodes[i].firstElementChild?.getAttribute("data-verdict");
    if (verdict && MARKED_VERDICTS.has(verdict)) {
      marked++;
    }
  }
  return { cards, marked };
}

/** Keeps `data-pulse` on the board at the tier its marked cards allow. Called once, from the board root. */
export function useBoardPulseGate(ref: RefObject<Element | null>) {
  useEffect(() => {
    const board = ref.current;
    if (!board) {
      return;
    }
    let tier: PulseTier = "full";
    const update = () => {
      if (document.hidden) {
        return;
      }
      const { cards, marked } = countPulseMarks(board);
      const next = pulseTier(marked, cards, tier);
      if (next !== tier) {
        tier = next;
        if (next === "full") {
          board.removeAttribute(PULSE_ATTRIBUTE);
        } else {
          board.setAttribute(PULSE_ATTRIBUTE, next);
        }
      }
    };
    const frame = requestAnimationFrame(update);
    const timer = window.setInterval(update, 500);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
    };
  }, [ref]);
}
