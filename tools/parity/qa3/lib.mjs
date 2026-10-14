import { chromium } from "playwright-core";
export const BASE = process.env.PARITY_BASE ?? "http://localhost:3161";
export const OUT = "tools/parity/out/qa3/";
export async function open({ w = 1920, h = 1080, url = "/", storage = true, dsf = 1 } = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, acceptDownloads: true });
  await ctx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE }).catch(() => {});
  const page = await ctx.newPage();
  const logs = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 300)}`); });
  page.on("pageerror", (e) => logs.push("[pageerror] " + String(e).slice(0, 400)));
  page.on("requestfailed", (r) => logs.push("[reqfail] " + r.url().slice(0, 150) + " " + r.failure()?.errorText));
  page.on("response", (r) => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url().slice(0, 150)}`); });
  await page.goto(BASE + url, { waitUntil: "networkidle", timeout: 180000 });
  return { browser, ctx, page, logs };
}
import zlib from "node:zlib";
export const toCode = (t) => "gtnh1." + zlib.deflateRawSync(Buffer.from(t)).toString("base64url");
export async function importText(page, text) {
  await page.getByLabel("New plan", { exact: true }).first().click();
  await page.getByText("Paste plan").click();
  await page.locator("textarea").first().fill(text);
  await page.getByRole("button", { name: "Open", exact: true }).click();
}
export async function fresh(opts) {
  const o = await open(opts);
  await o.page.waitForTimeout(1500);
  await o.page.getByRole("button", { name: "Dismiss" }).click().catch(() => {});
  await o.page.getByRole("button", { name: "New design" }).click().catch(() => {});
  await o.page.waitForTimeout(600);
  return o;
}
