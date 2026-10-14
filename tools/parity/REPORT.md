# Parity report 2 (QA2, branch qa-2 off mod-backport 03e044c6)

Merged branch (drawers WP4, rail WP5, interactions WP6, notes WP11, layout WP10, single mode WP12), dev server on 3134, Chromium 1920x1080,
`/dev/clean-card` (same FactoryFlow shell as `/`; top bar tip timing re-checked on `/`). Card bugs B1-B12 and FX1-3 are not repeated.

Rerun: `node tools/parity/qa2.mjs [section-regex]` (sections: drawers, drawer-rules, drawer-prompt, tooltips, slop, wire-in-hand, port-pickup,
unset-prompts, layout, rail, notices, spare, notes, hover-scope, machine-lines, topbar-tips, forced-drag, panels, chrome). Results in
`tools/parity/out/qa2/results.json` plus PNGs. Real mouse events through Playwright, timings with Date.now() around mouse.move.

## Verdicts (PASS matches the mod, FAIL differs, N/T not reachable)

### Drawers (WP4)
- PASS footprint exactly 120x80 for source, product, trash.
- PASS tints blue #78B6F4, orange #F59A5C, steel #8A93A6; edge and body colours equal the mod mix of tint and card surface (.55 and .07).
- PASS rule menu (Any, At least, Exactly, At most, Void it), source menu four rules, trash menu "Keep it (product)", wheel cycles, middle click clears.
- PASS rate box takes 2.5k (2500), 1/3 (0.3333), 7; wheel +1; delete key present.
- PASS "Set rate" prompt gold, 1 s beat, in step with the card prompts (phase spread 0 ms over 19 samples).
- FAIL ctrl+wheel read +2 not +10 (Playwright may drop the modifier; verify by hand, D5). DIFF grab bar 19/80 vs mod 8/54 (D4).
- FAIL drawer art (D1), drawer tips (D2).

### Interactions (WP6)
- PASS tip wait on card chips, name, count, port row 819-937 ms, rail row 801-812, rail machine chip 806-834 (mod 800); none while a button is held; none while a wire is in hand.
- FAIL tips on drawers, top bar keys, bottom-right Fit key appear in 3-8 ms (I1). Plan tab has no custom tip.
- PASS 2 px press-release is a click on a drawer and on the gear key; 2 px press does not move a card.
- FAIL press-move of 4, 5, 8 px does not carry a drawer, 20 px does (I2).
- PASS wire in hand: red #EF4444 over empty near its own card, accepting card marked and glowing, origin never, accepting port glows, red over a card that cannot take it, green #22C55E on the target port with exactly one card and one port steady, letting go wires it (edges 0 to 1), dropping on empty board far away is green dotted and makes a drawer (the mod SPAWN).
- PASS port picked off its card is carried and letting go at home leaves the edges unchanged. DIFF carried back over its own card the line stays red, no snap home (I3).
- PASS unset prompts pulse in step (4 prompts, spread 0 ms). PASS dragging a Forced row out makes a drawer, the row goes, ghost drawer with green dotted line.

### Rail, notices, layout (WP5, WP10)
- PASS rail left, items right, no inspector; sections Inputs, Outputs, Internal, Machines with counts 6, 14, 2, 3 (mod ref-chain); unfold restores width.
- FAIL rail width 273.8 vs 234 (R1); folded strip 30.4 vs 26 (R1); rows 28 vs 24 (R2).
- PASS "~ Set" opens an editor and an unset input takes a rate ("= 4"); filter "pro" keeps Propene and Propane; row hover lights its resource (1,903 px change).
- PASS wire hover (2,054 px) and drawer hover (13,728 px); weak card port hover (246 px); FAIL machine line hover lights nothing (R8).
- FAIL machine line EU/t clipped (R3); count takes no wheel or click and no trash key (R4); unset plan shows -1.67k etc (R5).
- PASS notice wording "The Sulfuric Acid supply allows at most 0.05 L/s, but the plan needs 5 L/s" with Show me; Show me moves the camera (zoom 1 to 1.17), selects nothing.
- FAIL notices at the bottom, 28 high; mod stacks them at the top (R6).
- N/T Forced block with Split/Auto bars and spare popup: three real-solver plans gave one bearer per leftover, so neither shows (R7).

