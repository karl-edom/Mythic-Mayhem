import type { Ability, Kit } from "../src/sim/kit.ts";
import { DEFAULT_CONFIG, createWorld, type World } from "../src/sim/world.ts";

/** A plain kit for engine tests; budget is irrelevant here. */
export function testKit(overrides: Partial<Kit> = {}, abilities: Ability[] = []): Kit {
  return {
    schemaVersion: 1,
    id: "test",
    role: "fighter",
    stats: { hp: 1000, moveSpeed: 3.5, armor: 0, radius: 0.5 },
    basic: { range: 1.5, damage: 50, interval: 1 },
    abilities,
    ...overrides,
  };
}

/** Two units facing each other along y = 7, `gap` metres apart (centre to centre). */
export function duelWorld(a: Kit, b: Kit, gap = 5): World {
  return createWorld(
    [
      { kit: a, team: 0, pos: { x: 10, y: 7 } },
      { kit: b, team: 1, pos: { x: 10 + gap, y: 7 } },
    ],
    { ...DEFAULT_CONFIG, respawnTime: Infinity },
  );
}
