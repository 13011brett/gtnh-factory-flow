import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { WebSocket } from "ws";
import { LiveClientState } from "@/lib/live/client-state";
import type { LiveOp, LivePlan } from "@/lib/live/ops";
import { plansEqual } from "@/lib/live/ops";
import { docKey, type ServerFrame } from "@/lib/live/protocol";
import { PROJECT_SCHEMA_VERSION } from "@/lib/model/types";
import { useInProcessLocalDb } from "@/lib/server/local-db/client";
import { openLocalDatabase, type LocalDatabase } from "@/lib/server/local-db/database";
import { getCommunityDb, makeSessionToken } from "@/lib/server/community";
import * as designRoute from "@/app/api/library/designs/[designId]/route";
import * as memberRoute from "@/app/api/library/designs/[designId]/members/[userId]/route";
import { Journal } from "./journal";
import { LiveService, type LiveServiceOptions } from "./service";
import { supabasePlanStore } from "./store";

/**
 * The live service in this process on a random port, against the local
 * database, driven by real WebSocket clients: editing together, reconnects,
 * the journal after a crash, who may join, sharing changes, limits, the lease
 * against REST saves, and the origin check.
 */

const ORIGIN = "http://localhost:3000";
const INTERNAL_TOKEN = "live-test-internal";

let local: LocalDatabase;
const users: Record<string, { id: string; cookie: string }> = {};
const journalDirs: string[] = [];
const services: LiveService[] = [];
const clients: TestClient[] = [];

class TestClient {
  readonly frames: ServerFrame[] = [];
  private waiters: Array<{
    test: (frame: ServerFrame) => boolean;
    resolve: (frame: ServerFrame) => void;
  }> = [];
  closed = false;
  closeCode?: number;

  private constructor(readonly ws: WebSocket) {
    ws.on("message", (data) => {
      const frame = JSON.parse(data.toString()) as ServerFrame;
      this.frames.push(frame);
      this.waiters = this.waiters.filter((waiter) => {
        if (waiter.test(frame)) {
          waiter.resolve(frame);
          return false;
        }
        return true;
      });
    });
    ws.on("close", (code) => {
      this.closed = true;
      this.closeCode = code;
    });
  }

  static open(
    port: number,
    options: { who?: string; origin?: string | null } = {},
  ): Promise<TestClient> {
    const headers: Record<string, string> = {};
    if (options.who) {
      headers.cookie = users[options.who]!.cookie;
    }
    if (options.origin !== null) {
      headers.origin = options.origin ?? ORIGIN;
    }
    const ws = new WebSocket(`ws://127.0.0.1:${port}/live`, { headers });
    const client = new TestClient(ws);
    clients.push(client);
    return new Promise((resolve, reject) => {
      ws.once("open", () => resolve(client));
      ws.once("error", reject);
      ws.once("unexpected-response", (_req, res) => reject(new Error(`HTTP ${res.statusCode}`)));
    });
  }

  send(frame: unknown): void {
    this.ws.send(JSON.stringify(frame));
  }

  /** The first frame (already here or still to come) passing `test`. */
  next<T extends ServerFrame["t"]>(
    t: T,
    test: (frame: Extract<ServerFrame, { t: T }>) => boolean = () => true,
    timeoutMs = 10_000,
  ): Promise<Extract<ServerFrame, { t: T }>> {
    const match = (frame: ServerFrame) =>
      frame.t === t && test(frame as Extract<ServerFrame, { t: T }>);
    const found = this.frames.find(match);
    if (found) {
      this.frames.splice(this.frames.indexOf(found), 1);
      return Promise.resolve(found as Extract<ServerFrame, { t: T }>);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`no ${t} frame within ${timeoutMs} ms`)),
        timeoutMs,
      );
      this.waiters.push({
        test: match,
        resolve: (frame) => {
          clearTimeout(timer);
          this.frames.splice(this.frames.indexOf(frame), 1);
          resolve(frame as Extract<ServerFrame, { t: T }>);
        },
      });
    });
  }

  async hello(client: "web" | "game" = "web", game?: { server: string }): Promise<void> {
    this.send({ t: "hello", v: 1, client, clientVersion: "test", ...(game ? { game } : {}) });
    await this.next("welcome");
  }

  async join(doc: string) {
    this.send({ t: "join", doc });
    return this.next("snapshot", (frame) => frame.doc === doc);
  }

  close(): Promise<void> {
    if (this.closed) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.ws.once("close", () => resolve());
      this.ws.close();
    });
  }
}

