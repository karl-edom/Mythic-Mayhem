// The players' connections during online play (decision 0026, step 3).
//
// Two ways at once, and the receiver keeps whichever arrives first (Lockstep ignores
// commands it already has):
// - **Direct**: a WebRTC data channel between each pair of pages, unordered and without
//   retransmission (a late packet is worth nothing: the next one repeats it). The
//   handshake goes through the room's presence: no signalling server of our own.
// - **Relay**: the last message of each kind also sits in the sender's room presence,
//   which the platform passes on about 30 times a second. Slower, but it needs nothing
//   else, and it carries the match on its own when a direct link cannot be made
//   (a strict network, a browser that refuses WebRTC in the page).
//
// Everything received is untrusted: messages are checked and rebuilt field by field.

import type { Command } from "../brawl/world.ts";
import type { NetMessage } from "./lockstep.ts";
import type { Room, RoomPeer } from "./room.ts";

const ICE: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };
/** Most time spent gathering network addresses before sending what was found. */
const ICE_WAIT_MS = 2000;

/** A message on the wire: the match it belongs to, and the message. */
interface Wire {
  /** Match id ("" in the lobby: pings only). */
  g: string;
  m: NetMessage | { t: "ping"; at: number } | { t: "pong"; at: number };
}

export type LinkState = "direct" | "relay";

interface Pair {
  pc: RTCPeerConnection;
  channel?: RTCDataChannel;
  /** Last SDP sent to / taken from this peer (not to handle the same one twice). */
  sentSdp?: string;
  tookSdp?: string;
  rtt?: number;
}

export class NetLink {
  readonly room: Room;
  /** Match whose messages are kept ("" in the lobby). */
  match = "";
  private handler: ((m: NetMessage, peer: string) => void) | null = null;
  private pairs = new Map<string, Pair>();
  private relaySeen = new Map<string, unknown>();
  private relayRtt = new Map<string, number>();
  private unsubscribe: () => void;
  private timer: ReturnType<typeof setInterval>;
  private readonly rtc: boolean;
  private sig: Record<string, { k: "offer" | "answer"; sdp: string }> = {};

  constructor(room: Room, opts: { rtc?: boolean } = {}) {
    this.room = room;
    this.rtc = (opts.rtc ?? true) && typeof RTCPeerConnection !== "undefined";
    this.unsubscribe = room.onPeers(({ peers }) => this.onPeers(peers));
    // Pings, twice a second: over the direct link when there is one, and in presence.
    this.timer = setInterval(() => {
      const at = Date.now();
      for (const [, p] of this.pairs) if (p.channel?.readyState === "open") p.channel.send(JSON.stringify({ g: "", m: { t: "ping", at } } satisfies Wire));
      const pong: Record<string, number> = {};
      for (const q of this.room.peers()) {
        const ping = q.presence.ping;
        if (!q.sameTab && typeof ping === "number") pong[q.peer] = ping;
      }
      void this.room.presence({ ping: at, pong }).catch(() => undefined);
    }, 500);
  }

  /** This page's label in the room. */
  get me(): string {
    return this.room.peers().find((p) => p.sameTab)?.peer ?? "";
  }

  onMessage(handler: (m: NetMessage, peer: string) => void): void {
    this.handler = handler;
  }

  /** To every other player: direct where linked, and in presence for the rest. */
  send(m: NetMessage): void {
    const text = JSON.stringify({ g: this.match, m } satisfies Wire);
    for (const [, p] of this.pairs) if (p.channel?.readyState === "open") p.channel.send(text);
    void this.room.presence({ [m.t === "in" ? "netIn" : "netHash"]: { g: this.match, m } }).catch(() => undefined);
  }

  /** How each other peer is reached. */
  state(peer: string): LinkState {
    return this.pairs.get(peer)?.channel?.readyState === "open" ? "direct" : "relay";
  }

  /** Round trip to a peer, milliseconds (direct link if any, else through the room). */
  rtt(peer: string): number | undefined {
    return this.state(peer) === "direct" ? this.pairs.get(peer)?.rtt : this.relayRtt.get(peer);
  }

