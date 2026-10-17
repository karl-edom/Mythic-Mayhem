// Generic brawler bot: reads only the world state, outputs the same Command a
// player produces. One personality for every kit; parameters tune its level.

import { distToProp, segmentInterval, surfaceAt, type Arena } from "./arena.ts";
import { canBreak, canSee, grabbable, grounded, hdist, lockTarget, type BrawlWorld, type Command, type Fighter } from "./world.ts";

export interface BrawlBotParams {
  /** Chance per decision to react to an incoming heavy or special (dodge or guard). */
  reactivity: number;
  /** Chance per decision to throw a heavy instead of a light at close range. */
  heavyRate: number;
  /** Seconds between decisions when nothing urgent happens (human-like hesitation). */
  thinkTime: number;
  /** Chance per decision to fire an affordable special that can reach. */
  specialRate: number;
}

export const BOT_LEVELS: Record<"facile" | "normal" | "difficile", BrawlBotParams> = {
  facile: { reactivity: 0.15, heavyRate: 0.15, thinkTime: 0.35, specialRate: 0.4 },
  normal: { reactivity: 0.4, heavyRate: 0.2, thinkTime: 0.2, specialRate: 0.7 },
  difficile: { reactivity: 0.75, heavyRate: 0.25, thinkTime: 0.1, specialRate: 0.85 },
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
  /** Prop the bot is walking to, to pick it up and throw it. */
  fetch: { prop: number; until: number } | null;
  /** Way up to an opponent standing too high to reach by jumping: foot of a ramp, its top, then off it. */
  route: { points: { x: number; z: number }[]; until: number } | null;
  /** Rhythm v3: after an exchange the bot steps back and plays the distance until then. */
  backoffUntil: number;
  /** Own action kind last tick, to notice when an attack ends. */
  lastAction: string | null;
  /** The jump being taken off is a full one (else a short hop). */
  fullHop: boolean;
  /** When to reconsider which enemy to focus (matches of 3 or more). */
  retargetAt: number;
}

export function createBot(random: () => number, params: BrawlBotParams = BOT_LEVELS.normal): BrawlBot {
  return {
    params, random, nextThinkAt: 0, guardUntil: 0, chargeHeavyUntil: 0, strafe: random() < 0.5 ? 1 : -1,
    lastSeen: null, lastSeenAt: -Infinity, wander: null, prevPos: { x: 0, z: 0 }, stuckTicks: 0, detourUntil: 0, fetch: null, route: null,
    backoffUntil: 0, lastAction: null, fullHop: true, retargetAt: 0,
  };
}

/** Above this, an opponent is out of reach of a jump: the bot looks for a ramp or stairs. */
const CLIMB_NEEDED = 1.2;

/** Ramp (or stairs) whose top is closest to `to`, as walking points: below its foot, up it, onto what it leads to. */
function routeUp(arena: Arena, to: { x: number; z: number }, minTop: number): { x: number; z: number }[] | null {
  let best: { pts: { x: number; z: number }[]; d: number } | null = null;
  for (const p of arena.props) {
    if (!p.alive || !p.rise || p.height < minTop) continue;
    const half = p.rise.axis === "x" ? p.halfW : p.halfD;
    const at = (k: number) =>
      p.rise!.axis === "x" ? { x: p.x + p.rise!.sign * k, z: p.z } : { x: p.x, z: p.z + p.rise!.sign * k };
    const top = at(half + 1);
    const d = Math.hypot(top.x - to.x, top.z - to.z);
    if (!best || d < best.d) best = { pts: [at(-half - 1), at(half - 0.3), top], d };
  }
  return best?.pts ?? null;
}

/** Where to walk to reach the opponent: straight at them, or by the way up if they are perched. */
function chasePoint(w: BrawlWorld, me: Fighter, bot: BrawlBot, foe: Fighter): { x: number; z: number } {
  if (foe.floor - me.pos.y <= CLIMB_NEEDED) {
    bot.route = null;
    return foe.pos;
  }
  if (!bot.route || w.time > bot.route.until) {
    const pts = routeUp(w.arena, foe.pos, foe.floor - 0.5);
    bot.route = pts ? { points: pts, until: w.time + 12 } : null;
  }
  const r = bot.route;
  if (!r || r.points.length === 0) return foe.pos;
  if (Math.hypot(me.pos.x - r.points[0]!.x, me.pos.z - r.points[0]!.z) < 1) r.points.shift();
  return r.points[0] ?? foe.pos;
}

