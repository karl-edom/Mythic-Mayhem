// Fighter packs report and bot-vs-bot duels.
//   node tools/brawl.ts                 → validation + budget of every pack
//   node tools/brawl.ts --duels 200     → round-robin duels between valid fighters
//   node tools/brawl.ts --duels 40 --arena clairiere   → same, on a given arena
//   node tools/brawl.ts --gauntlet                     → win rate of every pack against the reference panel
//   node tools/brawl.ts --tune                         → scale each pack's damage until it wins ~50 % of the
//                                                        gauntlet (rewrites kit.json); --only <id> for one pack
//   node tools/brawl.ts --fit [--target 95]            → bring every pack back to the budget
//                                                        by scaling its damage only (rewrites kit.json)

import { runDuel } from "../src/brawl/match.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildArena } from "../src/brawl/arena.ts";
import { fighterBudget } from "../src/brawl/budget.ts";
import { BALANCED_BAND, gauntletRate, referencePanel, tuneToGauntlet } from "../src/brawl/gauntlet.ts";
import { fitFighter } from "../src/brawl/generate.ts";
import { ROOT_DIR, loadBrawlCosts } from "../src/brawl/load.ts";
import { gauntletGrounds, loadAllPacks, loadArenas, loadPropCatalog } from "../src/brawl/load.ts";
import type { FighterKit } from "../src/brawl/kit.ts";

const args = process.argv.slice(2);
const duels = Number(args[args.indexOf("--duels") + 1] ?? 0) || (args.includes("--duels") ? 100 : 0);

const arenaId = args.includes("--arena") ? args[args.indexOf("--arena") + 1] : undefined;
const catalog = loadPropCatalog();
const arenas = loadArenas(catalog);
console.log(`Arènes : ${arenas.map((a) => `${a.name} (${a.id}, ${a.width}×${a.depth} m, ${a.props.length} éléments)`).join(" · ")}\n`);
const arenaDef = arenaId ? arenas.find((a) => a.id === arenaId) : undefined;
if (arenaId && !arenaDef) throw new Error(`arène inconnue : ${arenaId}`);

if (args.includes("--fit")) {
  const costs = loadBrawlCosts();
  const target = Number(args[args.indexOf("--target") + 1] ?? NaN) || costs.budget.target;
  for (const p of loadAllPacks(costs)) {
    const file = join(ROOT_DIR, p.dir, "kit.json");
    const kit = JSON.parse(readFileSync(file, "utf8"));
    const fitted = fitFighter(kit, costs, target);
    if (!fitted) {
      console.log(`✘ ${p.dir} : impossible d'atteindre ${target} points en changeant seulement les dégâts`);
      continue;
    }
    writeFileSync(file, JSON.stringify(fitted, null, 2) + "\n");
    console.log(`✔ ${p.dir} : dégâts ajustés pour ${target} points`);
  }
}

if (args.includes("--gauntlet") || args.includes("--tune")) {
  const costs = loadBrawlCosts();
  const panel = referencePanel(costs);
  const grounds = gauntletGrounds(catalog);
  const pct = (v: number) => `${(v * 100).toFixed(0)} %`;
  console.log(`Épreuve : ${panel.length} adversaires de référence, 2 duels chacun (côtés inversés), en terrain ouvert et sur chaque arène à tour de rôle. Équilibré entre ${pct(BALANCED_BAND[0])} et ${pct(BALANCED_BAND[1])}.`);
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined;
  for (const p of loadAllPacks(costs)) {
    if (!p.result.ok || (only && !p.dir.endsWith(`/${only}`))) continue;
    const rate = gauntletRate(p.result.kit, panel, grounds);
    const ok = rate >= BALANCED_BAND[0] && rate <= BALANCED_BAND[1];
    console.log(`${ok ? "✔" : "✘"} ${p.character.name} : ${pct(rate)} de victoires`);
    if (args.includes("--tune")) {
      const t = tuneToGauntlet(p.result.kit, panel, undefined, grounds);
      writeFileSync(join(ROOT_DIR, p.dir, "kit.json"), JSON.stringify(t.kit, null, 2) + "\n");
      console.log(`   → dégâts × ${t.factor.toFixed(2)} : ${pct(t.rate)} de victoires, budget ${fighterBudget(t.kit, costs).total.toFixed(1)} points (kit.json réécrit)`);
    }
  }
  console.log("");
}

const packs = loadAllPacks();
for (const p of packs) {
  const head = `${p.character.name} (${p.character.universe}) — ${p.dir}`;
  if (p.result.ok) {
    console.log(`✔ ${head} : ${p.result.budget.total.toFixed(1)} points`);
    console.log("   " + p.result.budget.lines.map((l) => `${l.label} ${l.points.toFixed(1)}`).join(" · "));
  } else {
    console.log(`✘ ${head}`);
    for (const e of p.result.errors) console.log(`   - ${e}`);
  }
}

if (duels > 0) {
  const kits: { name: string; kit: FighterKit }[] = packs.flatMap((p) => (p.result.ok ? [{ name: p.character.name, kit: p.result.kit }] : []));
  console.log(`\nDuels bot contre bot (niveau normal) sur ${arenaDef?.name ?? "terrain vague"}, ${duels} par paire, côtés alternés :`);
  for (let i = 0; i < kits.length; i++)
    for (let j = i + 1; j < kits.length; j++) {
      const a = kits[i]!;
      const b = kits[j]!;
      let winsA = 0;
      let draws = 0;
      let time = 0;
      for (let s = 0; s < duels; s++) {
        const swap = s % 2 === 1;
        const arena = arenaDef ? buildArena(arenaDef, catalog) : undefined; // fresh props each duel
        const r = swap ? runDuel(b.kit, a.kit, s, undefined, undefined, arena) : runDuel(a.kit, b.kit, s, undefined, undefined, arena);
        time += r.duration;
        if (r.winner === null) draws++;
        else if ((r.winner === 0) !== swap) winsA++;
      }
      const pct = (100 * winsA) / (duels - draws || 1);
      console.log(`  ${a.name} vs ${b.name} : ${pct.toFixed(0)} % pour ${a.name} (${draws} nuls), durée moyenne ${(time / duels).toFixed(0)} s`);
    }
}
