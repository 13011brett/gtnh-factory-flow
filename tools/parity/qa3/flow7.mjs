// A first-time user builds by hand: add two recipes from the items list, wire by dragging a port, pin a count, make a drawer.
import { fresh, OUT } from "./lib.mjs";
const { browser, page, logs } = await fresh();
await page.getByRole("button", { name: "Not now" }).click().catch(() => {});
const s = (n) => page.screenshot({ path: OUT + `f7-${n}.png` });
await page.getByText("Benzene", { exact: true }).first().click();
await page.waitForTimeout(2500);
await page.mouse.click(917, 458);
await page.waitForTimeout(4500);
await page.keyboard.press("Escape");
await page.waitForTimeout(600);
await page.getByPlaceholder("Search item or fluid...").fill("Nitrobenzene");
await page.waitForTimeout(2000);
await page.getByText("Nitrobenzene", { exact: true }).first().click();
await page.waitForTimeout(2500);
await page.mouse.click(917, 431);
await page.waitForTimeout(4500);
await page.getByRole("button", { name: "Fit", exact: true }).click();
await page.waitForTimeout(1200);
const rows = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".react-flow__node")].map((n) => ({
      id: n.getAttribute("data-id").slice(0, 12),
      rows: [...n.querySelectorAll(".cc-row")].map((r) => {
        const b = r.getBoundingClientRect();
        return [r.querySelector(".cc-pname")?.textContent, Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)];
      }),
    })),
  );
const info = await rows();
console.log(JSON.stringify(info));
const edges = () => page.locator(".react-flow__edge").count();
console.log("edges before", await edges());
const find = (nodeIdx, name) => info[nodeIdx].rows.find((r) => r[0] === name);
// the card that makes Benzene is the one with a Benzene OUTPUT (x > node centre)
const maker = info.findIndex((n) => n.rows.some((r) => r[0] === "Benzene" && r[1] > 950));
const user = info.findIndex((n) => n.rows.some((r) => r[0] === "Benzene" && r[1] < 950));
const out = find(maker, "Benzene");
const inp = find(user, "Benzene");
console.log("maker", maker, "user", user, out, inp);
await page.mouse.move(out[1], out[2]);
await page.mouse.down();
await page.mouse.move((out[1] + inp[1]) / 2, (out[2] + inp[2]) / 2, { steps: 6 });
await page.mouse.move(inp[1], inp[2], { steps: 10 });
await page.waitForTimeout(500);
await s("wire-in-hand");
await page.mouse.up();
await page.waitForTimeout(1500);
console.log("edges after wiring", await edges());
await s("wired");
// pin the user card's count to 2
await page.locator(".react-flow__node").nth(user).locator(".cc-count").click();
await page.keyboard.type("2");
await page.keyboard.press("Enter");
await page.waitForTimeout(3000);
await s("pinned");
console.log("rail:", await page.evaluate(() => document.querySelector(".rail-root").innerText.replace(/\n/g, " | ")));
// drag Nitrobenzene output to empty board
const info2 = await rows();
const nb = info2[user].rows.find((r) => r[0] === "Nitrobenzene");
await page.mouse.move(nb[1], nb[2]);
await page.mouse.down();
await page.mouse.move(nb[1] + 150, nb[2] - 100, { steps: 8 });
await page.waitForTimeout(400);
await s("drawer-drag");
await page.mouse.up();
await page.waitForTimeout(1500);
await s("drawer-made");
console.log("nodes", await page.locator(".react-flow__node").count());
console.log(logs.filter((l) => !/503|trailer|Hydration|script tag|404|ERR_ABORTED/.test(l)).join("\n"));
await browser.close();
