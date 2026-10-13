// Headless, fixed-step arena-brawler simulation (combat contract v2).
// No rendering, no I/O, no clock, no randomness: state advances only through
// step(world, commands). Local input, bots and (later) the network all feed
// the same Command type. Positions are metres, y is up, the floor is y = 0.

import type { FighterKit, Special, Strike } from "./kit.ts";

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Rules shared by every fighter. Changing one is a change of the combat contract. */
export interface BrawlConfig {
  tickRate: number;
  /** The arena is a disc of this radius centred on the origin, closed by a wall. */
  arenaRadius: number;
  gravity: number;
  /** K.-O. needed to fill a team's victory gauge. */
  koToWin: number;
  /** Seconds; at the end, most K.-O. wins, then remaining HP ratio. */
  timeLimit: number;
  respawnDelay: number;
  respawnInvulnerable: number;
  /** Share of damage still taken through guard. */
  guardChip: number;
  /** Seconds a fighter is stuck after blocking a hit. */
  blockstun: number;
  /** Seconds a fighter is stunned when a guard-breaking hit lands on their guard. */
  guardBreakStun: number;
  /** Share of damage a guard-breaking hit deals through guard. */
  guardBreakDamage: number;
  dodgeDistance: number;
  dodgeDuration: number;
  /** Invulnerability at the start of a dodge, seconds. */
  dodgeInvulnerable: number;
  dodgeEnergyCost: number;
  energyMax: number;
  energyStart: number;
  /** Passive energy regeneration, per second. */
  energyRegen: number;
  /** Energy regeneration while charging (immobile, vulnerable), per second. */
  energyChargeRate: number;
  /** Knockback speed (after weight) from which a hit floors the target. */
  knockdownSpeed: number;
  /** Extra time on the floor after a knockdown, then a short invulnerable get-up. */
  knockdownTime: number;
  getUpInvulnerable: number;
  /** Ground friction on knockback speed, m/s². */
  friction: number;
  /** Seconds a light-attack press is remembered while busy. */
  inputBuffer: number;
}

export const BRAWL_CONFIG: BrawlConfig = {
  tickRate: 60,
  arenaRadius: 16,
  gravity: 28,
  koToWin: 3,
  timeLimit: 180,
  respawnDelay: 3,
  respawnInvulnerable: 2,
  guardChip: 0.1,
  blockstun: 0.2,
  guardBreakStun: 1,
  guardBreakDamage: 0.5,
  dodgeDistance: 3.5,
  dodgeDuration: 0.3,
  dodgeInvulnerable: 0.2,
  dodgeEnergyCost: 15,
  energyMax: 100,
  energyStart: 50,
  energyRegen: 4,
  energyChargeRate: 35,
  knockdownSpeed: 9,
  knockdownTime: 0.6,
  getUpInvulnerable: 0.4,
  friction: 30,
  inputBuffer: 0.2,
};

/** Height of a fighter's hurtbox capsule, metres (shared by everyone for now). */
export const FIGHTER_HEIGHT = 1.8;

export type Action =
  | { kind: "light"; index: number; t: number; hit: boolean }
  | { kind: "heavy"; charge: number; charging: boolean; t: number; hit: boolean }
  | { kind: "special"; slot: number; t: number; fired: boolean }
  | { kind: "rush"; slot: number; remaining: number }
  | { kind: "dodge"; dir: V3; t: number }
  | { kind: "hitstun"; until: number }
  | { kind: "blockstun"; until: number }
  | { kind: "guardbroken"; until: number }
  | { kind: "knockdown"; until: number }
  | { kind: "guard" }
  | { kind: "charge" };

export interface Fighter {
  id: number;
  team: number;
  kit: FighterKit;
  spawn: V3;
  pos: V3;
  /** Horizontal knockback velocity and vertical velocity. */
  vel: V3;
  /** Unit vector on the floor plane. */
  facing: V3;
  hp: number;
  energy: number;
  alive: boolean;
  respawnAt: number;
  invulnerableUntil: number;
  /** null = free to act. */
  action: Action | null;
  /** Light press remembered until this time. */
  bufferedLightUntil: number;
  /** Previous tick's heavy button, to detect press and release. */
  heavyHeld: boolean;
  /** Set when the fighter moved by its own will this tick (for rendering). */
  moving: boolean;
}

export interface Projectile {
  owner: number;
  team: number;
  slot: number;
  pos: V3;
  dir: V3;
  speed: number;
  remaining: number;
  size: number;
}

