import { mkdtempSync, rmSync } from "node:fs";
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
  forget: () => undefined,
};

async function openRoom(store: PlanStore, timing: Partial<RoomDeps["timing"]> = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), "gtnh-room-"));
  dirs.push(dir);
  const room = await Room.open(DOC, {
    store,
    journal: new Journal(dir),
    timing: { flushMs: 60_000, renewMs: 60_000, leaseMs: 5_000, ...timing },
    cids: new Map(),
    log: () => undefined,
    onClosed: () => undefined,
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
