// Power budget for fighter kits (contract v2). Coefficients live in
// data/balance/brawl-costs.json and are PROVISIONAL: they will be calibrated
// by bot-vs-bot simulation, never by tuning one fighter at a time.

import type { FighterKit, Special, Strike } from "./kit.ts";

export interface BrawlCostTable {
  version: number;
  budget: { min: number; max: number };
  survival: { pointsAtBaseHp: number; hpBase: number; weightFactor: number; pointsPerRadiusAboveBase: number; radiusBase: number };
  mobility: { pointsPerMoveSpeed: number; pointsPerJumpSpeed: number };
  light: { pointsPerDps: number; reachFactorPerMetre: number; reachBase: number; pointsPerSecondOfFastStartup: number; startupBase: number };
  heavy: { pointsPerDps: number };
  special: {
    pointsPerDamagePerEnergy: number;
    guardBreakFactor: number;
    projectileRangeFactor: number;
    projectileSpeedFactor: number;
    projectileSpeedBase: number;
    rushDistanceFactor: number;
    areaCastRangeFactor: number;
    areaRadiusFactor: number;
    areaDelayDiscountPerSecond: number;
    areaMaxDelayDiscount: number;
    /**
     * All specials draw on the same energy gauge, so a second or third special adds
     * choice, not more damage per match: the most expensive one is paid in full,
     * the next ones at these weights.
     */
    extraSpecialWeights: number[];
    /** Per-delivery price correction, set by calibration (1 = no correction). */
    deliveryFactor: Record<Special["delivery"]["type"], number>;
  };
}

export interface BudgetLine {
  label: string;
  points: number;
}

export interface BrawlBudget {
  total: number;
  lines: BudgetLine[];
}

const length = (s: Strike) => s.startup + s.active + s.recovery;

/** How easy the delivery makes a special land. */
export function specialMultiplier(sp: Special, c: BrawlCostTable): number {
  const k = c.special;
  const d = sp.delivery;
  switch (d.type) {
    case "projectile":
      return 1 + d.range * k.projectileRangeFactor + (d.speed - k.projectileSpeedBase) * k.projectileSpeedFactor;
    case "rush":
      return 1 + d.distance * k.rushDistanceFactor;
    case "area":
      return (
        (1 + d.castRange * k.areaCastRangeFactor) *
        (1 + d.radius * k.areaRadiusFactor) *
        (1 - Math.min(d.delay * k.areaDelayDiscountPerSecond, k.areaMaxDelayDiscount))
      );
  }
}

export function specialCost(sp: Special, c: BrawlCostTable): number {
  const gb = sp.guardBreak ? c.special.guardBreakFactor : 1;
  const df = c.special.deliveryFactor?.[sp.delivery.type] ?? 1;
  return (sp.damage / sp.energyCost) * c.special.pointsPerDamagePerEnergy * specialMultiplier(sp, c) * gb * df;
}

/** One line per special, weighted by rank (most expensive first, see extraSpecialWeights). */
function specialLines(kit: FighterKit, c: BrawlCostTable): BudgetLine[] {
  const ranked = kit.specials.map((sp) => ({ sp, cost: specialCost(sp, c) })).sort((a, b) => b.cost - a.cost);
  const weights = c.special.extraSpecialWeights ?? [1, 1, 1];
  const weightOf = new Map(ranked.map((r, i) => [r.sp, weights[i] ?? weights.at(-1) ?? 1]));
  return kit.specials.map((sp) => ({ label: `special:${sp.id}`, points: specialCost(sp, c) * weightOf.get(sp)! }));
}

export function fighterBudget(kit: FighterKit, c: BrawlCostTable): BrawlBudget {
  const st = kit.stats;
  const hits = kit.light.hits;
  const comboDamage = hits.reduce((s, h) => s + h.damage, 0);
  const comboTime = hits.reduce((s, h) => s + length(h), 0);
  const avgReach = hits.reduce((s, h) => s + h.reach + h.size, 0) / Math.max(1, hits.length);
  const firstStartup = hits[0]?.startup ?? c.light.startupBase;
  const h = kit.heavy;
  const lines: BudgetLine[] = [
    {
      label: "survie",
      points:
        c.survival.pointsAtBaseHp * (st.hp / c.survival.hpBase) * (1 + (st.weight - 1) * c.survival.weightFactor) -
        (st.radius - c.survival.radiusBase) * c.survival.pointsPerRadiusAboveBase,
    },
    { label: "mobilite", points: st.moveSpeed * c.mobility.pointsPerMoveSpeed + st.jumpSpeed * c.mobility.pointsPerJumpSpeed },
    {
      label: "combo",
      points:
        (comboTime > 0 ? comboDamage / comboTime : 0) * c.light.pointsPerDps * (1 + (avgReach - c.light.reachBase) * c.light.reachFactorPerMetre) +
        (c.light.startupBase - firstStartup) * c.light.pointsPerSecondOfFastStartup,
    },
    { label: "lourde", points: ((h.damage * h.chargeBonus) / (length(h) + h.maxCharge)) * c.heavy.pointsPerDps },
    ...specialLines(kit, c),
  ];
  return { total: lines.reduce((s, l) => s + l.points, 0), lines };
}
