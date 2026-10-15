# Stores, designs and plans (src/store)

`factory-store.ts` owns the project graph, solve results, selection and undo.
`design-store.ts` owns the design library (IndexedDB) and tabs. Related code:
`src/lib/designs/`, `src/lib/library/`, `src/lib/import-export/`, `src/lib/community/`.

The plan of record is IndexedDB; localStorage `project.v2` is only a one-shot seed.
Load migrations are not Zod-guarded: open each design under its own guard and never make
an unreadable design active.

## Two tabs share one library

Every save goes through `persistCanvas` in design-store.ts:
- A tab remembers the stored version its canvas came from (`canvasBase`). A save lands
  only if storage still holds that version, checked and written in one IndexedDB
  transaction (`writeDesignIfUnchanged`).
- A tab writes only what it was edited into (`isEditingInThisTab`): a background tab
  changes its plan by itself (recipe refresh) and must never echo that back. Changes
  made while a plan is being put up (`showProject`) never count.
- A stale tab holding its own edits saves them as "<name> (conflict copy)" and says so
  (`TabConflictNotice`). Nothing is lost either way.
- Saves are queued (`persistQueue`) so one tab never conflicts with itself, and
  `writeDesignSummary` keeps the stored plan stamps (`keepStoredPlanMarks`). Copy names
  come from `conflictCopyName` (counted, never stacked, clipped to 80 characters).
- Tabs announce saves over a BroadcastChannel (`design-tab-sync.ts`); a visible tab with
  no edits reloads at once, a hidden one checks when it comes back into view.
- Exam: the "two browser tabs" block of `design-store.test.ts`.

## Plans arriving and leaving

- Every arriving plan (import, paste, `#p=` link, a community copy) opens as a NEW design
  via `importProjectAsDesign`. Nothing calls `setProject` over the open design.
- Copy plan puts a link on the clipboard: `<origin>/#p=gtnh1.<deflate-raw base64url
  JSON>` (`plan-code.ts`). The arrival code is captured at module load
  (`src/lib/open-plan-code.ts`) because the address is rewritten later. Players never see
  the word "code".
- Plans are slimmed by dropping GregTech `runtimeCalculation` tables
  (`withoutRuntimeTables`), but only for recipes this page has seen the dataset carry
  (`isRestorableRecipe`); the landing refresh re-fetches bare recipes (`recipesToRefresh`).
  Account sync pushes the same slim plan.
- Import/export preserves resource identity (`fluid.*` in the UI means fluid metadata was
  not resolved), recipe overrides, chosen handlers, tier/config and concrete oredict picks.
- Recipe ids are not stable across exports: import keeps an id the dataset still has and
  re-finds a missing one by CONTENT (`resolve-recipes`, then a name search scored by
  content). Never accept a name match alone.

## Public view

