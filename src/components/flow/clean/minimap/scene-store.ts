import type { Scene } from "./minimap-scene";

/** The last scene the minimap built, for what needs the plan's picture outside the board (the Feedback box). */
let latest: Scene | undefined;

export function publishMinimapScene(scene: Scene | undefined): void {
  latest = scene;
}

export function latestMinimapScene(): Scene | undefined {
  return latest;
}
