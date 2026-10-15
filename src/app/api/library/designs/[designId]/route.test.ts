import { describe, expect, it, vi } from "vitest";
import { planWithAdditions } from "@/lib/model/__fixtures__/plan-additions";
import type { FactoryProject } from "@/lib/model/types";

/**
 * The library PUT keeps a plan's cloud and live additions: what the game wrote
 * on each thing, the view it opens on and its task board reach the database
 * as sent. The database is a stand-in that records the row it was given.
 */

const written: Array<Record<string, unknown>> = [];

function fakeQuery(result: () => { data: unknown; error: null; count?: number }) {
  const query: Record<string, unknown> = {};
  const chain = () => query;
  for (const name of ["select", "eq", "is", "order", "limit"]) {
    query[name] = chain;
  }
  query.maybeSingle = async () => result();
  query.single = async () => result();
  query.then = (resolve: (value: unknown) => unknown) => resolve(result());
  return query;
}

vi.mock("@/lib/server/community", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/community")>();
  return {
    ...actual,
    isCommunityConfigured: () => true,
    getSessionUser: async () => ({ id: "11111111-1111-4111-8111-111111111111", username: "ann", is_admin: false }),
    checkRateLimit: async () => true,
    getCommunityDb: () => ({
      from: () => ({
        select: () => fakeQuery(() => ({ data: null, error: null, count: 0 })),
        insert: (row: Record<string, unknown>) => {
          written.push(row);
          return fakeQuery(() => ({
            data: { ...row, sort_order: null, deleted_at: null },
            error: null,
          }));
        },
      }),
    }),
  };
});

import { PUT } from "./route";

describe("the library design PUT", () => {
  it("stores the plan's game data, view and tasks as sent", async () => {
    const plan = planWithAdditions();
    const stamp = "2026-10-14T12:00:00.000Z";
    const response = await PUT(
      new Request("http://localhost/api/library/designs/design-additions", {
        method: "PUT",
        body: JSON.stringify({
          name: "Biodiesel",
          icon: null,
          folderId: null,
          closed: false,
          favorite: false,
          order: null,
          communityPlanId: null,
          createdAt: stamp,
          updatedAt: stamp,
          planUpdatedAt: stamp,
          plan,
        }),
      }),
      { params: Promise.resolve({ designId: "design-additions" }) },
    );
    expect(response.status).toBe(200);
    const stored = written.at(-1)?.plan as FactoryProject;
    expect(stored.gtnhplanner).toEqual(plan.gtnhplanner);
    expect(stored.primaryView).toBe("tasks");
    expect(stored.nodes[0]!.gtnhplanner).toEqual(plan.nodes[0]!.gtnhplanner);
    expect(stored.storages?.[0]?.gtnhplanner).toEqual(plan.storages?.[0]?.gtnhplanner);
    expect(stored.edges[0]!.gtnhplanner).toEqual(plan.edges[0]!.gtnhplanner);
    expect(stored.annotations?.[0]?.gtnhplanner).toEqual(plan.annotations?.[0]?.gtnhplanner);
    expect(stored.tasks).toEqual(plan.tasks);
    expect(stored.taskItems).toEqual(plan.taskItems);
    expect(stored.taskComments).toEqual(plan.taskComments);
  });
});
