// The holder cards (custom rate, fluid tank, crop farm) as element shots with sizes.
import { fresh, OUT } from "./lib.mjs";
const { browser, page } = await fresh({ dsf: 2 });
await page.getByRole("button", { name: "Not now" }).click().catch(() => {});
for (const label of ["Add custom rate node", "Add fluid tank", "Add crop farm"]) {
  await page.getByLabel(label, { exact: true }).click();
  await page.waitForTimeout(1200);
}
await page.getByRole("button", { name: "Fit", exact: true }).click();
await page.waitForTimeout(1200);
const nodes = page.locator(".react-flow__node");
const n = await nodes.count();
for (let i = 0; i < n; i++) {
  const card = nodes.nth(i).locator(".cc-card").first();
  const b = await card.boundingBox();
  const parts = await card.evaluate((c) => ({ css: Object.fromEntries(["width", "height"].map((k) => [k, getComputedStyle(c)[k]])), kids: [...c.children].map((k) => k.className + " " + Math.round(k.getBoundingClientRect().height)) }));
  console.log(i, JSON.stringify(b), JSON.stringify(parts));
  await card.screenshot({ path: OUT + `holder-${i}.png` });
}
await browser.close();
