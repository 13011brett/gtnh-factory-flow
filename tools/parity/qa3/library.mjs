// Library on the real app: close a tab (kept), reopen from My plans, rename, delete asks first, Open a plan menu.
import fs from "node:fs";
import { fresh, importText, toCode, OUT } from "./lib.mjs";
const FX = "C:/Users/jack/gtnh-planner-mod/.claude/worktrees/website-mod-backport-research-c84135/src/test/resources/";
const { browser, page, logs } = await fresh();
await importText(page, toCode(fs.readFileSync(FX + "factory-flow/high-amperage-reactor.json", "utf8")));
await page.waitForTimeout(6000);
await page.getByRole("button", { name: "Not now" }).click().catch(() => {});
const s = (n) => page.screenshot({ path: OUT + `lib-${n}.png` });
const tabs = () => page.evaluate(() => [...document.querySelectorAll(".mt-tab")].map((t) => t.textContent.trim().slice(0, 20)));
console.log("tabs", JSON.stringify(await tabs()));
// close the plan tab
const tab = page.locator(".mt-tab").filter({ hasText: "Benzene" }).first();
console.log("tab count", await tab.count());
await tab.hover();
await page.waitForTimeout(400);
await s("tab-hover");
await tab.click({ button: "middle" });
await page.waitForTimeout(1000);
console.log("tabs after close", JSON.stringify(await tabs()));
await page.getByRole("button", { name: "Library", exact: true }).click();
await page.waitForTimeout(1200);
await s("shelf");
console.log(await page.evaluate(() => document.body.innerText.slice(0, 600).replace(/\n/g, " | ")));
// reopen
await page.getByText("Benzene", { exact: false }).first().click();
await page.waitForTimeout(1500);
await s("reopened");
console.log("nodes after reopen", await page.locator(".react-flow__node").count(), "tabs", JSON.stringify(await tabs()));
// tab right-click menu
await page.locator(".mt-tab").filter({ hasText: "Benzene" }).first().click({ button: "right" });
await page.waitForTimeout(600);
await s("tab-menu");
console.log(logs.filter((l) => !/503|trailer|Hydration|script tag|404|ERR_ABORTED/.test(l)).join("\n"));
await browser.close();
