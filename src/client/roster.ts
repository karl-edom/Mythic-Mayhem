// Browser-side roster: the fighter packs in packs/local (git-ignored), bundled at
// build time and validated in the browser with the exact same rules as the Node
// tools. (The first original fighters were retired, decision 0024.)

import { validateArena, type ArenaDef, type PropCatalog } from "../brawl/arena.ts";
import type { BrawlCostTable } from "../brawl/budget.ts";
import { parseCharacter, type Character } from "../brawl/character.ts";
import type { FighterKit } from "../brawl/kit.ts";
import { validateFighter } from "../brawl/validate.ts";

const kitFiles = import.meta.glob(["/packs/local/**/kit.json"], { eager: true, import: "default" });
const characterFiles = import.meta.glob(["/packs/local/**/character.json"], {
  eager: true,
  import: "default",
});
const costFiles = import.meta.glob("/data/balance/brawl-costs.json", { eager: true, import: "default" });

export interface RosterEntry {
  dir: string;
  local: boolean;
  character: Character;
  kit?: FighterKit;
  errors: string[];
  points?: number;
}

export function loadRoster(): RosterEntry[] {
  const costs = Object.values(costFiles)[0] as BrawlCostTable;
  return Object.entries(kitFiles)
    .map(([path, data]) => {
      const dir = path.slice(0, -"/kit.json".length);
      const result = validateFighter(data, costs);
      const fallback = dir.split("/").at(-1) ?? "?";
      return {
        dir,
        local: dir.startsWith("/packs/local/"),
        character: parseCharacter(characterFiles[`${dir}/character.json`], fallback),
        kit: result.ok ? result.kit : undefined,
        errors: result.ok ? [] : result.errors,
        points: result.budget?.total,
      };
    })
    .sort((a, b) => Number(a.local) - Number(b.local) || a.character.name.localeCompare(b.character.name));
}

const arenaFiles = import.meta.glob(["/data/arenas/*.json", "!/data/arenas/props.json", "/packs/local/arenas/*.json"], {
  eager: true,
  import: "default",
});
const propFiles = import.meta.glob("/data/arenas/props.json", { eager: true, import: "default" });

export const propCatalog = Object.values(propFiles)[0] as PropCatalog;

/** Valid arenas, original ones first; invalid ones are reported in the console. */
export function loadArenaDefs(): ArenaDef[] {
  const defs: ArenaDef[] = [];
  for (const [path, data] of Object.entries(arenaFiles)) {
    const r = validateArena(data, propCatalog);
    if (r.ok) defs.push(r.def);
    else console.warn(`Arène refusée : ${path}\n${r.errors.join("\n")}`);
  }
  return defs;
}
