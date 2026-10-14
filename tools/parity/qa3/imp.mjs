import fs from "node:fs";
import { open, OUT, toCode, importText } from "./lib.mjs";
const FX = "C:/Users/jack/gtnh-planner-mod/.claude/worktrees/website-mod-backport-research-c84135/src/test/resources/";
const files = process.argv.slice(2);
for (const f of files) {
  const text = fs.readFileSync(f.startsWith("/") || f.includes(":") ? f : FX + f, "utf8");
  const name = f.split(/[\/]/).pop().replace(/\W+/g, "_");
  const { browser, page, logs } = await open();
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Dismiss" }).click().catch(()=>{});
  await page.getByRole("button", { name: "New design" }).click();
  await page.waitForTimeout(800);
  const t0 = Date.now();
  await importText(page, /^s*[{]/.test(text) ? toCode(text) : text);
  await page.waitForTimeout(8000);
  await page.screenshot({ path: OUT + `imp-${name}.png` });
  const body = await page.evaluate(() => document.body.innerText);
  fs.writeFileSync(OUT + `imp-${name}.txt`, body);
  console.log("==", f, Date.now() - t0, "ms; nodes:", await page.locator(".react-flow__node").count(), "edges:", await page.locator(".react-flow__edge").count());
  console.log(logs.filter(l => !/503|in-game-trailer|Hydration|script tag/.test(l)).join("\n"));
  await browser.close();
}
