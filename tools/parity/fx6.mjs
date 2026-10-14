// FX6 parity: the chrome (top bar, tabs, menus, settings, screenshot box, library, picker) against the mod's reference shots.
//   PARITY_BASE=http://localhost:3143 node tools/parity/fx6.mjs [state-regex]
// The page is made the mod's size: the shell zoom (1.17) times the device scale gives 2 device px per mod GUI px, so a
// 1920x1080 mod shot and a 1920x1080 clip of the page measure alike. Output: tools/parity/out/fx6/<id>.side.png (mod left,
// website right) and results.json (the measured numbers each state asserts).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { loadPlan } from "./lib/app.mjs";
import * as plans from "./lib/plans.mjs";
import { readPng, writePng, sideBySide, crop } from "./lib/png.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REF =
  process.env.PARITY_REF ??
  path.resolve(here, "../../../gtnh-planner-mod/.claude/worktrees/website-mod-backport-research-c84135/docs/design/backport/ref");
const OUT = path.join(here, "out", "fx6");
const BASE = process.env.PARITY_BASE ?? "http://localhost:3143";
const S = 1.17;
const D = 2 / S;
const filter = process.argv.find((a, i) => i > 1 && !a.startsWith("--"));
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Math.round(1920 / D), height: 665 }, deviceScaleFactor: D, reducedMotion: "no-preference" });
const page = await ctx.newPage();
await page.addInitScript(() => {
  try {
    localStorage.setItem("gtnh-factory-flow.mod-announcement-dismissed.v1", "x");
  } catch {}
});
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
await page.goto(`${BASE}/dev/clean-card`, { waitUntil: "networkidle", timeout: 180000 });
await page.waitForFunction(() => window.__ccStore?.getState().dataset, null, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.getByText("Untitled design").first().click();
await page.waitForTimeout(800);

/** Names the open plan and makes the tab strip the reference's: Benzene, ref-chain, ref-states (open). */
async function tabs(names) {
  for (let i = 0; i < names.length; i++) {
    if (i > 0) {
      await page.locator(".mt-plus").click();
      await page.getByText("New plan").first().click();
      await page.waitForTimeout(500);
    }
    await page.locator(".mt-tab[data-active]").click({ button: "right" });
    await page.getByText("Rename").first().click();
    await page.keyboard.type(names[i]);
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);
  }
}
await tabs(["Benzene", "ref-chain", "ref-states"]);

const rect = (selector, nth = 0) =>
  page.evaluate(
    ({ selector, nth }) => {
      const el = document.querySelectorAll(selector)[nth];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    },
    { selector, nth },
  );

const clean = async () => {
  await page.keyboard.press("Escape");
  await page.mouse.move(1000, 600);
  await page.waitForTimeout(250);
};

/**
 * Each state: the reference shot, the rectangle of it to compare (device px), the element whose top-left sits at
 * `at` in the reference (device px), and what puts the page in the state.
 */
const states = [
  {
    id: "topbar-keys",
    ref: "topbar-and-plan-tabs",
    crop: [440, 0, 1160, 44],
    anchor: "[data-mb=nonrecipe]",
    at: [490, 4],
    setup: async () => {},
  },
  {
    id: "topbar-tabs",
    ref: "topbar-and-plan-tabs",
    crop: [0, 0, 500, 44],
    anchor: ".mt-tab[data-active]",
    at: [276, 4],
    setup: async () => {},
  },
  {
    id: "tab-menu",
    ref: "plan-tab-right-click-menu",
    crop: [260, 0, 460, 300],
    anchor: ".mt-tab[data-active]",
    at: [276, 4],
    setup: async () => {
      await page.locator(".mt-tab[data-active]").click({ button: "right" });
    },
  },
  {
    id: "plus-menu",
    ref: "plan-tab-plus-menu",
    crop: [260, 0, 460, 300],
    anchor: ".mt-plus",
    at: [440, 4],
    setup: async () => {
      await page.locator(".mt-plus").click();
    },
  },
  {
    id: "share-menu",
    ref: "share-menu-open",
    crop: [0, 0, 800, 400],
    anchor: "[data-mb=share]",
    at: [560, 8],
    setup: async () => {
      await page.locator("[data-mb=share]").click();
    },
  },
  {
    id: "help-menu",
    ref: "help-menu-open",
    crop: [0, 0, 800, 240],
    anchor: "[data-mb=help]",
    at: [418, 8],
    setup: async () => {
      await page.locator("[data-mb=help]").click();
    },
  },
  {
    id: "settings-board",
    ref: "settings-panel-open-full-screen",
    crop: [560, 260, 800, 560],
    anchor: ".ms",
    at: [580, 282],
    setup: async () => {
      await page.locator("[data-mb=settings]").click();
    },
  },
  {
    id: "library-mine",
    ref: "library-view-my-plans-shelf",
    crop: [0, 0, 1600, 440],
    anchor: ".ml-head",
    at: [0, 0],
    setup: async () => {
      await page.locator("[data-mb=library]").click();
    },
  },
  {
    id: "library-public",
    ref: "library-view-public-setups-shelf",
    crop: [0, 0, 1600, 100],
    anchor: ".ml-head",
    at: [0, 0],
    setup: async () => {
      await page.locator("[data-mb=library]").click();
      await page.getByText("PUBLIC SETUPS").click();
    },
  },
  {
    id: "picker",
    ref: "non-recipe-picker-open",
    crop: [0, 0, 1600, 1000],
    anchor: ".mp",
    at: [24, 12],
    setup: async () => {
      await page.locator("[data-mb=nonrecipe]").click();
    },
  },
];

const results = [];
for (const st of states) {
  if (filter && !new RegExp(filter).test(st.id)) continue;
  try {
    await clean();
    await st.setup();
    await page.waitForTimeout(500);
    const ref = readPng(path.join(REF, st.ref + ".png"));
    const [rx, ry, rw, rh] = st.crop;
    const a = await rect(st.anchor);
    const shot = path.join(OUT, `${st.id}.web.png`);
    await page.screenshot({
      path: shot,
      clip: { x: a.x - (st.at[0] - rx) / D, y: a.y - (st.at[1] - ry) / D, width: rw / D, height: rh / D },
    });
    const mod = crop(ref, rx, ry, rw, rh, 1);
    const web = readPng(shot);
    writePng(path.join(OUT, `${st.id}.side.png`), sideBySide(mod, web));
    results.push({ id: st.id, ok: true, web: [web.width, web.height] });
    console.log("ok", st.id);
  } catch (error) {
    results.push({ id: st.id, ok: false, error: String(error).slice(0, 300) });
    console.log("FAIL", st.id, String(error).slice(0, 200));
  }
}
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 1));
await browser.close();
void plans;
void loadPlan;
