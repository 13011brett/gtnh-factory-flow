"use client";

import { useEffect } from "react";
import { backgroundAlpha, railAlpha, useSeeThrough } from "./see-through";
import "./see-through.css";

/**
 * Writes the See-through setting onto the page as `--board-bg-alpha` (the paper and the dots) and
 * `--rail-bg-alpha` (the overview rail, which keeps its floor). One effect, no per-frame work.
 * Mount it once next to the board; the stylesheet does the rest.
 */
export function SeeThroughController() {
  const percent = useSeeThrough();
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--board-bg-alpha", String(backgroundAlpha(percent)));
    root.style.setProperty("--rail-bg-alpha", String(railAlpha(percent)));
    if (percent > 0) root.dataset.seeThrough = String(percent);
    else delete root.dataset.seeThrough;
    return () => {
      root.style.removeProperty("--board-bg-alpha");
      root.style.removeProperty("--rail-bg-alpha");
      delete root.dataset.seeThrough;
    };
  }, [percent]);
  return null;
}
