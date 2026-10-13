// Power budget: estimates what a kit is worth, in points, from centralised
// coefficients (data/balance/costs.json). E2 calibrates the coefficients,
// never individual characters.

import type { Ability, Effect, Kit } from "./kit.ts";

export interface CostTable {
  version: number;
  budget: { min: number; max: number };
  stats: {
    hpBase: number;
    pointsPer100Hp: number;
    moveSpeedBase: number;
    pointsPerMoveSpeed: number;
    pointsPerEhpPercentFromArmor: number;
    radiusBase: number;
    pointsPerRadiusBelowBase: number;
  };
  basic: { pointsPerDps: number; rangeFactorPerMetre: number };
  ability: {
    pointsPerValuePerSecond: number;
    effectValue: {
      damage: number;
      heal: number;
      shield: number;
      slowPerPctSecond: number;
      stunPerSecond: number;
      knockbackPerMetre: number;
      hastePerPctSecond: number;
    };
    dashMobilityPerMetre: number;
    rangeFactorPerMetre: number;
    areaFactorPerMetreRadius: number;
    delayDiscountPerSecond: number;
    maxDelayDiscount: number;
    projectileReliability: number;
  };
}

export interface BudgetLine {
  label: string;
  points: number;
}

export interface BudgetReport {
  total: number;
  lines: BudgetLine[];
}

/** Raw value of one effect, per cast, in damage-equivalent units. */
export function effectValue(effect: Effect, c: CostTable): number {
  const v = c.ability.effectValue;
  switch (effect.type) {
    case "damage":
      return effect.amount * v.damage;
    case "heal":
      return effect.amount * v.heal;
    case "shield":
      return effect.amount * v.shield;
    case "slow":
      return effect.pct * effect.duration * v.slowPerPctSecond;
    case "stun":
      return effect.duration * v.stunPerSecond;
    case "knockback":
      return effect.distance * v.knockbackPerMetre;
    case "haste":
      return effect.pct * effect.duration * v.hastePerPctSecond;
  }
}

/** How easy and reliable the delivery makes its effects. */
export function deliveryMultiplier(ability: Ability, c: CostTable): number {
  const a = c.ability;
  const delayDiscount = (delay: number) => 1 - Math.min(delay * a.delayDiscountPerSecond, a.maxDelayDiscount);
  const d = ability.delivery;
  switch (d.type) {
    case "projectile":
      return a.projectileReliability * (1 + d.range * a.rangeFactorPerMetre);
    case "line":
      return delayDiscount(d.delay) * (1 + d.length * a.rangeFactorPerMetre);
    case "circle":
      return delayDiscount(d.delay) * (1 + d.castRange * a.rangeFactorPerMetre) * (1 + d.radius * a.areaFactorPerMetreRadius);
    case "dash":
    case "self":
      return 1;
  }
}

export function abilityCost(ability: Ability, c: CostTable): number {
  let value = ability.effects.reduce((sum, e) => sum + effectValue(e, c), 0) * deliveryMultiplier(ability, c);
  if (ability.delivery.type === "dash") value += ability.delivery.distance * c.ability.dashMobilityPerMetre;
  return (value / ability.cooldown) * c.ability.pointsPerValuePerSecond;
}

export function kitBudget(kit: Kit, c: CostTable): BudgetReport {
  const s = c.stats;
  const st = kit.stats;
  const lines: BudgetLine[] = [
    { label: "hp", points: ((st.hp - s.hpBase) / 100) * s.pointsPer100Hp },
    { label: "moveSpeed", points: (st.moveSpeed - s.moveSpeedBase) * s.pointsPerMoveSpeed },
    { label: "armor", points: (1 / (1 - st.armor) - 1) * 100 * s.pointsPerEhpPercentFromArmor },
    { label: "radius", points: (s.radiusBase - st.radius) * s.pointsPerRadiusBelowBase },
    {
      label: "basic",
      points: (kit.basic.damage / kit.basic.interval) * (1 + kit.basic.range * c.basic.rangeFactorPerMetre) * c.basic.pointsPerDps,
    },
    ...kit.abilities.map((ab) => ({ label: `ability:${ab.id}`, points: abilityCost(ab, c) })),
  ];
  return { total: lines.reduce((sum, l) => sum + l.points, 0), lines };
}