- Someone else's community post opens VIEW-ONLY (`design-store.publicView`, transient, no
  design id). Never autosave it into a personal design. Only an explicit copy ("Make a
  copy" on the view bar, "Open a copy" in the Library) adds it to the library.
- `factory-store` refuses project edits while `isReadOnly`. Resource clicks must not open
  recipe search in view mode; `data-viewer-inspect` never wraps ports or editing controls.
- An owner's posted design follows autosaves (`src/lib/community/post-follow.ts`): plan
  and metadata only, never a timed live-board photo (capturing forced glance mode and
  stalled the board every minute).

## Account sync (src/lib/library/library-sync.ts)

- The Supabase instance is small. Pushes wait for 5 s of quiet (30 s max while editing,
  at once when the tab hides). Only a LOCAL change schedules a push, judged by
  `libraryChangeSignature`, never by array identity; a run never schedules the next one.
- A design the server refused is not resent until its stamp moves. Names are clipped to
  80 characters. Hidden tabs skip the poll.

## Recipe browser state

`browseResource`, `browseBack` / `browseForward`, `recipeBrowserMachinePin`,
`beginRecipeRefactor` live in factory-store; the rules are in `src/components/CLAUDE.md`.

## Live plans (live-session.ts)

All of it is off unless `NEXT_PUBLIC_LIVE_URL` is set (`isLiveConfigured`, read by its literal name so Next.js
inlines it) and someone is signed in: no socket, no Share, no Shared with me, no task board, no presence. Merging it
changes nothing until then. Architecture and protocol: `docs/live.md`.

- Which designs are live: the one on the canvas, when it is ours and the account has it (`remoteUpdatedAt`; its doc
  is `<my id>:<design id>`, my id from the service's `welcome`, cached per username for offline starts) or a copy of
  a plan shared with us (`DesignSummary.cloud`, local id `shared-<owner>-<design>`). A new design goes live once the
  account sync has pushed it, and its snapshot undo history ends there.
- THE FUNNEL. Every project change not made `quietly` (`live-edit-gate.ts`) is a person's edit: the plan before and
  after are shaped (`src/lib/live/live-shape.ts`) and diffed into a batch in the client engine (confirmed +
  pending). Shaping leaves out what is not a person's doing: `metadata` (stamps, the owner's post link), `name` (the
  account row's), `view` (each person's dressing), `poolCellRatios` (fetched) and GregTech `runtimeCalculation`
  tables. Landing a plan, the recipe refresh, fetched data, a community link and applied remote ops are quiet. A
  new store action that writes derived data into the project must be quiet too, or every client sends it.
- ARRIVING. Someone else's batch, a refusal, a fresh snapshot, an undo: the engine's view before and after is diffed
  and only that lands, through `applyLiveOps` (same objects for untouched things, re-solved like any edit). It is the
  same design changing, never an arriving plan: the "every arriving plan opens as a NEW design" rule is untouched
  (opening a shared plan the first time is the arrival, `openSharedDesign`).
- UNDO on a live plan applies the recorded inverses of this person's own edits (`LiveClientState.undo`), sent as a
  new batch. `withProjectHistory` keeps no snapshots while a live handler is set, and entering or leaving live empties
  the snapshot history: a snapshot restored over a live plan would wipe everyone else's edits. Undo buttons read
  `liveUndo` when it is set.
- OFFLINE. Edits wait in pending, kept in IndexedDB (`live-pending-store.ts`, its own database) per plan and tab, and
  go when the connection is back (backoff, `online`, the tab coming back); a closed tab's leftovers are adopted by the
  next tab to open that plan (Web Locks tell which tabs are gone). Batches are paced under the service's rate and
  split under its size limit.
- TABS: each tab joins for itself (one account may be in a room more than once). No tab depends on another staying
  open, and each has its own pending edits and undo; the cost is a socket per tab (the service allows 16 an
  account). Presence from your own account (another tab, the game) is not drawn.
- THE LOCAL COPY. A design open live is the service's plan; its record here is this device's copy, for opening
  offline. Autosave writes it unguarded (`persistLiveCopy`: no version check, no conflict copy, sync stamps kept),
  and the tab sync never reloads it from storage.
- ACCOUNT SYNC never sends the body of a plan open live, here or in another tab (`isDesignOpenLive`, a localStorage
  mark refreshed while open), and a pull of one moves only its metadata. A push answered 409 `{ live: true }` goes
  again without the plan: not an error, not a conflict copy. Copies of shared plans are never pushed as ours; the
  account lists them under `shared` (`cloud-library.ts`), and a copy no longer listed is removed.
- Removed from a plan, or the plan deleted: the copy goes and a notice says so (`useLiveSession.notice`).
- Tests: `live-session.test.ts` (a fake service speaking the protocol with the real engine),
  `src/lib/library/library-sync-live.test.ts`. In the real app: `scratch/probes/live-*.mjs` on `npm run dev:local`
  (development builds expose the stores as `window.__gtnhLive`, with `drop()` to cut the socket).

## Task boards (src/lib/tasks)

- Tasks, checklist lines and comments are things of their own (`tasks`, `taskItems`, `taskComments`), so two
  people ticking two lines or moving two cards never write the same field. Order is a fractional key
  (`order-key.ts`): a move writes one key between its new neighbours, nothing else.
- Every task edit goes through `editTasks` with a pure edit from `task-board.ts`: one undo step and one live batch.
  Tasks never feed the solve.
- A comment's `by`, `byName` and `at` are the live service's to write on a live plan; on a plan of this device
  alone they are yours (`local` / "You" when signed out). A closed design with tasks is never thrown away as blank.
- Which face is up (board or tasks) is per tab and never saved (`task-view.ts`); a design lands on its
  `primaryView`.
