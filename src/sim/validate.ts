// Turns untrusted JSON into a Kit, or a list of readable errors.
// Structural checks first, then design rules (counterplay guarantees), then budget.

import { checkProfile, kitProfile, type Profile, type ProfileRules } from "../balance/profile.ts";
import { kitBudget, type BudgetReport, type CostTable } from "./budget.ts";
import {
  ALLY_EFFECTS,
  ENEMY_EFFECTS,
  KIT_SCHEMA_VERSION,
  ROLES,
  type Ability,
  type Delivery,
  type Effect,
  type Kit,
} from "./kit.ts";

export const ABILITY_SLOTS = 2;

/** Hard limits on every number a kit may contain. */
const LIMITS = {
  hp: [600, 2000],
  moveSpeed: [2.5, 5],
  armor: [0, 0.4],
  radius: [0.4, 0.8],
  basicRange: [1, 8],
  basicDamage: [1, 300],
  basicInterval: [0.4, 2],
  basicProjectileSpeed: [5, 40],
  cooldown: [2, 30],
  range: [1, 12],
  speed: [5, 40],
  width: [0.2, 3],
  radiusArea: [0.5, 4],
  castRange: [0, 10],
  delay: [0, 2],
  dashDistance: [1, 8],
  amount: [1, 600],
  slowPct: [0.05, 0.5],
  slowDuration: [0.1, 2],
  stunDuration: [0.1, 1.25],
  knockback: [0.5, 4],
  shieldDuration: [0.5, 5],
  hastePct: [0.05, 0.5],
  hasteDuration: [0.5, 4],
} as const satisfies Record<string, readonly [number, number]>;

/** Minimum telegraph before a stun lands, so it can always be dodged. */
export const STUN_MIN_DELAY = 0.4;

/** Everything a kit is checked against: point costs and strength/weakness rules. */
export interface Balance {
  costs: CostTable;
  profile: ProfileRules;
}

export type ValidationResult =
  | { ok: true; kit: Kit; budget: BudgetReport; profile: Profile }
  | { ok: false; errors: string[]; budget?: BudgetReport; profile?: Profile };

export class Reader {
  errors: string[] = [];

  obj(v: unknown, path: string): Record<string, unknown> | undefined {
    if (typeof v === "object" && v !== null && !Array.isArray(v)) return v as Record<string, unknown>;
    this.errors.push(`${path}: objet attendu`);
    return undefined;
  }

  num(o: Record<string, unknown>, key: string, path: string, [min, max]: readonly [number, number]): number {
    const v = o[key];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      this.errors.push(`${path}.${key}: nombre attendu`);
      return NaN;
    }
    if (v < min || v > max) this.errors.push(`${path}.${key}: ${v} hors limites [${min}, ${max}]`);
    return v;
  }

  str(o: Record<string, unknown>, key: string, path: string): string {
    const v = o[key];
    if (typeof v !== "string" || !/^[a-z0-9-]{1,32}$/.test(v)) {
      this.errors.push(`${path}.${key}: identifiant attendu (a-z, 0-9, -)`);
      return "";
    }
    return v;
  }
}

function readDelivery(r: Reader, v: unknown, path: string): Delivery | undefined {
  const o = r.obj(v, path);
  if (!o) return undefined;
  switch (o.type) {
    case "projectile":
      return {
        type: "projectile",
        range: r.num(o, "range", path, LIMITS.range),
        speed: r.num(o, "speed", path, LIMITS.speed),
        width: r.num(o, "width", path, LIMITS.width),
      };
    case "line":
      return {
        type: "line",
        length: r.num(o, "length", path, LIMITS.range),
        width: r.num(o, "width", path, LIMITS.width),
        delay: r.num(o, "delay", path, LIMITS.delay),
      };
    case "circle":
      return {
        type: "circle",
        castRange: r.num(o, "castRange", path, LIMITS.castRange),
        radius: r.num(o, "radius", path, LIMITS.radiusArea),
        delay: r.num(o, "delay", path, LIMITS.delay),
      };
    case "dash":
      return {
        type: "dash",
        distance: r.num(o, "distance", path, LIMITS.dashDistance),
        speed: r.num(o, "speed", path, LIMITS.speed),
      };
    case "self":
      return { type: "self" };
    default:
      r.errors.push(`${path}.type: livraison inconnue "${String(o.type)}"`);
      return undefined;
  }
}

function readEffect(r: Reader, v: unknown, path: string): Effect | undefined {
  const o = r.obj(v, path);
  if (!o) return undefined;
  switch (o.type) {
    case "damage":
      return { type: "damage", amount: r.num(o, "amount", path, LIMITS.amount) };
    case "heal":
      return { type: "heal", amount: r.num(o, "amount", path, LIMITS.amount) };
    case "shield":
      return {
        type: "shield",
        amount: r.num(o, "amount", path, LIMITS.amount),
        duration: r.num(o, "duration", path, LIMITS.shieldDuration),
      };
    case "slow":
      return {
        type: "slow",
        pct: r.num(o, "pct", path, LIMITS.slowPct),
        duration: r.num(o, "duration", path, LIMITS.slowDuration),
      };
    case "stun":
      return { type: "stun", duration: r.num(o, "duration", path, LIMITS.stunDuration) };
    case "knockback":
      return { type: "knockback", distance: r.num(o, "distance", path, LIMITS.knockback) };
    case "haste":
      return {
        type: "haste",
        pct: r.num(o, "pct", path, LIMITS.hastePct),
        duration: r.num(o, "duration", path, LIMITS.hasteDuration),
      };
    default:
      r.errors.push(`${path}.type: effet inconnu "${String(o.type)}"`);
      return undefined;
  }
}

