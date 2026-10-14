// Quick look: node tools/parity/fx6-shot.mjs out.png [path] [clickText|clickText] ; viewport and dsf as the mod's 1920x1080 at GUI scale 2.
import { chromium } from "playwright-core";
const BASE = process.env.PARITY_BASE ?? "http://localhost:3143";
const [, , out = "tools/parity/out/fx6/a.png", path = "/dev/clean-card", clicks = ""] = process.argv;
const S = 1.17, D = 2 / S;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: Math.round(1920 / D), height: 740 }, deviceScaleFactor: D });
const page = await ctx.newPage();
await page.addInitScript(() => { try { localStorage.setItem("gtnh-factory-flow.mod-announcement-dismissed.v1", "x"); } catch {} });
page.on("pageerror", (e) => console.log("[pageerror]", String(e).slice(0, 300)));
page.on("console", (m) => { if (m.type() === "error") console.log("[console]", m.text().slice(0, 200)); });
await page.goto(BASE + (path.startsWith("/") ? path : "/"), { waitUntil: "networkidle", timeout: 180000 });
await page.waitForTimeout(2500);
for (const t of clicks.split("|").filter(Boolean)) { await page.getByText(t).first().click(); await page.waitForTimeout(1200); }
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: 1920 / D, height: 1080 / D } });
await browser.close();
