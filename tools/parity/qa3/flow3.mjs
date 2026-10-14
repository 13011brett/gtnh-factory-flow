import fs from "node:fs";
import { fresh, importText, toCode, OUT } from "./lib.mjs";
const FX = "C:/Users/jack/gtnh-planner-mod/.claude/worktrees/website-mod-backport-research-c84135/src/test/resources/";
const { browser, page, logs } = await fresh();
const shot = (n, clip) => page.screenshot({ path: OUT + `f3-${n}.png`, ...(clip?{clip}:{}) });
await importText(page, toCode(fs.readFileSync(FX + "factory-flow/high-amperage-reactor.json", "utf8")));
await page.waitForTimeout(6000);
await page.getByRole("button", { name: "Not now" }).click().catch(()=>{});
const vp = () => page.evaluate(() => document.querySelector(".react-flow__viewport")?.style.transform);
console.log("vp0", await vp());
await page.mouse.move(1000, 300); await page.mouse.wheel(0, -300); await page.waitForTimeout(500);
console.log("wheel up", await vp());
await page.mouse.wheel(0, 900); await page.waitForTimeout(500);
console.log("wheel down", await vp());
// ctrl+wheel
await page.keyboard.down("Control"); await page.mouse.wheel(0, -300); await page.keyboard.up("Control"); await page.waitForTimeout(500);
console.log("ctrl wheel", await vp());
// pan by dragging empty board
await page.mouse.move(1000, 300); await page.mouse.down(); await page.mouse.move(1100, 350, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(400);
console.log("pan", await vp());
// minimap click
await page.mouse.click(1420, 830); await page.waitForTimeout(600);
console.log("minimap click", await vp());
// sticky note
await page.mouse.click(800, 250, { button: "right" }); await page.waitForTimeout(300);
await page.getByText("Add a sticky note").click(); await page.waitForTimeout(500);
await page.keyboard.type("Remember: check coil tier"); await page.waitForTimeout(300);
await page.mouse.click(1000, 900); await page.waitForTimeout(500);
await shot("note");
// arrange
await page.getByRole("button", { name: "Arrange", exact: true }).click(); await page.waitForTimeout(3000);
await shot("arranged");
console.log("after arrange", await vp());
// make a drawer by dragging the output port out to empty board
const out = page.locator(".react-flow__node .cc-rail").nth(1).locator(".cc-row").first();
const ob = await out.boundingBox(); console.log("out port", JSON.stringify(ob));
console.log(logs.filter(l => !/503|trailer|Hydration|script tag|404|ERR_ABORTED/.test(l)).join("\n"));
await browser.close();
