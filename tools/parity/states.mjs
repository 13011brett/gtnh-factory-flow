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
  { id: "card-forced-in", ref: "card-forced-in-row-aniline-reactor", plan: forcedPlan, node: "an", anchor: { x: 4, y: 2 }, zoom: 0.42, setup: none },
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
  // ---- the special clean cards: a generator and the two holders ----
  { id: "power-card-lgt", ref: "power-card-large-gas-turbine", plan: EMPTY, target: lastNodeId, add: async (c) => { await c.page.evaluate(() => window.__ccStore.getState().addPowerSourceNode("large-gas-turbine")); await wait(c, 1200); }, setup: none },
  { id: "custom-rate", ref: "custom-rate-card-empty-holder", plan: EMPTY, target: lastNodeId, add: async (c) => { await c.page.evaluate(() => window.__ccStore.getState().addCustomRateNode()); await wait(c, 1200); }, setup: none },
  { id: "fluid-tank", ref: "fluid-tank-card-empty-holder", plan: EMPTY, target: lastNodeId, add: async (c) => { await c.page.evaluate(() => window.__ccStore.getState().addFluidTankNode()); await wait(c, 1200); }, setup: none },
  // ---- drawers (232 x 96 px at 2 px per GUI px in the mod; the website's footprint is 120 x 80 css) ----
  { id: "drawer-product-atleast", ref: "drawer-product-atleast-aniline", plan: drawerPlan, node: "aniline", anchor: { x: 34, y: 20 }, drawer: true, extendH: 40, setup: none },
  { id: "drawer-source-atmost", ref: "drawer-source-atmost-rule", plan: drawerPlan, node: "acid", anchor: { x: 34, y: 20 }, drawer: true, extendH: 40, setup: none },
  { id: "drawer-trash-voided", ref: "drawer-trash-voided-methane", plan: drawerPlan, node: "methane", anchor: { x: 34, y: 20 }, drawer: true, extendH: 40, setup: none },
  { id: "drawer-product-any-set", ref: "drawer-product-any-set-rate-pulsing", plan: anyDrawerPlan, node: "aniline", anchor: { x: 34, y: 20 }, drawer: true, extendH: 40, setup: none },
  // ---- QA2 additions: rule menus and the folded rail (full board states are in qa2/*.mjs) ----
  { id: "drawer-rule-menu", ref: "drawer-rule-menu-open", plan: drawerPlan, node: "aniline", anchor: { x: 34, y: 20 }, drawer: true, extendH: 40, setup: async (c) => { { const b = await c.page.locator(`${c.nodeSel} .cd-key`).boundingBox(); await c.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); } await wait(c, 700); } },
  { id: "drawer-source-rule-menu", ref: "drawer-source-rule-menu", plan: drawerPlan, node: "acid", anchor: { x: 34, y: 20 }, drawer: true, extendH: 40, setup: async (c) => { { const b = await c.page.locator(`${c.nodeSel} .cd-key`).boundingBox(); await c.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); } await wait(c, 700); } },
  // ---- overview rail ----
  { id: "overview-rail", ref: "overview-rail-full", plan: refChain, node: "nb", clip: "rail", setup: none },
  // ---- R2 gallery additions ----
  { id: "ebf-unset-b", ref: "card-ebf-unset-prompts-pulsing-b", plan: ebfOne, node: "ebf", setup: (c) => wait(c, 1500) },
  { id: "ebf-cupronickel", ref: "card-ebf-cupronickel-rutile-unset", plan: { nodes: [{ key: "e2", recipe: { query: "ilmenite", nameRe: "^Blast Furnace: Cast Iron", hasIn: ["Ilmenite", "Carbon"] }, x: 0, y: 0, tier: "HV" }], drawers: [], wires: [] }, node: "e2", setup: none },
  { id: "ebf-naquadah", ref: "t-u", plan: { nodes: [{ key: "nq", recipe: { query: "naquadah oxide", nameRe: "^Blast Furnace: Naquadah Nugget", hasIn: ["Naquadah Oxide", "Oganesson"] }, x: 0, y: 0, tier: "IV" }], drawers: [], wires: [] }, node: "nq", setup: none },
  { id: "ebf-naquadah-coil-menu", ref: "card-coil-menu-lists-only-coils-hot-enough", plan: { nodes: [{ key: "nq", recipe: { query: "naquadah oxide", nameRe: "^Blast Furnace: Naquadah Nugget", hasIn: ["Naquadah Oxide", "Oganesson"] }, x: 0, y: 0, tier: "IV" }], drawers: [], wires: [] }, node: "nq", setup: (c) => clickSel(c, ".cc-sc") },
  { id: "vcm-unset", ref: "card-unset-set-count-prompt-vcm", plan: { nodes: [{ key: "vcm", recipe: { res: ["fluid", "vinylchloride"], nameRe: "Large Chemical", hasIn: ["^Ethylene$", "^Chlorine$"] }, x: 0, y: 0, tier: "LV" }], drawers: [], wires: [] }, node: "vcm", setup: none },
  { id: "forced-two", ref: "card-forced-rows-two-reactors-zoom-0-8", plan: forcedPlan, node: "nb", anchor: { x: 33, y: 248 }, zoom: 0.8, setup: none },
  { id: "tip-forced-input", ref: "tip-forced-input-row", plan: forcedPlan, node: "an", anchor: { x: 8, y: 0 }, zoom: 0.5, setup: async (c) => { const b = await c.page.locator(c.nodeSel + " .cc-forced").first().boundingBox(); await c.page.mouse.move(b.x + b.width / 2, b.y + b.height * 0.8); await wait(c, 1400); } },
  { id: "two-selected", ref: "card-two-cards-selected-combine-button", plan: { nodes: [{ ...ebfOne.nodes[0] }, { key: "e2", recipe: { query: "ilmenite", nameRe: "^Blast Furnace: Cast Iron", hasIn: ["Ilmenite", "Carbon"] }, x: 400, y: 0, tier: "HV" }], drawers: [], wires: [] }, node: "ebf", anchor: { x: 78, y: 298 }, zoom: 0.44, setup: async (c) => { await c.page.keyboard.down("Shift"); for (const n of await c.page.locator(".react-flow__node").all()) { const b = await n.boundingBox(); await c.page.mouse.click(b.x + b.width * 0.6, b.y + b.height * 0.55); } await c.page.keyboard.up("Shift"); await c.page.mouse.move(1500, 960); await wait(c, 900); } },
  { id: "drawer-source-sulfuric", ref: "drawer-source-sulfuric-acid", plan: drawerPlan, node: "acid", anchor: { x: 34, y: 20 }, drawer: true, extendH: 40, setup: none },
  ...[["atleast", "at-least"], ["exactly", "exact"], ["atmost", "at-most"]].map(([n, mode]) => ({ id: "drawer-rule-" + n, ref: "drawer-product-" + n + "-rule", plan: { ...drawerPlan, drawers: drawerPlan.drawers.map((d) => (d.key === "aniline" ? { ...d, mode } : d)) }, node: "aniline", anchor: { x: 76, y: 40 }, drawer: true, extendH: 40, setup: none })),
  { id: "drawer-rule-any", ref: "drawer-product-any-rule-set-rate", plan: anyDrawerPlan, node: "aniline", anchor: { x: 76, y: 40 }, drawer: true, extendH: 40, setup: none },
  { id: "drawer-rule-trash", ref: "drawer-trash-void-rule", plan: drawerPlan, node: "methane", anchor: { x: 76, y: 40 }, drawer: true, extendH: 40, setup: none },
  { id: "drawer-key-tip", ref: "drawer-rule-chip-tooltip", plan: drawerPlan, node: "aniline", anchor: { x: 72, y: 38 }, drawer: true, setup: async (c) => { { const b = await c.page.locator(c.nodeSel + " .cd-key").boundingBox(); await c.page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); } await wait(c, 1400); } },
  { id: "drawer-bar-tip", ref: "drawer-hover-bar-tooltip", plan: drawerPlan, node: "aniline", anchor: { x: 72, y: 38 }, drawer: true, setup: async (c) => { await c.page.locator(c.nodeSel + " .cd-bar").hover(); await wait(c, 1400); } },
];