/** A telegraphed area: visible from creation, resolves at triggerAt. */
export interface Zone {
  owner: number;
  team: number;
  slot: number;
  center: V3;
  radius: number;
  createdAt: number;
  triggerAt: number;
}

export type HitKind = "light" | "heavy" | "special";

export type BrawlEvent =
  | { t: number; type: "hit"; source: number; target: number; amount: number; by: HitKind; knockdown: boolean }
  | { t: number; type: "block"; source: number; target: number; amount: number; by: HitKind }
  | { t: number; type: "guardBreak"; source: number; target: number; amount: number; by: HitKind }
  | { t: number; type: "special"; unit: number; slot: number }
  | { t: number; type: "dodge"; unit: number }
  | { t: number; type: "ko"; target: number; killer: number }
  | { t: number; type: "respawn"; unit: number }
  | { t: number; type: "end"; winner: number | null };

export interface Command {
  unit: number;
  /** Desired direction on the floor plane (x, z); omitted or zero = stand still. */
  move?: { x: number; z: number };
  /** Presses (true only on the tick the button goes down). */
  jump?: boolean;
  light?: boolean;
  dodge?: boolean;
  special?: number;
  /** Held buttons. */
  heavy?: boolean;
  guard?: boolean;
  charge?: boolean;
}

export interface BrawlWorld {
  config: BrawlConfig;
  tick: number;
  time: number;
  fighters: Fighter[];
  projectiles: Projectile[];
  zones: Zone[];
  /** K.-O. scored by each team: the victory gauge. */
  score: number[];
  winner: number | null;
  over: boolean;
  events: BrawlEvent[];
}

const hlen = (v: V3) => Math.hypot(v.x, v.z);
export const hdist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.z - b.z);

function hnorm(v: V3, fallback: V3): V3 {
  const l = hlen(v);
  return l > 1e-9 ? { x: v.x / l, y: 0, z: v.z / l } : fallback;
}

export function createBrawl(spawns: { kit: FighterKit; team: number; pos: V3 }[], config: BrawlConfig = BRAWL_CONFIG): BrawlWorld {
  const w: BrawlWorld = {
    config,
    tick: 0,
    time: 0,
    fighters: spawns.map((s, id) => ({
      id,
      team: s.team,
      kit: s.kit,
      spawn: { ...s.pos },
      pos: { ...s.pos },
      vel: { x: 0, y: 0, z: 0 },
      facing: hnorm({ x: -s.pos.x, y: 0, z: -s.pos.z }, { x: 1, y: 0, z: 0 }),
      hp: s.kit.stats.hp,
      energy: config.energyStart,
      alive: true,
      respawnAt: Infinity,
      invulnerableUntil: 0,
      action: null,
      bufferedLightUntil: -Infinity,
      heavyHeld: false,
      moving: false,
    })),
    projectiles: [],
    zones: [],
    score: [0, 0],
    winner: null,
    over: false,
    events: [],
  };
  return w;
}

/** Standard 1v1 (or NvN) start: teams face each other across the arena. */
export function createDuel(a: FighterKit, b: FighterKit, config: BrawlConfig = BRAWL_CONFIG): BrawlWorld {
  const d = config.arenaRadius * 0.4;
  return createBrawl(
    [
      { kit: a, team: 0, pos: { x: 0, y: 0, z: d } },
      { kit: b, team: 1, pos: { x: 0, y: 0, z: -d } },
    ],
    config,
  );
}

export const grounded = (f: Fighter) => f.pos.y <= 1e-6;
export const isInvulnerable = (w: BrawlWorld, f: Fighter) => 
  f.invulnerableUntil > w.time || (f.action?.kind === "dodge" && f.action.t < w.config.dodgeInvulnerable);

/** The fighter a unit is locked on to: nearest living enemy. */
export function lockTarget(w: BrawlWorld, f: Fighter): Fighter | undefined {
  let best: Fighter | undefined;
  for (const o of w.fighters)
    if (o.alive && o.team !== f.team && (!best || hdist(f.pos, o.pos) < hdist(f.pos, best.pos))) best = o;
  return best;
}

function faceTarget(w: BrawlWorld, f: Fighter): void {
  const t = lockTarget(w, f);
  if (t) f.facing = hnorm({ x: t.pos.x - f.pos.x, y: 0, z: t.pos.z - f.pos.z }, f.facing);
}

