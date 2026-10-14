// Arrange on the real app: cards overlap? notes kept? undo restores?
import fs from "node:fs";
import { fresh, importText, toCode, OUT } from "./lib.mjs";
const FX = "C:/Users/jack/gtnh-planner-mod/.claude/worktrees/website-mod-backport-research-c84135/src/test/resources/";
const { browser, page } = await fresh();
await importText(page, toCode(fs.readFileSync(FX + "factory-flow/alumina-line-shared-reactor.json", "utf8")));
await page.waitForTimeout(8000);
await page.getByRole("button", { name: "Not now" }).click().catch(() => {});
const rects = () =>
  page.evaluate(() => [...document.querySelectorAll(".react-flow__node")].map((n) => { const r = n.getBoundingClientRect(); return { id: n.getAttribute("data-id").slice(0, 8), x: r.x, y: r.y, w: r.width, h: r.height, note: n.innerText.includes("keep") }; }));
const overlaps = (rs) => {
  let c = 0;
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) {
    const a = rs[i], b = rs[j];
    if (a.x < b.x + b.w - 2 && b.x < a.x + a.w - 2 && a.y < b.y + b.h - 2 && b.y < a.y + a.h - 2) c++;
  }
  return c;
};
await page.mouse.click(700, 100, { button: "right" });
await page.getByText("Add a sticky note").click();
await page.keyboard.type("keep me");
await page.mouse.click(1500, 900);
await page.waitForTimeout(500);
const before = await rects();
console.log("before arrange: nodes", before.length, "overlapping pairs", overlaps(before.filter((r) => !r.note)), "note", before.filter((r) => r.note).length);
await page.screenshot({ path: OUT + "arr-before.png" });
const t0 = Date.now();
await page.getByRole("button", { name: "Arrange", exact: true }).click();
await page.waitForFunction(() => true);
await page.waitForTimeout(6000);
const after = await rects();
console.log("after arrange: nodes", after.length, "overlapping pairs", overlaps(after.filter((r) => !r.note)), "note", after.filter((r) => r.note).length, "ms~", Date.now() - t0);
await page.getByRole("button", { name: "Fit", exact: true }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: OUT + "arr-after.png" });
await page.keyboard.press("Control+z");
await page.waitForTimeout(800);
const undone = await rects();
console.log("after ctrl+z: nodes", undone.length, "same first-card pos", Math.abs(undone[0].x - before[0].x) < 3 || "no");
await browser.close();
