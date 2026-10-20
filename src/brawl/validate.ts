// Turns untrusted JSON into a FighterKit, or a list of readable errors.
// Structural checks first, then design rules (counterplay guarantees), then budget.
// Pure: no I/O, so the browser client runs the exact same checks as the tools.

import { Reader } from "../sim/validate.ts";
import { fighterBudget, type BrawlBudget, type BrawlCostTable } from "./budget.ts";
import { ARCHETYPES, FIGHTER_SCHEMA_VERSION, type Archetype, type FighterKit, type Special, type SpecialDelivery, type Strike } from "./kit.ts";

export const MAX_LIGHT_HITS = 3;
export const MAX_SPECIALS = 3;

/** Hard limits on every number a fighter kit may contain. */
const LIMITS = {
  hp: [700, 1600],
  moveSpeed: [3.5, 8],
  jumpSpeed: [6, 14],
  weight: [0.7, 1.4],
  radius: [0.35, 0.8],
  damage: [1, 400],
  startup: [0.05, 1.5],
  active: [0.03, 0.5],
  recovery: [0.05, 1.5],
  reach: [0.3, 3],
  size: [0.2, 2],
  hitstun: [0.05, 1.2],
  knockback: [0, 20],
  maxCharge: [0, 2],
  chargeBonus: [1, 2.5],
  energyCost: [10, 100],
  specialStartup: [0.05, 1.5],
  specialRecovery: [0.1, 2],
  projectileSpeed: [6, 40],
  projectileRange: [3, 25],
  rushDistance: [2, 12],
  rushSpeed: [8, 40],
  diveDistance: [2, 14],
  diveSpeed: [12, 45],
  burstRadius: [0.8, 4],
  castRange: [0, 12],
  trapRadius: [0.8, 3.5],
  trapArm: [0.3, 2],
  trapLifetime: [1, 8],
  counterWindow: [0.1, 1.2],
} as const satisfies Record<string, readonly [number, number]>;

/** A light-combo opener must be slow enough to be blocked on reaction... */
export const MIN_LIGHT_STARTUP = 0.08;
/** ...and the heavy attack, which breaks guard, must be readable and dodgeable. */
export const MIN_HEAVY_STARTUP = 0.35;
/** A guard-breaking special must be telegraphed at least this long. */
export const MIN_GUARD_BREAK_TELEGRAPH = 0.4;
/** Rhythm v3 (decision 0011): every light hit pushes back at least this much, so combos cannot be stretched… */
export const MIN_LIGHT_KNOCKBACK = 4;
/** …and the last one ejects (≈ 4–5 m), so every exchange ends at a distance. */
export const MIN_EJECT_KNOCKBACK = 12;
/** A missed blow leaves an opening at least this long (seconds): whiffs can be punished. */
export const MIN_RECOVERY = { light: 0.2, lastLight: 0.4, heavy: 0.6, special: 0.35 } as const;

export type FighterValidation =
  | { ok: true; kit: FighterKit; budget: BrawlBudget }
  | { ok: false; errors: string[]; budget?: BrawlBudget };

function readStrike(r: Reader, v: unknown, path: string): Strike | undefined {
  const o = r.obj(v, path);
  if (!o) return undefined;
  return {
    damage: r.num(o, "damage", path, LIMITS.damage),
    startup: r.num(o, "startup", path, LIMITS.startup),
    active: r.num(o, "active", path, LIMITS.active),
    recovery: r.num(o, "recovery", path, LIMITS.recovery),
    reach: r.num(o, "reach", path, LIMITS.reach),
    size: r.num(o, "size", path, LIMITS.size),
    hitstun: r.num(o, "hitstun", path, LIMITS.hitstun),
    knockback: r.num(o, "knockback", path, LIMITS.knockback),
  };
}

