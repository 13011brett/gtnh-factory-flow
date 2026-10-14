import fs from "node:fs";
import { fresh, importText, toCode, OUT } from "./lib.mjs";
const FX = "C:/Users/jack/gtnh-planner-mod/.claude/worktrees/website-mod-backport-research-c84135/src/test/resources/";
for (const [w, h] of [[1280, 720], [1024, 768], [2560, 1440]]) {
  const { browser, page } = await fresh({ w, h });
  await importText(page, toCode(fs.readFileSync(FX + "factory-flow/pa-cell-loop-plan.json", "utf8")));
  await page.waitForTimeout(6000);
  await page.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await page.waitForTimeout(500);
  console.log(w, h, "scrollW", await page.evaluate(() => document.documentElement.scrollWidth), "compact", await page.evaluate(() => document.documentElement.hasAttribute("data-compact")));
  await page.screenshot({ path: OUT + `sz-${w}.png` });
  await browser.close();
}
