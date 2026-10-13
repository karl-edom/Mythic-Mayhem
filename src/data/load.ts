// Node-only loaders for data files. Kits are validated before use.

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { ProfileRules } from "../balance/profile.ts";
import type { CostTable } from "../sim/budget.ts";
import type { Kit } from "../sim/kit.ts";
import { validateKit, type Balance, type ValidationResult } from "../sim/validate.ts";

export const DATA_DIR = new URL("../../data/", import.meta.url).pathname;

export function loadCosts(path = join(DATA_DIR, "balance/costs.json")): CostTable {
  return JSON.parse(readFileSync(path, "utf8")) as CostTable;
}

export function loadBalance(): Balance {
  return {
    costs: loadCosts(),
    profile: JSON.parse(readFileSync(join(DATA_DIR, "balance/profile.json"), "utf8")) as ProfileRules,
  };
}

export interface LoadedKit {
  file: string;
  result: ValidationResult;
}

export function loadKitDir(dir: string, balance: Balance): LoadedKit[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => {
      let data: unknown;
      try {
        data = JSON.parse(readFileSync(join(dir, f), "utf8"));
      } catch (e) {
        return { file: f, result: { ok: false, errors: [`JSON invalide : ${(e as Error).message}`] } };
      }
      return { file: f, result: validateKit(data, balance) };
    });
}

/** Loads every kit in the directory; throws with all errors if any is invalid. */
export function loadValidKits(dir: string, balance: Balance): Kit[] {
  const loaded = loadKitDir(dir, balance);
  const bad = loaded.filter((l) => !l.result.ok);
  if (bad.length > 0)
    throw new Error(bad.map((b) => `${b.file}:\n  ${b.result.ok ? "" : b.result.errors.join("\n  ")}`).join("\n"));
  return loaded.map((l) => (l.result.ok ? l.result.kit : (undefined as never)));
}
