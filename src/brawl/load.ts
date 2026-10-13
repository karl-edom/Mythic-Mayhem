// Node-only loaders for fighter packs. A pack is a directory holding
// character.json (identity, display only) and kit.json (validated before use).

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { DATA_DIR } from "../data/load.ts";
import type { BrawlCostTable } from "./budget.ts";
import { parseCharacter, type Character } from "./character.ts";
import { validateFighter, type FighterValidation } from "./validate.ts";

export const ROOT_DIR = new URL("../../", import.meta.url).pathname;

export function loadBrawlCosts(): BrawlCostTable {
  return JSON.parse(readFileSync(join(DATA_DIR, "balance/brawl-costs.json"), "utf8")) as BrawlCostTable;
}

export interface LoadedPack {
  dir: string;
  character: Character;
  result: FighterValidation;
}

/** Every directory under `root` (any depth) containing a kit.json is a pack. */
export function findPacks(root: string, costs: BrawlCostTable): LoadedPack[] {
  if (!existsSync(root)) return [];
  const out: LoadedPack[] = [];
  const walk = (dir: string) => {
    if (existsSync(join(dir, "kit.json"))) {
      const read = (f: string): unknown => {
        try {
          return JSON.parse(readFileSync(join(dir, f), "utf8"));
        } catch (e) {
          return { __error: (e as Error).message };
        }
      };
      const kit = read("kit.json");
      const result: FighterValidation =
        typeof kit === "object" && kit !== null && "__error" in kit
          ? { ok: false, errors: [`JSON invalide : ${String((kit as { __error: string }).__error)}`] }
          : validateFighter(kit, costs);
      const id = result.ok ? result.kit.id : relative(root, dir);
      out.push({ dir: relative(ROOT_DIR, dir), character: parseCharacter(existsSync(join(dir, "character.json")) ? read("character.json") : {}, id), result });
      return;
    }
    for (const e of readdirSync(dir).sort()) if (statSync(join(dir, e)).isDirectory()) walk(join(dir, e));
  };
  walk(root);
  return out;
}

/** Original fighters (committed) then local fan packs (git-ignored). */
export function loadAllPacks(costs = loadBrawlCosts()): LoadedPack[] {
  return [...findPacks(join(DATA_DIR, "fighters"), costs), ...findPacks(join(ROOT_DIR, "packs/local"), costs)];
}