### Sticky notes (WP11)
- PASS right-click empty board offers "Add a sticky note"; click then type writes; hover keys (delete top left, smaller/bigger top right, hidden at rest); corner and edge resize; menu Write on it, Colour..., Bigger text, Smaller text, Delete note; colours Yellow, Orange, Pink, Red, Lime, Green, Light blue, Blue; box/arrow/zone/image tools hidden.
- FAIL drag while writing moves 2/3 of the travel: 60,30 drag moved 40,20 (N1). DIFF no folded corner, default 180x120 css (N2).

### Chrome
- DIFF top bar lacks Arrange, Fit, Avg/Peak, feedback key. FAIL settings has Font, Size, Sounds, Volume, Machine list, Animation only.
- DIFF library says "My designs" and "Public setups". DIFF screenshot panel is PNG/SVG/GIF with Detailed, Paper, Summary bar; no Simple choice; footer prints the site name.
- FAIL feedback: only a Help item "Report a bug"; no panel. Help menu: Welcome, Source on GitHub, Discord thread, Report a bug (no tour).

## Bug list by owner

Drawers (WP4)
- D1 Drawer art is wrong: Aniline drawer is a pink block and Sulfuric Acid a lime block, the cards show olive and orange for the same fluids (out/qa2/rule-menu.png, rule-menu-acid.png, forced-row-in-hand.png).
- D2 Drawer controls use the old classic tooltip (monospace 16 px, fixed z-9999 border-2) not the mod tip panel: shows 3-7 ms after arrival, stays while a rule menu is open and covers the menu labels.
- D4 Grab bar is 19 of 80 px (0.237); mod 8 of 54 (0.15).
- D5 Verify ctrl+wheel +10 on the rate box (read +2).

Interactions (WP6)
- I1 All classic tooltips are instant on plan boards: drawers, top bar keys (Share, Screenshot, Settings, Undo), bottom-right Fit show in 2-8 ms; the rest gate does not reach them.
- I2 Slop: 4, 5, 8 px press-move does not carry a drawer, about 20 px does (mod carries past 3 GUI px).
- I3 A port carried back over its own card keeps a red line and does not snap home.
- I4 Card tier chip tip at 922-937 ms, about 110 ms later than the other card tips (about 820).
- I5 Plan tab has no custom tip.

Rail (WP5)
- R1 Rail 273.8 wide (spec 234), folded strip 30.4 (spec 26).
- R2 Rows 28 high (spec 24), notice rows 28.
- R3 EU/t clipped on every machine line ("40 EL", "480 EU/", "3.07 E"); long names clip with no ellipsis ("Lightly Steam-", "Tiny Pile of").
- R4 Machine line count takes neither wheel nor click; no trash key.
- R5 Nothing set: rail shows -1.67k Distilled Water, +633 Nitrobenzene while cards read 0 and the bar says Nothing to calculate yet.
- R6 Notices at the bottom of the board; mod stacks them at the top under the bar.
- R7 Forced block and spare popup unreproduced: needs a plan where two machines can bear one leftover (the mod tour plan 27).
- R8 Machine line hover lights nothing on the board; card port hover changes only 246 sampled pixels.

Notes (WP11)
- N1 Drag while writing moves the note by two thirds of the mouse travel.
- N2 No folded corner; default 180x120 css, larger than the mod note.

Layout (WP10): no bug beyond R1 (rail left, items right, no inspector all PASS).

Other
- O1 Settings panel lacks the mod sections: See-through, Size choices, Minimap, Pin list, Keys, In the world.
- O2 Library words "My designs" and "Public setups"; screenshot footer prints the site name.
- O3 Top bar lacks Arrange, Fit, Avg/Peak, feedback key. Dev server answers 404 for /highs.js (server stats path, dev only).

## Features the mod has that the website still lacks entirely
Minimap (no .react-flow__minimap), tour (37 steps and first-run offer), feedback panel (faces, Bug/Idea/Help chips, crash offer), See-through (Paper strength) slider, pin list, update offer, Share in chat, settings sections (Board, Sound, Minimap, Pin list, In the world, Keys), Simple (glance) choice in the screenshot panel, controls list.
