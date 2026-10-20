// Headless, fixed-step arena-brawler simulation (combat contract v2).
// No rendering, no I/O, no clock, no randomness: state advances only through
// step(world, commands). Local input, bots and (later) the network all feed
// the same Command type. Positions are metres, y is up, the floor is y = 0.

import {
  EYE_HEIGHT, OPEN_ARENA, buildArena, distToProp, groundHeight, pushOut, sightBlocked, spansHeight, surfaceAt, type Arena, type Prop,
} from "./arena.ts";
import { leapFlightTime, type FighterKit, type Special, type Strike } from "./kit.ts";

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/** Rules shared by every fighter. Changing one is a change of the combat contract. */
export interface BrawlConfig {
  tickRate: number;
  gravity: number;
  /**
   * Victory rule (multi-fighter matches, decision 0017):
   * - "kills": K.-O. scored by each team; the first to koToWin wins (0 = no cap), at the
   *   time limit the most K.-O. wins, then the remaining HP ratio;
   * - "stock": every fighter has `stocks` lives; out of lives, out of the match; the last
   *   team standing wins; at the time limit, the most lives left, then the HP ratio.
   */
  rule: "kills" | "stock";
  stocks: number;
  /** K.-O. needed to fill a team's victory gauge ("kills" rule; 0 = play to the time limit). */
  koToWin: number;
  /** Seconds; at the end, see `rule`. */
  timeLimit: number;
  respawnDelay: number;
  respawnInvulnerable: number;
  /** Share of damage still taken through guard. */
  guardChip: number;
  /** Seconds a fighter is stuck after blocking a hit. */
  blockstun: number;
  /** Seconds a fighter is stunned when their shield breaks. */
  guardBreakStun: number;
  /**
   * Shield (rhythm v3, decision 0011): the guard wears out. It holds `shieldMax` points,
   * drains while held, regenerates once released, and breaks at zero (stun `guardBreakStun`).
   * A blocked hit removes damage × `shieldDamageFactor`, doubled for a heavy attack and
   * tripled for a guard-breaking special.
   */
  shieldMax: number;
  shieldDrain: number;
  shieldRegen: number;
  /** Seconds after releasing the shield before it regenerates. */
  shieldRegenDelay: number;
  shieldDamageFactor: number;
  /** Air game: extra jumps in the air and their strength. */
  airJumps: number;
  airJumpFactor: number;
  /**
   * Air momentum (engine v4): a jump keeps the speed it took off with. The stick steers
   * toward run speed at airAccel (m/s²); with the stick released, speed bleeds off at airDrag.
   */
  airAccel: number;
  airDrag: number;
  /**
   * Strikes step in: over their startup and active time, light and heavy attacks carry
   * the fighter this far forward (metres), stopping once the target is within reach.
   */
  lightLunge: number;
  heavyLunge: number;
  /**
   * Hitlag (engine v4): on contact, attacker and target both freeze for
   * hitlagBase + damage × hitlagPerDamage seconds (at most hitlagMax); a blocked blow
   * freezes for blockHitlagFactor of that. Hitstun and knockback start after it.
   */
  hitlagBase: number;
  hitlagPerDamage: number;
  hitlagMax: number;
  blockHitlagFactor: number;
  /** Seconds stuck when landing during an aerial attack. */
  landingLag: number;
  /** Knockback grows as health drops: × (1 + bonus × share of health lost). */
  knockbackLowHpBonus: number;
  dodgeDistance: number;
  dodgeDuration: number;
  /** Invulnerability at the start of a dodge, seconds. */
  dodgeInvulnerable: number;
  dodgeEnergyCost: number;
  /**
   * Dodge staling (Smash Ultimate): each dodge adds a level (up to dodgeStaleMax), and
   * one level wears off every dodgeStaleDecay seconds. Per level, a dodge lasts
   * dodgeStaleSlow longer, keeps dodgeStaleInvulnerable less of its invulnerability
   * and travels dodgeStaleDistance less far (shares of the fresh values).
   */
  dodgeStaleMax: number;
  dodgeStaleDecay: number;
  dodgeStaleSlow: number;
  dodgeStaleInvulnerable: number;
  dodgeStaleDistance: number;
  /** Take-off before a jump leaves the ground; releasing the button by then gives a short hop. */
  jumpSquat: number;
  shortHopFactor: number;
  /** Lowering the shield takes this long (no attack meanwhile), unless it ends in a jump. */
  shieldDropLag: number;
  /**
   * Parry: a hit landing within parryWindow after the shield is lowered (held at least
   * parryMinHold) is cancelled; the defender is free at once and a melee attacker is
   * stunned parryStun.
   */
  parryWindow: number;
  parryMinHold: number;
  parryStun: number;
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
  /** Throwing props (decision 0006, step A2). */
  grabReach: number;
  liftTime: number;
  carrySpeedFactor: number;
  throwStartup: number;
  throwRecovery: number;
  throwSpeed: number;
  throwRange: number;
  /** A fighter knocked into a wall or prop faster than this takes slam damage. */
  slamMinSpeed: number;
  slamDamage: number;
  /**
   * Breaker (« Dégagement »): pressed while taking hits, blocking or guarding, it spends
   * energy to push every nearby enemy away, without damage, invulnerable for its duration.
   */
  breakerCost: number;
  breakerRadius: number;
  /** Push speed (before the target's weight). */
  breakerPush: number;
  /** Stun on pushed enemies, seconds. */
  breakerStun: number;
  breakerDuration: number;
  /**
   * Combo wear (decision 0024): each blow taken while still stunned stuns for this factor
   * more times less (at least comboStunFloor of the normal stun), so strings open up.
   */
  comboStunDecay: number;
  comboStunFloor: number;
  /** Directional influence: holding the stick at the end of hitlag bends the launch by up to this angle (radians). */
  diMaxAngle: number;
  /** Ground tech: guard or dodge pressed this long before landing from a knockdown skips the floor time. */
  techWindow: number;
  /** After a tech attempt, no new one for this long (no mashing). */
  techLockout: number;
  /** Invulnerability after a tech. */
  techInvulnerable: number;
}

export const BRAWL_CONFIG: BrawlConfig = {
  tickRate: 60,
  gravity: 18,
  rule: "kills",
  stocks: 3,
  koToWin: 3,
  timeLimit: 240,
  respawnDelay: 3,
  respawnInvulnerable: 2,
  guardChip: 0.1,
  blockstun: 0.2,
  guardBreakStun: 2,
  shieldMax: 100,
  shieldDrain: 20,
  shieldRegen: 15,
  shieldRegenDelay: 0.5,
  shieldDamageFactor: 0.3,
  airJumps: 1,
  airJumpFactor: 0.85,
  airAccel: 16,
  airDrag: 2.5,
  lightLunge: 0.45,
  heavyLunge: 0.9,
  hitlagBase: 3 / 60,
  hitlagPerDamage: 1 / 30 / 60,
  hitlagMax: 12 / 60,
  blockHitlagFactor: 0.6,
  landingLag: 0.1,
  knockbackLowHpBonus: 0.6,
  dodgeDistance: 3.5,
  dodgeDuration: 0.3,
  dodgeInvulnerable: 0.2,
  dodgeEnergyCost: 15,
  dodgeStaleMax: 5,
  dodgeStaleDecay: 2,
  dodgeStaleSlow: 0.12,
  dodgeStaleInvulnerable: 0.15,
  dodgeStaleDistance: 0.08,
  jumpSquat: 3 / 60,
  shortHopFactor: 0.71,
  shieldDropLag: 11 / 60,
  parryWindow: 5 / 60,
  parryMinHold: 3 / 60,
  parryStun: 0.4,
  energyMax: 100,
  energyStart: 50,
  energyRegen: 4,
  energyChargeRate: 35,
  knockdownSpeed: 9,
  knockdownTime: 0.6,
  getUpInvulnerable: 0.4,
  friction: 30,
  inputBuffer: 0.2,
  grabReach: 0.9,
  liftTime: 0.35,
  carrySpeedFactor: 0.75,
  throwStartup: 0.25,
  throwRecovery: 0.3,
  throwSpeed: 20,
  throwRange: 22,
  slamMinSpeed: 7,
  slamDamage: 60,
  breakerCost: 50,
  breakerRadius: 3,
  breakerPush: 12,
  breakerStun: 0.35,
  breakerDuration: 0.4,
  comboStunDecay: 0.85,
  comboStunFloor: 0.5,
  diMaxAngle: (18 * Math.PI) / 180,
  techWindow: 20 / 60,
  techLockout: 40 / 60,
  techInvulnerable: 20 / 60,
};

