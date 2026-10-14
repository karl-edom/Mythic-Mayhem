// Fighter packs report and bot-vs-bot duels.
//   node tools/brawl.ts                 → validation + budget of every pack
//   node tools/brawl.ts --duels 200     → round-robin duels between valid fighters
//   node tools/brawl.ts --duels 40 --arena clairiere   → same, on a given arena

import { runDuel } from "../src/brawl/match.ts";
import { buildArena } from "../src/brawl/arena.ts";
import { loadAllPacks, loadArenas, loadPropCatalog } from "../src/brawl/load.ts";
import type { FighterKit } from "../src/brawl/kit.ts";

const args = process.argv.slice(2);
const duels = Number(args[args.indexOf("--duels") + 1] ?? 0) || (args.includes("--duels") ? 100 : 0);

const arenaId = args.includes("--arena") ? args[args.indexOf("--arena") + 1] : undefined;
const catalog = loadPropCatalog();
const arenas = loadArenas(catalog);
console.log(`Arènes : ${arenas.map((a) => `${a.name} (${a.id}, ${a.width}×${a.depth} m, ${a.props.length} éléments)`).join(" · ")}\n`);
const arenaDef = arenaId ? arenas.find((a) => a.id === arenaId) : undefined;
if (arenaId && !arenaDef) throw new Error(`arène inconnue : ${arenaId}`);

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