function clampToArena(w: BrawlWorld, f: Fighter): void {
  const max = w.config.arenaRadius - f.kit.stats.radius;
  const d = hlen(f.pos);
  if (d > max) {
    f.pos.x *= max / d;
    f.pos.z *= max / d;
  }
}

/** Centre of a fighter's hurtbox. */
export const bodyCenter = (f: Fighter): V3 => ({ x: f.pos.x, y: f.pos.y + FIGHTER_HEIGHT / 2, z: f.pos.z });

/** True if a sphere touches the fighter's vertical capsule. */
function sphereTouches(c: V3, r: number, f: Fighter): boolean {
  const y = Math.max(f.pos.y + f.kit.stats.radius, Math.min(f.pos.y + FIGHTER_HEIGHT - f.kit.stats.radius, c.y));
  return Math.hypot(c.x - f.pos.x, c.y - y, c.z - f.pos.z) <= r + f.kit.stats.radius;
}

/** Centre of a strike's hitbox for a fighter. */
export function strikeCenter(f: Fighter, s: Strike): V3 {
  return { x: f.pos.x + f.facing.x * s.reach, y: f.pos.y + FIGHTER_HEIGHT / 2, z: f.pos.z + f.facing.z * s.reach };
}

interface HitSpec {
  damage: number;
  hitstun: number;
  knockback: number;
  guardBreak: boolean;
  by: HitKind;
}

/** Resolves one hit. Returns false if it whiffed on an invulnerable target. */
function applyHit(w: BrawlWorld, src: Fighter, target: Fighter, hit: HitSpec, from: V3): boolean {
  if (!target.alive || isInvulnerable(w, target)) return false;
  const c = w.config;
  const t = w.time;
  const dir = hnorm({ x: target.pos.x - from.x, y: 0, z: target.pos.z - from.z }, src.facing);
  const guarding = target.action?.kind === "guard";
  if (guarding && !hit.guardBreak) {
    const amount = hit.damage * c.guardChip;
    damage(w, src, target, amount);
    if (target.alive) target.action = { kind: "blockstun", until: t + c.blockstun };
    target.vel.x = dir.x * 2;
    target.vel.z = dir.z * 2;
    w.events.push({ t, type: "block", source: src.id, target: target.id, amount, by: hit.by });
    return true;
  }
  if (guarding) {
    const amount = hit.damage * c.guardBreakDamage;
    damage(w, src, target, amount);
    if (target.alive) target.action = { kind: "guardbroken", until: t + c.guardBreakStun };
    w.events.push({ t, type: "guardBreak", source: src.id, target: target.id, amount, by: hit.by });
    return true;
  }
  damage(w, src, target, hit.damage);
  const speed = hit.knockback / target.kit.stats.weight;
  const knockdown = speed >= c.knockdownSpeed;
  target.vel.x = dir.x * speed;
  target.vel.z = dir.z * speed;
  if (knockdown && target.alive) target.vel.y = Math.max(target.vel.y, 4);
  if (target.alive)
    target.action = knockdown
      ? { kind: "knockdown", until: t + hit.hitstun + c.knockdownTime }
      : { kind: "hitstun", until: t + hit.hitstun };
  w.events.push({ t, type: "hit", source: src.id, target: target.id, amount: hit.damage, by: hit.by, knockdown });
  return true;
}

function damage(w: BrawlWorld, src: Fighter, target: Fighter, amount: number): void {
  target.hp -= amount;
  if (target.hp > 0) return;
  target.hp = 0;
  target.alive = false;
  target.action = null;
  target.respawnAt = w.time + w.config.respawnDelay;
  w.projectiles = w.projectiles.filter((p) => p.owner !== target.id);
  w.zones = w.zones.filter((z) => z.owner !== target.id);
  w.score[src.team] = (w.score[src.team] ?? 0) + 1;
  w.events.push({ t: w.time, type: "ko", target: target.id, killer: src.id });
  if ((w.score[src.team] ?? 0) >= w.config.koToWin) end(w, src.team);
}

function end(w: BrawlWorld, winner: number | null): void {
  if (w.over) return;
  w.over = true;
  w.winner = winner;
  w.events.push({ t: w.time, type: "end", winner });
}

