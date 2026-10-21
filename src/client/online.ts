// Online play, the lobby (decision 0026, step 3): create or join a room by its code,
// pick a fighter, see who is there and how well each one is linked; the host chooses
// the arena, the bots and the rule, and starts. Everything goes through the room's
// presence (see net/room.ts): each page shows what it is, nobody gives orders but
// the host's start, which every page checks before following it.

import { BOT_LEVELS } from "../brawl/bot.ts";
import type { ArenaDef } from "../brawl/arena.ts";
import { delayFor } from "../net/lockstep.ts";
import { NetLink } from "../net/link.ts";
import { ROOM_CODE, newRoomCode, roomLobby, type Room, type RoomPeer } from "../net/room.ts";
import type { RosterEntry } from "./roster.ts";

type Level = keyof typeof BOT_LEVELS;
type Rule = "stock" | "kills";

/** What the host decides and every page follows to build the very same match. */
export interface OnlineStart {
  id: string;
  seed: number;
  /** Fighters in order: a player (their room label) or a bot (null), and the pack. */
  seats: { peer: string | null; pack: string }[];
  arena: string;
  rule: Rule;
  level: Level;
  /** Input delay, ticks. */
  delay: number;
}

/** What each page shows of itself in the room. */
interface LobbyPresence {
  name: string;
  pick: string;
  /** Fingerprint of the page's fighters: the same page for everyone, or no match. */
  packs: string;
  host?: boolean;
  /** Round trips to the others, ms. */
  rtts?: Record<string, number>;
  start?: OnlineStart;
}

export interface OnlineContext {
  root: HTMLElement;
  playable: RosterEntry[];
  arenas: ArenaDef[];
  /** The fighter picked on the select screen, to start with. */
  pick: () => RosterEntry | undefined;
  back: () => void;
  start: (s: OnlineStart, link: NetLink, room: Room) => void;
}

const MAX_PLAYERS = 4;

/** 32-bit FNV-1a of a text, hex. */
function fnv(s: string): string {
  let x = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 0x01000193);
  return (x >>> 0).toString(16).padStart(8, "0");
}

/** Fingerprint of the fighters (kits) this page has. */
export function packsPrint(playable: RosterEntry[]): string {
  return fnv(JSON.stringify(playable.map((r) => [r.dir, r.kit])));
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.append(e);
  return e;
}

function savedName(): string {
  try {
    return localStorage.getItem("mm-name") ?? "";
  } catch {
    return "";
  }
}
function saveName(n: string): void {
  try {
    localStorage.setItem("mm-name", n);
  } catch {
    // Private window: not remembered.
  }
}

const lobbyOf = (p: RoomPeer): LobbyPresence | undefined => {
  const l = p.presence.lobby;
  return typeof l === "object" && l !== null ? (l as LobbyPresence) : undefined;
};

/** The room joined, kept across matches (back to the lobby after each one). */
let current: { room: Room; link: NetLink; host: boolean; launched: Set<string>; stop: () => void } | null = null;

/** Opens the online screen: the lobby if a room is joined, else create / join. */
export async function showOnline(ctx: OnlineContext): Promise<void> {
  if (current) return lobbyScreen(ctx);
  const root = ctx.root;
  root.replaceChildren();
  root.className = "online";
  root.classList.remove("hidden");
  const box = el("div", "online-box", root);
  el("div", "online-title", box, "EN LIGNE");
  const status = el("div", "online-note", box, "Connexion…");
  const lobby = await roomLobby();
  if (!lobby) {
    status.textContent =
      "Le jeu en ligne marche dans la page publiée, ouverte dans claude.ai : chacun l'ouvre de son côté (elle doit être partagée avec lui), puis l'un crée une salle et donne son code aux autres.";
    el("button", "chip", box, "Retour").addEventListener("click", ctx.back);
    return;
  }
  status.textContent = "Crée une salle et donne son code à tes amis, ou entre le code qu'on t'a donné.";
  const nameRow = el("label", "online-row", box, "Ton nom ");
  const name = el("input", "online-input", nameRow);
  name.maxLength = 16;
  name.value = savedName() || "Joueur";
  const create = el("button", "start", box);
  el("span", "start-label", create, "CRÉER UNE SALLE");
  const joinRow = el("div", "online-row", box);
  const code = el("input", "online-input", joinRow);
  code.placeholder = "mm-1234";
  code.maxLength = 12;
  const join = el("button", "chip", joinRow, "Rejoindre");
  el("button", "chip", box, "Retour").addEventListener("click", ctx.back);
  const enter = async (roomCode: string, host: boolean) => {
    const n = name.value.trim().slice(0, 16) || "Joueur";
    saveName(n);
    if (!ROOM_CODE.test(roomCode)) {
      status.textContent = "Code de salle invalide (exemple : mm-1234).";
      return;
    }
    status.textContent = "Entrée dans la salle…";
    try {
      const room = await lobby.join(roomCode);
      const link = new NetLink(room);
      const me: LobbyPresence = { name: n, pick: ctx.pick()?.dir ?? ctx.playable[0]!.dir, packs: packsPrint(ctx.playable), host };
      await room.presence({ lobby: me });
      current = { room, link, host, launched: new Set(), stop: () => undefined };
      lobbyScreen(ctx);
    } catch (e) {
      status.textContent = `Impossible d'entrer dans la salle : ${e instanceof Error ? e.message : String((e as { code?: string })?.code ?? e)}`;
    }
  };
  create.addEventListener("click", () => void enter(newRoomCode(), true));
  join.addEventListener("click", () => void enter(code.value.trim().toLowerCase(), false));
}

