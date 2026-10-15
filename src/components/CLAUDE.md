# App UI (src/components)

The board has its own notes in `flow/CLAUDE.md`, the Pool worksheet in `pool/CLAUDE.md`.

## Interface scale: two pixel spaces

- `src/lib/ui-scale.ts` owns the size setting (60-200% of a default that is itself
  `UI_SCALE_BASE`, or `UI_SCALE_PHONE_BASE` on compact screens). A boot script in
  `layout.tsx` stamps `--ui-scale`, `data-compact` and `data-snug` before first paint.
- The app shell is CSS-`zoom`ed (`.ui-scale-shell`); the board UNZOOMS itself and carries
  the factor through its camera (`boardMaxZoom`, `boardZoomScale`). Never CSS-zoom the
  board: React Flow then measures cards and the pointer in two different spaces.
- Every measurement must know its space. REAL px: `clientX`, `getBoundingClientRect`,
  `window.innerWidth`, anything inside `.react-flow`, anything portaled to `document.body`.
  SHELL px: `offsetWidth`, `clientWidth`, `scrollLeft`, style lengths, ResizeObserver rects.
  The ratio is `getUiScale()`. Body portals keep real-px positioning and wear `.ui-zoom`.
- Viewport units are not divided by zoom: inside the shell use `--ui-vh` / `--ui-vw` /
  `--ui-dvh`, never bare `vh` / `vw`.
- The `compact:` / `snug:` Tailwind variants key on the html attributes, not media
  queries. `getUiScale()` is 1 where `matchMedia` is missing (server, jsdom).

## Compact mode (phones, small windows)

- `src/lib/compact-view.ts`: compact under 900px wide OR 560px tall (shell px). Ask the
  media query, never `window.innerWidth`, which mobile browsers widen when content overflows.
- Compact swaps the three columns for the board plus two drawers (`PanelDrawer`), the top
  bar for `AppMenu`, each toolbar for one folded button. Drawers track the finger by
  writing `translate`, not `transform`: Tailwind's translate utilities set `translate`, and
  a `transform` would compose with it and double the offset. Pair any min-height with
  `compact:min-h-0`.

## Recipe search (RecipeSearchOverlay.tsx)

- `RecipeBrowser.tsx` owns the query state. `browseResource` / `clearResourceBrowser` are
  the only doors in and out. A query is clauses (`recipe-query.ts`) plus ANY / ALL / ONLY
  per side; the server does the set algebra (`src/lib/server/CLAUDE.md`).
- Machine chips are a persisted multi-select (`machine-map-selection.v1`), sent as
  `mapMode` + `map=`; counts always cover everything that matched.
- Results page through machine sections in chip order. An open section short of its
  count shows skeletons; the first (`[data-awaiting-page]`) asks for the next page, and
  `onLoadMore` only advances from a page that has landed (`landedRecipePageKeyRef`).
- Back/forward stacks live in the store (`browseBack` / `browseForward`); Alt+arrows and
  a bare Backspace walk them.
- An add lands at `nearestFreeSpot` and the camera follows. An add started from a card's
  port wires only the clicked resource (`addConnectedRecipeNodeToState`). Refactor
  (`beginRecipeRefactor` -> `refactorNodeWithRecipe`) replaces the card in place,
  re-docking wires whose resource survives; if none would survive, it lands beside instead.
- The tier ceiling also filters generator cards by their `unlock` chip, client side
  (`powerUnlockWithinTier`); a source with no chip is never filtered.
- A machine pin (`recipeBrowserMachinePin`) scopes the maps to one machine and adds a
  recipe section to an existing card (`addRecipeToNode`).
## Inspector and panels

- Right resource column 234 shell px, left items panel 256 (desktop and drawer caps).
- The items column is NEI's list (`ResourceIndexPane`, `nei/nei.css`): page keys and n/m at the top, 32 px slots
  of art alone, a Minecraft tooltip at once (`nei/McTip`), R/U over a slot, filters and sort in one menu key. Its
  search field (`searchAt`) is a body portal at the bottom middle of the screen; on a phone, under Welcome or the
  library, and while the recipe search is open it sits at the column's foot instead. The server answers at most
  120 resources a query, so a taller page asks in pieces. Every `MinecraftTooltip` and title tooltip wears `.mc-tip`.
  Keep virtual-list row heights in sync with the CSS (`inspector/panel.css`).
