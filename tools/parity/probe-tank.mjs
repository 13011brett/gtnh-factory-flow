import { boot } from "./lib/app.mjs";
const { browser, page } = await boot();
const out = await page.evaluate(async () => {
  const S = window.__ccStore;
  const ver = S.getState().selectedDatasetVersionId;
  const get = async (u) => (await fetch(u)).json();
  const list = await get(`/api/datasets/${ver}/recipes?query=&mode=recipes&maxTier=UXV&offset=0&limit=40&allMaps=1&resourceKind=fluid&resourceId=water`);
  const first = list.recipes[0];
  const full = first ? await get(`/api/datasets/${ver}/recipes/${encodeURIComponent(first.id)}`) : null;
  return { total: list.total, ids: list.recipes.map((r) => r.id + " | " + r.name + " | " + r.recipeMap), full };
});
console.log(JSON.stringify(out, null, 1).slice(0, 3000));
await browser.close();
