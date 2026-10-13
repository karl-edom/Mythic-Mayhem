// Prints the budget breakdown and validation status of every kit in a directory.
// Usage: node tools/budget.ts [kitDir]

import { join } from "node:path";
import { DATA_DIR, loadCosts, loadKitDir } from "../src/data/load.ts";

const dir = process.argv[2] ?? join(DATA_DIR, "kits");
const costs = loadCosts();
let failed = false;
for (const { file, result } of loadKitDir(dir, costs)) {
  const budget = result.budget;
  console.log(`\n${file} — ${result.ok ? "OK" : "REFUSÉ"}${budget ? ` — ${budget.total.toFixed(1)} pts` : ""}`);
  for (const l of budget?.lines ?? []) console.log(`  ${l.label.padEnd(22)} ${l.points.toFixed(1).padStart(6)}`);
  if (!result.ok) {
    failed = true;
    for (const e of result.errors) console.log(`  ✗ ${e}`);
  }
}
process.exitCode = failed ? 1 : 0;
