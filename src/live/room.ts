import { COMMUNITY_UPLOAD_MAX_BYTES } from "@/lib/community/types";
import { applyOps, cloneJson, type LiveOp, type LivePlan } from "@/lib/live/ops";
import {
  colorFor,
  parseDocKey,
  type LiveMember,
  type LivePerson,
  type ServerFrame,
} from "@/lib/live/protocol";
import { checkBatch } from "@/lib/live/validate";
import type { Journal } from "./journal";
import type { PlanStore } from "./store";

/**
 * One open plan: the plan in memory, its seq, who is in it, and the timers
 * that keep the database up to date. Every change to the room (a batch, a
 * join, closing) runs through one queue, so batches apply in arrival order
 * and a snapshot never sees half a batch.
 */

export interface RoomTiming {
  /** At most one flush this often while edited. */
  flushMs: number;
  /** Lease renewal period. */
  renewMs: number;
  /** How far ahead each lease reaches. */
  leaseMs: number;
}

export interface RoomPeer {
  readonly connId: string;
  readonly userId: string;
  readonly username: string;
  readonly client: "game" | "web";
  send(frame: ServerFrame): void;
  /** The peer is out of this room (kicked): it forgets the room. */
  forget(doc: string): void;
}

export interface RoomDeps {
  store: PlanStore;
  journal: Journal;
  timing: RoomTiming;
  /** The plan size limit, in JSON characters (the library's upload limit). */
  maxPlanChars?: number;
  /** Recently applied batch ids, kept across the room closing and opening again. */
  cids: Map<string, number>;
  log: (message: string) => void;
  /** Called once the room has closed (flushed and let go, or deleted). */
  onClosed: (room: Room) => void;
}

export type BatchResult =
  | { kind: "applied"; seq: number; ops: LiveOp[] }
  | { kind: "duplicate"; seq: number }
  | { kind: "refused"; code: "bad_op" | "too_big"; msg: string };

const RECENT_CIDS = 5000;

function sizeOf(value: unknown): number {
  return value === undefined ? 0 : JSON.stringify(value).length;
}

function findThing(plan: LivePlan, c: string, id: string): Record<string, unknown> | undefined {
  const things = plan[c];
  if (!Array.isArray(things)) {
    return undefined;
  }
  return things.find(
    (thing) => typeof thing === "object" && thing !== null && (thing as { id?: unknown }).id === id,
  ) as Record<string, unknown> | undefined;
}

/** The fields the server writes on a comment: who wrote it and when. */
const COMMENT_STAMPS = ["by", "byName", "at"] as const;

export class Room {
  readonly doc: string;
  readonly ownerId: string;
  readonly designId: string;
  plan: LivePlan = {};
  seq = 0;
  members: LiveMember[] = [];
  ownerName = "";
  readonly peers = new Set<RoomPeer>();
  closed = false;

  private flushedSeq = 0;
  private size = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private flushTimer: ReturnType<typeof setTimeout> | undefined;
  private renewTimer: ReturnType<typeof setInterval> | undefined;
  private lastFlushAt = 0;
  private flushing: Promise<boolean> | undefined;

  private constructor(
    doc: string,
    private readonly deps: RoomDeps,
  ) {
    const key = parseDocKey(doc)!;
    this.doc = doc;
    this.ownerId = key.ownerId;
    this.designId = key.designId;
  }

