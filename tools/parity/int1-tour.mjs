// INT1: walks the whole guided tour with window.__tour at one UI scale and prints every warning.
//   PARITY_BASE=http://localhost:3151 node tools/parity/int1-tour.mjs [scalePercent=100] [width=1920] [height=1080]
import { chromium } from "playwright-core";

const BASE = process.env.PARITY_BASE ?? "http://localhost:3151";
const scale = Number(process.argv[2] ?? 100);
const width = Number(process.argv[3] ?? 1920);
const height = Number(process.argv[4] ?? 1080);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "no-preference" });
const page = await ctx.newPage();
await page.addInitScript((scale) => {
  try {
    localStorage.setItem("gtnh-factory-flow.mod-announcement-dismissed.v1", "x");
    localStorage.setItem("gtnh-factory-flow.ui-scale.v1", String(scale));
    localStorage.setItem("gtnhplanner.tour.offered", "1");
  } catch {}
}, scale);
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => {
  if (m.type() === "warning" || m.type() === "error") {
    const t = m.text();
    if (/tour/i.test(t)) console.log(`[console.${m.type()}]`, t.slice(0, 300));
  }
});
await page.goto(`${BASE}/dev/clean-card`, { waitUntil: "networkidle", timeout: 240000 });
await page.waitForFunction(() => window.__ccStore?.getState().dataset && window.__tour, null, { timeout: 240000 });
await page.waitForTimeout(1500);
await page.getByText("Untitled design").first().click().catch(() => undefined);
await page.waitForTimeout(500);
await page.evaluate(() => window.__tour.start());
const t0 = Date.now();
let last = -1;
let since = Date.now();
for (;;) {
  const st = await page.evaluate(() => window.__tour.status());
  if (st.phase === "idle" && Date.now() - t0 > 3000) break;
  if (st.index !== last) {
    console.log(`step ${st.index + 1}/${st.total} phase=${st.phase} warnings=${st.warnings.length}`);
    last = st.index;
    since = Date.now();
  }
  if (st.phase === "waiting") {
    await page.evaluate(() => window.__tour.next());
    await page.waitForTimeout(250);
  } else {
    await page.waitForTimeout(250);
  }
  if (Date.now() - since > 90_000) {
    console.log("STUCK at step", st.index + 1, st.phase);
    break;
  }
  if (Date.now() - t0 > 25 * 60_000) break;
}
const final = await page.evaluate(() => window.__tour.status());
console.log(JSON.stringify({ scale, width, height, warnings: final.warnings }, null, 1));
await browser.close();