async function startService(
  options: Partial<LiveServiceOptions> = {},
): Promise<{ service: LiveService; port: number; journalDir: string }> {
  const journalDir = options.journalDir ?? mkdtempSync(path.join(tmpdir(), "gtnh-live-"));
  journalDirs.push(journalDir);
  const service = new LiveService({
    store: supabasePlanStore(),
    journalDir,
    allowedOrigins: [ORIGIN],
    internalToken: INTERNAL_TOKEN,
    timing: { flushMs: 100, renewMs: 1000, leaseMs: 5000 },
    log: () => undefined,
    ...options,
  });
  services.push(service);
  const port = await service.start(0);
  return { service, port, journalDir };
}

async function makeUser(username: string) {
  const { data } = await getCommunityDb()
    .from("community_users")
    .insert({ username, password_hash: "x:y" })
    .select("id")
    .single();
  const id = (data as { id: string }).id;
  users[username] = { id, cookie: `gtnh_session=${makeSessionToken(id)}` };
}

let designCount = 0;

/** A fresh design owned by ann, shared with bob. */
async function makeDesign(): Promise<{ designId: string; doc: string; plan: LivePlan }> {
  designCount += 1;
  const designId = `design-live-${designCount}`;
  const plan: LivePlan = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: `plan-${designCount}`,
    name: "Live test",
    recipes: [],
    nodes: [],
    storages: [],
    edges: [],
    fuelProfiles: [],
    tasks: [{ id: "t1", title: "First", status: "todo", order: "a0" }],
  };
  const db = getCommunityDb();
  const { error } = await db.from("library_designs").insert({
    user_id: users.ann!.id,
    id: designId,
    name: "Live test",
    plan,
  });
  expect(error).toBeNull();
  await db
    .from("library_design_members")
    .insert({ owner_id: users.ann!.id, design_id: designId, member_id: users.bob!.id });
  return { designId, doc: docKey(users.ann!.id, designId), plan };
}

async function storedRow(designId: string) {
  const { data } = await getCommunityDb()
    .from("library_designs")
    .select("plan,seq,live_lease_until,deleted_at")
    .eq("user_id", users.ann!.id)
    .eq("id", designId)
    .single();
  return data as {
    plan: LivePlan;
    seq: number;
    live_lease_until: string | null;
    deleted_at: string | null;
  };
}

async function until(check: () => Promise<boolean> | boolean, timeoutMs = 10_000): Promise<void> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("condition not met in time");
}

const taskPatch = (id: string, f: Record<string, unknown>): LiveOp => ({
  o: "patch",
  c: "tasks",
  id,
  f,
});

beforeAll(async () => {
  vi.stubEnv("LOCAL_DB", "1");
  vi.stubEnv("COMMUNITY_HASH_SALT", "live-service-test-salt");
  local = await openLocalDatabase();
  useInProcessLocalDb(local.handle);
  for (const name of ["ann", "bob", "carol"]) {
    await makeUser(name);
  }
}, 60_000);

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
  await Promise.all(services.splice(0).map((service) => service.stop()));
});

afterAll(async () => {
  useInProcessLocalDb(undefined);
  await local?.close();
  for (const dir of journalDirs) {
    rmSync(dir, { recursive: true, force: true });
  }
  vi.unstubAllEnvs();
});

