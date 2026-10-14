import { boot, loadPlan, panTo } from "./lib/app.mjs";
import { drawerPlan } from "./lib/plans.mjs";
const { browser, page } = await boot();
const ids = await loadPlan(page, drawerPlan);
await panTo(page, ids.aniline, 700, 300);
const up = () => page.evaluate(() => [...document.querySelectorAll("div.fixed.pointer-events-none.border-2, .tp")].some(e=>e.getBoundingClientRect().width>0));
const t = async (label, loc) => {
  await page.mouse.move(1000,1040); await page.waitForTimeout(600); const pre = await up(); if (pre) console.log(label, "(stale tip before)");
  const b = await loc.first().boundingBox();
  if(!b){console.log(label,"missing");return;}
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2);
  const t0=Date.now(); let first=null;
  for(let i=0;i<80&&first===null;i++){ if(await up()) first=Date.now()-t0; else await page.waitForTimeout(20); }
  console.log(label, first);
};
await t("share", page.locator('[aria-label="Share this setup"]'));
await t("screenshot", page.locator('[aria-label="Screenshot"]'));
await t("settings", page.locator('[aria-label="Open settings"]'));
await t("undo", page.locator('[aria-label="Undo"]'));
await t("tab", page.getByText("Untitled design").first());
await t("drawer key", page.locator(`.react-flow__node[data-id="${ids.aniline}"] .cd-key`));
await t("drawer box", page.locator(`.react-flow__node[data-id="${ids.aniline}"] .cd-box`));
await t("rail Set", page.locator('.rail-box').first());
await t("fit button", page.locator('[aria-label="Fit the plan on the screen"]'));
await browser.close();
