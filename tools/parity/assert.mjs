// Geometry and colour assertions on the website's clean card, against the spec's numbers (HARD: the website's own
// grid and the colours the mod uses) and against the mod's proportions (RATIO: measured as a share of card width
// from the reference shots; the website's grid makes some of these differ on purpose, noted per row).
//   node tools/parity/assert.mjs        exit code 1 when a HARD check fails; RATIO checks only report.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { boot, loadPlan, panTo, setZoom } from "./lib/app.mjs";
import { refChain, ebfOne } from "./lib/plans.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { browser, page } = await boot();
const rows = [];
const add = (kind, name, expected, actual, tol = 0.5, note = "") => {
  const ok = typeof expected === "number" ? Math.abs(expected - actual) <= tol : String(expected).toLowerCase() === String(actual).toLowerCase();
  rows.push({ kind, name, expected, actual: typeof actual === "number" ? Math.round(actual * 1000) / 1000 : actual, ok, note });
};

async function measure(plan, key, prep) {
  const ids = await loadPlan(page, plan);
  await panTo(page, ids[key], 500, 250);
  if (prep) await prep(ids[key]);
  await page.waitForTimeout(600);
  return page.evaluate((id) => {
    const card = document.querySelector(`.react-flow__node[data-id="${id}"] .cc-card`);
    const cr = card.getBoundingClientRect();
    const rel = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x - cr.x, y: r.y - cr.y, w: r.width, h: r.height };
    };
    const css = (el, p) => (el ? getComputedStyle(el)[p] : null);
    const all = (s) => [...card.querySelectorAll(s)];
    const rail = all(".cc-rail");
    const rowsIn = rail[0] ? [...rail[0].querySelectorAll(".cc-row")] : [];
    const rowsOut = rail[1] ? [...rail[1].querySelectorAll(".cc-row")] : [];
    const chips = all(".cc-chip");
    const numEl = card.querySelector(".cc-num");
    return {
      card: { w: cr.width, h: cr.height },
      head: rel(card.querySelector(".cc-head")),
      keys: all(".cc-key").map(rel),
      name: rel(card.querySelector(".cc-name")),
      chips: chips.map((c) => ({ ...rel(c), bg: css(c, "backgroundColor"), color: css(c, "color"), border: css(c, "borderTopColor"), text: c.textContent })),
      rails: rail.map(rel),
      rowsIn: rowsIn.map(rel),
      rowsOut: rowsOut.map(rel),
      icon: rel(card.querySelector(".cc-icon")),
      num: { r: rel(numEl), font: css(numEl, "fontSize") + " " + css(numEl, "fontWeight"), family: (css(numEl, "fontFamily") || "").slice(0, 40), color: css(numEl, "color") },
      pname: { r: rel(card.querySelector(".cc-pname")), font: css(card.querySelector(".cc-pname"), "fontSize"), color: css(card.querySelector(".cc-pname"), "color") },
      pic: rel(card.querySelector(".cc-pic")),
      art: rel(card.querySelector(".cc-art, .cc-machine")),
      count: { r: rel(card.querySelector(".cc-count")), color: css(card.querySelector(".cc-count"), "color"), font: css(card.querySelector(".cc-count"), "fontSize") },
      strip: rel(card.querySelector(".cc-strip")),
      sc: all(".cc-sc").map((c) => ({ ...rel(c), border: css(c, "borderTopColor"), bg: css(c, "backgroundColor") })),
      surface: css(card, "backgroundColor"),
      domCount: card.querySelectorAll("*").length,
    };
  }, ids[key]);
}

const rgb = (s) => {
  const m = s?.match(/rgba?\((\d+), (\d+), (\d+)/);
  return m ? "#" + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, "0")).join("").toUpperCase() : s;
};