/** Height of a fighter's hurtbox capsule, metres (shared by everyone for now). */
export const FIGHTER_HEIGHT = 1.8;
/** A walking fighter climbs any step up to this height (stairs, ramps) without jumping. */
export const STEP_UP = 0.45;

export type Action =
  | { kind: "light"; index: number; t: number; hit: boolean }
  | { kind: "aerial"; t: number; hit: boolean }
  | { kind: "landing"; until: number }
  | { kind: "heavy"; charge: number; charging: boolean; t: number; hit: boolean }
  | { kind: "special"; slot: number; t: number; fired: boolean; countered?: boolean }
  | { kind: "rush"; slot: number; remaining: number }
  /** In the air on a leap special, from `from` to `to` over `time` seconds. */
  | { kind: "leap"; slot: number; t: number; time: number; height: number; from: V3; to: V3 }
  /** Counter stance, until then. */
  | { kind: "counter"; slot: number; until: number }
  | { kind: "dodge"; dir: V3; t: number; stale: number }
  | { kind: "jumpsquat"; t: number }
  | { kind: "shieldDrop"; until: number; parryUntil: number }
  | { kind: "breaker"; t: number }
  | { kind: "hitstun"; until: number }
  | { kind: "blockstun"; until: number }
  | { kind: "guardbroken"; until: number }
  | { kind: "knockdown"; until: number }
  | { kind: "guard" }
  | { kind: "charge" }
  | { kind: "lift"; prop: number; t: number }
  | { kind: "throw"; t: number; fired: boolean };

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
  /** Height of what the fighter stands on (0 = floor, or the top of a prop). */
  floor: number;
  /** Prop carried overhead, or null. */
  carrying: number | null;
  /** Last enemy who hit this fighter: credited for wall slams. */
  lastHitBy: number | null;
  /** Set when the fighter moved by its own will this tick (for rendering). */
  moving: boolean;
  /** Shield points left (see BrawlConfig.shieldMax). */
  shield: number;
  /** Last time the shield was up (regeneration waits shieldRegenDelay after it). */
  shieldUsedAt: number;
  /** Jumps left before touching the ground again. */
  airJumpsLeft: number;
  /** Dodge staling level and when it was last raised (see BrawlConfig.dodgeStale*). */
  dodgeStale: number;
  lastDodgeAt: number;
  /** When the shield went up (a parry needs it held a few frames first). */
  guardSince: number;
  /** Lives left ("stock" rule), counting the current one; 0 = eliminated. */
  stocks: number;
  /** Enemy this fighter chose to focus (from its commands), or null: the nearest one. */
  target: number | null;
  /** Own horizontal speed in the air (momentum), m/s; zero on the ground. */
  drift: V3;
  /** Frozen by hitlag until then: no action, no movement. */
  hitlagUntil: number;
  /**
   * Input buffer (decision 0024): a dodge, a jump or a special pressed while busy (stunned,
   * attacking, frozen) is remembered until then and done at the first free tick.
   */
  bufferedDodgeUntil: number;
  bufferedJumpUntil: number;
  bufferedSpecial: { slot: number; until: number } | null;
  /** Blows taken in a row while still stunned (combo wear). */
  combo: number;
  /** Knockback to bend by directional influence when the hitlag ends. */
  diPending: boolean;
  /** Last tech attempt (guard or dodge pressed in a knockdown). */
  techTriedAt: number;
  /** Previous tick's guard button, to detect a press. */
  guardHeld: boolean;
  /** Stick direction at the tech press (a tech roll), or null (tech in place). */
  techMove: { x: number; z: number } | null;
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
  /** A thrown prop: its id and its hit, instead of a special's. */
  prop?: number;
  hit?: HitSpec;
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
  /** The landing circle of a leap: gone if the leap is cut short. */
  leap?: boolean;
}

export type HitKind = "light" | "aerial" | "heavy" | "special" | "throw" | "slam";

export type BrawlEvent =
  | { t: number; type: "hit"; source: number; target: number; amount: number; by: HitKind; knockdown: boolean; slot?: number }
  | { t: number; type: "block"; source: number; target: number; amount: number; by: HitKind }
  | { t: number; type: "guardBreak"; source: number; target: number; amount: number; by: HitKind }
  | { t: number; type: "special"; unit: number; slot: number }
  | { t: number; type: "dodge"; unit: number }
  | { t: number; type: "airJump"; unit: number }
  | { t: number; type: "parry"; unit: number; attacker: number }
  | { t: number; type: "counter"; unit: number; attacker: number; slot: number }
  | { t: number; type: "breaker"; unit: number }
  /** Ground tech: up at once, invulnerable an instant. */
  | { t: number; type: "tech"; unit: number }
  | { t: number; type: "ko"; target: number; killer: number }
  | { t: number; type: "respawn"; unit: number }
  | { t: number; type: "propBroken"; prop: number; source: number }
  | { t: number; type: "propHit"; prop: number; amount: number }
  | { t: number; type: "lift"; unit: number; prop: number }
  | { t: number; type: "throw"; unit: number; prop: number }
  | { t: number; type: "slam"; target: number; amount: number }
  | { t: number; type: "end"; winner: number | null };

export interface Command {
  unit: number;
  /** Desired direction on the floor plane (x, z); omitted or zero = stand still. */
  move?: { x: number; z: number };
  /** Presses (true only on the tick the button goes down). */
  jump?: boolean;
  /** Jump button still held: decides full jump or short hop at take-off. */
  jumpHeld?: boolean;
  light?: boolean;
  dodge?: boolean;
  special?: number;
  /** Enemy to focus (index in fighters); -1 = back to the nearest one. Bots use it to spread out. */
  target?: number;
  /** Pick up a nearby throwable prop, or throw the one carried. */
  grab?: boolean;
  /** Held buttons. */
  heavy?: boolean;
  guard?: boolean;
  charge?: boolean;
}

export interface BrawlWorld {
  config: BrawlConfig;
  arena: Arena;
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

export function createBrawl(
  spawns: { kit: FighterKit; team: number; pos: V3 }[],
  config: BrawlConfig = BRAWL_CONFIG,
  arena: Arena = buildArena(OPEN_ARENA, {}),
): BrawlWorld {
  const w: BrawlWorld = {
    config,
    arena,
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
      floor: 0,
      carrying: null,
      lastHitBy: null,
      moving: false,
      shield: config.shieldMax,
      shieldUsedAt: -Infinity,
      airJumpsLeft: config.airJumps,
      dodgeStale: 0,
      lastDodgeAt: -Infinity,
      guardSince: 0,
      drift: { x: 0, y: 0, z: 0 },
      hitlagUntil: -Infinity,
      stocks: config.stocks,
      target: null,
      bufferedDodgeUntil: -Infinity,
      bufferedJumpUntil: -Infinity,
      bufferedSpecial: null,
      combo: 0,
      diPending: false,
      techTriedAt: -Infinity,
      guardHeld: false,
      techMove: null,
    })),
    projectiles: [],
    zones: [],
    score: Array.from({ length: Math.max(2, ...spawns.map((s) => s.team + 1)) }, () => 0),
    winner: null,
    over: false,
    events: [],
  };
  return w;
}

/** Standard 1v1 start on the arena's first two spawn points. */
export function createDuel(a: FighterKit, b: FighterKit, config: BrawlConfig = BRAWL_CONFIG, arena?: Arena): BrawlWorld {
  const ar = arena ?? buildArena(OPEN_ARENA, {});
  const [s0, s1] = ar.def.spawns;
  return createBrawl(
    [
      { kit: a, team: 0, pos: { x: s0!.x, y: 0, z: s0!.z } },
      { kit: b, team: 1, pos: { x: s1!.x, y: 0, z: s1!.z } },
    ],
    config,
    ar,
  );
}

/**
 * A match of 2 to 4 fighters on an arena: each takes the next spawn point; past the
 * arena's own points, extra ones are made by turning the first ones about the centre.
 */