- Resources show Raw or Net, switched in the first section header (Raw by default). In
  Solve, drawer rate rows hang under their resource like files in a folder
  (`BoundaryDrawers` in `inspector/flow-sections.ts`).
- The machine list is one row per CARD, never merged (`buildMachineList` in
  `src/lib/model/machine-list.ts`).
- Power display (EU/t or amps at a tier) and rate units are view dials read through
  `useRateDisplayUnits`; memoized rows subscribe to both themselves.

## Shared UI behaviour

- Dropdowns dismiss through `useDropdownDismiss`: the mouse fade counts from the nearest
  point the pointer has reached, so a panel that opens away from the pointer can be
  walked to. `fadeKeep` names the element a menu hangs from.
- Tooltips never keep themselves open: `pointer-events-none`, close as soon as the
  pointer leaves the control. Above-card tooltips anchor to their control when no card
  exists (the Pool worksheet).
- React's wheel handlers are passive: a control that adjusts on wheel needs a native
  non-passive listener to `preventDefault` the page scroll.
- Build heavy hover content lazily (pass a thunk).
- Rendered item textures keep the art in the middle half of the image; draw them at 2x
  the box.
- `DesignTabs` effects that grab refs must depend on `isHydrated`.
- Sounds are the in-game planner's own files played by its rules (`src/lib/sound/`, its
  `CLAUDE.md` has what plays where). Firefox flushes audio at the end of a task, so the
  player schedules from a task of its own there.
- The Welcome tab (`welcome/`, state in `src/lib/welcome/welcome-tab.ts`) keeps its
  backdrop paused while hidden.

## Live plans in the UI (live/, tasks/)

Everything here renders only with `isLiveConfigured()`; without it the app looks exactly as before. Store rules are
in `src/store/CLAUDE.md` (Live plans, Task boards).

- The mod's top bar (`chrome/ModBar.tsx`) carries it, as the game's does: a Tasks key before Library swaps the board
  for the plan's task board and back (`Plan` while the tasks show); after the tabs, the live state as a dot and the
  faces of who else is here (`LivePresence`: one square per account, initials in their colour; a tip says Live,
  Connecting or Offline with edits waiting). The Share menu's first row is Share with people... (`PlanShareDialog`:
  people who edit this plan with you; greyed signed out, "Sign in to share"); the library rows say Publish to
  library... for a plan not posted yet (`chrome/library-rows.ts`, the dialog's title too). Never fold one into the
  other. Without live plans every row and label is as before. The + tab menu has New task board.
  `PlanIdentityDrawer`, `DesignTabs` and `BoardActions` keep their live keys but are not on the desktop board.
- The bar degrades by its own width (`useBarFit` in `ModBar.tsx`, bar px, `data-fit`): below 740 the keys tighten, Non-recipe
  shows its bolt alone, Arrange takes its label's width and the faces are two and a +N; below 600 the keys wrap to a
  second row under the tabs (the strip always keeps room for the active tab and the +). Nothing changes above 740.
- Share dialog: the owner is listed first; the owner adds people by name (search asks once typing pauses, 250 ms,
  and drops the answer to an older query) and removes them; someone it is shared with sees everyone and can leave.
  A plan not in the account yet is pushed first. Changes arrive through the live room too (`members`).
- The Library's Shared with me (a third shelf of `chrome/ModLibrary.tsx` when signed in; a rail entry of the
  compact `LibraryPage`) lists plans others shared with you (from the account sync), with the owner and everyone's
  faces; opening one makes or reuses this device's copy and it opens live. Copies never show among My plans.
- Presence is `flow/LivePresenceLayer.tsx`, a layer of its own inside the viewport: others' pointers (arrow and name
  tag in their colour) and outlines round what they have selected, in the plan's coordinates, sized by
  `1 / --board-zoom` to stay one size on screen (each layer registers for the variable, `virtual/zoom-var.ts`, as the
  board no longer carries it). It reads `live-presence.ts` (outside every board store), so a
  pointer moving re-renders that layer only; this tab's pointer is a native listener feeding the session, which sends
  at most 10 a second.
- The task board covers the board like the Library (the board stays mounted). Cards drag with pointer events (a
  4 px slop, then the drop line shows where it lands) so mouse, pen and probes behave alike. The global
  `button, input, select, textarea { font: inherit }` beats Tailwind's text sizes, so the board and the panel set
  their size on the container.
- Notices from the live plan (an edit refused, removed from a plan) show above the board (`LiveNotice`).
