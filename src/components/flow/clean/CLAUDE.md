# The clean look (src/components/flow/clean)

The mod's flat card on the website's board. It draws `RecipeNode` for plan-mode boards
(`project.planMode`); `RecipeNodeSwitch` in `CleanRecipeNode.tsx` is what FactoryFlow registers as
`recipeNode` and falls back to the classic card per node where `support.ts` says the clean card
has no design yet (power, crop, bee, custom rate, Extreme Entity Crusher, shared machines).

- `tokens.ts` + `clean.css` own the palette and geometry. Others read them; `colors.ts` has `mixHex`
  (the mod's float32 `Hyb.mix`, so drawer and forced-row mixes match their Java twins).
- `clean-model.ts` turns a node and the solve into a `CleanCardView` (every string final) and the
  actions; `CleanCard.tsx` only draws it. The card's height is a pure function of the data: the strip
  lays its chips out itself (`layoutStrip`, `text-measure.ts`), nothing is measured from the DOM.
- DOM budget: at most 70 elements for the reference card, pinned by `CleanCard.test.tsx`. Rings,
  glows, hairlines, chevron, glyphs, units, notes are pseudo-elements and `attr()` content; the
  glance layer is one element. Do not add wrappers around icons or rows.
- Controls are `div role=button`, never `<button>`: globals.css forces `font: inherit` on buttons.
  Fonts live in clean.css classes (unlayered, so they beat Tailwind layers and element rules).
- State hangs on data attributes (`data-selected`, `data-cannot-run`, `data-lit`, `data-open`,
  `data-prompt`), because React rewrites className on the board. Animate opacity or colour only.
- Wires dock on the row (`data-resource-edge-anchor`), so the router and `use-rendered-handles` are
  untouched. Controls carry no `nodrag`; a press that moved 3 px is a drag (`useClickSlop`).
- Plan-mode edits (`updateNode`) reach the solver seam, which throws until the plan solver lands.
- Check by eye with `/dev/clean-card` (development only): it exposes `window.__ccStore` and
  `window.__ccMocks` (the mock results of `solver/plan/__fixtures__/mock-extras.ts`).
