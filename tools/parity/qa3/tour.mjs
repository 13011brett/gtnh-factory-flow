import { fresh, OUT } from "./lib.mjs";
const { browser, page, logs } = await fresh();
await page.getByRole("button", { name: "Take the tour" }).click();
await page.waitForTimeout(2500);
let i = 0;
const texts = [];
for (; i < 45; i++) {
  await page.screenshot({ path: OUT + `tour-${String(i).padStart(2, "0")}.png` });
  const t = await page.evaluate(() => { const c = document.querySelector("[data-tour=callout], .tour-callout, [class*=callout]"); return c ? c.innerText.replace(/\n/g, " | ").slice(0, 300) : "NO CALLOUT: " + document.querySelector(".tour-layer")?.innerText?.slice(0,200); });
  texts.push(`${i}: ${t}`);
  const next = page.getByRole("button", { name: /^(Next|Done|Finish)/ }).first();
  if (!(await next.isVisible().catch(() => false))) { await page.waitForTimeout(2500); if (!(await next.isVisible().catch(() => false))) { texts.push("no next button at " + i); break; } }
  await next.click().catch((e) => texts.push("click fail " + String(e).slice(0, 80)));
  await page.waitForTimeout(2800);
}
console.log(texts.join("\n"));
console.log(logs.filter(l => !/503|trailer|Hydration|script tag|404|ERR_ABORTED/.test(l)).join("\n"));
await browser.close();
