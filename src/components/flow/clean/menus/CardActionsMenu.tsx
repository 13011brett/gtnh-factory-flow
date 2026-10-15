"use client";

import { BoardMenu, MenuLine, MenuRow } from "./BoardMenu";
import type { MenuAnchor } from "./MenuPortal";

/**
 * A card's rows, as the mod's (RecipeCard.openActions): "Clone node" and, in red, "Delete node". The same rows open
 * from the card's actions key and from a right click on the card (BoardContextMenu). The mod's world rows (Show in
 * the world, Remove from the world) have no website equivalent.
 */
export function CardRows({ onClone, onDelete, close }: { onClone: () => void; onDelete: () => void; close: () => void }) {
  return (
    <>
      <MenuRow
        label="Clone node"
        onClick={() => {
          close();
          onClone();
        }}
      />
      <MenuLine />
      <MenuRow
        label="Delete node"
        danger
        onClick={() => {
          close();
          onDelete();
        }}
      />
    </>
  );
}

/** The card's actions key menu: the card's rows under the key. */
export function CardActionsMenu({
  anchor,
  onClose,
  onClone,
  onDelete,
}: {
  anchor: MenuAnchor;
  onClose: () => void;
  onClone: () => void;
  onDelete: () => void;
}) {
  return (
    <BoardMenu x={anchor.left} y={anchor.bottom + 2} label="Card actions" onClose={onClose}>
      <CardRows onClone={onClone} onDelete={onDelete} close={onClose} />
    </BoardMenu>
  );
}
