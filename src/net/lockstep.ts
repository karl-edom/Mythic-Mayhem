// Online play, model B of decision 0026: lockstep with input delay. Every player runs the
// whole match. A command typed now is scheduled `delay` ticks ahead and sent to the
// others; the match moves on to a tick only once every player's commands for it are in.
// Within the delay, nobody waits; beyond it (a late packet), the match pauses until the
// commands arrive. Bots run on every machine alike (same seeds), nothing is sent for them.
//
// No transport here: `send` delivers a message to every other player (WebRTC in the game,
// a simulated network in the tests). Messages may be lost or come out of order: each one
// repeats the last commands sent, so a single loss costs nothing.

import { botCommand, type BrawlBot } from "../brawl/bot.ts";
import { step, type BrawlWorld, type Command } from "../brawl/world.ts";
import { stateHash } from "./hash.ts";

/** A machine taking part: its id and the fighters (units) its players control. */
export interface PeerSetup {
  id: number;
  units: number[];
}

export type NetMessage =
  /** Commands of the sender's units for ticks upto − cmds.length + 1 … upto. */
  | { t: "in"; from: number; upto: number; cmds: Command[][] }
  /** State fingerprint after a tick. */
  | { t: "hash"; from: number; tick: number; hash: string };

export interface LockstepOptions {
  world: BrawlWorld;
  peers: PeerSetup[];
  /** This machine's id. */
  me: number;
  /** Input delay, ticks (2 to 4 between friends in one country). */
  delay: number;
  /** Bots, by unit: they play on every machine alike. */
  bots?: Map<number, BrawlBot>;
  send: (m: NetMessage) => void;
  /** Ticks between fingerprints (60: once a second). */
  hashEvery?: number;
  /** Past ticks repeated in each message (covers that many losses in a row). */
  redundancy?: number;
  /** Most ticks run in one frame when catching up. */
  maxCatchUp?: number;
}

/**
 * Input delay for a measured one-way latency (ms): the ticks a command needs to arrive,
 * plus one for the frame it waits to be read, at least 2. With 15-25 ms between friends
 * in one country: 3 ticks (50 ms).
 */
export function delayFor(oneWayMs: number, tickRate = 60): number {
  return Math.max(2, Math.ceil(oneWayMs / (1000 / tickRate)) + 1);
}

/** Buttons that count on the tick they go down: not to be lost while the match waits. */
const PRESSES = ["jump", "light", "dodge", "grab"] as const;

export class Lockstep {
  readonly world: BrawlWorld;
  readonly delay: number;
  /** Ticks the match could not run for want of someone's commands (a measure of lag). */
  stalls = 0;
  /** First tick whose fingerprints disagreed, or null. */
  desyncAt: number | null = null;
  onDesync?: (tick: number, hashes: Map<number, string>) => void;
  private readonly peers: PeerSetup[];
  private readonly me: number;
  private readonly bots: Map<number, BrawlBot>;
  private readonly send: (m: NetMessage) => void;
  private readonly hashEvery: number;
  private readonly redundancy: number;
  private readonly maxCatchUp: number;
  /** tick → peer → that peer's commands for it. */
  private readonly inputs = new Map<number, Map<number, Command[]>>();
  /**
   * This machine's clock, in ticks: one per frame, and the match never runs past it.
   * It stops while the match waits for someone, so commands stay `delay` ticks ahead.
   */
  private clock: number;
  /** Last tick this machine's commands are scheduled for (clock + delay). */
  private scheduled: number;
  /** Presses typed while nothing could be scheduled: added to the next scheduled commands. */
  private pending: Command[] | null = null;
  private readonly hashes = new Map<number, Map<number, string>>();

  constructor(o: LockstepOptions) {
    this.world = o.world;
    this.peers = o.peers;
    this.me = o.me;
    this.delay = o.delay;
    this.bots = o.bots ?? new Map();
    this.send = o.send;
    this.hashEvery = o.hashEvery ?? 60;
    this.redundancy = o.redundancy ?? 8;
    this.maxCatchUp = o.maxCatchUp ?? 8;
    // The first `delay` ticks: nobody has typed anything yet.
    for (let t = this.world.tick + 1; t <= this.world.tick + this.delay; t++)
      for (const p of this.peers) this.store(t, p.id, p.units.map((unit) => ({ unit })));
    this.clock = this.world.tick;
    this.scheduled = this.world.tick + this.delay;
  }

