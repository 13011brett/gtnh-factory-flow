import { boot, loadPlan, panTo, rectOf } from "./lib/app.mjs";
import { drawerPlan } from "./lib/plans.mjs";
const { browser, page } = await boot();
const ids = await loadPlan(page, drawerPlan);
for (const k of ["aniline","acid","methane"]) {
  await panTo(page, ids[k], 700, 300);
  await page.waitForTimeout(500);
  const r = await rectOf(page, `.react-flow__node[data-id="${ids[k]}"]`);
  await page.screenshot({ path: `tools/parity/out/fx4-${k}.png`, clip: { x: r.x-20, y: r.y-20, width: r.w+40, height: r.h+40 } });
  if (k === "aniline") {
    await page.locator(`.react-flow__node[data-id="${ids[k]}"] .cd-key`).click();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `tools/parity/out/fx4-menu.png`, clip: { x: r.x-20, y: r.y-20, width: 300, height: 260 } });
    await page.keyboard.press("Escape"); await page.mouse.click(1500,900);
    await page.mouse.move(r.x + 60, r.y + 4);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `tools/parity/out/fx4-bartip.png`, clip: { x: r.x-20, y: r.y-20, width: 360, height: 220 } });
  }
}
await browser.close();
