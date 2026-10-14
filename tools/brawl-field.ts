// Brawler calibration, field method (same idea as E2). Characters are never
// tuned one by one: a correct price list balances any kit that fits the
// budget, including the ones not written yet.
//
// Each round, random kits with budgets spread over [70, 120] play a round robin;
// a regression (with intercept) measures what one point of each kind is worth
// in win rate, compared with an average point. Coefficients move towards it.
// Before and after, a field of kits all at the same budget measures balance
// itself: the spread of their win rates (lower is better).
//
// Usage: node tools/brawl-field.ts [--kits 60] [--seeds 2] [--rounds 1] [--seed 1] [--arena clairiere] [--write]
//        node tools/brawl-field.ts --gauntlet-check 20
//   Draws N new random kits, tunes each one alone against the reference panel,
//   then plays them against each other: the test of "add 50 characters without
//   rebalancing the others".

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { buildArena, type ArenaDef } from "../src/brawl/arena.ts";
import { fighterBudget, type BrawlCostTable } from "../src/brawl/budget.ts";
import { randomRoster } from "../src/brawl/generate.ts";
import { referencePanel, tuneToGauntlet } from "../src/brawl/gauntlet.ts";
import type { FighterKit } from "../src/brawl/kit.ts";
import { loadArenas, loadBrawlCosts, loadPropCatalog } from "../src/brawl/load.ts";
import { runDuel } from "../src/brawl/match.ts";
import { ridgeRegression } from "../src/balance/regress.ts";
import { DATA_DIR } from "../src/data/load.ts";
import { rng } from "../src/sim/math.ts";

const { values } = parseArgs({
  options: {
    kits: { type: "string", default: "60" },
    seeds: { type: "string", default: "2" },
    rounds: { type: "string", default: "1" },
    seed: { type: "string", default: "1" },
    arena: { type: "string" },
    write: { type: "boolean", default: false },
    "gauntlet-check": { type: "string" },
  },
});
const KITS = Number(values.kits);
const SEEDS = Number(values.seeds);
const ROUNDS = Number(values.rounds);
/** Corrections move coefficients by value^DAMPING, to avoid oscillating. */
const DAMPING = 0.5;
const MIN_SUPPORT = 15;

export const FIELD_FEATURES = ["survie", "mobilite", "combo", "lourde", "projectile", "rush", "area"] as const;
type Feature = (typeof FIELD_FEATURES)[number];

function features(kit: FighterKit, costs: BrawlCostTable): Record<Feature, number> {
  const f = Object.fromEntries(FIELD_FEATURES.map((k) => [k, 0])) as Record<Feature, number>;
  const lines = fighterBudget(kit, costs).lines;
  for (const l of lines) {
    if (l.label.startsWith("special:")) {
      const sp = kit.specials.find((s) => `special:${s.id}` === l.label)!;
      f[sp.delivery.type] += l.points;
    } else f[l.label as Feature] += l.points;
  }
  return f;
}

const catalog = loadPropCatalog();
const arenaDef: ArenaDef | undefined = values.arena ? loadArenas(catalog).find((a) => a.id === values.arena) : undefined;
if (values.arena && !arenaDef) throw new Error(`arène inconnue : ${values.arena}`);

function roundRobin(kits: FighterKit[]): number[] {
  const score = kits.map(() => 0);
  const games = kits.map(() => 0);
  for (let i = 0; i < kits.length; i++)
    for (let j = i + 1; j < kits.length; j++)
      for (let s = 0; s < SEEDS; s++) {
        const flip = s % 2 === 1;
        const arena = arenaDef ? buildArena(arenaDef, catalog) : undefined;
        const [a, b] = flip ? [kits[j]!, kits[i]!] : [kits[i]!, kits[j]!];
        const r = runDuel(a, b, i * 100003 + j * 101 + s, undefined, undefined, arena);
        const iSide = flip ? 1 : 0;
        const si = r.winner === null ? 0.5 : r.winner === iSide ? 1 : 0;
        score[i]! += si;
        score[j]! += 1 - si;
        games[i]!++;
        games[j]!++;
      }
  return score.map((w, k) => w / games[k]!);
}

const stdev = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};
const pct = (v: number) => `${(v * 100).toFixed(1)} %`;

/** Balance at equal budget: spread of win rates of kits that all cost the same. */
function balanceCheck(costs: BrawlCostTable, seed: number) {
  const target = costs.budget.target;
  const kits = randomRoster(rng(seed), KITS, costs, target);
  const rates = roundRobin(kits);
  return {
    kits: kits.length,
    spread: stdev(rates),
    inBand: rates.filter((r) => r >= 0.35 && r <= 0.65).length / rates.length,
    min: Math.min(...rates),
    max: Math.max(...rates),
  };
}

/** What a point of each kind is worth, relative to an average point (1 = fairly priced). */
function measure(costs: BrawlCostTable, round: number) {
  const kits = randomRoster(rng(Number(values.seed) * 7919 + round), KITS, costs, [70, 120]);
  const rates = roundRobin(kits);
  const feats = kits.map((k) => features(k, costs));
  const support = Object.fromEntries(FIELD_FEATURES.map((f) => [f, feats.filter((x) => x[f] > 1).length])) as Record<Feature, number>;
  const b = ridgeRegression(feats.map((x) => [1, ...FIELD_FEATURES.map((f) => x[f])]), rates);
  const totals = feats.map((x) => FIELD_FEATURES.reduce((s, f) => s + x[f], 0));
  const [, slope] = ridgeRegression(totals.map((t) => [1, t]), rates);
  const value: Partial<Record<Feature, number>> = {};
  FIELD_FEATURES.forEach((f, i) => {
    if (support[f] >= MIN_SUPPORT) value[f] = b[i + 1]! / slope!;
  });
  return { kits: kits.length, value, support, slope: slope! };
}

