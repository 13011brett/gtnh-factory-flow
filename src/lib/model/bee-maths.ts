/**
 * What a bee makes, from the game's code (Forestry's Bee.getFinalChance and produceStacks, GregTech's
 * MTEIndustrialApiary.checkRecipe). Pure: the cards' controls live in passive-production.ts.
 *
 * A product with base chance b (a fraction) comes out with
 * `F(b) = 2.8 * (100 b)^0.52 * (p + t)^0.52 * s^0.37 / 100`: p the housing's production modifier, t 1 in Forestry's
 * housings and 8 in the Industrial Apiary, s the speed gene. A pure-bred bee rolls every product twice, at b for its
 * first species and at b / 2 for its second, and a specialty once at b. Forestry's housings roll once a 550-tick
 * cycle, each roll at most certain; the Industrial Apiary runs a queen's life as one operation, uncapped.
 */

/** A queen's life in cycles at the Normal lifespan gene, and GTNH's HARD beekeeping mode (1.5 times as long). */
export const BEE_NORMAL_LIFESPAN = 40;
export const BEE_MODE_LIFESPAN = 1.5;
export const BEE_CYCLE_TICKS = 550;
export const BEE_INDUSTRIAL_BASE_EUT = 37;
/** Energy factor of the Upgraded Acceleration Upgrade x256. */
export const BEE_UPGRADED_ENERGY = 14.75;

/** Forestry's Bee.getFinalChance for a roll at chance `chance` (a fraction); 0 when the term is not above 0. */
export function beeFinalChance(chance: number, speed: number, term: number): number {
  if (term <= 0 || chance <= 0) return 0;
  return (2.8 * Math.pow(chance * 100, 0.52) * Math.pow(term, 0.52) * Math.pow(speed, 0.37)) / 100;
}

/**
 * Expected items per bee cycle from one product line of `chance`: a product rolls at b and at b / 2, a specialty
 * once. `capped` is Forestry's housings, where a roll is `nextFloat() < F` and so at most one item.
 */
export function beeItemsPerCycle(
  chance: number,
  speed: number,
  term: number,
  options: { specialty: boolean; capped: boolean },
): number {
  const roll = (c: number) => {
    const f = beeFinalChance(c, speed, term);
    return options.capped ? Math.min(1, f) : f;
  };
  return options.specialty ? roll(chance) : roll(chance) + roll(chance / 2);
}

/**
 * The output multiplier a base chance gets, so that `chance * multiplier` is the items per cycle. A chance of 0
 * has nothing to scale.
 */
export function beeOutputMultiplier(
  chance: number,
  speed: number,
  term: number,
  options: { specialty: boolean; capped: boolean },
): number {
  if (!(chance > 0)) return 0;
  return beeItemsPerCycle(chance, speed, term, options) / chance;
}

/** How a frame adds to the production sum, each against the sum so far (BeeHousingModifier). */
type FrameRule =
  | { rule: "forestry" }
  | { rule: "constant"; value: number }
  | { rule: "ceiling"; value: number; max: number };

const FRAME_RULES: Record<string, FrameRule> = {
  "forestry:untreated": { rule: "forestry" },
  "forestry:impregnated": { rule: "forestry" },
  "forestry:proven": { rule: "forestry" },
  "extrabees:cocoa": { rule: "ceiling", value: 0.5, max: 2 },
  "extrabees:cage": { rule: "ceiling", value: -0.25, max: 0 },
  "extrabees:soul": { rule: "ceiling", value: -0.75, max: 0 },
  "extrabees:clay": { rule: "ceiling", value: -0.25, max: 0 },
  "magicbees:magic": { rule: "constant", value: 2 },
  "magicbees:resilient": { rule: "constant", value: 2 },
  "magicbees:gentle": { rule: "constant", value: 0.4 },
  "magicbees:metabolic": { rule: "constant", value: 0.2 },
  "magicbees:necrotic": { rule: "constant", value: -0.25 },
  "magicbees:temporal": { rule: "constant", value: 0 },
  "magicbees:oblivion": { rule: "constant", value: -9001 },
};

/**
 * What a frame adds to a production sum that is `sum` so far: Forestry's frames 1 while the sum is under 10,
 * MagicBees' their own number, ExtraBees' a boost no further than its ceiling (a cut as it is).
 */
export function beeFrameProduction(key: string, sum: number): number {
  const rule = FRAME_RULES[key];
  if (!rule) return 0;
  switch (rule.rule) {
    case "forestry":
      return sum < 10 ? 1 : 0;
    case "constant":
      return rule.value;
    case "ceiling":
      if (rule.value < 0) return rule.value;
      return sum >= rule.max ? 0 : Math.min(rule.value, rule.max - sum);
  }
}

/**
 * Frames in slot order added to `production` (the housing's p, with its aura or other blocks), each against the
 * running sum. Returns the new sum.
 */
export function beeProductionWithFrames(production: number, frameKeys: readonly string[]): number {
  let sum = production;
  for (const key of frameKeys) sum += beeFrameProduction(key, sum);
  return sum;
}

/**
 * MTEIndustrialApiary's draw in EU/t: `(int)(37 * energy * 2^speed) + 32 * 4^(speed - 1)` (the second part for
 * speed 1 and up). `energy` is 1.4^n for n production upgrades, times 14.75 for the Upgraded Acceleration.
 */
export function beeIndustrialEuPerTick(speed: number, energy: number): number {
  const accel = 2 ** speed;
  let eut = Math.trunc(BEE_INDUSTRIAL_BASE_EUT * energy * accel);
  if (speed >= 1) eut += 32 * 4 ** (speed - 1);
  return eut;
}

export function beeIndustrialEnergy(
  productionUpgrades: number,
  upgradedAcceleration: boolean,
): number {
  let energy = 1;
  if (productionUpgrades > 0) energy *= 1.4 ** productionUpgrades;
  if (upgradedAcceleration) energy *= BEE_UPGRADED_ENERGY;
  return energy;
}

/**
 * What the Industrial Apiary's acceleration is worth for a queen of `lifespan` cycles (her lifespan gene, Normal 40;
 * GTNH's HARD mode lives her 1.5 times over). An operation of under 100 ticks is not made: the life is divided by
 * the life's hundreds instead and the outputs multiplied by the whole part of what is left. Returns the fraction of
 * the full `2^speed` rate that comes out (1 unless she is short-lived).
 */
export function beeIndustrialRateFraction(speed: number, lifespan = BEE_NORMAL_LIFESPAN): number {
  const accel = 2 ** speed;
  const life = Math.floor(lifespan * BEE_MODE_LIFESPAN * BEE_CYCLE_TICKS);
  const limit = Math.floor(life / 100);
  const divisor = Math.max(1, Math.min(accel, limit));
  const factor = Math.floor(accel / divisor);
  return (divisor * factor) / accel;
}
