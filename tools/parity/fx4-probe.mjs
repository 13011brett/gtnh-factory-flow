import { boot, loadPlan, panTo } from "./lib/app.mjs";
import { drawerPlan } from "./lib/plans.mjs";
const { browser, page } = await boot();
const ids = await loadPlan(page, drawerPlan);
await panTo(page, ids.aniline, 900, 400);
await page.waitForTimeout(500);
const sel = `.react-flow__node[data-id="${ids.aniline}"]`;
const b = await page.locator(sel + " .cd-bar").boundingBox();
const cx = b.x + b.width/2, cy = b.y + b.height/2;
for (const d of [2,3,4,6,10]) {
  await page.mouse.click(1300, 800);
  await page.mouse.move(cx, cy); await page.mouse.down();
  await page.mouse.move(cx + d, cy, {steps: 3});
  const mid = await page.evaluate((s)=>{const n=document.querySelector(s); return {cls:n.className.replace(/react-flow__node-?/g,"").trim(), tf:n.style.transform};}, sel);
  await page.mouse.up();
  const end = await page.evaluate((s)=>{const n=document.querySelector(s); return {cls:n.className.trim().slice(-40), tf:n.style.transform};}, sel);
  console.log(d, JSON.stringify(mid), JSON.stringify(end));
}
await browser.close();
