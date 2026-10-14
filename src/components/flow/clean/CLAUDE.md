# The clean look (src/components/flow/clean)

The mod's flat card on the website's board. It draws every `RecipeNode`: `RecipeNodeSwitch` in
`CleanRecipeNode.tsx` is what FactoryFlow registers as `recipeNode`, and it has no classic path (the
classic `RecipeNode` and `StorageNode` stay in the tree, unreachable from the board). A node the plain card
cannot be goes to `special/` (`specialKindOf`): a shared machine, a generator, a custom rate or fluid tank
holder, a crop card. Bees, the Extreme Entity Crusher and every other machine are the plain card.

- `special/` is those cards on the plain card's classes (`cc-card`, `cc-head`, `cc-rail`, `cc-row`, `cc-pic`,
  `cc-strip`) plus `sp-*` (`special.css`, loaded after `clean.css`; `cs-*` is the menus'). `use-special.ts` has
  one hook a kind (each starts from `useCleanCardModel` and overrides), `SpecialCard.tsx` draws a
  `SpecialView`, `SpecialSheets.tsx` is the gear sheet of a card whose settings are not a machine's controls.
  A shared machine's section n draws its ports through `CleanPortRow` with the `r<n>:` handle prefix and the card's
  node id; a rule row over each recipe (share, circuit, up, down, off). A holder has two sockets (`custom-any`
  handles) until a port is dropped on it; the fluid tank adopts the dataset's Tank recipe the port fits
  (`lib/datasets/tank-recipe.ts`, `lib/model/fluid-tank.ts`) and lets go when unwired. A generator's pinned settings
  are the plan's `settingPins["power:<source>"]`.

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
