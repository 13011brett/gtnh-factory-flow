// The gallery page: every mod reference shot, its website side-by-side (mod left, web right, the same scale) and a
// strict verdict written by a person after looking (tools/parity/gallery-notes.json: { "<ref>": ["MATCH"|"DIFFERS"|
// "NO EQUIVALENT"|"NOT CAPTURED", "what differs"] }). Pairs come from run.mjs (card and drawer states, out/<id>.side.png)
// and gallery-capture.mjs (screens, chrome and board scenes, out/gallery/<ref>.png).
//   node tools/parity/gallery.mjs   -> tools/parity/out/gallery/index.html
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { states } from "./states.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REF = process.env.PARITY_REF ?? path.resolve(here, "../../../gtnh-planner-mod/.claude/worktrees/website-mod-backport-research-c84135/docs/design/backport/ref");
const OUT = path.join(here, "out");
const GAL = path.join(OUT, "gallery");
fs.mkdirSync(GAL, { recursive: true });
const notes = JSON.parse(fs.readFileSync(path.join(here, "gallery-notes.json"), "utf8"));
const refs = fs.readdirSync(REF).filter((f) => f.endsWith(".png")).map((f) => f.slice(0, -4)).sort();

// A ref captured by run.mjs: copy its side-by-side in under the ref's name (the first state wins).
const byRef = new Map();
for (const st of states) if (!byRef.has(st.ref)) byRef.set(st.ref, st.id);
for (const [ref, id] of byRef) {
  const src = path.join(OUT, id + ".side.png");
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(GAL, ref + ".png"));
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const count = {};
const rows = refs.map((ref) => {
  const has = fs.existsSync(path.join(GAL, ref + ".png"));
  const [verdict, text] = notes[ref] ?? [has ? "UNREVIEWED" : "NOT CAPTURED", ""];
  count[verdict] = (count[verdict] ?? 0) + 1;
  return `<section id="${ref}" data-v="${verdict}"><h3>${esc(ref)} <span class="v ${verdict.replace(/\s/g, "-")}">${verdict}</span></h3>
<p>${esc(text)}</p>${has ? `<img loading="lazy" src="${ref}.png" alt="${ref}: mod left, website right"><small>Mod left, website right, both at their size on screen.</small>` : ""}</section>`;
});
const summary = Object.entries(count).map(([k, v]) => `${k}: ${v}`).join(" · ");
fs.writeFileSync(
  path.join(GAL, "index.html"),
  `<!doctype html><meta charset=utf-8><title>Mod vs website gallery</title>
<style>
body{background:#141414;color:#ddd;font:14px/1.45 system-ui,sans-serif;margin:16px}
section{border-top:1px solid #333;padding:12px 0}
h3{margin:0 0 4px;font-size:15px}
img{max-width:100%;display:block;margin-top:6px;image-rendering:pixelated}
small{color:#888}
.v{font-size:12px;padding:1px 6px;margin-left:8px;border-radius:3px}
.MATCH{background:#1f5132}.DIFFERS{background:#6b2a2a}.NO-EQUIVALENT,.NOT-CAPTURED,.UNREVIEWED{background:#444}
nav a{color:#9cf;margin-right:8px}
</style>
<h1>Mod (left) vs website (right): every reference shot</h1>
<p>${summary}. Verdicts are strict: anything visibly different is DIFFERS, except the typeface itself (Monocraft is wider and
lighter than the game's font everywhere; that is not repeated per shot). Every pair is at screen scale: the mod shot is screen px at GUI
scale 2 (where its board draws at twice the zoom it reports), the website is captured at 100% with its board at twice the mod's zoom.
Board plans are rebuilt from the mod's descriptions, so positions and numbers can differ where the plans do. Rerun: dev server, then
<code>node tools/parity/run.mjs</code>, <code>node tools/parity/gallery-capture.mjs</code>, <code>node tools/parity/gallery.mjs</code>.</p>
<nav>${["MATCH", "DIFFERS", "NO EQUIVALENT", "NOT CAPTURED"].map((v) => `<a href="#" onclick="for(const s of document.querySelectorAll('section'))s.hidden=s.dataset.v!=='${v}';return false">${v}</a>`).join("")}<a href="#" onclick="for(const s of document.querySelectorAll('section'))s.hidden=false;return false">all</a></nav>
${rows.join("\n")}`,
);
console.log(summary);
