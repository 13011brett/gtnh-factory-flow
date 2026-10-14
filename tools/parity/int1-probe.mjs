import { chromium } from "playwright-core";
const BASE = process.env.PARITY_BASE ?? "http://localhost:3151";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("gtnh-factory-flow.mod-announcement-dismissed.v1", "x"); } catch {} });
await page.goto(`${BASE}/dev/clean-card`, { waitUntil: "networkidle", timeout: 240000 });
await page.waitForFunction(() => window.__ccStore?.getState().dataset, null, { timeout: 240000 });
await page.waitForTimeout(1500);
const out = await page.evaluate(() => ({
  keys: [...document.querySelectorAll(".mb-key")].map((e) => [e.getAttribute("data-mb"), e.getAttribute("aria-label"), e.textContent]),
  tabs: [...document.querySelectorAll(".mt-tab, .mt-plus, [data-design-id]")].map((e) => [e.className, e.getAttribute("data-design-id"), e.getAttribute("aria-label"), (e.textContent||"").slice(0,30)]),
  topInputs: [...document.querySelectorAll("input")].map((e) => e.placeholder),
  buttons: [...document.querySelectorAll("button")].slice(0,40).map((e) => e.getAttribute("aria-label") || e.textContent?.slice(0,20)),
}));
console.log(JSON.stringify(out, null, 1));
await page.screenshot({ path: process.env.TEMP + "/int1-probe.png" });
await browser.close();