/** Strikes the first time the hitbox touches each enemy (one hit per strike). */
function resolveStrike(w: BrawlWorld, f: Fighter, s: Strike, by: HitKind, dmg: number, guardBreak: boolean): boolean {
  const c = strikeCenter(f, s);
  let hitAny = false;
  for (const o of w.fighters) {
    if (o.team === f.team || !o.alive || !sphereTouches(c, s.size, o)) continue;
    hitAny = applyHit(w, f, o, { damage: dmg, hitstun: s.hitstun, knockback: s.knockback, guardBreak, by }, f.pos) || hitAny;
  }
  return hitAny;
}

const strikeLength = (s: Strike) => s.startup + s.active + s.recovery;

function startSpecial(w: BrawlWorld, f: Fighter, slot: number): void {
  const sp = f.kit.specials[slot];
  if (!sp || f.energy < sp.energyCost) return;
  f.energy -= sp.energyCost;
  faceTarget(w, f);
  f.action = { kind: "special", slot, t: 0, fired: false };
  w.events.push({ t: w.time, type: "special", unit: f.id, slot });
}

function fireSpecial(w: BrawlWorld, f: Fighter, slot: number, sp: Special): void {
  const d = sp.delivery;
  switch (d.type) {
    case "projectile":
      w.projectiles.push({
        owner: f.id, team: f.team, slot, pos: bodyCenter(f), dir: { ...f.facing }, speed: d.speed, remaining: d.range, size: d.size,
      });
      return;
    case "rush":
      f.action = { kind: "rush", slot, remaining: d.distance };
      return;
    case "area": {
      const t = lockTarget(w, f);
      const reach = Math.min(t ? hdist(f.pos, t.pos) : d.castRange, d.castRange);
      w.zones.push({
        owner: f.id, team: f.team, slot, radius: d.radius, createdAt: w.time, triggerAt: w.time + d.delay,
        center: { x: f.pos.x + f.facing.x * reach, y: 0, z: f.pos.z + f.facing.z * reach },
      });
      return;
    }
  }
}

const specialHit = (sp: Special): HitSpec => ({
  damage: sp.damage, hitstun: sp.hitstun, knockback: sp.knockback, guardBreak: sp.guardBreak, by: "special",
});

/** A free fighter decides what to start this tick. */
function startAction(w: BrawlWorld, f: Fighter, cmd: Command | undefined, heavyPressed: boolean, lightWanted: boolean): void {
  const c = w.config;
  if (cmd?.dodge && f.energy >= c.dodgeEnergyCost) {
    const t = lockTarget(w, f);
    const back = t ? hnorm({ x: f.pos.x - t.pos.x, y: 0, z: f.pos.z - t.pos.z }, f.facing) : f.facing;
    f.energy -= c.dodgeEnergyCost;
    f.action = { kind: "dodge", dir: hnorm({ x: cmd.move?.x ?? 0, y: 0, z: cmd.move?.z ?? 0 }, back), t: 0 };
    w.events.push({ t: w.time, type: "dodge", unit: f.id });
    return;
  }
  if (cmd?.special !== undefined) {
    startSpecial(w, f, cmd.special);
    if (f.action) return;
  }
  if (heavyPressed) {
    faceTarget(w, f);
    f.action = { kind: "heavy", charge: 0, charging: true, t: 0, hit: false };
    return;
  }
  if (lightWanted && f.kit.light.hits.length > 0) {
    faceTarget(w, f);
    f.action = { kind: "light", index: 0, t: 0, hit: false };
    f.bufferedLightUntil = -Infinity;
    return;
  }
  if (cmd?.guard && grounded(f)) {
    f.action = { kind: "guard" };
    return;
  }
  if (cmd?.charge && grounded(f)) {
    f.action = { kind: "charge" };
    return;
  }
  if (cmd?.jump && grounded(f)) f.vel.y = f.kit.stats.jumpSpeed;
  const mv = cmd?.move;
  if (mv && Math.hypot(mv.x, mv.z) > 1e-6) {
    const dir = hnorm({ x: mv.x, y: 0, z: mv.z }, f.facing);
    const step = f.kit.stats.moveSpeed / c.tickRate;
    f.pos.x += dir.x * step;
    f.pos.z += dir.z * step;
    f.moving = true;
  }
  faceTarget(w, f);
}

