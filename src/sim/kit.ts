// Kit data format (schema version 1). A kit is everything the combat engine
// knows about a character; identity (name, universe, visuals) lives elsewhere.

export const KIT_SCHEMA_VERSION = 1;

export type Role = "vanguard" | "fighter" | "marksman" | "controller" | "support" | "assassin";
export const ROLES: readonly Role[] = ["vanguard", "fighter", "marksman", "controller", "support", "assassin"];

/** Effects that land on enemies. */
export type EnemyEffect =
  | { type: "damage"; amount: number }
  | { type: "slow"; pct: number; duration: number }
  | { type: "stun"; duration: number }
  | { type: "knockback"; distance: number };

/** Effects that land on allies (including the caster). */
export type AllyEffect =
  | { type: "heal"; amount: number }
  | { type: "shield"; amount: number; duration: number }
  | { type: "haste"; pct: number; duration: number };

export type Effect = EnemyEffect | AllyEffect;
export type EffectType = Effect["type"];

export const ENEMY_EFFECTS: readonly EffectType[] = ["damage", "slow", "stun", "knockback"];
export const ALLY_EFFECTS: readonly EffectType[] = ["heal", "shield", "haste"];

export function isEnemyEffect(e: Effect): e is EnemyEffect {
  return ENEMY_EFFECTS.includes(e.type);
}

export type Delivery =
  /** Skillshot: travels in a straight line, hits the first enemy. */
  | { type: "projectile"; range: number; speed: number; width: number }
  /** Telegraphed rectangle from the caster, resolves after `delay`. */
  | { type: "line"; length: number; width: number; delay: number }
  /** Telegraphed circle placed up to `castRange` away (0 = on the caster), resolves after `delay`. */
  | { type: "circle"; castRange: number; radius: number; delay: number }
  /** Caster moves; enemy effects apply to the first enemy touched, which ends the dash. */
  | { type: "dash"; distance: number; speed: number }
  /** Instant, on the caster only. */
  | { type: "self" };

export type DeliveryType = Delivery["type"];

export interface Ability {
  id: string;
  cooldown: number;
  delivery: Delivery;
  effects: Effect[];
}

export interface Stats {
  hp: number;
  moveSpeed: number;
  /** Damage reduction, 0..1. */
  armor: number;
  /** Collision radius in metres. Bigger is easier to hit. */
  radius: number;
}

export interface BasicAttack {
  range: number;
  damage: number;
  /** Seconds between attacks. */
  interval: number;
  /** Homing projectile speed; absent = instant (melee). */
  projectileSpeed?: number;
}

export interface Kit {
  schemaVersion: 1;
  id: string;
  role: Role;
  stats: Stats;
  basic: BasicAttack;
  abilities: Ability[];
}
