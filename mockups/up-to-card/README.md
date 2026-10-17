# Up to card mockup

Static mockups of the machine count's new rule, "Up to", and the card that shows it. They are built on the clean
card's real CSS (`src/components/flow/clean/clean.css`, `interaction/interaction.css`), the Monocraft font and the
`public/power-art` pictures, so they look like the board. Nothing here is wired to the app.

## Viewing

From the repo root:

```bash
node mockups/serve.mjs . 8791
```

Then open http://localhost:8791/mockups/up-to-card/ (pass 3). Passes 1 and 2 are linked from its top bar.

## What "Up to" is

Started from player feedback after 4.0.0 (2026-10-17): old Build mode let you set the machines you have built, then
showed how busy each one was and which one held the line back. Plan mode's pins are exact, so mismatched pins show
forced flows instead.

- A machine count gets a rule: **Any** (the plan picks), **Exactly N** (today's pin), **Up to N** (what you have).
- Up to N runs each machine as hard as the line allows, never above N. Forced flows never make up an Up to card's gap.
  The card slows instead, as in the game.
- Every exact machine pin becomes Up to. Old Build plans convert to Up to. Custom rate cards stay exact.
- The reasons: FULL, BOTTLENECK (the line wants more than you have), STARVED (short of an input), CLOGGED (an output
  has nowhere to go), UNUSED (nothing takes it). An Exactly card with a gap says FORCED IN.

## The passes

- `pass1.html`: the count block under the picture, rule key and box, a busy bar and a reason line. Too cluttered.
- `pass2.html`: the old card's shape: port tiles, the machine in its own well, a footer of sections (usage, reason,
  power, count with - and +). Better look, but every number showed twice.
- `index.html` (pass 3): each fact once.
  - Under the machine: what runs (big, white) and what you set (small, the number gold). Click the number to type, the
    wheel steps it, click the rule word for Any, Exactly, Up to. No - and + keys.
  - Along the foot: one bar. Its fill is how much runs, one word and one plain line say why, and a fraction on the
    right says exactly what the bar shows (18.2 / 24). A bottleneck's bar runs on, striped, to what the line wants
    (24 / 31).
  - No bar when there is nothing to say (Any, or Exactly with nothing forced).
  - Every port tile has the same shape. Free ends only change colour. The port a card is short of is not lit.
  - Power is a tile among the inputs. Circuit as an input is on.

## Solver work (estimate, 2026-10-17)

Large overall, mostly one piece. In both the website (`src/lib/solver/plan/`) and the mod's twin:

- The engine already has the cap (`PoolIn.exact: false`) but the adapter never sends it.
- Up to must count as an anchor (`context.ts`, `unanchored.ts`) and skip `unneeded`.
- A guard closes forced flows on networks an Up to card touches, unless an exact pin needs them. Drawer relaxation
  needs the same guard, or it never sees the shortfall.
- The push: raise every Up to card fairly (max-min over reached / N) after the trades, inside the fast path too
  (with only Up to pins it answers all zeros), and in `evaluateSupport`. Hold the levels through least flow and
  canonical or they fall back to zero. It must come out the same in HiGHS and ojAlgo and under `SolverPathTest`.
- Reasons and "wants N" need probe solves per card and new result fields on both sides.
- Goldens, parity scenarios and the mod's answer generator get re-recorded.
