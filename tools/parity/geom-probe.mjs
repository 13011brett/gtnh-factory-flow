// Card-local rectangles of a card's parts (css px at zoom 1) for a plan from lib/plans.mjs.
//   node tools/parity/geom-probe.mjs <planName> <nodeKey> <selector...>
import { boot, loadPlan } from "./lib/app.mjs";
import * as plans from "./lib/plans.mjs";
const [planName, key, ...sels] = process.argv.slice(2);
const { browser, page } = await boot();
const ids = await loadPlan(page, plans[planName]);
const out = await page.evaluate(({ id, sels }) => {
  const node = document.querySelector(`.react-flow__node[data-id="${id}"]`);
  const nr = node.getBoundingClientRect();
  const z = nr.width / node.offsetWidth;
  const res = { node: [nr.width / z, nr.height / z] };
  for (const s of sels) {
    res[s] = [...node.querySelectorAll(s)].map((el) => {
      const r = el.getBoundingClientRect();
      const extra = el.tagName === "IMG" ? { nat: [el.naturalWidth, el.naturalHeight] } : {};
      return { x: +((r.x - nr.x) / z).toFixed(1), y: +((r.y - nr.y) / z).toFixed(1), w: +(r.width / z).toFixed(1), h: +(r.height / z).toFixed(1), ...extra };
    });
  }
  return res;
}, { id: ids[key], sels });
console.log(JSON.stringify(out, null, 1));
await browser.close();
