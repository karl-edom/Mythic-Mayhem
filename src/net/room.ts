// The meeting place of online play (decision 0026, step 3): a named room where the
// players' pages see each other. On the page published on claude.ai it is the page's
// own "room" capability (everyone who has the page open right now; nothing to host);
// in development, a stand-in over BroadcastChannel joins the tabs of one browser.
//
// Only presence is used: one small object per participant (≤ 4 KiB), kept current by
// its owner, sent coalesced about 30 times a second, readable by every participant,
// Viewers included. It carries the lobby (name, pick, ready, the host's start), the
// WebRTC handshake, and the game's own messages when no direct link could be made.

/** The part of a room the game uses (same shape as the claude.ai capability's). */
export interface Room {
  readonly name: string;
  presence(patch: Record<string, unknown>): Promise<void>;
  peers(): readonly RoomPeer[];
  onPeers(handler: (change: { peers: readonly RoomPeer[] }) => void): () => void;
  connected(): boolean;
  leave(): Promise<void>;
}

export interface RoomPeer {
  /** One open page: the same label on everyone's page. */
  peer: string;
  /** This very page. */
  sameTab: boolean;
  presence: Readonly<Record<string, unknown>>;
}

/** What `claude.use("room")` gives (the lobby, which can join named rooms). */
interface Lobby {
  join(name: string): Promise<Room>;
}

declare global {
  interface Window {
    claude?: { use(name: string): Promise<unknown> };
  }
}

/** Room names: lower-case letters, digits, dash (the capability's grammar). */
export const ROOM_CODE = /^[a-z0-9][a-z0-9_.-]{0,47}$/;

/** A fresh room code, short enough to read out: "mm-" and four digits. */
export function newRoomCode(random = Math.random): string {
  return `mm-${String(Math.floor(random() * 10000)).padStart(4, "0")}`;
}

/**
 * The room capability of the page, if this page has one (the page published on
 * claude.ai, opened inside claude.ai), else the development stand-in, else null.
 */
export async function roomLobby(): Promise<Lobby | null> {
  const claude = typeof window !== "undefined" ? window.claude : undefined;
  if (claude?.use) {
    const room = (await claude.use("room").catch(() => null)) as Lobby | null;
    if (room) return room;
  }
  if (import.meta.env?.DEV && typeof BroadcastChannel !== "undefined") return { join: async (name) => localRoom(name) };
  return null;
}

/**
 * Development stand-in: the tabs of this browser that joined the same name. Same
 * contract as the real room: presence objects, merged per field, coalesced (here every
 * 33 ms), the whole list of peers delivered on every change.
 */
export function localRoom(name: string): Room {
  const me = Math.random().toString(36).slice(2, 10);
  const channel = new BroadcastChannel(`mm-room-${name}`);
  const state = new Map<string, Record<string, unknown>>([[me, {}]]);
  const seen = new Map<string, number>([[me, Date.now()]]);
  const handlers = new Set<(c: { peers: readonly RoomPeer[] }) => void>();
  let dirty = true;
  let snapshot: readonly RoomPeer[] = [];
  const rebuild = () => {
    snapshot = Object.freeze([...state].map(([peer, presence]) => Object.freeze({ peer, sameTab: peer === me, presence: Object.freeze({ ...presence }) })));
    for (const h of handlers) h({ peers: snapshot });
  };
  channel.onmessage = (e: MessageEvent<{ from: string; presence?: Record<string, unknown>; bye?: boolean }>) => {
    const m = e.data;
    if (m.bye) state.delete(m.from);
    else if (m.presence) {
      // A newcomer: answer with ours so that it sees us at once.
      if (!state.has(m.from)) dirty = true;
      state.set(m.from, m.presence);
      seen.set(m.from, Date.now());
    }
    rebuild();
  };
  const timer = setInterval(() => {
    // Gone quiet for 15 s: left (a closed tab sends no goodbye; a busy one can stay
    // silent for seconds while it loads).
    for (const [p, t] of seen) if (p !== me && Date.now() - t > 15000) (state.delete(p), seen.delete(p), rebuild());
    if (dirty || Date.now() - (seen.get(me) ?? 0) > 1000) {
      dirty = false;
      seen.set(me, Date.now());
      channel.postMessage({ from: me, presence: state.get(me) });
    }
  }, 33);
  return {
    name,
    async presence(patch) {
      const cur = { ...state.get(me) };
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) delete cur[k];
        else cur[k] = v;
      }
      state.set(me, cur);
      dirty = true;
      rebuild();
    },
    peers: () => snapshot,
    onPeers(handler) {
      handlers.add(handler);
      queueMicrotask(() => handler({ peers: snapshot }));
      return () => handlers.delete(handler);
    },
    connected: () => true,
    async leave() {
      clearInterval(timer);
      channel.postMessage({ from: me, bye: true });
      channel.close();
      handlers.clear();
    },
  };
}
