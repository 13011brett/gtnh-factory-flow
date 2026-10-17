# Up to: what the mod still needs from the website

Started 2026-10-18. The website is the product while the owner refines Up to with it (`docs/up-to.md` is the design);
the mod follows once the owner is happy. This file lists every change the website has that the mod does not, so the
mod's alignment pass is one list. Tick an item when the mod has it and it has been checked side by side.

Where things are:

- Website: worktree `C:\Users\jack\ff-upto`, branch `up-to-card` (local, not pushed), version 4.1.0.
- Mod: worktree `C:\Users\jack\gp-ut-data`, branch `up-to-mod` (local, not pushed). It already has the pin data, the
  solver port (checked answer for answer by `UpToParityTest`), the card's count and foot bar, port tiles and the well,
  reason outlines, the circuit badge, the count's own sounds and old Build targets kept display only.

## Solver

- [ ] Dead loops and clog locks (`findLoops` in `src/lib/solver/plan/readout.ts`, commit f6fe6dcb): rings in the blame
      graph over the read-out (STARVED to the makers of its short port, CLOGGED or UNUSED to the takers of its full port),
      strongly connected parts, all members STARVED = DEAD_LOOP, all CLOGGED/UNUSED = CLOG_LOCK. `SolutionView.upToLoops`,
      merged across islands. Re-run the parity export (`parity/up-to-export.test.ts`) so `UpToParityTest` covers the
      loop fixtures (`deadRing`, `clogRing`, `starvedChain`, `twoRings`).

## Card

- [ ] Colours: CLOGGED is purple `#B49CF0`, LIMITED is pink `#F472B6` (bar, outline, lit port, overview, tips). The
      others stay: FULL `#5EE9B5`, BOTTLENECK `#F06262`, STARVED `#E0A63A`, UNUSED `#8A8E97`, FORCED IN `#94C3F3`.
- [ ] The port a reason names is lit: STARVED's short input, CLOGGED's or UNUSED's output, and their `tied` rows; the
      tile striped in the reason's tone (body and stripe mixed from the tone as the free-end tiles mix theirs, 0.07 and
      0.13 over the surface), its edge and name in the tone. FULL, BOTTLENECK, LIMITED light nothing. On free-end and
      forced rows the reason's stripes replace theirs.
- [ ] Tier and amps chips look like buttons: the old card's raised bevel (light top-left, dark bottom-right), inverted
      with the label a pixel down while pressed; a fixed chip never presses.
- [ ] Editors keep the size of what they replace (the amps box the chip's width, the count box about its number's
      width). The mod uses a number popup for the count: check the amps chip.
- [ ] The circuit badge is the circuit's own icon only (no number drawn on it: its icon already shows one); tip
      "Circuit 24".
- [ ] Middle click clears anything set, everywhere: the card's count (to Any), a port's rate box and key, a drawer's
      rate, and in the overview every set box and rule key (machine count, resource lines, drawer rows). Each clear plays
      the unpin sound once; nothing sounds when nothing was set; never the browser's autoscroll.
- [ ] Dead loops and clog locks on the board: a notice per ring with Show me on its cards ("The Electrolyzer,
      Chemical Reactor and Mixer wait on each other. Nothing feeds the loop." / "The Electrolyzer and Mixer are stuck on
      Hydrogen. A drawer for it frees them."), the ring's cards with a 2 px outline in its tone that dims in the off half
      of the prompts' clock (steady under reduced motion), and the wires along its rows lit in the tone. Dead loop amber
      `#E0A63A`, clog lock purple `#B49CF0`.
- [ ] A setting for the reason outlines: Settings, Board, "Problem outlines" (`problemOutlines`), on by default, about line "Draws a card's edge in its bar's colour." Off keeps the normal edge; the bar, the lit port and the loops' outline stay.
- [ ] The zoomed-out view starts at a zoom of 0.5 (back above 0.52; it was 0.42) and its face shows the Up to bar along the foot: fill and track in the reason's tone, a bottleneck filled against what the line wants, the reason word on the bar while it reads; the count moves up above the bar.

## Overview

- [ ] Machine lines read "×0.25" then the gold set box: no "of".
- [ ] Every machine is always listed, at zero too, whatever its rule (fluid tanks excepted).
- [ ] Every input and output is always listed, at zero too: every resource an unwired port takes or makes, including a
      card at zero, and one card's output that another card's unwired input takes.
- [ ] Each machine line has the card's own tier and amps chips (same menu, wheel and typed amps as the card).
- [x] The Up to rule key shows "≤" (the mod already does).

## Board and top bar

- [ ] The owner's top bar refactor (branch `top-bar`, merged 2026-10-18): one row that never wraps, flat keys like the
      tabs and +, the bar across the whole width with the overview and the items list under it, and Settings' "Item
      browser" switch (left or right). Check what of it the mod's own layout already has.
- [ ] An annotations key at the board toolbar's far right, a pixel pencil, tip "Add a sticky note, box or arrow, or
      change the background": it opens the board's empty-board menu under the key (Add sticky note, Add box, Add
      arrow, landing in the middle of the view). The website's menu also has Background (its paper themes and
      patterns); the mod need not grow a background setting if it has none.
- [ ] The Peak/Avg key leaves the top toolbar; the overview's machine section keeps its own.

## Done in both (for reference)

- The rule (Any, Up to, Exactly) and its data, every old pin read as Up to, old Build plans converted to Up to with
  their targets kept display only.
- The solver: guard, push, drawers and Up to buffers as the player's own ends, the read-out (capable/disposal reasons,
  the starved-upstream bottleneck, wants), checked against the website on 67 plans.
- The card: what runs and what is set under the machine, the rule menu, the foot bar with its striped run-on, tiles of
  one shape, power as a tile, the well, the circuit badge in the well's top-left, the count's own click and tick
  sounds, reason outlines, drawer shortfalls naming the card that holds them back.
- Circuit as an input is gone from both.