export function createMatch(entries: { kit: FighterKit; team: number }[], config: BrawlConfig = BRAWL_CONFIG, arena?: Arena): BrawlWorld {
  const ar = arena ?? buildArena(OPEN_ARENA, {});
  const spawns = ar.def.spawns;
  const at = (i: number) => {
    if (i < spawns.length) return spawns[i]!;
    const s = spawns[i % spawns.length]!;
    return { x: -s.z * (ar.halfW / Math.max(1, ar.halfD)), z: s.x * (ar.halfD / Math.max(1, ar.halfW)) };
  };
  return createBrawl(
    entries.map((e, i) => ({ kit: e.kit, team: e.team, pos: { x: at(i).x, y: 0, z: at(i).z } })),
    config,
    ar,
  );
}

export const grounded = (f: Fighter) => f.pos.y <= f.floor + 1e-6;

/** Up close, fighters always sense each other, even around a corner. */
export const SENSE_RANGE = 2.5;

/** True if nothing tall stands between the two fighters (they can see each other). */
export const canSee = (w: BrawlWorld, a: Fighter, b: Fighter) =>
  hdist(a.pos, b.pos) <= SENSE_RANGE ||
  !sightBlocked(w.arena, { ...a.pos, y: a.pos.y + EYE_HEIGHT }, { ...b.pos, y: b.pos.y + EYE_HEIGHT });
export const isInvulnerable = (w: BrawlWorld, f: Fighter) => 
  f.invulnerableUntil > w.time ||
  (f.action?.kind === "dodge" && f.action.t < dodgeInvulnerability(w.config, f.action.stale)) ||
  f.action?.kind === "breaker";

/** Invulnerable part of a dodge at a given staling level. */
export const dodgeInvulnerability = (c: BrawlConfig, stale: number) => c.dodgeInvulnerable * Math.max(0, 1 - c.dodgeStaleInvulnerable * stale);
/** Whole length of a dodge at a given staling level. */
export const dodgeLength = (c: BrawlConfig, stale: number) => c.dodgeDuration * (1 + c.dodgeStaleSlow * stale);
/** Current staling level (fractional): it wears off with time since the last dodge. */
export const dodgeStaleNow = (w: BrawlWorld, f: Fighter) =>
  Math.max(0, f.dodgeStale - (w.time - f.lastDodgeAt) / w.config.dodgeStaleDecay);

/** States from which the breaker can be used: under pressure, but not already on the floor or guard-broken. */
const BREAKABLE = new Set<Action["kind"]>(["hitstun", "blockstun", "guard"]);
export const canBreak = (w: BrawlWorld, f: Fighter) =>
  f.alive && f.action !== null && BREAKABLE.has(f.action.kind) && f.energy >= w.config.breakerCost;

/** Breaker: pushes nearby enemies away (no damage) and frees the fighter. */
function breaker(w: BrawlWorld, f: Fighter): void {
  const c = w.config;
  f.energy -= c.breakerCost;
  f.action = { kind: "breaker", t: 0 };
  f.vel.x = 0;
  f.vel.z = 0;
  w.events.push({ t: w.time, type: "breaker", unit: f.id });
  for (const o of w.fighters) {
    if (o.team === f.team || !o.alive || isInvulnerable(w, o)) continue;
    if (hdist(o.pos, f.pos) > c.breakerRadius + o.kit.stats.radius || Math.abs(o.pos.y - f.pos.y) > FIGHTER_HEIGHT) continue;
    dropCarried(w, o);
    // No damage, not even a wall slam: the breaker only buys space.
    o.lastHitBy = null;
    const dir = hnorm({ x: o.pos.x - f.pos.x, y: 0, z: o.pos.z - f.pos.z }, f.facing);
    const speed = c.breakerPush / o.kit.stats.weight;
    o.vel.x = dir.x * speed;
    o.vel.z = dir.z * speed;
    // Interrupts whatever the enemy was doing (a rush or a charge included).
    o.hitlagUntil = -Infinity;
    o.action = { kind: "hitstun", until: w.time + c.breakerStun };
  }
}

/** The fighter a unit is locked on to: nearest living enemy. */
export function lockTarget(w: BrawlWorld, f: Fighter): Fighter | undefined {
  const chosen = f.target !== null ? w.fighters[f.target] : undefined;
  if (chosen && chosen.alive && chosen.team !== f.team) return chosen;
  let best: Fighter | undefined;
  for (const o of w.fighters)
    if (o.alive && o.team !== f.team && (!best || hdist(f.pos, o.pos) < hdist(f.pos, best.pos))) best = o;
  return best;
}

function faceTarget(w: BrawlWorld, f: Fighter): void {
  const t = lockTarget(w, f);
  if (t) f.facing = hnorm({ x: t.pos.x - f.pos.x, y: 0, z: t.pos.z - f.pos.z }, f.facing);
}

/** Keeps a fighter inside the walls and out of props it is not standing above. */
/** Keeps the fighter out of walls and props and inside the arena; true if it struck one. */
function clampToArena(w: BrawlWorld, f: Fighter, from?: { x: number; z: number }): boolean {
  const r = f.kit.stats.radius;
  const { halfW, halfD, props } = w.arena;
  const speed = Math.hypot(f.vel.x, f.vel.z);
  let struck: Prop | null | undefined; // undefined = nothing, null = arena wall
  for (const p of props)
    // Blocked by a volume the body overlaps in height: not one it stands on (or steps
    // onto), not one hanging above its head.
    if (p.alive && blocks(w, p, f) && pushOut(p, f.pos, r, from)) struck = p;
  const x = Math.max(-halfW + r, Math.min(halfW - r, f.pos.x));
  const z = Math.max(-halfD + r, Math.min(halfD - r, f.pos.z));
  if (x !== f.pos.x || z !== f.pos.z) struck ??= null;
  f.pos.x = x;
  f.pos.z = z;
  if (struck === undefined) return false;
  // Knockback into a wall or prop stops dead; hard enough, it hurts (and crates give way).
  f.vel.x = 0;
  f.vel.z = 0;
  const stunned = f.action?.kind === "hitstun" || f.action?.kind === "knockdown";
  if (stunned && speed >= w.config.slamMinSpeed) slam(w, f, speed, struck);
  return true;
}

/** Wall slam: extra damage credited to whoever sent the fighter flying. */
function slam(w: BrawlWorld, f: Fighter, speed: number, prop: Prop | null): void {
  const src = f.lastHitBy !== null ? w.fighters[f.lastHitBy] : undefined;
  if (!src || src.team === f.team) return;
  const amount = w.config.slamDamage * Math.min(1.5, speed / w.config.knockdownSpeed);
  if (prop) damageProp(w, src, prop, amount * 2);
  w.events.push({ t: w.time, type: "slam", target: f.id, amount });
  damage(w, src, f, amount);
}

/**
 * Whether a volume stops the fighter sideways: it overlaps the body in height, and the
 * body cannot step onto it. Stepping up (STEP_UP) is for feet on the ground: in the air
 * the body would slip inside the volume, and be pushed out of it later on whichever side
 * is nearest, through a wall. In the air one lands on a top only from above. A top capped
 * by something less than a body's height above (a ground-floor wall under the wall
 * upstairs) is no step either.
 */
function blocks(w: BrawlWorld, p: Prop, f: Fighter): boolean {
  const top = topAtContact(p, f);
  if (f.pos.y >= top || f.pos.y + FIGHTER_HEIGHT <= p.base) return false;
  const step = grounded(f) ? STEP_UP : 0.05;
  return f.pos.y + step < top || !roomOnTop(w, p, f.pos.x, f.pos.z);
}

/**
 * Whether a body has room to stand on the prop where it would set foot (the point of its
 * footprint nearest to (x, z)): nothing over that spot lower than a body's height.
 */
function roomOnTop(w: BrawlWorld, p: Prop, x: number, z: number): boolean {
  const px = Math.max(p.x - p.halfW, Math.min(p.x + p.halfW, x));
  const pz = Math.max(p.z - p.halfD, Math.min(p.z + p.halfD, z));
  const top = surfaceAt(p, px, pz);
  for (const q of w.arena.props)
    if (q !== p && q.alive && q.base >= top - 0.05 && q.base < top + FIGHTER_HEIGHT && distToProp(q, px, pz) < 0.05) return false;
  return true;
}

