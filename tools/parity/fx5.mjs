// FX5: the overview rail against the mod. node tools/parity/fx5.mjs [section-regex]  (PARITY_BASE=http://localhost:3142)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boot, loadPlan } from "./lib/app.mjs";
import { refChain, drawerPlan } from "./lib/plans.mjs";
import { forcedTwoPlaces } from "./lib/fx5-plans.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out", "fx5");
fs.mkdirSync(OUT, { recursive: true });
const filter = process.argv[2] ? new RegExp(process.argv[2]) : null;
const { browser, page } = await boot();
const wait = (ms) => page.waitForTimeout(ms);
const results = [];
const rec = (sec, id, ok, detail) => {
  results.push({ sec, id, ok, detail });
  console.log(`${ok === null ? "INFO " : ok ? "PASS " : "FAIL "}${sec}/${id}: ${detail}`);
};
const shot = (name, clip) => page.screenshot({ path: path.join(OUT, name + ".png"), ...(clip ? { clip } : {}) });
const sections = {};
const section = (n, f) => (sections[n] = f);
const idle = () => page.mouse.move(1000, 1040);

section("geometry", async () => {
  await loadPlan(page, drawerPlan);
  await wait(800);
  const g = await page.evaluate(() => ({
    scale: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")),
    css: document.querySelector(".rail-root").offsetWidth,
    screen: document.querySelector(".rail-root").getBoundingClientRect().width,
    rows: [...new Set([...document.querySelectorAll(".rail-row")].map((r) => r.offsetHeight))],
    secs: [...new Set([...document.querySelectorAll(".rail-sec")].map((r) => r.offsetHeight))],
    font: getComputedStyle(document.querySelector(".rail-name")).fontFamily.slice(0, 40),
    nameSize: getComputedStyle(document.querySelector(".rail-name")).fontSize,
  }));
  rec("geometry", "rail 234 css px (shell units; screen px = x ui scale)", g.css === 234, JSON.stringify(g));
  rec("geometry", "rows 24 css", g.rows.every((h) => h === 24), g.rows.join(","));
  rec("geometry", "Monocraft", /minecraft|monocraft/i.test(g.font), g.font);
  await shot("rail-full", { x: 0, y: 0, width: 420, height: 900 });
  await page.locator(".rail-key-fold").first().click();
  await wait(500);
  const w = await page.evaluate(() => document.querySelector(".rail-strip").offsetWidth);
  rec("geometry", "folded strip 26 css", w === 26, String(w));
  await page.locator(".rail-strip").click();
  await wait(400);
});

section("machines", async () => {
  await loadPlan(page, drawerPlan);
  await wait(800);
  const m = await page.evaluate(() =>
    [...document.querySelectorAll(".rail-machine")].map((m) => {
      const eu = m.querySelector(".rail-eu");
      return { text: m.innerText.replace(/\n/g, " "), eu: eu.innerText, clipped: eu.scrollWidth > eu.clientWidth + 1 };
    }),
  );
  rec("machines", "EU/t text not clipped on any machine line", m.every((x) => !x.clipped), JSON.stringify(m));
  const names = await page.evaluate(() =>
    [...document.querySelectorAll(".rail-name")].filter((n) => n.scrollWidth > n.clientWidth + 1).map((n) => [n.innerText, getComputedStyle(n).textOverflow]),
  );
  rec("machines", "names that overflow ellipsize", names.every((n) => n[1] === "ellipsis"), JSON.stringify(names));
  await shot("rail-machines", { x: 0, y: 0, width: 420, height: 900 });
});

section("counts", async () => {
  await loadPlan(page, drawerPlan);
  await wait(800);
  const pins = () => page.evaluate(() => window.__ccStore.getState().project.nodes.map((n) => n.solvePin ?? null));
  const box = page.locator(".rail-machine").first().locator(".rail-box").first();
  const before = await pins();
  await box.hover();
  await page.mouse.wheel(0, -100);
  await wait(900);
  const mid = await pins();
  rec("counts", "wheel on a machine line's count box changes a pinned count", JSON.stringify(before) !== JSON.stringify(mid), `${JSON.stringify(before)} -> ${JSON.stringify(mid)}`);
  await box.click();
  await wait(300);
  const editing = await page.evaluate(() => !!document.querySelector(".rail-machine input"));
  rec("counts", "click opens a number box", editing, String(editing));
  await page.keyboard.press("Control+a");
  await page.keyboard.type("5");
  await page.keyboard.press("Enter");
  await wait(800);
  const after = await pins();
  rec("counts", "typed 5 pins it at 5", after.includes(5), JSON.stringify(after));
  const key = page.locator(".rail-machine").nth(1).locator(".rail-rule").first();
  const b2 = await pins();
  await key.click();
  await wait(600);
  const a2 = await pins();
  rec("counts", "rule key pins at the whole machines it takes", JSON.stringify(b2) !== JSON.stringify(a2), `${JSON.stringify(b2)} -> ${JSON.stringify(a2)}`);
});

