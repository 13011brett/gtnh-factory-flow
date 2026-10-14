import { chromium } from "playwright-core";
const b = await chromium.launch(); const p = await b.newPage();
p.on("console", async (m) => { if (m.type() === "error") console.log("ERR", m.text().slice(0, 1500)); });
p.on("pageerror", (e) => console.log("PAGEERR", String(e.stack ?? e).slice(0, 3500)));
await p.goto((process.env.PARITY_BASE ?? "http://localhost:3182") + "/", { waitUntil: "networkidle" });
await p.waitForTimeout(2000);
await b.close();
