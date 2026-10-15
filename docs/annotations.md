# Board annotations (boxes, zones, arrows, images, notes)

Written 2026-10-14 (AN1). One file, copied verbatim into the website (`docs/annotations.md`); change both together.
Both planners show every kind the website's library plans carry, in one look, and a plan round-trips between them.

## The model (the website's `FactoryAnnotation`, plan JSON `annotations[]`)

| Field | Kinds | Meaning |
| --- | --- | --- |
| `id`, `kind` | all | `box`, `zone`, `arrow`, `text`, `image` |
| `position`, `size` | all | top-left and bounding box, website board px (the mod scales by 320/380 like cards) |
| `colorTag` | all | one of the 22 colour tags (swatch below); absent = yellow |
| `text` | text, image | note body; an image's caption |
| `fontSize` | text | 8..96, 14 default (sticky notes, unchanged: `ui/note/NoteCard`, `clean/note/StickyNote`) |
| `arrowDirection` | arrow | `down-right` (default), `down-left`, `up-right`, `up-left`: tail to head across the bounding box |
| `points` | zone | closed outline, vertices relative to `position` (3 or more) |
| `imageUrl` | image | the picture's hosted URL |
| `style.border` | box, zone, image | `solid` (default), `dashed`, `none` |
| `style.borderColor`, `style.fillColor` | box, zone, image | colour tags; absent = `colorTag` |
| `style.fill` | box, zone | `tint` (default), `solid`, `none`; the legacy mark names (`dots`, `grid`, `graph`, `ruled`, `hatch`) mean tint wearing that mark, `paper` means solid |
| `style.marks` | box, zone | `none`, `dots`, `grid`, `graph`, `ruled`, `hatch` |
| `style.fillTheme` | box, zone | a textured paper; **not drawn** in the clean look (the fill colour is used), kept in the data |
| `pocketId` | all | the board it lives on; plans flatten boards on import, so it is not kept by the mod |

Nothing here takes part in the solve, the wiring or Arrange. Unknown fields are kept by the website; the mod keeps
the ones above.

## The look (the clean card's: flat, square, 1 px chrome, Monocraft)

Colours are the colour tag's swatch (`GT_NODE_COLORS` / `NoteColors.SWATCH`, same 22). Sizes are in the mod's board
px; the website multiplies by 380/320 (1.1875) so a plan looks the same in both.

- **Box**: a square rectangle. Border 2 px in the border colour (`dashed`: 8 on, 6 off), nothing rounded, no
  shadow, no black halo. Surface: `tint` is the fill colour at 8% alpha (`0x14`), `solid` at 28% (`0x47`), flat;
  `none` is empty. Marks over the surface in the fill colour at 16..35%: dots (a pixel per 10 px cell), grid (1 px
  lines per cell), graph (grid plus a stronger line every 5 cells), ruled (a line every 2 cells), hatch (diagonals).
- **Zone**: the box's look on the outline `points` (square joins, flat fill, same border, surface and marks).
- **Arrow**: a 2 px line in the colour from the tail corner to the head corner, ending in a flat filled arrowhead
  (14 long, 10 wide), no outline.
- **Image**: a framed panel. 2 px frame in the border colour (`none`: no frame; no colour at all: the clean card's
  frame grey `#3C3E45`), a 3 px inset of the panel dark (`#26282C`), the picture inside. A caption (`text`) sits in a
  16 px strip under the picture in Monocraft 10 px, light grey, cut with an ellipsis; no caption, no strip. A picture
  that is not there (offline, blocked, too big, not loaded yet) is the panel with "image unavailable" or "loading"
  and the caption, so the plan still reads.
- **Text** stays a sticky note.

Order, back to front: boxes, zones and images (under everything, the board's backdrop), drawers and cards, and
arrows with the notes (over the wires). A box and a zone are click-through inside: only the border takes the pointer;
an arrow only its line; an image its whole face.

## Interactions (as notes)

Select with a click (Shift adds); drag the border, the line or the panel to move (with the selection, snapped to the
10 px grid); a corner grip resizes a box, a zone or an image (an image keeps its proportions; a zone's outline scales
with it) and an arrow's box; Delete or the key at the top left deletes; right-click offers Colour and Delete. A
selected drawing wears the selection cyan outline (a note only with several selected). They are in undo, copy and
paste, and save with the plan. The website keeps its drawing tools (pencil menu) on classic boards; on a plan board
the shapes can be moved, resized, recoloured and deleted, not restyled.

## Plan JSON both ways

Import keeps every field above (mod `importer/FfPlanParser` to `FfConverter.placeNotes`); export writes them back
(`library/PlanExport.note`). Positions and sizes are scaled by the card scale and snapped to whole cells; zone points
are scaled with them. The mod saves them as a `kind` on its note (`data/flowchart/Note`), so older saves are all text.

## Images in the mod

`ui/note/ImageCache`: downloaded on a background thread from the plan's URL (http or https only), 4 MB cap, decoded
by ImageIO, shrunk to 512 px a side, kept on disk (`gtnhplanner/images/<hash>.png`) and uploaded as a GL texture on
the render thread. Until it arrives, and when it fails, the placeholder above shows.
