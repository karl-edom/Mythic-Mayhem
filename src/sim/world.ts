// Headless, fixed-step combat simulation. No rendering, no I/O, no clock:
// state advances only through step(world, commands). Bots, local input and
// (later) the network all feed the same Command type.

import { isEnemyEffect, type Ability, type Effect, type Kit } from "./kit.ts";
import { add, dist, distToSegment, dot, norm, scale, sub, type Vec } from "./math.ts";

export interface SimConfig {
  tickRate: number;
  arena: { width: number; height: number };
  /** Seconds before a dead unit comes back; Infinity = elimination. */
  respawnTime: number;
  /** Seconds a unit stays rooted after firing a basic attack (the cost of kiting). */
  basicAttackLock: number;
}

export const DEFAULT_CONFIG: SimConfig = {
  tickRate: 30,
  arena: { width: 24, height: 14 },
  respawnTime: 5,
  basicAttackLock: 0.25,
};

/** Who caused an effect: an ability slot, or the basic attack. */
export type Source = number | "basic";

interface Timed {
  pct: number;
  until: number;
}

export interface Unit {
  id: number;
  team: number;
  kit: Kit;
  spawn: Vec;
  pos: Vec;
  facing: Vec;
  hp: number;
  alive: boolean;
  respawnAt: number;
  shields: { amount: number; until: number }[];
  slows: Timed[];
  hastes: Timed[];
  stunUntil: number;
  cooldownUntil: number[];
  basicReadyAt: number;
  /** Rooted after a basic attack until this time. */
  lockedUntil: number;
  dash: { dir: Vec; remaining: number; speed: number; slot: number } | null;
  /** Set during a tick when the unit moved by its own will; basic attacks need standing still. */
  moved: boolean;
}

export interface Projectile {
  owner: number;
  team: number;
  source: Source;
  pos: Vec;
  dir: Vec;
  speed: number;
  remaining: number;
  width: number;
  effects: Effect[];
  /** Basic attacks home in on their target and cannot miss. */
  homingTarget?: number;
}

export type ZoneShape =
  | { type: "circle"; center: Vec; radius: number }
  | { type: "line"; origin: Vec; dir: Vec; length: number; width: number };

/** A telegraphed area: visible from creation, resolves at triggerAt. */
export interface Zone {
  owner: number;
  team: number;
  slot: number;
  shape: ZoneShape;
  createdAt: number;
  triggerAt: number;
  effects: Effect[];
}

export type SimEvent =
  | { t: number; type: "cast"; unit: number; slot: number }
  | { t: number; type: "damage"; source: number; target: number; amount: number; by: Source }
  | { t: number; type: "heal"; source: number; target: number; amount: number; by: Source }
  | {
      t: number;
      type: "status";
      source: number;
      target: number;
      status: "slow" | "stun" | "knockback" | "shield" | "haste";
      /** Seconds for timed statuses, metres for knockback, absorb amount for shields. */
      value: number;
      by: Source;
    }
  | { t: number; type: "death"; target: number; killer: number }
  | { t: number; type: "respawn"; unit: number };

export interface Command {
  unit: number;
  /** Desired movement direction (normalised by the sim); omitted or zero = stand still. */
  move?: Vec;
  cast?: { slot: number; target: Vec };
}

export interface World {
  config: SimConfig;
  tick: number;
  time: number;
  units: Unit[];
  projectiles: Projectile[];
  zones: Zone[];
  events: SimEvent[];
}

export function createWorld(spawns: { kit: Kit; team: number; pos: Vec }[], config: SimConfig = DEFAULT_CONFIG): World {
  return {
    config,
    tick: 0,
    time: 0,
    units: spawns.map((s, id) => ({
      id,
      team: s.team,
      kit: s.kit,
      spawn: { ...s.pos },
      pos: { ...s.pos },
      facing: { x: s.team === 0 ? 1 : -1, y: 0 },
      hp: s.kit.stats.hp,
      alive: true,
      respawnAt: Infinity,
      shields: [],
      slows: [],
      hastes: [],
      stunUntil: 0,
      cooldownUntil: s.kit.abilities.map(() => 0),
      basicReadyAt: 0,
      lockedUntil: 0,
      dash: null,
      moved: false,
    })),
    projectiles: [],
    zones: [],
    events: [],
  };
}

export const isStunned = (w: World, u: Unit) => u.stunUntil > w.time;

export function moveSpeed(u: Unit): number {
  const slow = u.slows.reduce((m, s) => Math.max(m, s.pct), 0);
  const haste = u.hastes.reduce((m, s) => Math.max(m, s.pct), 0);
  return u.kit.stats.moveSpeed * (1 - slow) * (1 + haste);
}

export function shieldTotal(u: Unit): number {
  return u.shields.reduce((sum, s) => sum + s.amount, 0);
}

function clampToArena(w: World, p: Vec, r: number): Vec {
  const { width, height } = w.config.arena;
  return { x: Math.min(width - r, Math.max(r, p.x)), y: Math.min(height - r, Math.max(r, p.y)) };
}

