// Card geometry on the ref chain: sizes, head, row centres vs the 20 px grid (flow px). node tools/parity/qa3/geom.mjs
import { boot, loadPlan } from "../lib/app.mjs";
import { refChain } from "../lib/plans.mjs";
import { OUT } from "./lib.mjs";
const { browser, page } = await boot({ dsf: 2 });
const ids = await loadPlan(page, refChain);
await page.waitForTimeout(2500);
const info = await page.evaluate(() =>
  [...document.querySelectorAll(".react-flow__node .cc-card")].map((c) => {
    const r = c.getBoundingClientRect();
    const k = r.width / 320;
    const rows = [...c.querySelectorAll("[data-resource-edge-anchor]")].map((e) => {
      const b = e.getBoundingClientRect();
      return Math.round(((b.top + b.height / 2 - r.top) / k) * 10) / 10;
    });
    const head = c.querySelector(".cc-head")?.getBoundingClientRect().height / k;
    return { name: c.querySelector(".cc-name")?.textContent, w: Math.round(r.width / k), h: Math.round((r.height / k) * 10) / 10, head: Math.round(head), rows };
  }),
);
for (const c of info) console.log(JSON.stringify(c));
const el = page.locator(".react-flow__node .cc-card").first();
await el.screenshot({ path: OUT + "geom-card.png" });
await page.screenshot({ path: OUT + "geom-board.png" });
await browser.close();
