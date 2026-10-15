# Sticky notes (src/components/flow/clean/note)

The mod's sticky note (`ui/note/NoteCard`) on plan boards (`project.planMode`). A note is the website's
text annotation (`kind: "text"`, `colorTag`, `fontSize`), so import, export and posts are unchanged.

- `AnnotationSwitch` is what FactoryFlow registers as `annotationNode`: on a plan board a text annotation is
  `StickyNote`, a box, zone or arrow `CleanDrawing`, a picture nothing; classic boards keep the classic `AnnotationNode`.
- `visibleAnnotations` (used where FactoryFlow builds its nodes): a plan board drops picture annotations (kept in the data
  untouched). The plan board has no pencil menu or image key; image paste and drop do nothing.
- `note-model.ts` is pure and tested: the mod's colours (`notePalette`, from `GT_NODE_COLORS` swatches), parts under the
  pointer, key rects (fixed screen size via `--board-zoom`), wrapping, `neededHeight`. Chrome sizes are the mod's scaled by
  380/320; the note's own size is not scaled.
- Pointer: React Flow carries the note; a press let go within 3 px is a click (writes, or a key). The resize zone (right and
  bottom edges, folded corner) toggles `nodrag nopan` so a press there resizes instead; set on pointerdown too, as the
  mouse press follows it. Written on, the textarea keeps the keyboard through a press that drags.
- DOM: the note, its text (or textarea) and three keys. Paper, band, fold, grip and the selection outline are pseudo-elements
  and a `filter: drop-shadow`; state is on data attributes (`data-editing`, `data-multi`, `data-part`).
- Face and words are the mod's: Monocraft (`--cc-font`, measured with `measureClean`), "Double-click to write" on an empty
  note, tips as `NoteCard.tip`; a new note is 220 by 140, the mod's 180 by 120 beside its 320 card taken to the 380 card
  and the 20 px grid.
- Selection outline only when several nodes are selected. Stacked over wires, under cards (`STICKY_NOTE_Z_INDEX`).

## Drawn annotations (box, zone, arrow)

Designed once for both planners: `docs/annotations.md` (the mod has the same file). `AnnotationSwitch` sends them to
`CleanDrawing` on a plan board: flat, square, 2 mod px line, sizes the mod's times `K` = 380/320 (`drawing-look.ts`,
tested). Made and edited from the board's right-click menu (`BoardContextMenu`: Add sticky note, Add box, Add arrow;
right-click a drawing for `AnnotationMenu`: Colour, Fill, Border, Marks, or Thickness, Heads, Delete). A box moves by
its border strips and resizes by React Flow's corner handles and outer edge bands (`drawing.css`); an arrow moves by its
line and is reshaped by its two end handles (`CleanDrawing`'s `Arrow`, pointer capture, board space through
`screenToFlowPosition`, snapped to the grid, one undoable `updateAnnotation`; `arrowFromEnds` turns two ends into box and
direction). An arrow may have a 0 axis (store `snapAnnotationToGrid` by kind; the node stays 1 px so it is measured).
Handles: a box's corners while selected, an arrow's ends while selected or hovered; the outline only with several
selected (`data-multi`). Pictures (`kind: "image"`) are no longer supported: `visibleAnnotations` drops them on a plan
board and `AnnotationSwitch` renders nothing; the data stays in the project. Zones are shown, not offered in Add.