function enemiesOf(w: World, team: number): Unit[] {
  return w.units.filter((u) => u.alive && u.team !== team);
}

export function applyEffect(w: World, sourceId: number, target: Unit, effect: Effect, origin: Vec, by: Source): void {
  if (!target.alive) return;
  const t = w.time;
  switch (effect.type) {
    case "damage": {
      let amount = effect.amount * (1 - target.kit.stats.armor);
      for (const s of target.shields) {
        const absorbed = Math.min(s.amount, amount);
        s.amount -= absorbed;
        amount -= absorbed;
      }
      target.shields = target.shields.filter((s) => s.amount > 0);
      target.hp -= amount;
      w.events.push({ t, type: "damage", source: sourceId, target: target.id, amount, by });
      if (target.hp <= 0) {
        target.hp = 0;
        target.alive = false;
        target.dash = null;
        target.respawnAt = t + w.config.respawnTime;
        w.events.push({ t, type: "death", target: target.id, killer: sourceId });
      }
      return;
    }
    case "heal": {
      const amount = Math.min(effect.amount, target.kit.stats.hp - target.hp);
      target.hp += amount;
      w.events.push({ t, type: "heal", source: sourceId, target: target.id, amount, by });
      return;
    }
    case "shield":
      target.shields.push({ amount: effect.amount, until: t + effect.duration });
      break;
    case "slow":
      target.slows.push({ pct: effect.pct, until: t + effect.duration });
      break;
    case "haste":
      target.hastes.push({ pct: effect.pct, until: t + effect.duration });
      break;
    case "stun":
      target.stunUntil = Math.max(target.stunUntil, t + effect.duration);
      target.dash = null;
      break;
    case "knockback": {
      const dir = norm(sub(target.pos, origin), target.facing);
      target.pos = clampToArena(w, add(target.pos, scale(dir, effect.distance)), target.kit.stats.radius);
      target.dash = null;
      break;
    }
  }
  const value =
    effect.type === "knockback" ? effect.distance : effect.type === "shield" ? effect.amount : effect.duration;
  w.events.push({ t, type: "status", source: sourceId, target: target.id, status: effect.type, value, by });
}

/** Applies a list of effects to one unit, keeping only those meant for its side. */
function applyEffects(w: World, source: Unit, target: Unit, effects: Effect[], origin: Vec, by: Source): void {
  const enemy = target.team !== source.team;
  for (const e of effects) if (isEnemyEffect(e) === enemy) applyEffect(w, source.id, target, e, origin, by);
}

function cast(w: World, u: Unit, slot: number, target: Vec): void {
  const ab: Ability | undefined = u.kit.abilities[slot];
  if (!ab || (u.cooldownUntil[slot] ?? Infinity) > w.time) return;
  u.cooldownUntil[slot] = w.time + ab.cooldown;
  const dir = norm(sub(target, u.pos), u.facing);
  u.facing = dir;
  const d = ab.delivery;
  switch (d.type) {
    case "projectile":
      w.projectiles.push({
        owner: u.id, team: u.team, source: slot, pos: { ...u.pos }, dir, speed: d.speed, remaining: d.range, width: d.width, effects: ab.effects,
      });
      break;
    case "line":
      w.zones.push({
        owner: u.id, team: u.team, slot, createdAt: w.time, triggerAt: w.time + d.delay, effects: ab.effects,
        shape: { type: "line", origin: { ...u.pos }, dir, length: d.length, width: d.width },
      });
      break;
    case "circle": {
      const offset = sub(target, u.pos);
      const reach = Math.min(Math.hypot(offset.x, offset.y), d.castRange);
      const center = clampToArena(w, add(u.pos, scale(dir, reach)), 0);
      w.zones.push({
        owner: u.id, team: u.team, slot, createdAt: w.time, triggerAt: w.time + d.delay, effects: ab.effects,
        shape: { type: "circle", center, radius: d.radius },
      });
      break;
    }
    case "dash":
      u.dash = { dir, remaining: d.distance, speed: d.speed, slot };
      break;
    case "self":
      applyEffects(w, u, u, ab.effects, u.pos, slot);
      break;
  }
  w.events.push({ t: w.time, type: "cast", unit: u.id, slot });
}

export function zoneContains(shape: ZoneShape, p: Vec, r: number): boolean {
  if (shape.type === "circle") return dist(p, shape.center) <= shape.radius + r;
  const rel = sub(p, shape.origin);
  const along = dot(rel, shape.dir);
  const across = Math.abs(rel.x * shape.dir.y - rel.y * shape.dir.x);
  return along >= -r && along <= shape.length + r && across <= shape.width / 2 + r;
}

