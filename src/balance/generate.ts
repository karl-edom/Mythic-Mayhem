// Generates random kits that pass validation and cost exactly a target budget.
// Used to test the cost model on many shapes of characters, not just the ones we designed.

import { kitBudget, type CostTable } from "../sim/budget.ts";
import type { Ability, Effect, Kit } from "../sim/kit.ts";
import { validateKit } from "../sim/validate.ts";

type Rand = () => number;

const between = (r: Rand, min: number, max: number) => min + r() * (max - min);
const round = (v: number, step = 0.05) => Math.round(v / step) * step;
const pick = <T>(r: Rand, items: readonly T[]): T => items[Math.floor(r() * items.length)]!;

function crowdControl(r: Rand, allowStun: boolean): Effect | undefined {
  const roll = r();
  if (roll < 0.3) return { type: "slow", pct: round(between(r, 0.2, 0.5)), duration: round(between(r, 0.8, 2), 0.1) };
  if (roll < 0.5 && allowStun) return { type: "stun", duration: round(between(r, 0.4, 1.2), 0.1) };
  if (roll < 0.65) return { type: "knockback", distance: round(between(r, 1, 3), 0.1) };
  return undefined;
}

function randomAbility(r: Rand, id: string, stunTaken: boolean): Ability {
  const cooldown = round(between(r, 5, 14), 0.5);
  const damage: Effect = { type: "damage", amount: Math.round(between(r, 60, 220)) };
  const kind = pick(r, ["projectile", "line", "circleAttack", "circleSupport", "dash", "self"] as const);
  const effects: Effect[] = [];
  switch (kind) {
    case "projectile": {
      effects.push(damage);
      const cc = crowdControl(r, !stunTaken);
      if (cc) effects.push(cc);
      return {
        id, cooldown, effects,
        delivery: { type: "projectile", range: round(between(r, 5, 9), 0.5), speed: round(between(r, 12, 20), 1), width: round(between(r, 0.4, 1), 0.1) },
      };
    }
    case "line": {
      const delay = round(between(r, 0.2, 0.8), 0.1);
      effects.push(damage);
      const cc = crowdControl(r, !stunTaken && delay >= 0.4);
      if (cc) effects.push(cc);
      return {
        id, cooldown, effects,
        delivery: { type: "line", length: round(between(r, 4, 9), 0.5), width: round(between(r, 0.8, 1.6), 0.1), delay },
      };
    }
    case "circleAttack": {
      const delay = round(between(r, 0.3, 1), 0.1);
      effects.push(damage);
      const cc = crowdControl(r, !stunTaken && delay >= 0.4);
      if (cc) effects.push(cc);
      return {
        id, cooldown, effects,
        delivery: { type: "circle", castRange: round(between(r, 0, 7), 0.5), radius: round(between(r, 1.2, 3), 0.1), delay },
      };
    }
    case "circleSupport": {
      effects.push(
        r() < 0.6
          ? { type: "heal", amount: Math.round(between(r, 80, 250)) }
          : { type: "shield", amount: Math.round(between(r, 80, 250)), duration: round(between(r, 1.5, 4), 0.5) },
      );
      if (r() < 0.3) effects.push({ type: "haste", pct: round(between(r, 0.15, 0.4)), duration: round(between(r, 1, 3), 0.5) });
      return {
        id, cooldown, effects,
        delivery: { type: "circle", castRange: round(between(r, 0, 6), 0.5), radius: round(between(r, 1.5, 3), 0.1), delay: round(between(r, 0, 0.5), 0.1) },
      };
    }
    case "dash": {
      if (r() < 0.6) {
        effects.push(damage);
        if (r() < 0.4) effects.push({ type: "knockback", distance: round(between(r, 1, 3), 0.1) });
      }
      return { id, cooldown, effects, delivery: { type: "dash", distance: round(between(r, 3, 6), 0.5), speed: round(between(r, 12, 18), 1) } };
    }
    case "self": {
      const roll = r();
      if (roll < 0.4) effects.push({ type: "shield", amount: Math.round(between(r, 100, 300)), duration: round(between(r, 1.5, 4), 0.5) });
      else if (roll < 0.7) effects.push({ type: "heal", amount: Math.round(between(r, 80, 250)) });
      if (roll >= 0.4 || r() < 0.5) effects.push({ type: "haste", pct: round(between(r, 0.15, 0.45)), duration: round(between(r, 1, 3.5), 0.5) });
      return { id, cooldown, effects, delivery: { type: "self" } };
    }
  }
}

/**
 * Returns a valid kit worth exactly `target` points, or undefined if this
 * random draw cannot be fitted (the caller just draws again).
 */
export function randomKit(r: Rand, id: string, costs: CostTable, target: number): Kit | undefined {
  const ranged = r() < 0.5;
  const first = randomAbility(r, "a1", false);
  const second = randomAbility(r, "a2", first.effects.some((e) => e.type === "stun"));
  const kit: Kit = {
    schemaVersion: 1,
    id,
    role: "fighter",
    stats: {
      hp: Math.round(between(r, 700, 1800) / 10) * 10,
      moveSpeed: round(between(r, 3, 4.2)),
      armor: round(between(r, 0, 0.3)),
      radius: round(between(r, 0.4, 0.7)),
    },
    basic: ranged
      ? { range: round(between(r, 3.5, 7), 0.5), damage: 1, interval: round(between(r, 0.6, 1.2)), projectileSpeed: round(between(r, 14, 22), 1) }
      : { range: round(between(r, 1.2, 2), 0.1), damage: 1, interval: round(between(r, 0.6, 1.2)) },
    abilities: [first, second],
  };
  // Basic attack cost is linear in damage: solve for the damage that lands on target.
  const lines = kitBudget(kit, costs).lines;
  const withoutBasic = lines.filter((l) => l.label !== "basic").reduce((s, l) => s + l.points, 0);
  const perDamage = lines.find((l) => l.label === "basic")!.points;
  kit.basic.damage = Math.round(((target - withoutBasic) / perDamage) * 10) / 10;
  if (kit.basic.damage < 15 || kit.basic.damage > 150) return undefined;
  return validateKit(kit, costs).ok ? kit : undefined;
}

export function randomField(r: Rand, count: number, costs: CostTable, target: number): Kit[] {
  const kits: Kit[] = [];
  for (let attempts = 0; kits.length < count; attempts++) {
    if (attempts > count * 1000) throw new Error("Impossible de générer assez de kits valides avec ces coûts");
    const kit = randomKit(r, `gen-${kits.length + 1}`, costs, target);
    if (kit) kits.push(kit);
  }
  return kits;
}
