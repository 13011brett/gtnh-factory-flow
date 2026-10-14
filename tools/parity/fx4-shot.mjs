import { boot, loadPlan, panTo, rectOf } from "./lib/app.mjs";
import { drawerPlan } from "./lib/plans.mjs";
const { browser, page } = await boot();
const ids = await loadPlan(page, drawerPlan);
for (const k of ["aniline","acid","methane"]) {
  await panTo(page, ids[k], 700, 300);
  await page.waitForTimeout(500);
  const r = await rectOf(page, `.react-flow__node[data-id="${ids[k]}"]`);
  await page.screenshot({ path: `C:/Users/jack/ff-fx4/tools/parity/out/fx4-${k}.png`, clip: { x: r.x-20, y: r.y-20, width: r.w+40, height: r.h+40 } });
}
await browser.close();