// ---- reference card: LCR IV 1A, 4 inputs + power, 2 outputs ----
const m = await measure(refChain, "nb");
const W = m.card.w;
add("HARD", "card width", 380, m.card.w);
add("HARD", "card height is whole 20 px cells", 0, m.card.h % 20);
add("HARD", "head height", 40, m.head?.h ?? 0);
add("HARD", "rail width (input)", 112, m.rails[0]?.w ?? 0);
add("HARD", "rail width (output)", 112, m.rails[1]?.w ?? 0);
add("HARD", "rail x inset", 4, m.rails[0]?.x ?? 0);
add("HARD", "output rail right edge at 376", 376, (m.rails[1]?.x ?? 0) + (m.rails[1]?.w ?? 0));
const centreOnGrid = (rows, rail) => rows.every((r) => Math.abs(((r.y + r.h / 2 - rail.y) % 40) - 20) <= 1);
add("HARD", "input row centres sit on the 40 px grid (20, 60, ...)", 1, centreOnGrid(m.rowsIn, m.rails[0]) ? 1 : 0, 0, JSON.stringify(m.rowsIn.map((r) => Math.round(r.y + r.h / 2 - m.rails[0].y))));
add("HARD", "output row centres sit on the 40 px grid", 1, centreOnGrid(m.rowsOut, m.rails[1]) ? 1 : 0, 0, JSON.stringify(m.rowsOut.map((r) => Math.round(r.y + r.h / 2 - m.rails[1].y))));
add("HARD", "port icon size", 32, m.icon?.w ?? 0);
add("HARD", "key width", 24, m.keys[0]?.w ?? 0);
add("HARD", "key height", 24, m.keys[0]?.h ?? 0);
for (const [i, c] of m.chips.entries()) {
  add("HARD", `chip ${i} width`, 50, c.w, 1);
  add("HARD", `chip ${i} height`, 24, c.h);
}
add("HARD", "tier chip bg is IV #5555FF", "#5555FF", rgb(m.chips[1]?.bg));
add("HARD", "amps chip bg is IV #5555FF", "#5555FF", rgb(m.chips[0]?.bg));
add("HARD", "card face #23252A", "#23252A", rgb(m.surface));
add("HARD", "port number font 14px/600", "14px 600", m.num.font);
add("HARD", "port name font 9px", "9px", m.pname.font);
add("HARD", "DOM budget <= 70", 1, m.domCount <= 70 ? 1 : 0, 0, `elements: ${m.domCount}`);

// RATIO: the mod's proportions as a share of its 320 GUI px card (spec-ui section 1; header 32, row pitch 42,
// rail 112, key 20, chip 48 x 20, icon 32 all re-measured on card-clean-solved-default.png at 2 px per GUI px).
const modW = 320;
const ratio = (name, modPx, webPx, note) => {
  const e = modPx / modW, a = webPx / W;
  rows.push({ kind: "RATIO", name, expected: Math.round(e * 1000) / 1000, actual: Math.round(a * 1000) / 1000, ok: Math.abs(e - a) <= 0.012, note: note ?? "" });
};
ratio("header height / card width", 32, m.head?.h ?? 0, "mod 32 GUI; web 40 css");
ratio("port row pitch / card width", 42, m.rowsIn[1] ? m.rowsIn[1].y - m.rowsIn[0].y : 40);
ratio("port icon / card width", 32, m.icon?.w ?? 0);
ratio("rail width / card width", 112, m.rails[0]?.w ?? 0);
ratio("key size / card width", 20, m.keys[0]?.w ?? 0);
ratio("chip width / card width", 48, m.chips[0]?.w ?? 0);
ratio("chip height / card width", 20, m.chips[0]?.h ?? 0);
ratio("card height / card width (this card)", 256, m.card.h, "mod 512 px at 2x");
ratio("picture column width / card width", 88, m.pic?.w ?? 0);

// ---- EBF with settings strip ----
const e = await measure(ebfOne, "ebf", async (id) => {
  await page.evaluate((id) => window.__ccStore.getState().updateNode(id, { solvePin: 2 }), id);
  await page.waitForTimeout(800);
});
add("HARD", "EBF card whole cells", 0, e.card.h % 20);
add("HARD", "EBF strip chip height", 18, e.sc[0]?.h ?? 0);
add("HARD", "EBF strip chip count >= 1 (coil)", 1, e.sc.length >= 1 ? 1 : 0);
add("HARD", "EBF tier chip bg HV #FFFF55", "#FFFF55", rgb(e.chips[1]?.bg));
add("HARD", "pinned count colour gold #FFD257", "#FFD257", rgb(e.count.color));
ratio("EBF card height / card width", 202, e.card.h, "mod 404 px at 2x");
ratio("strip chip height / card width", 18, e.sc[0]?.h ?? 0);