function readDelivery(r: Reader, v: unknown, path: string): SpecialDelivery | undefined {
  const o = r.obj(v, path);
  if (!o) return undefined;
  switch (o.type) {
    case "projectile":
      return {
        type: "projectile",
        speed: r.num(o, "speed", path, LIMITS.projectileSpeed),
        range: r.num(o, "range", path, LIMITS.projectileRange),
        size: r.num(o, "size", path, LIMITS.size),
      };
    case "rush":
      return {
        type: "rush",
        distance: r.num(o, "distance", path, LIMITS.rushDistance),
        speed: r.num(o, "speed", path, LIMITS.rushSpeed),
        size: r.num(o, "size", path, LIMITS.size),
      };
    case "dive":
      return {
        type: "dive",
        distance: r.num(o, "distance", path, LIMITS.diveDistance),
        speed: r.num(o, "speed", path, LIMITS.diveSpeed),
        size: r.num(o, "size", path, LIMITS.size),
      };
    case "burst":
      return { type: "burst", radius: r.num(o, "radius", path, LIMITS.burstRadius) };
    case "trap":
      return {
        type: "trap",
        castRange: r.num(o, "castRange", path, LIMITS.castRange),
        radius: r.num(o, "radius", path, LIMITS.trapRadius),
        arm: r.num(o, "arm", path, LIMITS.trapArm),
        lifetime: r.num(o, "lifetime", path, LIMITS.trapLifetime),
      };
    case "area":
    case "leap":
      r.errors.push(`${path}.type: "${o.type}" n'existe plus (décision 0029) : "leap" devient "dive", "area" devient "burst" (autour de soi) ou "trap" (piège posé)`);
      return undefined;
    case "counter":
      return { type: "counter", window: r.num(o, "window", path, LIMITS.counterWindow) };
    default:
      r.errors.push(`${path}.type: livraison inconnue "${String(o.type)}"`);
      return undefined;
  }
}

function readSpecial(r: Reader, v: unknown, path: string): Special | undefined {
  const o = r.obj(v, path);
  if (!o) return undefined;
  const delivery = readDelivery(r, o.delivery, `${path}.delivery`);
  if (typeof o.guardBreak !== "boolean") r.errors.push(`${path}.guardBreak: booléen attendu`);
  if (!delivery) return undefined;
  return {
    id: r.str(o, "id", path),
    energyCost: r.num(o, "energyCost", path, LIMITS.energyCost),
    startup: r.num(o, "startup", path, LIMITS.specialStartup),
    recovery: r.num(o, "recovery", path, LIMITS.specialRecovery),
    delivery,
    damage: r.num(o, "damage", path, LIMITS.damage),
    hitstun: r.num(o, "hitstun", path, LIMITS.hitstun),
    knockback: r.num(o, "knockback", path, LIMITS.knockback),
    guardBreak: o.guardBreak === true,
  };
}

/** Counterplay guarantees: every rule here names what the opponent can do about it. */
function designErrors(kit: FighterKit): string[] {
  const errors: string[] = [];
  const first = kit.light.hits[0];
  if (first && first.startup < MIN_LIGHT_STARTUP)
    errors.push(`light.hits[0].startup: au moins ${MIN_LIGHT_STARTUP} s, pour pouvoir garder en réaction`);
  const hits = kit.light.hits;
  hits.forEach((h, i) => {
    const last = i === hits.length - 1;
    if (last && h.knockback < MIN_EJECT_KNOCKBACK)
      errors.push(`light.hits[${i}].knockback: le dernier coup du combo éjecte, recul ≥ ${MIN_EJECT_KNOCKBACK} (l'échange finit à distance)`);
    if (!last && h.knockback < MIN_LIGHT_KNOCKBACK)
      errors.push(`light.hits[${i}].knockback: au moins ${MIN_LIGHT_KNOCKBACK}, chaque coup repousse un peu`);
    const min = last ? MIN_RECOVERY.lastLight : MIN_RECOVERY.light;
    if (h.recovery < min) errors.push(`light.hits[${i}].recovery: au moins ${min} s, un coup raté doit pouvoir se punir`);
  });
  if (kit.heavy.startup < MIN_HEAVY_STARTUP)
    errors.push(`heavy.startup: au moins ${MIN_HEAVY_STARTUP} s, l'attaque lourde use le bouclier deux fois plus vite et doit se voir venir`);
  if (kit.heavy.recovery < MIN_RECOVERY.heavy) errors.push(`heavy.recovery: au moins ${MIN_RECOVERY.heavy} s, un coup raté doit pouvoir se punir`);
  kit.specials.forEach((sp, i) => {
    const d = sp.delivery;
    // A trap shows from the moment it is set: its arming time is telegraph too.
    const telegraph = sp.startup + (d.type === "trap" ? d.arm : 0);
    if (sp.recovery < MIN_RECOVERY.special) errors.push(`specials[${i}].recovery: au moins ${MIN_RECOVERY.special} s, une spéciale ratée doit pouvoir se punir`);
    if (sp.guardBreak && telegraph < MIN_GUARD_BREAK_TELEGRAPH)
      errors.push(`specials[${i}]: une spéciale brise-garde doit être télégraphiée au moins ${MIN_GUARD_BREAK_TELEGRAPH} s (démarrage, plus l'armement pour un piège)`);
  });
  const ids = kit.specials.map((s) => s.id);
  if (new Set(ids).size !== ids.length) errors.push("specials: identifiants en double");
  return errors;
}

