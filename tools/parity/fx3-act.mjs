// Behaviour checks for the special clean cards, in the real app: node tools/parity/fx3-act.mjs [filter]
// Server: PARITY_BASE=http://localhost:3133. Exits 1 when a check fails.
import { boot, loadPlan, pickRecipe, panTo, setZoom, rectOf } from "./lib/app.mjs";
import { refChain } from "./lib/plans.mjs";

const EMPTY = { nodes: [], drawers: [], wires: [] };
const filter = process.argv[2];
const wait = (page, ms = 700) => page.waitForTimeout(ms);
let failed = 0;
const check = (name, ok, extra = "") => {
  if (!ok) failed++;
  console.log(ok ? "  ok  " : "  FAIL", name, extra);
};
const st = (page, fn, arg) => page.evaluate(fn, arg);
const lastNode = (page) =>
  st(page, () => {
    const n = window.__ccStore.getState().project.nodes;
    return n[n.length - 1].id;
  });
const frame = async (page, id) => {
  await setZoom(page, id, 1);
  await panTo(page, id, 420, 160);
  await page.mouse.move(1500, 960);
  await wait(page, 400);
};
const node = (id) => `.react-flow__node[data-id="${id}"]`;
const proj = (page) =>
  st(page, () => {
    const p = window.__ccStore.getState().project;
    return JSON.parse(
      JSON.stringify({
        nodes: p.nodes,
        edges: p.edges,
        recipes: p.recipes.map((r) => ({
          id: r.id,
          name: r.name,
          machineType: r.machineType,
          inputs: r.inputs.map((i) => i.id),
          outputs: r.outputs.map((i) => i.id),
        })),
      }),
    );
  });