/** Advances a fighter's current action by one tick. May clear it. */
function advanceAction(w: BrawlWorld, f: Fighter, cmd: Command | undefined, lightWanted: boolean): void {
  const c = w.config;
  const dt = 1 / c.tickRate;
  const a = f.action;
  if (!a) return;
  switch (a.kind) {
    case "light": {
      const s = f.kit.light.hits[a.index]!;
      a.t += dt;
      if (!a.hit && a.t >= s.startup && a.t < s.startup + s.active) a.hit = resolveStrike(w, f, s, "light", s.damage, false);
      const inRecovery = a.t >= s.startup + s.active;
      if (inRecovery && lightWanted && a.index + 1 < f.kit.light.hits.length) {
        faceTarget(w, f);
        f.action = { kind: "light", index: a.index + 1, t: 0, hit: false };
        f.bufferedLightUntil = -Infinity;
      } else if (a.t >= strikeLength(s)) f.action = null;
      return;
    }
    case "heavy": {
      const h = f.kit.heavy;
      if (a.charging) {
        if (cmd?.heavy && a.charge < h.maxCharge) {
          a.charge = Math.min(h.maxCharge, a.charge + dt);
          faceTarget(w, f);
          return;
        }
        a.charging = false;
      }
      a.t += dt;
      if (!a.hit && a.t >= h.startup && a.t < h.startup + h.active) {
        const dmg = h.damage * (1 + (h.chargeBonus - 1) * (h.maxCharge > 0 ? a.charge / h.maxCharge : 0));
        a.hit = resolveStrike(w, f, h, "heavy", dmg, true);
      }
      if (a.t >= strikeLength(h)) f.action = null;
      return;
    }
    case "special": {
      const sp = f.kit.specials[a.slot]!;
      a.t += dt;
      if (!a.fired && a.t >= sp.startup) {
        a.fired = true;
        fireSpecial(w, f, a.slot, sp);
        if (f.action?.kind === "rush") return;
      }
      if (a.t >= sp.startup + sp.recovery) f.action = null;
      return;
    }
    case "rush": {
      const sp = f.kit.specials[a.slot]!;
      const d = sp.delivery;
      if (d.type !== "rush") return;
      const stepLen = Math.min(a.remaining, d.speed * dt);
      f.pos.x += f.facing.x * stepLen;
      f.pos.z += f.facing.z * stepLen;
      a.remaining -= stepLen;
      const c3 = bodyCenter(f);
      for (const o of w.fighters) {
        if (o.team === f.team || !o.alive || !sphereTouches(c3, d.size, o)) continue;
        if (applyHit(w, f, o, specialHit(sp), f.pos)) {
          a.remaining = 0;
          break;
        }
      }
      if (a.remaining <= 1e-9) f.action = { kind: "special", slot: a.slot, t: sp.startup, fired: true };
      return;
    }
    case "dodge": {
      a.t += dt;
      const stepLen = (c.dodgeDistance / c.dodgeDuration) * dt;
      f.pos.x += a.dir.x * stepLen;
      f.pos.z += a.dir.z * stepLen;
      if (a.t >= c.dodgeDuration) f.action = null;
      return;
    }
    case "hitstun":
    case "blockstun":
    case "guardbroken":
      if (w.time >= a.until) f.action = null;
      return;
    case "knockdown":
      if (w.time >= a.until && grounded(f)) {
        f.action = null;
        f.invulnerableUntil = Math.max(f.invulnerableUntil, w.time + c.getUpInvulnerable);
      }
      return;
    case "guard":
      if (!cmd?.guard) f.action = null;
      else faceTarget(w, f);
      return;
    case "charge":
      if (!cmd?.charge) f.action = null;
      else f.energy = Math.min(c.energyMax, f.energy + c.energyChargeRate * dt);
      return;
  }
}

function physics(w: BrawlWorld, f: Fighter): void {
  const c = w.config;
  const dt = 1 / c.tickRate;
  f.pos.x += f.vel.x * dt;
  f.pos.z += f.vel.z * dt;
  const sp = Math.hypot(f.vel.x, f.vel.z);
  if (sp > 0) {
    const k = Math.max(0, sp - c.friction * dt) / sp;
    f.vel.x *= k;
    f.vel.z *= k;
  }
  if (f.pos.y > 0 || f.vel.y > 0) {
    f.vel.y -= c.gravity * dt;
    f.pos.y += f.vel.y * dt;
    if (f.pos.y <= 0) {
      f.pos.y = 0;
      f.vel.y = 0;
    }
  }
  clampToArena(w, f);
}

