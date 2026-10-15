import type { z } from "zod";
import {
  factoryAnnotationSchema,
  factoryEdgeSchema,
  factoryNodeSchema,
  factoryPocketSchema,
  factoryProjectSchema,
  factoryStorageSchema,
  fuelProfileSchema,
  planTaskCommentSchema,
  planTaskItemSchema,
  planTaskSchema,
  productionGroupSchema,
  recipeSchema,
} from "@/lib/model/schemas";
import { type LiveCollection, type LiveOp, type LivePlan, LIVE_COLLECTIONS } from "./ops";

/**
 * What a live batch may leave behind: every thing it put or patched must
 * pass its collection's schema afterwards, and every plan field it set or
 * deleted must pass the plan schema's rule for that field (a required field
 * cannot be deleted, an unknown one cannot be set). Checked by the live
 * service after applying a batch to a copy of the plan; a batch that fails is
 * refused whole.
 */

export const LIVE_ENTITY_SCHEMAS: Record<LiveCollection, z.ZodType> = {
  recipes: recipeSchema,
  nodes: factoryNodeSchema,
  storages: factoryStorageSchema,
  edges: factoryEdgeSchema,
  annotations: factoryAnnotationSchema,
  pockets: factoryPocketSchema,
  fuelProfiles: fuelProfileSchema,
  productionGroups: productionGroupSchema,
  tasks: planTaskSchema,
  taskItems: planTaskItemSchema,
  taskComments: planTaskCommentSchema,
};

// Every collection is listed above; this fails to compile when one is added
// to LIVE_COLLECTIONS without a schema.
void (LIVE_COLLECTIONS satisfies readonly (keyof typeof LIVE_ENTITY_SCHEMAS)[]);

const META_SCHEMAS = factoryProjectSchema.shape as unknown as Record<string, z.ZodType>;

function findThing(plan: LivePlan, c: LiveCollection, id: string): unknown {
  const things = plan[c];
  if (!Array.isArray(things)) {
    return undefined;
  }
  return things.find(
    (thing) => typeof thing === "object" && thing !== null && (thing as { id?: unknown }).id === id,
  );
}

function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return "invalid";
  }
  const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}

/** The first problem `ops` left in `after`, or null when the batch is sound. */
export function checkBatch(after: LivePlan, ops: readonly LiveOp[]): string | null {
  const checked = new Set<string>();
  for (const op of ops) {
    if (op.o === "put" || op.o === "patch") {
      const key = `${op.c}\u0000${op.id}`;
      if (checked.has(key)) {
        continue;
      }
      checked.add(key);
      const thing = findThing(after, op.c, op.id);
      if (thing === undefined) {
        // Patched while absent (a no-op), or deleted later in the batch.
        continue;
      }
      const result = LIVE_ENTITY_SCHEMAS[op.c].safeParse(thing);
      if (!result.success) {
        return `${op.c} ${op.id}: ${describeIssue(result.error)}`;
      }
    } else if (op.o === "meta") {
      const names = [...Object.keys(op.f ?? {}), ...(op.d ?? [])];
      for (const name of names) {
        if ((LIVE_COLLECTIONS as readonly string[]).includes(name)) {
          continue;
        }
        const schema = META_SCHEMAS[name];
        if (!schema) {
          return `plan field ${JSON.stringify(name.slice(0, 40))} is not part of a plan`;
        }
        const value = Object.prototype.hasOwnProperty.call(after, name) ? after[name] : undefined;
        const result = schema.safeParse(value);
        if (!result.success) {
          return `plan field ${name}: ${describeIssue(result.error)}`;
        }
      }
    }
  }
  return null;
}
