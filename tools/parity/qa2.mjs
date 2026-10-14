// QA2: everything report 1 did not score. node tools/parity/qa2.mjs [section-regex]
// Results go to tools/parity/out/qa2/results.json (merged per section) and tools/parity/out/qa2/*.png.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boot, loadPlan, panTo, rectOf, camera } from "./lib/app.mjs";
import { refChain, drawerPlan, anyDrawerPlan, forcedPlan, ebfOne } from "./lib/plans.mjs";
import { readPng, px, hex } from "./lib/png.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out", "qa2");
fs.mkdirSync(OUT, { recursive: true });
const filter = process.argv[2] ? new RegExp(process.argv[2]) : null;
const RES = path.join(OUT, "results.json");
const results = fs.existsSync(RES) ? JSON.parse(fs.readFileSync(RES, "utf8")) : {};
const { browser, page } = await boot();
const wait = (ms) => page.waitForTimeout(ms);
const rec = (sec, id, verdict, detail) => {
  (results[sec] ??= {})[id] = { verdict, detail };
  try { fs.writeFileSync(RES, JSON.stringify(results, null, 1)); } catch {}
  console.log(`${verdict.padEnd(5)} ${sec}/${id}: ${detail}`);
};
const check = (sec, id, ok, detail) => rec(sec, id, ok ? "PASS" : "FAIL", detail);
const shot = (name, clip) => page.screenshot({ path: path.join(OUT, name + ".png"), ...(clip ? { clip } : {}) });
const nodeSel = (id) => `.react-flow__node[data-id="${id}"]`;
const focus = async (id, x = 700, y = 300) => panTo(page, id, x, y);
const idle = () => page.mouse.move(1000, 1040);
const mix = (a, b, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return "#" + A.map((v, i) => Math.round(v * t + B[i] * (1 - t)).toString(16).padStart(2, "0")).join("").toUpperCase();
};
const sections = {};
const section = (name, fn) => (sections[name] = fn);
const storage = (id) => page.evaluate((id) => window.__ccStore.getState().project.storages.find((s) => s.id === id), id);
const cdVars = (sel) =>
  page.evaluate((sel) => {
    const cd = document.querySelector(sel + " .cd");
    const cs = getComputedStyle(cd);
    const v = (k) => cs.getPropertyValue(k).trim();
    return { tint: v("--cd-tint"), edge: v("--cd-edge"), bar: v("--cd-bar"), body: v("--cd-body"), stripe: v("--cd-stripe") };
  }, sel);

section("drawers", async () => {
  const ids = await loadPlan(page, drawerPlan);
  const kinds = { aniline: "product", acid: "source", methane: "trash" };
  const MOD = { source: "#78B6F4", product: "#F59A5C", trash: "#8A93A6" };
  const SURF = "#23252A", EDGE = "#34363C";
  for (const [k, kind] of Object.entries(kinds)) {
    const id = ids[k];
    await focus(id);
    await wait(500);
    const r = await rectOf(page, nodeSel(id));
    check("drawers", `${kind} footprint 120x80`, Math.abs(r.w - 120) < 0.6 && Math.abs(r.h - 80) < 0.6, `${r.w}x${r.h}`);
    const v = await cdVars(nodeSel(id));
    const t = MOD[kind];
    const want = { edge: mix(t, EDGE, 0.55), bar: mix(t, SURF, 0.2), body: mix(t, SURF, 0.07) };
    check("drawers", `${kind} tint`, v.tint.toUpperCase() === t, `${v.tint} vs mod ${t}`);
    check("drawers", `${kind} edge colour`, v.edge.toUpperCase() === want.edge, `${v.edge} vs mod ${want.edge}`);
    check("drawers", `${kind} body colour`, v.body.toUpperCase() === want.body, `${v.body} vs mod ${want.body}`);
    await shot(`drawer-${kind}`, { x: r.x - 20, y: r.y - 20, width: r.w + 40, height: r.h + 40 });
    const png = readPng(path.join(OUT, `drawer-${kind}.png`));
    const s = png.width / (r.w + 40);
    const body = hex(px(png, Math.round(26 * s), Math.round(90 * s)));
    let dist = 0;
    for (let i = 0; i < 3; i++) dist += Math.abs(parseInt(body.slice(1 + 2 * i, 3 + 2 * i), 16) - parseInt(want.body.slice(1 + 2 * i, 3 + 2 * i), 16));
    rec("drawers", `${kind} rendered body pixel`, dist <= 24 ? "PASS" : "FAIL", `${body} vs mod fill ${want.body} (sum abs diff ${dist})`);
  }
  const bar = await page.evaluate((s) => document.querySelector(s + " .cd-bar").getBoundingClientRect().height, nodeSel(ids.aniline));
  rec("drawers", "grab bar share of height (mod 8/54=0.15)", Math.abs(bar / 80 - 8 / 54) < 0.04 ? "PASS" : "DIFF", `web ${bar}/80=${(bar / 80).toFixed(3)}`);
});