// ---- BEHAVIOUR: what the mod's card does, read off the live website card ----
// (each row names the mod value; the mod's own numbers are from the reference shots)
const ids1 = await loadPlan(page, refChain);
await panTo(page, ids1.nb, 500, 250);
const sel1 = `.react-flow__node[data-id="${ids1.nb}"]`;
const power = async (sel) => page.evaluate((sel) => document.querySelector(sel + ' .cc-bolt')?.parentElement?.querySelector('.cc-num')?.textContent ?? null, sel);
add('BEHAVIOUR', 'power row shows the card demand (count x machine draw), nb x0.0012', '9.22', await power(sel1), 0, 'card-clean-solved-default shows 9.22 EU/t; web shows one machine');
await page.evaluate((id) => window.__ccStore.getState().updateNode(id, { solvePin: 3 }), ids1.nb);
await page.waitForTimeout(900);
add('BEHAVIOUR', 'power row with count pinned to 3', '23.04k', await power(sel1), 0, 'card-count-pinned shows 23.04k EU/t');
const setBoxes = await page.evaluate((sel) => [...document.querySelectorAll(sel + ' .cc-rail span, ' + sel + ' .cc-rail div')].filter((e) => e.children.length === 0 && e.textContent.trim() === 'Set').length, sel1);
add('BEHAVIOUR', 'open ports show a rate box reading Set (nb has 4 open ports)', 4, setBoxes, 0, 'mod: key + Set box on every open port');
const placeKey = await page.locator(sel1 + ' .cc-key').count();
add('BEHAVIOUR', 'header keys (mod: menu, place, settings = 3; spec drops place = 2)', 2, placeKey, 0, 'SPEC: place key dropped');
// hover scope on chip opens the power input panel
await page.locator(sel1 + ' .cc-chip').nth(1).hover();
await page.waitForTimeout(1500);
const panel = await page.evaluate(() => /Power input/i.test(document.body.innerText));
add('BEHAVIOUR', 'hovering the tier chip opens the Power input panel', 1, panel ? 1 : 0, 0, 'mod card-tier-chip-hovered-tooltip; web shows a one-line tip');
await page.mouse.move(1500, 960);
// machine list typography
await page.locator(sel1 + ' .cc-name').click();
await page.waitForTimeout(700);
const menuFont = await page.evaluate(() => { const m = [...document.querySelectorAll('[role=menu],[role=listbox],[role=dialog]')].pop(); return m ? parseFloat(getComputedStyle(m).fontSize) : 0; });
const listText = await page.evaluate(() => /Machines that run this recipe/i.test(document.body.innerText));
add('BEHAVIOUR', 'machine list has the heading Machines that run this recipe', 1, listText ? 1 : 0, 0, 'mod card-machine-picker-open');
rows.push({ kind: 'BEHAVIOUR', name: 'machine list font size (mod ~8 GUI px = card text size)', expected: '<= 14', actual: menuFont, ok: menuFont > 0 && menuFont <= 14, note: 'web list reads far larger than the card text' });
await page.keyboard.press('Escape');
// coil chip: click opens a list with a filter
const ids2 = await loadPlan(page, ebfOne);
await panTo(page, ids2.ebf, 500, 250);
const sel2 = `.react-flow__node[data-id="${ids2.ebf}"]`;
await page.locator(sel2 + ' .cc-sc').first().click();
await page.waitForTimeout(700);
const filterBox = await page.evaluate(() => !!document.querySelector('input[placeholder^="Filter"]:not([placeholder*="resources"])'));
add('BEHAVIOUR', 'clicking the coil chip opens a list with a Filter box', 1, filterBox ? 1 : 0, 0, 'mod card-settings-strip-coil-menu-open; web steps to the next coil');
// idle zero colour and prompt
const idle = await page.evaluate((sel) => { const n = document.querySelector(sel + ' .cc-rail .cc-row .cc-num'); return n ? getComputedStyle(n).color : null; }, sel2);
add('BEHAVIOUR', 'zero rate number is idle grey #A8AFBB', '#A8AFBB', rgb(idle), 0, 'mod card-ebf-unset: grey zeros');
// zoom 0.5 keeps the full card (mod glances only below 0.42)
await setZoom(page, ids2.ebf, 0.52);
await page.waitForTimeout(500);
const glance = await page.evaluate(() => (document.querySelector('.factory-flow-board')?.getAttribute('data-detail-level') === 'glance' ? 'glance' : 'full'));
add('BEHAVIOUR', 'card at zoom 0.52 still shows ports (not glance)', 'full', glance, 0, 'mod shows full detail down to 0.42');

await browser.close();
fs.mkdirSync(path.join(here, "out"), { recursive: true });
fs.writeFileSync(path.join(here, "out", "measure.json"), JSON.stringify({ ref: m, ebf: e, rows }, null, 1));
let hardFail = 0;
for (const r of rows) {
  if (!r.ok && r.kind === "HARD") hardFail++;
  console.log(`${r.ok ? "ok  " : r.kind === "HARD" ? "FAIL" : r.kind === "BEHAVIOUR" ? "BUG " : "DIFF"} [${r.kind}] ${r.name}: mod/spec ${r.expected} vs web ${r.actual}${r.note ? "  (" + r.note + ")" : ""}`);
}
console.log(`\n${rows.filter((r) => r.kind === "HARD").length - hardFail} hard ok, ${hardFail} hard failed, ${rows.filter((r) => r.kind === "RATIO" && !r.ok).length} ratio differences`);
const behaviourFail = rows.filter((r) => r.kind === "BEHAVIOUR" && !r.ok).length;
console.log(`${behaviourFail} behaviour differences (BUG rows); pass --strict to fail on them`);
process.exit(hardFail || (process.argv.includes("--strict") && behaviourFail) ? 1 : 0);
