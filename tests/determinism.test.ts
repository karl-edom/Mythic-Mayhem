// Online play (decision 0026): every player runs the match and must get the very same
// numbers. These tests guard what makes that possible.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildArena, validateArena } from "../src/brawl/arena.ts";
import { botCommand, createBot } from "../src/brawl/bot.ts";
import { randomRoster } from "../src/brawl/generate.ts";
import { loadBrawlCosts, loadPropCatalog } from "../src/brawl/load.ts";
import { createBrawl, quantizeCommand, step, type BrawlWorld, type Command } from "../src/brawl/world.ts";
import { cosSin, rng } from "../src/sim/math.ts";

/** Files the simulation runs on (the client draws, it does not decide). */
const SIM_FILES = ["src/brawl/world.ts", "src/brawl/bot.ts", "src/brawl/arena.ts", "src/brawl/nav.ts", "src/brawl/kit.ts", "src/sim/math.ts"];

test("la simulation n'utilise aucune fonction arrondie différemment selon le navigateur", () => {
  // Math.hypot, sin, cos, pow, exp, log… et ** : chaque moteur JavaScript les arrondit à sa façon.
  const banned = /Math\.(hypot|sin|cos|tan|atan2?|asin|acos|exp|expm1|log|log2|log10|log1p|pow|cbrt|sinh|cosh|tanh|random)\b|[^/*\s]\s*\*\*\s*[^/*]/;
  for (const file of SIM_FILES) {
    const code = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    const hit = code.split("\n").find((line) => banned.test(line));
    assert.equal(hit, undefined, `${file} : ${hit?.trim()}`);
  }
});

test("cosSin suit Math.cos / Math.sin à mieux que 2e-7", () => {
  for (let a = -10; a <= 10; a += 0.01) {
    const [c, s] = cosSin(a);
    assert.ok(Math.abs(c - Math.cos(a)) < 2e-7 && Math.abs(s - Math.sin(a)) < 2e-7, `angle ${a}`);
  }
});

test("le stick est arrondi sur 8 bits : la même commande donne la même partie", () => {
  const q = quantizeCommand({ unit: 0, move: { x: 0.333333, z: -1.4 } });
  assert.equal(q.move!.x, 42 / 127);
  assert.equal(q.move!.z, -1);
  assert.deepEqual(quantizeCommand(q), q, "arrondir deux fois ne change rien");
});

/** A 4-player bot match on the village, its commands recorded, and a fingerprint of the end state. */
function match(seconds: number, replay?: Command[][]): { log: Command[][]; hash: string } {
  const cat = loadPropCatalog();
  const v = validateArena(JSON.parse(readFileSync("data/arenas/village-japonais.json", "utf8")), cat);
  assert.ok(v.ok);
  const costs = loadBrawlCosts();
  const kits = randomRoster(rng(3), 4, costs, costs.budget.target);
  const w: BrawlWorld = createBrawl(
    kits.map((kit, i) => ({ kit, team: i, pos: { x: v.def.spawns[i]!.x, y: 0, z: v.def.spawns[i]!.z } })),
    undefined,
    buildArena(v.def, cat),
  );
  const bots = w.fighters.map((_, i) => createBot(rng(100 + i)));
  const log: Command[][] = [];
  for (let t = 0; t < seconds * 60; t++) {
    const cmds = replay ? replay[t]! : w.fighters.map((f, i) => botCommand(w, f, bots[i]!));
    log.push(cmds);
    step(w, cmds);
  }
  const state = JSON.stringify({
    fighters: w.fighters.map((f) => [f.pos, f.vel, f.hp, f.energy, f.alive, f.action]),
    props: w.arena.props.map((p) => [p.alive, p.hp, p.x, p.z]),
    projectiles: w.projectiles,
    tick: w.tick,
  });
  return { log, hash: createHash("sha256").update(state).digest("hex") };
}

test("rejouer les commandes enregistrées redonne exactement la même partie", () => {
  const first = match(20);
  // Through JSON, as the commands will travel over the network.
  const sent = JSON.parse(JSON.stringify(first.log)) as Command[][];
  assert.equal(match(20, sent).hash, first.hash);
});
