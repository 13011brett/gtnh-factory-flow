import { boot } from "./lib/app.mjs";
const { browser, page } = await boot();
const out = await page.evaluate(async () => {
  const S = window.__ccStore;
  const ver = S.getState().selectedDatasetVersionId;
  const get = async (u) => (await fetch(u)).json();
  const res = {};
  for (const m of ["Bee Produce", "Crop Farm", "Extreme Entity Crusher"]) {
    const list = await get(`/api/datasets/${ver}/recipes?query=&mode=recipes&maxTier=UXV&offset=0&limit=3&recipeMap=${encodeURIComponent(m)}`);
    res[m] = { total: list.total, names: list.recipes.map((r) => r.id + "|" + r.name + "|" + r.recipeMap) };
  }
  return res;
});
console.log(JSON.stringify(out, null, 1).slice(0, 3000));
await browser.close();
