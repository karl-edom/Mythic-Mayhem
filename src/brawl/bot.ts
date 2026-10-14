// Generic brawler bot: reads only the world state, outputs the same Command a
// player produces. One personality for every kit; parameters tune its level.

import { canSee, hdist, lockTarget, type BrawlWorld, type Command, type Fighter } from "./world.ts";

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
  /** Where the opponent was last seen, and when. */
  lastSeen: { x: number; z: number } | null;
  lastSeenAt: number;
  /** Random point explored once the trail is cold. */
  wander: { x: number; z: number } | null;
  /** Obstacle avoidance: position last tick and how long we have been stuck. */
  prevPos: { x: number; z: number };
  stuckTicks: number;
  detourUntil: number;
}

export function createBot(random: () => number, params: BrawlBotParams = BOT_LEVELS.normal): BrawlBot {
  return {
    params, random, nextThinkAt: 0, guardUntil: 0, chargeHeavyUntil: 0, strafe: random() < 0.5 ? 1 : -1,
    lastSeen: null, lastSeenAt: -Infinity, wander: null, prevPos: { x: 0, z: 0 }, stuckTicks: 0, detourUntil: 0,
  };
}

/** Seconds the bot keeps heading for the last place it saw its opponent. */
const TRAIL_MEMORY = 4;

/**
 * Walks towards a point, going around obstacles: when the bot stops making
 * progress it sidesteps for a moment, and jumps (low props can be cleared).
 */
function walkTo(w: BrawlWorld, me: Fighter, bot: BrawlBot, to: { x: number; z: number }, cmd: Command): void {
  const dx = to.x - me.pos.x;
  const dz = to.z - me.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const dir = { x: dx / d, z: dz / d };
  if (w.time < bot.detourUntil) {
    cmd.move = { x: dir.x * 0.3 - dir.z * bot.strafe, z: dir.z * 0.3 + dir.x * bot.strafe };
    return;
  }
  cmd.move = dir;
  const moved = Math.hypot(me.pos.x - bot.prevPos.x, me.pos.z - bot.prevPos.z);
  bot.stuckTicks = moved < (me.kit.stats.moveSpeed / w.config.tickRate) * 0.3 ? bot.stuckTicks + 1 : 0;
  if (bot.stuckTicks > 8) {
    bot.stuckTicks = 0;
    bot.detourUntil = w.time + 0.5 + bot.random() * 0.6;
    if (bot.random() < 0.5) bot.strafe = -bot.strafe;
    cmd.jump = true;
  }
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
  const seen = canSee(w, me, foe);
  if (seen) {
    bot.lastSeen = { x: foe.pos.x, z: foe.pos.z };
    bot.lastSeenAt = w.time;
    bot.wander = null;
  }
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

  // Opponent out of sight: follow the trail, then search the arena.
  if (!seen && !me.action) {
    if (bot.lastSeen && w.time - bot.lastSeenAt < TRAIL_MEMORY && hdist(me.pos, { ...bot.lastSeen, y: 0 }) > 1) {
      walkTo(w, me, bot, bot.lastSeen, cmd);
    } else {
      bot.lastSeen = null;
      if (!bot.wander || hdist(me.pos, { ...bot.wander, y: 0 }) < 1.5)
        bot.wander = {
          x: (bot.random() * 2 - 1) * (w.arena.halfW - 3),
          z: (bot.random() * 2 - 1) * (w.arena.halfD - 3),
        };
      walkTo(w, me, bot, bot.wander, cmd);
    }
    bot.prevPos = { x: me.pos.x, z: me.pos.z };
    return cmd;
  }

  // In a combo: keep pressing light so the chain continues.
  if (me.action?.kind === "light") {
    cmd.light = d <= reach + 0.5;
    return cmd;
  }
  if (me.action) return cmd;
  if (w.time < bot.nextThinkAt) {
    if (d > reach) walkTo(w, me, bot, foe.pos, cmd);
    bot.prevPos = { x: me.pos.x, z: me.pos.z };
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
  walkTo(w, me, bot, foe.pos, cmd);
  if (w.time >= bot.detourUntil && cmd.move) {
    const lateral = d < 6 ? 0.5 : 0.2;
    cmd.move = { x: toFoe.x - toFoe.z * bot.strafe * lateral, z: toFoe.z + toFoe.x * bot.strafe * lateral };
  }
  if (bot.random() < 0.03) cmd.jump = true;
  bot.prevPos = { x: me.pos.x, z: me.pos.z };
  return cmd;
}