section("nothing-set", async () => {
  await loadPlan(page, { ...refChain, drawers: [] });
  await wait(1000);
  const rows = await page.evaluate(() => [...document.querySelectorAll(".rail-row")].map((r) => r.innerText.replace(/\n/g, " ")));
  const empties = await page.evaluate(() => [...document.querySelectorAll(".rail-empty")].map((r) => r.innerText));
  rec("nothing-set", "no stale flows with nothing set", rows.length === 0, JSON.stringify({ rows: rows.slice(0, 5), empties }));
  await shot("rail-nothing-set", { x: 0, y: 0, width: 420, height: 400 });
});

section("notices", async () => {
  const plan = { ...drawerPlan, drawers: drawerPlan.drawers.map((d) => (d.key === "acid" ? { ...d, rate: 0.05, mode: "at-most" } : d.key === "aniline" ? { ...d, rate: 50, mode: "at-least" } : d)) };
  plan.nodes = plan.nodes.map((n) => (n.key === "nb" ? { ...n, pin: 0.01 } : n));
  await loadPlan(page, plan);
  await wait(1000);
  const g = await page.evaluate(() => {
    const n = document.querySelector(".rail-notice")?.getBoundingClientRect();
    const tbs = [...document.querySelectorAll("[data-board-toolbar]")].map((t) => t.getBoundingClientRect());
    const flow = document.querySelector(".react-flow").getBoundingClientRect();
    return {
      n: n && { x: n.x, y: n.y, w: n.width, h: n.height },
      off: document.querySelector(".rail-notice")?.offsetHeight,
      toolbarsBottom: Math.max(...tbs.map((t) => t.bottom)),
      flowTop: flow.top,
      count: document.querySelectorAll(".rail-notice").length,
    };
  });
  rec("notices", "stacked at the top of the board, clear of the toolbars", g.n && g.n.y >= g.toolbarsBottom - 1 && g.n.y - g.flowTop < 140, JSON.stringify(g));
  rec("notices", "rows 24 css", g.off === 24, String(g.off));
  await shot("notices-top", { x: 270, y: 0, width: 1100, height: 260 });
});

section("hover", async () => {
  await loadPlan(page, drawerPlan);
  await wait(900);
  await page.evaluate(() => { const st = window.__ccStore.getState(); st.frameBoardNodes(st.project.nodes.map((n) => n.id).concat((st.project.storages ?? []).map((d) => d.id)), { padding: 0.2 }); });
  await wait(900);
  await idle();
  const clip = { x: 300, y: 80, width: 1300, height: 900 };
  const base = await page.screenshot({ clip });
  const diff = (a, b) =>
    page.evaluate(
      async ([a, b]) => {
        const load = (u) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = u; });
        const [ia, ib] = await Promise.all([load(a), load(b)]);
        const draw = (i) => { const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const x = c.getContext("2d"); x.drawImage(i, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
        const da = draw(ia), db = draw(ib);
        let n = 0;
        for (let k = 0; k < da.length; k += 4) if (Math.abs(da[k] - db[k]) + Math.abs(da[k + 1] - db[k + 1]) + Math.abs(da[k + 2] - db[k + 2]) > 40) n++;
        return n;
      },
      [`data:image/png;base64,${a.toString("base64")}`, `data:image/png;base64,${b.toString("base64")}`],
    );
  await page.locator(".rail-line", { hasText: "Aniline" }).first().hover();
  await wait(600);
  const row = await page.screenshot({ clip });
  const n = await diff(base, row);
  rec("hover", "resource row lights its resource on the board", n > 2000, `${n} px`);
  await page.screenshot({ path: path.join(OUT, "hover-aniline.png") });
  await idle();
});

section("forced", async () => {
  await loadPlan(page, forcedTwoPlaces);
  await wait(1200);
  const info = await page.evaluate(() => {
    const p = window.__ccStore.getState().lastResult?.plan;
    return {
      leftovers: p?.leftovers?.map((l) => ({ importing: l.importing, bearers: l.bearers.length })),
      block: document.querySelectorAll(".rail-spare").length,
      keys: [...document.querySelectorAll(".rail-spare-head .rail-key")].map((k) => k.innerText),
      rows: [...document.querySelectorAll(".rail-spare-row")].map((r) => r.innerText.replace(/\n/g, " ")),
      failure: p?.failure,
    };
  });
  rec("forced", "Forced block with Split and Auto", info.block > 0 && info.keys.includes("Split") && info.keys.includes("Auto"), JSON.stringify(info));
  await shot("forced-rail", { x: 0, y: 0, width: 420, height: 1000 });
});

for (const [name, fn] of Object.entries(sections)) {
  if (filter && !filter.test(name)) continue;
  try {
    await fn();
  } catch (e) {
    rec(name, "ERROR", false, String(e).slice(0, 300));
  }
}
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 1));
await browser.close();