const tests = {
  async shared(page) {
    const ids = await loadPlan(page, refChain);
    for (const spec of [
      { res: ["fluid", "aniline"], nameRe: "Large Chemical Reactor", hasIn: ["Palladium"] },
    ]) {
      const other = await pickRecipe(page, spec);
      await st(page, ({ id, other }) => window.__ccStore.getState().addRecipeToNode(id, other), {
        id: ids.nb,
        other,
      });
    }
    await wait(page, 1000);
    await frame(page, ids.nb);
    const sel = node(ids.nb);
    check("two rules", (await page.locator(`${sel} .sp-rule`).count()) === 2);
    check(
      "section 1 ports wear the r1: prefix",
      (
        await page
          .locator(`${sel} .cc-rail[data-section="1"] .cc-row[data-port]`)
          .first()
          .getAttribute("data-resource-handle-id")
      )?.startsWith("r1:"),
    );
    // move section 1 up
    const before = (await proj(page)).nodes.find((n) => n.id === ids.nb).extraRecipes[0].recipeId;
    await page.locator(`${sel} .sp-rule`).nth(1).locator(".sp-rk[data-kind=up]").click();
    await wait(page, 900);
    const after = await proj(page);
    const n = after.nodes.find((x) => x.id === ids.nb);
    check(
      "up key swaps the recipes",
      n.recipeId === before,
      `${n.recipeId?.slice(-12)} vs ${before.slice(-12)}`,
    );
    check(
      "first rule has no active up key",
      (await page
        .locator(`${sel} .sp-rule`)
        .first()
        .locator(".sp-rk[data-kind=up]")
        .getAttribute("data-disabled")) !== null,
    );
    // pin the count and read the power row
    await st(page, (id) => window.__ccStore.getState().updateNode(id, { solvePin: 3 }), ids.nb);
    await wait(page, 1200);
    const count = await page.locator(`${sel} .cc-count`).innerText();
    check("pinned count shows", /3/.test(count), JSON.stringify(count));
    const power = await page
      .locator(`${sel} .cc-row[data-power] .cc-num`)
      .innerText()
      .catch(() => "");
    console.log("   power row:", JSON.stringify(power));
    // remove section 1
    await page.locator(`${sel} .sp-rule`).nth(1).locator(".sp-rk[data-kind=off]").click();
    await wait(page, 900);
    const gone = (await proj(page)).nodes.find((x) => x.id === ids.nb);
    check("off key takes the recipe off", !gone.extraRecipes || gone.extraRecipes.length === 0);
    check("one rule left? (a plain card)", (await page.locator(`${sel} .sp-rule`).count()) === 0);
  },

  async power(page) {
    await loadPlan(page, EMPTY);
    await st(page, () => window.__ccStore.getState().addPowerSourceNode("large-steam-turbine"));
    await wait(page, 900);
    const id = await lastNode(page);
    await frame(page, id);
    const sel = node(id);
    check(
      "amber name",
      (await page.locator(`${sel} .cc-name`).getAttribute("data-tone")) === "power",
    );
    const tier = page.locator(`${sel} .cc-chip`);
    console.log("   tier chips:", await tier.count());
    check(
      "EU row with bolt",
      (await page.locator(`${sel} .cc-row[data-side=output] .cc-bolt`).count()) === 1,
    );
    check(
      "EU row has no rate controls",
      (await page
        .locator(`${sel} .cc-row[data-side=output]`)
        .first()
        .locator(".cc-prk")
        .count()) === 0,
    );
    // open the gear and list settings
    await page.locator(`${sel} .cc-key[data-glyph=gear]`).click();
    await wait(page, 500);
    const rows = await page.locator(".cs-row").allInnerTexts();
    console.log("   gear rows:", JSON.stringify(rows.slice(0, 6)));
    check("gear lists settings", rows.length > 0);
    // pin the first non-tier setting: a chip appears
    await page.locator(".cs-pin").first().click();
    await wait(page, 700);
    check("a pinned setting shows as a strip chip", (await page.locator(sel + " .cc-sc").count()) === 1);
    await page.keyboard.press("Escape");
  },

  async holder(page) {
    const ids = await loadPlan(page, refChain);
    await st(page, () => window.__ccStore.getState().addCustomRateNode());
    const cid = await lastNode(page);
    // beside the reactor, so both are on screen
    await st(
      page,
      ({ cid, nb }) => {
        const S = window.__ccStore;
        const p = structuredClone(S.getState().project);
        const at = p.nodes.find((n) => n.id === nb).position;
        p.nodes.find((n) => n.id === cid).position = { x: at.x + 900, y: at.y };
        S.getState().setProject(p);
      },
      { cid, nb: ids.nb },
    );
    await wait(page, 500);
    await frame(page, ids.nb);
    const sel = node(cid);
    check("two sockets", (await page.locator(`${sel} .sp-socket`).count()) === 2);
    // wire: drag the nitrobenzene reactor's sulfuric acid input row onto the supply socket (it feeds an input)
    await page.mouse.move(1500, 960);
    const supply = page.locator(`${sel} .sp-socket[data-side=output]`);
    const sb = await supply.boundingBox();
    // bring the reactor into view next to it
    const nbSel = node(ids.nb);
    const row = page
      .locator(`${nbSel} .cc-row[data-resource-handle-id="input:fluid:sulfuricacid"]`)
      .first();
    const vis = await row.boundingBox().catch(() => null);
    console.log("   socket", sb && Math.round(sb.x), sb && Math.round(sb.y), "row visible:", !!vis);
    if (vis && sb) {
      await page.mouse.move(vis.x + vis.width / 2, vis.y + vis.height / 2);
      await page.mouse.down();
      await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2, { steps: 12 });
      await page.mouse.up();
      await wait(page, 1000);
      const p = await proj(page);
      const r = p.recipes.find((x) => x.id === p.nodes.find((n) => n.id === cid).recipeId);
      check(
        "socket adopts the port's resource",
        r.outputs.includes("sulfuricacid"),
        JSON.stringify(r),
      );
      check(
        "a wire exists",
        p.edges.some((e) => e.source === cid),
      );
    }
    await frame(page, cid);
    // rate chip: edit
    await page
      .locator(`${sel} .cc-sc[data-label^="Rate"]`)
      .click()
      .catch(() => {});
    await wait(page, 300);
    const input = page.locator(`${sel} .cc-sc input`);
    if (await input.count()) {
      await input.fill("5");
      await page.keyboard.press("Enter");
      await wait(page, 700);
      const dial = await st(
        page,
        () => window.__ccStore.getState().project.nodes.at(-1).customRate,
      );
      check("rate chip edits the dial", dial?.perSecond === 5, JSON.stringify(dial));
    } else check("rate chip opens an input", false);
    await page
      .locator(`${sel} .cc-sc[data-label="Mode"]`)
      .click()
      .catch(() => {});
    await wait(page, 800);
    check(
      "mode chip flips it",
      (await st(page, () => window.__ccStore.getState().project.nodes.at(-1).customRate?.mode)) ===
        "request",
    );
  },
};

