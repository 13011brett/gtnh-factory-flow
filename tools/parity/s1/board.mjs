// S1: loads the parity scenarios' plans onto the dev board and prints what each card, drawer and the rail show.
// Plans come from scenario-kit (dump them with a one-off vitest; see the S1 report). Usage: node board.mjs <projects.json> [regex]
import { readFileSync } from "node:fs";
import { boot } from "../lib/app.mjs";
const projects = JSON.parse(readFileSync(process.argv[2], "utf8"));
const re = new RegExp(process.argv[3] ?? ".");
const { browser, page } = await boot({ dsf: 1 });
for (const [name, project] of Object.entries(projects)) {
  if (!re.test(name)) continue;
  project.nodes.forEach((n, i) => (n.position = { x: (i % 3) * 520, y: Math.floor(i / 3) * 520 }));
  (project.storages ?? []).forEach((s, i) => (s.position = { x: i * 300, y: 900 }));
  await page.evaluate((p) => {
    const S = window.__ccStore;
    S.getState().setProject?.(p);
    if (S.getState().project.id !== p.id) S.setState({ project: p });
    S.getState().recalculate?.();
  }, project);
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const flat = (el) => (el?.innerText ?? "").replace(/\s*\n\s*/g, " | ");
    return {
      cards: [...document.querySelectorAll(".react-flow__node")].map((n) => `${n.dataset.id.slice(-3)}: ${flat(n)}`),
      rail: flat(document.querySelector(".rail-root, [class*=rail]")).slice(0, 600),
      notices: flat(document.querySelector("[class*=notice]")).slice(0, 300),
    };
  });
  console.log(`== ${name}`);
  for (const c of r.cards) console.log("  ", c);
  console.log("   rail:", r.rail);
  if (r.notices) console.log("   notices:", r.notices);
}
await browser.close();
