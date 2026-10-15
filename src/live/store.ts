import type { LivePlan } from "@/lib/live/ops";
import type { LiveMember } from "@/lib/live/protocol";
import { designRole, listMembers, usernamesFor, type DesignRole } from "@/lib/server/cloud-plans";
import { getCommunityDb, loadSessionUser } from "@/lib/server/community";

/**
 * The live service's reads and writes, all through the server's Supabase
 * client (fetchWithDbTimeout, or the local database with LOCAL_DB=1). Never a
 * write per edit: a room writes when it opens (the lease), every 30 s (the
 * lease again), and when it flushes (at most every 8 s while edited).
 */
export interface PlanStore {
  /** The account behind a verified session, or undefined when it is gone. */
  account(userId: string): Promise<{ id: string; username: string } | undefined>;
  /** What the account may do with the design: "owner", "editor" or null. */
  role(userId: string, ownerId: string, designId: string): Promise<DesignRole | null>;
  /** Takes (or extends) the lease and reads the plan. Undefined when the design is missing or deleted. */
  lease(
    ownerId: string,
    designId: string,
    until: Date,
  ): Promise<{ plan: LivePlan; seq: number } | undefined>;
  /** Extends the lease. False when the design is gone. */
  renew(ownerId: string, designId: string, until: Date): Promise<boolean>;
  /** Writes the plan and its seq, extending the lease (or ending it: `until` null). False when the design is gone. */
  flush(
    ownerId: string,
    designId: string,
    plan: LivePlan,
    seq: number,
    until: Date | null,
  ): Promise<boolean>;
  /** Ends the lease without writing the plan. */
  release(ownerId: string, designId: string): Promise<void>;
  members(ownerId: string, designId: string): Promise<LiveMember[]>;
  usernames(ids: string[]): Promise<Map<string, string>>;
}

function fail(what: string, error: { message?: string } | null): never {
  throw new Error(`${what}: ${error?.message ?? "no answer"}`);
}

export function supabasePlanStore(): PlanStore {
  const db = () => getCommunityDb();
  const design = (ownerId: string, designId: string) => ({ user_id: ownerId, id: designId });
  return {
    async account(userId) {
      const user = await loadSessionUser(userId);
      return user ? { id: user.id, username: user.username } : undefined;
    },
    role: (userId, ownerId, designId) => designRole(db(), userId, ownerId, designId),
    async lease(ownerId, designId, until) {
      const key = design(ownerId, designId);
      const { data, error } = await db()
        .from("library_designs")
        .update({ live_lease_until: until.toISOString() })
        .eq("user_id", key.user_id)
        .eq("id", key.id)
        .is("deleted_at", null)
        .select("plan,seq")
        .maybeSingle();
      if (error) {
        fail("Taking the lease failed", error);
      }
      if (!data) {
        return undefined;
      }
      const row = data as { plan: LivePlan; seq: number | string | null };
      return { plan: row.plan ?? {}, seq: Number(row.seq ?? 0) };
    },
    async renew(ownerId, designId, until) {
      const { data, error } = await db()
        .from("library_designs")
        .update({ live_lease_until: until.toISOString() })
        .eq("user_id", ownerId)
        .eq("id", designId)
        .is("deleted_at", null)
        .select("id")
        .maybeSingle();
      if (error) {
        fail("Renewing the lease failed", error);
      }
      return Boolean(data);
    },
    async flush(ownerId, designId, plan, seq, until) {
      const now = new Date().toISOString();
      const { data, error } = await db()
        .from("library_designs")
        .update({
          plan,
          seq,
          plan_updated_at: now,
          updated_at: now,
          live_lease_until: until ? until.toISOString() : null,
        })
        .eq("user_id", ownerId)
        .eq("id", designId)
        .is("deleted_at", null)
        .select("id")
        .maybeSingle();
      if (error) {
        fail("Saving the plan failed", error);
      }
      return Boolean(data);
    },
    async release(ownerId, designId) {
      const { error } = await db()
        .from("library_designs")
        .update({ live_lease_until: null })
        .eq("user_id", ownerId)
        .eq("id", designId);
      if (error) {
        fail("Releasing the lease failed", error);
      }
    },
    members: (ownerId, designId) => listMembers(db(), ownerId, designId),
    usernames: (ids) => usernamesFor(db(), ids),
  };
}