tests.tank = async (page) => {
  const ids = await loadPlan(page, refChain);
  await st(page, () => window.__ccStore.getState().addFluidTankNode());
  const tid = await lastNode(page);
  await st(
    page,
    ({ tid, nb }) => {
      const S = window.__ccStore;
      const p = structuredClone(S.getState().project);
      const at = p.nodes.find((n) => n.id === nb).position;
      p.nodes.find((n) => n.id === tid).position = { x: at.x + 900, y: at.y };
      S.getState().setProject(p);
    },
    { tid, nb: ids.nb },
  );
  await wait(page, 500);
  await frame(page, ids.nb);
  const sel = node(tid);
  check(
    "tank has two sockets and no count",
    (await page.locator(sel + " .sp-socket").count()) === 2 &&
      (await page.locator(sel + " .cc-count").count()) === 0,
  );
  const give = await page.locator(sel + " .sp-socket[data-side=output]").boundingBox();
  const row = await page
    .locator(node(ids.nb) + ` .cc-row[data-resource-handle-id="input:fluid:sulfuricacid"]`)
    .first()
    .boundingBox();
  await page.mouse.move(row.x + row.width / 2, row.y + row.height / 2);
  await page.mouse.down();
  await page.mouse.move(give.x + give.width / 2, give.y + give.height / 2, { steps: 12 });
  await page.mouse.up();
  await wait(page, 2500);
  let p = await proj(page);
  const held = p.recipes.find((x) => x.id === p.nodes.find((n) => n.id === tid).recipeId);
  check(
    "tank takes a Tank recipe from the dataset",
    /Tank/.test(held.machineType) && held.outputs.includes("sulfuricacid"),
    JSON.stringify(held).slice(0, 200),
  );
  check(
    "the wire exists",
    p.edges.some((e) => e.source === tid),
  );
  await st(
    page,
    (tid) => {
      const S = window.__ccStore.getState();
      for (const e of S.project.edges.filter((e) => e.source === tid || e.target === tid))
        S.deleteEdge(e.id);
    },
    tid,
  );
  await wait(page, 900);
  p = await proj(page);
  const released = p.recipes.find((x) => x.id === p.nodes.find((n) => n.id === tid).recipeId);
  check(
    "tank lets go when unwired",
    released.inputs.length === 0 && released.outputs.length === 0,
    JSON.stringify(released).slice(0, 160),
  );
  check("sockets are back", (await page.locator(sel + " .sp-socket").count()) === 2);
};

tests.eec = async (page) => {
  await loadPlan(page, EMPTY);
  const recipe = await pickRecipe(page, {
    query: "Extreme Entity Crusher",
    mapRe: "Extreme Entity",
    nameRe: "Guardian",
  });
  await st(page, (recipe) => window.__ccStore.getState().addNodeForRecipeObject(recipe), recipe);
  await wait(page, 900);
  const id = await lastNode(page);
  await frame(page, id);
  const row = page.locator(node(id) + " .cc-row[data-controller]");
  check("controller slot row", (await row.count()) === 1);
  await row.click();
  await wait(page, 700);
  check("mob picker opens", (await row.getAttribute("aria-expanded")) === "true");
  await page.keyboard.press("Escape");
};

tests.crop = async (page) => {
  await loadPlan(page, EMPTY);
  await st(page, () => window.__ccStore.getState().addCropFarmNode());
  await wait(page, 900);
  const id = await lastNode(page);
  await frame(page, id);
  const sel = node(id);
  check("farm shows the pick key", (await page.locator(sel + " .sp-pick").count()) === 1);
  await page
    .locator(sel + " .sp-pick")
    .click({ timeout: 4000 })
    .catch((e) =>
      console.log(String(e).split(String.fromCharCode(10)).slice(0, 14).join(" | ").slice(-900)),
    );
  await wait(page, 900);
  const picker = await page.locator("input[placeholder*=earch], [role=dialog]").count();
  check("crop picker opens", picker > 0, "found " + picker);
};

const { browser, page } = await boot();
for (const [name, fn] of Object.entries(tests)) {
  if (filter && !new RegExp(filter).test(name)) continue;
  console.log(name);
  try {
    await fn(page);
  } catch (e) {
    failed++;
    console.log("  ERROR", String(e).slice(0, 400));
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