describe("the live service", { timeout: 30_000 }, () => {
  it("lets two people edit one plan: concurrent batches converge and each sender's echo acks it", async () => {
    const { port } = await startService();
    const { designId, doc } = await makeDesign();
    const ann = await TestClient.open(port, { who: "ann" });
    const bob = await TestClient.open(port, { who: "bob", origin: null });
    await ann.hello();
    await bob.hello("game", { server: "server-hash" });
    const annSnap = await ann.join(doc);
    expect(annSnap).toMatchObject({
      seq: 0,
      role: "owner",
      members: [{ id: users.bob!.id, username: "bob" }],
    });
    expect(annSnap.owner).toEqual({ id: users.ann!.id, username: "ann" });
    const bobSnap = await bob.join(doc);
    expect(bobSnap.role).toBe("editor");
    expect(bobSnap.present.map((person) => person.username).sort()).toEqual(["ann", "bob"]);
    await ann.next("present", (frame) => frame.present.length === 2);

    const annState = new LiveClientState(annSnap);
    const bobState = new LiveClientState(bobSnap);
    // Both edit at once: different fields, then the same field.
    const a1 = annState.localOps([taskPatch("t1", { title: "Ann's title" })])!;
    const b1 = bobState.localOps([taskPatch("t1", { status: "doing" })])!;
    const a2 = annState.localOps([taskPatch("t1", { text: "from ann" })])!;
    const b2 = bobState.localOps([taskPatch("t1", { text: "from bob" })])!;
    ann.send(annState.frame(doc, a1));
    bob.send(bobState.frame(doc, b1));
    ann.send(annState.frame(doc, a2));
    bob.send(bobState.frame(doc, b2));

    for (const [client, state] of [
      [ann, annState],
      [bob, bobState],
    ] as const) {
      for (let i = 0; i < 4; i += 1) {
        const frame = await client.next("ops");
        state.receive(frame);
      }
      expect(state.pending).toEqual([]);
      expect(state.seq).toBe(4);
    }
    expect(plansEqual(annState.view, bobState.view)).toBe(true);
    const task = (annState.view.tasks as Array<Record<string, unknown>>)[0]!;
    expect(task).toMatchObject({ title: "Ann's title", status: "doing" });
    // The same field: whichever batch the server took last wins, everywhere.
    expect(["from ann", "from bob"]).toContain(task.text);

    await ann.close();
    await bob.close();
    // The last one out stores the plan and lets the lease go.
    await until(async () => (await storedRow(designId)).live_lease_until === null);
    const row = await storedRow(designId);
    expect(Number(row.seq)).toBe(4);
    expect(plansEqual(row.plan, annState.view)).toBe(true);
  });

  it("flushes while people are in it, at most every flush period", async () => {
    const { port } = await startService({ timing: { flushMs: 300, renewMs: 1000, leaseMs: 5000 } });
    const { designId, doc } = await makeDesign();
    const ann = await TestClient.open(port, { who: "ann" });
    await ann.hello();
    await ann.join(doc);
    ann.send({ t: "ops", doc, base: 0, cid: "f1", ops: [taskPatch("t1", { title: "Flushed" })] });
    await ann.next("ops");
    expect(Number((await storedRow(designId)).seq)).toBe(0);
    await until(async () => Number((await storedRow(designId)).seq) === 1, 3000);
    const row = await storedRow(designId);
    expect((row.plan.tasks as Array<{ title: string }>)[0]!.title).toBe("Flushed");
    expect(row.live_lease_until).not.toBeNull();
  });

  it("takes pending batches again after a reconnect, applying a resent one only once", async () => {
    const { port } = await startService();
    const { doc } = await makeDesign();
    let ann = await TestClient.open(port, { who: "ann" });
    await ann.hello();
    const state = new LiveClientState(await ann.join(doc));
    const sent = state.localOps([taskPatch("t1", { title: "Sent once" })])!;
    ann.send(state.frame(doc, sent));
    // The echo is lost: the connection drops before the client reads it.
    await until(() => ann.frames.some((frame) => frame.t === "ops"));
    await ann.close();
    const offline = state.localOps([taskPatch("t1", { status: "blocked" })])!;
    expect(state.pending.map((batch) => batch.cid)).toEqual([sent.cid, offline.cid]);

    ann = await TestClient.open(port, { who: "ann" });
    await ann.hello();
    const again = state.resync(await ann.join(doc));
    expect(state.seq).toBe(1);
    for (const batch of again) {
      ann.send(state.frame(doc, batch));
    }
    const ackOld = await ann.next("ops", (frame) => frame.cid === sent.cid);
    expect(ackOld).toMatchObject({ seq: 1, ops: [] });
    state.receive(ackOld);
    state.receive(await ann.next("ops", (frame) => frame.cid === offline.cid));
    expect(state.pending).toEqual([]);
    expect(state.seq).toBe(2);
    expect((state.view.tasks as Array<Record<string, unknown>>)[0]).toMatchObject({
      title: "Sent once",
      status: "blocked",
    });
  });

  it("replays its journal after a crash, so nothing accepted is lost", async () => {
    const first = await startService({
      timing: { flushMs: 60_000, renewMs: 60_000, leaseMs: 90_000 },
    });
    const { designId, doc } = await makeDesign();
    const ann = await TestClient.open(first.port, { who: "ann" });
    await ann.hello();
    await ann.join(doc);
    for (let i = 1; i <= 3; i += 1) {
      ann.send({
        t: "ops",
        doc,
        base: i - 1,
        cid: `crash-${i}`,
        ops: [taskPatch("t1", { title: `Edit ${i}` })],
      });
      await ann.next("ops", (frame) => frame.cid === `crash-${i}`);
    }
    await first.service.crash();
    services.splice(services.indexOf(first.service), 1);
    expect(Number((await storedRow(designId)).seq)).toBe(0);

    const second = await startService({ journalDir: first.journalDir });
    // Stored and let go: a timed flush may store it first with the lease still held.
    await until(async () => {
      const stored = await storedRow(designId);
      return Number(stored.seq) === 3 && stored.live_lease_until === null;
    });
    const row = await storedRow(designId);
    expect((row.plan.tasks as Array<{ title: string }>)[0]!.title).toBe("Edit 3");
    expect(row.live_lease_until).toBeNull();
    // The replayed batches' ids are remembered: a resend is acknowledged, not applied.
    const again = await TestClient.open(second.port, { who: "ann" });
    await again.hello();
    await again.join(doc);
    again.send({
      t: "ops",
      doc,
      base: 0,
      cid: "crash-2",
      ops: [taskPatch("t1", { title: "Edit 2" })],
    });
    expect(await again.next("ops")).toMatchObject({ cid: "crash-2", seq: 2, ops: [] });
  });

  it("knows a batch resent after a restart whose journal was already flushed, and applies it once", async () => {
    const first = await startService();
    const { designId, doc } = await makeDesign();
    const ann = await TestClient.open(first.port, { who: "ann" });
    await ann.hello();
    await ann.join(doc);
    const bob = await TestClient.open(first.port, { who: "bob" });
    await bob.hello();
    await bob.join(doc);
    ann.send({ t: "ops", doc, base: 0, cid: "late-1", ops: [taskPatch("t1", { title: "Ann" })] });
    await ann.next("ops", (frame) => frame.cid === "late-1");
    bob.send({ t: "ops", doc, base: 1, cid: "late-2", ops: [taskPatch("t1", { title: "Bob" })] });
    await bob.next("ops", (frame) => frame.cid === "late-2");
    // Flushed: the journal is trimmed to nothing, the batch ids stay beside it.
    await until(async () => Number((await storedRow(designId)).seq) === 2, 3000);
    const journal = new Journal(first.journalDir);
    await until(async () => (await journal.read(doc)).length === 0);
    expect((await journal.readCids(doc)).map(([cid]) => cid)).toEqual(["late-1", "late-2"]);
    await ann.close();
    await bob.close();
    await first.service.stop();
    services.splice(services.indexOf(first.service), 1);

    // Ann never heard her echo and sends the batch again to the restarted service.
    const second = await startService({ journalDir: first.journalDir });
    const again = await TestClient.open(second.port, { who: "ann" });
    await again.hello();
    expect((await again.join(doc)).seq).toBe(2);
    again.send({ t: "ops", doc, base: 0, cid: "late-1", ops: [taskPatch("t1", { title: "Ann" })] });
    expect(await again.next("ops", (frame) => frame.cid === "late-1")).toMatchObject({
      seq: 1,
      ops: [],
    });
    const fresh = await TestClient.open(second.port, { who: "bob" });
    await fresh.hello();
    const snapshot = await fresh.join(doc);
    expect(snapshot.seq).toBe(2);
    expect((snapshot.plan.tasks as Array<{ title: string }>)[0]!.title).toBe("Bob");
  });

  it("applies a batch journalled twice only once when it replays", async () => {
    const { designId, doc } = await makeDesign();
    const journalDir = mkdtempSync(path.join(tmpdir(), "gtnh-live-"));
    const journal = new Journal(journalDir);
    const entry = (seq: number, cid: string, title: string) => ({
      seq,
      cid,
      by: users.ann!.id,
      at: new Date().toISOString(),
      ops: [taskPatch("t1", { title })],
    });
    await journal.append(doc, entry(1, "twice-1", "One"));
    await journal.append(doc, entry(2, "twice-2", "Two"));
    await journal.append(doc, entry(3, "twice-1", "One"));
    await startService({ journalDir });
    await until(async () => Number((await storedRow(designId)).seq) === 3);
    const row = await storedRow(designId);
    expect((row.plan.tasks as Array<{ title: string }>)[0]!.title).toBe("Two");
  });

  it("refuses anyone the plan is not shared with, and anyone not signed in", async () => {
    const { port } = await startService();
    const { doc } = await makeDesign();
    const carol = await TestClient.open(port, { who: "carol" });
    await carol.hello();
    carol.send({ t: "join", doc });
    expect(await carol.next("error")).toMatchObject({ doc, code: "forbidden" });
    carol.send({ t: "ops", doc, base: 0, cid: "c1", ops: [taskPatch("t1", { title: "x" })] });
    expect(await carol.next("error")).toMatchObject({ code: "forbidden", cid: "c1" });

    const nobody = await TestClient.open(port);
    expect(await nobody.next("error")).toMatchObject({ code: "auth" });
    await until(() => nobody.closed);

    const old = await TestClient.open(port, { who: "ann" });
    old.send({ t: "hello", v: 2, client: "web" });
    expect(await old.next("error")).toMatchObject({ code: "version" });
  });

  it("drops a member the owner unshares, and everyone when the plan is deleted", async () => {
    const { port } = await startService();
    vi.stubEnv("LIVE_INTERNAL_URL", `http://127.0.0.1:${port}`);
    vi.stubEnv("LIVE_INTERNAL_TOKEN", INTERNAL_TOKEN);
    const { designId, doc } = await makeDesign();
    const ann = await TestClient.open(port, { who: "ann" });
    const bob = await TestClient.open(port, { who: "bob" });
    await ann.hello();
    await bob.hello();
    await ann.join(doc);
    await bob.join(doc);

    const unshare = await memberRoute.DELETE(
      new Request(`http://localhost/api/library/designs/${designId}/members/${users.bob!.id}`, {
        method: "DELETE",
        headers: { cookie: users.ann!.cookie },
      }),
      { params: Promise.resolve({ designId, userId: users.bob!.id }) },
    );
    expect(unshare.status).toBe(200);
    expect(await bob.next("kicked")).toEqual({ t: "kicked", doc, reason: "unshared" });
    expect(await ann.next("members")).toEqual({ t: "members", doc, members: [] });
    await ann.next("present", (frame) => frame.present.length === 1);
    bob.send({ t: "ops", doc, base: 0, cid: "late", ops: [taskPatch("t1", { title: "x" })] });
    expect(await bob.next("error")).toMatchObject({ code: "forbidden", cid: "late" });

    ann.send({
      t: "ops",
      doc,
      base: 0,
      cid: "before-delete",
      ops: [taskPatch("t1", { title: "Gone" })],
    });
    await ann.next("ops");
    const deleted = await designRoute.DELETE(
      new Request(`http://localhost/api/library/designs/${designId}`, {
        method: "DELETE",
        headers: { cookie: users.ann!.cookie },
      }),
      { params: Promise.resolve({ designId }) },
    );
    expect(deleted.status).toBe(200);
    expect(await ann.next("kicked")).toEqual({ t: "kicked", doc, reason: "deleted" });
    // Nothing is written back over the tombstone.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const row = await storedRow(designId);
    expect(row.deleted_at).not.toBeNull();
    expect(row.plan).toEqual({});
    vi.stubEnv("LIVE_INTERNAL_URL", "");
  });

  it("holds connections to their limits: batch rate, batch size, plan size, schemas", async () => {
    const { port } = await startService({ maxPlanChars: 40_000 });
    const { doc } = await makeDesign();
    const ann = await TestClient.open(port, { who: "ann" });
    await ann.hello();
    await ann.join(doc);

    for (let i = 0; i < 40; i += 1) {
      ann.send({
        t: "ops",
        doc,
        base: 0,
        cid: `r${i}`,
        ops: [taskPatch("t1", { order: `a${i}` })],
      });
    }
    const limited = await ann.next("error", (frame) => frame.code === "rate");
    expect(limited.cid).toMatch(/^r\d+$/);

    const huge = "x".repeat(300 * 1024);
    ann.send({ t: "ops", doc, base: 0, cid: "huge", ops: [{ o: "meta", f: { notes: huge } }] });
    expect(await ann.next("error", (frame) => frame.cid === "huge")).toMatchObject({
      code: "too_big",
    });

    await new Promise((resolve) => setTimeout(resolve, 1100));
    const tasks: LiveOp[] = Array.from({ length: 12 }, (_, i) => ({
      o: "put",
      c: "tasks",
      id: `big-${i}`,
      v: { id: `big-${i}`, title: "Big", status: "todo", order: `b${i}`, text: "y".repeat(4000) },
    }));
    ann.send({ t: "ops", doc, base: 0, cid: "too-much", ops: tasks });
    expect(await ann.next("error", (frame) => frame.cid === "too-much")).toMatchObject({
      code: "too_big",
    });

    ann.send({
      t: "ops",
      doc,
      base: 0,
      cid: "bad-status",
      ops: [
        {
          o: "put",
          c: "tasks",
          id: "t9",
          v: { id: "t9", title: "T", status: "later", order: "c" },
        },
      ],
    });
    expect(await ann.next("error", (frame) => frame.cid === "bad-status")).toMatchObject({
      code: "bad_op",
    });
    ann.send({ t: "ops", doc, base: 0, cid: "no-name", ops: [{ o: "meta", f: {}, d: ["name"] }] });
    expect(await ann.next("error", (frame) => frame.cid === "no-name")).toMatchObject({
      code: "bad_op",
    });
    ann.send({ t: "ops", doc, base: 0, cid: "unknown", ops: [{ o: "meta", f: { bogus: 1 } }] });
    expect(await ann.next("error", (frame) => frame.cid === "unknown")).toMatchObject({
      code: "bad_op",
    });
  });

  it("stamps comments with their author and the server's time", async () => {
    const { port } = await startService();
    const { doc } = await makeDesign();
    const bob = await TestClient.open(port, { who: "bob" });
    await bob.hello();
    await bob.join(doc);
    bob.send({
      t: "ops",
      doc,
      base: 0,
      cid: "comment",
      ops: [
        {
          o: "put",
          c: "taskComments",
          id: "c1",
          v: {
            id: "c1",
            taskId: "t1",
            by: users.ann!.id,
            byName: "ann",
            at: "2000-01-01T00:00:00Z",
            text: "Hi",
          },
        },
      ],
    });
    const echo = await bob.next("ops");
    const comment = (echo.ops[0] as { v: Record<string, unknown> }).v;
    expect(comment).toMatchObject({ by: users.bob!.id, byName: "bob", text: "Hi" });
    expect(Date.parse(comment.at as string)).toBeGreaterThan(Date.now() - 60_000);

    const ann = await TestClient.open(port, { who: "ann" });
    await ann.hello();
    await ann.join(doc);
    ann.send({
      t: "ops",
      doc,
      base: 1,
      cid: "steal",
      ops: [{ o: "patch", c: "taskComments", id: "c1", f: { text: "Mine" } }],
    });
    expect(await ann.next("error", (frame) => frame.cid === "steal")).toMatchObject({
      code: "bad_op",
    });
  });

  it("relays presence to the others, at most 20 a second, the latest always landing", async () => {
    const { port } = await startService();
    const { doc } = await makeDesign();
    const ann = await TestClient.open(port, { who: "ann" });
    const bob = await TestClient.open(port, { who: "bob" });
    await ann.hello();
    await bob.hello();
    await ann.join(doc);
    await bob.join(doc);
    const started = Date.now();
    for (let i = 0; i < 50; i += 1) {
      ann.send({
        t: "presence",
        doc,
        cursor: { x: i, y: 1 },
        sel: ["t1"],
        view: { x: 0, y: 0, zoom: 1 },
      });
    }
    const last = await bob.next("presence", (frame) => frame.cursor?.x === 49, 5000);
    const elapsed = Date.now() - started;
    expect(last).toMatchObject({ who: users.ann!.id, sel: ["t1"], view: { x: 0, y: 0, zoom: 1 } });
    const relayed = bob.frames.filter((frame) => frame.t === "presence").length + 1;
    expect(relayed).toBeLessThanOrEqual(Math.ceil((elapsed / 1000) * 20) + 2);
    expect(relayed).toBeLessThan(50);
    expect(ann.frames.some((frame) => frame.t === "presence")).toBe(false);
  });

  it("refuses a REST plan save while the plan is open live, and takes it once everyone left", async () => {
    const { port } = await startService();
    const { designId, doc, plan } = await makeDesign();
    const ann = await TestClient.open(port, { who: "ann" });
    await ann.hello();
    await ann.join(doc);
    const save = () =>
      designRoute.PUT(
        new Request(`http://localhost/api/library/designs/${designId}`, {
          method: "PUT",
          headers: { cookie: users.ann!.cookie },
          body: JSON.stringify({
            name: "Live test",
            icon: null,
            folderId: null,
            closed: false,
            favorite: false,
            order: null,
            communityPlanId: null,
            createdAt: "2026-10-14T10:00:00.000Z",
            updatedAt: new Date(Date.now() + 60_000).toISOString(),
            planUpdatedAt: new Date(Date.now() + 60_000).toISOString(),
            plan: { ...plan, name: "From REST" },
          }),
        }),
        { params: Promise.resolve({ designId }) },
      );
    const refused = await save();
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ live: true });
    await ann.close();
    await until(async () => (await storedRow(designId)).live_lease_until === null);
    expect((await save()).status).toBe(200);
  });

  it("lets in browsers from its own origins and the game, which sends none", async () => {
    const { port } = await startService();
    await expect(
      TestClient.open(port, { who: "ann", origin: "https://evil.example" }),
    ).rejects.toThrow("HTTP 403");
    const browser = await TestClient.open(port, { who: "ann", origin: ORIGIN });
    await browser.hello();
    const game = await TestClient.open(port, { who: "ann", origin: null });
    await game.hello("game");
  });

  it("names signed-in players on the same game server, and answers pings", async () => {
    const { port } = await startService();
    const ann = await TestClient.open(port, { who: "ann", origin: null });
    const bob = await TestClient.open(port, { who: "bob", origin: null });
    const carol = await TestClient.open(port, { who: "carol", origin: null });
    await ann.hello("game", { server: "same-world" });
    await bob.hello("game", { server: "same-world" });
    await carol.hello("game", { server: "other-world" });
    const response = await fetch(`http://127.0.0.1:${port}/live/nearby`, {
      headers: { cookie: users.ann!.cookie },
    });
    expect(await response.json()).toEqual({ accounts: [{ id: users.bob!.id, username: "bob" }] });
    expect((await fetch(`http://127.0.0.1:${port}/live/nearby`)).status).toBe(401);
    ann.send({ t: "ping" });
    expect(await ann.next("pong")).toEqual({ t: "pong" });
    const internal = await fetch(`http://127.0.0.1:${port}/internal/deleted`, {
      method: "POST",
      headers: { authorization: "Bearer wrong" },
      body: "{}",
    });
    expect(internal.status).toBe(401);
  });

  it("stores only what the plan schema keeps, and refuses names that reach a prototype", async () => {
    const { port } = await startService();
    const { designId, doc } = await makeDesign();
    const ann = await TestClient.open(port, { who: "ann" });
    await ann.hello();
    const state = new LiveClientState(await ann.join(doc));
    // Through JSON.parse, `__proto__` is an own key: once it set the stored
    // thing's prototype, so deleting a required field passed the schema.
    ann.ws.send(
      `{"t":"ops","doc":"${doc}","base":0,"cid":"proto","ops":[{"o":"patch","c":"tasks","id":"t1","f":{"__proto__":{"title":"x"}},"d":["title"]}]}`,
    );
    expect(await ann.next("error", (frame) => frame.cid === "proto")).toMatchObject({
      code: "bad_op",
    });
    const junk = state.localOps([
      {
        o: "put",
        c: "tasks",
        id: "t2",
        v: { id: "t2", title: "Two", status: "todo", order: "a1", junk: { deep: true } },
      },
      { o: "patch", c: "tasks", id: "t1", f: { stray: 1, title: "One" } },
    ])!;
    ann.send(state.frame(doc, junk));
    state.receive(await ann.next("ops", (frame) => frame.cid === junk.cid));
    const tasks = state.view.tasks as Array<Record<string, unknown>>;
    expect(tasks).toEqual([
      { id: "t1", title: "One", status: "todo", order: "a0" },
      { id: "t2", title: "Two", status: "todo", order: "a1" },
    ]);
    await ann.close();
    await until(async () => (await storedRow(designId)).live_lease_until === null);
    expect(plansEqual((await storedRow(designId)).plan, state.view)).toBe(true);
  });

  it("holds an account to its batches' working time and a batch to its op count", async () => {
    const { port } = await startService({ limits: { editMsPerSecond: 0.001, editMsBurst: 0.001 } });
    const { doc } = await makeDesign();
    const ann = await TestClient.open(port, { who: "ann" });
    await ann.hello();
    await ann.join(doc);
    ann.send({ t: "ops", doc, base: 0, cid: "w1", ops: [taskPatch("t1", { title: "One" })] });
    await ann.next("ops", (frame) => frame.cid === "w1");
    ann.send({ t: "ops", doc, base: 1, cid: "w2", ops: [taskPatch("t1", { title: "Two" })] });
    expect(await ann.next("error", (frame) => frame.cid === "w2")).toMatchObject({ code: "rate" });

    const roomy = await startService();
    const other = await makeDesign();
    const bob = await TestClient.open(roomy.port, { who: "bob" });
    await bob.hello();
    await bob.join(other.doc);
    const many = Array.from({ length: 1001 }, (_, at) => taskPatch(`gone-${at}`, { title: "x" }));
    bob.send({ t: "ops", doc: other.doc, base: 0, cid: "many", ops: many });
    expect(await bob.next("error", (frame) => frame.cid === "many")).toMatchObject({
      code: "too_big",
    });
  });
});