function readAbility(r: Reader, v: unknown, path: string): Ability | undefined {
  const o = r.obj(v, path);
  if (!o) return undefined;
  const id = r.str(o, "id", path);
  const cooldown = r.num(o, "cooldown", path, LIMITS.cooldown);
  const delivery = readDelivery(r, o.delivery, `${path}.delivery`);
  // A pure-mobility dash may carry no effect; everything else needs at least one.
  const minEffects = delivery?.type === "dash" ? 0 : 1;
  if (!Array.isArray(o.effects) || o.effects.length < minEffects || o.effects.length > 3) {
    r.errors.push(`${path}.effects: liste de ${minEffects} à 3 effets attendue`);
    return undefined;
  }
  const effects = o.effects.map((e, i) => readEffect(r, e, `${path}.effects[${i}]`));
  if (!delivery || effects.some((e) => !e)) return undefined;
  return { id, cooldown, delivery, effects: effects as Effect[] };
}

function readKit(r: Reader, v: unknown): Kit | undefined {
  const o = r.obj(v, "kit");
  if (!o) return undefined;
  if (o.schemaVersion !== KIT_SCHEMA_VERSION) {
    r.errors.push(`kit.schemaVersion: ${KIT_SCHEMA_VERSION} attendu`);
    return undefined;
  }
  const id = r.str(o, "id", "kit");
  const role = o.role;
  if (!ROLES.includes(role as never)) r.errors.push(`kit.role: un de ${ROLES.join(", ")} attendu`);
  const so = r.obj(o.stats, "kit.stats");
  const bo = r.obj(o.basic, "kit.basic");
  if (!so || !bo) return undefined;
  const stats = {
    hp: r.num(so, "hp", "kit.stats", LIMITS.hp),
    moveSpeed: r.num(so, "moveSpeed", "kit.stats", LIMITS.moveSpeed),
    armor: r.num(so, "armor", "kit.stats", LIMITS.armor),
    radius: r.num(so, "radius", "kit.stats", LIMITS.radius),
  };
  const basic = {
    range: r.num(bo, "range", "kit.basic", LIMITS.basicRange),
    damage: r.num(bo, "damage", "kit.basic", LIMITS.basicDamage),
    interval: r.num(bo, "interval", "kit.basic", LIMITS.basicInterval),
    ...(bo.projectileSpeed === undefined
      ? {}
      : { projectileSpeed: r.num(bo, "projectileSpeed", "kit.basic", LIMITS.basicProjectileSpeed) }),
  };
  if (!Array.isArray(o.abilities) || o.abilities.length !== ABILITY_SLOTS) {
    r.errors.push(`kit.abilities: exactement ${ABILITY_SLOTS} capacités attendues`);
    return undefined;
  }
  const abilities = o.abilities.map((a, i) => readAbility(r, a, `kit.abilities[${i}]`));
  if (abilities.some((a) => !a)) return undefined;
  return { schemaVersion: 1, id, role: role as Kit["role"], stats, basic, abilities: abilities as Ability[] };
}

/** Design rules that guarantee counterplay. */
function checkRules(kit: Kit): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  let stunAbilities = 0;
  kit.abilities.forEach((ab, i) => {
    const path = `kit.abilities[${i}]`;
    if (ids.has(ab.id)) errors.push(`${path}.id: "${ab.id}" en double`);
    ids.add(ab.id);
    const d = ab.delivery;
    const types = ab.effects.map((e) => e.type);
    if (new Set(types).size !== types.length) errors.push(`${path}.effects: un même type d'effet en double`);
    const hasEnemy = types.some((t) => ENEMY_EFFECTS.includes(t));
    const hasAlly = types.some((t) => ALLY_EFFECTS.includes(t));
    if (d.type === "self" && hasEnemy) errors.push(`${path}: une capacité "self" ne peut porter que des effets alliés`);
    if ((d.type === "projectile" || d.type === "line" || d.type === "dash") && hasAlly)
      errors.push(`${path}: les effets alliés exigent une livraison "self" ou "circle"`);
    if (types.includes("stun")) {
      stunAbilities++;
      const telegraphed = d.type === "projectile" || ((d.type === "circle" || d.type === "line") && d.delay >= STUN_MIN_DELAY);
      if (!telegraphed)
        errors.push(`${path}: un étourdissement doit être esquivable (projectile, ou zone avec délai ≥ ${STUN_MIN_DELAY} s)`);
    }
  });
  if (stunAbilities > 1) errors.push("kit: un seul contrôle fort (étourdissement) par kit");
  return errors;
}

export function validateKit(data: unknown, balance: Balance): ValidationResult {
  const { costs } = balance;
  const r = new Reader();
  const kit = readKit(r, data);
  if (!kit || r.errors.length > 0) return { ok: false, errors: r.errors };
  const errors = checkRules(kit);
  const budget = kitBudget(kit, costs);
  const profile = kitProfile(kit, costs);
  errors.push(...checkProfile(kit, profile, balance.profile));
  const total = Math.round(budget.total * 10) / 10;
  if (budget.total > costs.budget.max) errors.push(`budget: ${total} points dépasse le maximum de ${costs.budget.max}`);
  if (budget.total < costs.budget.min) errors.push(`budget: ${total} points sous le minimum de ${costs.budget.min}`);
  return errors.length > 0 ? { ok: false, errors, budget, profile } : { ok: true, kit, budget, profile };
}
