import fs from "node:fs";
import { fresh, importText, toCode, OUT } from "./lib.mjs";
const FX = "C:/Users/jack/gtnh-planner-mod/.claude/worktrees/website-mod-backport-research-c84135/src/test/resources/";
const { browser, page } = await fresh();
await importText(page, toCode(fs.readFileSync(FX + "factory-flow/alumina-line-shared-reactor.json", "utf8")));
await page.waitForTimeout(8000);
await page.getByRole("button", { name: "Not now" }).click().catch(() => {});
console.log(await page.evaluate(() => {
  const rows = [...document.querySelectorAll(".rail-row")];
  const out = [];
  rows.forEach((r, i) => {
    const name = r.querySelector(".rail-name");
    if (name && !name.textContent.trim()) out.push(i + ": " + r.outerHTML.slice(0, 700));
    else if (!name && r.querySelector(".rail-controls") && !r.querySelector(".rail-tier")) out.push(i + " (no name el): " + r.outerHTML.slice(0, 500));
  });
  return rows.length + " rows, " + out.length + " nameless\n" + out.slice(0, 3).join("\n\n");
}));
await browser.close();
