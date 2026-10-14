# Sticky notes (src/components/flow/clean/note)

The mod's sticky note (`ui/note/NoteCard`) on plan boards (`project.planMode`). A note is the website's
text annotation (`kind: "text"`, `colorTag`, `fontSize`), so import, export and posts are unchanged.

- `AnnotationSwitch` is what FactoryFlow registers as `annotationNode`: text annotations on a plan board are
  `StickyNote`, everything else the classic `AnnotationNode`.
- `visibleAnnotations` (used where FactoryFlow builds its nodes): a plan board shows only text annotations. Box, arrow, zone
  and image annotations stay in the data untouched (old builds still show them), are hidden, and cannot be edited.
  The pencil menu loses those tools and the image key; image paste and drop do nothing.
- `note-model.ts` is pure and tested: the mod's colours (`notePalette`, from `GT_NODE_COLORS` swatches), parts under the
  pointer, key rects (fixed screen size via `--board-zoom`), wrapping, `neededHeight`. Chrome sizes are the mod's scaled by
  380/320; the note's own size is not scaled.
- Pointer: React Flow carries the note; a press let go within 3 px is a click (writes, or a key). The resize zone (right and
  bottom edges, folded corner) toggles `nodrag nopan` so a press there resizes instead; set on pointerdown too, as the
  mouse press follows it. Written on, the textarea keeps the keyboard through a press that drags.
- DOM: the note, its text (or textarea) and three keys. Paper, band, fold, grip and the selection outline are pseudo-elements
  and a `filter: drop-shadow`; state is on data attributes (`data-editing`, `data-multi`, `data-part`).
- Selection outline only when several nodes are selected. Stacked over wires, under cards (`STICKY_NOTE_Z_INDEX`).
