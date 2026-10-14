"use client";

import type { ReactNode } from "react";
import "./chrome/mod-panel.css";
import { useFactoryStore } from "@/store/factory-store";

/**
 * Spawners for the three non-recipe cards, at the top of the items column: a
 * generator (the power catalog), a custom rate node and a crop farm. Styled
 * quietly like the column's own keys (no plate, uncoloured icons). `leading`
 * is the column's fold-away key, placed at the row's start.
 */
export function SpawnKeys({ leading }: { leading?: ReactNode }) {
  const isReadOnly = useFactoryStore((state) => state.isReadOnly);
  const openPowerMenu = useFactoryStore((state) => state.openPowerMenu);
  const addCustomRateNode = useFactoryStore((state) => state.addCustomRateNode);
  const addCropFarmNode = useFactoryStore((state) => state.addCropFarmNode);
  const addFluidTankNode = useFactoryStore((state) => state.addFluidTankNode);
  // The columns' own hide keys' dress (the right column's "Hide" key): no
  // ground of their own, the column's border, a plain lift on hover - keys that act,
  // a step apart from the filter chips under them, which only narrow.
  const key = "pn-chip flex items-center justify-center gap-1";
  if (isReadOnly) return <div className="mx-2 mt-2 flex shrink-0 gap-1">{leading}</div>;
  return (
    <div className="mx-2 mt-2 flex shrink-0 gap-1">
      {leading}
      <button
        type="button"
        onClick={openPowerMenu}
        className={key}
        title="Place a generator"
        aria-label="Place a generator"
      >
        Power
      </button>
      <button
        type="button"
        onClick={addCustomRateNode}
        className={key}
        title="Add custom rate node"
        aria-label="Add custom rate node"
      >
        Custom
      </button>
      <button
        type="button"
        onClick={addFluidTankNode}
        className={key}
        title="Add a fluid tank: empties cells into their fluid and fills them"
        aria-label="Add fluid tank"
      >
        Tank
      </button>
      <button
        type="button"
        onClick={addCropFarmNode}
        className={key}
        title="Add crop farm"
        aria-label="Add crop farm"
      >
        Farm
      </button>
    </div>
  );
}
