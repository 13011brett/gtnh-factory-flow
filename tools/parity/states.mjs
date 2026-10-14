// One entry per mod reference image: how to put the website into the same state, which element is the anchor
// (the card or drawer whose top-left is aligned to the mod's in the reference), and how it is framed.
//   ref    file in docs/design/backport/ref (without .png)
//   plan   plan from lib/plans.mjs ({nodes:[],..} for states that add their cards in setup)
//   node   key of the plan's card or drawer that is the anchor (or `target(ctx)` returning a node id)
//   anchor {x,y} of the anchor's top-left inside the reference PNG (device px); default: found from the card's top edge
//   zoom   board zoom (default: from the reference card's width / 640, else 1)
//   clip   'target' (default: reference-sized window around the anchor) | 'rail' (the inspector panel)
//   setup  async (ctx) => void with ctx = { page, ids, id, nodeSel, centre, pick }
import { refChain, ebfOne, drawerPlan, anyDrawerPlan, forcedPlan } from "./lib/plans.mjs";

const wait = (ctx, ms = 900) => ctx.page.waitForTimeout(ms);
const hoverSel = async (ctx, sel, nth = 0) => {
  await ctx.page.locator(`${ctx.nodeSel} ${sel}`).nth(nth).hover();
  await wait(ctx, 1400);
};
const clickSel = async (ctx, sel, nth = 0, opts = {}) => {
  await ctx.page.locator(`${ctx.nodeSel} ${sel}`).nth(nth).click({ ...opts });
  await wait(ctx, 700);
};
const pin = (ctx, n) => ctx.page.evaluate(({ id, n }) => window.__ccStore.getState().updateNode(id, { solvePin: n }), { id: ctx.id, n });
const none = async () => {};
const MENU_ANCHOR = { x: 197, y: 201 };
const EMPTY = { nodes: [], drawers: [], wires: [] };

const lastNodeId = (ctx) => ctx.page.evaluate(() => { const n = window.__ccStore.getState().project.nodes; return n[n.length - 1].id; });

