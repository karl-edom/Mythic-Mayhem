// Splits a kit's budget into feature categories, so we can measure which
// kind of point is actually worth more than another in simulated play.

import { deliveryMultiplier, effectValue, kitBudget, type CostTable } from "../sim/budget.ts";
import type { Kit } from "../sim/kit.ts";

export const FEATURES = [
  "hp",
  "moveSpeed",
  "armor",
  "radius",
  "basicMelee",
  "basicRanged",
  "damage",
  "heal",
  "shield",
  "slow",
  "stun",
  "knockback",
  "haste",
  "dashMobility",
] as const;

export type Feature = (typeof FEATURES)[number];

/** A basic attack at or above this range counts as ranged. */
export const RANGED_BASIC = 3;

export function kitFeatures(kit: Kit, costs: CostTable): Record<Feature, number> {
  const f = Object.fromEntries(FEATURES.map((k) => [k, 0])) as Record<Feature, number>;
  const lines = kitBudget(kit, costs).lines;
  const line = (label: string) => lines.find((l) => l.label === label)?.points ?? 0;
  f.hp = line("hp");
  f.moveSpeed = line("moveSpeed");
  f.armor = line("armor");
  f.radius = line("radius");
  f[kit.basic.range >= RANGED_BASIC ? "basicRanged" : "basicMelee"] = line("basic");
  const a = costs.ability;
  for (const ab of kit.abilities) {
    // Same formula as abilityCost, attributed to each effect type.
    const perPoint = a.pointsPerValuePerSecond / ab.cooldown;
    const mult = deliveryMultiplier(ab, costs);
    for (const e of ab.effects) f[e.type] += effectValue(e, costs) * mult * perPoint;
    if (ab.delivery.type === "dash") f.dashMobility += ab.delivery.distance * a.dashMobilityPerMetre * perPoint;
  }
  return f;
}
