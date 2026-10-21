// A fighter's profile for the select screen: five ratings from 1 to 5 (power, speed,
// reach, toughness, mobility), worked out from the kit's own numbers and ranked against
// the rest of the roster, so they are always true to the data and never typed by hand.

import type { FighterKit } from "./kit.ts";

export const AXES = ["power", "speed", "reach", "toughness", "mobility"] as const;
export type Axis = (typeof AXES)[number];

/** What each rating is made of: several raw measures, each ranked on its own, then averaged. */
export function rawProfile(kit: FighterKit): Record<Axis, number[]> {
  const hits = kit.light.hits;
  const comboDamage = hits.reduce((s, h) => s + h.damage, 0);
  const comboTime = hits.reduce((s, h) => s + h.startup + h.active + h.recovery, 0);
  const specials = kit.specials;
  const avgSpecial = specials.length ? specials.reduce((s, sp) => s + sp.damage, 0) / specials.length : 0;
  const melee = Math.max(...hits.map((h) => h.reach + h.size), kit.heavy.reach + kit.heavy.size);
  let ranged = 0;
  let dash = 0;
  for (const sp of specials) {
    const d = sp.delivery;
    if (d.type === "projectile") ranged = Math.max(ranged, d.range);
    if (d.type === "trap") ranged = Math.max(ranged, d.castRange + d.radius);
    if (d.type === "burst") ranged = Math.max(ranged, d.radius);
    if (d.type === "rush" || d.type === "dive") dash = Math.max(dash, d.distance);
  }
  return {
    power: [comboTime > 0 ? comboDamage / comboTime : 0, kit.heavy.damage, avgSpecial],
    speed: [kit.stats.moveSpeed],
    reach: [melee, ranged],
    toughness: [kit.stats.hp * Math.sqrt(kit.stats.weight)],
    mobility: [kit.stats.jumpSpeed, dash],
  };
}

/**
 * Ratings 1–5 of every kit, ranked against all of them: on each measure the lowest of
 * the roster counts 0 and the highest 1; a rating averages its measures.
 */
export function rateProfiles(kits: FighterKit[]): Map<FighterKit, Record<Axis, number>> {
  const raws = kits.map(rawProfile);
  const out = new Map<FighterKit, Record<Axis, number>>();
  const span = (axis: Axis, i: number) => {
    const values = raws.map((r) => r[axis][i]!);
    return [Math.min(...values), Math.max(...values)] as const;
  };
  const spans = Object.fromEntries(AXES.map((a) => [a, raws[0]?.[a].map((_, i) => span(a, i)) ?? []])) as Record<Axis, (readonly [number, number])[]>;
  kits.forEach((kit, k) => {
    const rating = {} as Record<Axis, number>;
    for (const a of AXES) {
      const parts = raws[k]![a].map((v, i) => {
        const [lo, hi] = spans[a][i]!;
        return hi > lo ? (v - lo) / (hi - lo) : 0.5;
      });
      const mean = parts.reduce((s, p) => s + p, 0) / parts.length;
      rating[a] = 1 + Math.round(mean * 4);
    }
    out.set(kit, rating);
  });
  return out;
}
