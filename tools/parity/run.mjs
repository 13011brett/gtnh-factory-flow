// A/B capture: for each state in states.mjs put the website in the state, screenshot it at the mod's scale
// (the website card is made as many device px wide as the mod's reference card: 380 css x 1.684 = 640 px), and
// write mod | web montages, a red/cyan anaglyph and an index page under tools/parity/out/.
//   node tools/parity/run.mjs [filter-regex] [--headed]
// Server: GTNH_DATASET_BACKEND_URL=https://gtnhplanner.com node node_modules/next/dist/bin/next dev -p 3120
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boot, loadPlan, panTo, rectOf, setZoom, pickRecipe, DSF } from "./lib/app.mjs";
import { readPng, writePng, sideBySide, anaglyph, detectCardByEdge, crop } from "./lib/png.mjs";
import { states } from "./states.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REF = process.env.PARITY_REF ?? path.resolve(here, "../../../gtnh-planner-mod/.claude/worktrees/website-mod-backport-research-c84135/docs/design/backport/ref");
const OUT = path.join(here, "out");
const filter = process.argv.find((a, i) => i > 1 && !a.startsWith("--"));
const headed = process.argv.includes("--headed");

fs.mkdirSync(path.join(OUT, "web"), { recursive: true });
const { browser, page } = await boot({ headless: !headed });
const results = [];
for (const st of states) {
  if (filter && !new RegExp(filter).test(st.id)) continue;
  try {
    let ref = readPng(path.join(REF, st.ref + ".png"));
    const edge = st.anchor ? null : detectCardByEdge(ref, 300);
    let det = st.anchor ?? (edge ? { x: edge.x, y: edge.y } : { x: 0, y: 0 });
    let zoom = st.zoom ?? (edge && !st.drawer ? Math.round((edge.w / 640) * 100) / 100 : 1);
    if (st.webZoom) {
      // the mod shot is at another zoom than we compare at (the website glances out earlier): scale it up
      const k = st.webZoom / zoom;
      ref = crop(ref, 0, 0, ref.width, ref.height, k);
      det = { x: det.x * k, y: det.y * k };
      zoom = st.webZoom;
    }
    const ids = await loadPlan(page, st.plan);
    const pick = (s) => pickRecipe(page, s);
    if (st.add) await st.add({ page, ids, pick });
    const tid = st.target ? await st.target({ page }) : ids[st.node];
    const nodeSel = `.react-flow__node[data-id="${tid}"]`;
    const ctx = {
      page, ids, id: tid, nodeSel, pick,
      centre: async (fx, fy) => { const r = await rectOf(page, nodeSel); return [r.x + r.w * fx, r.y + r.h * fy]; },
    };
    let zr = null;
    if (!st.drawer && !st.add) zr = await setZoom(page, tid, zoom);
    if (zr && Math.abs(zr - zoom) > 0.02) console.log("  zoom wanted", zoom, "got", zr);
    const offX = det.x / DSF, offY = det.y / DSF;
    await panTo(page, tid, 420 + offX, 160 + offY);
    await page.mouse.move(1500, 960);
    await st.setup(ctx);
    await page.waitForTimeout(300);
    const r = await rectOf(page, nodeSel);
    const shot = path.join(OUT, "web", st.id + ".png");
    if (st.clip === "rail") {
      const pr = await rectOf(page, ".rail-root");
      await page.screenshot({ path: shot, clip: { x: pr.x, y: pr.y, width: ref.width / DSF, height: ref.height / DSF } });
    } else {
      await page.screenshot({ path: shot, clip: { x: r.x - offX, y: r.y - offY, width: ref.width / DSF, height: ref.height / DSF } });
    }
    const web = readPng(shot);
    writePng(path.join(OUT, st.id + ".side.png"), sideBySide(ref, web));
    writePng(path.join(OUT, st.id + ".ana.png"), anaglyph(ref, web));
    results.push({ id: st.id, ref: st.ref, ok: true, zoom, modAnchor: det, webTarget: { w: r.w, h: r.h } });
    console.log("ok", st.id);
  } catch (e) {
    results.push({ id: st.id, ref: st.ref, ok: false, error: String(e).slice(0, 400) });
    console.log("FAIL", st.id, String(e).slice(0, 240));
  }
}
await browser.close();
const prev = fs.existsSync(path.join(OUT, "results.json")) ? JSON.parse(fs.readFileSync(path.join(OUT, "results.json"), "utf8")) : [];
const merged = [...prev.filter((p) => !results.some((r) => r.id === p.id)), ...results];
fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(merged, null, 1));
const rows = merged
  .map((r) => `<section><h3>${r.id} <small>(${r.ref})</small></h3>${r.ok ? `<img src="${r.id}.side.png" style="max-width:100%"><br><details><summary>anaglyph (mod red, web cyan)</summary><img src="${r.id}.ana.png" style="max-width:60%"></details><pre>${JSON.stringify(r.webTarget)} zoom ${r.zoom}</pre>` : `<pre>${r.error}</pre>`}</section>`)
  .join("\n");
fs.writeFileSync(path.join(OUT, "index.html"), `<!doctype html><meta charset=utf-8><body style="background:#111;color:#ddd;font:14px sans-serif"><h1>Parity: mod (left) vs website (right)</h1>${rows}`);
