// R3 checks: the items column as NEI's list, the search field at the bottom middle, Minecraft tooltips.
// PARITY_BASE=http://localhost:3203 node tools/parity/r3-nei.mjs   (exit 1 on any failure; shots in scratch/r3/)
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.PARITY_BASE ?? "http://localhost:3120";
const OUT = "scratch/r3";
mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};

const browser = await chromium.launch();

async function open({ width = 1920, height = 1080, welcome = false } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem("gtnh-factory-flow.mod-announcement-dismissed.v1", "x");
    } catch {}
  });
  page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 200)));
  await page.goto(`${BASE}/dev/clean-card`, { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForFunction(() => window.__ccStore?.getState().dataset, null, { timeout: 180000 });
  if (!welcome) {
    await page.getByText("Untitled design").first().click();
    await page.getByText("Not now").click({ timeout: 3000 }).catch(() => {});
  }
  await page.waitForTimeout(1500);
  return { context, page };
}

// ---- desktop ----
{
  const { context, page } = await open();
  const aside = page.locator("aside[data-help-anchor=browser]");
  for (const label of ["Place a generator", "Add custom rate node", "Add fluid tank", "Add crop farm"]) {
    check(`no "${label}" key in the items column`, (await aside.getByLabel(label, { exact: true }).count()) === 0);
  }
  const fold = aside.getByLabel("Hide the items column");
  check("the fold key is the overview's fold key", (await fold.getAttribute("class"))?.includes("rail-key-fold") === true);
  check("the fold key points at the board", ((await fold.textContent()) ?? "").trim() === "»");
  const pager = await aside.locator(".nei-pager").boundingBox();
  check("page keys sit at the top of the column", pager !== null && pager.y < 10, JSON.stringify(pager));
  check("page count reads n/m", /^\d+\/\d+$/.test(((await aside.locator(".nei-pager-count").textContent()) ?? "").trim()));

  await page.waitForFunction(() => document.querySelectorAll("aside .nei-grid .nei-slot img").length > 20, null, { timeout: 60000 });
  const slots = aside.locator(".nei-grid .nei-slot");
  const shape = await slots.evaluateAll((list) =>
    list.map((slot) => {
      const r = slot.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), text: slot.textContent.trim(), radius: getComputedStyle(slot).borderRadius };
    }),
  );
  check("slots carry the art alone, no names", shape.every((s) => s.text === ""));
  check("slots are square and the same size", new Set(shape.map((s) => `${s.w}x${s.h}`)).size === 1 && shape[0].w === shape[0].h, `${shape[0].w}x${shape[0].h}`);
  check("slots have square corners", shape.every((s) => s.radius === "0px"));
  const gridBox = await aside.locator(".nei-grid").boundingBox();
  const asideBox = await aside.boundingBox();
  check("the grid fills the column to its foot", gridBox.y + gridBox.height > asideBox.y + asideBox.height - 90, `${gridBox.y + gridBox.height} of ${asideBox.y + asideBox.height}`);

  // Hover: NEI's grey slot highlight and a Minecraft tooltip at once.
  const slot = slots.nth(8);
  const sb = await slot.boundingBox();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.waitForTimeout(120);
  const tip = page.locator(".mc-tip[data-minecraft-tooltip]");
  check("a slot's tooltip shows at once (under 120 ms)", (await tip.count()) === 1);
  const tipStyle = await tip.evaluate((el) => {
    const cs = getComputedStyle(el);
    const lines = [...el.querySelectorAll(".mc-tip-line")].map((line) => ({ tone: line.getAttribute("data-tone"), color: getComputedStyle(line).color, italic: getComputedStyle(line).fontStyle }));
    return { bg: cs.backgroundColor, radius: cs.borderRadius, clip: cs.clipPath !== "none", font: cs.fontFamily, lines };
  });
  check("tooltip ground is Minecraft's 0xF0100010", /rgba\(16, 0, 16, 0\.9/.test(tipStyle.bg), tipStyle.bg);
  check("tooltip corners are square with the game's cut corners", tipStyle.radius === "0px" && tipStyle.clip);
  check("tooltip name in white first", tipStyle.lines[0]?.tone === "name" && tipStyle.lines[0].color === "rgb(255, 255, 255)");
  const mod = tipStyle.lines.at(-1);
  check("mod name last, blue italics", mod?.tone === "mod" && mod.color === "rgb(85, 85, 255)" && mod.italic === "italic", JSON.stringify(mod));
  const hl = await slot.evaluate((el) => getComputedStyle(el).backgroundColor);
  check("hovered slot wears NEI's grey highlight", /rgba\(85, 85, 85/.test(hl), hl);
  await page.screenshot({ path: `${OUT}/check-hover.png` });

  // R and U over a slot.
  const name = await slot.getAttribute("aria-label");
  await page.keyboard.press("u");
  await page.waitForTimeout(400);
  let st = await page.evaluate(() => ({ r: window.__ccStore.getState().recipeBrowserResource?.displayName, m: window.__ccStore.getState().recipeBrowserMode }));
  check("U over a slot asks for its uses", st.r !== undefined && st.m === "uses", JSON.stringify(st) + " " + name);
  await page.evaluate(() => window.__ccStore.getState().clearResourceBrowser());
  await page.waitForTimeout(300);
  await page.mouse.move(sb.x + sb.width / 2 + 1, sb.y + sb.height / 2);
  await page.keyboard.press("r");
  await page.waitForTimeout(400);
  st = await page.evaluate(() => ({ r: window.__ccStore.getState().recipeBrowserResource?.displayName, m: window.__ccStore.getState().recipeBrowserMode }));
  check("R over a slot asks for its recipes", st.r !== undefined && st.m === "recipes", JSON.stringify(st));
  // While the recipe search is open the field waits at the column's foot (the search's own keys hold the middle).
  check("with the recipe search open the field is at the column's foot", (await aside.locator(".nei-search-foot .nei-search").count()) === 1 && (await page.locator("[data-nei-search-dock]").count()) === 0);
  await page.evaluate(() => window.__ccStore.getState().clearResourceBrowser());
  await page.waitForTimeout(500);

  // The search field: bottom middle of the screen, NEI's size and look.
  const dock = page.locator("[data-nei-search-dock] .nei-search");
  check("search field is docked (one, outside the column)", (await dock.count()) === 1 && (await aside.locator(".nei-search").count()) === 0);
  const db = await dock.boundingBox();
  check("search field centred on the screen", Math.abs(db.x + db.width / 2 - 960) <= 2, `${db.x + db.width / 2}`);
  check("search field at the bottom edge", 1080 - (db.y + db.height) <= 10 && 1080 - (db.y + db.height) >= 2, `${1080 - (db.y + db.height)} px up`);
  check("search field about NEI's 340 x 36 px", Math.abs(db.width - 340) <= 24 && Math.abs(db.height - 36) <= 6, `${Math.round(db.width)}x${Math.round(db.height)}`);
  const look = await dock.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { bg: cs.backgroundColor, border: cs.borderTopColor, radius: cs.borderRadius };
  });
  check("search field is the game's text field (#A0A0A0 frame on black, square)", look.bg === "rgb(0, 0, 0)" && look.border === "rgb(160, 160, 160)" && look.radius === "0px", JSON.stringify(look));
  const before = (await aside.locator(".nei-pager-count").textContent()).trim();
  await dock.locator("input").focus();
  await page.mouse.move(sb.x + sb.width / 2, sb.y + sb.height / 2);
  await page.waitForTimeout(150);
  await dock.locator("input").fill("benzene");
  await page.waitForTimeout(2500);
  const stale = await page.evaluate(([x, y]) => {
    const tipEl = document.querySelector(".mc-tip[data-minecraft-tooltip] .mc-tip-line");
    const under = document.elementFromPoint(x, y)?.closest(".nei-slot")?.getAttribute("aria-label");
    return { tip: tipEl?.textContent ?? null, under: under ?? null };
  }, [sb.x + sb.width / 2, sb.y + sb.height / 2]);
  check("a page that changes under a still pointer leaves no stale tooltip", stale.tip === null || stale.tip === stale.under, JSON.stringify(stale));
  const after = (await aside.locator(".nei-pager-count").textContent()).trim();
  const firstNames = await slots.evaluateAll((list) => list.slice(0, 6).map((s) => s.getAttribute("aria-label")));
  check("typing filters the list", before !== after && firstNames.some((n) => /benzene/i.test(n ?? "")), `${before} -> ${after}: ${firstNames.join(", ")}`);
  await page.screenshot({ path: `${OUT}/check-search.png` });
  await dock.click({ button: "right" });
  await page.waitForTimeout(300);
  check("a right click clears the field, as NEI's does", (await dock.locator("input").inputValue()) === "");
  await page.waitForTimeout(2000);

  // Drag an item onto the board: a drawer.
  const storagesBefore = await page.evaluate(() => (window.__ccStore.getState().project.storages ?? []).length);
  await slots.nth(3).dragTo(page.locator(".react-flow__pane"), { targetPosition: { x: 600, y: 400 } });
  await page.waitForTimeout(800);
  const storagesAfter = await page.evaluate(() => (window.__ccStore.getState().project.storages ?? []).length);
  check("dragging a slot onto the board makes a drawer", storagesAfter === storagesBefore + 1, `${storagesBefore} -> ${storagesAfter}`);

  // Show-and-sort menu.
  await aside.getByLabel("Show and sort").click();
  await page.waitForTimeout(300);
  await page.getByText("Fluids only").click();
  await page.waitForTimeout(2500);
  const kinds = await page.evaluate(() => document.querySelectorAll("aside .nei-grid .nei-slot").length);
  check("the menu filters (Fluids only)", kinds > 0 && (await aside.getByLabel("Show and sort").getAttribute("data-on")) === "");
  await context.close();
}

