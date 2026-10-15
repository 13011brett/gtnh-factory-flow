import { writeThingFields, type LiveOp } from "@/lib/live/ops";
import { checkPlanField, checkThing } from "@/lib/live/validate";
import type { LiveDoc, Staged, Thing } from "./doc";

/**
 * A batch made ready for a room: staged on its plan, checked against the
 * plan schema (`validate.ts`), with the ops that make what is stored the
 * schema's output appended, and how much longer the plan's JSON gets. Its
 * cost is what the batch touches, never the size of the plan.
 */

export interface PreparedBatch {
  /** The batch as it is applied, journalled and broadcast. */
  ops: LiveOp[];
  /** How many characters the plan's JSON grows by (negative: shrinks); exact again at each flush. */
  sizeChange: number;
}

export function prepareBatch(doc: LiveDoc, ops: LiveOp[]): PreparedBatch | { error: string } {
  const staged = doc.stage(ops);
  const fixes: LiveOp[] = [];
  for (const thing of staged.things) {
    const result = checkThing(thing);
    if ("error" in result) {
      return result;
    }
    if (result.fix) {
      fixes.push(result.fix);
      thing.after = fixed(thing.after!, result.fix);
    }
  }
  const metaFix: Record<string, unknown> = {};
  for (const field of staged.meta) {
    const result = checkPlanField(field.name, field.after);
    if ("error" in result) {
      return result;
    }
    if (result.fix) {
      metaFix[field.name] = result.fix.value;
      field.after = result.fix.value;
    }
  }
  if (Object.keys(metaFix).length > 0) {
    fixes.push({ o: "meta", f: metaFix });
  }
  return { ops: fixes.length > 0 ? [...ops, ...fixes] : ops, sizeChange: sizeChange(staged) };
}

function fixed(thing: Thing, fix: LiveOp): Thing {
  if (fix.o === "put") {
    return { ...fix.v };
  }
  if (fix.o === "patch") {
    const next = { ...thing };
    writeThingFields(next, fix.f, fix.d);
    return next;
  }
  return thing;
}

function jsonLength(value: unknown): number {
  return JSON.stringify(value)?.length ?? 0;
}

/** One `"name":value,` entry of an object, or nothing for an absent value. */
function entryLength(name: string, value: unknown): number {
  return value === undefined ? 0 : JSON.stringify(name).length + jsonLength(value) + 2;
}

/**
 * The change in the plan's JSON length: a thing put or deleted counts whole
 * (with its comma), a thing only patched by the fields named, a plan field by
 * its entry. Only what the batch touched is measured.
 */
function sizeChange(staged: Staged): number {
  let change = 0;
  for (const thing of staged.things) {
    const { before, after } = thing;
    if (thing.replaced || !before || !after) {
      change += (after ? jsonLength(after) + 1 : 0) - (before ? jsonLength(before) + 1 : 0);
    } else {
      for (const name of thing.fields) {
        change += entryLength(name, after[name]) - entryLength(name, before[name]);
      }
    }
  }
  for (const field of staged.meta) {
    change += entryLength(field.name, field.after) - entryLength(field.name, field.before);
  }
  for (const c of staged.made) {
    change += entryLength(c, []);
  }
  return change;
}
