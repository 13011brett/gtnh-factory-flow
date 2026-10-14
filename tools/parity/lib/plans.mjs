// Plans the states build. Recipes are picked from the live dataset, so the content matches what the mod's
// reference shots show (docs/design/backport/ref/INDEX.md: ref-chain, ref-states).
export const refChain = {
  nodes: [
    { key: "dt", recipe: { res: ["fluid", "benzene"], nameRe: "Distillation Tower", hasIn: ["Steam-Cracked"], hasOut: ["Benzene", "Toluene"] }, x: 0, y: 0 },
    { key: "nb", recipe: { res: ["fluid", "nitrobenzene"], nameRe: "Large Chemical Reactor" }, x: 0, y: 700, tier: "IV" },
    { key: "an", recipe: { res: ["fluid", "aniline"], nameRe: "Large Chemical Reactor" , hasIn: ["Palladium", "Nitrobenzene"]}, x: 500, y: 700, tier: "EV" },
  ],
  drawers: [
    { key: "aniline", kind: "fluid", id: "aniline", name: "Aniline", x: 1000, y: 760, rate: 1, mode: "at-least" },
  ],
  wires: [
    { from: "dt", to: "nb", res: ["fluid", "benzene"] },
    { from: "nb", to: "an", res: ["fluid", "nitrobenzene"] },
    { from: "an", to: "aniline", res: ["fluid", "aniline"] },
  ],
};

export const ebfTi = { res: ["item", "gregtech:gt.metaitem.01@12028"], nameRe: "Hot Titanium Ingot", hasIn: ["Tetrachloride"], hasOut: ["Hot Titanium", "chloride"] };
export const ebfOne = { nodes: [{ key: "ebf", recipe: ebfTi, x: 0, y: 0, tier: "HV" }], drawers: [], wires: [] };
export const nbOne = { nodes: [{ key: "nb", recipe: refChain.nodes[1].recipe, x: 0, y: 0, tier: "IV" }], drawers: [], wires: [] };

// refChain with a blue (source) drawer feeding sulfuric acid in, "at most 0.6", a trash drawer on the tower's methane,
// and the aniline drawer. Drawer ids are drawer-<key>.
export const drawerPlan = {
  ...refChain,
  drawers: [
    ...refChain.drawers,
    { key: "acid", kind: "fluid", id: "sulfuricacid", name: "Sulfuric Acid", x: -420, y: 760, rate: 0.6, mode: "at-most" },
    { key: "methane", kind: "fluid", id: "methane", name: "Methane", x: 500, y: 0, drain: "trash" },
  ],
  wires: [
    ...refChain.wires,
    { from: "acid", to: "nb", res: ["fluid", "sulfuricacid"] },
    { from: "dt", to: "methane", res: ["fluid", "methane"] },
  ],
};

// An Aniline drawer with no number at all: rule Any, "Set" pulsing.
export const anyDrawerPlan = {
  ...refChain,
  drawers: [{ key: "aniline", kind: "fluid", id: "aniline", name: "Aniline", x: 1000, y: 760 }],
};

// nb pinned low, an pinned high: the aniline reactor needs more nitrobenzene than comes in, so the plan brings the
// rest in at a wired port (a Forced row).
export const forcedPlan = {
  ...refChain,
  nodes: [
    refChain.nodes[0],
    { ...refChain.nodes[1], pin: 0.0004 },
    { ...refChain.nodes[2], pin: 0.005 },
  ],
};
