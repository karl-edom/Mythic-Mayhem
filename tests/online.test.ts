// Online play, step 3 (decision 0026): the match carried by the room's presence alone
// (the relay: no direct link, as when WebRTC cannot be set up), on a simulated room
// that passes presence on about 30 times a second, with latency. And the checks on
// what arrives from other players.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildArena, validateArena } from "../src/brawl/arena.ts";
import { botCommand, createBot } from "../src/brawl/bot.ts";
import { randomRoster } from "../src/brawl/generate.ts";
import { loadBrawlCosts, loadPropCatalog } from "../src/brawl/load.ts";
import { createBrawl, type BrawlWorld } from "../src/brawl/world.ts";
import { cleanCommand, cleanMessage, NetLink } from "../src/net/link.ts";
import { Lockstep, delayFor } from "../src/net/lockstep.ts";
import { newRoomCode, ROOM_CODE, type Room, type RoomPeer } from "../src/net/room.ts";
import { rng } from "../src/sim/math.ts";

const cat = loadPropCatalog();
const village = validateArena(JSON.parse(readFileSync("data/arenas/village-japonais.json", "utf8")), cat);
assert.ok(village.ok);
const costs = loadBrawlCosts();
const kits = randomRoster(rng(5), 4, costs, costs.budget.target);

function newWorld(n: number): BrawlWorld {
  const def = village.ok ? village.def : (undefined as never);
  return createBrawl(
    kits.slice(0, n).map((kit, i) => ({ kit, team: i, pos: { x: def.spawns[i]!.x, y: 0, z: def.spawns[i]!.z } })),
    undefined,
    buildArena(def, cat),
  );
}

/**
 * A room as the platform runs it, simulated: each page's presence is merged per field,
 * then passed on every `every` ms, arriving `latency` ms (± jitter) later.
 */
class FakeRoom {
  now = 0;
  private live = new Map<string, Record<string, unknown>>();
  private queue: { at: number; to: string; peers: RoomPeer[] }[] = [];
  private handlers = new Map<string, Set<(c: { peers: readonly RoomPeer[] }) => void>>();
  private seen = new Map<string, readonly RoomPeer[]>();
  private lastSend = -Infinity;
  private r = rng(9);
  private latency: number;
  private jitter: number;
  private every: number;
  constructor(latency: number, jitter: number, every = 33) {
    this.latency = latency;
    this.jitter = jitter;
    this.every = every;
  }

  join(peer: string): Room {
    this.live.set(peer, {});
    this.handlers.set(peer, new Set());
    this.seen.set(peer, []);
    return {
      name: "test",
      presence: async (patch) => {
        const cur = { ...this.live.get(peer) };
        for (const [k, v] of Object.entries(patch)) if (v === null) delete cur[k];
        else cur[k] = v;
        this.live.set(peer, cur);
      },
      peers: () => this.seen.get(peer)!,
      onPeers: (h) => {
        this.handlers.get(peer)!.add(h);
        return () => this.handlers.get(peer)!.delete(h);
      },
      connected: () => true,
      leave: async () => undefined,
    };
  }

  /** Advances the clock: sends the presences when due, delivers what has arrived. */
  tick(now: number): void {
    this.now = now;
    if (now - this.lastSend >= this.every) {
      this.lastSend = now;
      for (const to of this.live.keys()) {
        const peers = [...this.live].map(([p, presence]) => ({ peer: p, sameTab: p === to, presence }));
        const delay = this.latency + (this.r() * 2 - 1) * this.jitter;
        this.queue.push({ at: now + delay, to, peers });
      }
    }
    this.queue.sort((a, b) => a.at - b.at);
    while (this.queue.length && this.queue[0]!.at <= now) {
      const { to, peers } = this.queue.shift()!;
      this.seen.set(to, peers);
      for (const h of this.handlers.get(to)!) h({ peers });
    }
  }
}

function playRelay(n: number, latency: number, jitter: number, frames: number) {
  const room = new FakeRoom(latency, jitter);
  const labels = ["a", "b", "c", "d"].slice(0, n);
  const peers = labels.map((_, i) => ({ id: i, units: [i] }));
  const delay = delayFor(latency + jitter + 33 / 2);
  const machines = labels.map((label, i) => {
    const link = new NetLink(room.join(label), { rtc: false });
    link.match = "g1";
    const lock = new Lockstep({ world: newWorld(n), peers, me: i, delay, send: (m) => link.send(m) });
    link.onMessage((m, peer) => {
      if (labels[m.from] === peer) lock.receive(m);
    });
    return { link, lock, player: createBot(rng(900 + i)) };
  });
  for (let f = 0; f < frames; f++) {
    room.tick(f * (1000 / 60));
    for (const m of machines) m.lock.frame([botCommand(m.lock.world, m.lock.world.fighters[m.lock.units[0]!]!, m.player)]);
  }
  for (const m of machines) m.link.close();
  return { machines, delay };
}

