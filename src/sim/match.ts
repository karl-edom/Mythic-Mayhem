// Runs a bot-vs-bot elimination match to completion. Deterministic for a given seed.

import { decide, defaultBot } from "../bots/bot.ts";
import type { Kit } from "./kit.ts";
import { rng } from "./math.ts";
import { DEFAULT_CONFIG, createWorld, step, type SimConfig, type World } from "./world.ts";

export interface MatchResult {
  /** Winning team, or null on timeout. */
  winner: 0 | 1 | null;
  duration: number;
  world: World;
}

export function runMatch(teams: [Kit[], Kit[]], seed: number, maxSeconds = 90): MatchResult {
  const random = rng(seed);
  const config: SimConfig = { ...DEFAULT_CONFIG, respawnTime: Infinity };
  const { width, height } = config.arena;
  const spawns = teams.flatMap((kits, team) =>
    kits.map((kit, i) => ({
      kit,
      team,
      pos: {
        x: team === 0 ? 3 : width - 3,
        y: (height * (i + 1)) / (kits.length + 1) + (random() - 0.5) * 2,
      },
    })),
  );
  const w = createWorld(spawns, config);
  const bots = w.units.map(() => defaultBot(random));
  const maxTicks = maxSeconds * config.tickRate;
  while (w.tick < maxTicks) {
    step(w, w.units.map((u) => decide(w, u, bots[u.id]!)));
    const alive = [0, 1].map((team) => w.units.some((u) => u.team === team && u.alive));
    if (!alive[0] || !alive[1]) return { winner: alive[0] ? 0 : alive[1] ? 1 : null, duration: w.time, world: w };
  }
  return { winner: null, duration: w.time, world: w };
}
