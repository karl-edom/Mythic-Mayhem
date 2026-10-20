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
  /**
   * Dives at the target's body in a straight line, in 3D (from the air as well), aimed
   * when it comes out: `distance` metres at most, at `speed`. The first enemy touched is
   * hit and the dive stops; so does a wall or the ground (decision 0029).
   */
  | { type: "dive"; distance: number; speed: number; size: number }
  /** A blast all around the fighter (`radius`), the instant the special comes out. */
  | { type: "burst"; radius: number }
  /**
   * A trap set on the ground up to `castRange` towards the target. Armed after `arm`
   * seconds, it goes off when an enemy steps into its `radius`, or by itself once
   * `lifetime` is over. One per special: setting it again replaces the last one.
   */
  | { type: "trap"; castRange: number; radius: number; arm: number; lifetime: number }
  /**
   * Counter stance for `window` seconds: a blow struck in person (melee or rush) is
   * slipped with a spin, and the special strikes the attacker in the back.
   */
  | { type: "counter"; window: number };

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
