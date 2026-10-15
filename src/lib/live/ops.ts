/**
 * The live edit engine: what an edit to a shared plan is, how it applies, how
 * two plans differ, and how an edit is undone. Pure and framework-free: the
 * browser, the live service and the tests run this file, and the game's Java
 * engine mirrors it rule for rule. `live-vectors.json` pins every rule; both
 * engines run it, so a change here changes the vectors and the protocol
 * version.
 *
 * The rules (the contract both engines build against):
 * - A plan is a JSON object. Its arrays of things with a string `id` named in
 *   LIVE_COLLECTIONS are collections; every other top-level field is meta.
 * - An absent collection (or one that is not an array) equals an empty one.
 * - Equality is JSON equality: numbers by value, objects by keys regardless of
 *   order, arrays in order. A key holding `undefined` (JavaScript only) is the
 *   same as an absent key. A field set to its absent state is a delete, never
 *   `null`; `null` is an ordinary value.
 * - Ids are unique inside a collection. Lookups take the first thing with the
 *   id; things without a string id are carried along untouched and never
 *   addressed.
 * - Collection order carries no meaning: a new thing is appended, a replaced
 *   or patched thing keeps its place, a deleted one leaves its place.
 */

export const LIVE_PROTOCOL_VERSION = 1;

/** Changing this list bumps LIVE_PROTOCOL_VERSION; the game mirrors it. */
export const LIVE_COLLECTIONS = [
  "recipes",
  "nodes",
  "storages",
  "edges",
  "annotations",
  "pockets",
  "fuelProfiles",
  "productionGroups",
  "tasks",
  "taskItems",
  "taskComments",
] as const;

export type LiveCollection = (typeof LIVE_COLLECTIONS)[number];

const COLLECTION_SET: ReadonlySet<string> = new Set(LIVE_COLLECTIONS);

export function isLiveCollection(name: unknown): name is LiveCollection {
  return typeof name === "string" && COLLECTION_SET.has(name);
}

export type LivePlan = Record<string, unknown>;
export type LiveThing = Record<string, unknown> & { id: string };

/** Insert or replace the whole thing. */
export interface LivePutOp {
  o: "put";
  c: LiveCollection;
  id: string;
  v: LiveThing;
}

/**
 * Set top-level fields `f`, then delete fields `d`, on one thing. Ignored when
 * the thing is gone. `id` is never set or deleted.
 */
export interface LivePatchOp {
  o: "patch";
  c: LiveCollection;
  id: string;
  f: Record<string, unknown>;
  d?: string[];
}

/** Remove the thing; nothing when it is already gone. */
export interface LiveDelOp {
  o: "del";
  c: LiveCollection;
  id: string;
}

/** Set top-level plan fields `f`, then delete `d`. Collection names are ignored. */
export interface LiveMetaOp {
  o: "meta";
  f: Record<string, unknown>;
  d?: string[];
}

export type LiveOp = LivePutOp | LivePatchOp | LiveDelOp | LiveMetaOp;

// ---------------------------------------------------------------------------
// JSON helpers

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A key counts only when it holds a value: `undefined` is absence. */
function has(object: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key) && object[key] !== undefined;
}

/** The keys that hold values, in the object's own order. */
function presentKeys(object: Record<string, unknown>): string[] {
  return Object.keys(object).filter((key) => object[key] !== undefined);
}

/**
 * JSON equality: numbers by value (`1` equals `1.0`), objects by their present
 * keys regardless of order, arrays in order.
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (typeof a === "number" && typeof b === "number") {
    // NaN never reaches JSON; `===` already covered equal values, -0 == 0.
    return a === b;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i += 1) {
      if (!jsonEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const aKeys = presentKeys(a);
    const bKeys = presentKeys(b);
    if (aKeys.length !== bKeys.length) {
      return false;
    }
    for (const key of aKeys) {
      if (!has(b, key) || !jsonEqual(a[key], b[key])) {
        return false;
      }
    }
    return true;
  }
  return false;
}

/** A deep copy as JSON would carry it: `undefined` keys dropped. */
export function cloneJson<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : cloneJson(item))) as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value)) {
      const item = value[key];
      if (item !== undefined) {
        out[key] = cloneJson(item);
      }
    }
    return out as T;
  }
  return value;
}

function idOf(thing: unknown): string | undefined {
  return isPlainObject(thing) && typeof thing.id === "string" ? thing.id : undefined;
}

function collectionOf(plan: LivePlan, c: LiveCollection): unknown[] {
  const value = plan[c];
  return Array.isArray(value) ? value : [];
}

/**
 * Two plans are the same when their meta fields are JSON-equal and each
 * collection holds the same things by id, in any order. An absent collection
 * equals an empty one. This is how the test vectors compare plans.
 */
