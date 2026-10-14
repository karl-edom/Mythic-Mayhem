// Fighter kit format (schema version 2): the arena-brawler combat contract.
// A kit is everything the engine knows about a fighter; identity (name,
// universe, colours) lives in character.json and is display-only.

export const FIGHTER_SCHEMA_VERSION = 3;

export type Archetype = "rushdown" | "balanced" | "heavy" | "zoner";
export const ARCHETYPES: readonly Archetype[] = ["rushdown", "balanced", "heavy", "zoner"];

/** One melee strike: a sphere in front of the fighter, live during its active window. */
export interface Strike {
  damage: number;
  /** Seconds before the hitbox appears (the visible wind-up). */
  startup: number;
  /** Seconds the hitbox stays live. */
  active: number;
  /** Seconds after the hitbox during which the fighter is committed. */
  recovery: number;
  /** Distance from the fighter's centre to the hitbox centre, in metres. */
  reach: number;
  /** Hitbox radius, in metres. */
  size: number;
  /** Seconds the target cannot act after being hit. */
  hitstun: number;
  /** Push speed given to the target, in m/s. Above KNOCKDOWN_SPEED it floors them. */
  knockback: number;
}

/** Light attack: a chain of strikes. Pressing again during a strike's recovery starts the next one. */
export interface LightCombo {
  hits: Strike[];
}

/** Heavy attack: slow, breaks guard, can be charged by holding the button. */
export interface HeavyAttack extends Strike {
  /** Seconds of holding for a full charge. */
  maxCharge: number;
  /** Damage multiplier at full charge (≥ 1). */
  chargeBonus: number;
}

export type SpecialDelivery =
  /** Travels straight towards the target, hits the first enemy. */
  | { type: "projectile"; speed: number; range: number; size: number }
  /** The fighter rushes forward; the first enemy touched is hit and the rush stops. */
  | { type: "rush"; distance: number; speed: number; size: number }
  /** Telegraphed circle placed towards the target, resolves after `delay`. */
  | { type: "area"; castRange: number; radius: number; delay: number };

export interface Special {
  id: string;
  /** Energy spent on use (energy gauge max is 100). */
  energyCost: number;
  /** Seconds before the special comes out. */
  startup: number;
  /** Seconds the fighter is committed after it comes out. */
  recovery: number;
  delivery: SpecialDelivery;
  damage: number;
  hitstun: number;
  knockback: number;
  /** Ignores guard (like the heavy attack). Expensive in the budget. */
  guardBreak: boolean;
}

export interface FighterStats {
  hp: number;
  /** Ground and air speed, m/s. */
  moveSpeed: number;
  /** Initial vertical speed of a jump, m/s. */
  jumpSpeed: number;
  /** Knockback received is divided by weight. 1 = reference. */
  weight: number;
  /** Body radius, metres (hurtbox is a capsule of this radius). */
  radius: number;
}

export interface FighterKit {
  schemaVersion: 3;
  id: string;
  archetype: Archetype;
  stats: FighterStats;
  light: LightCombo;
  heavy: HeavyAttack;
  specials: Special[];
}
