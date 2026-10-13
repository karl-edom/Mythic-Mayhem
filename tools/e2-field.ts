// Experiment E2, field method: generate many random kits at the same budget,
// play a full round robin, then measure which kind of point is over- or
// under-priced. Optionally recalibrates the cost coefficients.
//
// Usage: node tools/e2-field.ts [--kits 80] [--seeds 4] [--team 3 --matches 20000] [--rounds 1] [--seed 1] [--write]
//   --team N    random NvN teams drawn from the field instead of a 1v1 round robin
//   --rounds N  recalibrate N-1 times, regenerating the field each round
//   --write     save the calibrated coefficients to data/balance/costs.json

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { FEATURES, kitFeatures, type Feature } from "../src/balance/features.ts";
import { randomField } from "../src/balance/generate.ts";
import { ridgeRegression } from "../src/balance/regress.ts";
import { DATA_DIR, loadCosts } from "../src/data/load.ts";
import type { CostTable } from "../src/sim/budget.ts";
import type { Kit } from "../src/sim/kit.ts";
import { rng } from "../src/sim/math.ts";
import { runMatch } from "../src/sim/match.ts";

const { values } = parseArgs({
  options: {
    kits: { type: "string", default: "80" },
    seeds: { type: "string", default: "4" },
    team: { type: "string", default: "1" },
    matches: { type: "string", default: "20000" },
    rounds: { type: "string", default: "1" },
    seed: { type: "string", default: "1" },
    write: { type: "boolean", default: false },
  },
});
const KITS = Number(values.kits);
const SEEDS = Number(values.seeds);
const TEAM = Number(values.team);
const MATCHES = Number(values.matches);
const ROUNDS = Number(values.rounds);
/** Features present in fewer kits than this are not trusted. */
const MIN_SUPPORT = 25;
/** Recalibration moves coefficients by value^DAMPING, to avoid oscillating. */
const DAMPING = 0.4;

function roundRobin(kits: Kit[]): number[] {
  const wins = kits.map(() => 0);
  const games = kits.map(() => 0);
  for (let i = 0; i < kits.length; i++) {
    for (let j = i + 1; j < kits.length; j++) {
      for (let s = 0; s < SEEDS; s++) {
        const flip = s % 2 === 1;
        const r = runMatch(flip ? [[kits[j]!], [kits[i]!]] : [[kits[i]!], [kits[j]!]], i * 100003 + j * 101 + s);
        const iTeam = flip ? 1 : 0;
        const iScore = r.winner === null ? 0.5 : r.winner === iTeam ? 1 : 0;
        wins[i]! += iScore;
        wins[j]! += 1 - iScore;
        games[i]!++;
        games[j]!++;
      }
    }
  }
  return wins.map((w, k) => w / games[k]!);
}

/** Random NvN matches; each kit scores the result of every match it plays. */
function randomTeams(kits: Kit[], random: () => number): number[] {
  const wins = kits.map(() => 0);
  const games = kits.map(() => 0);
  for (let m = 0; m < MATCHES; m++) {
    // Draw 2N distinct kits.
    const picked = new Set<number>();
    while (picked.size < TEAM * 2) picked.add(Math.floor(random() * kits.length));
    const ids = [...picked];
    const sides = [ids.slice(0, TEAM), ids.slice(TEAM)] as const;
    const r = runMatch([sides[0].map((i) => kits[i]!), sides[1].map((i) => kits[i]!)], m + 1);
    sides.forEach((side, team) => {
      const score = r.winner === null ? 0.5 : r.winner === team ? 1 : 0;
      for (const i of side) {
        wins[i]! += score;
        games[i]!++;
      }
    });
  }
  return wins.map((w, k) => w / Math.max(1, games[k]!));
}

const stdev = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};
const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

interface RoundResult {
  spread: number;
  inBand: number;
  min: number;
  max: number;
  value: Partial<Record<Feature, number>>;
  support: Record<Feature, number>;
}

function evaluate(costs: CostTable, round: number): RoundResult {
  const target = (costs.budget.min + costs.budget.max) / 2;
  const random = rng(Number(values.seed) * 7919 + round);
  const kits = randomField(random, KITS, costs, target);
  const rates = TEAM === 1 ? roundRobin(kits) : randomTeams(kits, random);
  const feats = kits.map((k) => kitFeatures(k, costs));
  const support = Object.fromEntries(
    FEATURES.map((f) => [f, feats.filter((x) => Math.abs(x[f]) > 1).length]),
  ) as Record<Feature, number>;
  const b = ridgeRegression(
    feats.map((x) => FEATURES.map((f) => x[f])),
    rates,
  );
  // With every kit at the same budget, perfect pricing means each point is worth 0.5 / target win rate.
  const value: Partial<Record<Feature, number>> = {};
  FEATURES.forEach((f, i) => {
    if (support[f] >= MIN_SUPPORT) value[f] = b[i]! / (0.5 / target);
  });
  return {
    spread: stdev(rates),
    inBand: rates.filter((r) => r >= 0.35 && r <= 0.65).length / rates.length,
    min: Math.min(...rates),
    max: Math.max(...rates),
    value,
    support,
  };
}

