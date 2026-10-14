// node tools/parity/fx6-measure.mjs "step|step" selector  -> rects in GUI px (device px / 2) of every match
import { chromium } from "playwright-core";
const BASE = process.env.PARITY_BASE ?? "http://localhost:3143";
const [, , steps = "", selector = "[data-mb]"] = process.argv;
const S = 1.17, D = 2 / S;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Math.round(1920 / D), height: 665 }, deviceScaleFactor: D });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("gtnh-factory-flow.mod-announcement-dismissed.v1", "x"); } catch {} });
await page.goto(BASE + "/dev/clean-card", { waitUntil: "networkidle", timeout: 180000 });
await page.waitForTimeout(2500);
for (const t of steps.split("|").filter(Boolean)) {
  if (t.startsWith("css=")) await page.locator(t.slice(4)).first().click();
  else if (t.startsWith("wait=")) await page.waitForTimeout(+t.slice(5));
  else await page.getByText(t).first().click();
  await page.waitForTimeout(700);
}
const rects = await page.evaluate(({ selector, k }) => [...document.querySelectorAll(selector)].map((el) => {
  const r = el.getBoundingClientRect();
  return { id: el.getAttribute("data-mb") ?? el.className?.toString().slice(0, 30) ?? el.tagName, x: +(r.x * k).toFixed(1), y: +(r.y * k).toFixed(1), w: +(r.width * k).toFixed(1), h: +(r.height * k).toFixed(1) };
}), { selector, k: 1 / 1.17 });
for (const r of rects) console.log(`${r.id.padEnd(14)} x=${r.x} y=${r.y} w=${r.w} h=${r.h}`);
await browser.close();
