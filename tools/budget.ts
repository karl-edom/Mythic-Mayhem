// Prints, for every kit in a directory: validation status, budget breakdown,
// and strength/weakness profile.
// Usage: node tools/budget.ts [kitDir]

import { join } from "node:path";
import { AXIS_LABELS, POINT_AXES, strengths, weaknesses } from "../src/balance/profile.ts";
import { DATA_DIR, loadBalance, loadKitDir } from "../src/data/load.ts";

const dir = process.argv[2] ?? join(DATA_DIR, "kits");
const balance = loadBalance();
let failed = false;
for (const { file, result } of loadKitDir(dir, balance)) {
  const { budget, profile } = result;
  console.log(`\n${file} — ${result.ok ? `OK (${result.kit.role})` : "REFUSÉ"}${budget ? ` — ${budget.total.toFixed(1)} pts` : ""}`);
  if (budget) {
    console.log("  Budget :");
    for (const l of budget.lines) console.log(`    ${l.label.padEnd(22)} ${l.points.toFixed(1).padStart(6)}`);
  }
  if (profile) {
    console.log("  Profil :");
    for (const ax of POINT_AXES) {
      const share = profile.share[ax];
      const bar = "█".repeat(Math.max(0, Math.round(share * 40)));
      console.log(`    ${ax.padEnd(9)} ${(share * 100).toFixed(0).padStart(4)} %  ${bar.padEnd(20)} ${AXIS_LABELS[ax]}`);
    }
    console.log(`    portee    ${profile.portee.toFixed(1).padStart(4)} m`);
    console.log(`  Forces : ${strengths(profile, balance.profile).join(", ") || "—"}  ·  Faiblesses : ${weaknesses(profile, balance.profile).join(", ") || "—"}`);
  }
  if (!result.ok) {
    failed = true;
    for (const e of result.errors) console.log(`  ✗ ${e}`);
  }
}
process.exitCode = failed ? 1 : 0;
