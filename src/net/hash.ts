// Fingerprint of a match state (decision 0026): players exchange it every second; two
// different fingerprints for the same tick mean the matches have drifted apart (desync).

import type { BrawlWorld } from "../brawl/world.ts";

/** Fields that never change during a match, or are only drawn: left out of the fingerprint. */
const STATIC = new Set(["kit", "kind", "spawn", "config", "arena", "events"]);

/**
 * Everything that decides what happens next: fighters, props, projectiles, zones, scores
 * and the tick. Numbers are written by JSON, which gives the shortest exact decimal of a
 * double (the same in every browser), so equal states give equal text.
 */
export function stateText(w: BrawlWorld): string {
  const { arena, events: _events, config: _config, ...rest } = w;
  const props = arena.props.map((p) => [p.alive, p.hp, p.x, p.z, p.held, p.flying]);
  return JSON.stringify({ ...rest, props }, (key, value) => (STATIC.has(key) ? undefined : value));
}

/** 32-bit FNV-1a of the state text, in hex. */
export function stateHash(w: BrawlWorld): string {
  const s = stateText(w);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