function report(r: RoundResult, round: number): void {
  console.log(`\n— Tour ${round} —`);
  console.log(`Écart-type des taux de victoire : ${pct(r.spread)} (min ${pct(r.min)}, max ${pct(r.max)})`);
  console.log(`Kits entre 35 % et 65 % de victoires : ${pct(r.inBand)}`);
  console.log("Valeur réelle d'un point, par catégorie (1,00 = bien payé ; >1 = sous-payé ; <1 = sur-payé) :");
  for (const f of FEATURES) {
    const v = r.value[f];
    const frozen = NOT_CALIBRATED.includes(f) ? "  [gelé]" : "";
    console.log(`  ${f.padEnd(13)} ${v === undefined ? "   —  " : v.toFixed(2).padStart(6)}   (présent dans ${r.support[f]} kits)${frozen}`);
  }
}

/**
 * Utility features that bots cannot value (they never chain crowd control into
 * focused damage), so measurements would drive their price to zero. Their
 * coefficients stay at the design hypothesis until better bots or playtests.
 */
const NOT_CALIBRATED: readonly Feature[] = ["slow", "stun", "knockback", "haste", "dashMobility"];

/** Moves each coefficient towards the measured value of its points. */
function recalibrate(costs: CostTable, value: Partial<Record<Feature, number>>): CostTable {
  const c: CostTable = structuredClone(costs);
  const factor = (f: Feature) => {
    const v = value[f];
    return v === undefined || NOT_CALIBRATED.includes(f) ? 1 : Math.min(2, Math.max(0.5, v)) ** DAMPING;
  };
  c.stats.pointsPer100Hp *= factor("hp");
  c.stats.pointsPerMoveSpeed *= factor("moveSpeed");
  c.stats.pointsPerEhpPercentFromArmor *= factor("armor");
  c.stats.pointsPerRadiusBelowBase *= factor("radius");
  const e = c.ability.effectValue;
  e.damage *= factor("damage");
  e.heal *= factor("heal");
  e.shield *= factor("shield");
  e.slowPerPctSecond *= factor("slow");
  e.stunPerSecond *= factor("stun");
  e.knockbackPerMetre *= factor("knockback");
  e.hastePerPctSecond *= factor("haste");
  c.ability.dashMobilityPerMetre *= factor("dashMobility");
  // Basic attack: cost = dps · k · (1 + f·range). Fit k and f so a typical melee
  // range (1.6 m) and a typical ranged range (5.25 m) each move by their own factor.
  const [rm, rr] = [1.6, 5.25];
  const f0 = c.basic.rangeFactorPerMetre;
  const m = (1 + f0 * rm) * factor("basicMelee");
  const r = (1 + f0 * rr) * factor("basicRanged");
  const f1 = (r - m) / (m * rr - r * rm);
  if (Number.isFinite(f1) && f1 > 0) {
    c.basic.pointsPerDps *= m / (1 + f1 * rm);
    c.basic.rangeFactorPerMetre = f1;
  }
  return c;
}

const roundCoefficients = (c: CostTable): CostTable =>
  JSON.parse(JSON.stringify(c, (_k, v: unknown) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1000) / 1000 : v)));

let costs = loadCosts();
console.log(
  TEAM === 1
    ? `E2 (champ) — ${KITS} kits aléatoires à budget égal, ${SEEDS} combats par paire, duels 1v1`
    : `E2 (champ) — ${KITS} kits aléatoires à budget égal, ${MATCHES} matchs ${TEAM}v${TEAM} entre équipes tirées au hasard`,
);
const started = Date.now();
for (let round = 1; round <= ROUNDS; round++) {
  const result = evaluate(costs, round);
  report(result, round);
  if (round < ROUNDS) costs = roundCoefficients(recalibrate(costs, result.value));
}
console.log(`\n(${((Date.now() - started) / 1000).toFixed(0)} s)`);
if (values.write) {
  writeFileSync(join(DATA_DIR, "balance/costs.json"), JSON.stringify(costs, null, 2) + "\n");
  console.log("Coefficients enregistrés dans data/balance/costs.json");
} else if (ROUNDS > 1) {
  console.log("Coefficients proposés (non enregistrés, ajouter --write) :");
  console.log(JSON.stringify(costs, null, 2));
}
