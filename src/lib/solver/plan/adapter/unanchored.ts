import type { FactoryStorage } from "../../../model/types";
import { compareIds } from "../ids";
import type { Id } from "../types";
import type { PlanModel } from "./model";

/**
 * Recipes AND drawers in a part of the plan that nothing sets (the mod's
 * `Unanchored.of`, spec-solver 3.10): the board's "(set count)" and
 * "Set rate". Union-find over machines and drawers joined by wires, drawer
 * links and shared-machine groups. A part is set when any of it has a pinned
 * count, a port rate, a pinned shared card, or a drawer asking for a number
 * (at least or exactly, with something linked). Hidden helpers are never named.
 */
export function findUnanchored(model: PlanModel, storages: readonly FactoryStorage[]): Id[] {
  const parent = new Map<Id, Id>();
  const find = (id: Id): Id => {
    let root = id;
    while (parent.get(root) !== root) {
      root = parent.get(root) ?? root;
    }
    parent.set(id, root);
    return root;
  };
  const add = (id: Id) => {
    if (!parent.has(id)) {
      parent.set(id, id);
    }
  };
  const union = (a: Id, b: Id) => {
    add(a);
    add(b);
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) {
      parent.set(ra, rb);
    }
  };

  const { input } = model;
  for (const machine of input.machines) {
    add(machine.id);
  }
  const drawerIds = storages
    .filter((storage) => {
      const role = model.roles.get(storage.id);
      return (
        !model.hidden.has(storage.id) &&
        (role === "source" || role === "product" || role === "byproduct" || role === "trash")
      );
    })
    .map((storage) => storage.id);
  for (const id of drawerIds) {
    add(id);
  }
  for (const edge of input.edges) {
    union(edge.source, edge.target);
  }
  for (const drawer of input.drawers) {
    for (const link of [...drawer.links, ...(drawer.takers ?? [])]) {
      union(drawer.id, link.node);
    }
  }
  for (const members of model.groups.values()) {
    for (let i = 1; i < members.length; i += 1) {
      union(members[0]!, members[i]!);
    }
  }

  const anchored = new Set<Id>();
  for (const machine of input.machines) {
    const rated =
      Object.values(machine.targetOutputRates).some((rate) => rate > 0) ||
      Object.values(machine.targetInputRates).some((rate) => rate > 0);
    if (machine.countFixed || rated) {
      anchored.add(find(machine.id));
    }
  }
  for (const pool of input.pools) {
    if (pool.exact && pool.capacity > 0 && pool.machines[0] !== undefined) {
      anchored.add(find(pool.machines[0]));
    }
  }
  for (const drawer of input.drawers) {
    if (
      (drawer.rule === "AT_LEAST" || drawer.rule === "EXACTLY") &&
      drawer.rate > 0 &&
      drawer.links.length > 0
    ) {
      anchored.add(find(drawer.id));
    }
  }

  const visible = (id: Id) => !model.hidden.has(id);
  return [...input.machines.map((m) => m.id), ...drawerIds]
    .filter((id) => visible(id) && !anchored.has(find(id)))
    .sort(compareIds);
}