  /**
   * Opens a room: takes the lease and reads the plan, replays any journal
   * left by a crash, and starts renewing the lease. Undefined when the design
   * is missing or deleted.
   */
  static async open(doc: string, deps: RoomDeps): Promise<Room | undefined> {
    const room = new Room(doc, deps);
    const loaded = await deps.store.lease(room.ownerId, room.designId, room.leaseUntil());
    if (!loaded) {
      return undefined;
    }
    room.plan = loaded.plan && typeof loaded.plan === "object" ? loaded.plan : {};
    room.seq = loaded.seq;
    room.flushedSeq = loaded.seq;
    room.lastFlushAt = Date.now();
    const journalled = await deps.journal.read(doc);
    const replay = journalled.filter((entry) => entry.seq > room.seq);
    if (journalled.length > replay.length) {
      // Flushed before a crash but never trimmed.
      await deps.journal.trim(doc, room.seq);
    }
    for (const entry of replay) {
      room.plan = applyOps(room.plan, entry.ops);
      room.seq = entry.seq;
      room.remember(entry.cid, entry.seq);
    }
    if (replay.length > 0) {
      deps.log(`${doc}: replayed ${replay.length} journalled batches up to seq ${room.seq}`);
    }
    room.size = sizeOf(room.plan);
    const [members, names] = await Promise.all([
      deps.store.members(room.ownerId, room.designId),
      deps.store.usernames([room.ownerId]),
    ]);
    room.members = members;
    room.ownerName = names.get(room.ownerId) ?? "";
    room.renewTimer = setInterval(() => void room.renew(), deps.timing.renewMs);
    room.renewTimer.unref?.();
    if (room.dirty) {
      room.scheduleFlush();
    }
    return room;
  }

  get dirty(): boolean {
    return this.seq > this.flushedSeq;
  }

  /** Everyone in the room, one entry per connection. */
  get present(): LivePerson[] {
    return [...this.peers].map((peer) => ({
      id: peer.userId,
      username: peer.username,
      color: colorFor(peer.userId),
      client: peer.client,
      conn: peer.connId,
    }));
  }

