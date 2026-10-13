// Browser-side roster: original fighters (data/fighters) plus local fan packs
// (packs/local, git-ignored), bundled at build time and validated in the
// browser with the exact same rules as the Node tools.

import type { BrawlCostTable } from "../brawl/budget.ts";
import { parseCharacter, type Character } from "../brawl/character.ts";
import type { FighterKit } from "../brawl/kit.ts";
import { validateFighter } from "../brawl/validate.ts";

const kitFiles = import.meta.glob(["/data/fighters/*/kit.json", "/packs/local/**/kit.json"], { eager: true, import: "default" });
const characterFiles = import.meta.glob(["/data/fighters/*/character.json", "/packs/local/**/character.json"], {
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
