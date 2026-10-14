// Runs a bot-vs-bot duel to completion. Deterministic for a given seed.

import { rng } from "../sim/math.ts";
import type { Arena } from "./arena.ts";
import { BOT_LEVELS, botCommand, createBot, type BrawlBotParams } from "./bot.ts";
import type { FighterKit } from "./kit.ts";
import { BRAWL_CONFIG, createDuel, step, type BrawlConfig, type BrawlWorld } from "./world.ts";

export interface DuelResult {
  winner: number | null;
  duration: number;
  score: number[];
  world: BrawlWorld;
}

export function runDuel(
  a: FighterKit,
  b: FighterKit,
  seed: number,
  levels: [BrawlBotParams, BrawlBotParams] = [BOT_LEVELS.normal, BOT_LEVELS.normal],
  config: BrawlConfig = BRAWL_CONFIG,
  arena?: Arena,
): DuelResult {
  const random = rng(seed);
  const w = createDuel(a, b, config, arena);
  const bots = levels.map((l) => createBot(random, l));
  while (!w.over) step(w, w.fighters.map((f) => botCommand(w, f, bots[f.id]!)));
  return { winner: w.winner, duration: w.time, score: [...w.score], world: w };
}
