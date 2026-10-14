// Quick look: node tools/parity/fx6-shot.mjs out.png [path] "step|step..." ; viewport and dsf as the mod's 1920x1080 at GUI scale 2.
// Steps: text (click the first element with that text), css=<selector> (click), rclick=<selector>, move=<selector>, wait=<ms>,
// key=<key>, js=<code> (evaluated in the page), type=<text>.
import { chromium } from "playwright-core";
import { loadPlan } from "./lib/app.mjs";
import * as plans from "./lib/plans.mjs";
const BASE = process.env.PARITY_BASE ?? "http://localhost:3143";
const [, , out = "tools/parity/out/fx6/a.png", path = "/dev/clean-card", clicks = ""] = process.argv;
const S = 1.17, D = 2 / S;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Math.round(1920 / D), height: 665 }, deviceScaleFactor: D });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("gtnh-factory-flow.mod-announcement-dismissed.v1", "x"); } catch {} });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error" && !/HiGHS|503|404|highs/.test(m.text())) console.log("[console]", m.text().slice(0, 200)); });
await page.goto(BASE + (path.startsWith("/") ? path : "/"), { waitUntil: "networkidle", timeout: 180000 });
await page.waitForTimeout(2500);
for (const t of clicks.split("|").filter(Boolean)) {
  if (t.startsWith("css=")) await page.locator(t.slice(4)).first().click();
  else if (t.startsWith("rclick=")) await page.locator(t.slice(7)).first().click({ button: "right" });
  else if (t.startsWith("move=")) await page.locator(t.slice(5)).first().hover();
  else if (t.startsWith("wait=")) await page.waitForTimeout(+t.slice(5));
  else if (t.startsWith("key=")) await page.keyboard.press(t.slice(4));
  else if (t.startsWith("type=")) await page.keyboard.type(t.slice(5));
  else if (t.startsWith("js=")) console.log(JSON.stringify(await page.evaluate(t.slice(3))));
  else if (t.startsWith("plan=")) {
    await page.waitForFunction(() => window.__ccStore?.getState().dataset, null, { timeout: 180000 });
    await loadPlan(page, plans[t.slice(5)]);
    await page.evaluate(() => { window.__ccStore.getState().frameBoardNodes?.(); });
  }
  else await page.getByText(t).first().click();
  await page.waitForTimeout(900);
}
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1920 / D, height: 1080 / D } });
await browser.close();
