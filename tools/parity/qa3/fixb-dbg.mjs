import { fresh, OUT } from "./lib.mjs";
const { browser, page } = await fresh();
await page.getByRole("button", { name: "Not now" }).click().catch(() => {});
await page.getByLabel("Sort results").click();
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + "fixb-dbg.png" });
console.log(await page.evaluate(() => { const m = document.querySelector("[data-mod-menu]"); const c = getComputedStyle(m); return JSON.stringify([c.opacity, c.visibility, c.display, c.position, c.zIndex, c.transform, c.left, c.top, m.innerText.slice(0,40)]); }));
await browser.close();