  /** Runs `work` after everything queued before it. */
  enqueue<T>(work: () => Promise<T> | T): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }

  broadcast(frame: ServerFrame, except?: RoomPeer): void {
    for (const peer of this.peers) {
      if (peer !== except) {
        peer.send(frame);
      }
    }
  }

  /**
   * Applies one batch from `peer`: refused whole when its result breaks a
   * schema or the size limit, acknowledged without applying when its cid was
   * applied already (a resend after a reconnect). Comments get the server's
   * stamp: who wrote them and when. Journalled before it is broadcast.
   */
  async apply(peer: RoomPeer, cid: string, incoming: LiveOp[]): Promise<BatchResult> {
    if (this.closed) {
      return { kind: "refused", code: "bad_op", msg: "The plan is closed." };
    }
    const seen = this.deps.cids.get(this.cidKey(cid));
    if (seen !== undefined) {
      return { kind: "duplicate", seq: seen };
    }
    const stamped = this.stampComments(peer, incoming);
    if ("error" in stamped) {
      return { kind: "refused", code: "bad_op", msg: stamped.error };
    }
    const ops = stamped.ops;
    const after = applyOps(this.plan, ops);
    const problem = checkBatch(after, ops);
    if (problem) {
      return { kind: "refused", code: "bad_op", msg: problem };
    }
    const size = this.size + this.sizeChange(this.plan, after, ops);
    const limit = this.deps.maxPlanChars ?? COMMUNITY_UPLOAD_MAX_BYTES;
    if (size > limit) {
      return {
        kind: "refused",
        code: "too_big",
        msg: `The plan would be over the ${Math.round(limit / 1024 / 1024)} MB limit.`,
      };
    }
    const seq = this.seq + 1;
    await this.deps.journal.append(this.doc, {
      seq,
      cid,
      by: peer.userId,
      at: new Date().toISOString(),
      ops,
    });
    this.plan = after;
    this.size = size;
    this.seq = seq;
    this.remember(cid, seq);
    this.broadcast({ t: "ops", doc: this.doc, seq, by: peer.userId, cid, ops });
    this.scheduleFlush();
    return { kind: "applied", seq, ops };
  }

  /**
   * A comment's author and time are the server's to write: a new comment gets
   * the sender and now; changing an existing one is its author's alone and
   * keeps its stamps. Anyone in the room may delete one (a task going takes
   * its comments with it).
   */
  private stampComments(peer: RoomPeer, ops: LiveOp[]): { ops: LiveOp[] } | { error: string } {
    if (!ops.some((op) => "c" in op && op.c === "taskComments")) {
      return { ops };
    }
    const now = new Date().toISOString();
    const putInBatch = new Set<string>();
    const out: LiveOp[] = [];
    for (const op of ops) {
      if (!("c" in op) || op.c !== "taskComments") {
        out.push(op);
        continue;
      }
      const old = putInBatch.has(op.id) ? undefined : findThing(this.plan, op.c, op.id);
      if (op.o === "put") {
        if (old && old.by !== peer.userId) {
          return { error: "Only its author can change a comment." };
        }
        const v = cloneJson(op.v);
        if (old) {
          for (const stamp of COMMENT_STAMPS) {
            v[stamp] = old[stamp];
          }
        } else {
          v.by = peer.userId;
          v.byName = peer.username;
          v.at = now;
          putInBatch.add(op.id);
        }
        out.push({ ...op, v });
      } else if (op.o === "patch") {
        if (old && old.by !== peer.userId) {
          return { error: "Only its author can change a comment." };
        }
        const f = { ...op.f };
        COMMENT_STAMPS.forEach((stamp) => delete f[stamp]);
        const d = op.d?.filter((name) => !(COMMENT_STAMPS as readonly string[]).includes(name));
        out.push(d && d.length > 0 ? { ...op, f, d } : { o: "patch", c: op.c, id: op.id, f });
      } else {
        out.push(op);
      }
    }
    return { ops: out };
  }

  /** How much longer the plan's JSON gets, from what the batch touched (exact again at each flush). */
  private sizeChange(before: LivePlan, after: LivePlan, ops: LiveOp[]): number {
    let change = 0;
    const touched = new Set<string>();
    const metaKeys = new Set<string>();
    for (const op of ops) {
      if (op.o === "meta") {
        Object.keys(op.f ?? {}).forEach((key) => metaKeys.add(key));
        (op.d ?? []).forEach((key) => metaKeys.add(key));
      } else {
        touched.add(`${op.c}\u0000${op.id}`);
      }
    }
    for (const key of touched) {
      const [c, id] = key.split("\u0000") as [string, string];
      const old = findThing(before, c, id);
      const next = findThing(after, c, id);
      change += sizeOf(next) - sizeOf(old) + (next ? 1 : 0) - (old ? 1 : 0);
    }
    for (const key of metaKeys) {
      const old = before[key];
      const next = after[key];
      change +=
        (next === undefined ? 0 : key.length + 4 + sizeOf(next)) -
        (old === undefined ? 0 : key.length + 4 + sizeOf(old));
    }
    return change;
  }

  private cidKey(cid: string): string {
    return `${this.doc}\u0000${cid}`;
  }

  private remember(cid: string, seq: number): void {
    const cids = this.deps.cids;
    cids.set(this.cidKey(cid), seq);
    while (cids.size > RECENT_CIDS) {
      const oldest = cids.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      cids.delete(oldest);
    }
  }

  private leaseUntil(): Date {
    return new Date(Date.now() + this.deps.timing.leaseMs);
  }

  /** Flushes once the flush period since the last one has passed. */
  scheduleFlush(): void {
    if (this.flushTimer || this.closed) {
      return;
    }
    const wait = Math.max(0, this.lastFlushAt + this.deps.timing.flushMs - Date.now());
    this.flushTimer = setTimeout(() => {
      this.flushTimer = undefined;
      void this.flush().then(() => {
        if (this.closed) {
          return;
        }
        if (this.peers.size === 0) {
          // Everyone left while an earlier last flush failed: close now.
          void this.closeIfEmpty();
        } else if (this.dirty) {
          this.scheduleFlush();
        }
      });
    }, wait);
    this.flushTimer.unref?.();
  }

  /**
   * Writes the plan and seq (and the lease: extended, or ended when `final`),
   * then trims the journal to what came after. False when the write failed
   * (the journal keeps everything; the next flush tries again) or the design
   * is gone (the room is dropped as deleted).
   */
  async flush(final = false): Promise<boolean> {
    while (this.flushing) {
      await this.flushing;
    }
    if (this.closed) {
      return false;
    }
    const run = (async () => {
      const plan = this.plan;
      const seq = this.seq;
      this.lastFlushAt = Date.now();
      try {
        const stored = await this.deps.store.flush(
          this.ownerId,
          this.designId,
          plan,
          seq,
          final ? null : this.leaseUntil(),
        );
        if (!stored) {
          await this.drop("deleted");
          return false;
        }
        this.flushedSeq = Math.max(this.flushedSeq, seq);
        this.size = sizeOf(this.plan);
        await this.deps.journal.trim(this.doc, seq);
        return true;
      } catch (error) {
        this.deps.log(`${this.doc}: flush failed, kept in the journal: ${String(error)}`);
        return false;
      }
    })();
    this.flushing = run;
    try {
      return await run;
    } finally {
      this.flushing = undefined;
    }
  }

  private async renew(): Promise<void> {
    if (this.closed) {
      return;
    }
    try {
      if (!(await this.deps.store.renew(this.ownerId, this.designId, this.leaseUntil()))) {
        await this.drop("deleted");
      }
    } catch (error) {
      this.deps.log(`${this.doc}: lease renewal failed: ${String(error)}`);
    }
  }

  /** Takes a peer out; the room closes when the last one goes. */
  leave(peer: RoomPeer): void {
    if (!this.peers.delete(peer)) {
      return;
    }
    this.broadcast({ t: "present", doc: this.doc, present: this.present });
    if (this.peers.size === 0) {
      void this.closeIfEmpty();
    }
  }

  /**
   * Closes the room once it is empty and its plan is safely stored: the last
   * flush also ends the lease. A failed flush keeps the room (and its lease)
   * and tries again on the flush timer; a join meanwhile finds it still open.
   */
  closeIfEmpty(): Promise<void> {
    return this.enqueue(async () => {
      if (this.peers.size > 0 || this.closed) {
        return;
      }
      const stored = this.dirty
        ? await this.flush(true)
        : await this.deps.store.release(this.ownerId, this.designId).then(
            () => true,
            (error) => {
              this.deps.log(`${this.doc}: releasing the lease failed: ${String(error)}`);
              return true;
            },
          );
      if (this.closed) {
        return;
      }
      if (!stored) {
        this.scheduleFlush();
        return;
      }
      this.finish();
    });
  }

  /** Flushes and lets go, whoever is in the room (the service is stopping). */
  async shutdown(): Promise<void> {
    await this.enqueue(async () => {
      if (this.closed) {
        return;
      }
      if (this.dirty) {
        await this.flush(true);
      } else {
        await this.deps.store.release(this.ownerId, this.designId).catch(() => undefined);
      }
      this.finish();
    });
  }

  /** Sharing changed: tell everyone, and drop whoever may no longer be here. */
  updateMembers(members: LiveMember[]): void {
    this.members = members;
    this.broadcast({ t: "members", doc: this.doc, members });
    const allowed = new Set([this.ownerId, ...members.map((member) => member.id)]);
    const removed = [...this.peers].filter((peer) => !allowed.has(peer.userId));
    for (const peer of removed) {
      peer.send({ t: "kicked", doc: this.doc, reason: "unshared" });
      this.peers.delete(peer);
      peer.forget(this.doc);
    }
    if (removed.length > 0) {
      this.broadcast({ t: "present", doc: this.doc, present: this.present });
      if (this.peers.size === 0) {
        void this.closeIfEmpty();
      }
    }
  }

  /** The design is gone: everyone out, nothing written back, the journal forgotten. */
  async drop(reason: "deleted"): Promise<void> {
    if (this.closed) {
      return;
    }
    this.broadcast({ t: "kicked", doc: this.doc, reason });
    this.peers.forEach((peer) => peer.forget(this.doc));
    this.peers.clear();
    await this.deps.journal.remove(this.doc).catch(() => undefined);
    this.finish();
  }

  /** Stops the room's timers and stores nothing (a crash, simulated in tests). */
  abandon(): void {
    this.closed = true;
    clearTimeout(this.flushTimer);
    clearInterval(this.renewTimer);
  }

  private finish(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    clearTimeout(this.flushTimer);
    clearInterval(this.renewTimer);
    this.flushTimer = undefined;
    this.deps.onClosed(this);
  }
}
