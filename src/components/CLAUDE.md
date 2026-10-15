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

- The mod's top bar (`chrome/ModBar.tsx`) holds the ACCOUNT's things only, in this order: the plan tabs and +, the live
  state as a dot and the faces of who else is here (`LivePresence`: one square per account, initials in their colour; a
  tip says Live, Connecting or Offline with edits waiting), Library, Share, the account key, feedback, settings, help.
  The account key (`chrome/AccountKey.tsx`) reads "Sign in" signed out (it opens `SignInPanel`, the form that used to
  hang in the Library) and is the account's face (initials in its colour) signed in, with a menu of the username and
  Sign out. The Library has no sign-in key, only a line "Signed in as X". The Share menu's first row is Share with
  people... (`PlanShareDialog`: people who edit this plan with you; greyed signed out, "Sign in to share"); the library
  rows say Publish to library... for a plan not posted yet (`chrome/library-rows.ts`, the dialog's title too). Never fold
  one into the other. Without live plans every row and label is as before. The + tab menu has New task board.
  `PlanIdentityDrawer`, `DesignTabs` and `BoardActions` keep their live keys but are not on the desktop board.
- What edits or views the board is the BOARD TOOLBAR (`chrome/BoardToolbar.tsx`), a strip along the top of the board in
  the middle column (above the notices; not while the Library or Welcome covers it): Non-recipe, undo, redo, Arrange,
  Fit, the rate unit, EU/t, Avg, same order and words as the game's (`chrome/bar-parts.tsx` has the key and the fit
  hook both bars share). A task board shows its own header there instead (title, count, New task: `requestNewTask`).
  The Non-recipe picker opens below this strip (`[data-board-toolbar]`).
- Both bars degrade by their own width (`useBarFit`, bar px, `data-fit`, the widths in `BAR_FIT_TOP` and the toolbar's
  `STRIP_FIT`): tight tightens the keys (Non-recipe shows its bolt alone, Arrange takes its label's width, the faces are
  two and a +N), wrapped puts the keys on a second row (the top bar's tabs always keep room for the active tab and the +).
- Share dialog: the owner is listed first; the owner adds people by name (search asks once typing pauses, 250 ms,
  and drops the answer to an older query) and removes them; someone it is shared with sees everyone and can leave.
  Plans are in the account from the moment they exist (`src/store/CLAUDE.md`), so it never waits on a save. Changes arrive
  through the live room too (`members`).
- The Library's Shared with me (a third shelf of `chrome/ModLibrary.tsx`, always there when signed in, "Nothing shared
  with you yet" when empty; a rail entry of the compact `LibraryPage`) lists plans others shared with you (from the
  account sync, refreshed at once by the live service's `shared` and `unshared` frames), each tile naming its owner,
  with everyone's faces; opening one makes or reuses this device's copy and it opens live (`lib/library/open-shared.ts`).
  Copies never show among My plans. The same frame shows the notice "<owner> shared <plan> with you" with an Open key
  (`LiveNotice`, above the board and the Library alike).
- Presence is `flow/LivePresenceLayer.tsx`, a layer of its own inside the viewport: others' pointers (arrow and name
  tag in their colour) and outlines round what they have selected, in the plan's coordinates, sized by
  `1 / --board-zoom` to stay one size on screen (each layer registers for the variable, `virtual/zoom-var.ts`, as the
  board no longer carries it). It reads `live-presence.ts` (outside every board store), so a
  pointer moving re-renders that layer only; this tab's pointer is a native listener feeding the session, which sends
  at most 10 a second.
- A task board is a plan of its own kind (`primaryView: "tasks"`): its tasks cover the board like the Library (the board
  stays mounted), a plan that is not one never shows tasks, and nothing switches between the two. + > New task board
  makes one. Right-click cards on a plan and Make a task (`lib/tasks/make-task.ts`; the menu lists the task boards on this
  device, then New task board) opens that board with a new task selected: titled "Build A", "Build A and B" or "Build A
  and N more", a checklist line per card ("4x Electric Blast Furnace (HV)", with the multiplication sign), a link per card. A link is
  `{ plan, node }` (`lib/tasks/task-links.ts`): `plan` is `<ownerId>:<designId>` for a plan in the account, the local design
  id for one on this device only; a click opens the plan and centres the card (`lib/tasks/open-link.ts`) or says "That plan
  is gone". A card wears the dot of its most pressing task (blocked, then doing, to do, done; `lib/tasks/task-link-index.ts`,
  from the task boards on this device, `DesignSummary.taskBoard` says which designs are). Older `nodeIds`/`nodeId` still read.
- The task board covers the board like the Library (the board stays mounted). Cards drag with pointer events (a
  4 px slop, then the drop line shows where it lands) so mouse, pen and probes behave alike. The global
  `button, input, select, textarea { font: inherit }` beats Tailwind's text sizes, so the board and the panel set
  their size on the container.
- Notices from the live plan (an edit refused, removed from a plan) show above the board (`LiveNotice`).
