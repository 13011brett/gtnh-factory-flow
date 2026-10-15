# Groups (the website's boards and pockets, back in both planners)

Written 2026-10-14 (G1). One file, copied verbatim into the website (`docs/groups.md`); change both together.

A group is a named, coloured frame round part of a plan: select some things, make them a group, move them as one,
collapse the group down to a summary card and open it again. It is the website's old "board" (its type still says
`pocket`), restyled in the clean card's look. Groups take no part in the solve: the graph the solver sees is flat.

## The model

The website keeps its `FactoryPocket` (`src/lib/model/types.ts`) exactly as it was, so every plan with boards loads
untouched: members carry `pocketId`, boards nest through `parentPocketId`, `expanded` is open, `size` is the frame,
`position` its top-left corner, `theme` and `pattern` its old paper (kept, no longer drawn).

The mod's `data/flowchart/BoardGroup` (in `Graph.boardGroups`, saved with the plan under `boardGroups`) holds the same:

| Mod (`BoardGroup`) | Plan JSON (`pockets[]`) | Notes |
| --- | --- | --- |
| `id` (UUID), `ffId` | `id` | `ffId` keeps the website's id (`pocket-...`) so a plan goes back out under the same ids; a group made in the mod writes `pocket-<uuid>` |
| `name` | `name` | a new group is "Group N" (N = groups on the plan + 1) |
| `color` | `colorTag` | one of the 22 colour tags (`NoteColors` / `GT_NODE_COLORS`); null = see Colours |
| `parent` | `parentPocketId` | nesting; null = the board itself |
| `x`, `y`, `width`, `height` | `position`, `size` | the frame. The mod keeps absolute board px; the JSON's are relative to the parent's frame and scaled by 380/320 (cards' scale) |
| `collapsed` | `expanded` (negated) | collapsed shows the summary card at the frame's corner; absent `expanded` = collapsed, as before |
| `theme`, `pattern` | `theme`, `pattern` | kept for the round trip, never drawn |
| member's `group` (on `Node`, `Drawer`, `Note`) | member's `pocketId` | on `nodes[]`, `storages[]`, `annotations[]`; member positions in the JSON are relative to the group's frame corner |

Rules both planners keep:

- **One group each.** A card, drawer, note or group is in at most one group. Every recipe of a shared machine is in
  the shared card's group.
- **The frame holds its members.** After every edit a group's frame grows to hold its members' boxes plus a cell of
  padding (and its title strip); it never shrinks by itself, and resizing stops at that box.
- **Legacy pockets** (no `size`: members in a space of their own): on open (website) or import (mod) the members are
  moved so their box sits a cell inside the frame under its title strip, at `position`, and the frame is sized to fit.
  Written back, they carry a `size` and frame-relative positions, as the website writes any board it has opened.
- Nested groups are drawn and kept (a collapsed group hides the groups inside it too). Grouping never nests by accident:
  see Making a group.
- Unknown pocket fields are kept on the website; the mod keeps the fields above.

## Colours

The group colour is the `colorTag`'s swatch. A pocket without one takes its paper's colour:

| theme | slate | blueprint | chalkboard | graphite | gunmetal | midnight | charcoal | void | parchment | paper |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| tag | steel | azure | green | brown | light_gray | blue | onyx | black | amber | white |

and one without a theme takes the paper its id gives it (`paperForBoardId`: Java's `String.hashCode` of the id, the
same sum, `abs(hash) % 8` into `slate, blueprint, chalkboard, graphite, gunmetal, midnight, charcoal, void`), then
the table. A new group takes the first of `light_blue, lime, orange, magenta, yellow, cyan, pink, purple, scarlet,
emerald, azure, amber` that no group on the plan wears (the first again when all are worn). The Colour menu offers the
sticky note's eleven.

## The look (the clean card's: flat, square, 1 px chrome, Monocraft)

Sizes in the mod's board px (the website multiplies by 380/320, as for annotations). `C` is the group colour (`mix(a, b, t)` is `t` of `a`, as `Hyb.mix`),
`mix(a, b, t)` the float32 mix (`Hyb.mix` / `mixHex`).

- **Open group.** The body is `C` at alpha `0x14` (8%) over the board; a 1 px border `mix(canvas, C, 0.6)`, the
  selection cyan when selected. Along the top inside it, a **title strip** 20 px tall, filled
  `mix(C, surface #23252A, 0.3)`, with a 1 px rule under it in `mix(canvas, C, 0.6)`. In the strip, 6 px in: the name
  in ink (`#E8E9EE`), then, muted (`#9A9CA4`), `N machines` (left out at 0). At its right end, 3 px in, the
  **collapse key**: a 14 px square key (the card's key tokens: face `#26282D`, hover `#2D2F35`, 1 px edge `#111317`)
  showing a minus. Wires and cards draw over the body; the strip draws under cards.
- **Collapsed group (the summary card).** 320 wide (a card's width) at the frame's corner. Face `#23252A`, 1 px
  border `mix(canvas, C, 0.6)` (selection cyan when selected). The same title strip on top with a plus on the key.
  Under it a 14 px line, muted: `N machines` and, when any, the EU/t (`1.2k EU/t`), 6 px in. Then the rows, 20 px
  each: what goes in on the left half (16 px icon 6 px in, the rate after it in ink), what comes out on the right
  half (icon at the half plus 6, rate after it), as many rows as the longer list, 4 px padding under the last. With
  neither: one row, muted, `Nothing goes in or out.`
- **Rates** read as the overview's do (the board's unit, /s or /t, the same number format).
- **Wires to a collapsed group** dock on the summary card, routed to its edge as a wire to a card is (anywhere on
  the box's edge, the router's choice): a wire between a member and something outside runs to the summary instead.
  Wires with both ends inside are not drawn. Drawers outside linked to ports inside count as wires; one wire per
  member port, so two members fed from one card show two wires.
- **Minimap**: an open group is its frame, `C` at 25% with a 1 px border in `C`; a collapsed one is the summary card's
  box in `mix(C, surface, 0.3)`.

## What the summary says (solved flows)

From the plan-wide solve, never a solve of the group alone. Over the members (nested groups included):

- **Machines**: every machine card's build count (its solved count rounded up; a pinned count as pinned), shared
  machines once. Drawers, notes and planning cards (custom rate, fluid tank) are not machines.
- **EU/t**: the members' power as the overview counts it (what they draw at their solved speed).
- **In and out**: per resource, the members' solved consumption minus their solved production (count times
  per-machine rate, the card's own numbers). More consumed is an input (that net rate), more made an output. Busiest
  first. The old summary counted every machine at its full rate; that is gone.

## Making and changing a group

| Do | What happens |
| --- | --- |
| Select (marquee or Shift-click), then the **Group** key in the selection bar (beside "Combine N into one machine"), **Ctrl+G**, or **Group selected** in the right-click menu | A group round the selection where it stands (nothing moves): frame = the members' box plus a cell, the title strip above. The selection becomes the group. |
| Click the title strip's name | Rename in place (Enter sets, Escape cancels; empty keeps the old name). |
| Drag the title strip (or the summary card) | Moves the group and everything in it, nested groups included. Drops follow the board's rules (a 3 px slop, the 10 px grid, never onto a card). |
| Drag a frame's edge or corner (4 px either side of the border) | Resizes it; it never cuts a member off. |
| The collapse key; double-click the summary card | Collapse or expand. |
| Drag a card, drawer or note so its centre lands inside an open group's frame | It joins that group (the innermost open group there). Dropped outside every frame, it leaves its group. A group dragged keeps its own parent. |
| Right-click a group (strip, border, summary card) | Rename, Collapse / Expand, Colour..., Ungroup (the group goes, its contents stay where they are, in the group it sat in), Delete group and contents (red). |
| Right-click a card, drawer, note or drawing | Its menu, which now always ends in: Group selected (when two or more things are selected and it is one of them), Add to group... (a list of the open groups; it moves to sit just under that group's members, a cell in, and the frame grows) or Remove from group (it moves a cell clear of the frame's right side), and Delete. A right-click on an item's icon still looks it up (recipes; uses with Shift), as R and U do. |
| Delete key on a selected group | Deletes the group and its contents, as deleting a selected board always did (undo brings them back). |
| Copy and paste | A copied group takes its contents with it. |

**Making a group never nests by accident.** If every selected thing is in the same group, the new group goes inside
it; otherwise the selected things leave their groups and the new group sits on the board. Selected groups go inside
the new group.

Undo covers every change (one step each). A collapsed group's members cannot be selected, hovered or dragged; select-all
and the marquee skip them; they still solve.

## Arrange

Arrange keeps a group together: each top-level group is one block of its frame's size (or the summary card's when
collapsed), its insides untouched, placed with the ungrouped cards; the website's old "Keep boards on rearrange" made
this the only behaviour. Wires into a group count as wires into its block.

## Where it lives

| | Mod | Website |
| --- | --- | --- |
| Model | `data/flowchart/BoardGroup`, `Graph.boardGroups`, `Node.group`, `Drawer.group`, `Note.group` | `FactoryPocket`, `pocketId` (unchanged) |
| Edits | `ui/BoardSession` (`groupSelection`, `ungroup`, `moveGroup`, `setGroupOf`...) | store: `wrapSelectionInBoard`, `dissolvePocket`, `expandPocket`, `minimizePocket`... |
| Drawn | `ui/group/GroupCard`, `GroupPaint`, `GroupSummary` | `src/components/flow/clean/group/` |
| Wires | `ui/canvas/WireLayer` (docks on a collapsed group) | the board's edge docking on a minimized board |
| Plan JSON | `importer/FfPlanParser` (boards), `FfConverter`, `library/PlanExport` | native |
| Minimap | `ui/world/Minimap` via `PlanSnapshot` | `clean/minimap/minimap-scene.ts` |