section("drawer-rules", async () => {
  const ids = await loadPlan(page, drawerPlan);
  const id = ids.aniline;
  await focus(id);
  const sel = nodeSel(id);
  const read = () =>
    page.evaluate((sel) => {
      const k = document.querySelector(sel + " .cd-key");
      const b = document.querySelector(sel + " .cd-box");
      return { mark: k.dataset.mark, aria: k.getAttribute("aria-label"), box: b.dataset.text, rateAria: b.getAttribute("aria-label") };
    }, sel);
  rec("drawer-rules", "start", "INFO", JSON.stringify(await read()));
  await page.locator(sel + " .cd-key").click();
  await wait(500);
  await shot("rule-menu", { x: 400, y: 100, width: 800, height: 600 });
  const menu = await page.evaluate(() => [...document.querySelectorAll(".cd-menu-row")].map((e) => e.textContent.trim().replace(/\s+/g, " ")));
  rec("drawer-rules", "menu rows", "INFO", JSON.stringify(menu));
  check("drawer-rules", "product menu lists four rules (Any, At least, At most, Exactly)", ["any", "at least", "at most", "exactly"].every((r) => menu.join("|").toLowerCase().includes(r)), menu.join("|").slice(0, 200));
  await page.keyboard.press("Escape");
  await wait(200);
  await page.locator(sel + " .cd-key").hover();
  const seq = [];
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 100);
    await wait(250);
    seq.push((await read()).mark);
  }
  rec("drawer-rules", "wheel on rule key cycles", new Set(seq).size > 2 ? "PASS" : "FAIL", seq.join(" "));
  await page.locator(sel + " .cd-key").click({ button: "middle" });
  await wait(300);
  rec("drawer-rules", "middle click on rule key", "INFO", JSON.stringify(await read()));
  for (const [typed, want] of [["2.5k", 2500], ["1/3", 1 / 3], ["7", 7]]) {
    await page.locator(sel + " .cd-box").click();
    await wait(250);
    await page.keyboard.press("Control+a");
    await page.keyboard.type(typed);
    await page.keyboard.press("Enter");
    await wait(500);
    const rate = (await storage(id))?.targetPerSecond;
    check("drawer-rules", `rate box accepts ${typed}`, rate !== undefined && Math.abs(rate - want) < 0.001 * Math.max(1, want), `stored ${rate}, want ${want}`);
  }
  await page.locator(sel + " .cd-box").hover();
  const before = (await storage(id))?.targetPerSecond;
  await page.mouse.wheel(0, -100);
  await wait(300);
  const after = (await storage(id))?.targetPerSecond;
  rec("drawer-rules", "wheel up on box +1", Math.abs(after - before - 1) < 1e-6 ? "PASS" : "FAIL", `${before} -> ${after}`);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await wait(300);
  const after10 = (await storage(id))?.targetPerSecond;
  rec("drawer-rules", "ctrl+wheel up on box +10 (real wheel event, mod: round + 10)", Math.abs(after10 - after - 10) < 1e-6 ? "PASS" : "FAIL", `${after} -> ${after10}`);
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Shift");
  await wait(300);
  const after100 = (await storage(id))?.targetPerSecond;
  rec("drawer-rules", "shift+wheel up on box +100 (mod: round + 100)", Math.abs(after100 - after10 - 100) < 1e-6 ? "PASS" : "FAIL", `${after10} -> ${after100}`);
  await page.mouse.wheel(0, 100);
  await wait(300);
  const down1 = (await storage(id))?.targetPerSecond;
  rec("drawer-rules", "wheel down on box -1", Math.abs(down1 - after100 + 1) < 1e-6 ? "PASS" : "FAIL", `${after100} -> ${down1}`);
  for (const k of ["acid", "methane"]) {
    await focus(ids[k]);
    await page.locator(nodeSel(ids[k]) + " .cd-key").click();
    await wait(400);
    const m = await page.evaluate(() => [...document.querySelectorAll(".cd-menu-row")].map((e) => e.textContent.trim().replace(/\s+/g, " ")));
    rec("drawer-rules", `${k} menu`, "INFO", JSON.stringify(m));
    await shot(`rule-menu-${k}`, { x: 400, y: 100, width: 800, height: 600 });
    await page.keyboard.press("Escape");
    await idle();
  }
  await focus(ids.aniline);
  await page.locator(sel).hover();
  await wait(300);
  const del = await page.locator(sel + " .cd-del").count();
  rec("drawer-rules", "delete key present", del ? "PASS" : "FAIL", `count ${del}`);
});

