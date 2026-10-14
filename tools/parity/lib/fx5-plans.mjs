// Plans of the FX5 package. A leftover with two places: the tower is held low, the first reactor is left to the plan,
// the second is pinned high, so the nitrobenzene it is short of can be bought at its own input or at the first reactor.
import { refChain } from "./plans.mjs";

const [dt, nb, an] = refChain.nodes;
export const forcedTwoPlaces = {
  ...refChain,
  drawers: [],
  nodes: [{ ...dt, pin: 0.0001 }, nb, { ...an, pin: 0.005 }],
};
