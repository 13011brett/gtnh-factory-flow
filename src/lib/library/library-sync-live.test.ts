import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignRecord, DesignSummary } from "@/lib/designs/design-library";

/**
 * The account sync beside live plans: a plan open live is the live service's
 * to write, so its body never goes in a push; the account's 409 `{ live: true }`
 * (open live elsewhere) sends the push again without it, quietly; copies of
 * plans shared with us are never pushed as ours, and go once unshared.
 */

const storage = vi.hoisted(() => ({ records: new Map<string, DesignRecord>() }));
vi.mock("@/lib/designs/design-storage", () => ({
  listDesignSummaries: vi.fn(async () =>
    [...storage.records.values()].map((record) => {
      const summary: Partial<DesignRecord> = { ...record };
      delete summary.project;
      return summary as DesignSummary;
    }),
  ),
  listDesignFolders: vi.fn(async () => []),
  readDesign: vi.fn(async (id: string) => storage.records.get(id)),
  readDesignSummary: vi.fn(async (id: string) => storage.records.get(id)),
  writeDesign: vi.fn(async (record: DesignRecord) => {
    storage.records.set(record.id, record);
  }),
  writeDesignIfUnchanged: vi.fn(async () => "written"),
  writeDesignSummary: vi.fn(async (summary: DesignSummary) => {
    const record = storage.records.get(summary.id);
    if (record) {
      storage.records.set(summary.id, { ...summary, project: record.project });
    }
  }),
  writeDesignFolder: vi.fn(async () => undefined),
  deleteDesign: vi.fn(async (id: string) => {
    storage.records.delete(id);
  }),
  deleteDesignFolder: vi.fn(async () => undefined),
  readActiveDesignId: vi.fn(() => undefined),
  writeActiveDesignId: vi.fn(),
}));
vi.mock("@/lib/designs/design-camera", () => ({
  keepDesignCameras: vi.fn(),
  forgetDesignCameras: vi.fn(),
  rememberDesignCamera: vi.fn(),
  readDesignCamera: vi.fn(),
  beginDesignCameraHandover: vi.fn(),
}));

const remote = vi.hoisted(() => ({
  library: { designs: [], folders: [], shared: [] } as {
    designs: unknown[];
    folders: unknown[];
    shared: unknown[];
  },
  pushes: [] as Array<{ id: string; body: Record<string, unknown> }>,
  liveIds: new Set<string>(),
}));
vi.mock("./client", () => ({
  fetchRemoteLibrary: vi.fn(async () => remote.library),
  fetchRemoteDesignPlan: vi.fn(async () => {
    throw new Error("no plan pulls in these tests");
  }),
  pushRemoteDesign: vi.fn(async (id: string, body: Record<string, unknown>) => {
    remote.pushes.push({ id, body });
    if (body.plan !== undefined && remote.liveIds.has(id)) {
      throw Object.assign(new Error("This plan is open live."), { live: true });
    }
    return { design: { id, updatedAt: body.updatedAt }, behind: false };
  }),
  deleteRemoteDesign: vi.fn(async () => undefined),
  pushRemoteFolder: vi.fn(async () => ({ folder: {}, behind: false })),
  deleteRemoteFolder: vi.fn(async () => undefined),
}));

import { createEmptyProject } from "@/examples";
import { useCommunityAuthStore } from "@/store/community-auth-store";
import { useDesignStore } from "@/store/design-store";
import { setLiveDesignId } from "@/store/live-edit-gate";
import { useCloudLibraryStore } from "./cloud-library";
import { syncLibraryNow, useLibrarySyncStore } from "./library-sync";

const OWNER = "33333333-3333-4333-8333-333333333333";

function record(id: string, extra: Partial<DesignRecord> = {}): DesignRecord {
  return {
    id,
    name: `Design ${id}`,
    createdAt: "2026-10-01T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
    project: createEmptyProject(),
    ...extra,
  };
}

beforeEach(() => {
  storage.records.clear();
  remote.pushes = [];
  remote.liveIds.clear();
  remote.library = { designs: [], folders: [], shared: [] };
  setLiveDesignId(undefined);
  useDesignStore.setState({ designs: [], activeDesignId: undefined });
  useCommunityAuthStore.setState({ user: { username: "ann" }, hasHydrated: true });
});

describe("the account sync beside live plans", () => {
  it("never sends the body of a plan open live in this tab", async () => {
    storage.records.set("design-open-1", record("design-open-1"));
    setLiveDesignId("design-open-1");

    await syncLibraryNow();

    expect(remote.pushes).toHaveLength(1);
    expect(remote.pushes[0]!.body.plan).toBeUndefined();
    expect(useLibrarySyncStore.getState().state).toBe("idle");
  });

  it("sends a plan open live elsewhere again without its body, not as an error", async () => {
    storage.records.set("design-else-1", record("design-else-1"));
    remote.liveIds.add("design-else-1");

    await syncLibraryNow();

    expect(remote.pushes.map((push) => push.body.plan === undefined)).toEqual([false, true]);
    expect(useLibrarySyncStore.getState()).toMatchObject({ state: "idle" });
    expect(storage.records.get("design-else-1")!.remoteUpdatedAt).toBe("2026-10-02T00:00:00.000Z");
    // No conflict copy: still the one design.
    expect([...storage.records.keys()]).toEqual(["design-else-1"]);
  });

  it("never pushes a shared plan's copy as ours, and drops it once it is no longer shared", async () => {
    const ref = { ownerId: OWNER, ownerName: "carol", designId: "design-shared-1" };
    storage.records.set("shared-copy", record("shared-copy", { cloud: ref }));
    remote.library = {
      designs: [],
      folders: [],
      shared: [
        {
          ownerId: OWNER,
          ownerName: "carol",
          id: "design-shared-1",
          name: "Carol's plan",
          icon: null,
          updatedAt: "2026-10-02T00:00:00.000Z",
          planUpdatedAt: "2026-10-02T00:00:00.000Z",
          members: [],
        },
      ],
    };

    await syncLibraryNow();
    expect(remote.pushes).toEqual([]);
    expect(storage.records.has("shared-copy")).toBe(true);
    expect(useCloudLibraryStore.getState().shared?.map((plan) => plan.name)).toEqual([
      "Carol's plan",
    ]);

    remote.library = { designs: [], folders: [], shared: [] };
    await syncLibraryNow();
    expect(remote.pushes).toEqual([]);
    expect(storage.records.has("shared-copy")).toBe(false);
  });
});