/** Height of the prop's top where the fighter touches it (matters for ramps and their sides). */
function topAtContact(p: Prop, f: Fighter): number {
  return surfaceAt(p, f.pos.x, f.pos.z);
}

/**
 * Underside of the lowest volume over the fighter's head that starts at or above `head`
 * (Infinity if none): a floor upstairs, a roof, a beam.
 */
function ceilingAbove(w: BrawlWorld, f: Fighter, head: number): number {
  let low = Infinity;
  for (const p of w.arena.props)
    if (p.alive && p.base >= head - 0.05 && p.base < low && distToProp(p, f.pos.x, f.pos.z) < f.kit.stats.radius * 0.6) low = p.base;
  return low;
}

/** Height of the highest top under the fighter that is not above `y` (+ a small tolerance). */
function supportHeight(w: BrawlWorld, f: Fighter, y = f.pos.y): number {
  let top = 0;
  for (const p of w.arena.props) {
    if (!p.alive || distToProp(p, f.pos.x, f.pos.z) >= f.kit.stats.radius * 0.5) continue;
    const s = surfaceAt(p, f.pos.x, f.pos.z);
    if (s > top && s <= y + 0.05 && roomOnTop(w, p, f.pos.x, f.pos.z)) top = s;
  }
  return top;
}

/** A carried or thrown prop shatters where it is. */
function shatter(w: BrawlWorld, p: Prop, x: number, z: number, source: number): void {
  p.x = x;
  p.z = z;
  p.alive = false;
  p.held = null;
  p.flying = false;
  w.events.push({ t: w.time, type: "propBroken", prop: p.id, source });
}

/** Drops (and breaks) what a fighter is carrying, e.g. when hit. */
function dropCarried(w: BrawlWorld, f: Fighter): void {
  const id = f.carrying ?? (f.action?.kind === "lift" ? f.action.prop : null);
  if (id === null) return;
  f.carrying = null;
  shatter(w, w.arena.props[id]!, f.pos.x, f.pos.z, f.id);
}

