import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { LiveOp, LivePlan } from "@/lib/live/ops";
import type { ServerFrame } from "@/lib/live/protocol";
import { Journal } from "./journal";
import { Room, type RoomDeps, type RoomPeer } from "./room";
import type { PlanStore } from "./store";

/**
 * One room against a store it can hold still: the order its writes reach
 * the database in, whatever the timers do meanwhile.
 */

const OWNER = "11111111-1111-4111-8111-111111111111";
const DOC = `${OWNER}:design-room-1`;
const dirs: string[] = [];

interface Write {
  kind: "lease" | "renew" | "flush" | "release";
  until: string | null;
  done: () => void;
}

/** A store whose flushes wait until the test lets them through. */
class HeldStore implements PlanStore {
  readonly writes: Write[] = [];
  hold = false;
  plan: LivePlan = { name: "Plan", tasks: [{ id: "t1", title: "One", status: "todo", order: "a0" }] };

  private write(kind: Write["kind"], until: Date | null): Promise<void> {
    return new Promise((resolve) => {
      const entry: Write = { kind, until: until ? until.toISOString() : null, done: resolve };
      this.writes.push(entry);
      if (!this.hold) {
        resolve();
      }
    });
  }

  async account() {
    return undefined;
  }
  async role() {
    return "owner" as const;
  }
  async lease(_owner: string, _design: string, until: Date) {
    await this.write("lease", until);
    return { plan: this.plan, seq: 0 };
  }
  async renew(_owner: string, _design: string, until: Date) {
    await this.write("renew", until);
    return true;
  }
  async flush(_owner: string, _design: string, plan: LivePlan, _seq: number, until: Date | null) {
    await this.write("flush", until);
    this.plan = plan;
    return true;
  }
  async release() {
    await this.write("release", null);
  }
  async members() {
    return [];
  }
  async usernames() {
    return new Map([[OWNER, "ann"]]);
  }
}

const peer: RoomPeer = {
  connId: "c1",
  userId: OWNER,
  username: "ann",
  client: "web",
  send: (frame: ServerFrame) => void frame,
  sendText: (text: string) => void text,
  reload: () => undefined,
  forget: () => undefined,
};

/** A peer that keeps what it is sent. */
function listener(connId = "c2") {
  const frames: ServerFrame[] = [];
  let reloaded = 0;
  const listening: RoomPeer = {
    ...peer,
    connId,
    send: (frame) => frames.push(frame),
    sendText: (text) => frames.push(JSON.parse(text) as ServerFrame),
    reload: () => {
      reloaded += 1;
    },
  };
  return { peer: listening, frames, reloads: () => reloaded };
}

async function openRoom(
  store: PlanStore,
  timing: Partial<RoomDeps["timing"]> = {},
  extra: Partial<RoomDeps> = {},
) {
  const dir = mkdtempSync(path.join(tmpdir(), "gtnh-room-"));
  dirs.push(dir);
  const room = await Room.open(DOC, {
    store,
    journal: new Journal(dir),
    timing: { flushMs: 60_000, renewMs: 60_000, leaseMs: 5_000, ...timing },
    cids: new Map(),
    log: () => undefined,
    onClosed: () => undefined,
    ...extra,
  });
  if (!room) {
    throw new Error("the room did not open");
  }
  return room;
}

const rename = (title: string): LiveOp[] => [
  { o: "patch", c: "tasks", id: "t1", f: { title } },
];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("a room's writes", () => {
  it("never write the lease back after the last flush let it go", async () => {
    const store = new HeldStore();
    const room = await openRoom(store);
    await room.apply(peer, "c1", rename("Two"));
    store.hold = true;
    const closing = room.closeIfEmpty();
    await expect.poll(() => store.writes.filter((w) => w.kind === "flush").length).toBe(1);
    // A timed flush comes due while the last one is on its way.
    const timed = room.flush();
    store.writes.at(-1)!.done();
    await closing;
    expect(await timed).toBe(false);
    expect(room.closed).toBe(true);
    const flushes = store.writes.filter((w) => w.kind === "flush");
    expect(flushes.map((w) => w.until)).toEqual([null]);
  });
});

describe("the journal", () => {
  it("writes the lines a turn brings in one write and one sync, in order", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gtnh-journal-"));
    dirs.push(dir);
    const journal = new Journal(dir);
    const entry = (seq: number) => ({ seq, cid: `c${seq}`, by: OWNER, at: "now", ops: rename(`T${seq}`) });
    await Promise.all(Array.from({ length: 50 }, (_, at) => journal.append(DOC, entry(at + 1))));
    expect(journal.writes).toBe(1);
    await journal.append(DOC, entry(51));
    expect(journal.writes).toBe(2);
    expect((await journal.read(DOC)).map((line) => line.seq)).toEqual(
      Array.from({ length: 51 }, (_, at) => at + 1),
    );
    await journal.durable(DOC);
  });
});

describe("a room's batches", () => {
  it("go out only once their journal line is on disk", async () => {
    const room = await openRoom(new HeldStore());
    const other = listener();
    room.peers.add(other.peer);
    const result = room.apply(peer, "c1", rename("Two"));
    expect(result).toMatchObject({ kind: "applied", seq: 1 });
    expect(other.frames).toEqual([]);
    await room.whenDurable();
    expect(other.frames).toMatchObject([{ t: "ops", seq: 1, cid: "c1" }]);
  });

  it("are refused as rate while the journal holds too much the database has not taken", async () => {
    const store = new HeldStore();
    const room = await openRoom(store, {}, { maxJournalBytes: 600 });
    const results = Array.from({ length: 6 }, (_, at) =>
      room.apply(peer, `c${at}`, rename(`A title long enough to fill the journal ${at}`)),
    );
    expect(results.map((result) => result.kind)).toContain("refused");
    expect(results.at(-1)).toMatchObject({ kind: "refused", code: "rate" });
    // Stored: the journal's lines no longer count, and batches go through again.
    expect(await room.flush()).toBe(true);
    expect(room.apply(peer, "after", rename("Again"))).toMatchObject({ kind: "applied" });
  });

  it("fail the room when the journal cannot be written: everyone joins again", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "gtnh-room-"));
    dirs.push(dir);
    // A file where the journal's folder should be: nothing can be written.
    const blocked = path.join(dir, "blocked");
    writeFileSync(blocked, "not a folder");
    let closed = 0;
    const room = await openRoom(new HeldStore(), {}, {
      journal: new Journal(path.join(blocked, "journal")),
      onClosed: () => {
        closed += 1;
      },
    });
    const other = listener();
    room.peers.add(other.peer);
    expect(room.apply(peer, "c1", rename("Lost"))).toMatchObject({ kind: "applied" });
    await expect(room.whenDurable()).rejects.toThrow();
    await expect.poll(() => room.closed).toBe(true);
    expect(closed).toBe(1);
    expect(other.reloads()).toBe(1);
    // Nothing that was never on disk went out.
    expect(other.frames).toEqual([]);
    expect(readFileSync(blocked, "utf8")).toBe("not a folder");
  });
});