test("par le seul relais de la salle (30 envois/s, 40 ms ± 10) : 4 joueurs, la même partie partout", () => {
  const { machines, delay } = playRelay(4, 40, 10, 1800);
  for (const m of machines) assert.equal(m.lock.desyncAt, null, "aucune désynchronisation");
  const ticks = machines.map((m) => m.lock.world.tick);
  // Hashes are compared once a second: plenty of them, all equal (desyncAt stayed null).
  assert.ok(Math.min(...ticks) > 1500, `avance : ${ticks.join(", ")} ticks sur 1800 images, délai ${delay}`);
});

test("relais à 2 joueurs, 80 ms ± 20 : plus lent, jamais différent", () => {
  const { machines } = playRelay(2, 80, 20, 1200);
  for (const m of machines) assert.equal(m.lock.desyncAt, null);
  assert.ok(Math.min(...machines.map((m) => m.lock.world.tick)) > 900);
});

test("ce qui arrive des autres est vérifié et reconstruit champ par champ", () => {
  assert.deepEqual(cleanCommand({ unit: 1, move: { x: 0.5, z: -1 }, jump: true, light: "oui", special: 1, evil: "<script>" }), {
    unit: 1, move: { x: 0.5, z: -1 }, jump: true, special: 1,
  });
  assert.equal(cleanCommand({ move: { x: 1, z: 0 } }), null, "sans unité");
  assert.equal(cleanCommand({ unit: 0, move: { x: Infinity, z: 0 } })?.move, undefined);
  assert.equal(cleanCommand({ unit: 0, special: 7 })?.special, undefined, "spéciale hors bornes");
  assert.deepEqual(cleanMessage({ t: "hash", from: 2, tick: 60, hash: "deadbeef" }), { t: "hash", from: 2, tick: 60, hash: "deadbeef" });
  assert.equal(cleanMessage({ t: "hash", from: 2, tick: 60, hash: "x".repeat(100) }), null);
  assert.equal(cleanMessage({ t: "in", from: 0, upto: 10, cmds: [[{ unit: 0 }], "nope"] }), null);
  assert.equal(cleanMessage({ t: "in", from: 0, upto: 10, cmds: Array(40).fill([]) }), null, "trop d'images d'un coup");
  assert.equal(cleanMessage({ t: "eval", from: 0 }), null);
});

test("codes de salle : courts, lisibles, valides pour la salle de la page", () => {
  const r = rng(1);
  for (let i = 0; i < 50; i++) assert.match(newRoomCode(r), /^mm-\d{4}$/);
  assert.ok(ROOM_CODE.test("mm-0042"));
  assert.ok(!ROOM_CODE.test("MM 42"));
});

test("description de session WebRTC réduite à l'essentiel, pour tenir dans la présence", async () => {
  const { slimSdp } = await import("../src/net/link.ts");
  const sdp = [
    "v=0", "o=- 1 2 IN IP4 127.0.0.1", "s=-", "t=0 0", "a=group:BUNDLE 0", "a=extmap-allow-mixed", "a=msid-semantic: WMS",
    "m=application 9 UDP/DTLS/SCTP webrtc-datachannel", "c=IN IP4 0.0.0.0",
    ...Array.from({ length: 8 }, (_, i) => `a=candidate:${i} 1 ${i % 2 ? "tcp" : "udp"} 2122 192.168.1.${i} 5000${i} typ host`),
    "a=ice-ufrag:abcd", "a=ice-pwd:0123456789abcdef0123", "a=ice-options:trickle", "a=fingerprint:sha-256 AA:BB", "a=setup:actpass", "a=mid:0", "a=sctp-port:5000", "a=max-message-size:262144",
  ].join("\r\n");
  const slim = slimSdp(sdp);
  assert.equal(slim.match(/a=candidate/g)?.length, 4);
  assert.ok(!/ tcp /.test(slim), "UDP d'abord");
  for (const k of ["a=ice-ufrag", "a=ice-pwd", "a=fingerprint", "a=setup", "a=mid", "a=sctp-port", "m=application"]) assert.ok(slim.includes(k), k);
  assert.ok(!slim.includes("extmap"));
});
