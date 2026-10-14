// The gauntlet: a fixed panel of random reference fighters, all at the same
// budget. Any fighter, original or fan-made, is measured against it, and its
// damage can be tuned until it wins about half of its duels. This is what keeps
// a roster of 50 characters balanced without tuning them against each other:
// each one is held to the same yardstick.

import { rng } from "../sim/math.ts";
import type { BrawlCostTable } from "./budget.ts";
import { randomRoster, scaleDamage } from "./generate.ts";
import type { FighterKit } from "./kit.ts";
import { runDuel } from "./match.ts";

/** Panel size and seed are part of the contract: changing them moves every tuned character. */
export const GAUNTLET_SIZE = 40;
export const GAUNTLET_SEED = 2026;
/** A fighter is balanced when its gauntlet win rate is inside this band. */
export const BALANCED_BAND: [number, number] = [0.4, 0.6];

export function referencePanel(costs: BrawlCostTable): FighterKit[] {
  return randomRoster(rng(GAUNTLET_SEED), GAUNTLET_SIZE, costs, (costs.budget.min + costs.budget.max) / 2);
}

/** Share of duels won against the panel (each opponent twice, sides swapped; a draw counts half). */
export function gauntletRate(kit: FighterKit, panel: FighterKit[]): number {
  let score = 0;
  let games = 0;
  panel.forEach((opp, i) => {
    for (const side of [0, 1] as const) {
      const r = side === 0 ? runDuel(kit, opp, 7919 * i + 1) : runDuel(opp, kit, 7919 * i + 2);
      score += r.winner === null ? 0.5 : r.winner === side ? 1 : 0;
      games++;
    }
  });
  return score / games;
}

/**
 * Scales the fighter's damage until its gauntlet win rate is close to 50 %.
 * Identity (timings, reach, specials) is untouched. Returns the factor used.
 */
export function tuneToGauntlet(kit: FighterKit, panel: FighterKit[], steps = 7): { kit: FighterKit; factor: number; rate: number } {
  let [lo, hi] = [0.5, 2];
  let best = { kit, factor: 1, rate: gauntletRate(kit, panel) };
  for (let i = 0; i < steps; i++) {
    const mid = Math.sqrt(lo * hi);
    const k = scaleDamage(kit, mid);
    const rate = gauntletRate(k, panel);
    if (Math.abs(rate - 0.5) < Math.abs(best.rate - 0.5)) best = { kit: k, factor: mid, rate };
    if (rate < 0.5) lo = mid;
    else hi = mid;
  }
  return best;
}