/** Leaves the room (back to the select screen). */
export function leaveOnline(): void {
  if (!current) return;
  current.stop();
  current.link.close();
  void current.room.presence({ lobby: null });
  void current.room.leave();
  current = null;
}

function lobbyScreen(ctx: OnlineContext): void {
  const cur = current!;
  const { room, link } = cur;
  const root = ctx.root;
  root.replaceChildren();
  root.className = "online";
  root.classList.remove("hidden");
  const box = el("div", "online-box", root);
  el("div", "online-title", box, "SALLE");
  el("div", "online-code", box, room.name);
  el("div", "online-note", box, cur.host ? "Donne ce code à tes amis. Tu es l'hôte : tu choisis l'arène et tu lances." : "En attente du lancement par l'hôte.");
  const list = el("div", "online-players", box);
  const mine = () => lobbyOf(room.peers().find((p) => p.sameTab)!) ?? ({} as LobbyPresence);
  const setMine = (patch: Partial<LobbyPresence>) => void room.presence({ lobby: { ...mine(), ...patch } }).catch(() => undefined);

  // My fighter.
  const pickRow = el("label", "online-row", box, "Ton combattant ");
  const pick = el("select", "online-input", pickRow);
  for (const r of ctx.playable) {
    const o = el("option", "", pick, r.character.name);
    o.value = r.dir;
  }
  pick.value = mine().pick ?? ctx.playable[0]!.dir;
  pick.addEventListener("change", () => setMine({ pick: pick.value }));

  // The host's choices.
  const opts = { arena: ctx.arenas.find((a) => a.id === "village-japonais")?.id ?? ctx.arenas[0]?.id ?? "", bots: 0, level: "normal" as Level, rule: "stock" as Rule };
  let launchBtn: HTMLButtonElement | null = null;
  if (cur.host) {
    const sel = <T extends string>(label: string, values: [T, string][], get: () => T, set: (v: T) => void) => {
      const row = el("label", "online-row", box, `${label} `);
      const s = el("select", "online-input", row);
      for (const [v, t] of values) el("option", "", s, t).value = v;
      s.value = get();
      s.addEventListener("change", () => set(s.value as T));
    };
    sel("Arène", ctx.arenas.map((a) => [a.id, a.name] as [string, string]), () => opts.arena, (v) => (opts.arena = v));
    sel("Bots en plus", [["0", "0"], ["1", "1"], ["2", "2"]], () => String(opts.bots) as "0", (v) => (opts.bots = Number(v)));
    sel("Niveau des bots", [["facile", "Facile"], ["normal", "Normal"], ["difficile", "Difficile"]], () => opts.level, (v) => (opts.level = v));
    sel("Victoire", [["stock", "3 vies"], ["kills", "K.-O. au temps"]], () => opts.rule, (v) => (opts.rule = v));
    launchBtn = el("button", "start", box);
    el("span", "start-label", launchBtn, "LANCER");
    launchBtn.addEventListener("click", () => {
      const players = room.peers().filter((p) => lobbyOf(p));
      const humans = players.slice(0, MAX_PLAYERS);
      const bots = Math.min(opts.bots, MAX_PLAYERS - humans.length);
      // Input delay from the worst round trip anyone reports (one way = half), plus a margin.
      let worst = 0;
      for (const p of humans) for (const [peer, ms] of Object.entries(lobbyOf(p)?.rtts ?? {})) if (humans.some((q) => q.peer === peer)) worst = Math.max(worst, ms);
      const delay = Math.min(10, delayFor(worst / 2 + 8));
      const pool = ctx.playable.map((r) => r.dir);
      const seed = (Math.random() * 2 ** 31) >>> 0;
      const start: OnlineStart = {
        id: Math.random().toString(36).slice(2, 10),
        seed,
        seats: [
          ...humans.map((p) => ({ peer: p.peer, pack: lobbyOf(p)!.pick })),
          ...Array.from({ length: bots }, (_, i) => ({ peer: null, pack: pool[(seed + i * 7) % pool.length]! })),
        ],
        arena: opts.arena,
        rule: opts.rule,
        level: opts.level,
        delay,
      };
      setMine({ start });
    });
  }
  el("button", "chip", box, "Quitter la salle").addEventListener("click", () => {
    leaveOnline();
    ctx.back();
  });

  const draw = () => {
    const peers = room.peers().filter((p) => lobbyOf(p));
    const myPacks = packsPrint(ctx.playable);
    list.replaceChildren();
    for (const p of peers) {
      const l = lobbyOf(p)!;
      const fighter = ctx.playable.find((r) => r.dir === l.pick)?.character.name ?? "?";
      const row = el("div", `online-player${p.sameTab ? " me" : ""}`, list);
      el("span", "online-name", row, `${l.name || "Joueur"}${l.host ? " (hôte)" : ""}${p.sameTab ? " — toi" : ""}`);
      el("span", "online-fighter", row, fighter);
      const rtt = p.sameTab ? undefined : link.rtt(p.peer);
      const state = p.sameTab ? "" : `${link.state(p.peer) === "direct" ? "direct" : "relais"}${rtt !== undefined ? ` · ${Math.round(rtt)} ms` : ""}`;
      el("span", "online-link", row, l.packs !== myPacks ? "⚠ autre version de la page : rechargez-la" : state);
    }
    const ok = peers.length >= 2 && peers.length <= MAX_PLAYERS && peers.every((p) => lobbyOf(p)!.packs === myPacks);
    if (launchBtn) {
      launchBtn.disabled = !ok;
      launchBtn.title = ok ? "" : peers.length < 2 ? "Il faut au moins un ami dans la salle" : peers.length > MAX_PLAYERS ? "4 joueurs au plus" : "Tout le monde doit avoir la même version de la page";
    }
    // My round trips, for the host's choice of delay.
    const rtts: Record<string, number> = {};
    for (const p of peers) {
      const r = p.sameTab ? undefined : link.rtt(p.peer);
      if (r !== undefined) rtts[p.peer] = Math.round(r);
    }
    if (JSON.stringify(rtts) !== JSON.stringify(mine().rtts ?? {})) setMine({ rtts });
    // The host's start, if it names me and is new: go.
    const host = peers.find((p) => lobbyOf(p)!.host);
    const start = host && lobbyOf(host)!.start;
    const me = peers.find((p) => p.sameTab);
    if (start && me && !cur.launched.has(start.id) && validStart(start, ctx) && start.seats.some((s) => s.peer === me.peer)) {
      cur.launched.add(start.id);
      cur.stop();
      ctx.start(start, link, room);
    }
  };
  // Redrawn on every change in the room, at most 4 times a second (and the pings).
  let pending = false;
  const schedule = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => {
      pending = false;
      if (current === cur) draw();
    }, 250);
  };
  const off = room.onPeers(schedule);
  const timer = setInterval(schedule, 1000);
  cur.stop = () => {
    off();
    clearInterval(timer);
  };
  draw();
}

/** A start this page can follow: known arena and fighters, sane numbers. */
export function validStart(s: OnlineStart, ctx: Pick<OnlineContext, "playable" | "arenas">): boolean {
  return (
    typeof s.id === "string" &&
    Number.isInteger(s.seed) &&
    Array.isArray(s.seats) &&
    s.seats.length >= 2 &&
    s.seats.length <= MAX_PLAYERS &&
    s.seats.every((x) => (x.peer === null || typeof x.peer === "string") && ctx.playable.some((r) => r.dir === x.pack)) &&
    ctx.arenas.some((a) => a.id === s.arena) &&
    (s.rule === "stock" || s.rule === "kills") &&
    s.level in BOT_LEVELS &&
    Number.isInteger(s.delay) &&
    s.delay >= 2 &&
    s.delay <= 10
  );
}
