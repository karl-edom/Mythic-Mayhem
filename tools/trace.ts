// Diagnostic: damage breakdown by source, casts and status counts for one matchup.
// Usage: node tools/trace.ts <kitA> <kitB> [n=100]

import { join } from "node:path";
import { DATA_DIR, loadBalance, loadValidKits } from "../src/data/load.ts";
import { runMatch } from "../src/sim/match.ts";

const [idA, idB, nArg] = process.argv.slice(2);
const kits = loadValidKits(join(DATA_DIR, "kits"), loadBalance());
const a = kits.find((k) => k.id === idA);
const b = kits.find((k) => k.id === idB);
if (!a || !b) throw new Error(`kits disponibles : ${kits.map((k) => k.id).join(", ")}`);
const n = Number(nArg ?? 100);

const stats = new Map<string, number>();
const bump = (key: string, v = 1) => stats.set(key, (stats.get(key) ?? 0) + v);
for (let s = 1; s <= n; s++) {
  const { world, winner } = runMatch([[a], [b]], s);
  const name = (id: number) => world.units[id]!.kit.id;
  bump(`victoires ${winner === null ? "nul" : winner === 0 ? a.id : b.id}`);
  for (const e of world.events) {
    if (e.type === "damage") bump(`dégâts ${name(e.source)} via ${e.by === "basic" ? "basic" : world.units[e.source]!.kit.abilities[e.by]!.id}`, e.amount);
    if (e.type === "cast") bump(`lancers ${name(e.unit)} ${world.units[e.unit]!.kit.abilities[e.slot]!.id}`);
    if (e.type === "status") bump(`statut ${e.status} sur ${name(e.target)}`);
    if (e.type === "heal") bump(`soin ${name(e.source)}`, e.amount);
  }
}
for (const [k, v] of [...stats].sort()) console.log(`${k.padEnd(40)} ${(v / n).toFixed(1).padStart(8)} / match`);
