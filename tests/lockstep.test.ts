// Lockstep with input delay (decision 0026, step 2), checked on a simulated network:
// four machines, each with its own copy of the match, links with latency, jitter and
// losses. Each "human" is played by a bot on its own machine, like a person at the keys.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildArena, validateArena } from "../src/brawl/arena.ts";
import { botCommand, createBot, type BrawlBot } from "../src/brawl/bot.ts";
import { randomRoster } from "../src/brawl/generate.ts";
import { loadBrawlCosts, loadPropCatalog } from "../src/brawl/load.ts";
import { createBrawl, type BrawlWorld } from "../src/brawl/world.ts";
import { stateHash } from "../src/net/hash.ts";
import { Lockstep, delayFor, type NetMessage, type PeerSetup } from "../src/net/lockstep.ts";
import { rng } from "../src/sim/math.ts";

const cat = loadPropCatalog();
const village = validateArena(JSON.parse(readFileSync("data/arenas/village-japonais.json", "utf8")), cat);
assert.ok(village.ok);
const costs = loadBrawlCosts();
const kits = randomRoster(rng(3), 4, costs, costs.budget.target);

/** The same match on every machine: same kits, spawns and arena. */
function newWorld(): BrawlWorld {
  const def = village.ok ? village.def : (undefined as never);
  return createBrawl(
    kits.map((kit, i) => ({ kit, team: i, pos: { x: def.spawns[i]!.x, y: 0, z: def.spawns[i]!.z } })),
    undefined,
    buildArena(def, cat),
  );
}

interface Link {
  /** One-way latency and jitter, milliseconds; share of messages lost. */
  latency: number;
  jitter: number;
  loss: number;
}

/**
 * Runs `frames` frames of 1/60 s on every machine. `peers`: who plays which fighters;
 * `botUnits`: fighters left to bots (on every machine alike). Returns the machines and
 * every fingerprint sent, by tick.
 */
function play(peers: PeerSetup[], botUnits: number[], link: Link, delay: number, frames: number, fault?: (frame: number, machines: Lockstep[]) => void) {
  const r = rng(77);
  const FRAME = 1000 / 60;
  const queue: { at: number; to: number; m: NetMessage }[] = [];
  const hashes = new Map<number, string[]>();
  const machines: Lockstep[] = [];
  const players: Map<number, BrawlBot>[] = [];
  let now = 0;
  for (const p of peers) {
    const world = newWorld();
    const bots = new Map(botUnits.map((u) => [u, createBot(rng(500 + u))]));
    machines.push(
      new Lockstep({
        world, peers, me: p.id, delay, bots,
        send: (m) => {
          if (m.t === "hash") hashes.set(m.tick, [...(hashes.get(m.tick) ?? []), m.hash]);
          for (const q of peers) {
            if (q.id === p.id || r() < link.loss) continue;
            queue.push({ at: now + link.latency + (r() * 2 - 1) * link.jitter, to: q.id, m: structuredClone(m) });
          }
        },
      }),
    );
    // The players at this machine: a bot each, reading this machine's own copy of the match.
    players.push(new Map(p.units.map((u) => [u, createBot(rng(900 + u))])));
  }
  for (let f = 0; f < frames; f++) {
    now = f * FRAME;
    fault?.(f, machines);
    machines.forEach((m, i) => {
      const local = m.units.map((u) => botCommand(m.world, m.world.fighters[u]!, players[i]!.get(u)!));
      m.frame(local);
    });
    for (let k = queue.length - 1; k >= 0; k--)
      if (queue[k]!.at <= now) {
        const { to, m } = queue.splice(k, 1)[0]!;
        machines.find((x) => peersOf(x) === to)!.receive(m);
      }
  }
  return { machines, hashes };
  function peersOf(x: Lockstep): number {
    return peers[machines.indexOf(x)]!.id;
  }
}

const FOUR: PeerSetup[] = [0, 1, 2, 3].map((id) => ({ id, units: [id] }));

