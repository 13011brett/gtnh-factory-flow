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
- The Share menu has the mod's rows in its words: Copy plan link (`<origin>/#p=gtnh1.<deflate-raw
  base64url JSON>`, `plan-code.ts`), Copy plan code (the code alone), Export plan file, Open in
  the mod. The arrival code is captured at module load (`src/lib/open-plan-code.ts`) because
  the address is rewritten later. The mod writes the same codes (its `FfPlanCode.encode`) and
  opens the site at `#p=` from its own Share menu.
- Open in the mod (`src/lib/mod-link/`, `components/chrome/share-actions.ts`) POSTs the code to
  the running game on 127.0.0.1:25640-25649 (the mod's `client/WebsiteListener`, which answers
  this site's origins only and asks the player before opening anything). Probed as the menu
  opens, except where the browser would ask the player first (Local Network Access); any
  failure copies the code for the mod's + tab instead.
- Plans are slimmed by dropping GregTech `runtimeCalculation` tables
  (`withoutRuntimeTables`), but only for recipes this page has seen the dataset carry
  (`isRestorableRecipe`); the landing refresh re-fetches bare recipes (`recipesToRefresh`).
  Account sync pushes the same slim plan.
- Import/export preserves resource identity (`fluid.*` in the UI means fluid metadata was
  not resolved), recipe overrides, chosen handlers, tier/config and concrete oredict picks.
- Recipe ids are not stable across exports: import keeps an id the dataset still has and
  re-finds a missing one by CONTENT (`resolve-recipes`, then a name search scored by
  content). Never accept a name match alone.

## Library posts are copies

- A post is like an uploaded file. Someone else's post opens as a NEW design with no link
  to it (`openCommunityPost`, `untagCommunityPlan`); there is no view-only mode. Your own
  post opens as your design, linked (`metadata.communityPlanId`).
- Nothing syncs a design to its post. Share's Save to library posts it, Update in library
  pushes the plan as it is now (votes kept), Save as new post makes another
  (`SharePlanDialog` `mode`, `chrome/library-rows.ts`, the same rows as the mod).
- The old view-only session (`design-store.publicView`, `PublicViewBar`, `isReadOnly`) is no
  longer entered by any path.

## Account sync (src/lib/library/library-sync.ts)

- The Supabase instance is small. Pushes wait for 5 s of quiet (30 s max while editing,
  at once when the tab hides). Only a LOCAL change schedules a push, judged by
  `libraryChangeSignature`, never by array identity; a run never schedules the next one.
- A design the server refused is not resent until its stamp moves. Names are clipped to
  80 characters. Hidden tabs skip the poll.

## Recipe browser state

`browseResource`, `browseBack` / `browseForward`, `recipeBrowserMachinePin`,
`beginRecipeRefactor` live in factory-store; the rules are in `src/components/CLAUDE.md`.

## One mode

There is one board mode, plan mode. Every plan lands through the store (`markHydratedProject`,
`loadViewedProject`, `setProject`), and `normalizeLoadedProject` ends in `openAsPlan`
(`src/lib/solver/plan/to-plan.ts`): Build and Solve plans by `convertBuildToPlan`, Pool plans wired per resource first
(`pool-to-plan.ts`, with a `planNotice` for the player). The parsers (JSON, plan links, community posts) keep the saved
mode on purpose, so the one conversion at landing can also say what it lost. A load never writes: storage keeps the old
shape until the player's first edit saves the converted plan (both `planMode` and `solveMode` are written, so older
builds open it as Solve). Tests of the old Build/Solve/Pool code call `allowLegacyModesForTests()`.
Server stats convert the same way (`normalizeLoadedProject` in the community routes).
