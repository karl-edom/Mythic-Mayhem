// Kit-agnostic bot: reads the kit data to decide, never the character id.
// Deliberately imperfect, like a human: it aims with some error, notices
// telegraphs after a reaction delay, sometimes misses them, and never
// dodges projectiles.

import { isEnemyEffect, type Ability } from "../sim/kit.ts";
import { dist, norm, sub, type Vec } from "../sim/math.ts";
import { isStunned, zoneContains, type Command, type Unit, type World } from "../sim/world.ts";

export interface BotParams {
  /** Seconds before the bot reacts to a new telegraph. */
  reaction: number;
  /** Maximum aim error for skillshots and zones, in radians. */
  aimError: number;
  /** Probability of noticing a given enemy telegraph at all. */
  dodgeChance: number;
  random: () => number;
  /** Per-zone decision: will this bot dodge it? Decided once, when first seen. */
  noticed?: WeakMap<object, boolean>;
}

/** Average human-ish skill, used for balance runs. */
export function defaultBot(random: () => number): BotParams {
  return { reaction: 0.15 + random() * 0.3, aimError: 0.12, dodgeChance: 0.7, random };
}

function aim(u: Unit, target: Vec, p: BotParams): Vec {
  const angle = (p.random() * 2 - 1) * p.aimError;
  const rel = sub(target, u.pos);
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: u.pos.x + rel.x * c - rel.y * s, y: u.pos.y + rel.x * s + rel.y * c };
}

const RANGED_THRESHOLD = 3;

function nearestEnemy(w: World, u: Unit): Unit | undefined {
  let best: Unit | undefined;
  for (const e of w.units) {
    if (!e.alive || e.team === u.team) continue;
    if (!best || dist(u.pos, e.pos) < dist(u.pos, best.pos)) best = e;
  }
  return best;
}

function mostHurtAlly(w: World, u: Unit, within: number): Unit | undefined {
  let best: Unit | undefined;
  for (const a of w.units) {
    if (!a.alive || a.team !== u.team || dist(u.pos, a.pos) > within) continue;
    if (!best || a.hp / a.kit.stats.hp < best.hp / best.kit.stats.hp) best = a;
  }
  return best;
}

const hpRatio = (u: Unit) => u.hp / u.kit.stats.hp;

/** Picks an ability to cast this tick, or nothing. */
function chooseCast(w: World, u: Unit, enemy: Unit): Command["cast"] {
  const d = dist(u.pos, enemy.pos);
  const ranged = u.kit.basic.range >= RANGED_THRESHOLD;
  for (let slot = 0; slot < u.kit.abilities.length; slot++) {
    const ab: Ability | undefined = u.kit.abilities[slot];
    if (!ab || (u.cooldownUntil[slot] ?? Infinity) > w.time) continue;
    const offensive = ab.effects.some(isEnemyEffect);
    const supportive = ab.effects.some((e) => !isEnemyEffect(e));
    const del = ab.delivery;
    switch (del.type) {
      case "projectile":
        if (d <= del.range * 0.95) return { slot, target: enemy.pos };
        break;
      case "line":
        if (d <= del.length * 0.95) return { slot, target: enemy.pos };
        break;
      case "circle": {
        if (supportive) {
          const ally = mostHurtAlly(w, u, del.castRange + del.radius);
          if (ally && hpRatio(ally) < 0.75) return { slot, target: ally.pos };
        }
        if (offensive && d <= del.castRange + del.radius * 0.8) return { slot, target: enemy.pos };
        break;
      }
      case "dash":
        // A ranged kit never dives in: any dash it owns is an escape tool.
        if (offensive && !ranged) {
          if (d > u.kit.basic.range && d <= del.distance + enemy.kit.stats.radius) return { slot, target: enemy.pos };
        } else {
          const threatened = d < enemy.kit.basic.range + 1 && (ranged || hpRatio(u) < 0.4);
          const closing = d > u.kit.basic.range + 0.5 && !ranged;
          if (threatened) return { slot, target: sub(u.pos, sub(enemy.pos, u.pos)) };
          if (closing && d <= del.distance + u.kit.basic.range) return { slot, target: enemy.pos };
        }
        break;
      case "self": {
        const wantsHaste = ab.effects.some((e) => e.type === "haste") && d > u.kit.basic.range + 1;
        if (hpRatio(u) < 0.7 || wantsHaste) return { slot, target: u.pos };
        break;
      }
    }
  }
  return undefined;
}

/** Direction out of the most urgent enemy telegraph the bot has noticed, if any. */
function dodge(w: World, u: Unit, p: BotParams): Vec | undefined {
  p.noticed ??= new WeakMap();
  for (const z of w.zones) {
    if (z.team === u.team || w.time - z.createdAt < p.reaction) continue;
    if (!z.effects.some(isEnemyEffect) || !zoneContains(z.shape, u.pos, u.kit.stats.radius)) continue;
    if (!p.noticed.has(z)) p.noticed.set(z, p.random() < p.dodgeChance);
    if (!p.noticed.get(z)) continue;
    if (z.shape.type === "circle") return norm(sub(u.pos, z.shape.center));
    const s = z.shape;
    const side = (u.pos.x - s.origin.x) * s.dir.y - (u.pos.y - s.origin.y) * s.dir.x >= 0 ? 1 : -1;
    return { x: s.dir.y * side, y: -s.dir.x * side };
  }
  return undefined;
}

/** Away from the enemy, bent away from walls so the bot does not pin itself in a corner. */
function fleeDirection(w: World, u: Unit, toEnemy: Vec): Vec {
  const { width, height } = w.config.arena;
  const margin = 3;
  const push = (d: number) => (d < margin ? (margin - d) / margin : 0);
  const wall = {
    x: push(u.pos.x) - push(width - u.pos.x),
    y: push(u.pos.y) - push(height - u.pos.y),
  };
  return norm({ x: -toEnemy.x + wall.x * 2, y: -toEnemy.y + wall.y * 2 }, { x: -toEnemy.y, y: toEnemy.x });
}

export function decide(w: World, u: Unit, p: BotParams): Command {
  if (!u.alive || u.dash || isStunned(w, u)) return { unit: u.id };
  const away = dodge(w, u, p);
  if (away) return { unit: u.id, move: away };
  const enemy = nearestEnemy(w, u);
  if (!enemy) return { unit: u.id };
  const choice = chooseCast(w, u, enemy);
  const cast = choice && { slot: choice.slot, target: aim(u, choice.target, p) };
  const d = dist(u.pos, enemy.pos) - enemy.kit.stats.radius;
  const range = u.kit.basic.range;
  const toEnemy = norm(sub(enemy.pos, u.pos));
  // Stop-and-shoot: stand still for the tick the basic attack is ready and in range.
  const canShoot = u.basicReadyAt <= w.time && d <= range;
  let move: Vec | undefined;
  if (canShoot) move = undefined;
  else if (d > range * 0.9) move = toEnemy;
  else if (range >= RANGED_THRESHOLD && d < range * 0.6) move = fleeDirection(w, u, toEnemy);
  return { unit: u.id, ...(move ? { move } : {}), ...(cast ? { cast } : {}) };
}
