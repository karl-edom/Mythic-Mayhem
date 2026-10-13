// Brings a kit to a target budget by scaling its output magnitudes (basic
// damage, damage, heal and shield amounts) by one common factor. Stats,
// ranges, cooldowns and crowd control are the kit's identity and stay as is.

import { kitBudget, type CostTable } from "../sim/budget.ts";
import type { Kit } from "../sim/kit.ts";

function scaled(kit: Kit, factor: number): Kit {
  const k = structuredClone(kit);
  k.basic.damage = Math.round(kit.basic.damage * factor);
  for (const ab of k.abilities)
    for (const e of ab.effects)
      if (e.type === "damage" || e.type === "heal" || e.type === "shield") e.amount = Math.round(e.amount * factor);
  return k;
}

/** Returns the scaled kit and its factor, or undefined if no factor in [0.25, 4] reaches the target. */
export function fitKit(kit: Kit, costs: CostTable, target: number): { kit: Kit; factor: number } | undefined {
  const cost = (f: number) => kitBudget(scaled(kit, f), costs).total;
  let [lo, hi] = [0.25, 4];
  if (cost(lo) > target || cost(hi) < target) return undefined;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (cost(mid) < target) lo = mid;
    else hi = mid;
  }
  // Rounding amounts can land slightly over: step down until within target.
  let factor = lo;
  while (cost(factor) > target) factor -= 0.001;
  return { kit: scaled(kit, factor), factor };
}
