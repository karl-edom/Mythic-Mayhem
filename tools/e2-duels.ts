// Experiment E2 on the designed kits, bot vs bot, many seeds.
//   duels (default): every kit against every other kit, 1v1.
//   --teams 3:       every composition of 3 distinct kits against every other one.
// Usage: node tools/e2-duels.ts [--n 1000] [--teams 3] [--kits dir]
// Exit code 1 if a matchup exceeds the win-rate threshold.

import { join } from "node:path";
import { parseArgs } from "node:util";
import { DATA_DIR, loadCosts, loadValidKits } from "../src/data/load.ts";
import type { Kit } from "../src/sim/kit.ts";
import { runMatch } from "../src/sim/match.ts";

const THRESHOLD = 0.65;

const { values } = parseArgs({
  options: {
    n: { type: "string", default: "1000" },
    teams: { type: "string" },
    kits: { type: "string", default: join(DATA_DIR, "kits") },
  },
});
const n = Number(values.n);
const kits = loadValidKits(values.kits, loadCosts());

function combinations<T>(items: T[], k: number): T[][] {
  if (k === 0) return [[]];
  return items.flatMap((item, i) => combinations(items.slice(i + 1), k - 1).map((rest) => [item, ...rest]));
}

const size = values.teams ? Number(values.teams) : 1;
const sides: Kit[][] = combinations(kits, size);
const label = (side: Kit[]) => side.map((k) => k.id).join("+");

console.log(`E2 — ${kits.length} kits, ${size}v${size}, ${sides.length} compositions, ${n} combats par affiche\n`);

/** Per kit: score and games, counted only when the kit is on one side only. */
const perKit = new Map(kits.map((k) => [k.id, { score: 0, games: 0 }]));
let worst = { rate: 0, label: "" };
let draws = 0;
let total = 0;
let durationSum = 0;
for (let i = 0; i < sides.length; i++) {
  for (let j = i + 1; j < sides.length; j++) {
    const a = sides[i]!;
    const b = sides[j]!;
    let score = 0;
    let time = 0;
    let localDraws = 0;
    for (let s = 0; s < n; s++) {
      // Alternate sides so spawn position never favours anyone.
      const flip = s % 2 === 1;
      const r = runMatch(flip ? [b, a] : [a, b], s + 1);
      const aScore = r.winner === null ? 0.5 : r.winner === (flip ? 1 : 0) ? 1 : 0;
      if (r.winner === null) localDraws++;
      score += aScore;
      time += r.duration;
      for (const k of a) if (!b.includes(k)) bump(k.id, aScore);
      for (const k of b) if (!a.includes(k)) bump(k.id, 1 - aScore);
    }
    const rate = score / n;
    const favoured = Math.max(rate, 1 - rate);
    const line = rate >= 0.5 ? `${label(a)} > ${label(b)}` : `${label(b)} > ${label(a)}`;
    if (favoured > worst.rate) worst = { rate: favoured, label: line };
    draws += localDraws;
    total += n;
    durationSum += time;
    console.log(
      `${label(a).padEnd(24)} vs ${label(b).padEnd(24)} ${(rate * 100).toFixed(1).padStart(5)} %  ` +
        `(nuls ${localDraws})  durée moy. ${(time / n).toFixed(1)} s${favoured > THRESHOLD ? "  ✗" : ""}`,
    );
  }
}

function bump(id: string, score: number) {
  const k = perKit.get(id)!;
  k.score += score;
  k.games++;
}

console.log("\nTaux de victoire par kit (toutes affiches confondues) :");
for (const [id, k] of perKit) console.log(`  ${id.padEnd(12)} ${((k.score / k.games) * 100).toFixed(1).padStart(5)} %`);
console.log(`Matchs nuls (90 s écoulées) : ${((draws / total) * 100).toFixed(1)} %`);
console.log(`Durée moyenne : ${(durationSum / total).toFixed(1)} s`);
console.log(`Pire écart : ${worst.label} à ${(worst.rate * 100).toFixed(1)} % (seuil ${THRESHOLD * 100} %)`);
console.log(worst.rate > THRESHOLD ? "→ critère 1 NON respecté" : "→ critère 1 respecté");
process.exitCode = worst.rate > THRESHOLD ? 1 : 0;