/** Nearest throwable prop within reach of a fighter (that nobody stands on). */
export function grabbable(w: BrawlWorld, f: Fighter): Prop | undefined {
  if (f.carrying !== null || !grounded(f)) return undefined;
  let best: Prop | undefined;
  let bestD = Infinity;
  for (const p of w.arena.props) {
    if (!p.alive || !p.kind.throwable) continue;
    const d = distToProp(p, f.pos.x, f.pos.z) - f.kit.stats.radius;
    const occupied = w.fighters.some((o) => o.alive && o.floor > 0 && distToProp(p, o.pos.x, o.pos.z) < o.kit.stats.radius);
    if (d <= w.config.grabReach && d < bestD && !occupied) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** Damages a breakable prop; indestructible ones ignore it. */
function damageProp(w: BrawlWorld, src: Fighter, p: Prop, amount: number): void {
  if (!p.alive || p.kind.hp === null) return;
  p.hp -= amount;
  if (p.hp > 0) {
    w.events.push({ t: w.time, type: "propHit", prop: p.id, amount });
    return;
  }
  p.alive = false;
  w.events.push({ t: w.time, type: "propBroken", prop: p.id, source: src.id });
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

export interface HitSpec {
  damage: number;
  hitstun: number;
  knockback: number;
  guardBreak: boolean;
  by: HitKind;
  /** The special it comes from (its slot in the kit). */
  slot?: number;
}

/** Resolves one hit. Returns false if it whiffed on an invulnerable target. */
function applyHit(w: BrawlWorld, src: Fighter, target: Fighter, hit: HitSpec, from: V3, contact = false): boolean {
  if (!target.alive || isInvulnerable(w, target)) return false;
  if (target.action?.kind === "counter" && contact && src !== target) {
    counterStrike(w, target, src, target.action.slot);
    return true;
  }
  // A leap cut short in the air: its landing circle goes with it.
  if (target.action?.kind === "leap") w.zones = w.zones.filter((z) => !(z.owner === target.id && z.leap));
  target.drift = { x: 0, y: 0, z: 0 };
  // Hitlag: both bodies freeze an instant on contact (the attacker only if it struck in person).
  const lag = Math.min(w.config.hitlagMax, w.config.hitlagBase + hit.damage * w.config.hitlagPerDamage);
  const freeze = (k: number) => {
    target.hitlagUntil = w.time + lag * k;
    if (contact) src.hitlagUntil = w.time + lag * k;
    return lag * k;
  };
  if (src.team !== target.team) target.lastHitBy = src.id;
  dropCarried(w, target);
  const c = w.config;
  const t = w.time;
  const dir = hnorm({ x: target.pos.x - from.x, y: 0, z: target.pos.z - from.z }, src.facing);
  const ta = target.action;
  if (ta?.kind === "shieldDrop" && t <= ta.parryUntil) {
    // Parry: the blow is cancelled, the defender acts at once, a melee attacker is left open.
    target.action = null;
    if (hit.by === "light" || hit.by === "aerial" || hit.by === "heavy") src.action = { kind: "hitstun", until: t + c.parryStun };
    w.events.push({ t, type: "parry", unit: target.id, attacker: src.id });
    return true;
  }
  const guarding = target.action?.kind === "guard";
  if (guarding) {
    // The shield takes the blow: heavy attacks wear it twice as fast, guard-breaking specials three times.
    const wear = hit.by === "heavy" ? 2 : hit.guardBreak ? 3 : 1;
    target.shield -= hit.damage * c.shieldDamageFactor * wear;
    target.shieldUsedAt = t;
    const amount = hit.damage * c.guardChip;
    damage(w, src, target, amount);
    if (target.shield <= 0) {
      breakShield(w, target);
      w.events.push({ t, type: "guardBreak", source: src.id, target: target.id, amount, by: hit.by });
      return true;
    }
    const bl = freeze(c.blockHitlagFactor);
    if (target.alive) target.action = { kind: "blockstun", until: t + bl + c.blockstun };
    target.vel.x = dir.x * 2;
    target.vel.z = dir.z * 2;
    w.events.push({ t, type: "block", source: src.id, target: target.id, amount, by: hit.by });
    return true;
  }
  damage(w, src, target, hit.damage);
  // Combo wear: hit again before being free, stunned for less each time.
  const stunned = ta?.kind === "hitstun" || ta?.kind === "knockdown";
  target.combo = stunned ? target.combo + 1 : 0;
  const stun = hit.hitstun * Math.max(c.comboStunFloor, c.comboStunDecay ** target.combo);
  // Knockback grows as health drops (the nod to Smash's percentage): late hits send fighters flying.
  const lost = 1 - Math.max(0, target.hp) / target.kit.stats.hp;
  const speed = (hit.knockback / target.kit.stats.weight) * (1 + c.knockbackLowHpBonus * lost);
  const knockdown = speed >= c.knockdownSpeed;
  target.vel.x = dir.x * speed;
  target.vel.z = dir.z * speed;
  if (knockdown && target.alive) target.vel.y = Math.max(target.vel.y, 4);
  const hl = freeze(1);
  target.diPending = true;
  if (target.alive)
    target.action = knockdown
      ? { kind: "knockdown", until: t + hl + stun + c.knockdownTime }
      : { kind: "hitstun", until: t + hl + stun };
  w.events.push({ t, type: "hit", source: src.id, target: target.id, amount: hit.damage, by: hit.by, knockdown, ...(hit.slot !== undefined ? { slot: hit.slot } : {}) });
  return true;
}

/**
 * Counter: the defender spins round the attacker, lands at its back facing it, and the
 * special strikes there. The attacker's blow is lost. The defender recovers faster
 * than after a stance that caught nothing.
 */
function counterStrike(w: BrawlWorld, f: Fighter, attacker: Fighter, slot: number): void {
  const sp = f.kit.specials[slot]!;
  const back = attacker.facing;
  const gap = f.kit.stats.radius + attacker.kit.stats.radius + 0.3;
  f.pos.x = attacker.pos.x - back.x * gap;
  f.pos.z = attacker.pos.z - back.z * gap;
  clampToArena(w, f);
  f.facing = hnorm({ x: attacker.pos.x - f.pos.x, y: 0, z: attacker.pos.z - f.pos.z }, back);
  f.action = { kind: "special", slot, t: sp.startup + sp.recovery * 0.5, fired: true, countered: true };
  w.events.push({ t: w.time, type: "counter", unit: f.id, attacker: attacker.id, slot });
  attacker.action = null;
  applyHit(w, f, attacker, specialHit(sp, slot), f.pos, true);
}

/** Empty shield: the fighter is stunned, open to anything. */
function breakShield(w: BrawlWorld, f: Fighter): void {
  f.shield = 0;
  if (f.alive) f.action = { kind: "guardbroken", until: w.time + w.config.guardBreakStun };
}

function damage(w: BrawlWorld, src: Fighter, target: Fighter, amount: number): void {
  target.hp -= amount;
  if (target.hp > 0) return;
  target.hp = 0;
  dropCarried(w, target);
  target.alive = false;
  target.action = null;
  target.respawnAt = w.time + w.config.respawnDelay;
  if (w.config.rule === "stock") {
    target.stocks = Math.max(0, target.stocks - 1);
    if (target.stocks === 0) target.respawnAt = Infinity; // out of the match
  }
  w.projectiles = w.projectiles.filter((p) => p.owner !== target.id);
  w.zones = w.zones.filter((z) => z.owner !== target.id);
  if (src.team !== target.team) w.score[src.team] = (w.score[src.team] ?? 0) + 1;
  w.events.push({ t: w.time, type: "ko", target: target.id, killer: src.id });
  if (w.config.rule === "stock") {
    const standing = teamsStanding(w);
    if (standing.length <= 1) end(w, standing[0] ?? null);
  } else if (w.config.koToWin > 0 && (w.score[src.team] ?? 0) >= w.config.koToWin) end(w, src.team);
}

/** Teams that still have a fighter in the match (alive, or with a life left to respawn). */
export function teamsStanding(w: BrawlWorld): number[] {
  return [...new Set(w.fighters.filter((f) => f.alive || f.stocks > 0).map((f) => f.team))];
}

function end(w: BrawlWorld, winner: number | null): void {
  if (w.over) return;
  w.over = true;
  w.winner = winner;
  w.events.push({ t: w.time, type: "end", winner });
}

/** Strikes the first time the hitbox touches each enemy (one hit per strike). Props are hit on the first live tick. */
function resolveStrike(w: BrawlWorld, f: Fighter, s: Strike, by: HitKind, dmg: number, guardBreak: boolean, firstTick: boolean): boolean {
  const c = strikeCenter(f, s);
  let hitAny = false;
  if (firstTick)
    for (const p of w.arena.props)
      if (p.alive && p.kind.hp !== null && spansHeight(p, c.x, c.z, c.y - s.size, c.y + s.size) && distToProp(p, c.x, c.z) <= s.size) {
        damageProp(w, f, p, dmg);
        hitAny = true;
      }
  for (const o of w.fighters) {
    if (o.team === f.team || !o.alive || !sphereTouches(c, s.size, o)) continue;
    hitAny = applyHit(w, f, o, { damage: dmg, hitstun: s.hitstun, knockback: s.knockback, guardBreak, by }, f.pos, true) || hitAny;
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

/** Unit 3D direction from `from` to the locked target's body (straight ahead if none). */
function aimAt(w: BrawlWorld, f: Fighter, from: V3): V3 {
  const t = lockTarget(w, f);
  if (!t) return { ...f.facing };
  const c = bodyCenter(t);
  const d = { x: c.x - from.x, y: c.y - from.y, z: c.z - from.z };
  const l = Math.hypot(d.x, d.y, d.z);
  return l > 1e-9 ? { x: d.x / l, y: d.y / l, z: d.z / l } : { ...f.facing };
}

function fireSpecial(w: BrawlWorld, f: Fighter, slot: number, sp: Special): void {
  const d = sp.delivery;
  switch (d.type) {
    case "projectile":
      w.projectiles.push({
        owner: f.id, team: f.team, slot, pos: bodyCenter(f), dir: aimAt(w, f, bodyCenter(f)), speed: d.speed, remaining: d.range, size: d.size,
      });
      return;
    case "rush":
      f.action = { kind: "rush", slot, remaining: d.distance };
      return;
    case "area": {
      const t = lockTarget(w, f);
      const reach = Math.min(t ? hdist(f.pos, t.pos) : d.castRange, d.castRange);
      const x = f.pos.x + f.facing.x * reach;
      const z = f.pos.z + f.facing.z * reach;
      // On the level of whatever stands there: the target's floor, a roof, or the ground.
      const y = t && reach >= hdist(f.pos, t.pos) - 0.5 ? t.floor : groundHeight(w.arena, x, z);
      w.zones.push({
        owner: f.id, team: f.team, slot, radius: d.radius, createdAt: w.time, triggerAt: w.time + d.delay,
        center: { x, y, z },
      });
      return;
    }
    case "leap": {
      // Straight onto the target's spot (up to range), or ahead.
      const t = lockTarget(w, f);
      const reach = Math.min(t ? hdist(f.pos, t.pos) : d.range, d.range);
      const to = { x: f.pos.x + f.facing.x * reach, y: 0, z: f.pos.z + f.facing.z * reach };
      to.y = t && reach >= hdist(f.pos, t.pos) - 0.5 ? t.floor : groundHeight(w.arena, to.x, to.z);
      const time = leapFlightTime(d.height, w.config.gravity);
      f.action = { kind: "leap", slot, t: 0, time, height: d.height, from: { ...f.pos }, to };
      f.vel = { x: 0, y: 0, z: 0 };
      f.drift = { x: 0, y: 0, z: 0 };
      w.zones.push({ owner: f.id, team: f.team, slot, radius: d.radius, createdAt: w.time, triggerAt: w.time + time, center: to, leap: true });
      return;
    }
    case "counter":
      f.action = { kind: "counter", slot, until: w.time + d.window };
      return;
  }
}

const specialHit = (sp: Special, slot: number): HitSpec => ({
  damage: sp.damage, hitstun: sp.hitstun, knockback: sp.knockback, guardBreak: sp.guardBreak, by: "special", slot,
});

/** A free fighter decides what to start this tick. */
function startAction(w: BrawlWorld, f: Fighter, cmd: Command | undefined, heavyPressed: boolean, lightWanted: boolean): void {
  const c = w.config;
  // Carrying: hands are full. Grab or light attack throws; moving is slower; no guard, no other attack.
  if (f.carrying !== null) {
    if (cmd?.grab || lightWanted) {
      faceTarget(w, f);
      f.action = { kind: "throw", t: 0, fired: false };
      f.bufferedLightUntil = -Infinity;
      return;
    }
    if (cmd?.jump && grounded(f)) f.vel.y = f.kit.stats.jumpSpeed;
    moveBy(w, f, cmd, c.carrySpeedFactor);
    return;
  }
  if (cmd?.grab) {
    const p = grabbable(w, f);
    if (p) {
      p.alive = false;
      p.held = f.id;
      f.action = { kind: "lift", prop: p.id, t: 0 };
      w.events.push({ t: w.time, type: "lift", unit: f.id, prop: p.id });
      return;
    }
  }
  if (cmd?.dodge && f.energy >= c.dodgeEnergyCost) {
    const t = lockTarget(w, f);
    const back = t ? hnorm({ x: f.pos.x - t.pos.x, y: 0, z: f.pos.z - t.pos.z }, f.facing) : f.facing;
    f.energy -= c.dodgeEnergyCost;
    // Staling: this dodge pays for the ones just before it, and makes the next one worse.
    const stale = dodgeStaleNow(w, f);
    f.dodgeStale = Math.min(c.dodgeStaleMax, stale + 1);
    f.lastDodgeAt = w.time;
    f.action = { kind: "dodge", dir: hnorm({ x: cmd.move?.x ?? 0, y: 0, z: cmd.move?.z ?? 0 }, back), t: 0, stale };
    w.events.push({ t: w.time, type: "dodge", unit: f.id });
    return;
  }
  if (cmd?.special !== undefined) {
    startSpecial(w, f, cmd.special);
    if (f.action) return;
  }
  // In the air: the light button gives one aerial strike, the jump button a second jump.
  if (!grounded(f)) {
    if (lightWanted && f.kit.light.hits.length > 0) {
      faceTarget(w, f);
      f.action = { kind: "aerial", t: 0, hit: false };
      f.bufferedLightUntil = -Infinity;
      return;
    }
    if (cmd?.jump && f.airJumpsLeft > 0) {
      f.airJumpsLeft--;
      f.vel.y = f.kit.stats.jumpSpeed * c.airJumpFactor;
      // A second jump can change direction at once, toward the stick.
      const mv = cmd.move;
      if (mv && Math.hypot(mv.x, mv.z) > 0.1) {
        const d = hnorm({ x: mv.x, y: 0, z: mv.z }, f.facing);
        const sp = Math.max(hlen(f.drift), f.kit.stats.moveSpeed * 0.8);
        f.drift = { x: d.x * sp, y: 0, z: d.z * sp };
      }
      w.events.push({ t: w.time, type: "airJump", unit: f.id });
    }
    airSteer(w, f, cmd);
    return;
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
  if (cmd?.guard && grounded(f) && f.shield > 0) {
    f.action = { kind: "guard" };
    f.guardSince = w.time;
    return;
  }
  if (cmd?.charge && grounded(f)) {
    f.action = { kind: "charge" };
    return;
  }
  if (cmd?.jump && grounded(f)) {
    f.action = { kind: "jumpsquat", t: 0 };
    return;
  }
  moveBy(w, f, cmd, 1);
}

/**
 * Walking and running: the fighter faces where it goes (engine v4), and turns back to
 * its opponent when it stops. Attacks, guard and specials still face the opponent.
 */
function moveBy(w: BrawlWorld, f: Fighter, cmd: Command | undefined, factor: number): void {
  const mv = cmd?.move;
  const amount = mv ? Math.min(1, Math.hypot(mv.x, mv.z)) : 0;
  if (mv && amount > 1e-6) {
    const dir = hnorm({ x: mv.x, y: 0, z: mv.z }, f.facing);
    const speed = f.kit.stats.moveSpeed * factor * amount;
    f.pos.x += (dir.x * speed) / w.config.tickRate;
    f.pos.z += (dir.z * speed) / w.config.tickRate;
    f.facing = dir;
    f.moving = true;
  } else faceTarget(w, f);
}

/** In the air: momentum is kept; the stick steers toward run speed, releasing it lets speed bleed off. */
function airSteer(w: BrawlWorld, f: Fighter, cmd: Command | undefined): void {
  const c = w.config;
  const dt = 1 / c.tickRate;
  const mv = cmd?.move;
  const amount = mv ? Math.min(1, Math.hypot(mv.x, mv.z)) : 0;
  const d = f.drift;
  if (mv && amount > 0.1) {
    const dir = hnorm({ x: mv.x, y: 0, z: mv.z }, f.facing);
    const top = Math.max(f.kit.stats.moveSpeed * amount, Math.min(hlen(d), f.kit.stats.moveSpeed));
    const tx = dir.x * top - d.x;
    const tz = dir.z * top - d.z;
    const l = Math.hypot(tx, tz);
    const k = l > 1e-9 ? Math.min(1, (c.airAccel * dt) / l) : 0;
    d.x += tx * k;
    d.z += tz * k;
    if (f.action === null) f.facing = dir;
  } else {
    const sp = hlen(d);
    const k = sp > 0 ? Math.max(0, sp - c.airDrag * dt) / sp : 0;
    d.x *= k;
    d.z *= k;
  }
  f.moving = hlen(d) > 0.5;
}

/**
 * Strikes step in: the attacker moves toward its target over the startup and active
 * time, and stops as soon as the target is within the strike's reach.
 */
function lunge(w: BrawlWorld, f: Fighter, s: Strike, t: number, distance: number): void {
  const span = s.startup + s.active;
  if (distance <= 0 || t > span || !grounded(f)) return;
  let step = (distance / span) / w.config.tickRate;
  const target = lockTarget(w, f);
  if (target) {
    const room = hdist(f.pos, target.pos) - s.reach * 0.85;
    step = Math.min(step, Math.max(0, room));
  }
  f.pos.x += f.facing.x * step;
  f.pos.z += f.facing.z * step;
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
      lunge(w, f, s, a.t, c.lightLunge);
      if (!a.hit && a.t >= s.startup && a.t < s.startup + s.active)
        a.hit = resolveStrike(w, f, s, "light", s.damage, false, a.t - dt < s.startup);
      const inRecovery = a.t >= s.startup + s.active;
      // The combo goes on only if this blow touched something: hammering the button in the
      // air gives one swing and its full recovery (engine v4).
      if (inRecovery && a.hit && lightWanted && a.index + 1 < f.kit.light.hits.length) {
        faceTarget(w, f);
        f.action = { kind: "light", index: a.index + 1, t: 0, hit: false };
        f.bufferedLightUntil = -Infinity;
      } else if (a.t >= strikeLength(s)) f.action = null;
      return;
    }
    case "aerial": {
      // One strike with the first light hit's numbers; the fall goes on meanwhile.
      const s = f.kit.light.hits[0]!;
      a.t += dt;
      airSteer(w, f, cmd);
      if (!a.hit && a.t >= s.startup && a.t < s.startup + s.active)
        a.hit = resolveStrike(w, f, s, "aerial", s.damage, false, a.t - dt < s.startup);
      if (a.t >= strikeLength(s)) f.action = null;
      return;
    }
    case "landing":
      if (w.time >= a.until) f.action = null;
      return;
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
      lunge(w, f, h, a.t, c.heavyLunge);
      if (!a.hit && a.t >= h.startup && a.t < h.startup + h.active) {
        const dmg = h.damage * (1 + (h.chargeBonus - 1) * (h.maxCharge > 0 ? a.charge / h.maxCharge : 0));
        a.hit = resolveStrike(w, f, h, "heavy", dmg, true, a.t - dt < h.startup);
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
        if (f.action?.kind === "rush" || f.action?.kind === "leap" || f.action?.kind === "counter") return;
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
        if (applyHit(w, f, o, specialHit(sp, a.slot), f.pos, true)) {
          a.remaining = 0;
          break;
        }
      }
      if (a.remaining <= 1e-9) f.action = { kind: "special", slot: a.slot, t: sp.startup, fired: true };
      return;
    }
    case "leap": {
      // A fixed arc: the body follows it exactly (no gravity, no drift), and lands on time.
      a.t += dt;
      const k = Math.min(1, a.t / a.time);
      f.pos.x = a.from.x + (a.to.x - a.from.x) * k;
      f.pos.z = a.from.z + (a.to.z - a.from.z) * k;
      f.pos.y = a.from.y + (a.to.y - a.from.y) * k + 4 * a.height * k * (1 - k);
      f.vel = { x: 0, y: 0, z: 0 };
      if (k >= 1) {
        f.floor = a.to.y;
        const sp = f.kit.specials[a.slot]!;
        f.action = { kind: "special", slot: a.slot, t: sp.startup, fired: true };
      }
      return;
    }
    case "counter":
      // Caught nothing: the whole recovery, open to punishment.
      if (w.time >= a.until) f.action = { kind: "special", slot: a.slot, t: f.kit.specials[a.slot]!.startup, fired: true };
      return;
    case "dodge": {
      a.t += dt;
      const length = dodgeLength(c, a.stale);
      const distance = c.dodgeDistance * Math.max(0, 1 - c.dodgeStaleDistance * a.stale);
      const stepLen = (distance / length) * dt;
      f.pos.x += a.dir.x * stepLen;
      f.pos.z += a.dir.z * stepLen;
      if (a.t >= length) f.action = null;
      return;
    }
    case "jumpsquat":
      a.t += dt;
      if (a.t >= c.jumpSquat) {
        // Button released during the take-off: short hop.
        f.vel.y = f.kit.stats.jumpSpeed * (cmd?.jumpHeld ? 1 : c.shortHopFactor);
        // The jump takes off with the run's speed, in the stick's direction.
        const mv = cmd?.move;
        const amount = mv ? Math.min(1, Math.hypot(mv.x, mv.z)) : 0;
        if (mv && amount > 0.1) {
          const d = hnorm({ x: mv.x, y: 0, z: mv.z }, f.facing);
          f.drift = { x: d.x * f.kit.stats.moveSpeed * amount, y: 0, z: d.z * f.kit.stats.moveSpeed * amount };
          f.facing = d;
        } else f.drift = { x: 0, y: 0, z: 0 };
        f.action = null;
      }
      return;
    case "shieldDrop":
      if (w.time >= a.until) f.action = null;
      return;
    case "breaker":
      a.t += dt;
      if (a.t >= c.breakerDuration) f.action = null;
      return;
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
      f.shieldUsedAt = w.time;
      if (cmd?.jump) {
        // Jumping out of the shield skips the drop lag.
        f.action = { kind: "jumpsquat", t: 0 };
        return;
      }
      if (!cmd?.guard) {
        const held = w.time - f.guardSince;
        f.action = {
          kind: "shieldDrop",
          until: w.time + c.shieldDropLag,
          parryUntil: held >= c.parryMinHold ? w.time + c.parryWindow : -Infinity,
        };
        return;
      }
      faceTarget(w, f);
      f.shield -= c.shieldDrain * dt;
      if (f.shield <= 0) {
        breakShield(w, f);
        w.events.push({ t: w.time, type: "guardBreak", source: f.id, target: f.id, amount: 0, by: "heavy" });
      }
      return;
    case "charge":
      if (!cmd?.charge) f.action = null;
      else f.energy = Math.min(c.energyMax, f.energy + c.energyChargeRate * dt);
      return;
    case "lift":
      a.t += dt;
      if (a.t >= c.liftTime) {
        f.carrying = a.prop;
        f.action = null;
      }
      return;
    case "throw": {
      a.t += dt;
      if (!a.fired && a.t >= c.throwStartup && f.carrying !== null) {
        a.fired = true;
        const p = w.arena.props[f.carrying]!;
        const t = p.kind.throwable!;
        f.carrying = null;
        p.held = null;
        p.flying = true;
        w.projectiles.push({
          owner: f.id, team: f.team, slot: -1, pos: { x: f.pos.x, y: f.pos.y + FIGHTER_HEIGHT * 0.8, z: f.pos.z },
          dir: aimAt(w, f, { x: f.pos.x, y: f.pos.y + FIGHTER_HEIGHT * 0.8, z: f.pos.z }), speed: c.throwSpeed, remaining: c.throwRange, size: Math.max(p.halfW, p.halfD),
          prop: p.id, hit: { damage: t.damage, hitstun: t.hitstun, knockback: t.knockback, guardBreak: false, by: "throw" },
        });
        w.events.push({ t: w.time, type: "throw", unit: f.id, prop: p.id });
      }
      if (a.t >= c.throwStartup + c.throwRecovery) f.action = null;
      return;
    }
  }
}

function physics(w: BrawlWorld, f: Fighter): void {
  const c = w.config;
  const dt = 1 / c.tickRate;
  let dx = f.vel.x * dt;
  let dz = f.vel.z * dt;
  if (f.pos.y > f.floor + 1e-6 || f.vel.y > 0) {
    // Air momentum (frozen during a dodge or a rush, which move the body themselves).
    if (f.action?.kind !== "dodge" && f.action?.kind !== "rush") {
      dx += f.drift.x * dt;
      dz += f.drift.z * dt;
    }
  } else if (f.drift.x !== 0 || f.drift.z !== 0) f.drift = { x: 0, y: 0, z: 0 };
  // A fast body (thrown, knocked away) moves in short steps, each checked against the
  // walls: in one stride it could pass the middle of a thin wall and be pushed out on
  // the far side.
  const stride = f.kit.stats.radius * 0.4;
  const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / stride));
  const from = { x: f.pos.x, z: f.pos.z };
  for (let i = 0; i < n; i++) {
    from.x = f.pos.x;
    from.z = f.pos.z;
    f.pos.x += dx / n;
    f.pos.z += dz / n;
    if (i < n - 1 && clampToArena(w, f, from)) break;
  }
  const sp = Math.hypot(f.vel.x, f.vel.z);
  if (sp > 0) {
    const k = Math.max(0, sp - c.friction * dt) / sp;
    f.vel.x *= k;
    f.vel.z *= k;
  }
  const wasGrounded = f.pos.y <= f.floor + 1e-6 && f.vel.y <= 0;
  clampToArena(w, f, from);
  if (wasGrounded) {
    // Walking: climb steps and slopes up to STEP_UP, follow them down by as much; a bigger drop is a fall.
    const support = supportHeight(w, f, f.pos.y + STEP_UP);
    if (support >= f.pos.y - STEP_UP) {
      f.pos.y = support;
      f.floor = support;
      return;
    }
  }
  // Carried up a slope or onto a step while leaving the ground (a jump or a blow as it
  // walked onto it): the feet sank into it by less than a step; set them on its top,
  // rather than leave the body inside a volume that would later push it out sideways.
  const under = supportHeight(w, f, f.pos.y + STEP_UP);
  if (under > f.pos.y) {
    f.pos.y = under;
    if (f.vel.y < 0) f.vel.y = 0;
  }
  f.floor = supportHeight(w, f);
  if (f.pos.y > f.floor || f.vel.y > 0) {
    const before = f.pos.y;
    f.vel.y -= c.gravity * dt;
    f.pos.y += f.vel.y * dt;
    // Rising into something overhead (an upper floor, a roof): the head stops at its
    // underside, the climb ends there.
    if (f.vel.y > 0) {
      const ceiling = ceilingAbove(w, f, before + FIGHTER_HEIGHT);
      if (f.pos.y + FIGHTER_HEIGHT > ceiling) {
        f.pos.y = Math.max(before, ceiling - FIGHTER_HEIGHT);
        f.vel.y = 0;
      }
    }
    // Measured from the height before this tick's fall, so a fast fall cannot pass through a top.
    f.floor = supportHeight(w, f, Math.max(before, f.pos.y));
    if (f.pos.y <= f.floor) {
      f.pos.y = f.floor;
      f.vel.y = 0;
      land(w, f);
    }
  }
}

/** States that take control away after a blow. */
const STUNS = new Set<Action["kind"]>(["hitstun", "blockstun", "knockdown", "guardbroken"]);

/** When the fighter's current stun (and hitlag) ends; now if not stunned. */
function stunEnd(f: Fighter): number {
  const a = f.action;
  const until = a && STUNS.has(a.kind) && "until" in a ? a.until : -Infinity;
  return Math.max(until, f.hitlagUntil);
}

/** The command with the presses still in the input buffer added in. */
function buffered(w: BrawlWorld, f: Fighter, cmd: Command | undefined): Command {
  const out: Command = { ...(cmd ?? { unit: f.id }) };
  if (f.bufferedDodgeUntil >= w.time) out.dodge = true;
  if (f.bufferedJumpUntil >= w.time) {
    out.jump = true;
    out.jumpHeld = out.jumpHeld ?? true;
  }
  if (out.special === undefined && f.bufferedSpecial && f.bufferedSpecial.until >= w.time) out.special = f.bufferedSpecial.slot;
  return out;
}

/**
 * Directional influence (Smash's DI): the stick held when the hitlag ends turns the
 * launch toward its side, by up to diMaxAngle when held square across the launch.
 * Holding along the launch changes nothing.
 */
function influence(w: BrawlWorld, f: Fighter, move: { x: number; z: number } | undefined): void {
  const sp = Math.hypot(f.vel.x, f.vel.z);
  const m = move ? Math.hypot(move.x, move.z) : 0;
  if (sp < 1e-6 || m < 0.3) return;
  const across = (f.vel.x * move!.z - f.vel.z * move!.x) / (sp * m);
  const a = w.config.diMaxAngle * across;
  const [cs, sn] = [Math.cos(a), Math.sin(a)];
  const [x, z] = [f.vel.x, f.vel.z];
  f.vel.x = x * cs - z * sn;
  f.vel.z = x * sn + z * cs;
}

/** Touching the ground: jumps come back; an aerial strike still going costs a short landing lag. */
function land(w: BrawlWorld, f: Fighter): void {
  const c = w.config;
  f.airJumpsLeft = c.airJumps;
  f.drift = { x: 0, y: 0, z: 0 };
  // Ground tech: the press came just before touching down, up at once (or a roll toward the stick).
  if (f.action?.kind === "knockdown" && w.time - f.techTriedAt <= c.techWindow) {
    f.techTriedAt = -Infinity;
    f.invulnerableUntil = Math.max(f.invulnerableUntil, w.time + c.techInvulnerable);
    f.vel.x = f.vel.z = 0;
    f.combo = 0;
    const mv = f.techMove;
    f.action = mv ? { kind: "dodge", dir: hnorm({ x: mv.x, y: 0, z: mv.z }, f.facing), t: 0, stale: 0 } : null;
    w.events.push({ t: w.time, type: "tech", unit: f.id });
    return;
  }
  if (f.action?.kind === "aerial") f.action = { kind: "landing", until: w.time + w.config.landingLag };
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
    const hit = p.hit ?? specialHit(owner.kit.specials[p.slot]!, p.slot);
    // A thrown prop shatters wherever its flight ends.
    const finish = () => {
      if (p.prop !== undefined) shatter(w, w.arena.props[p.prop]!, p.pos.x, p.pos.z, owner.id);
      return false;
    };
    const stepLen = Math.min(p.remaining, p.speed * dt);
    p.pos.x += p.dir.x * stepLen;
    p.pos.y += p.dir.y * stepLen;
    p.pos.z += p.dir.z * stepLen;
    p.remaining -= stepLen;
    if (p.prop !== undefined) {
      // Thrown props drop slowly along their flight, and break on the floor.
      p.pos.y -= (stepLen / w.config.throwRange) * 1.2;
      const pr = w.arena.props[p.prop]!;
      pr.x = p.pos.x;
      pr.z = p.pos.z;
    }
    for (const o of w.fighters) {
      if (o.team === p.team || !o.alive || !sphereTouches(p.pos, p.size, o)) continue;
      if (applyHit(w, owner, o, hit, { x: p.pos.x - p.dir.x, y: 0, z: p.pos.z - p.dir.z })) return finish();
    }
    // Props stop projectiles (and take the damage if they can break).
    const wall = w.arena.props.find(
      (pr) => pr.alive && spansHeight(pr, p.pos.x, p.pos.z, p.pos.y, p.pos.y) && distToProp(pr, p.pos.x, p.pos.z) <= p.size * 0.5,
    );
    if (wall) {
      damageProp(w, owner, wall, hit.damage);
      return finish();
    }
    const inside = Math.abs(p.pos.x) < w.arena.halfW && Math.abs(p.pos.z) < w.arena.halfD && p.pos.y > 0;
    return p.remaining > 1e-9 && inside ? true : finish();
  });
}