section("drawer-prompt", async () => {
  const ids = await loadPlan(page, anyDrawerPlan);
  await focus(ids.aniline);
  const sel = nodeSel(ids.aniline);
  const r = await rectOf(page, sel);
  // the rate box only: the words' own pixels change, the drawer around them does not
  const rb = await rectOf(page, sel + " .cd-box");
  const clip = { x: rb.x, y: rb.y, width: rb.w, height: rb.h };
  const samples = [];
  for (let i = 0; i < 12; i++) {
    const p = path.join(OUT, `pulse-${i}.png`);
    await page.screenshot({ path: p, clip });
    const png = readPng(p);
    let sum = 0, n = 0;
    for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) { const q = px(png, x, y); sum += q[0] + q[1] + q[2]; n++; }
    samples.push(Math.round(sum / n));
    await wait(150);
  }
  const span = Math.max(...samples) - Math.min(...samples);
  rec("drawer-prompt", "Set rate pulses (brightness over 1.8 s)", span > 6 ? "PASS" : "FAIL", `span ${span}: ${samples.join(",")}`);
  const txt = await page.evaluate((s) => document.querySelector(s + " .cd-box").dataset.text, sel);
  check("drawer-prompt", "prompt text is Set rate", txt === "Set rate", txt);
  const anim = await page.evaluate(() => [...document.querySelectorAll("[data-prompt]")].slice(0, 10).map((e) => e.className + "|" + getComputedStyle(e).animationName + "|" + getComputedStyle(e).animationDuration + "|" + getComputedStyle(e).animationDelay));
  rec("drawer-prompt", "prompt elements and animations", "INFO", JSON.stringify(anim));
});

const ctx = { page, wait, rec, check, shot, nodeSel, focus, idle, mix, storage, cdVars, section, OUT, loadPlan, panTo, rectOf, camera, plans: { refChain, drawerPlan, anyDrawerPlan, forcedPlan, ebfOne }, readPng, px, hex, path, fs };
for (const f of fs.readdirSync(path.join(here, "qa2")).filter((f) => f.endsWith(".mjs")).sort()) await (await import("./qa2/" + f)).default(ctx);
const names = Object.keys(sections).filter((n) => !filter || filter.test(n)).sort((a, b) => (a === "chrome") - (b === "chrome"));
for (const n of names) {
  try {
    await Promise.race([sections[n](), new Promise((_, rj) => setTimeout(() => rj(new Error("section timeout 240 s")), 240000))]);
  } catch (e) {
    rec(n, "CRASH", "FAIL", String(e).replace(/data-tip="[^"]*"/g, "").slice(0, 1500));
  }
}
fs.writeFileSync(RES, JSON.stringify(results, null, 1));
await browser.close();
