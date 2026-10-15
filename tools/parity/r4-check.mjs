// R4 checks: the minimap fitted and still while the board moves, in the board's corner, clear of NEI's search field;
// the items column's keys in the overview's key look and its grid filling the column evenly; both folded columns one
// strip. PARITY_BASE=http://localhost:3241 node tools/parity/r4-check.mjs   (exit 1 on any failure)
import { boot, loadPlan, settle } from "./lib/app.mjs";
import { refChain } from "./lib/plans.mjs";

let failed = 0;
const check = (name, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!ok) failed++;
};
const rect = (page, sel) =>
  page.evaluate((sel) => {
    const e = document.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, sel);
const mapView = (page) => page.evaluate(() => window.__minimapStats?.view);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const { browser, page } = await boot({ width: 1920, height: 1080, dsf: 1 });
await page.evaluate(() => localStorage.removeItem("boardMinimap"));
await page.reload({ waitUntil: "networkidle" });
await page.waitForFunction(() => window.__ccStore?.getState().dataset, null, { timeout: 180000 });
await page.getByText("Untitled design").first().click().catch(() => {});
await page.getByText("Not now").click({ timeout: 2000 }).catch(() => {});
await loadPlan(page, refChain);
await settle(page, 2500);

// ---- minimap ----
const map = await rect(page, "[data-minimap]");
const board = await rect(page, ".factory-flow-board");
check("the map is up", map !== null);
const k = map ? map.width / 130 : 1;
check("small by default (130 at the page's zoom)", map && map.width < 170, `${map?.width}`);
check(
  "in the board's very bottom-right corner",
  map && Math.abs(board.right - map.right - 14 * k) < 4 && Math.abs(board.bottom - map.bottom - 14 * k) < 4,
  `${(board.right - map.right).toFixed(1)}, ${(board.bottom - map.bottom).toFixed(1)}`,
);
check("no title over it", (await page.locator(".mmap-title").count()) === 0);
const v0 = await mapView(page);
await page.mouse.move(800, 500);
await page.mouse.down();
await page.mouse.move(500, 300, { steps: 6 });
await page.mouse.up();
await settle(page, 400);
const v1 = await mapView(page);
await page.mouse.move(800, 500);
await page.mouse.wheel(0, 500);
await settle(page, 500);
const v2 = await mapView(page);
check("still while the board pans", same(v0, v1), `${JSON.stringify(v0)} -> ${JSON.stringify(v1)}`);
check("still while the board zooms", same(v0, v2), JSON.stringify(v2));
check("fitted: zoomed out to the whole plan", v0 && v0.zoom < 0.5, JSON.stringify(v0));
// A hand zoom, kept; a double click fits again.
await page.mouse.move(map.left + map.width / 2, map.top + map.height / 2);
await page.mouse.wheel(0, -100);
await settle(page, 300);
const v3 = await mapView(page);
check("the wheel over it zooms it by hand", v3 && v3.zoom > v0.zoom, JSON.stringify(v3));
await page.mouse.dblclick(map.left + 10, map.top + 10);
await settle(page, 300);
check("a double click fits the plan again", (await page.evaluate(() => JSON.parse(localStorage.getItem("boardMinimap")).fit)) === true);
// Settings: no See-through row.
await page.mouse.move(map.left + map.width / 2, map.top + map.height / 2);
await page.locator(".mmap-gear").click();
await settle(page, 200);
const rows = await page.locator(".mmap-panel .mmap-row-name").allTextContents();
check("its settings have no See-through", rows.length > 0 && !rows.some((r) => /see-through/i.test(r)), rows.join(" | "));
await page.keyboard.press("Escape");

// ---- the search field clear of the map at any width ----
for (const w of [1920, 1600, 1400, 1280, 1180, 1100]) {
  await page.setViewportSize({ width: w, height: 900 });
  await settle(page, 2000);
  const m = await rect(page, "[data-minimap]");
  const f = await rect(page, "[data-nei-search-dock] .nei-search");
  if (!m || !f) {
    check(`${w}: map and field both on screen`, false, `${JSON.stringify(m)} ${JSON.stringify(f)}`);
    continue;
  }
  const overlap = f.right > m.left && f.left < m.right && f.bottom > m.top && f.top < m.bottom;
  check(`${w}: the search field never covers the map`, !overlap, `field ${f.left.toFixed(0)}..${f.right.toFixed(0)}, map ${m.left.toFixed(0)}..${m.right.toFixed(0)}`);
}
await page.setViewportSize({ width: 1920, height: 1080 });
await settle(page, 1200);

// ---- items column ----
const keys = await page.evaluate(() => {
  const aside = document.querySelector("aside[data-help-anchor=browser]");
  const look = (e) => {
    const s = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return { bg: s.backgroundColor, border: `${s.borderTopColor} ${s.borderTopWidth}`, shadow: s.boxShadow, w: Math.round(r.width), h: Math.round(r.height) };
  };
  return {
    fold: look(aside.querySelector(".rail-key-fold")),
    others: [...aside.querySelectorAll(".nei-pager .nei-btn")].map((e) => ({ label: e.getAttribute("aria-label"), ...look(e) })),
  };
});
for (const key of keys.others) {
  const alike = ["bg", "border", "shadow", "w", "h"].every((p) => key[p] === keys.fold[p]);
  check(`"${key.label}" wears the fold key's look`, alike, `${JSON.stringify(key)} vs ${JSON.stringify(keys.fold)}`);
}
await page.waitForFunction(() => document.querySelectorAll("aside .nei-grid .nei-slot").length > 20, null, { timeout: 60000 });
const grid = await page.evaluate(() => {
  const aside = document.querySelector("aside[data-help-anchor=browser]");
  const col = aside.querySelector(".nei-grid").parentElement.getBoundingClientRect();
  const slots = [...aside.querySelectorAll(".nei-grid .nei-slot")].map((s) => s.getBoundingClientRect());
  const top = slots[0].top;
  const row = slots.filter((s) => Math.abs(s.top - top) < 1);
  return { left: row[0].left - col.left, right: col.right - row[row.length - 1].right, cols: row.length, slot: row[0].width, colW: col.width };
});
check("the grid's left and right margins match", Math.abs(grid.left - grid.right) <= 1, JSON.stringify(grid));
check("no gutter close to a slot wide", grid.left < grid.slot / 2, JSON.stringify(grid));

// ---- folded columns ----
await page.getByLabel("Fold the overview").click();
await page.getByLabel("Hide the items column").click();
await settle(page, 500);
const strips = await page.evaluate(() =>
  ["Open the overview", "Open the items"].map((name) => {
    const e = document.querySelector(`[aria-label="${name}"]`);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const svg = e.querySelector("svg").getBoundingClientRect();
    const s = getComputedStyle(e);
    return { cls: e.className, w: r.width, arrowTop: svg.top - r.top, bg: s.backgroundColor, color: s.color, label: e.textContent };
  }),
);
check("both folded columns are on screen", strips.every(Boolean), JSON.stringify(strips));
if (strips.every(Boolean)) {
  const [o, i] = strips;
  check("same strip class, width, colours", o.cls === i.cls && Math.abs(o.w - i.w) < 0.5 && o.bg === i.bg && o.color === i.color, JSON.stringify(strips));
  check("the arrow at the top of both", o.arrowTop < 12 && i.arrowTop < 12, `${o.arrowTop}, ${i.arrowTop}`);
}
await page.getByLabel("Open the items").click();
await settle(page, 300);
check("the items strip opens the column", (await page.locator("aside[data-help-anchor=browser]").count()) === 1);

await browser.close();
console.log(failed ? `${failed} failed` : "all passed");
process.exit(failed ? 1 : 0);
