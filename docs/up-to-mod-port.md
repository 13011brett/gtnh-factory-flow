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

- [x] Dead loops and clog locks (`findLoops` in `src/lib/solver/plan/readout.ts`, commit f6fe6dcb): rings in the blame
      graph over the read-out (STARVED to the makers of its short port, CLOGGED or UNUSED to the takers of its full port),
      strongly connected parts, all members STARVED = DEAD_LOOP, all CLOGGED/UNUSED = CLOG_LOCK. `SolutionView.upToLoops`,
      merged across islands. Re-run the parity export (`parity/up-to-export.test.ts`) so `UpToParityTest` covers the
      loop fixtures (`deadRing`, `clogRing`, `starvedChain`, `twoRings`).

## Card

- [x] Colours: CLOGGED is purple `#B49CF0`, LIMITED is pink `#F472B6` (bar, outline, lit port, overview, tips). The
      others stay: FULL `#5EE9B5`, BOTTLENECK `#F06262`, STARVED `#E0A63A`, UNUSED `#8A8E97`, FORCED IN `#94C3F3`.
- [x] The port a reason names is lit: STARVED's short input, CLOGGED's or UNUSED's output, and their `tied` rows; the
      tile striped in the reason's tone (body and stripe mixed from the tone as the free-end tiles mix theirs, 0.07 and
      0.13 over the surface), its edge and name in the tone. FULL, BOTTLENECK, LIMITED light nothing. On free-end and
      forced rows the reason's stripes replace theirs.
- [x] Tier and amps chips look like buttons: the old card's raised bevel (light top-left, dark bottom-right), inverted
      with the label a pixel down while pressed; a fixed chip never presses.
- [x] Editors keep the size of what they replace (the amps box the chip's width, the count box about its number's
      width). The mod types both in place now: the amps in the chip, the count in a box where its number is.
- [x] The circuit badge is the circuit's own icon only (no number drawn on it: its icon already shows one); tip
      "Circuit 24".
- [x] Middle click clears anything set, everywhere: the card's count (to Any), a port's rate box and key, a drawer's
      rate, and in the overview every set box and rule key (machine count, resource lines, drawer rows). Each clear plays
      the unpin sound once; nothing sounds when nothing was set; never the browser's autoscroll.
- [x] Dead loops and clog locks on the board: a notice per ring with Show me on its cards ("The Electrolyzer,
      Chemical Reactor and Mixer wait on each other. Nothing feeds the loop." / "The Electrolyzer and Mixer are stuck on
      Hydrogen. A drawer for it frees them."), the ring's cards with a 2 px outline in its tone that dims in the off half
      of the prompts' clock (steady under reduced motion), and the wires along its rows lit in the tone. Dead loop amber
      `#E0A63A`, clog lock purple `#B49CF0`.
- [x] A setting for the reason outlines: Settings, Board, "Problem outlines" (`problemOutlines`), on by default, about line "Draws a card's edge in its bar's colour." Off keeps the normal edge; the bar, the lit port and the loops' outline stay.
- [x] The zoomed-out view starts at a zoom of 0.65 (back above 0.67; it was 0.42) and its face shows the Up to bar along the foot: fill and track in the reason's tone, a bottleneck filled against what the line wants, the reason word on the bar while it reads; the count moves up above the bar.
- [ ] A setting for where the zoomed-out view starts: Settings, Board, "Zoomed-out view" (`zoomedOutAt`), a slider of zooms from 35% to 100% of a 1:1 interface in steps of 5, 65% by default, about line "Cards turn simple below this zoom." The board changes at once, leaving the view the same 0.02 above; the tour keeps its zoom above it.
- [ ] A setting that stops the wheel changing values: Settings, Board, "Scroll changes values" (`scrollChangesValues`), a switch, on by default, about line "Scroll over a number or chip to change it." Off, no wheel steps a count, chip, rate box, rule key, drawer or overview line or a settings row; over the board the wheel zooms, and the overview rail, the item list and long menus still scroll.

## Overview

- [x] Machine lines read "×0.25" then the gold set box: no "of".
- [x] Every machine is always listed, at zero too, whatever its rule (fluid tanks excepted).
- [x] Every input and output is always listed, at zero too: every resource an unwired port takes or makes, including a
      card at zero, and one card's output that another card's unwired input takes.
- [x] Each machine line has the card's own tier and amps chips (same menu, wheel and typed amps as the card).
- [x] The Up to rule key shows "≤" (the mod already does).

## Board and top bar

- [x] The owner's top bar refactor (branch `top-bar`, merged 2026-10-18): one row that never wraps, flat keys like the
      tabs and +, the bar across the whole width with the overview and the items list under it, and Settings' "Item
      browser" switch (left or right). The mod's bar now has the website's keys in its order (Plans, Share with Invite
      people first in its menu, the account; Community is a shelf in Plans). NEI's list is NEI's own: it keeps its side
      and its place beside the bar, so the mod has no Item browser switch.
