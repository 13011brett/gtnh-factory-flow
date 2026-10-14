"use client";

import { useMemo } from "react";
import type { MachineHandler } from "@/lib/model/types";
import { ArtBox } from "./ArtBox";
import { getMachineGroup, orderMachineHandlers } from "../../MachinePicker";
import { machineIconAtTier, useMachineHandlerIconEntries, useRecipeMapIcons, type MachineHandlerIcon } from "../../machine-icons";
import { MenuPortal, type MenuAnchor } from "./MenuPortal";

/**
 * The machine list (the mod's picker): a compact menu under the name headed "Machines that run this recipe", a row a
 * machine (its picture, its name, "Multiblock" or its kind on the right), the one in use gold. Pick one and the card
 * becomes that machine; the wheel on the name steps through the same order.
 */
export function MachineListMenu({
  anchor,
  handlers,
  selectedId,
  recipeMap,
  onUse,
  onClose,
}: {
  anchor: MenuAnchor;
  handlers: MachineHandler[];
  selectedId: string;
  recipeMap: string;
  onUse: (id: string) => void;
  onClose: () => void;
}) {
  const entries = useMachineHandlerIconEntries();
  const mapIcons = useRecipeMapIcons();
  const ordered = useMemo(() => orderMachineHandlers(handlers), [handlers]);
  const mapIcon = mapIcons.get(recipeMap) as MachineHandlerIcon | undefined;
  return (
    <MenuPortal anchor={anchor} width={300} maxHeight={420} label="Machines that run this recipe" onClose={onClose}>
      <div className="cm-head">Machines that run this recipe</div>
      <div className="cm-scroll">
        {ordered.map((handler) => {
          const icon = machineIconAtTier(entries.get(handler.id), handler.minimumTier) ?? mapIcon;
          return (
            <div
              key={handler.id}
              role="menuitem"
              tabIndex={0}
              className="cm-row"
              data-current={handler.id === selectedId ? "" : undefined}
              onClick={() => onUse(handler.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter") onUse(handler.id);
              }}
            >
              <ArtBox src={icon?.iconPath} atlas={icon && !icon.iconPath ? { ...icon, displayName: icon.displayName ?? handler.label } : undefined} size={18} />
              <span className="cm-name">{icon?.displayName ?? handler.label}</span>
              <span className="cm-note">{getMachineGroup(handler)}</span>
            </div>
          );
        })}
      </div>
    </MenuPortal>
  );
}
