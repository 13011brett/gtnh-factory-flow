// FIX-B: screenshots of the panels around the board (offer, recipe overlay, items column, welcome, paste, share).
import { fresh, open, OUT } from "./lib.mjs";
const which = process.argv[2] ?? "overlay";
if (which === "overlay") {
  const { browser, page, logs } = await fresh();
  await page.waitForTimeout(3500);
  await page.mouse.click(1735, 335);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: OUT + "fixb-overlay.png" });
  console.log(logs.filter((l) => !/503|trailer|Hydration|script tag/.test(l)).join("\n"));
  await browser.close();
}
if (which === "welcome") {
  const { browser, page } = await open();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: OUT + "fixb-welcome.png" });
  await browser.close();
}
if (which === "paste") {
  const { browser, page } = await fresh();
  await page.getByLabel("New plan", { exact: true }).first().click();
  await page.getByText("Paste plan").click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + "fixb-paste.png" });
  await browser.close();
}
if (which === "share") {
  const { browser, page } = await fresh();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + "fixb-sharemenu.png", clip: { x: 1300, y: 0, width: 620, height: 160 } });
  await page.getByText("Share to library...").click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + "fixb-share.png" });
  await browser.close();
}
if (which === "column") {
  const { browser, page } = await fresh();
  await page.getByRole("button", { name: "Not now" }).click().catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: OUT + "fixb-column.png", clip: { x: 1500, y: 0, width: 420, height: 1080 } });
  await page.getByLabel("Sort results").click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + "fixb-column-menu.png", clip: { x: 1300, y: 100, width: 620, height: 500 } });
  await browser.close();
}
if (which === "welcomepage") {
  const { browser, page } = await open();
  await page.waitForTimeout(2000);
  await page.getByRole("button", { name: "Dismiss" }).click().catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + "fixb-welcomepage.png" });
  await browser.close();
}
