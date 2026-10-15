"use client";

import { MenuPortal, type MenuAnchor } from "./MenuPortal";

/**
 * The card's actions key menu, as the mod's (RecipeCard.openActions): "Clone node" and, in red, "Delete node", no
 * icons. The mod's world rows (Show in the world, Remove from the world) have no website equivalent.
 */
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
  const row = (label: string, run: () => void, danger = false) => (
    <div
      role="menuitem"
      tabIndex={0}
      className="cm-row"
      data-danger={danger ? "" : undefined}
      onClick={() => {
        onClose();
        run();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClose();
          run();
        }
      }}
    >
      <span className="cm-name">{label}</span>
    </div>
  );
  // The mod's list is 150 board px wide: 254 here at the menus' size on screen.
  return (
    <MenuPortal anchor={anchor} width={254} maxHeight={200} label="Card actions" onClose={onClose} className="cm-actions">
      {row("Clone node", onClone)}
      {row("Delete node", onDelete, true)}
    </MenuPortal>
  );
}