function stepZones(w: BrawlWorld): void {
  w.zones = w.zones.filter((z) => {
    if (w.time < z.triggerAt) return true;
    const owner = w.fighters[z.owner]!;
    const sp = owner.kit.specials[z.slot]!;
    for (const o of w.fighters)
      if (
        o.team !== z.team && o.alive && hdist(o.pos, z.center) <= z.radius + o.kit.stats.radius &&
        Math.abs(o.floor - z.center.y) < 0.6 && o.pos.y < o.floor + 1.5
      )
        applyHit(w, owner, o, specialHit(sp, z.slot), z.center);
    for (const p of w.arena.props) if (p.alive && distToProp(p, z.center.x, z.center.z) <= z.radius) damageProp(w, owner, p, sp.damage);
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
        f.floor = 0;
        f.carrying = null;
        f.lastHitBy = null;
        f.action = null;
        f.shield = c.shieldMax;
        f.airJumpsLeft = c.airJumps;
        f.drift = { x: 0, y: 0, z: 0 };
        f.hitlagUntil = -Infinity;
        f.respawnAt = Infinity;
        f.invulnerableUntil = w.time + c.respawnInvulnerable;
        w.events.push({ t: w.time, type: "respawn", unit: f.id });
      }
      continue;
    }
    const cmd = byUnit.get(f.id);
    f.moving = false;
    if (cmd?.target !== undefined) f.target = cmd.target >= 0 ? cmd.target : null;
    if (cmd?.light) f.bufferedLightUntil = w.time + c.inputBuffer;
    const lightWanted = f.bufferedLightUntil >= w.time;
    const heavyPressed = !!cmd?.heavy && !f.heavyHeld;
    f.heavyHeld = !!cmd?.heavy;
    if (f.action?.kind !== "charge") f.energy = Math.min(c.energyMax, f.energy + c.energyRegen * dt);
    if (f.action?.kind !== "guard" && w.time - f.shieldUsedAt >= c.shieldRegenDelay)
      f.shield = Math.min(c.shieldMax, f.shield + c.shieldRegen * dt);
    // The breaker answers pressure at once, even frozen by hitlag.
    if (cmd?.dodge && canBreak(w, f)) {
      f.hitlagUntil = -Infinity;
      breaker(w, f);
      physics(w, f);
      continue;
    }
    // Presses made while busy are remembered a moment (input buffer); made while stunned,
    // until the stun is over: the answer comes out at the first free tick.
    const until = Math.max(w.time, stunEnd(f)) + c.inputBuffer;
    if (cmd?.dodge) f.bufferedDodgeUntil = until;
    if (cmd?.jump) f.bufferedJumpUntil = until;
    if (cmd?.special !== undefined) f.bufferedSpecial = { slot: cmd.special, until };
    // Knocked down: a guard or dodge press is a tech attempt (one per lockout).
    const guardPressed = !!cmd?.guard && !f.guardHeld;
    f.guardHeld = !!cmd?.guard;
    if (f.action?.kind === "knockdown" && (guardPressed || cmd?.dodge) && w.time - f.techTriedAt >= c.techLockout) {
      f.techTriedAt = w.time;
      const mv = cmd?.move;
      f.techMove = mv && Math.hypot(mv.x, mv.z) > 0.3 ? { x: mv.x, z: mv.z } : null;
    }
    // Hitlag: frozen in place; presses made meanwhile stay buffered.
    if (f.hitlagUntil > w.time) continue;
    // End of hitlag: the stick held bends the launch (directional influence).
    if (f.diPending) {
      f.diPending = false;
      influence(w, f, cmd?.move);
    }
    if (f.action) {
      const wasStunned = STUNS.has(f.action.kind);
      advanceAction(w, f, cmd, lightWanted);
      // Out of a stun: free on this very tick (no lost frame before the answer).
      if (wasStunned && !f.action) startAction(w, f, buffered(w, f, cmd), heavyPressed, lightWanted);
    } else startAction(w, f, buffered(w, f, cmd), heavyPressed, lightWanted);
    // A buffered press is spent once it has been acted on.
    const k = f.action?.kind;
    if (k === "dodge") f.bufferedDodgeUntil = -Infinity;
    if (k === "special" || k === "rush" || k === "leap" || k === "counter") f.bufferedSpecial = null;
    if (k === "jumpsquat" || (f.vel.y > 0 && !grounded(f))) f.bufferedJumpUntil = -Infinity;
    // A leap carries the body along its own arc.
    if (f.alive && f.action?.kind !== "leap") physics(w, f);
  }
  separate(w);
  stepProjectiles(w);
  stepZones(w);
  if (!w.over && w.time >= c.timeLimit) end(w, timeWinner(w));
}

/**
 * At time-out: the most K.-O. ("kills") or the most lives left ("stock"), then the higher
 * total remaining HP ratio; null on a tie at the top.
 */
function timeWinner(w: BrawlWorld): number | null {
  const teams = [...new Set(w.fighters.map((f) => f.team))];
  const hp = (team: number) =>
    w.fighters.filter((f) => f.team === team).reduce((s, f) => s + (f.alive ? f.hp / f.kit.stats.hp : 0), 0);
  const lives = (team: number) => w.fighters.filter((f) => f.team === team).reduce((s, f) => s + f.stocks, 0);
  const key = (team: number): [number, number] => [w.config.rule === "stock" ? lives(team) : (w.score[team] ?? 0), hp(team)];
  const ranked = teams.map((t) => ({ t, k: key(t) })).sort((a, b) => b.k[0] - a.k[0] || b.k[1] - a.k[1]);
  const [first, second] = ranked;
  if (!first) return null;
  if (second && second.k[0] === first.k[0] && second.k[1] === first.k[1]) return null;
  return first.t;
}