// ---- Welcome's "Find a recipe" still lands in the field ----
{
  const { context, page } = await open({ welcome: true });
  const find = page.getByText("Find a recipe");
  if (await find.count()) {
    await find.first().click();
    await page.waitForTimeout(1500);
    const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    check("Find a recipe puts the cursor in the items search", focused === "Search items and fluids", String(focused));
  } else {
    check("Welcome page shows Find a recipe", false);
  }
  await context.close();
}

// ---- compact: the drawer, search at its foot ----
{
  const { context, page } = await open({ width: 420, height: 860 });
  await page.evaluate(() => {
    const raw = localStorage.getItem("gtnh-factory-flow.workspace-view");
    void raw;
  });
  const opener = page.getByLabel(/items/i).first();
  await page.mouse.click(408, 462);
  await page.waitForTimeout(1500);
  void opener;
  const aside = page.locator("aside[data-help-anchor=browser]");
  const foot = aside.locator(".nei-search-foot .nei-search");
  check("compact: the search sits at the drawer's foot", (await foot.count()) === 1 && (await page.locator("[data-nei-search-dock]").count()) === 0);
  if (await foot.count()) {
    const fb = await foot.boundingBox();
    const ab = await aside.boundingBox();
    check("compact: at the bottom of the drawer", ab.y + ab.height - (fb.y + fb.height) < 12, `${ab.y + ab.height - (fb.y + fb.height)}`);
  }
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/check-compact.png` });
  await context.close();
}

await browser.close();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
