import {
  cloneJson,
  LIVE_COLLECTIONS,
  writeMetaFields,
  writeThingFields,
  type LiveCollection,
  type LiveOp,
  type LivePlan,
} from "@/lib/live/ops";

/**
 * A room's plan, kept so a batch costs what it touches, never the size of the
 * plan: each collection is an array with an id index that lives as long as
 * the room, written in place. `applyOps` (the shared engine) copies and
 * indexes every collection a batch touches; on a plan of tens of thousands of
 * things that is milliseconds a batch, and a scan per op was seconds.
 *
 * The results are exactly `applyOps`'s (doc.test.ts checks them against it):
 * a new thing is appended, a replaced or patched one keeps its place, a
 * deleted one leaves its place. Deletes leave a hole until enough gather to
 * be worth closing; holes never leave this class. Things are never changed in
 * place (a patch writes a copy), so a plan handed out by `toPlan` stays as it
 * was whatever happens to the doc afterwards.
 */

const COLLECTION_NAMES: ReadonlySet<string> = new Set(LIVE_COLLECTIONS);
const HOLE: unique symbol = Symbol("hole");
/** Marks a collection's key in `top`: its value lives in a shelf. */
const SHELVED: unique symbol = Symbol("shelved");

export type Thing = Record<string, unknown>;

interface Shelf {
  /** The things in order, HOLE where one was deleted. */
  things: unknown[];
  /** Each id's first thing. */
  index: Map<string, number>;
  holes: number;
  /** Ids held by more than one thing (never in a sound plan; lookups take the first). */
  dups: Set<string>;
}

/** What a batch leaves of one thing it touched, before it is committed. */
export interface StagedThing {
  c: LiveCollection;
  id: string;
  before: Thing | undefined;
  after: Thing | undefined;
  /** Put in the batch: the whole thing is new. */
  replaced: boolean;
  /** The fields the batch's patches set or deleted. */
  fields: Set<string>;
}

/** What a batch leaves of one plan field it set or deleted. */
export interface StagedMeta {
  name: string;
  before: unknown;
  after: unknown;
}

export interface Staged {
  things: StagedThing[];
  meta: StagedMeta[];
  /** Collections the plan lacks that the batch's puts make. */
  made: LiveCollection[];
}

function idOf(thing: unknown): string | undefined {
  return typeof thing === "object" &&
    thing !== null &&
    !Array.isArray(thing) &&
    typeof (thing as Thing).id === "string"
    ? ((thing as Thing).id as string)
    : undefined;
}

function shelfOf(things: unknown[]): Shelf {
  const shelf: Shelf = { things, index: new Map(), holes: 0, dups: new Set() };
  reindex(shelf);
  return shelf;
}

function reindex(shelf: Shelf): void {
  shelf.index.clear();
  shelf.dups.clear();
  shelf.things.forEach((thing, at) => {
    const id = idOf(thing);
    if (id === undefined) {
      return;
    }
    if (shelf.index.has(id)) {
      shelf.dups.add(id);
    } else {
      shelf.index.set(id, at);
    }
  });
}

export class LiveDoc {
  /** The plan's top-level fields in order; a collection held in a shelf is SHELVED here. */
  private readonly top: Record<string, unknown>;
  private readonly shelves = new Map<LiveCollection, Shelf>();
  private cached: LivePlan | undefined;

  constructor(plan: LivePlan) {
    this.top = { ...plan };
    for (const c of LIVE_COLLECTIONS) {
      const value = this.top[c];
      if (Array.isArray(value)) {
        this.shelves.set(c, shelfOf(value.slice()));
        this.top[c] = SHELVED;
      }
    }
  }

  /** The first thing with this id in the collection, as committed. */
  find(c: LiveCollection, id: string): Thing | undefined {
    const shelf = this.shelves.get(c);
    const at = shelf?.index.get(id);
    return shelf && at !== undefined ? (shelf.things[at] as Thing) : undefined;
  }

  /** A plan field's value (never a collection's). */
  field(name: string): unknown {
    const value = Object.prototype.hasOwnProperty.call(this.top, name) ? this.top[name] : undefined;
    return value === SHELVED ? undefined : value;
  }

  /** How many things the collection holds. */
  count(c: LiveCollection): number {
    const shelf = this.shelves.get(c);
    return shelf ? shelf.things.length - shelf.holes : 0;
  }

  /**
   * The plan as a plain object: fresh arrays (shared things), so it stays as
   * it is while the doc goes on changing. Kept until the next commit.
   */
  toPlan(): LivePlan {
    if (!this.cached) {
      const plan: LivePlan = { ...this.top };
      for (const [c, shelf] of this.shelves) {
        plan[c] =
          shelf.holes === 0 ? shelf.things.slice() : shelf.things.filter((t) => t !== HOLE);
      }
      this.cached = plan;
    }
    return this.cached;
  }

