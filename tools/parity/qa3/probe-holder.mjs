import { fresh } from "./lib.mjs";
const { browser, page } = await fresh();
await page.getByRole("button", { name: "Not now" }).click().catch(() => {});
await page.getByLabel("Add fluid tank", { exact: true }).click();
await page.waitForTimeout(1200);
console.log(await page.evaluate(() => {
  const c = document.querySelector(".react-flow__node .cc-card");
  const n = c.parentElement;
  const out = ["attrs " + [...n.attributes].map((a) => a.name).join(",")];
  out.push("before h=" + c.offsetHeight);
  n.removeAttribute("data-cv");
  out.push("no data-cv h=" + c.offsetHeight + " node h=" + n.offsetHeight);
  for (const sh of document.styleSheets) { try { for (const r of sh.cssRules) { if (r.selectorText && /cc-card|sp-card/.test(r.selectorText) && /height|contain/.test(r.cssText)) out.push(r.cssText.slice(0, 160)); } } catch {} }
  return out.join("\n");
}));
await browser.close();
