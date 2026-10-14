import { chromium } from "playwright-core";
const BASE = process.env.PARITY_BASE ?? "http://localhost:3191";
const browser = await chromium.launch();
for (const [w, h] of [[1920, 1080], [390, 844]]) {
  const page = await (await browser.newContext({ viewport: { width: w, height: h } })).newPage();
  const logs = [];
  page.on("console", (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 200)}`));
  page.on("pageerror", (e) => logs.push("[pageerror] " + String(e).slice(0, 200)));
  await page.goto(BASE + "/", { waitUntil: "networkidle", timeout: 180000 });
  await page.waitForTimeout(3000);
  const bad = logs.filter((l) => /hydrat|did not match|pageerror/i.test(l));
  console.log(`${w}x${h}: ${bad.length ? bad.join("\n") : "no hydration or page errors"}`);
}
await browser.close();