  close(): void {
    this.unsubscribe();
    clearInterval(this.timer);
    for (const [, p] of this.pairs) p.pc.close();
    this.pairs.clear();
    void this.room.presence({ netIn: null, netHash: null, sig: null, ping: null, pong: null }).catch(() => undefined);
  }

  private deliver(w: unknown, peer: string): void {
    if (typeof w !== "object" || w === null) return;
    const { g, m } = w as Wire;
    if (typeof m !== "object" || m === null) return;
    if (m.t === "ping" && typeof m.at === "number") {
      const p = this.pairs.get(peer);
      if (p?.channel?.readyState === "open") p.channel.send(JSON.stringify({ g: "", m: { t: "pong", at: m.at } } satisfies Wire));
      return;
    }
    if (m.t === "pong" && typeof m.at === "number") {
      const p = this.pairs.get(peer);
      if (p) p.rtt = p.rtt === undefined ? Date.now() - m.at : p.rtt * 0.8 + (Date.now() - m.at) * 0.2;
      return;
    }
    if (g !== this.match || !this.match) return;
    const clean = cleanMessage(m);
    if (clean) this.handler?.(clean, peer);
  }

  private onPeers(peers: readonly RoomPeer[]): void {
    const me = peers.find((p) => p.sameTab)?.peer;
    if (!me) return;
    for (const q of peers) {
      if (q.sameTab) continue;
      // Relay: a new message in someone's presence.
      for (const key of ["netIn", "netHash"] as const) {
        const v = q.presence[key];
        if (v !== undefined && this.relaySeen.get(q.peer + key) !== v) {
          this.relaySeen.set(q.peer + key, v);
          this.deliver(v, q.peer);
        }
      }
      // Round trip through the room: they echo our ping.
      const pong = q.presence.pong as Record<string, unknown> | undefined;
      const echoed = pong?.[me];
      if (typeof echoed === "number" && this.relaySeen.get(q.peer + "pong") !== echoed) {
        this.relaySeen.set(q.peer + "pong", echoed);
        this.relayRtt.set(q.peer, Date.now() - echoed);
      }
      if (this.rtc) void this.handshake(me, q);
    }
    // Gone: close their link.
    for (const [peer, p] of this.pairs)
      if (!peers.some((q) => q.peer === peer)) {
        p.pc.close();
        this.pairs.delete(peer);
        delete this.sig[peer];
      }
  }

  /** WebRTC handshake with one peer: the one with the smaller label offers. */
  private async handshake(me: string, q: RoomPeer): Promise<void> {
    const theirs = (q.presence.sig as Record<string, { k?: unknown; sdp?: unknown }> | undefined)?.[me];
    let pair = this.pairs.get(q.peer);
    if (me < q.peer && !pair) {
      pair = this.open(q.peer);
      pair.channel = pair.pc.createDataChannel("mm", { ordered: false, maxRetransmits: 0 });
      this.wire(pair.channel, q.peer);
      await pair.pc.setLocalDescription(await pair.pc.createOffer());
      await this.publish(q.peer, pair, "offer");
    }
    if (!theirs || typeof theirs.sdp !== "string" || theirs.sdp.length > 3500) return;
    if (me > q.peer && theirs.k === "offer") {
      if (pair?.tookSdp === theirs.sdp) return;
      // A new offer (they reloaded): start again.
      pair?.pc.close();
      pair = this.open(q.peer);
      pair.tookSdp = theirs.sdp;
      await pair.pc.setRemoteDescription({ type: "offer", sdp: theirs.sdp });
      await pair.pc.setLocalDescription(await pair.pc.createAnswer());
      await this.publish(q.peer, pair, "answer");
    } else if (me < q.peer && theirs.k === "answer" && pair && pair.tookSdp !== theirs.sdp && pair.pc.signalingState === "have-local-offer") {
      pair.tookSdp = theirs.sdp;
      await pair.pc.setRemoteDescription({ type: "answer", sdp: theirs.sdp }).catch(() => undefined);
    }
  }

  private open(peer: string): Pair {
    const pc = new RTCPeerConnection(ICE);
    const pair: Pair = { pc };
    pc.ondatachannel = (e) => {
      pair.channel = e.channel;
      this.wire(e.channel, peer);
    };
    this.pairs.set(peer, pair);
    return pair;
  }