test("4 joueurs, 20 ms de latence, gigue et 1 % de pertes : la même partie partout, sans attendre", () => {
  const { machines, hashes } = play(FOUR, [], { latency: 20, jitter: 8, loss: 0.01 }, delayFor(20 + 8), 1800);
  for (const m of machines) assert.equal(m.desyncAt, null, "aucune désynchronisation");
  // Within the delay, the match hardly waits.
  const ticks = machines.map((m) => m.world.tick);
  assert.ok(Math.min(...ticks) > 1700, `avance : ${ticks.join(", ")} ticks sur 1800 images (attentes : ${machines.map((m) => m.stalls).join(", ")})`);
  // Every fingerprint sent for a tick is the same; plenty were compared.
  const full = [...hashes].filter(([, hs]) => hs.length === 4);
  assert.ok(full.length >= 20, `${full.length} empreintes comparées à 4`);
  for (const [tick, hs] of full) assert.equal(new Set(hs).size, 1, `tick ${tick} : ${hs.join(" ")}`);
});

test("40 ms de latence : avec le délai adapté (4 images), la partie ne ralentit pas", () => {
  const { machines } = play(FOUR, [], { latency: 40, jitter: 10, loss: 0.01 }, delayFor(40 + 10), 1200);
  for (const m of machines) assert.equal(m.desyncAt, null);
  const ticks = machines.map((m) => m.world.tick);
  assert.ok(Math.min(...ticks) > 1130, `avance : ${ticks.join(", ")} ticks sur 1200 images`);
});

test("le délai d'entrée suit la latence", () => {
  assert.equal(delayFor(5), 2);
  assert.equal(delayFor(20), 3);
  assert.equal(delayFor(40), 4);
  assert.equal(delayFor(100), 7);
});

test("des bots dans la partie en ligne jouent pareil sur chaque machine", () => {
  const peers: PeerSetup[] = [{ id: 0, units: [0] }, { id: 1, units: [1] }];
  const { machines, hashes } = play(peers, [2, 3], { latency: 30, jitter: 10, loss: 0.03 }, 3, 1200);
  for (const m of machines) assert.equal(m.desyncAt, null);
  const full = [...hashes].filter(([, hs]) => hs.length === 2);
  assert.ok(full.length >= 15);
  for (const [, hs] of full) assert.equal(hs[0], hs[1]);
});

test("5 % de pertes : la partie ralentit un peu, mais reste la même partout", () => {
  const { machines, hashes } = play(FOUR, [], { latency: 20, jitter: 8, loss: 0.05 }, delayFor(20 + 8), 900);
  for (const m of machines) assert.equal(m.desyncAt, null);
  for (const [, hs] of hashes) assert.equal(new Set(hs).size, 1);
  assert.ok(Math.min(...machines.map((m) => m.world.tick)) > 700);
});

test("une latence plus longue que le délai : la partie attend, mais reste la même", () => {
  const { machines, hashes } = play(FOUR, [], { latency: 120, jitter: 30, loss: 0.05 }, 2, 900);
  for (const m of machines) assert.equal(m.desyncAt, null);
  assert.ok(machines.every((m) => m.stalls > 0), "on a attendu les commandes en retard");
  for (const [, hs] of hashes) assert.equal(new Set(hs).size, 1);
});

test("une désynchronisation est détectée dans la seconde", () => {
  let broken = -1;
  const { machines } = play(FOUR, [], { latency: 30, jitter: 5, loss: 0 }, 3, 600, (frame, ms) => {
    if (frame === 200) {
      // A machine whose match drifts (as a browser that rounds differently would).
      ms[2]!.world.fighters[0]!.hp -= 1;
      broken = ms[2]!.world.tick;
    }
  });
  const seen = machines.map((m) => m.desyncAt);
  assert.ok(seen.every((t) => t !== null), `détectée partout : ${seen.join(", ")}`);
  assert.ok(seen.every((t) => t! - broken <= 60), `en moins d'une seconde après le tick ${broken} : ${seen.join(", ")}`);
});

test("l'empreinte change avec l'état, et pas avec ce qui ne compte pas", () => {
  const a = newWorld();
  const b = newWorld();
  assert.equal(stateHash(a), stateHash(b));
  b.events.push({ t: 0, type: "breaker", unit: 0 });
  assert.equal(stateHash(a), stateHash(b), "les événements (pour l'affichage) n'entrent pas dans l'empreinte");
  b.fighters[1]!.pos.x += 1e-9;
  assert.notEqual(stateHash(a), stateHash(b));
});
