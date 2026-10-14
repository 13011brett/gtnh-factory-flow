// FIX-B: New design on Welcome reuses the empty Untitled design tab.
import { open } from "./lib.mjs";
const { browser, page, logs } = await open();
await page.waitForTimeout(2000);
await page.getByRole("button", { name: "Dismiss" }).click().catch(() => {});
console.log("tabs before:", await page.locator(".mt-tab").allInnerTexts());
await page.getByRole("button", { name: "New design" }).click();
await page.waitForTimeout(1200);
console.log("tabs after:", await page.locator(".mt-tab").allInnerTexts());
await page.getByLabel("New plan", { exact: true }).first().click();
await page.getByText("New plan", { exact: true }).click();
await page.waitForTimeout(800);
console.log("after + New plan:", await page.locator(".mt-tab").allInnerTexts());
console.log(logs.filter((l) => !/503|trailer|Hydration|script tag/.test(l)).join("\n"));
await browser.close();
