// FIX-A: compact mode checks at phone, tablet and the in-between window.
import fs from "node:fs";
import { fresh, importText, toCode, OUT } from "./lib.mjs";
const FX = "C:/Users/jack/gtnh-planner-mod/.claude/worktrees/website-mod-backport-research-c84135/src/test/resources/";
const sizes = (process.env.SIZES ?? "390x844,1024x768,820x1180").split(",").map((s) => s.split("x").map(Number));
for (const [w, h] of sizes) {
  const { browser, page, logs } = await fresh({ w, h });
  await importText(page, toCode(fs.readFileSync(FX + "factory-flow/pa-cell-loop-plan.json", "utf8")));
  await page.waitForTimeout(6000);
  await page.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await page.waitForTimeout(1500);
  const probe = () =>
    page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      innerW: innerWidth,
      compact: document.documentElement.hasAttribute("data-compact"),
      modBar: !!document.querySelector(".mb"),
      oldToolbars: document.querySelectorAll("[aria-label='Paint cards'],[aria-label='Markup tools'],[aria-label='Checklist mode'],[aria-label='Open the menu']").length,
      drawers: [...document.querySelectorAll("[data-overview-rail],.rail,[aria-label='Overview']")].length,
      tabs: [...document.querySelectorAll(".mt-tab")].map((t) => t.textContent.trim()).join("|"),
      plus: !!document.querySelector(".mt-plus"),
      cards: document.querySelectorAll(".react-flow__node").length,
    }));
  console.log(`== ${w}x${h}`, JSON.stringify(await probe()));
  await page.screenshot({ path: OUT + `fixa-c-${w}-board.png` });
  for (const id of ["drawer-side", "drawer-items"]) {
    const k = page.locator(`[data-mb="${id}"]`);
    if (await k.count()) {
      await k.click();
      await page.waitForTimeout(700);
      await page.screenshot({ path: OUT + `fixa-c-${w}-${id}.png` });
    }
  }
  console.log("after drawers", JSON.stringify(await probe()));
  console.log(logs.filter((l) => !/favicon/.test(l)).slice(0, 6).join("\n"));
  await browser.close();
}