export function step(w: World, commands: Command[]): void {
  const dt = 1 / w.config.tickRate;
  w.tick++;
  w.time = w.tick * dt;
  const t = w.time;

  for (const u of w.units) {
    u.moved = false;
    u.shields = u.shields.filter((s) => s.until > t);
    u.slows = u.slows.filter((s) => s.until > t);
    u.hastes = u.hastes.filter((s) => s.until > t);
    if (!u.alive && u.respawnAt <= t) {
      Object.assign(u, {
        alive: true, hp: u.kit.stats.hp, pos: { ...u.spawn }, respawnAt: Infinity,
        shields: [], slows: [], hastes: [], stunUntil: 0,
      });
      w.events.push({ t, type: "respawn", unit: u.id });
    }
  }

  // 1. Commands: casts, then voluntary movement.
  for (const c of commands) {
    const u = w.units[c.unit];
    if (!u || !u.alive || isStunned(w, u) || u.dash) continue;
    if (c.cast) cast(w, u, c.cast.slot, c.cast.target);
    if (u.dash || u.lockedUntil > t || !c.move || (c.move.x === 0 && c.move.y === 0)) continue;
    const dir = norm(c.move);
    u.facing = dir;
    const before = u.pos;
    u.pos = clampToArena(w, add(u.pos, scale(dir, moveSpeed(u) * dt)), u.kit.stats.radius);
    // Pushing against a wall is not moving.
    u.moved = dist(before, u.pos) > 1e-6;
  }

  // 2. Dashes: move, and hit the first enemy touched.
  for (const u of w.units) {
    if (!u.dash || !u.alive) continue;
    const d = u.dash;
    const stepLen = Math.min(d.speed * dt, d.remaining);
    const from = u.pos;
    u.pos = clampToArena(w, add(u.pos, scale(d.dir, stepLen)), u.kit.stats.radius);
    d.remaining -= stepLen;
    u.moved = true;
    const ab = u.kit.abilities[d.slot];
    const hasEnemyEffects = !!ab && ab.effects.some(isEnemyEffect);
    const hit = hasEnemyEffects
      ? enemiesOf(w, u.team).find((e) => distToSegment(e.pos, from, u.pos) <= e.kit.stats.radius + u.kit.stats.radius)
      : undefined;
    if (hit && ab) {
      u.dash = null;
      applyEffects(w, u, hit, ab.effects, u.pos, d.slot);
    } else if (d.remaining <= 1e-9) {
      u.dash = null;
    }
  }

  // 3. Basic attacks: automatic, only when standing still.
  for (const u of w.units) {
    if (!u.alive || u.moved || u.dash || isStunned(w, u) || u.basicReadyAt > t) continue;
    const b = u.kit.basic;
    let best: Unit | undefined;
    let bestD = Infinity;
    for (const e of enemiesOf(w, u.team)) {
      const d = dist(u.pos, e.pos) - e.kit.stats.radius;
      if (d <= b.range && d < bestD) [best, bestD] = [e, d];
    }
    if (!best) continue;
    u.basicReadyAt = t + b.interval;
    u.lockedUntil = t + w.config.basicAttackLock;
    u.facing = norm(sub(best.pos, u.pos), u.facing);
    const effects: Effect[] = [{ type: "damage", amount: b.damage }];
    if (b.projectileSpeed === undefined) applyEffects(w, u, best, effects, u.pos, "basic");
    else
      w.projectiles.push({
        owner: u.id, team: u.team, source: "basic", pos: { ...u.pos }, dir: u.facing, speed: b.projectileSpeed,
        remaining: Infinity, width: 0, effects, homingTarget: best.id,
      });
  }

  // 4. Projectiles.
  w.projectiles = w.projectiles.filter((p) => {
    const owner = w.units[p.owner];
    if (!owner) return false;
    if (p.homingTarget !== undefined) {
      const target = w.units[p.homingTarget];
      if (!target || !target.alive) return false;
      const to = sub(target.pos, p.pos);
      const d = Math.hypot(to.x, to.y);
      if (d <= p.speed * dt + target.kit.stats.radius) {
        applyEffects(w, owner, target, p.effects, p.pos, p.source);
        return false;
      }
      p.pos = add(p.pos, scale(norm(to), p.speed * dt));
      return true;
    }
    const stepLen = Math.min(p.speed * dt, p.remaining);
    const from = p.pos;
    p.pos = add(p.pos, scale(p.dir, stepLen));
    p.remaining -= stepLen;
    const hit = enemiesOf(w, p.team).find((e) => distToSegment(e.pos, from, p.pos) <= e.kit.stats.radius + p.width / 2);
    if (hit) {
      applyEffects(w, owner, hit, p.effects, from, p.source);
      return false;
    }
    return p.remaining > 1e-9;
  });

  // 5. Telegraphed zones resolve.
  w.zones = w.zones.filter((z) => {
    if (z.triggerAt > t) return true;
    const owner = w.units[z.owner];
    if (!owner) return false;
    const origin = z.shape.type === "circle" ? z.shape.center : z.shape.origin;
    for (const u of w.units) {
      if (u.alive && zoneContains(z.shape, u.pos, u.kit.stats.radius)) applyEffects(w, owner, u, z.effects, origin, z.slot);
    }
    return false;
  });
}
