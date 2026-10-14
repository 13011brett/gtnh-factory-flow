import fs from "node:fs";
import { fresh, importText, toCode, OUT } from "./lib.mjs";
const FX = "C:/Users/jack/gtnh-planner-mod/.claude/worktrees/website-mod-backport-research-c84135/src/test/resources/";
const { browser, page, logs } = await fresh();
const shot = (n) => page.screenshot({ path: OUT + `f2-${n}.png` });
await importText(page, toCode(fs.readFileSync(FX + "factory-flow/high-amperage-reactor.json", "utf8")));
await page.waitForTimeout(6000);
await page.getByRole("button", { name: "Not now" }).click().catch(()=>{});
const card = page.locator(".react-flow__node").filter({ has: page.locator(".cc-name") }).first();
const nodes = () => page.evaluate(() => [...document.querySelectorAll(".react-flow__node")].map(n => { const r = n.getBoundingClientRect(); return [n.getAttribute("data-id").slice(0, 10), Math.round(r.x), Math.round(r.y)]; }));
console.log("start", JSON.stringify(await nodes()));
// drag the card by its header
const hb = await card.locator(".cc-head").boundingBox();
await page.mouse.move(hb.x + 120, hb.y + 15); await page.mouse.down(); await page.mouse.move(hb.x + 200, hb.y + 100, { steps: 8 }); await page.mouse.up();
await page.waitForTimeout(500);
console.log("after drag", JSON.stringify(await nodes()));
await page.keyboard.press("Control+z"); await page.waitForTimeout(600);
console.log("after ctrl+z", JSON.stringify(await nodes()));
await page.keyboard.press("Control+y"); await page.waitForTimeout(600);
console.log("after ctrl+y", JSON.stringify(await nodes()));
await page.keyboard.press("Control+Shift+z"); await page.waitForTimeout(300);
// undo / redo buttons
await page.getByLabel("Undo", {exact:true}).first().click().catch(e=>console.log("undo btn", String(e).slice(0,80)));
await page.waitForTimeout(500);
console.log("after undo btn", JSON.stringify(await nodes()));
// wheel zoom
await page.mouse.move(900, 600); await page.mouse.wheel(0, -400); await page.waitForTimeout(600);
await shot("zoomed-in");
await page.mouse.wheel(0, 1200); await page.waitForTimeout(600);
await shot("zoomed-out");
await page.getByRole("button", { name: "Fit", exact: true }).click(); await page.waitForTimeout(900);
await shot("fit");
// right click empty board
await page.mouse.click(1000, 800, { button: "right" }); await page.waitForTimeout(500);
await shot("ctxmenu");
console.log(await page.evaluate(() => [...document.querySelectorAll("[role=menu] *")].filter(e=>e.children.length==0).map(e=>e.textContent.trim()).join(" | ")));
console.log(logs.filter(l => !/503|trailer|Hydration|script tag|404|ERR_ABORTED/.test(l)).join("\n"));
await browser.close();
