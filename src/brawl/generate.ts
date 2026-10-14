// Random fighter kits for calibration: varied, valid, and brought to a target
// budget by scaling their damage only (timings, reach and specials stay as drawn).

import { fighterBudget, type BrawlCostTable } from "./budget.ts";
import { ARCHETYPES, type FighterKit, type Special, type Strike } from "./kit.ts";
import { validateFighter } from "./validate.ts";

const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
const range = (r: () => number, lo: number, hi: number, digits = 2) => Number((lo + r() * (hi - lo)).toFixed(digits));

function strike(r: () => number, last: boolean): Strike {
  return {
    damage: range(r, 20, 60, 0),
    startup: range(r, 0.08, 0.2),
    active: range(r, 0.06, 0.12),
    recovery: last ? range(r, 0.4, 0.6) : range(r, 0.2, 0.32),
    reach: range(r, 0.9, 1.5),
    size: range(r, 0.5, 0.9),
    hitstun: range(r, 0.3, 0.45),
    knockback: last ? range(r, 12, 15) : range(r, 4, 6),
  };
}

function special(r: () => number, i: number): Special {
  const type = pick(r, ["projectile", "rush", "area"] as const);
  const delivery =
    type === "projectile"
      ? { type, speed: range(r, 12, 28), range: range(r, 8, 20), size: range(r, 0.4, 0.8) }
      : type === "rush"
        ? { type, distance: range(r, 4, 10), speed: range(r, 15, 30), size: range(r, 0.6, 1) }
        : { type, castRange: range(r, 0, 14), radius: range(r, 1.5, 3.5), delay: range(r, 0.3, 1.2) };
  const startup = range(r, 0.1, 0.35);
  const telegraph = startup + (delivery.type === "area" ? delivery.delay : 0);
  return {
    id: `s${i}`,
    energyCost: range(r, 15, 60, 0),
    startup,
    recovery: range(r, 0.35, 0.6),
    delivery,
    damage: range(r, 50, 180, 0),
    hitstun: range(r, 0.4, 0.7),
    knockback: range(r, 4, 15),
    guardBreak: telegraph >= 0.4 && r() < 0.25,
  };
}

export function randomFighter(r: () => number, id: string): FighterKit {
  const n = 1 + Math.floor(r() * 3);
  const hits = Array.from({ length: n }, (_, i) => strike(r, i === n - 1));
  return {
    schemaVersion: 3,
    id,
    archetype: pick(r, ARCHETYPES),
    stats: {
      hp: range(r, 750, 1500, 0),
      moveSpeed: range(r, 4, 6.5),
      jumpSpeed: range(r, 8, 12),
      weight: range(r, 0.8, 1.3),
      radius: range(r, 0.4, 0.7),
    },
    light: { hits },
    heavy: {
      damage: range(r, 80, 160, 0),
      startup: range(r, 0.35, 0.6),
      active: range(r, 0.08, 0.15),
      recovery: range(r, 0.6, 0.85),
      reach: range(r, 1.2, 1.7),
      size: range(r, 0.8, 1.1),
      hitstun: range(r, 0.5, 0.7),
      knockback: range(r, 12, 16),
      maxCharge: range(r, 0.5, 1.5),
      chargeBonus: range(r, 1.2, 2),
    },
    specials: Array.from({ length: 1 + Math.floor(r() * 3) }, (_, i) => special(r, i)),
  };
}

/** Same kit with every damage value multiplied by `factor`. */
export function scaleDamage(kit: FighterKit, factor: number): FighterKit {
  const k = structuredClone(kit);
  const s = (v: number) => Math.max(1, Math.round(v * factor));
  for (const h of k.light.hits) h.damage = s(h.damage);
  k.heavy.damage = s(k.heavy.damage);
  for (const sp of k.specials) sp.damage = s(sp.damage);
  return k;
}

/** Scales damage so the kit costs `target` points (± rounding); undefined if out of reach. */
export function fitFighter(kit: FighterKit, costs: BrawlCostTable, target: number): FighterKit | undefined {
  const cost = (f: number) => fighterBudget(scaleDamage(kit, f), costs).total;
  let [lo, hi] = [0.2, 5];
  if (cost(lo) > target || cost(hi) < target) return undefined;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (cost(mid) < target) lo = mid;
    else hi = mid;
  }
  return scaleDamage(kit, lo);
}

/**
 * `n` valid random kits. With a single target they all cost the same; with a
 * [min, max] range each kit draws its own budget (used to measure what a point is worth).
 */
export function randomRoster(r: () => number, n: number, costs: BrawlCostTable, target: number | [number, number]): FighterKit[] {
  const out: FighterKit[] = [];
  // Budget limits are lifted for measurement kits; the real validator still checks everything else.
  const open: BrawlCostTable = { ...costs, budget: { ...costs.budget, min: 0, max: Infinity } };
  for (let tries = 0; out.length < n && tries < n * 50; tries++) {
    const t = typeof target === "number" ? target : target[0] + r() * (target[1] - target[0]);
    const fitted = fitFighter(randomFighter(r, `k${out.length}`), costs, t);
    if (!fitted) continue;
    const v = validateFighter(fitted, open);
    if (v.ok) out.push(v.kit);
  }
  return out;
}