/** Fighters do not overlap: push both apart along the line between them. */
function separate(w: BrawlWorld): void {
  const live = w.fighters.filter((f) => f.alive);
  for (let i = 0; i < live.length; i++)
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i]!;
      const b = live[j]!;
      const min = a.kit.stats.radius + b.kit.stats.radius;
      const d = hdist(a.pos, b.pos);
      if (d >= min || Math.abs(a.pos.y - b.pos.y) > FIGHTER_HEIGHT) continue;
      const n = hnorm({ x: b.pos.x - a.pos.x, y: 0, z: b.pos.z - a.pos.z }, { x: 1, y: 0, z: 0 });
      const push = (min - d) / 2;
      a.pos.x -= n.x * push;
      a.pos.z -= n.z * push;
      b.pos.x += n.x * push;
      b.pos.z += n.z * push;
      clampToArena(w, a);
      clampToArena(w, b);
    }
}

function stepProjectiles(w: BrawlWorld): void {
  const dt = 1 / w.config.tickRate;
  w.projectiles = w.projectiles.filter((p) => {
    const owner = w.fighters[p.owner]!;
    const sp = owner.kit.specials[p.slot]!;
    const stepLen = Math.min(p.remaining, p.speed * dt);
    p.pos.x += p.dir.x * stepLen;
    p.pos.z += p.dir.z * stepLen;
    p.remaining -= stepLen;
    for (const o of w.fighters) {
      if (o.team === p.team || !o.alive || !sphereTouches(p.pos, p.size, o)) continue;
      if (applyHit(w, owner, o, specialHit(sp), { x: p.pos.x - p.dir.x, y: 0, z: p.pos.z - p.dir.z })) return false;
    }
    return p.remaining > 1e-9 && hlen(p.pos) < w.config.arenaRadius;
  });
}

function stepZones(w: BrawlWorld): void {
  w.zones = w.zones.filter((z) => {
    if (w.time < z.triggerAt) return true;
    const owner = w.fighters[z.owner]!;
    const sp = owner.kit.specials[z.slot]!;
    for (const o of w.fighters)
      if (o.team !== z.team && o.alive && hdist(o.pos, z.center) <= z.radius + o.kit.stats.radius && o.pos.y < 1.5)
        applyHit(w, owner, o, specialHit(sp), z.center);
    return false;
  });
}

/** Advances the world by one tick. Commands for dead or unknown units are ignored. */
export function step(w: BrawlWorld, commands: Command[]): void {
  if (w.over) return;
  const c = w.config;
  const dt = 1 / c.tickRate;
  w.tick++;
  w.time = w.tick / c.tickRate;
  const byUnit = new Map(commands.map((cmd) => [cmd.unit, cmd]));

  for (const f of w.fighters) {
    if (!f.alive) {
      if (w.time >= f.respawnAt) {
        f.alive = true;
        f.hp = f.kit.stats.hp;
        f.energy = c.energyStart;
        f.pos = { ...f.spawn };
        f.vel = { x: 0, y: 0, z: 0 };
        f.action = null;
        f.respawnAt = Infinity;
        f.invulnerableUntil = w.time + c.respawnInvulnerable;
        w.events.push({ t: w.time, type: "respawn", unit: f.id });
      }
      continue;
    }
    const cmd = byUnit.get(f.id);
    f.moving = false;
    if (cmd?.light) f.bufferedLightUntil = w.time + c.inputBuffer;
    const lightWanted = f.bufferedLightUntil >= w.time;
    const heavyPressed = !!cmd?.heavy && !f.heavyHeld;
    f.heavyHeld = !!cmd?.heavy;
    if (f.action?.kind !== "charge") f.energy = Math.min(c.energyMax, f.energy + c.energyRegen * dt);
    if (f.action) advanceAction(w, f, cmd, lightWanted);
    else startAction(w, f, cmd, heavyPressed, lightWanted);
    if (f.alive) physics(w, f);
  }
  separate(w);
  stepProjectiles(w);
  stepZones(w);
  if (!w.over && w.time >= c.timeLimit) end(w, timeWinner(w));
}

/** At time-out: most K.-O., then the higher total remaining HP ratio; null on a perfect tie. */
function timeWinner(w: BrawlWorld): number | null {
  const [a = 0, b = 0] = w.score;
  if (a !== b) return a > b ? 0 : 1;
  const ratio = (team: number) =>
    w.fighters.filter((f) => f.team === team).reduce((s, f) => s + (f.alive ? f.hp / f.kit.stats.hp : 0), 0);
  const ra = ratio(0);
  const rb = ratio(1);
  return ra === rb ? null : ra > rb ? 0 : 1;
}
