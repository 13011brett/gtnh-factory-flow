// Spawn keys (Power, Custom, Tank, Farm), the items tabs (Placed, CropsNH, Bees) and a sort option.
import { fresh, OUT } from "./lib.mjs";
const { browser, page, logs } = await fresh();
await page.getByRole("button", { name: "Not now" }).click().catch(() => {});
const nodes = () => page.locator(".react-flow__node").count();
const s = (n) => page.screenshot({ path: OUT + `sp-${n}.png` });
for (const [label, name] of [["Add custom rate node", "custom"], ["Add fluid tank", "tank"], ["Add crop farm", "farm"]]) {
  const n0 = await nodes();
  await page.getByLabel(label, { exact: true }).click();
  await page.waitForTimeout(1500);
  console.log(name, "nodes", n0, "->", await nodes());
}
await page.getByRole("button", { name: "Fit", exact: true }).click();
await page.waitForTimeout(1000);
await s("spawned");
await page.getByLabel("Place a generator", { exact: true }).click();
await page.waitForTimeout(1500);
await s("power-picker");
await page.keyboard.press("Escape");
for (const tab of ["Placed", "CropsNH", "Bees", "Items", "Fluids"]) {
  await page.getByRole("button", { name: tab, exact: true }).click();
  await page.waitForTimeout(1500);
  const names = await page.evaluate(() => [...document.querySelectorAll("aside[data-help-anchor=browser] [role=option]")].slice(0, 5).map((e) => e.getAttribute("aria-label") || e.textContent.trim()).join(", "));
  console.log(tab, "->", names || "(empty)");
  await s("tab-" + tab);
}
console.log(logs.filter((l) => !/503|trailer|Hydration|script tag|404|ERR_ABORTED/.test(l)).join("\n"));
await browser.close();
