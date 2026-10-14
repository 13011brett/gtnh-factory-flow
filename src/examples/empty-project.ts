import { DEFAULT_FUEL_PROFILE_ID, gtnhFuelProfiles } from "@/lib/model/fuels";
import { PROJECT_SCHEMA_VERSION, type FactoryProject } from "@/lib/model/types";

export function createEmptyProject(): FactoryProject {
  const now = new Date().toISOString();

  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: "manual-project",
    name: "GTNH Planner",
    recipes: [],
    nodes: [],
    storages: [],
    edges: [],
    fuelProfiles: gtnhFuelProfiles,
    selectedFuelProfileId: DEFAULT_FUEL_PROFILE_ID,
    notes: "Dataset-backed plan. Recipes must come from a normalized GTNH dataset.",
    metadata: {
      createdAt: now,
      updatedAt: now,
    },
  };
}

/**
 * A brand-new design. There is one mode, so it starts in plan mode, with both
 * flags as plan mode always carries solve mode (an older build opens it as
 * Solve). `createEmptyProject` stays the unmoded blank for code that builds
 * scratch projects (blueprint stats, tests).
 */
export function createNewProject(): FactoryProject {
  return { ...createEmptyProject(), planMode: true, solveMode: true };
}
