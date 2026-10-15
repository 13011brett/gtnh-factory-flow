import type { PlanTask, PlanTaskItem, PlanTaskLink, PlanTaskStatus } from "@/lib/model/types";
import { docKey, parseDocKey } from "@/lib/live/protocol";

/**
 * Task links: a task, or one of its checklist lines, points at cards of
 * plans. A link names a plan by its id as the library knows it: the doc key
 * (`<ownerId>:<designId>`) for a plan in the account, the local design id for
 * a plan on this device only. A plan may be spelled either way (it went to the
 * account after the link was written), so lookups try every spelling.
 */

/** How much a status asks for attention: blocked most, done least. */
export const TASK_URGENCY: Record<PlanTaskStatus, number> = {
  blocked: 3,
  doing: 2,
  todo: 1,
  done: 0,
};

/** The more pressing of two statuses. */
export function morePressing(a: PlanTaskStatus, b: PlanTaskStatus): PlanTaskStatus {
  return TASK_URGENCY[a] >= TASK_URGENCY[b] ? a : b;
}

/** Colours of the dot a card wears for its most pressing task: grey to do, blue doing, red blocked, green done. */
export const TASK_STATUS_COLOR: Record<PlanTaskStatus, string> = {
  todo: "#a1a4ad",
  doing: "#60a5fa",
  blocked: "#e5484d",
  done: "#4ade80",
};

/** The cards a task is about: its links, then the older same-plan `nodeIds` (read as links to `ownPlan`). */
export function taskLinks(task: PlanTask, ownPlan: string): PlanTaskLink[] {
  const out: PlanTaskLink[] = [];
  const seen = new Set<string>();
  const add = (plan: string, node: string) => {
    const link = { plan: plan || ownPlan, node };
    const key = linkKey(link);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(link);
    }
  };
  for (const link of task.links ?? []) {
    add(link.plan, link.node);
  }
  for (const node of task.nodeIds ?? []) {
    add("", node);
  }
  return out;
}

/** The card a checklist line is about, in either spelling. */
export function itemLink(item: PlanTaskItem, ownPlan: string): PlanTaskLink | undefined {
  if (item.link) {
    return { plan: item.link.plan || ownPlan, node: item.link.node };
  }
  return item.nodeId ? { plan: ownPlan, node: item.nodeId } : undefined;
}

export function linkKey(link: PlanTaskLink): string {
  return `${link.plan}\u0000${link.node}`;
}

/**
 * The id a plan goes by in links: its doc key when it is in the account
 * (`ownerId` is the plan's owner: the account itself for its own plans), else
 * its local design id.
 */
export function planLinkId(design: {
  id: string;
  remoteUpdatedAt?: string;
  cloud?: { ownerId: string; designId: string };
}, myAccountId: string | undefined): string {
  if (design.cloud) {
    return docKey(design.cloud.ownerId, design.cloud.designId);
  }
  return myAccountId && design.remoteUpdatedAt ? docKey(myAccountId, design.id) : design.id;
}

/** Every spelling a link may have for a plan, newest first. */
export function planLinkIds(design: {
  id: string;
  remoteUpdatedAt?: string;
  cloud?: { ownerId: string; designId: string };
}, myAccountId: string | undefined): string[] {
  const primary = planLinkId(design, myAccountId);
  const ids = [primary];
  if (!design.cloud && myAccountId) {
    ids.push(docKey(myAccountId, design.id));
  }
  if (!design.cloud) {
    ids.push(design.id);
  }
  return [...new Set(ids)];
}

/** The design a link's plan names among `designs`, if this device has it. */
export function designForPlan<
  T extends { id: string; remoteUpdatedAt?: string; cloud?: { ownerId: string; designId: string } },
>(designs: readonly T[], plan: string, myAccountId: string | undefined): T | undefined {
  const key = parseDocKey(plan);
  for (const design of designs) {
    if (planLinkIds(design, myAccountId).includes(plan)) {
      return design;
    }
    if (key && design.cloud && design.cloud.ownerId === key.ownerId && design.cloud.designId === key.designId) {
      return design;
    }
  }
  return undefined;
}
