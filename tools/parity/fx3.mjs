// Card-state captures for the special clean cards (shared machine, generator, holders, crop, bee, EEC), no mod
// reference needed: node tools/parity/fx3.mjs <scenario|all>   -> tools/parity/out/fx3-<scenario>.png
// Server: PARITY_BASE=http://localhost:3133
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boot, loadPlan, panTo, rectOf, setZoom, pickRecipe } from "./lib/app.mjs";
import { refChain, ebfOne } from "./lib/plans.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out");
const want = process.argv[2] ?? "all";
const EMPTY = { nodes: [], drawers: [], wires: [] };
const wait = (page, ms = 900) => page.waitForTimeout(ms);
const lastNode = (page) =>
  page.evaluate(() => {
    const n = window.__ccStore.getState().project.nodes;
    return n[n.length - 1].id;
  });
const store = (page, fn, arg) => page.evaluate(fn, arg);

const scenarios = {
  async shared3(page) {
    const ids = await loadPlan(page, refChain);
    for (const spec of [
      { res: ["fluid", "aniline"], nameRe: "Large Chemical Reactor", hasIn: ["Palladium"] },
      { res: ["fluid", "vinylchloride"], nameRe: "Large Chemical Reactor" },
    ]) {
      try {
        const other = await pickRecipe(page, spec);
        await store(
          page,
          ({ id, other }) => window.__ccStore.getState().addRecipeToNode(id, other),
          { id: ids.nb, other },
        );
      } catch (e) {
        console.log("  (no recipe)", String(e).slice(0, 100));
      }
    }
    await wait(page, 1200);
    return ids.nb;
  },
  async "power-steam"(page) {
    await loadPlan(page, EMPTY);
    await store(page, () =>
      window.__ccStore.getState().addPowerSourceNode("large-steam-turbine", { tier: "EV" }),
    );
    await wait(page, 1200);
    return lastNode(page);
  },
  async "power-lgt"(page) {
    await loadPlan(page, EMPTY);
    await store(page, () => window.__ccStore.getState().addPowerSourceNode("large-gas-turbine"));
    await wait(page, 1200);
    return lastNode(page);
  },
  async "power-solar"(page) {
    await loadPlan(page, EMPTY);
    await store(page, () => window.__ccStore.getState().addPowerSourceNode("solar-tower"));
    await wait(page, 1200);
    return lastNode(page);
  },
  async "power-lv-gen"(page) {
    await loadPlan(page, EMPTY);
    await store(page, () => window.__ccStore.getState().addPowerSourceNode("steam-turbine-lv"));
    await wait(page, 1200);
    return lastNode(page);
  },
  async "custom-empty"(page) {
    await loadPlan(page, EMPTY);
    await store(page, () => window.__ccStore.getState().addCustomRateNode());
    await wait(page, 1000);
    return lastNode(page);
  },
  async "custom-filled"(page) {
    const ids = await loadPlan(page, refChain);
    await store(page, () => window.__ccStore.getState().addCustomRateNode());
    const cid = await lastNode(page);
    await store(
      page,
      ({ cid, nb }) => {
        const S = window.__ccStore.getState();
        S.connectCustomRate(
          cid,
          "output",
          { nodeId: nb, handleId: "input:fluid:sulfuricacid" },
          { kind: "fluid", id: "sulfuricacid", displayName: "Sulfuric Acid" },
        );
      },
      { cid, nb: ids.nb },
    );
    await wait(page, 1200);
    return cid;
  },
  async "tank-empty"(page) {
    await loadPlan(page, EMPTY);
    await store(page, () => window.__ccStore.getState().addFluidTankNode());
    await wait(page, 1000);
    return lastNode(page);
  },
  async "tank-held"(page) {
    const ids = await loadPlan(page, refChain);
    await store(page, () => window.__ccStore.getState().addFluidTankNode());
    const tid = await lastNode(page);
    await store(
      page,
      ({ tid, nb }) => {
        window.__ccStore
          .getState()
          .connectCustomRate(
            tid,
            "output",
            { nodeId: nb, handleId: "input:fluid:sulfuricacid" },
            { kind: "fluid", id: "sulfuricacid", displayName: "Sulfuric Acid" },
          );
      },
      { tid, nb: ids.nb },
    );
    await wait(page, 2500);
    return tid;
  },
  async eec(page) {
    await loadPlan(page, EMPTY);
    const recipe = await pickRecipe(page, {
      query: "Extreme Entity Crusher",
      mapRe: "Extreme Entity",
      nameRe: "Guardian",
    });
    await store(
      page,
      (recipe) => window.__ccStore.getState().addNodeForRecipeObject(recipe),
      recipe,
    );
    await wait(page, 1200);
    return lastNode(page);
  },
  async bee(page) {
    await loadPlan(page, EMPTY);
    const recipe = await pickRecipe(page, { query: "bee", recipeMap: "Bee Produce" });
    await store(
      page,
      (recipe) => window.__ccStore.getState().addNodeForRecipeObject(recipe),
      recipe,
    );
    await wait(page, 1200);
    return lastNode(page);
  },
  async cropfarm(page) {
    await loadPlan(page, EMPTY);
    await store(page, () => window.__ccStore.getState().addCropFarmNode());
    await wait(page, 1200);
    return lastNode(page);
  },
  async crop(page) {
    await loadPlan(page, EMPTY);
    const recipe = await pickRecipe(page, { query: "crop", recipeMap: "Crop Farm" });
    await store(
      page,
      (recipe) => window.__ccStore.getState().addNodeForRecipeObject(recipe),
      recipe,
    );
    await wait(page, 1200);
    return lastNode(page);
  },
  async ebf(page) {
    const ids = await loadPlan(page, ebfOne);
    return ids.ebf;
  },
};

const { browser, page } = await boot();
for (const [name, make] of Object.entries(scenarios)) {
  if (want !== "all" && !new RegExp(want).test(name)) continue;
  try {
    const id = await make(page);
    const sel = `.react-flow__node[data-id="${id}"]`;
    await setZoom(page, id, 1);
    await panTo(page, id, 420, 160);
    await page.mouse.move(1500, 960);
    await wait(page, 500);
    const r = await rectOf(page, sel);
    const file = path.join(OUT, `fx3-${name}.png`);
    await page.screenshot({
      path: file,
      clip: { x: r.x - 12, y: r.y - 12, width: r.w + 24, height: r.h + 24 },
    });
    console.log(
      "ok",
      name,
      JSON.stringify({ w: Math.round(r.w), h: Math.round(r.h) }),
      "dom",
      await page.evaluate((s) => document.querySelector(s)?.querySelectorAll("*").length, sel),
    );
  } catch (e) {
    console.log("FAIL", name, String(e).slice(0, 300));
  }
}
await browser.close();
