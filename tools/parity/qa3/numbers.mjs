// Imports each corpus plan on the real app (/) and compares every card's count with the mod's golden machineCounts.
//   node tools/parity/qa3/numbers.mjs [name-regex]
import fs from "node:fs";
import { fresh, importText, toCode, OUT } from "./lib.mjs";
const T = "C:/Users/jack/gtnh-planner-mod/.claude/worktrees/website-mod-backport-research-c84135/src/test/resources/";
const R = T + "solver-corpus/";
const MAP = { "alumina-line-shared-reactor.json": "alumina-line-shared-reactor.json", "pa-cell-loop-plan.json": "pa-cell-loop.json", "titanium-line-chembath.slim.json": "titanium-line-chembath.json", "titanium-line-posted-alpha5.json": "titanium-line-chembath.json" };
const re = new RegExp(process.argv[2] ?? ".");
const names = fs.readdirSync(T + "factory-flow/").filter((f) => f.endsWith(".json") && re.test(f));
const results = {};
for (const f of names) {
  const text = fs.readFileSync(T + "factory-flow/" + f, "utf8");
  const gp = R + "goldens/" + (MAP[f] ?? "none");
  if (!fs.existsSync(gp)) continue;
  const golden = JSON.parse(fs.readFileSync(gp, "utf8"));
  const counts = golden.solution?.machineCounts ?? {};
  const { browser, page, logs } = await fresh();
  const t0 = Date.now();
  let err;
  try {
    await importText(page, toCode(text));
    await page.waitForSelector(".react-flow__node", { timeout: 30000 });
    await page.waitForTimeout(9000);
  } catch (e) {
    err = String(e).slice(0, 200);
  }
  const got = await page.evaluate(() => {
    const out = {};
    for (const n of document.querySelectorAll(".react-flow__node")) {
      const id = (n.getAttribute("data-id") ?? "").replace(/^node-/, "");
      const c = n.querySelector(".cc-count");
      let v = c ? (c.textContent || "").trim() : ""; if (!v) { const gl = n.querySelector(".cc-glance"); v = gl ? gl.textContent.trim() : ""; } if (!v && c) { try { v = JSON.parse(c.getAttribute("data-tip")).rows[0].value; } catch {} } out[id] = c ? v : null;
    }
    return out;
  });
  const webC = Object.values(got).filter((v) => v != null).map((v) => parseFloat(String(v).replace(/[^0-9.]/g, ''))).filter((v) => Number.isFinite(v)).sort((x, y) => x - y);
  const goldC = Object.values(counts).map(Number).sort((x, y) => x - y);
  const fmt = (arr) => arr.map((x) => +x.toFixed(3)).join(' ');
  const rows = ['golden: ' + fmt(goldC), 'web   : ' + fmt(webC)];
  let match = 0, diff = 0, missing = 0;
  results[f] = { cards: Object.keys(got).length, golden: Object.keys(counts).length, match, diff, missing, ms: Date.now() - t0, err, rows: rows.slice(0, 12) };
  console.log(f, JSON.stringify(results[f]));
  console.log(logs.filter((l) => !/503|404|in-game-trailer|Hydration|script tag|ERR_ABORTED/.test(l)).join("\n"));
  await page.screenshot({ path: OUT + `num-${f.replace(/\W+/g, "_")}.png` });
  await browser.close();
}
fs.writeFileSync(OUT + "numbers.json", JSON.stringify(results, null, 1));
