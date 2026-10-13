// Per-character metrics from finished matches. Balance is never judged on win
// rate alone: these show *how* a kit wins or loses, and whether it actually
// plays the profile its budget says it has.

import type { World } from "../sim/world.ts";

export interface Metrics {
  matches: number;
  wins: number;
  damageDealt: number;
  damageTaken: number;
  /** Healing done to allies, including self. */
  healing: number;
  shielding: number;
  stunSeconds: number;
  slowSeconds: number;
  knockbackMetres: number;
  abilityCasts: number;
  /** Distinct targets hit by abilities (allies included for support effects). */
  abilityHits: number;
  timeAlive: number;
  deaths: number;
  kills: number;
}

export const emptyMetrics = (): Metrics => ({
  matches: 0, wins: 0, damageDealt: 0, damageTaken: 0, healing: 0, shielding: 0, stunSeconds: 0, slowSeconds: 0,
  knockbackMetres: 0, abilityCasts: 0, abilityHits: 0, timeAlive: 0, deaths: 0, kills: 0,
});

/** Adds the metrics of every unit of a finished match into `byKit`, keyed by kit id. */
export function collectMetrics(w: World, winner: 0 | 1 | null, byKit: Map<string, Metrics>): void {
  const per = w.units.map(() => emptyMetrics());
  const deathAt = w.units.map(() => w.time);
  const hitKeys = w.units.map(() => new Set<string>());
  for (const e of w.events) {
    switch (e.type) {
      case "damage":
        per[e.source]!.damageDealt += e.amount;
        per[e.target]!.damageTaken += e.amount;
        if (e.by !== "basic") hitKeys[e.source]!.add(`${e.by}:${e.t}:${e.target}`);
        break;
      case "heal":
        per[e.source]!.healing += e.amount;
        if (e.by !== "basic") hitKeys[e.source]!.add(`${e.by}:${e.t}:${e.target}`);
        break;
      case "status": {
        const m = per[e.source]!;
        if (e.status === "stun") m.stunSeconds += e.value;
        else if (e.status === "slow") m.slowSeconds += e.value;
        else if (e.status === "knockback") m.knockbackMetres += e.value;
        else if (e.status === "shield") m.shielding += e.value;
        if (e.by !== "basic") hitKeys[e.source]!.add(`${e.by}:${e.t}:${e.target}`);
        break;
      }
      case "cast":
        per[e.unit]!.abilityCasts++;
        break;
      case "death":
        per[e.target]!.deaths++;
        deathAt[e.target] = Math.min(deathAt[e.target]!, e.t);
        if (e.killer !== e.target) per[e.killer]!.kills++;
        break;
    }
  }
  w.units.forEach((u, i) => {
    const m = per[i]!;
    m.matches = 1;
    m.wins = winner === null ? 0.5 : winner === u.team ? 1 : 0;
    m.timeAlive = deathAt[i]!;
    m.abilityHits = hitKeys[i]!.size;
    const total = byKit.get(u.kit.id) ?? emptyMetrics();
    for (const k of Object.keys(m) as (keyof Metrics)[]) total[k] += m[k];
    byKit.set(u.kit.id, total);
  });
}

/** One readable line per kit, averaged per match. */
export function metricsTable(byKit: Map<string, Metrics>): string[] {
  const header =
    "kit          victoires  dégâts inf.  dégâts subis  soin   bouclier  étourdi(s)  ralenti(s)  touches/lancer  survie(s)  morts";
  const rows = [...byKit].map(([id, m]) => {
    const n = m.matches;
    const avg = (v: number) => (v / n).toFixed(0);
    return [
      id.padEnd(12),
      `${((m.wins / n) * 100).toFixed(1)} %`.padStart(9),
      avg(m.damageDealt).padStart(12),
      avg(m.damageTaken).padStart(13),
      avg(m.healing).padStart(5),
      avg(m.shielding).padStart(9),
      (m.stunSeconds / n).toFixed(1).padStart(11),
      (m.slowSeconds / n).toFixed(1).padStart(11),
      (m.abilityCasts ? m.abilityHits / m.abilityCasts : 0).toFixed(2).padStart(15),
      (m.timeAlive / n).toFixed(1).padStart(10),
      (m.deaths / n).toFixed(2).padStart(6),
    ].join(" ");
  });
  return [header, ...rows];
}
