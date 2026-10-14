// Keyboard path: Tab through the real app, what takes focus, is it visible, do dialogs trap and restore focus.
import fs from "node:fs";
import { fresh, importText, toCode, OUT } from "./lib.mjs";
const FX = "C:/Users/jack/gtnh-planner-mod/.claude/worktrees/website-mod-backport-research-c84135/src/test/resources/";
const { browser, page } = await fresh();
await importText(page, toCode(fs.readFileSync(FX + "factory-flow/high-amperage-reactor.json", "utf8")));
await page.waitForTimeout(6000);
await page.getByRole("button", { name: "Not now" }).click().catch(() => {});
await page.mouse.click(900, 200);
const seq = [];
for (let i = 0; i < 40; i++) {
  await page.keyboard.press("Tab");
  const d = await page.evaluate(() => {
    const e = document.activeElement;
    if (!e) return null;
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    return {
      tag: e.tagName,
      label: (e.getAttribute("aria-label") || e.textContent || e.placeholder || "").trim().slice(0, 28),
      role: e.getAttribute("role"),
      outline: cs.outlineStyle + " " + cs.outlineWidth,
      shadow: cs.boxShadow !== "none",
      x: Math.round(r.x),
      y: Math.round(r.y),
    };
  });
  seq.push(JSON.stringify(d));
}
console.log(seq.join("\n"));
await page.screenshot({ path: OUT + "a11y-focus.png" });
// are top-bar keys reachable?
console.log(
  "top bar tabindexes:",
  await page.evaluate(() => [...document.querySelectorAll(".mb-key")].map((e) => e.getAttribute("aria-label") + ":" + e.getAttribute("tabindex")).join(" ")),
);
// dialog: Share to library, does focus move in?
await browser.close();