function reportBalance(label: string, r: ReturnType<typeof balanceCheck>): void {
  console.log(`\n${label} : ${r.kits} kits au même budget`);
  console.log(`  écart-type des taux de victoire : ${pct(r.spread)} (min ${pct(r.min)}, max ${pct(r.max)})`);
  console.log(`  kits entre 35 % et 65 % de victoires : ${pct(r.inBand)}`);
}

function recalibrate(costs: BrawlCostTable, value: Partial<Record<Feature, number>>): BrawlCostTable {
  const c = structuredClone(costs);
  const k = (f: Feature) => {
    const v = value[f];
    return v === undefined ? 1 : Math.min(3, Math.max(0.33, v)) ** DAMPING;
  };
  c.survival.pointsAtBaseHp *= k("survie");
  c.survival.pointsPerRadiusAboveBase *= k("survie");
  c.mobility.pointsPerMoveSpeed *= k("mobilite");
  c.mobility.pointsPerJumpSpeed *= k("mobilite");
  c.light.pointsPerDps *= k("combo");
  c.light.pointsPerSecondOfFastStartup *= k("combo");
  c.heavy.pointsPerDps *= k("lourde");
  for (const d of ["projectile", "rush", "area"] as const) c.special.deliveryFactor[d] *= k(d);
  // Round for a readable file.
  const r4 = (x: number) => Number(x.toPrecision(4));
  c.survival.pointsAtBaseHp = r4(c.survival.pointsAtBaseHp);
  c.survival.pointsPerRadiusAboveBase = r4(c.survival.pointsPerRadiusAboveBase);
  c.mobility.pointsPerMoveSpeed = r4(c.mobility.pointsPerMoveSpeed);
  c.mobility.pointsPerJumpSpeed = r4(c.mobility.pointsPerJumpSpeed);
  c.light.pointsPerDps = r4(c.light.pointsPerDps);
  c.light.pointsPerSecondOfFastStartup = r4(c.light.pointsPerSecondOfFastStartup);
  c.heavy.pointsPerDps = r4(c.heavy.pointsPerDps);
  for (const d of ["projectile", "rush", "area"] as const) c.special.deliveryFactor[d] = r4(c.special.deliveryFactor[d]);
  return c;
}

if (values["gauntlet-check"]) {
  const n = Number(values["gauntlet-check"]);
  const costs0 = loadBrawlCosts();
  const panel = referencePanel(costs0);
  const fresh = randomRoster(rng(99), n, costs0, costs0.budget.target);
  const t0 = Date.now();
  const tuned = fresh.map((k) => tuneToGauntlet(k, panel).kit);
  console.log(`${n} nouveaux kits réglés chacun contre le panel (${((Date.now() - t0) / 1000).toFixed(0)} s).`);
  const show = (label: string, rates: number[]) =>
    console.log(`${label} : écart-type ${pct(stdev(rates))}, min ${pct(Math.min(...rates))}, max ${pct(Math.max(...rates))}, entre 35 et 65 % : ${pct(rates.filter((r) => r >= 0.35 && r <= 0.65).length / rates.length)}`);
  show("Entre eux, au budget seul", roundRobin(fresh));
  show("Entre eux, après l'épreuve", roundRobin(tuned));
  process.exit(0);
}

let costs = loadBrawlCosts();
console.log(`${KITS} kits aléatoires par champ, ${SEEDS} duels par paire, terrain : ${arenaDef?.name ?? "terrain vague"}`);
const CHECK_SEED = 424242;
reportBalance("Équilibre avant", balanceCheck(costs, CHECK_SEED));
for (let round = 1; round <= ROUNDS; round++) {
  const t0 = Date.now();
  const r = measure(costs, round);
  console.log(`\n— Mesure ${round} (${r.kits} kits de 70 à 120 points, ${((Date.now() - t0) / 1000).toFixed(0)} s) —`);
  console.log(`Un point de plus rapporte ${pct(r.slope)} de victoires en moyenne.`);
  console.log("Valeur d'un point par catégorie (1,00 = bien payé ; > 1 = sous-payé ; < 1 = surpayé) :");
  for (const f of FIELD_FEATURES) {
    const v = r.value[f];
    console.log(`  ${f.padEnd(11)} ${v === undefined ? "   —  " : v.toFixed(2).padStart(6)}   (présent dans ${r.support[f]} kits)`);
  }
  costs = recalibrate(costs, r.value);
}
if (ROUNDS > 0) reportBalance("Équilibre après", balanceCheck(costs, CHECK_SEED));
if (values.write) {
  writeFileSync(join(DATA_DIR, "balance/brawl-costs.json"), JSON.stringify(costs, null, 2) + "\n");
  console.log("\nCoefficients écrits dans data/balance/brawl-costs.json");
}
