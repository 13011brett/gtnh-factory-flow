# Interactions of the clean look (src/components/flow/clean/interaction)

The mod's click, tip and wire-in-hand behaviour on the website's board. Started once by
`ensureInteractionHost()` (the first clean card calls it): one tooltip host, the wire-in-hand painter,
the shared phase of every pulse.

- Tips: controls carry `data-tip` (a `TipSpec` as JSON, `tipAttrs(spec)`) and `data-tip-id` (the thing's
  identity). `TipHost` listens on the document, waits 0.8 s of rest on the same thing (`rest-tracker.ts`,
  pure), draws one portal panel (`TipPanel`, the mod's skin) and shows nothing while a button is down,
  something is in hand (`setHandHeld`, a wire in `connection-drag`), a menu is open or text is typed.
  Wording of the card's tips is `tips.ts`. `rest-gate.ts` gives the older `MinecraftTooltip`s (top bar,
  tabs, overview, library) the same wait on plan-mode boards; classic boards keep theirs at 0.
- A tip that needs a live panel names it (`panel: { kind: "power" }`): the host renders the classic
  card's `PowerReadout` and `PowerControlsGuide` from the store.
- Click slop: `useClickSlop` (3 px, `click-slop.ts`); `nodeDragThreshold={3}` on the board.
- Wire in hand: the board already marks cards `data-drop-fit="yes"` and draws the line; `accept.ts` adds
  `data-accepts` on port rows, `data-snapped` on the card and port under the pointer, `data-origin` on the
  card the wire came from (never green), `data-carried` on the port in hand. Glow is CSS in
  `interaction.css`, opacity only. `CleanVerdictLine` is the line itself (plan-mode boards).
- Open ports (no wire, no drawer): `PortRateControls` is the rule key and rate box, writing
  `portRates` (`port-rate.ts`: typed `2.5k` and `1/3`, wheel steps, pure).
- Prompts: `prompt-sync.ts` sets every pulse's start time to the document timeline's origin when it
  starts, so "(set count)", "Set" and drawers' "Set rate" blink together.
- `selection.ts`: the selection bar's Combine rule, pure; `combine-deps.ts` has the real deps.
