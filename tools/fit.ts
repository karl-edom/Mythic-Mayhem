// Fits kit files to a target budget (default: middle of the allowed band).
// Usage: node tools/fit.ts <kit.json>... [--target 95] [--write]

import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { fitKit } from "../src/balance/fit.ts";
import { loadCosts } from "../src/data/load.ts";
import { kitBudget } from "../src/sim/budget.ts";
import type { Kit } from "../src/sim/kit.ts";
import { validateKit } from "../src/sim/validate.ts";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { target: { type: "string" }, write: { type: "boolean", default: false } },
});
const costs = loadCosts();
const target = values.target ? Number(values.target) : (costs.budget.min + costs.budget.max) / 2;

for (const file of positionals) {
  const kit = JSON.parse(readFileSync(file, "utf8")) as Kit;
  const before = kitBudget(kit, costs).total;
  const fitted = fitKit(kit, costs, target);
  if (!fitted) {
    console.log(`${file} : impossible d'atteindre ${target} pts en ajustant seulement les dégâts et soins`);
    process.exitCode = 1;
    continue;
  }
  const check = validateKit(fitted.kit, costs);
  const after = kitBudget(fitted.kit, costs).total;
  console.log(`${file} : ${before.toFixed(1)} → ${after.toFixed(1)} pts (×${fitted.factor.toFixed(2)})${check.ok ? "" : ` — invalide : ${check.errors.join(" | ")}`}`);
  if (values.write && check.ok) writeFileSync(file, JSON.stringify(fitted.kit, null, 2) + "\n");
}
