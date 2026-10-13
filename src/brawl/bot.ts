// Generic brawler bot: reads only the world state, outputs the same Command a
// player produces. One personality for every kit; parameters tune its level.

import { hdist, lockTarget, type BrawlWorld, type Command, type Fighter } from "./world.ts";

export interface BrawlBotParams {
  /** Chance per decision to react to an incoming heavy or special (dodge or guard). */
  reactivity: number;
  /** Chance per decision to throw a heavy instead of a light at close range. */
  heavyRate: number;
  /** Seconds between decisions when nothing urgent happens (human-like hesitation). */
  thinkTime: number;
}

export const BOT_LEVELS: Record<"facile" | "normal" | "difficile", BrawlBotParams> = {
  facile: { reactivity: 0.15, heavyRate: 0.15, thinkTime: 0.35 },
  normal: { reactivity: 0.4, heavyRate: 0.2, thinkTime: 0.2 },
  difficile: { reactivity: 0.75, heavyRate: 0.25, thinkTime: 0.1 },
};

export interface BrawlBot {
  params: BrawlBotParams;
  random: () => number;
  nextThinkAt: number;
  guardUntil: number;
  chargeHeavyUntil: number;
  /** Lateral direction used while circling: +1 or -1. */
  strafe: number;
}

export function createBot(random: () => number, params: BrawlBotParams = BOT_LEVELS.normal): BrawlBot {
  return { params, random, nextThinkAt: 0, guardUntil: 0, chargeHeavyUntil: 0, strafe: random() < 0.5 ? 1 : -1 };
}

/** True when the opponent is winding up something we should not stand in front of. */
function threatened(w: BrawlWorld, me: Fighter, foe: Fighter): "heavy" | "special" | "light" | null {
  const a = foe.action;
  const d = hdist(me.pos, foe.pos);
  if (a?.kind === "heavy" && !a.hit && d < 4) return "heavy";
  if (a?.kind === "special" && !a.fired) return "special";
  if (a?.kind === "rush") return "special";
  if (a?.kind === "light" && d < 2.5) return "light";
  if (w.zones.some((z) => z.team !== me.team && hdist(z.center, me.pos) < z.radius + 1)) return "special";
  return null;
}

export function botCommand(w: BrawlWorld, me: Fighter, bot: BrawlBot): Command {
  const cmd: Command = { unit: me.id };
  const foe = lockTarget(w, me);
  if (!me.alive || !foe) return cmd;
  const p = bot.params;
  const d = hdist(me.pos, foe.pos);
  const toFoe = { x: (foe.pos.x - me.pos.x) / (d || 1), z: (foe.pos.z - me.pos.z) / (d || 1) };
  const reach = me.kit.stats.radius + foe.kit.stats.radius + (me.kit.light.hits[0]?.reach ?? 1);

  // Keep held buttons consistent with what we started.
  if (me.action?.kind === "heavy" && me.action.charging) {
    cmd.heavy = w.time < bot.chargeHeavyUntil;
    return cmd;
  }
  if (w.time < bot.guardUntil) {
    cmd.guard = true;
    return cmd;
  }
  if (me.action?.kind === "charge") {
    cmd.charge = me.energy < 90 && d > 9;
    return cmd;
  }

  const threat = threatened(w, me, foe);
  if (threat && bot.random() < p.reactivity) {
    if (threat === "heavy" || (threat === "special" && me.energy >= w.config.dodgeEnergyCost)) {
      cmd.dodge = true;
      cmd.move = { x: -toFoe.z * bot.strafe, z: toFoe.x * bot.strafe };
      return cmd;
    }
    bot.guardUntil = w.time + 0.4;
    cmd.guard = true;
    return cmd;
  }

  // In a combo: keep pressing light so the chain continues.
  if (me.action?.kind === "light") {
    cmd.light = d <= reach + 0.5;
    return cmd;
  }
  if (me.action) return cmd;
  if (w.time < bot.nextThinkAt) {
    cmd.move = d > reach ? toFoe : undefined;
    return cmd;
  }
  bot.nextThinkAt = w.time + p.thinkTime * (0.5 + bot.random());

  if (d <= reach) {
    if (foe.action?.kind === "guard" || bot.random() < p.heavyRate) {
      bot.chargeHeavyUntil = w.time + bot.random() * me.kit.heavy.maxCharge * 0.5;
      cmd.heavy = true;
    } else cmd.light = true;
    return cmd;
  }

  // At range: pick an affordable special that can reach, or close the gap.
  const usable = me.kit.specials
    .map((sp, slot) => ({ sp, slot }))
    .filter(({ sp }) => sp.energyCost <= me.energy)
    .filter(({ sp }) => {
      const del = sp.delivery;
      if (del.type === "projectile") return d <= del.range;
      if (del.type === "rush") return d <= del.distance + reach;
      return d <= del.castRange + del.radius;
    });
  if (usable.length > 0 && bot.random() < 0.5) {
    cmd.special = usable[Math.floor(bot.random() * usable.length)]!.slot;
    return cmd;
  }
  if (d > 10 && me.energy < 60 && bot.random() < 0.5) {
    cmd.charge = true;
    return cmd;
  }
  if (bot.random() < 0.08 && me.energy >= 40) bot.strafe = -bot.strafe;
  const lateral = d < 6 ? 0.5 : 0.2;
  cmd.move = { x: toFoe.x - toFoe.z * bot.strafe * lateral, z: toFoe.z + toFoe.x * bot.strafe * lateral };
  if (bot.random() < 0.03) cmd.jump = true;
  return cmd;
}