export function plansEqual(a: LivePlan, b: LivePlan): boolean {
  const metaKeys = new Set([...presentKeys(a), ...presentKeys(b)]);
  for (const key of metaKeys) {
    if (COLLECTION_SET.has(key)) {
      continue;
    }
    if (has(a, key) !== has(b, key) || !jsonEqual(a[key], b[key])) {
      return false;
    }
  }
  for (const c of LIVE_COLLECTIONS) {
    const left = collectionOf(a, c);
    const right = collectionOf(b, c);
    if (left.length !== right.length) {
      return false;
    }
    const byId = new Map<string, unknown>();
    const loose: unknown[] = [];
    for (const thing of right) {
      const id = idOf(thing);
      if (id === undefined) {
        loose.push(thing);
      } else {
        byId.set(id, thing);
      }
    }
    let looseAt = 0;
    for (const thing of left) {
      const id = idOf(thing);
      if (id === undefined) {
        if (!jsonEqual(thing, loose[looseAt])) {
          return false;
        }
        looseAt += 1;
      } else if (!byId.has(id) || !jsonEqual(thing, byId.get(id))) {
        return false;
      }
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Applying

const GONE = Symbol("gone");

interface OpenCollection {
  things: unknown[];
  index: Map<string, number>;
}

/**
 * A plan under edit: one shallow copy of the plan and of each collection a
 * batch touches, with an id index per touched collection. Applying a batch
 * costs one copy of what it touches, not one per op. A deleted thing leaves a
 * marker until `finish`, so deletes never shift the index.
 */
class Working {
  readonly plan: LivePlan;
  private readonly collections = new Map<LiveCollection, OpenCollection>();

  constructor(plan: LivePlan) {
    this.plan = { ...plan };
  }

  /** The collection for writing; created (empty) only when absent and `create` is set. */
  private open(c: LiveCollection, create: boolean): OpenCollection | undefined {
    let entry = this.collections.get(c);
    if (!entry) {
      const existing = this.plan[c];
      if (!Array.isArray(existing) && !create) {
        return undefined;
      }
      const things = Array.isArray(existing) ? existing.slice() : [];
      const index = new Map<string, number>();
      things.forEach((thing, at) => {
        const id = idOf(thing);
        if (id !== undefined && !index.has(id)) {
          index.set(id, at);
        }
      });
      entry = { things, index };
      this.collections.set(c, entry);
      this.plan[c] = things;
    }
    return entry;
  }

  find(c: LiveCollection, id: string): Record<string, unknown> | undefined {
    const entry = this.open(c, false);
    const at = entry?.index.get(id);
    return entry && at !== undefined ? (entry.things[at] as Record<string, unknown>) : undefined;
  }

  apply(op: LiveOp): void {
    switch (op.o) {
      case "put": {
        const entry = this.open(op.c, true)!;
        const value = { ...cloneJson(op.v), id: op.id };
        const at = entry.index.get(op.id);
        if (at === undefined) {
          entry.index.set(op.id, entry.things.length);
          entry.things.push(value);
        } else {
          entry.things[at] = value;
        }
        return;
      }
      case "patch": {
        const entry = this.open(op.c, false);
        const at = entry?.index.get(op.id);
        if (!entry || at === undefined) {
          return;
        }
        const next = { ...(entry.things[at] as Record<string, unknown>) };
        writeFields(next, op.f, op.d, isThingKey);
        entry.things[at] = next;
        return;
      }
      case "del": {
        const entry = this.open(op.c, false);
        const at = entry?.index.get(op.id);
        if (!entry || at === undefined) {
          return;
        }
        entry.things[at] = GONE;
        entry.index.delete(op.id);
        return;
      }
      case "meta":
        writeFields(this.plan, op.f, op.d, isMetaKey);
        return;
    }
  }

  /** The finished plan, delete markers swept out. */
  finish(): LivePlan {
    for (const [c, entry] of this.collections) {
      if (entry.things.includes(GONE)) {
        this.plan[c] = entry.things.filter((thing) => thing !== GONE);
      }
    }
    return this.plan;
  }
}

function isThingKey(key: string): boolean {
  return key !== "id";
}

function isMetaKey(key: string): boolean {
  return !COLLECTION_SET.has(key);
}

/** Sets `f` then deletes `d`, in place, for the keys `allowed` lets through; `undefined` in `f` deletes. */
function writeFields(
  target: Record<string, unknown>,
  f: Record<string, unknown> | undefined,
  d: string[] | undefined,
  allowed: (key: string) => boolean,
): void {
  if (isPlainObject(f)) {
    for (const key of Object.keys(f)) {
      if (!allowed(key)) {
        continue;
      }
      if (f[key] === undefined) {
        delete target[key];
      } else {
        target[key] = cloneJson(f[key]);
      }
    }
  }
  if (Array.isArray(d)) {
    for (const key of d) {
      if (typeof key === "string" && allowed(key)) {
        delete target[key];
      }
    }
  }
}

/**
 * The plan after a batch, ops in order. Pure: the input plan and the ops are
 * never changed, and the result shares only what the batch did not touch.
 */
export function applyOps<P extends LivePlan>(plan: P, ops: readonly LiveOp[]): P {
  if (ops.length === 0) {
    return plan;
  }
  const working = new Working(plan);
  for (const op of ops) {
    working.apply(op);
  }
  return working.finish() as P;
}

// ---------------------------------------------------------------------------
// Diffing

/** The fields that differ between two versions of one thing (or of the meta), or null. */
function diffFields(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  allowed: (key: string) => boolean,
): { f: Record<string, unknown>; d?: string[] } | null {
  const f: Record<string, unknown> = {};
  let changed = false;
  for (const key of presentKeys(after)) {
    if (!allowed(key)) {
      continue;
    }
    if (!has(before, key) || !jsonEqual(before[key], after[key])) {
      f[key] = cloneJson(after[key]);
      changed = true;
    }
  }
  const d = presentKeys(before)
    .filter((key) => allowed(key) && !has(after, key))
    .sort(compareNames);
  if (!changed && d.length === 0) {
    return null;
  }
  return d.length > 0 ? { f, d } : { f };
}

/** UTF-16 code unit order: what JavaScript's sort and Java's String.compareTo both use. */
function compareNames(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function indexById(things: unknown[]): Map<string, Record<string, unknown>> {
  const index = new Map<string, Record<string, unknown>>();
  for (const thing of things) {
    const id = idOf(thing);
    if (id !== undefined && !index.has(id)) {
      index.set(id, thing as Record<string, unknown>);
    }
  }
  return index;
}

/**
 * The batch that turns `before` into `after`: per collection (in
 * LIVE_COLLECTIONS order) a `put` for each thing only in `after` and a `patch`
 * for each thing in both with any top-level field different (in `after`'s
 * order), a `del` for each thing only in `before` (in its order); then one
 * `meta` for the changed top-level fields. Batch order: every put, then every
 * patch, then every del, then the meta. `d` lists names sorted and is left out
 * when empty; `f` is always there.
 */
export function diffPlans(before: LivePlan, after: LivePlan): LiveOp[] {
  const puts: LiveOp[] = [];
  const patches: LiveOp[] = [];
  const dels: LiveOp[] = [];
  for (const c of LIVE_COLLECTIONS) {
    const oldThings = collectionOf(before, c);
    const newThings = collectionOf(after, c);
    if (oldThings === newThings) {
      continue;
    }
    const oldIndex = indexById(oldThings);
    const newIndex = indexById(newThings);
    for (const [id, thing] of newIndex) {
      const old = oldIndex.get(id);
      if (!old) {
        puts.push({ o: "put", c, id, v: cloneJson(thing) as LiveThing });
      } else if (old !== thing) {
        const fields = diffFields(old, thing, isThingKey);
        if (fields) {
          patches.push({ o: "patch", c, id, ...fields });
        }
      }
    }
    for (const id of oldIndex.keys()) {
      if (!newIndex.has(id)) {
        dels.push({ o: "del", c, id });
      }
    }
  }
  const ops = [...puts, ...patches, ...dels];
  const meta = diffFields(before, after, isMetaKey);
  if (meta) {
    ops.push({ o: "meta", ...meta });
  }
  return ops;
}

// ---------------------------------------------------------------------------
// Inverting

/** Restores exactly the named fields of `old`: values it had, deletes for those it lacked. */
function restoreFields(
  old: Record<string, unknown>,
  f: Record<string, unknown> | undefined,
  d: string[] | undefined,
  allowed: (key: string) => boolean,
): { f: Record<string, unknown>; d?: string[] } | null {
  const names = new Set<string>();
  if (isPlainObject(f)) {
    Object.keys(f).forEach((key) => names.add(key));
  }
  if (Array.isArray(d)) {
    d.forEach((key) => typeof key === "string" && names.add(key));
  }
  const restoreF: Record<string, unknown> = {};
  const restoreD: string[] = [];
  for (const key of names) {
    if (!allowed(key)) {
      continue;
    }
    if (has(old, key)) {
      restoreF[key] = cloneJson(old[key]);
    } else {
      restoreD.push(key);
    }
  }
  if (Object.keys(restoreF).length === 0 && restoreD.length === 0) {
    return null;
  }
  restoreD.sort(compareNames);
  return restoreD.length > 0 ? { f: restoreF, d: restoreD } : { f: restoreF };
}

/**
 * The batch that undoes `ops`, computed against `before`, the plan they were
 * applied to. Each op is inverted against the plan as it stood just before
 * that op, and the inverses run in reverse order:
 * - `put` of a new thing becomes `del`; `put` over an existing thing becomes
 *   `put` of the old thing.
 * - `del` of a thing becomes `put` of the old thing; `del` of nothing, nothing.
 * - `patch` becomes a `patch` restoring the old values of exactly the fields it
 *   named (deleting those that were absent); a patch on nothing, nothing.
 * - `meta` likewise, on the plan's top-level fields.
 */
export function invertOps(before: LivePlan, ops: readonly LiveOp[]): LiveOp[] {
  const working = new Working(before);
  const inverse: LiveOp[] = [];
  for (const op of ops) {
    const undo = invertOne(working, op);
    if (undo) {
      inverse.push(undo);
    }
    working.apply(op);
  }
  return inverse.reverse();
}

function invertOne(working: Working, op: LiveOp): LiveOp | null {
  switch (op.o) {
    case "put": {
      const old = working.find(op.c, op.id);
      return old
        ? { o: "put", c: op.c, id: op.id, v: cloneJson(old) as LiveThing }
        : { o: "del", c: op.c, id: op.id };
    }
    case "del": {
      const old = working.find(op.c, op.id);
      return old ? { o: "put", c: op.c, id: op.id, v: cloneJson(old) as LiveThing } : null;
    }
    case "patch": {
      const old = working.find(op.c, op.id);
      if (!old) {
        return null;
      }
      const fields = restoreFields(old, op.f, op.d, isThingKey);
      return fields ? { o: "patch", c: op.c, id: op.id, ...fields } : null;
    }
    case "meta": {
      const fields = restoreFields(working.plan, op.f, op.d, isMetaKey);
      return fields ? { o: "meta", ...fields } : null;
    }
  }
}

// ---------------------------------------------------------------------------
// Reading ops off the wire

export const LIVE_ID_MAX_LENGTH = 200;
export const LIVE_FIELD_NAME_MAX_LENGTH = 100;

/**
 * Checks a batch's shape as it arrives from a socket: known op kinds, known
 * collections, string ids, a put's `v.id` equal to its id, no `id` in a patch,
 * no collection name in a meta. Returns the ops or the first problem. The
 * values themselves are checked after applying, against the plan schema.
 */
export function readOps(raw: unknown): { ops: LiveOp[] } | { error: string } {
  if (!Array.isArray(raw)) {
    return { error: "ops must be an array" };
  }
  const ops: LiveOp[] = [];
  for (let at = 0; at < raw.length; at += 1) {
    const op = raw[at] as Record<string, unknown>;
    const where = `op ${at}`;
    if (!isPlainObject(op)) {
      return { error: `${where} is not an object` };
    }
    if (op.o === "meta") {
      const fields = readFields(op, isMetaKey);
      if ("error" in fields) {
        return { error: `${where}: ${fields.error}` };
      }
      ops.push({ o: "meta", ...fields.value });
      continue;
    }
    if (!isLiveCollection(op.c)) {
      return { error: `${where}: unknown collection` };
    }
    if (typeof op.id !== "string" || op.id.length === 0 || op.id.length > LIVE_ID_MAX_LENGTH) {
      return { error: `${where}: bad id` };
    }
    if (op.o === "put") {
      if (!isPlainObject(op.v) || op.v.id !== op.id) {
        return { error: `${where}: a put needs v with v.id equal to id` };
      }
      ops.push({ o: "put", c: op.c, id: op.id, v: op.v as LiveThing });
    } else if (op.o === "patch") {
      const fields = readFields(op, isThingKey);
      if ("error" in fields) {
        return { error: `${where}: ${fields.error}` };
      }
      ops.push({ o: "patch", c: op.c, id: op.id, ...fields.value });
    } else if (op.o === "del") {
      ops.push({ o: "del", c: op.c, id: op.id });
    } else {
      return { error: `${where}: unknown op` };
    }
  }
  return { ops };
}

function readFields(
  op: Record<string, unknown>,
  allowed: (key: string) => boolean,
): { value: { f: Record<string, unknown>; d?: string[] } } | { error: string } {
  if (!isPlainObject(op.f)) {
    return { error: "f must be an object" };
  }
  for (const key of Object.keys(op.f)) {
    if (!allowed(key) || key.length > LIVE_FIELD_NAME_MAX_LENGTH) {
      return { error: `field ${JSON.stringify(key.slice(0, 40))} cannot be set` };
    }
  }
  if (op.d === undefined) {
    return { value: { f: op.f } };
  }
  if (!Array.isArray(op.d) || op.d.some((key) => typeof key !== "string" || !allowed(key))) {
    return { error: "d must be a list of field names" };
  }
  return { value: { f: op.f, d: op.d as string[] } };
}
