// Strength/weakness profile of a kit along readable axes, plus the rules
// that keep every kit within a role and force real weaknesses.
// The budget says "how strong"; the profile says "strong at what".

import { deliveryMultiplier, effectValue, kitBudget, type CostTable } from "../sim/budget.ts";
import { isEnemyEffect, ROLES, type Kit, type Role } from "../sim/kit.ts";

/** Axes measured in budget points. */
export const POINT_AXES = ["survie", "degats", "burst", "mobilite", "controle", "soutien"] as const;
export type PointAxis = (typeof POINT_AXES)[number];
/** Axes measured in their own unit (metres). */
export const METRE_AXES = ["portee"] as const;
export type MetreAxis = (typeof METRE_AXES)[number];
export type Axis = PointAxis | MetreAxis;

export const AXIS_LABELS: Record<Axis, string> = {
  survie: "Survie (PV, armure, soins et boucliers sur soi)",
  degats: "Dégâts continus (attaque de base)",
  burst: "Burst (dégâts des capacités)",
  mobilite: "Mobilité (vitesse, dashs, accélérations)",
  controle: "Contrôle (ralentir, étourdir, repousser)",
  soutien: "Soutien (soins et boucliers de zone pour l'équipe)",
  portee: "Portée de l'attaque de base (m)",
};

export interface Profile {
  total: number;
  /** Points per axis (can be negative: a paid-back weakness). */
  points: Record<PointAxis, number>;
  /** Share of the total budget per axis. */
  share: Record<PointAxis, number>;
  portee: number;
}

export function kitProfile(kit: Kit, costs: CostTable): Profile {
  const lines = kitBudget(kit, costs).lines;
  const line = (label: string) => lines.find((l) => l.label === label)?.points ?? 0;
  const p: Record<PointAxis, number> = {
    survie: line("hp") + line("armor") + line("radius"),
    degats: line("basic"),
    burst: 0,
    mobilite: line("moveSpeed"),
    controle: 0,
    soutien: 0,
  };
  const a = costs.ability;
  for (const ab of kit.abilities) {
    const perPoint = a.pointsPerValuePerSecond / ab.cooldown;
    const mult = deliveryMultiplier(ab, costs);
    const onSelfOnly = ab.delivery.type === "self";
    for (const e of ab.effects) {
      const pts = effectValue(e, costs) * mult * perPoint;
      if (e.type === "damage") p.burst += pts;
      else if (isEnemyEffect(e)) p.controle += pts;
      else if (e.type === "haste") p.mobilite += pts;
      else p[onSelfOnly ? "survie" : "soutien"] += pts;
    }
    if (ab.delivery.type === "dash") p.mobilite += ab.delivery.distance * a.dashMobilityPerMetre * perPoint;
  }
  const total = lines.reduce((s, l) => s + l.points, 0);
  const share = Object.fromEntries(POINT_AXES.map((ax) => [ax, p[ax] / total])) as Record<PointAxis, number>;
  return { total, points: p, share, portee: kit.basic.range };
}

export interface Bound {
  min?: number;
  max?: number;
}

export interface ProfileRules {
  version: number;
  /** No axis may take more than this share of the budget. */
  maxAxisShare: number;
  /** An axis at or above this share counts as a strength. */
  strongShare: number;
  maxStrengths: number;
  /** An axis at or below this share counts as a weakness. */
  weakShare: number;
  minWeaknesses: number;
  /** Per role: bounds on point axes (as shares) and on metre axes (in metres). */
  roles: Record<Role, Partial<Record<Axis, Bound>>>;
}

export function strengths(profile: Profile, rules: ProfileRules): PointAxis[] {
  return POINT_AXES.filter((ax) => profile.share[ax] >= rules.strongShare);
}

export function weaknesses(profile: Profile, rules: ProfileRules): PointAxis[] {
  return POINT_AXES.filter((ax) => profile.share[ax] <= rules.weakShare);
}

const pct = (v: number) => `${Math.round(v * 100)} %`;

/** Readable errors, empty if the profile respects the general and role rules. */
export function checkProfile(kit: Kit, profile: Profile, rules: ProfileRules): string[] {
  const errors: string[] = [];
  for (const ax of POINT_AXES) {
    if (profile.share[ax] > rules.maxAxisShare)
      errors.push(`profil: ${ax} prend ${pct(profile.share[ax])} du budget (maximum ${pct(rules.maxAxisShare)})`);
  }
  const strong = strengths(profile, rules);
  if (strong.length > rules.maxStrengths)
    errors.push(`profil: ${strong.length} points forts (${strong.join(", ")}), maximum ${rules.maxStrengths}`);
  const weak = weaknesses(profile, rules);
  if (weak.length < rules.minWeaknesses)
    errors.push(
      `profil: ${weak.length} point(s) faible(s) (${weak.join(", ") || "aucun"}), minimum ${rules.minWeaknesses} axes à ${pct(rules.weakShare)} ou moins`,
    );
  const bounds = rules.roles[kit.role] ?? {};
  for (const [ax, b] of Object.entries(bounds) as [Axis, Bound][]) {
    const isMetre = ax === "portee";
    const v = isMetre ? profile.portee : profile.share[ax as PointAxis];
    const show = (x: number) => (isMetre ? `${x} m` : pct(x));
    if (b.min !== undefined && v < b.min) errors.push(`rôle ${kit.role}: ${ax} ${show(round(v))} sous le minimum ${show(b.min)}`);
    if (b.max !== undefined && v > b.max) errors.push(`rôle ${kit.role}: ${ax} ${show(round(v))} au-dessus du maximum ${show(b.max)}`);
  }
  return errors;
}

const round = (v: number) => Math.round(v * 100) / 100;

/** Roles whose rules this kit satisfies (used to classify generated kits). */
export function matchingRoles(kit: Kit, profile: Profile, rules: ProfileRules): Role[] {
  return ROLES.filter((role) => checkProfile({ ...kit, role }, profile, rules).length === 0);
}