export const states = [
  // ---- the reference chain's nitrobenzene reactor (LCR, IV, 1A) ----
  { id: "card-default", ref: "card-clean-solved-default", plan: refChain, node: "nb", setup: none },
  { id: "card-hovered-body", ref: "card-hovered-body", plan: refChain, node: "nb", setup: async (c) => { await c.page.mouse.move(...(await c.centre(0.2, 0.62))); await wait(c); } },
  { id: "card-tier-chip-hover", ref: "card-tier-chip-hovered-tooltip", plan: refChain, node: "nb", setup: (c) => hoverSel(c, ".cc-chip", 1) },
  { id: "card-amps-chip-hover", ref: "card-amps-chip-hovered-tooltip", plan: refChain, node: "nb", setup: (c) => hoverSel(c, ".cc-chip", 0) },
  { id: "card-name-hover", ref: "card-machine-name-hovered", plan: refChain, node: "nb", setup: (c) => hoverSel(c, ".cc-name") },
  { id: "card-count-hover", ref: "card-machine-count-hovered", plan: refChain, node: "nb", setup: (c) => hoverSel(c, ".cc-count") },
  { id: "card-machine-picker", ref: "card-machine-picker-open", plan: refChain, node: "nb", anchor: MENU_ANCHOR, setup: (c) => clickSel(c, ".cc-name") },
  { id: "card-settings-sheet", ref: "card-settings-sheet-open", plan: refChain, node: "nb", anchor: MENU_ANCHOR, setup: (c) => clickSel(c, ".cc-key", 1) },
  { id: "card-actions-menu", ref: "card-actions-menu-open", plan: refChain, node: "nb", anchor: MENU_ANCHOR, setup: (c) => clickSel(c, ".cc-key", 0) },
  { id: "card-count-pinned", ref: "card-count-pinned", plan: refChain, node: "nb", setup: async (c) => { await pin(c, 3); await wait(c, 1200); } },
  { id: "card-count-pinned-hover", ref: "card-count-pinned-hover-tooltip", plan: refChain, node: "nb", setup: async (c) => { await pin(c, 3); await wait(c, 1200); await hoverSel(c, ".cc-count"); } },
  // ---- EBF cards (ref-states) ----
  { id: "ebf-unset", ref: "card-ebf-unset-prompts-pulsing-a", plan: ebfOne, node: "ebf", setup: none },
  { id: "ebf-pinned-2", ref: "card-ebf-count-pinned-2", plan: ebfOne, node: "ebf", setup: async (c) => { await pin(c, 2); await wait(c, 1200); } },
  { id: "ebf-tier-mv", ref: "card-ebf-tier-lowered-mv", plan: ebfOne, node: "ebf", setup: async (c) => { await pin(c, 2); await wait(c, 800); await clickSel(c, ".cc-chip", 1, { button: "right" }); } },
  { id: "ebf-tier-lv", ref: "card-ebf-tier-lowered-lv", plan: ebfOne, node: "ebf", setup: async (c) => { await pin(c, 2); await wait(c, 800); await clickSel(c, ".cc-chip", 1, { button: "right" }); await clickSel(c, ".cc-chip", 1, { button: "right" }); } },
  { id: "ebf-tier-lv-power-tip", ref: "tip-tier-too-low-power-row", plan: ebfOne, node: "ebf", setup: async (c) => { await pin(c, 2); await wait(c, 800); await clickSel(c, ".cc-chip", 1, { button: "right" }); await clickSel(c, ".cc-chip", 1, { button: "right" }); await c.page.mouse.move(1500, 900); await hoverSel(c, ".cc-rail .cc-row:last-child"); } },
  { id: "ebf-strip-chip-hover", ref: "card-settings-strip-coil-chip-hover", plan: ebfOne, node: "ebf", setup: async (c) => { await pin(c, 2); await wait(c, 1000); await hoverSel(c, ".cc-sc"); } },
  { id: "ebf-strip-coil-menu", ref: "card-settings-strip-coil-menu-open", plan: ebfOne, node: "ebf", setup: async (c) => { await pin(c, 2); await wait(c, 1000); await clickSel(c, ".cc-sc"); } },
  // ---- forced rows (zoom 0.5 in the reference) ----
  { id: "card-forced-in", ref: "card-forced-in-row-aniline-reactor", plan: forcedPlan, node: "an", webZoom: 1, setup: none },
  // ---- shared machine ----
  {
    id: "shared-machine",
    ref: "shared-machine-card-two-recipes",
    plan: refChain,
    node: "nb",
    setup: async (c) => {
      const other = await c.pick({ res: ["fluid", "aniline"], nameRe: "Large Chemical Reactor", hasIn: ["Palladium"] });
      const ok = await c.page.evaluate(({ id, other }) => window.__ccStore.getState().addRecipeToNode(id, other), { id: c.id, other });
      if (!ok) console.log("  (addRecipeToNode refused)");
      await wait(c, 1200);
    },
  },
  // ---- cards the clean look does not cover yet (classic fallback) ----
  { id: "power-card-lgt", ref: "power-card-large-gas-turbine", plan: EMPTY, target: lastNodeId, add: async (c) => { await c.page.evaluate(() => window.__ccStore.getState().addPowerSourceNode("large-gas-turbine")); await wait(c, 1200); }, setup: none },
  { id: "custom-rate", ref: "custom-rate-card-empty-holder", plan: EMPTY, target: lastNodeId, add: async (c) => { await c.page.evaluate(() => window.__ccStore.getState().addCustomRateNode()); await wait(c, 1200); }, setup: none },
  // ---- drawers (232 x 96 px at 2 px per GUI px in the mod; the website's footprint is 120 x 80 css) ----
  { id: "drawer-product-atleast", ref: "drawer-product-atleast-aniline", plan: drawerPlan, node: "aniline", anchor: { x: 34, y: 20 }, drawer: true, setup: none },
  { id: "drawer-source-atmost", ref: "drawer-source-atmost-rule", plan: drawerPlan, node: "acid", anchor: { x: 34, y: 20 }, drawer: true, setup: none },
  { id: "drawer-trash-voided", ref: "drawer-trash-voided-methane", plan: drawerPlan, node: "methane", anchor: { x: 34, y: 20 }, drawer: true, setup: none },
  { id: "drawer-product-any-set", ref: "drawer-product-any-set-rate-pulsing", plan: anyDrawerPlan, node: "aniline", anchor: { x: 34, y: 20 }, drawer: true, setup: none },
  // ---- overview rail ----
  { id: "overview-rail", ref: "overview-rail-full", plan: refChain, node: "nb", clip: "rail", setup: none },
];
