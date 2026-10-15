import { COMMUNITY_UPLOAD_MAX_BYTES } from "@/lib/community/types";
import { cloneJson, type LiveOp, type LivePlan } from "@/lib/live/ops";
import {
  colorFor,
  parseDocKey,
  type LiveMember,
  type LivePerson,
  type ServerFrame,
} from "@/lib/live/protocol";
import { prepareBatch } from "./batch";
import { LiveDoc } from "./doc";
import type { AppliedCid, Journal } from "./journal";
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
/** Batch ids a room keeps on disk past a flush (journal.ts), so a late resend is still known. */
export const ROOM_RECENT_CIDS = 1000;

function sizeOf(value: unknown): number {
  return value === undefined ? 0 : JSON.stringify(value).length;
}

/** The fields the server writes on a comment: who wrote it and when. */
const COMMENT_STAMPS = ["by", "byName", "at"] as const;

export class Room {
  readonly doc: string;
  readonly ownerId: string;
  readonly designId: string;
  /** The plan, kept so a batch costs what it touches (doc.ts). */
  content = new LiveDoc({});
  seq = 0;
  members: LiveMember[] = [];
  ownerName = "";
  readonly peers = new Set<RoomPeer>();
  closed = false;

  private flushedSeq = 0;
  private size = 0;
  /** This room's last applied batch ids and their seqs, oldest first. */
  private readonly recent = new Map<string, number>();
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
    room.content = new LiveDoc(loaded.plan && typeof loaded.plan === "object" ? loaded.plan : {});
    room.seq = loaded.seq;
    room.flushedSeq = loaded.seq;
    room.lastFlushAt = Date.now();
    // Batch ids from before the last flush, then the journal's own: a resend
    // of any of them is acknowledged, never applied again.
    for (const [cid, seq] of await deps.journal.readCids(doc)) {
      room.remember(cid, seq);
    }
    const journalled = await deps.journal.read(doc);
    const replay = journalled.filter((entry) => entry.seq > room.seq);
    // Entries already stored but never trimmed still name applied batches.
    for (const entry of journalled) {
      if (entry.seq <= room.seq) {
        room.remember(entry.cid, entry.seq);
      }
    }
    if (journalled.length > replay.length) {
      // Flushed before a crash but never trimmed.
      await deps.journal.trim(doc, room.seq, room.recentCids());
    }
    for (const entry of replay) {
      // The same batch journalled twice is applied once; its seq still counts.
      if (!room.recent.has(entry.cid)) {
        room.content.commit(entry.ops);
        room.remember(entry.cid, entry.seq);
      }
      room.seq = entry.seq;
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

  /** The plan as it stands: a plain object that stays as it is while the room goes on. */
  get plan(): LivePlan {
    return this.content.toPlan();
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
    const seen = this.recent.get(cid) ?? this.deps.cids.get(this.cidKey(cid));
    if (seen !== undefined) {
      return { kind: "duplicate", seq: seen };
    }
    const stamped = this.stampComments(peer, incoming);
    if ("error" in stamped) {
      return { kind: "refused", code: "bad_op", msg: stamped.error };
    }
    const prepared = prepareBatch(this.content, stamped.ops);
    if ("error" in prepared) {
      return { kind: "refused", code: "bad_op", msg: prepared.error };
    }
    const ops = prepared.ops;
    const size = this.size + prepared.sizeChange;
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
    this.content.commit(ops);
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
      const old = putInBatch.has(op.id) ? undefined : this.content.find(op.c, op.id);
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

  private cidKey(cid: string): string {
    return `${this.doc}\u0000${cid}`;
  }

  private remember(cid: string, seq: number): void {
    this.recent.delete(cid);
    this.recent.set(cid, seq);
    while (this.recent.size > ROOM_RECENT_CIDS) {
      const oldest = this.recent.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.recent.delete(oldest);
    }
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

  private recentCids(): AppliedCid[] {
    return [...this.recent];
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
      const sizeAtCapture = this.size;
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
        // Exact again: the stored plan measured, plus what came after it.
        this.size = sizeOf(plan) + (this.size - sizeAtCapture);
        await this.deps.journal.trim(this.doc, seq, this.recentCids());
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