export function validateFighter(data: unknown, costs: BrawlCostTable): FighterValidation {
  const r = new Reader();
  const o = r.obj(data, "kit");
  if (!o) return { ok: false, errors: r.errors };
  if (o.schemaVersion !== FIGHTER_SCHEMA_VERSION)
    return { ok: false, errors: [`kit.schemaVersion: ${FIGHTER_SCHEMA_VERSION} attendu (contrat de combat brawler v3, voir docs/design/combat-contract-v2.md)`] };
  const id = r.str(o, "id", "kit");
  if (!ARCHETYPES.includes(o.archetype as Archetype)) r.errors.push(`kit.archetype: un parmi ${ARCHETYPES.join(", ")}`);

  const so = r.obj(o.stats, "kit.stats");
  const stats = so && {
    hp: r.num(so, "hp", "kit.stats", LIMITS.hp),
    moveSpeed: r.num(so, "moveSpeed", "kit.stats", LIMITS.moveSpeed),
    jumpSpeed: r.num(so, "jumpSpeed", "kit.stats", LIMITS.jumpSpeed),
    weight: r.num(so, "weight", "kit.stats", LIMITS.weight),
    radius: r.num(so, "radius", "kit.stats", LIMITS.radius),
  };

  const lo = r.obj(o.light, "kit.light");
  const rawHits = lo?.hits;
  if (lo && (!Array.isArray(rawHits) || rawHits.length < 1 || rawHits.length > MAX_LIGHT_HITS))
    r.errors.push(`kit.light.hits: entre 1 et ${MAX_LIGHT_HITS} coups`);
  const hits = Array.isArray(rawHits) ? rawHits.map((h, i) => readStrike(r, h, `kit.light.hits[${i}]`)) : [];

  const ho = r.obj(o.heavy, "kit.heavy");
  const heavyStrike = ho && readStrike(r, ho, "kit.heavy");
  const heavy = ho && heavyStrike && {
    ...heavyStrike,
    maxCharge: r.num(ho, "maxCharge", "kit.heavy", LIMITS.maxCharge),
    chargeBonus: r.num(ho, "chargeBonus", "kit.heavy", LIMITS.chargeBonus),
  };

  const rawSpecials = o.specials;
  if (!Array.isArray(rawSpecials) || rawSpecials.length < 1 || rawSpecials.length > MAX_SPECIALS)
    r.errors.push(`kit.specials: entre 1 et ${MAX_SPECIALS} spéciales`);
  const specials = Array.isArray(rawSpecials) ? rawSpecials.map((s, i) => readSpecial(r, s, `kit.specials[${i}]`)) : [];

  if (r.errors.length > 0 || !stats || !heavy || hits.some((h) => !h) || specials.some((s) => !s))
    return { ok: false, errors: r.errors };

  const kit: FighterKit = {
    schemaVersion: 3,
    id,
    archetype: o.archetype as Archetype,
    stats,
    light: { hits: hits as Strike[] },
    heavy,
    specials: specials as Special[],
  };
  const errors = designErrors(kit);
  const budget = fighterBudget(kit, costs);
  const { min, max } = costs.budget;
  if (budget.total > max) errors.push(`budget: ${budget.total.toFixed(1)} points, maximum ${max}`);
  if (budget.total < min) errors.push(`budget: ${budget.total.toFixed(1)} points, minimum ${min}`);
  return errors.length > 0 ? { ok: false, errors, budget } : { ok: true, kit, budget };
}
