import { boot, loadPlan } from "./lib/app.mjs";
import { refChain } from "./lib/plans.mjs";
import { forcedTwoPlaces } from "./lib/fx5-plans.mjs";
const { browser, page } = await boot();
const [dt, nb, an] = refChain.nodes;
const variants = {
  base: forcedTwoPlaces,
  nbSmallPin: { ...refChain, drawers: [], nodes: [{ ...dt, pin: 0.01 }, nb, { ...an, pin: 0.005 }] },
  anOnly: { ...refChain, drawers: [], nodes: [dt, nb, { ...an, pin: 0.005 }] },
};
for (const [name, plan] of Object.entries(variants)) {
  await loadPlan(page, plan);
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() => {
    const p = window.__ccStore.getState().lastResult?.plan;
    return { failure: p?.failure, leftovers: p?.leftovers?.map((l) => ({ importing: l.importing, bearers: l.bearers.map((b) => b.portKey) })), forced: p?.forced?.length, block: document.querySelectorAll(".rail-spare").length };
  });
  console.log(name, JSON.stringify(r));
}
await browser.close();
