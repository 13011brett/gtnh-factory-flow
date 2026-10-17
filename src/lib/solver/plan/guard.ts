/**
 * The guard (docs/up-to.md, "The guard"): no forced flow makes up an Up to card's gap. An Up to machine slows down,
 * as in the game, instead of the plan bringing in or sending out what it cannot do. The guarded ports are every
 * connected port on a wire network an Up to machine is on, except the ports a drawer is linked to (the player's own
 * end: a byproduct drawer is permission to run, a source drawer is supply).
 *
 * Once per context, before the first pass, one LP (level -1) asks what the guarded ports must trade at the least: the
 * base model with pins and pools but without drawer rows (a drawer's rate never opens a forced flow on a guarded
 * network) and without the guard. Nothing, at rounding: every model the context builds closes them. Something (an
 * Exactly pin needs it): they are held together to that least. No answer at all: no guard (the pins conflict whatever
 * happens; the chain fails and diagnoses as before).
 */
import type { SolveContext } from "./context";
import { baseModel, runModel } from "./lp";
import { heldAt } from "./trade";
import { NUMERICS } from "./validate";

/** The connected ports on an Up to machine's wire networks that no drawer is linked to, ascending. */
export function guardedPorts(ctx: SolveContext): number[] {
  const model = ctx.model;
  const upTo = new Set<number>();
  for (const p of ctx.upToPools) for (const m of model.pools[p]!.machines) upTo.add(m);
  if (upTo.size === 0) return [];
  const networks = new Set<number>();
  model.connectedPorts.forEach((port, p) => {
    if (upTo.has(port.machine)) networks.add(model.portComponent[p]!);
  });
  const ports: number[] = [];
  for (let p = 0; p < model.connectedPorts.length; p++) {
    if (networks.has(model.portComponent[p]!) && !ctx.drawnPorts.has(p)) ports.push(p);
  }
  return ports;
}

/** Works the guard out once per context (a no-op after the first call, and without Up to pools). */
export function prepareGuard(ctx: SolveContext): void {
  if (ctx.guardReady) return;
  ctx.guardReady = true;
  const ports = guardedPorts(ctx);
  if (ports.length === 0) return;
  const lp = baseModel(ctx, { drawers: false, guard: false });
  for (const p of ports) lp.setExtCost(p, ctx.externalWeight(p));
  // The question commits nothing and must not leave its own rejection behind.
  const rejection = ctx.rejection;
  const least = runModel(ctx, lp, "guard");
  ctx.rejection = rejection;
  if (!least.ok) return;
  let reached = 0;
  for (const p of ports) reached += least.point.externals[p]! * ctx.externalWeight(p);
  const held = heldAt(reached, least.point.extents);
  ctx.guard = {
    ports,
    cap: held <= 0 ? 0 : held * (1 + NUMERICS.qtyEps) + NUMERICS.qtyEps * Math.max(1, held),
  };
}