  /** This machine's units. */
  get units(): number[] {
    return this.peers.find((p) => p.id === this.me)!.units;
  }

  /**
   * Once per frame: this machine's commands (one per unit of `units`, in that order),
   * then as many ticks as can run. Returns the ticks run.
   */
  frame(local: Command[]): number {
    this.schedule(local);
    let ran = 0;
    while (ran < this.maxCatchUp && this.world.tick < this.clock && this.ready(this.world.tick + 1)) {
      this.runTick();
      ran++;
    }
    if (this.world.tick < this.clock && !this.world.over) this.stalls++;
    return ran;
  }

  /** A message from another machine. */
  receive(m: NetMessage): void {
    if (m.t === "in") {
      const first = m.upto - m.cmds.length + 1;
      m.cmds.forEach((cmds, k) => {
        if (first + k > this.world.tick) this.store(first + k, m.from, cmds);
      });
    } else this.noteHash(m.tick, m.from, m.hash);
  }

  /** Schedules this frame's commands `delay` ticks ahead (if the match is not too far behind) and sends them. */
  private schedule(local: Command[]): void {
    const cmds = local.map((c, i) => ({ ...c, unit: this.units[i]! }));
    // The clock moves on only once the match has caught up with it.
    if (this.world.tick < this.clock) {
      // Waiting on someone: keep the presses for later, the held buttons will be re-read.
      this.pending = this.pending ? this.pending.map((p, i) => mergePresses(p, cmds[i]!)) : cmds;
    } else {
      const next = this.pending ? cmds.map((c, i) => mergePresses(c, this.pending![i]!)) : cmds;
      this.pending = null;
      this.clock++;
      this.scheduled = this.clock + this.delay;
      this.store(this.scheduled, this.me, next);
    }
    // Repeat the last few ticks: a lost message is covered by the next one.
    const upto = this.scheduled;
    const from = Math.max(this.world.tick + 1, upto - this.redundancy + 1, 1);
    const sent: Command[][] = [];
    for (let t = from; t <= upto; t++) sent.push(this.inputs.get(t)!.get(this.me)!);
    this.send({ t: "in", from: this.me, upto, cmds: sent });
  }

  private ready(tick: number): boolean {
    const got = this.inputs.get(tick);
    return !this.world.over && !!got && this.peers.every((p) => got.has(p.id));
  }

  private runTick(): void {
    const tick = this.world.tick + 1;
    const got = this.inputs.get(tick)!;
    const cmds: Command[] = this.peers.flatMap((p) => got.get(p.id)!);
    for (const [unit, bot] of this.bots) cmds.push(botCommand(this.world, this.world.fighters[unit]!, bot));
    step(this.world, cmds);
    this.inputs.delete(tick);
    if (tick % this.hashEvery === 0) {
      const hash = stateHash(this.world);
      this.noteHash(tick, this.me, hash);
      this.send({ t: "hash", from: this.me, tick, hash });
    }
  }

  private noteHash(tick: number, from: number, hash: string): void {
    let byPeer = this.hashes.get(tick);
    if (!byPeer) this.hashes.set(tick, (byPeer = new Map()));
    byPeer.set(from, hash);
    if (this.desyncAt === null && new Set(byPeer.values()).size > 1) {
      this.desyncAt = tick;
      this.onDesync?.(tick, byPeer);
    }
    // Forget fingerprints everyone has compared.
    if (byPeer.size === this.peers.length) this.hashes.delete(tick);
  }

  private store(tick: number, peer: number, cmds: Command[]): void {
    let byPeer = this.inputs.get(tick);
    if (!byPeer) this.inputs.set(tick, (byPeer = new Map()));
    if (!byPeer.has(peer)) byPeer.set(peer, cmds);
  }
}

/** A command with the presses of another added in (held buttons and stick: the newer one's). */
function mergePresses(c: Command, earlier: Command): Command {
  const out: Command = { ...c };
  for (const k of PRESSES) if (earlier[k]) out[k] = true;
  if (out.special === undefined && earlier.special !== undefined) out.special = earlier.special;
  return out;
}
