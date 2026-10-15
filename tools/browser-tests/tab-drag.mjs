// Drag check for the plan tabs against a running dev server (default http://localhost:3291).
// Opens five plans, drags one across the strip, checks the order, Escape, the keyboard and a reload,
// and leaves screenshots in TAB_DRAG_OUTPUT (default .tab-drag-results.local) to look at.
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright-core";

const base = process.env.TAB_DRAG_URL ?? "http://localhost:3291";
const output = path.resolve(process.env.TAB_DRAG_OUTPUT ?? ".tab-drag-results.local");
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 900, height: 500 } });
page.setDefaultTimeout(20000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

const names = () => page.$$eval(".mt-tab[data-design-id]", (tabs) => tabs.map((tab) => tab.querySelector(".mt-name")?.textContent));
const box = async (index) => (await page.locator(".mt-tab[data-design-id]").nth(index).boundingBox());
const shot = (name) => page.screenshot({ path: path.join(output, name + ".png"), clip: { x: 0, y: 0, width: 900, height: 120 } });

await page.goto(base);
await page.waitForSelector(".mt-plus");
await page.getByRole("button", { name: "Dismiss" }).click({ timeout: 8000 }).catch(() => undefined);
for (let i = 0; i < 4; i++) {
  await page.click(".mt-plus");
  await page.getByRole("menuitem", { name: "New plan" }).click();
  await page.waitForTimeout(400);
}
const count = (await names()).length;
assert.ok(count >= 5, "five tabs open");
for (let i = 0; i < count; i++) {
  const tab = page.locator(".mt-tab[data-design-id]").nth(i);
  await tab.focus();
  await page.keyboard.press("F2");
  await page.keyboard.type("Plan " + "ABCDEFGH"[i]);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(150);
}
const labels = await names();
await shot("1-start");

// Drag the first tab past the third.
const a = await box(0);
const c = await box(2);
await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
await page.mouse.down();
await page.mouse.move(a.x + a.width / 2 + 2, a.y + a.height / 2); // under the slop
assert.equal(await page.locator(".mt-tab[data-dragging]").count(), 0, "not picked up under 3 px");
await page.mouse.move(a.x + a.width / 2 + 40, a.y + a.height / 2, { steps: 4 });
assert.equal(await page.locator(".mt-tab[data-dragging]").count(), 1, "picked up past the slop");
await page.mouse.move(c.x + c.width / 2 + 10, a.y + a.height / 2, { steps: 12 });
await page.waitForTimeout(200);
await shot("2-mid-drag");
await page.mouse.up();
await page.waitForTimeout(500);
const after = await names();
console.log("after drag", after);
assert.deepEqual(after, [labels[1], labels[2], labels[0], ...labels.slice(3)], "first tab moved to third place");
await shot("3-dropped");

// Escape cancels.
const b = await box(0);
await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
await page.mouse.down();
await page.mouse.move(b.x + b.width / 2 + 150, b.y + b.height / 2, { steps: 10 });
await page.keyboard.press("Escape");
await page.mouse.up();
await page.waitForTimeout(400);
assert.deepEqual(await names(), after, "Escape leaves the order");
await shot("4-escaped");

// Keyboard: Ctrl+Shift+Right on the focused first tab.
await page.locator(".mt-tab[data-design-id]").nth(0).focus();
await page.keyboard.press("Control+Shift+ArrowRight");
await page.waitForTimeout(300);
assert.deepEqual(await names(), [after[1], after[0], ...after.slice(2)], "keyboard moved it one place right");
await shot("5-keyboard");

// A narrow strip: holding a tab at its right edge scrolls it, and the tab lands last.
await page.setViewportSize({ width: 360, height: 500 });
await page.waitForTimeout(300);
const strip = page.locator(".mt-strip");
const rect = await strip.boundingBox();
const head = await box(0);
const headName = (await names())[0];
await page.mouse.move(head.x + head.width / 2, head.y + head.height / 2);
await page.mouse.down();
await page.mouse.move(rect.x + rect.width - 8, head.y + head.height / 2, { steps: 12 });
await page.waitForTimeout(900);
const scrolled = await strip.evaluate((element) => element.scrollLeft);
assert.ok(scrolled > 20, "the strip scrolled while held at its edge: " + scrolled);
await shot("6-edge-scroll");
await page.mouse.up();
await page.waitForTimeout(500);
const ended = await names();
assert.equal(ended[ended.length - 1], headName, "dragged to the far end");
await shot("6b-landed");

// Saved with the browser.
const saved = ended;
await page.reload();
await page.waitForSelector(".mt-plus");
await page.waitForTimeout(800);
assert.deepEqual(await names(), saved, "order survives a reload");
await page.setViewportSize({ width: 900, height: 500 });
await shot("7-reloaded");

// A plain click still switches and middle-click still closes.
await page.locator(".mt-tab[data-design-id]").nth(1).click();
await page.waitForTimeout(300);
assert.equal(await page.locator(".mt-tab[data-design-id][data-active]").count(), 1);
const before = await names();
await page.locator(".mt-tab[data-design-id]").nth(count - 1).click({ button: "middle" });
await page.waitForTimeout(500);
assert.equal((await names()).length, before.length - 1, "middle-click closes");

await browser.close();
assert.deepEqual(errors, [], "no page errors");
console.log("ok");