- [x] An annotations key at the board toolbar's far right, a pixel pencil, tip "Add a sticky note, box or arrow, or
      change the background": it opens the board's empty-board menu under the key (Add sticky note, Add box, Add
      arrow, landing in the middle of the view). The website's menu also has Background (its paper themes and
      patterns); the mod need not grow a background setting if it has none.
- [x] The Peak/Avg key leaves the top toolbar; the overview's machine section keeps its own.

## Side by side, 2026-10-17

The alumina line (`src/test/resources/factory-flow/alumina-line-shared-reactor.json` in the mod) on both, at the same
board px (the website at 960x540 and 2x, the dev game at 1920x1080 and GUI scale 2), card by card, zoomed out, the
overview, the settings and an Exactly pin.

- Fixed on the website (a187c4c4): an Up to card below its count was counted twice wherever a flow is scaled by
  utilization (finalize had made utilization the card's level): the overview read Crushed Bauxite -0.39 for -20, an
  output tile 97.66 L/s for 5k, and it listed inputs the plan does not have. Utilization is 1 again for a running card
  and the power row reads the level from the read-out. A shared card's first recipe also read its whole pool's count
  (87% x0.657 for 86% x0.563). Production has both until this is deployed.
- Fixed in the mod (85bfbb44, 91e6d794): the top bar's keys; a shared machine is one overview line (its recipes'
  machines and draw summed, the pool's count and set box) and lines go lowest tier first; the zoomed-out count is the
  website's 20 px face; the settings rows carry the website's lines and order, and Controls has the list of keys and
  the tour.
- The same now: card numbers and tiles, lit ports, foot bars, the rule menu, drawers, the zoomed-out bar, the
  overview's lists and machine lines, Exactly 3 with its forced rows and FORCED IN, the loop notice, the settings.
- Left as they are: names when zoomed out (the mod labels cards beside them as it labels drawers; the website's own
  version is on its branch `up-to-ui`, 51f5fea1, not reviewed yet); a card wired to itself (the website's router hooks
  it off the near edge, the mod routes round the card: an older router difference, not Up to); the website's amber mark
  on an output its dataset lists alternatives for (a game recipe's output is one item); the website's notice when an old
  Build plan opens (the mod converts on import, without one); the overview's row size (the mod's fits GTNH's GUI
  scale); NEI's list against the website's items column.

## Done in both (for reference)

- The rule (Any, Up to, Exactly) and its data, every old pin read as Up to, old Build plans converted to Up to with
  their targets kept display only.
- The solver: guard, push, drawers and Up to buffers as the player's own ends, the read-out (capable/disposal reasons,
  the starved-upstream bottleneck, wants), checked against the website on 67 plans.
- The card: what runs and what is set under the machine, the rule menu, the foot bar with its striped run-on, tiles of
  one shape, power as a tile, the well, the circuit badge in the well's top-left, the count's own click and tick
  sounds, reason outlines, drawer shortfalls naming the card that holds them back.
- Circuit as an input is gone from both.
