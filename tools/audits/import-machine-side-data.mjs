// The Tree Growth Simulator's and Bacterial Vat's facts the dataset lacks, read from the running pack by the in-game
// mod (GTNH Planner's dev harness: `mc.sh call 'machinedata?dir=<dir>'` in the full 2.9 pack), trimmed to what the
// app reads and written to src/lib/machines/data/. Never hand-edit the outputs; rerun this after a pack update.
//   node tools/audits/import-machine-side-data.mjs <dir written by the mod>
import fs from "node:fs";
import path from "node:path";

const [dir] = process.argv.slice(2);
if (!dir) throw new Error("Expected the directory the mod's machinedata export wrote");
const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
const out = path.resolve("src/lib/machines/data");
const write = (name, value) => fs.writeFileSync(path.join(out, name), `${JSON.stringify(value)}\n`);
const amount = (entry) => (entry ? { id: entry.id, amount: entry.amount } : undefined);

const trees = read("tgs-trees.json").trees.map((tree) => ({
  sapling: { id: tree.sapling.id, name: tree.sapling.name },
  outputs: Object.fromEntries(Object.entries(tree.outputs).map(([mode, entry]) => [mode, amount(entry)])),
  ...(tree.forestry && !tree.forestry.error ? { forestry: tree.forestry } : {}),
}));
if (trees.some((tree) => !tree.sapling.id || Object.keys(tree.outputs).length === 0)) {
  throw new Error("A tree without a sapling or outputs");
}
write("tgs-trees.json", { source: "MTETreeFarm NEI recipes, GT5U 5.09.54.205", trees });

const vat = read("bio-vat.json").recipes.map((recipe) => ({
  culture: recipe.culture,
  items: recipe.items.map(amount),
  itemOutputs: recipe.itemOutputs.map(amount),
  fluidIn: amount(recipe.fluidIn),
  fluidOut: amount(recipe.fluidOut),
  durationTicks: recipe.durationTicks,
  eut: recipe.eut,
  glass: recipe.glass,
  sievert: recipe.sievert,
  ...(recipe.exact ? { exact: true } : {}),
  ...(recipe.cleanroom ? { cleanroom: true } : {}),
}));
write("bio-vat.json", { source: "bartworks bw.recipe.BacteriaVat, GT5U 5.09.54.205", recipes: vat });

const materials = read("radio-hatch.json").materials.map((material) => ({
  id: material.id,
  name: material.name,
  sievert: material.sievert,
  mass: material.mass,
}));
write("radio-hatch.json", { source: "bartworks bw.recipe.radhatch, GT5U 5.09.54.205", materials });

console.log(`${trees.length} trees, ${vat.length} vat recipes, ${materials.length} radio hatch materials`);