/**
 * If a prop too tall to step onto stands on the straight line to `goal`, returns
 * the corner of that prop (with some margin) giving the shortest way round.
 */
function steerAround(w: BrawlWorld, me: Fighter, goal: { x: number; z: number }): { x: number; z: number } {
  let first: { p: (typeof w.arena.props)[number]; t: number } | null = null;
  for (const p of w.arena.props) {
    if (!p.alive || distToProp(p, goal.x, goal.z) === 0) continue;
    const iv = segmentInterval(p, me.pos, goal);
    if (!iv) continue;
    const x = me.pos.x + (goal.x - me.pos.x) * iv[0];
    const z = me.pos.z + (goal.z - me.pos.z) * iv[0];
    if (surfaceAt(p, x, z) <= me.pos.y + 0.45) continue; // can walk onto it
    if (!first || iv[0] < first.t) first = { p, t: iv[0] };
  }
  if (!first) return goal;
  const p = first.p;
  const m = me.kit.stats.radius + 0.6;
  const corners = [
    { x: p.x - p.halfW - m, z: p.z - p.halfD - m },
    { x: p.x + p.halfW + m, z: p.z - p.halfD - m },
    { x: p.x - p.halfW - m, z: p.z + p.halfD + m },
    { x: p.x + p.halfW + m, z: p.z + p.halfD + m },
  ];
  const cost = (c: { x: number; z: number }) =>
    Math.hypot(c.x - me.pos.x, c.z - me.pos.z) + Math.hypot(goal.x - c.x, goal.z - c.z);
  // Skip a corner we are already standing at, so we move on to the next leg.
  const usable = corners.filter((c) => Math.hypot(c.x - me.pos.x, c.z - me.pos.z) > 0.6);
  return (usable.length ? usable : corners).sort((a, b) => cost(a) - cost(b))[0]!;
}

/** Seconds the bot keeps heading for the last place it saw its opponent. */
const TRAIL_MEMORY = 4;

/**
 * Walks towards a point, going around obstacles: when the bot stops making
 * progress it sidesteps for a moment, and jumps (low props can be cleared).
 */
