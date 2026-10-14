// Arrange on the real app: seconds, gaps between neighbours, Undo exactness.
// node tools/parity/qa3/arrtime.mjs [fixture under factory-flow/] ; env CAPTURE_OUT writes the arrange input for the node profile.
import fs from "node:fs";
import { fresh, importText, toCode, OUT } from "./lib.mjs";
const FX = process.env.FX ?? "C:/Users/jack/gtnh-planner-mod/.claude/worktrees/website-mod-backport-research-c84135/src/test/resources/";
const file = process.argv[2] ?? "alumina-line-shared-reactor.json";
const { browser, page } = await fresh();
await importText(page, toCode(fs.readFileSync(FX + "factory-flow/" + file, "utf8")));
await page.waitForTimeout(8000);
await page.getByRole("button", { name: "Not now" }).click().catch(() => {});
page.on("worker", (w) => w.on("console", (m) => { const t = m.text(); if (t.includes("arrT")) console.log(t); }));
const rects = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".react-flow__node")].map((n) => {
      const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(n.style.transform) ?? [];
      return { id: n.getAttribute("data-id"), x: +m[1], y: +m[2], w: n.offsetWidth, h: n.offsetHeight, drawer: /drawer|storage/i.test(n.className + n.getAttribute("data-testid")), note: n.innerText.includes("keep") };
    }),
  );
const gaps = (rs) => {
  // Edge-to-edge gap of every pair (0 = touching, negative = overlap), in flow px.
  const out = [];
  for (let i = 0; i < rs.length; i++)
    for (let j = i + 1; j < rs.length; j++) {
      const a = rs[i], b = rs[j];
      const gx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
      const gy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
      const g = Math.max(gx, gy);
      out.push({ g, gx, gy, a: a.id.slice(0, 6), b: b.id.slice(0, 6), dd: a.drawer || b.drawer });
    }
  return out;
};
const before = await rects();
console.log("nodes", before.length, "drawers", before.filter((r) => r.drawer).length);
const btn = page.getByRole("button", { name: /^Arrange/ }).first();
await page.evaluate(() => {
  window.__arr = { start: performance.now(), shown: 0, gone: 0 };
  const seen = () => /Arranging/.test(document.body.innerText);
  const tick = () => { const s = seen(); if (s && !window.__arr.shown) window.__arr.shown = performance.now(); if (!s && window.__arr.shown && !window.__arr.gone) { window.__arr.gone = performance.now(); return; } requestAnimationFrame(tick); };
  window.__arrTick = tick;
});
await btn.click();
await page.evaluate(() => { window.__arr.start = performance.now(); window.__arrTick(); });
await page.waitForFunction(() => window.__arr.gone, null, { timeout: 90000, polling: 50 });
const tm = await page.evaluate(() => window.__arr);
const ms = Math.round(tm.gone - tm.start);
await page.waitForTimeout(800);
const after = await rects();
if (process.env.CAPTURE_OUT) {
  const cap = await page.evaluate(() => ({ arrangeInput: window.__gtnhArrangeInput, judgeInput: window.__gtnhArrangeJudgeInput }));
  fs.writeFileSync(process.env.CAPTURE_OUT, JSON.stringify(cap));
}
const moved = after.filter((a) => { const b = before.find((r) => r.id === a.id); return !b || b.x !== a.x || b.y !== a.y; }).length;
const g = gaps(after.filter((r) => !r.note));
const near = (t) => g.filter((p) => p.g >= 0 && p.g < t);
console.log(`arrange ${ms} ms; moved ${moved}/${after.length}; overlaps ${g.filter((p) => p.g < 0).length}; pairs closer than 20px ${near(20).length}, than 40px ${near(40).length}; drawer pairs <20px ${near(20).filter((p) => p.dd).length}; min gap ${Math.min(...g.map((p) => p.g)).toFixed(0)}`);
console.log("closest:", JSON.stringify(g.filter((p) => p.g >= 0).sort((a, b) => a.g - b.g).slice(0, 6).map((p) => [p.a, p.b, p.g, p.dd ? "drawer" : ""])));
await page.getByRole("button", { name: "Fit", exact: true }).click();
await page.waitForTimeout(1000);
await page.screenshot({ path: OUT + "arrt-" + file.replace(".json", "") + ".png" });
await page.keyboard.press("Control+z");
await page.waitForTimeout(800);
const undone = await rects();
let diff = 0;
for (const b of before) { const u = undone.find((r) => r.id === b.id); if (!u || u.x !== b.x || u.y !== b.y) diff++; }
console.log("undo: cards not back at their exact position:", diff, "of", before.length);
await browser.close();