  /**
   * What `ops` would leave of every thing and plan field they touch, without
   * changing the doc: each touched thing before and after (in the order first
   * touched), and which of its fields the batch named. A patch or delete of a
   * thing that is not there touches nothing, as `applyOps` ignores it.
   */
  stage(ops: readonly LiveOp[]): Staged {
    const things = new Map<string, StagedThing>();
    const meta = new Map<string, StagedMeta>();
    const made = new Set<LiveCollection>();
    const present = (c: LiveCollection, id: string): StagedThing | undefined => {
      const key = `${c}\u0000${id}`;
      const staged = things.get(key);
      if (staged) {
        return staged.after ? staged : undefined;
      }
      const found = this.find(c, id);
      if (!found) {
        return undefined;
      }
      const fresh: StagedThing = {
        c,
        id,
        before: found,
        after: found,
        replaced: false,
        fields: new Set(),
      };
      things.set(key, fresh);
      return fresh;
    };
    const metaEntry = (name: string): StagedMeta => {
      let entry = meta.get(name);
      if (!entry) {
        const before = this.field(name);
        entry = { name, before, after: before };
        meta.set(name, entry);
      }
      return entry;
    };
    for (const op of ops) {
      switch (op.o) {
        case "put": {
          const key = `${op.c}\u0000${op.id}`;
          let staged = things.get(key);
          if (!staged) {
            const before = this.find(op.c, op.id);
            staged = { c: op.c, id: op.id, before, after: before, replaced: true, fields: new Set() };
            things.set(key, staged);
          }
          // Shares the op's values: nothing staged is ever written to.
          staged.after = { ...op.v, id: op.id };
          staged.replaced = true;
          if (!this.shelves.has(op.c)) {
            made.add(op.c);
          }
          break;
        }
        case "patch": {
          const staged = present(op.c, op.id);
          if (!staged) {
            break;
          }
          const next = { ...staged.after };
          writeThingFields(next, op.f, op.d);
          staged.after = next;
          for (const name of Object.keys(op.f ?? {})) {
            if (name !== "id") {
              staged.fields.add(name);
            }
          }
          for (const name of op.d ?? []) {
            if (name !== "id") {
              staged.fields.add(name);
            }
          }
          break;
        }
        case "del": {
          const staged = present(op.c, op.id);
          if (staged) {
            staged.after = undefined;
          }
          break;
        }
        case "meta": {
          const f = op.f ?? {};
          for (const name of Object.keys(f)) {
            if (!COLLECTION_NAMES.has(name)) {
              metaEntry(name).after = f[name];
            }
          }
          for (const name of op.d ?? []) {
            if (!COLLECTION_NAMES.has(name)) {
              metaEntry(name).after = undefined;
            }
          }
          break;
        }
      }
    }
    return { things: [...things.values()], meta: [...meta.values()], made: [...made] };
  }

  /** Applies `ops` in place, exactly as `applyOps` would. */
  commit(ops: readonly LiveOp[]): void {
    if (ops.length === 0) {
      return;
    }
    this.cached = undefined;
    let reindexNeeded: Set<Shelf> | undefined;
    for (const op of ops) {
      switch (op.o) {
        case "put": {
          const shelf = this.open(op.c);
          const value = { ...cloneJson(op.v), id: op.id };
          const at = shelf.index.get(op.id);
          if (at === undefined) {
            shelf.index.set(op.id, shelf.things.length);
            shelf.things.push(value);
          } else {
            shelf.things[at] = value;
          }
          break;
        }
        case "patch": {
          const shelf = this.shelves.get(op.c);
          const at = shelf?.index.get(op.id);
          if (!shelf || at === undefined) {
            break;
          }
          const next = { ...(shelf.things[at] as Thing) };
          writeThingFields(next, op.f, op.d);
          shelf.things[at] = next;
          break;
        }
        case "del": {
          const shelf = this.shelves.get(op.c);
          const at = shelf?.index.get(op.id);
          if (!shelf || at === undefined) {
            break;
          }
          shelf.things[at] = HOLE;
          shelf.index.delete(op.id);
          shelf.holes += 1;
          if (shelf.dups.has(op.id)) {
            // Another thing holds this id: between batches it is the one found
            // (applyOps indexes afresh each batch), never within this one.
            (reindexNeeded ??= new Set()).add(shelf);
          }
          break;
        }
        case "meta":
          writeMetaFields(this.top, op.f, op.d);
          break;
      }
    }
    for (const shelf of this.shelves.values()) {
      if (reindexNeeded?.has(shelf) || (shelf.holes > 64 && shelf.holes * 2 > shelf.things.length)) {
        shelf.things = shelf.things.filter((thing) => thing !== HOLE);
        shelf.holes = 0;
        reindex(shelf);
      }
    }
  }

  /** The collection's shelf for writing, made (empty) when the plan has none. */
  private open(c: LiveCollection): Shelf {
    let shelf = this.shelves.get(c);
    if (!shelf) {
      shelf = shelfOf([]);
      this.shelves.set(c, shelf);
      this.top[c] = SHELVED;
    }
    return shelf;
  }
}