function walkTo(w: BrawlWorld, me: Fighter, bot: BrawlBot, goal: { x: number; z: number }, cmd: Command): void {
  const to = steerAround(w, me, goal);
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
    bot.fullHop = true; // getting over an obstacle needs the whole jump
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

/**
 * In a match of three or more, which enemy to go for: the nearest, but not one that
 * others are already on (so that bots do not all pile on the same fighter), and a
 * wounded one a little more readily. Decided every second or so, not every tick.
 */
function pickTarget(w: BrawlWorld, me: Fighter, bot: BrawlBot): number | undefined {
  const enemies = w.fighters.filter((o) => o.alive && o.team !== me.team);
  if (enemies.length < 2) return undefined;
  const current = me.target !== null ? w.fighters[me.target] : undefined;
  if (w.time < bot.retargetAt && current?.alive) return undefined;
  bot.retargetAt = w.time + 0.9 + bot.random() * 0.8;
  let best: Fighter | undefined;
  let bestCost = Infinity;
  for (const o of enemies) {
    const busy = w.fighters.filter((x) => x !== me && x.alive && x.target === o.id && x.team !== o.team).length;
    const cost = hdist(me.pos, o.pos) + 5 * busy - 3 * (1 - o.hp / o.kit.stats.hp) + bot.random() * 2;
    if (cost < bestCost) [best, bestCost] = [o, cost];
  }
  return best?.id;
}

export function botCommand(w: BrawlWorld, me: Fighter, bot: BrawlBot): Command {
  const cmd: Command = { unit: me.id };
  const chosen = me.alive ? pickTarget(w, me, bot) : undefined;
  if (chosen !== undefined) cmd.target = chosen;
  // The command takes effect this tick; plan with the new target from now (the world
  // itself only changes through the command).
  const foe = chosen !== undefined ? w.fighters[chosen] : lockTarget(w, me);
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
  // Out of reach above us counts as far: no swinging at the underside of a platform.
  const perched = foe.floor - me.pos.y > CLIMB_NEEDED;
  const reach = perched ? -1 : me.kit.stats.radius + foe.kit.stats.radius + (me.kit.light.hits[0]?.reach ?? 1);

  // Keep held buttons consistent with what we started: full jump or short hop.
  if (me.action?.kind === "jumpsquat") {
    cmd.jumpHeld = bot.fullHop;
    return cmd;
  }
  // Keep held buttons consistent with what we started.
  if (me.action?.kind === "heavy" && me.action.charging) {
    cmd.heavy = w.time < bot.chargeHeavyUntil;
    return cmd;
  }
  // An exchange just ended (our attack is over): step back and play the distance for a moment.
  const ended = bot.lastAction !== null && ["light", "heavy", "special", "aerial"].includes(bot.lastAction) && !me.action;
  bot.lastAction = me.action?.kind ?? null;
  if (ended) bot.backoffUntil = w.time + 0.5 + bot.random() * 0.8;

  // A missed blow is an opening: punish it when in reach.
  const fa = foe.action;
  const whiffed =
    (fa?.kind === "light" && !fa.hit && fa.t > foe.kit.light.hits[fa.index]!.startup + foe.kit.light.hits[fa.index]!.active) ||
    (fa?.kind === "heavy" && !fa.charging && !fa.hit && fa.t > foe.kit.heavy.startup + foe.kit.heavy.active);
  if (whiffed && !me.action && d <= reach + 0.3 && bot.random() < p.reactivity) {
    cmd.light = true;
    return cmd;
  }

  // Under pressure (taking hits or blocking): break out now and then, more often the sharper the bot.
  if (canBreak(w, me) && bot.random() < p.reactivity * 0.04) {
    cmd.dodge = true;
    return cmd;
  }
  if (w.time < bot.guardUntil) {
    cmd.guard = true;
    return cmd;
  }
  if (me.action?.kind === "charge") {
    cmd.charge = me.energy < 90 && (d > 9 || !seen);
    return cmd;
  }

  const threat = threatened(w, me, foe);
  if (threat && bot.random() < p.reactivity) {
    if (threat === "heavy" || (threat === "special" && me.energy >= w.config.dodgeEnergyCost)) {
      cmd.dodge = true;
      cmd.move = { x: -toFoe.z * bot.strafe, z: toFoe.x * bot.strafe };
      return cmd;
    }
    // A worn shield is not worth raising: better to get out of the way.
    if (me.shield < w.config.shieldMax * 0.3) {
      if (me.energy >= w.config.dodgeEnergyCost) {
        cmd.dodge = true;
        cmd.move = { x: -toFoe.z * bot.strafe, z: toFoe.x * bot.strafe };
      }
      return cmd;
    }
    bot.guardUntil = w.time + 0.4;
    cmd.guard = true;
    return cmd;
  }

  // Opponent out of sight: recharge if low, else follow the trail, then search the arena.
  if (!seen && !me.action && me.energy < 60 && bot.random() < 0.3) {
    cmd.charge = true;
    return cmd;
  }
  if (!seen && !me.action) {
    if (bot.lastSeen && w.time - bot.lastSeenAt < TRAIL_MEMORY && hdist(me.pos, { ...bot.lastSeen, y: 0 }) > 1) {
      // Lost from sight because perched above us: take the way up rather than walk under them.
      walkTo(w, me, bot, perched ? chasePoint(w, me, bot, foe) : bot.lastSeen, cmd);
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

  // Carrying a prop: get in range, then throw it.
  if (me.carrying !== null && !me.action) {
    if (d < 14 && bot.random() < 0.15) cmd.grab = true;
    else walkTo(w, me, bot, chasePoint(w, me, bot, foe), cmd);
    bot.prevPos = { x: me.pos.x, z: me.pos.z };
    return cmd;
  }

  // Fetching a prop to throw.
  if (bot.fetch && !me.action) {
    const prop = w.arena.props[bot.fetch.prop]!;
    if (!prop.alive || w.time > bot.fetch.until) bot.fetch = null;
    else if (grabbable(w, me) === prop) {
      bot.fetch = null;
      cmd.grab = true;
      return cmd;
    } else {
      walkTo(w, me, bot, prop, cmd);
      bot.prevPos = { x: me.pos.x, z: me.pos.z };
      return cmd;
    }
  }

  // In the air near the opponent: aerial strike.
  if (!me.action && !grounded(me) && !perched && d <= reach + 0.5) {
    cmd.light = true;
    return cmd;
  }

  // Backing off: keep 4–6 m, circle, harass with projectiles; never walk back in.
  if (w.time < bot.backoffUntil && !me.action && seen && !perched) {
    const away = d < 4 ? -1 : d > 6 ? 0.4 : 0;
    cmd.move = { x: toFoe.x * away - toFoe.z * bot.strafe * 0.7, z: toFoe.z * away + toFoe.x * bot.strafe * 0.7 };
    const shot = me.kit.specials.findIndex((sp) => sp.delivery.type === "projectile" && sp.energyCost <= me.energy && d <= sp.delivery.range);
    if (shot >= 0 && bot.random() < p.specialRate * 0.03) cmd.special = shot;
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
    if (d > reach) walkTo(w, me, bot, chasePoint(w, me, bot, foe), cmd);
    bot.prevPos = { x: me.pos.x, z: me.pos.z };
    return cmd;
  }
  bot.nextThinkAt = w.time + p.thinkTime * (0.5 + bot.random());

  // Affordable specials that can reach the opponent from here.
  const usable = me.kit.specials
    .map((sp, slot) => ({ sp, slot }))
    .filter(({ sp }) => sp.energyCost <= me.energy)
    .filter(({ sp }) => {
      const del = sp.delivery;
      if (del.type === "projectile") return d <= del.range;
      if (del.type === "rush") return d <= del.distance + reach;
      if (del.type === "leap") return d <= del.range + del.radius;
      // The counter is a read: only against a blow already coming.
      if (del.type === "counter") {
        const k = foe.action?.kind;
        return (k === "rush" && d <= 8) || ((k === "light" || k === "heavy" || k === "aerial") && d <= reach + 1.5);
      }
      return d <= del.castRange + del.radius;
    });

  if (d <= reach) {
    // Up close, specials are a strong alternative to the combo.
    if (usable.length > 0 && bot.random() < p.specialRate * 0.4) {
      cmd.special = usable[Math.floor(bot.random() * usable.length)]!.slot;
      return cmd;
    }
    if (foe.action?.kind === "guard" || bot.random() < p.heavyRate) {
      bot.chargeHeavyUntil = w.time + bot.random() * me.kit.heavy.maxCharge * 0.5;
      cmd.heavy = true;
    } else cmd.light = true;
    return cmd;
  }

  // At range, sometimes pick up a nearby prop to throw.
  if (d > reach + 2 && bot.random() < 0.3) {
    const near = w.arena.props
      .filter((p) => p.alive && p.kind.throwable && distToProp(p, me.pos.x, me.pos.z) < 4)
      .sort((a, b) => distToProp(a, me.pos.x, me.pos.z) - distToProp(b, me.pos.x, me.pos.z))[0];
    if (near) {
      bot.fetch = { prop: near.id, until: w.time + 2 };
      return cmd;
    }
  }

  // At range: fire an affordable special that can reach, or close the gap.
  if (usable.length > 0 && bot.random() < p.specialRate) {
    cmd.special = usable[Math.floor(bot.random() * usable.length)]!.slot;
    return cmd;
  }
  if (d > 10 && me.energy < 60 && bot.random() < 0.5) {
    cmd.charge = true;
    return cmd;
  }
  if (bot.random() < 0.08 && me.energy >= 40) bot.strafe = -bot.strafe;
  walkTo(w, me, bot, chasePoint(w, me, bot, foe), cmd);
  if (w.time >= bot.detourUntil && cmd.move && !perched) {
    const lateral = d < 6 ? 0.5 : 0.2;
    cmd.move = { x: toFoe.x - toFoe.z * bot.strafe * lateral, z: toFoe.z + toFoe.x * bot.strafe * lateral };
  }
  // Approaching: sometimes by the air (jump, then the aerial strike above).
  if (!perched && bot.random() < (d < 5 ? 0.08 : 0.03)) {
    cmd.jump = true;
    // Close in: often a short hop, the quick way into an aerial strike.
    bot.fullHop = d > 4 || bot.random() < 0.4;
  }
  bot.prevPos = { x: me.pos.x, z: me.pos.z };
  return cmd;
}