  private wire(channel: RTCDataChannel, peer: string): void {
    // Linked: the handshake can leave presence (room for the others').
    channel.onopen = () => {
      const { [peer]: _done, ...rest } = this.sig;
      this.sig = rest;
      void this.room.presence({ sig: this.sig }).catch(() => undefined);
    };
    channel.onmessage = (e) => {
      if (typeof e.data !== "string" || e.data.length > 8192) return;
      try {
        this.deliver(JSON.parse(e.data), peer);
      } catch {
        // Not ours: ignored.
      }
    };
  }

  /** Waits for the network addresses (no trickle: one message each way), then posts the SDP. */
  private async publish(peer: string, pair: Pair, k: "offer" | "answer"): Promise<void> {
    const pc = pair.pc;
    if (pc.iceGatheringState !== "complete")
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, ICE_WAIT_MS);
        pc.addEventListener("icegatheringstatechange", () => {
          if (pc.iceGatheringState === "complete") (clearTimeout(t), resolve());
        });
      });
    const sdp = pc.localDescription?.sdp && slimSdp(pc.localDescription.sdp);
    if (!sdp || sdp === pair.sentSdp) return;
    pair.sentSdp = sdp;
    this.sig = { ...this.sig, [peer]: { k, sdp } };
    await this.room.presence({ sig: this.sig }).catch(() => undefined);
  }
}

/** SDP lines a data channel needs; the rest (and extra candidates) only fill presence. */
const SDP_KEEP = /^(v=|o=|s=|t=|c=|m=|a=(group|msid-semantic|ice-ufrag|ice-pwd|ice-options|fingerprint|setup|mid|sctp-port|max-message-size))/;

/**
 * A session description cut to what a data channel needs, with at most 4 network
 * candidates (UDP first): small enough for several of them in one presence (4 KiB).
 */
export function slimSdp(sdp: string): string {
  const lines = sdp.split(/\r?\n/).filter(Boolean);
  const candidates = lines.filter((l) => l.startsWith("a=candidate:")).sort((a, b) => Number(/ tcp /i.test(a)) - Number(/ tcp /i.test(b)));
  const kept = lines.filter((l) => SDP_KEEP.test(l));
  // Candidates go at the end of the media section (after its other lines).
  return [...kept, ...candidates.slice(0, 4)].join("\r\n") + "\r\n";
}

const BOOLS = ["jump", "jumpHeld", "light", "dodge", "grab", "heavy", "guard", "charge"] as const;
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/** One command as the simulation accepts it, from untrusted JSON (else null). */
export function cleanCommand(v: unknown): Command | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!finite(o.unit)) return null;
  const c: Command = { unit: o.unit };
  const mv = o.move as Record<string, unknown> | undefined;
  if (mv && finite(mv.x) && finite(mv.z)) c.move = { x: mv.x, z: mv.z };
  for (const k of BOOLS) if (o[k] === true) c[k] = true;
  if (finite(o.special) && o.special >= 0 && o.special < 3) c.special = Math.floor(o.special);
  if (finite(o.target) && o.target >= -1 && o.target < 8) c.target = Math.floor(o.target);
  return c;
}

/** A lockstep message from untrusted JSON, rebuilt field by field (else null). */
export function cleanMessage(v: unknown): NetMessage | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (!finite(o.from)) return null;
  if (o.t === "hash" && finite(o.tick) && typeof o.hash === "string" && o.hash.length <= 16)
    return { t: "hash", from: o.from, tick: o.tick, hash: o.hash };
  if (o.t === "in" && finite(o.upto) && Array.isArray(o.cmds) && o.cmds.length <= 16) {
    const cmds: Command[][] = [];
    for (const tick of o.cmds) {
      if (!Array.isArray(tick) || tick.length > 4) return null;
      const list = tick.map(cleanCommand);
      if (list.some((c) => !c)) return null;
      cmds.push(list as Command[]);
    }
    return { t: "in", from: o.from, upto: o.upto, cmds };
  }
  return null;
}
