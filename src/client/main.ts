// Browser entry: loading screen, fighter select (with a live 3D showcase of
// the chosen fighters in the chosen arena), then a 1v1 against a bot.
// Fixed-step simulation (60 Hz) driven by commands; rendering only reads it.

import { rng } from "../sim/math.ts";
import { BOT_LEVELS, botCommand, createBot, type BrawlBot } from "../brawl/bot.ts";
import { buildArena, type ArenaDef } from "../brawl/arena.ts";
import { BRAWL_CONFIG, createBrawl, createMatch, step, type BrawlConfig, type BrawlWorld } from "../brawl/world.ts";
import { Hud } from "./hud.ts";
import { Input, padIndex, type Controller, type MenuButton } from "./input.ts";
import { loadModels, type ModelLibrary } from "./models.ts";
import { loadPhotoTextures } from "./villageTex.ts";
import { PortraitStudio, type PortraitCut } from "./portraits.ts";
import { loadArenaDefs, loadRoster, propCatalog, type RosterEntry } from "./roster.ts";
import { ArenaView, createRenderer } from "./scene.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const hudRoot = document.querySelector<HTMLDivElement>("#hud")!;
const menuRoot = document.querySelector<HTMLDivElement>("#menu")!;
const renderer = createRenderer(canvas);
const input = new Input(window);
const roster = loadRoster();
// The owner's own fighters (local packs) come first, and the player starts on one.
const playable = roster.filter((r) => r.kit).sort((a, b) => Number(b.local) - Number(a.local));
const arenas = loadArenaDefs();
let library: ModelLibrary | null = null;

type Level = keyof typeof BOT_LEVELS;
const LEVEL_NAMES: Record<Level, string> = { facile: "Facile", normal: "Normal", difficile: "Difficile" };

/** Colours of the slots (each for oneself) and of the two teams, as in Smash. */
export const SLOT_COLORS = ["#ff4d4d", "#3d8bff", "#ffc93c", "#38c96b"];
export const TEAM_COLORS = ["#ff4d4d", "#3d8bff"];
const TEAM_NAMES = ["Rouge", "Bleue"];

type Mode = "ffa" | "teams";
type Rule = "stock" | "kills";

interface Slot {
  entry: RosterEntry | undefined;
  /** Team when playing in teams (0 or 1). */
  team: number;
  /** Who plays it: the keyboard, a gamepad, or a bot. */
  ctrl: Controller;
}

const choice = {
  /** Slot 0 is the player, the others are bots. Up to four. */
  slots: [
    { entry: playable[0], team: 0, ctrl: "kb" },
    { entry: playable[1] ?? playable[0], team: 1, ctrl: "cpu" },
    { entry: playable[2] ?? playable[0], team: 1, ctrl: "cpu" },
    { entry: playable[3] ?? playable[0], team: 0, ctrl: "cpu" },
  ] as Slot[],
  count: 2,
  mode: "ffa" as Mode,
  rule: "stock" as Rule,
  level: "normal" as Level,
  // The Japanese village first: the map being worked on (decision 0024).
  arena: (arenas.find((a) => a.id === "village-japonais") ?? arenas[0]) as ArenaDef | undefined,
  /** Which slot the next card click fills. */
  active: 0,
};

const activeSlots = () => choice.slots.slice(0, choice.count);
/** Team of a slot in the match: its own in « each for oneself », the chosen one in teams. */
const teamOf = (i: number) => (choice.mode === "ffa" ? i : choice.slots[i]!.team);
const colorOf = (i: number) => (choice.mode === "ffa" ? SLOT_COLORS[i]! : TEAM_COLORS[choice.slots[i]!.team]!);
const isHuman = (i: number) => choice.slots[i]!.ctrl !== "cpu";
const shortLabel = (i: number) => (isHuman(i) ? `J${i + 1}` : `CPU${i + 1}`);
const CTRL_NAMES = (c: Controller) => (c === "kb" ? "Clavier" : c === "cpu" ? "Bot" : `Manette ${padIndex(c)! + 1}`);
const slotLabel = (i: number) => `${isHuman(i) ? `JOUEUR ${i + 1}` : `CPU ${i + 1}`} · ${CTRL_NAMES(choice.slots[i]!.ctrl)}`;

/** Controllers a slot can switch to: free ones (not used by another slot), and the bot. */
function nextController(i: number): Controller {
  const used = new Set<string>(activeSlots().flatMap((sl, k) => (k === i || sl.ctrl === "cpu" ? [] : [sl.ctrl])));
  const all: Controller[] = ["kb", ...input.connectedPads().map((p) => `pad${p}` as Controller), "cpu"];
  const options = all.filter((c) => c === "cpu" || !used.has(c));
  const at = options.indexOf(choice.slots[i]!.ctrl);
  return options[(at + 1) % options.length]!;
}

/**
 * A gamepad joins (A in the menu): it takes the first bot slot, adding a fighter if
 * all are taken and there is room. Smash-style: no menu to go through.
 */
const ctrlOf = (pad: number): Controller => (pad < 0 ? "kb" : (`pad${pad}` as Controller));

function joinPad(pad: number): number | null {
  const ctrl = ctrlOf(pad);
  const mine = activeSlots().findIndex((sl) => sl.ctrl === ctrl);
  if (mine >= 0) return mine;
  // The first gamepad takes over player 1 from the keyboard: picking up a pad to play
  // alone is the common case (the keyboard can take a slot back with its chip).
  const padJoined = activeSlots().some((sl) => sl.ctrl.startsWith("pad"));
  if (pad >= 0 && !padJoined && choice.slots[0]!.ctrl === "kb") {
    choice.slots[0]!.ctrl = ctrl;
    return 0;
  }
  let i = activeSlots().findIndex((sl, k) => k > 0 && sl.ctrl === "cpu");
  if (i < 0 && choice.count < 4) i = choice.count++;
  if (i < 0) return null;
  choice.slots[i]!.ctrl = ctrl;
  return i;
}

interface Game {
  world: BrawlWorld;
  view: ArenaView;
  hud: Hud;
  bots: (BrawlBot | null)[];
  /** Controller of each fighter. */
  ctrls: Controller[];
  /** Events already turned into rumbles. */
  rumbleAt: number;
  paused: boolean;
  names: string[];
}
let game: Game | null = null;
/** Menu backdrop: the chosen fighters idling in the chosen arena. */
let showcase: ArenaView | null = null;
/** Portraits of the fighters, rendered from their models (see portraits.ts). */
let studio: PortraitStudio | null = null;
/** The select screen plays its entrance once per visit (not on every redraw). */
let menuIntro = true;
/** Fighter shown last in each player panel: a new one slides in. */
const lastShown: (string | undefined)[] = [];

/** Fills an image with a fighter's portrait, now if ready, else when rendered. */
function photo(img: HTMLImageElement, r: RosterEntry, cut: PortraitCut): void {
  img.alt = "";
  img.decoding = "async";
  const url = studio?.ready(r.dir, cut);
  if (url) {
    img.src = url;
    return;
  }
  img.classList.add("pending");
  void studio?.get(r.dir, r.character, r.kit!, cut).then((u) => {
    img.src = u;
    img.classList.remove("pending");
  });
}

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

function buildShowcase(): void {
  showcase?.dispose();
  showcase = null;
  const slots = activeSlots();
  if (slots.some((sl) => !sl.entry?.kit)) return;
  const arena = choice.arena ? buildArena(choice.arena, propCatalog) : undefined;
  const s = arena?.def.spawns[0] ?? { x: 0, z: 7 };
  // Side by side on the first spawn point, facing the middle of the arena (the camera).
  const len = Math.hypot(s.x, s.z) || 1;
  const d = { x: -s.x / len, z: -s.z / len };
  const side = { x: -d.z, z: d.x };
  const n = slots.length;
  const world = createBrawl(
    // Player 1 on the screen's left (the camera faces the fighters, so that is +side).
    slots.map((sl, i) => {
      const o = (n - 1) / 2 - i;
      return { kit: sl.entry!.kit!, team: teamOf(i), pos: { x: s.x + side.x * 1.3 * o * (n > 2 ? 1.25 : 2), y: 0, z: s.z + side.z * 1.3 * o * (n > 2 ? 1.25 : 2) } };
    }),
    undefined,
    arena,
  );
  for (const f of world.fighters) f.facing = { x: d.x, y: 0, z: d.z };
  showcase = new ArenaView(renderer, world, slots.map((sl) => sl.entry!.character), 0, library, {
    colors: slots.map((_, i) => colorOf(i)),
    labels: slots.map((_, i) => shortLabel(i)),
  });
  showcase.showcaseAt({ x: s.x, z: s.z }, d, n);
  if (import.meta.env.DEV) (window as unknown as { __showcase: ArenaView }).__showcase = showcase;
}

function fighterCard(r: RosterEntry, parent: HTMLElement, index: number): void {
  const tags = activeSlots()
    .map((sl, i) => (sl.entry === r ? i : -1))
    .filter((i) => i >= 0);
  const card = h("button", `card${tags.length ? " picked" : ""}`, parent);
  card.style.setProperty("--primary", r.character.colors.primary);
  card.style.setProperty("--secondary", r.character.colors.secondary);
  card.style.setProperty("--i", String(index));
  if (tags.length) card.style.setProperty("--picked", colorOf(tags[0]!));
  card.title = `${r.character.name} — ${r.character.universe}`;
  const frame = h("span", "card-frame", card);
  const emblem = h("span", "emblem", frame, r.character.name.slice(0, 1).toUpperCase());
  emblem.setAttribute("aria-hidden", "true");
  photo(h("img", "card-photo", frame), r, "bust");
  h("span", "card-name", card, r.character.name);
  const tagBox = h("span", "slot-tags", card);
  for (const i of tags) {
    const t = h("span", "slot-tag", tagBox, shortLabel(i));
    t.style.background = colorOf(i);
  }
  card.addEventListener("click", () => {
    choice.slots[choice.active]!.entry = r;
    choice.active = (choice.active + 1) % choice.count;
    buildShowcase();
    showMenu();
  });
}

/**
 * A player's panel, at the bottom of the select screen as in Smash: the fighter's full
 * figure over the slot's colour, the name large, who plays it, the team. Click: this
 * player picks next.
 */
function plate(i: number): HTMLElement {
  const sl = choice.slots[i]!;
  const r = sl.entry;
  const p = document.createElement("div");
  const changed = r?.dir !== lastShown[i];
  lastShown[i] = r?.dir;
  p.className = `plate${choice.active === i ? " active" : ""}${changed ? " changed" : ""}`;
  p.style.setProperty("--slot", colorOf(i));
  p.style.setProperty("--n", String(i));
  if (!r) return p;
  p.style.setProperty("--primary", r.character.colors.primary);
  p.style.setProperty("--secondary", r.character.colors.secondary);
  h("span", "plate-num", p, isHuman(i) ? `${i + 1}P` : "CPU").setAttribute("aria-hidden", "true");
  photo(h("img", "plate-photo", p), r, "full");
  const info = h("div", "plate-info", p);
  const top = h("div", "plate-label", info, slotLabel(i));
  if (ready.has(i) && isHuman(i)) h("span", "ready-tag", top, "PRÊT");
  h("div", "plate-name", info, r.character.name);
  h("div", "plate-universe", info, r.character.universe);
  const row = h("div", "plate-chips", info);
  const c = h("button", "ctrl-chip", row, CTRL_NAMES(sl.ctrl));
  c.title = "Qui joue ce combattant (clic pour changer)";
  c.addEventListener("click", (e) => {
    e.stopPropagation();
    sl.ctrl = nextController(i);
    buildShowcase();
    showMenu();
  });
  if (choice.mode === "teams") {
    const t = h("button", "team-chip", row, `Équipe ${TEAM_NAMES[sl.team]}`);
    t.style.background = TEAM_COLORS[sl.team]!;
    t.addEventListener("click", (e) => {
      e.stopPropagation();
      sl.team = 1 - sl.team;
      buildShowcase();
      showMenu();
    });
  }
  p.addEventListener("click", () => {
    choice.active = i;
    showMenu();
  });
  return p;
}

function chips<T extends string | number>(parent: HTMLElement, label: string, values: [T, string][], current: T, set: (v: T) => void, rebuild = false): void {
  const g = h("div", "option-group", parent);
  h("span", "option-label", g, label);
  for (const [v, name] of values) {
    const b = h("button", `chip${current === v ? " selected" : ""}`, g, name);
    b.addEventListener("click", () => {
      set(v);
      if (rebuild) buildShowcase();
      showMenu();
    });
  }
}

/** In teams, both sides must have someone. */
function teamsValid(): boolean {
  if (choice.mode === "ffa") return true;
  const teams = new Set(activeSlots().map((sl) => sl.team));
  return teams.size === 2;
}

function showMenu(): void {
  hudRoot.replaceChildren();
  menuRoot.replaceChildren();
  menuRoot.classList.remove("hidden");
  menuRoot.className = `select${menuIntro ? " intro" : ""}`;
  menuIntro = false;
  const top = h("header", "select-top", menuRoot);
  h("div", "logo", top, "MYTHIC MAYHEM");
  const title = h("div", "select-title", top);
  h("span", "", title, "Sélection des combattants");
  h("span", "select-rules", title, `${choice.count} combattants · ${choice.mode === "teams" ? "équipes" : "chacun pour soi"} · ${choice.rule === "stock" ? "3 vies" : "K.-O. au temps"}${choice.arena ? ` · ${choice.arena.name}` : ""}`);
  if (playable.length === 0) {
    h("p", "error", menuRoot, "Aucun combattant valide trouvé.");
    return;
  }
  const grid = h("div", "roster", menuRoot);
  playable.forEach((r, k) => fighterCard(r, grid, k));
  h("div", "select-stage", menuRoot);

  const bottom = h("div", "select-bottom", menuRoot);
  const panels = h("div", `panels n${choice.count}`, bottom);
  for (let i = 0; i < choice.count; i++) panels.append(plate(i));
  const pads = input.connectedPads().length;
  const hint = h(
    "div",
    "select-hint",
    bottom,
    `Choisis un combattant pour ${isHuman(choice.active) ? `le Joueur ${choice.active + 1}` : `le CPU ${choice.active + 1}`}` +
      (pads ? " · Manette : A choisir · X donner à un bot · Y équipe · B annuler · ↓ options · Start combattre" : " · Branche une manette et appuie sur A pour jouer avec"),
  );
  hint.setAttribute("role", "status");
  // What the game sees of the gamepads: says plainly when they cannot be read here.
  const st = input.padStatus();
  const diag = h(
    "div",
    `pad-status${st.blocked ? " warn" : ""}`,
    bottom,
    st.blocked
      ? `Manettes indisponibles : ${st.blocked}. Ouvre le jeu dans un onglet à part (ou un autre navigateur, Chrome ou Edge).`
      : st.pads.length
        ? "Manettes vues par le jeu : " +
          st.pads.map((p) => `${p.slot + 1}. ${p.id.slice(0, 40)}${p.standard ? "" : " (disposition non standard)"}`).join(" · ")
        : "Aucune manette vue par le jeu. Branche-la et appuie sur un bouton (A) dans cette page. Clavier : flèches, Entrée, Retour.",
  );
  diag.setAttribute("role", "status");
  // A pad is there but nobody has joined with it: say how, big.
  if (st.pads.length && !activeSlots().some((sl) => sl.ctrl.startsWith("pad"))) h("div", "pad-call", bottom, "🎮 Manette détectée : appuie sur A pour jouer");

  const options = h("div", "options", bottom);
  chips(options, "Combattants", [[2, "2"], [3, "3"], [4, "4"]], choice.count, (v) => {
    choice.count = v;
    choice.active = Math.min(choice.active, v - 1);
  }, true);
  chips(options, "Mode", [["ffa", "Chacun pour soi"], ["teams", "Équipes"]] as [Mode, string][], choice.mode, (v) => (choice.mode = v), true);
  chips(options, "Victoire", [["stock", "3 vies"], ["kills", "K.-O. au temps"]] as [Rule, string][], choice.rule, (v) => (choice.rule = v));
  chips(options, "Arène", arenas.map((a) => [a.id, a.name] as [string, string]), choice.arena?.id ?? "", (v) => (choice.arena = arenas.find((a) => a.id === v)), true);
  chips(options, "Bots", (Object.keys(BOT_LEVELS) as Level[]).map((l) => [l, LEVEL_NAMES[l]] as [Level, string]), choice.level, (v) => (choice.level = v));
  const start = h("button", "start", options);
  h("span", "start-kicker", start, "Prêts ?");
  h("span", "start-label", start, "COMBATTRE !");
  if (!teamsValid()) {
    start.disabled = true;
    start.title = "Il faut au moins un combattant dans chaque équipe";
  }
  start.addEventListener("click", startGame);

  drawCursors();

  const invalid = roster.filter((r) => !r.kit);
  if (invalid.length > 0) {
    const d = h("details", "invalid", bottom);
    h("summary", "", d, `${invalid.length} pack(s) refusé(s) par le validateur`);
    for (const r of invalid) {
      h("div", "invalid-name", d, `${r.character.name} — ${r.dir}${r.points !== undefined ? ` (${r.points.toFixed(1)} pts)` : ""}`);
      const ul = h("ul", "", d);
      for (const e of r.errors) h("li", "", ul, e);
    }
  }
}

/** The versus screen is on (the match starts when it ends). */
let versusOn = false;

/**
 * Versus screen, before every match: the fighters' figures sweep in from the sides on
 * their players' colours, « VS » slams down between them, then it all bursts away into
 * the arena. 1.9 s; a click, a key or A skips it.
 */
function versus(then: () => void): void {
  const slots = activeSlots();
  versusOn = true;
  const vs = document.createElement("div");
  vs.className = `versus n${slots.length}`;
  slots.forEach((sl, i) => {
    const side = h("div", "vs-side", vs);
    side.style.setProperty("--slot", colorOf(i));
    side.style.setProperty("--primary", sl.entry!.character.colors.primary);
    side.style.setProperty("--n", String(i));
    photo(h("img", "vs-photo", side), sl.entry!, "full");
    const tag = h("div", "vs-tag", side);
    h("div", "vs-player", tag, isHuman(i) ? `Joueur ${i + 1}` : `CPU ${i + 1}`);
    h("div", "vs-name", tag, sl.entry!.character.name);
  });
  h("div", "vs-mark", vs, "VS");
  h("div", "vs-flash", vs);
  document.body.append(vs);
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    vs.classList.add("out");
    then();
    window.removeEventListener("keydown", finish);
    setTimeout(() => {
      vs.remove();
      versusOn = false;
    }, 450);
  };
  vs.addEventListener("click", finish);
  window.addEventListener("keydown", finish);
  setTimeout(finish, 1900);
}

function startGame(): void {
  if (versusOn) return;
  ready.clear();
  const slots = activeSlots();
  if (slots.some((sl) => !sl.entry?.kit) || !teamsValid()) return;
  menuRoot.classList.add("hidden");
  versus(launch);
}

function launch(): void {
  const slots = activeSlots();
  menuRoot.classList.add("hidden");
  showcase?.dispose();
  showcase = null;
  game?.view.dispose();
  const config: BrawlConfig = {
    ...BRAWL_CONFIG,
    rule: choice.rule,
    stocks: 3,
    // « K.-O. au temps »: no cap, the clock decides. In a duel, 3 K.-O. still end it early.
    koToWin: choice.rule === "kills" && choice.count > 2 ? 0 : BRAWL_CONFIG.koToWin,
    timeLimit: choice.rule === "kills" && choice.count > 2 ? 180 : BRAWL_CONFIG.timeLimit,
  };
  const world = createMatch(
    slots.map((sl, i) => ({ kit: sl.entry!.kit!, team: teamOf(i) })),
    config,
    choice.arena && buildArena(choice.arena, propCatalog),
  );
  const characters = slots.map((sl) => sl.entry!.character);
  const colors = slots.map((_, i) => colorOf(i));
  const labels = slots.map((_, i) => shortLabel(i));
  const ctrls = slots.map((sl) => sl.ctrl);
  const humans = ctrls.flatMap((c, i) => (c !== "cpu" ? [i] : []));
  const focus = humans[0] ?? 0;
  // Several players on one screen, or more than two fighters: one shared camera.
  const shared = slots.length > 2 || humans.length > 1;
  const view = new ArenaView(renderer, world, characters, focus, library, { colors, labels, shared });
  const hud = new Hud(hudRoot, world, characters, focus, colors, { labels, humans, keyboard: ctrls.map((c) => c === "kb"), pads: input.connectedPads().length > 0 });
  const seed = rng((Math.random() * 2 ** 32) >>> 0);
  const bots = ctrls.map((c) => (c === "cpu" ? createBot(seed, BOT_LEVELS[choice.level]) : null));
  game = { world, view, hud, bots, ctrls, rumbleAt: 0, paused: false, names: characters.map((c) => c.name) };
  // Development aid (absent from builds): lets automated checks reach the match state.
  if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
  input.clear();
  hud.flash("COMBATTEZ !", 1.2);
}

function showEnd(g: Game): void {
  const w = g.world;
  const mine = w.fighters[g.ctrls.findIndex((c) => c !== "cpu")]?.team ?? -1;
  const humans = g.ctrls.filter((c) => c !== "cpu").length;
  // Several players: no « defeat » for whoever lost, just who won.
  const text = w.winner === null ? "ÉGALITÉ" : humans > 1 ? "VICTOIRE" : w.winner === mine ? "VICTOIRE" : "DÉFAITE";
  // Who won, named: a team colour, or the fighter.
  const winners = w.fighters.filter((f) => f.team === w.winner).map((f) => g.names[f.id]);
  const sub = w.winner === null ? "" : choice.mode === "teams" && choice.count > 2 ? `Équipe ${TEAM_NAMES[choice.slots[w.fighters.find((f) => f.team === w.winner)!.id]!.team]} : ${winners.join(", ")}` : `${winners.join(", ")} l'emporte`;
  g.hud.flash(text, 9999, sub);
  menuRoot.replaceChildren();
  menuRoot.className = "end";
  menuRoot.classList.remove("hidden");
  // The winner's figure, large, sliding in.
  const champ = w.winner === null ? -1 : w.fighters.findIndex((f) => f.team === w.winner);
  const entry = champ >= 0 ? choice.slots[champ]?.entry : undefined;
  if (entry) {
    const hero = h("div", "end-hero", menuRoot);
    hero.style.setProperty("--slot", colorOf(champ));
    hero.style.setProperty("--primary", entry.character.colors.primary);
    photo(h("img", "end-photo", hero), entry, "full");
  }
  const box = h("div", "end-box", menuRoot);
  const teams = [...new Set(w.fighters.map((f) => f.team))];
  const line = teams
    .map((t) => {
      const who = w.fighters.filter((f) => f.team === t).map((f) => g.names[f.id]).join(" + ");
      return `${who} : ${w.score[t] ?? 0} K.-O.`;
    })
    .join(" · ");
  h("div", "end-score", box, `${line} · ${Math.round(w.time)} s`);
  const again = h("button", "start", box, "REVANCHE");
  again.addEventListener("click", startGame);
  const back = h("button", "chip", box, "Changer de combattants");
  back.addEventListener("click", quitMatch);
  h("div", "pause-hint", box, "Manette : A revanche · B changer de combattants");
}

/** Gamepads rumble on hits: hard for the one hit, lighter for the one hitting. */
function rumbles(g: Game): void {
  const w = g.world;
  for (const e of w.events.slice(g.rumbleAt)) {
    if (e.type === "hit" || e.type === "block" || e.type === "guardBreak") {
      const big = e.type === "guardBreak" || (e.type === "hit" && (e.knockdown || e.by === "heavy" || e.by === "special"));
      input.rumble(g.ctrls[e.target]!, big ? 0.9 : 0.5, big ? 220 : 110);
      if (e.type === "hit") input.rumble(g.ctrls[e.source]!, 0.3, 70);
    }
    if (e.type === "ko") input.rumble(g.ctrls[e.target]!, 1, 450);
  }
  g.rumbleAt = w.events.length;
}

function togglePause(g: Game): void {
  if (g.world.over) return;
  g.paused = !g.paused;
  if (g.paused) {
    pauseFocus = 0;
    showPause(g);
  } else {
    // Back to the fight: the command list goes away with the pause menu.
    g.hud.showHelp(false);
    menuRoot.classList.add("hidden");
  }
}

// ---------------------------------------------------------------------------
// Gamepads in the menus, Smash-style: on the select screen each gamepad moves its own
// token over the fighters (A picks, X gives the fighter to a bot, Y changes team) and
// can go down into the options (one highlighted button, A presses it). Start launches.

interface Cursor {
  zone: "grid" | "options";
  i: number;
}
const cursors = new Map<number, Cursor>();
/** Slots whose player has picked (« PRÊT »). */
const ready = new Set<number>();
/** Next bot slot to receive a fighter given with X. */
let giveTo = 0;

function gridColumns(): number {
  const cards = [...document.querySelectorAll<HTMLElement>(".roster .card")];
  if (!cards.length) return 1;
  const top = cards[0]!.offsetTop;
  return Math.max(1, cards.filter((c) => c.offsetTop === top).length);
}
const optionButtons = () => [...document.querySelectorAll<HTMLButtonElement>(".options button")];
/** Row of each option button (its option group, or the start button on its own). */
function optionRows(): HTMLButtonElement[][] {
  const rows: HTMLButtonElement[][] = [];
  for (const el of document.querySelectorAll<HTMLElement>(".options > *")) {
    const btns = el.matches("button") ? [el as HTMLButtonElement] : [...el.querySelectorAll<HTMLButtonElement>("button")];
    if (btns.length) rows.push(btns);
  }
  return rows;
}

function moveCursor(c: Cursor, dir: "left" | "right" | "up" | "down"): void {
  if (c.zone === "grid") {
    const cols = gridColumns();
    const n = playable.length;
    if (dir === "left") c.i = (c.i - 1 + n) % n;
    if (dir === "right") c.i = (c.i + 1) % n;
    if (dir === "up") c.i = Math.max(0, c.i - cols);
    if (dir === "down") {
      if (c.i + cols < n) c.i += cols;
      else if (Math.floor(c.i / cols) === Math.floor((n - 1) / cols)) [c.zone, c.i] = ["options", 0]; // past the last row: options
      else c.i = n - 1;
    }
    return;
  }
  const rows = optionRows();
  const all = optionButtons();
  const btn = all[c.i];
  const r = Math.max(0, rows.findIndex((row) => btn && row.includes(btn)));
  const at = btn ? rows[r]!.indexOf(btn) : 0;
  if (dir === "left") c.i = Math.max(0, c.i - 1);
  if (dir === "right") c.i = Math.min(all.length - 1, c.i + 1);
  if (dir === "down" && r + 1 < rows.length) c.i = all.indexOf(rows[r + 1]![Math.min(at, rows[r + 1]!.length - 1)]!);
  if (dir === "up") {
    if (r === 0) [c.zone, c.i] = ["grid", Math.max(0, playable.length - 1)];
    else c.i = all.indexOf(rows[r - 1]![Math.min(at, rows[r - 1]!.length - 1)]!);
  }
}

/** Draws the gamepad tokens on the cards and the highlighted option buttons (after showMenu). */
function drawCursors(): void {
  const cards = [...document.querySelectorAll<HTMLElement>(".roster .card")];
  const buttons = optionButtons();
  for (const [pad, c] of cursors) {
    const slot = activeSlots().findIndex((sl) => sl.ctrl === ctrlOf(pad));
    if (slot < 0) continue;
    const color = colorOf(slot);
    if (c.zone === "grid") {
      const card = cards[c.i];
      if (!card) continue;
      const t = h("span", "pad-cursor", card, shortLabel(slot));
      t.style.background = color;
      card.classList.add("hovered");
    } else {
      const b = buttons[c.i];
      if (!b) continue;
      b.classList.add("pad-focus");
      b.style.setProperty("--focus", color);
    }
  }
}

function padSelect(pad: number, button: MenuButton): boolean {
  const ctrl = ctrlOf(pad);
  let mine = activeSlots().findIndex((sl) => sl.ctrl === ctrl);
  let c = cursors.get(pad);
  if (button === "start") {
    startGame();
    return false;
  }
  if (mine < 0 || !c) {
    // Not playing yet: A joins, with the token on the fighter of the slot taken.
    if (button !== "a") return false;
    mine = joinPad(pad) ?? -1;
    if (mine < 0) return false;
    const entry = choice.slots[mine]!.entry;
    cursors.set(pad, { zone: "grid", i: Math.max(0, entry ? playable.indexOf(entry) : 0) });
    return true;
  }
  const sl = choice.slots[mine]!;
  switch (button) {
    case "left":
    case "right":
    case "up":
    case "down":
      moveCursor(c, button);
      return false;
    case "a":
      if (c.zone === "options") {
        optionButtons()[c.i]?.click();
        return false;
      }
      sl.entry = playable[c.i];
      ready.add(mine);
      return true;
    case "x": {
      // Give the fighter under the token to a bot (in turn).
      const bots = activeSlots().flatMap((s2, k) => (s2.ctrl === "cpu" ? [k] : []));
      if (c.zone !== "grid" || !bots.length) return false;
      const k = bots[giveTo++ % bots.length]!;
      choice.slots[k]!.entry = playable[c.i];
      return true;
    }
    case "y":
      if (choice.mode !== "teams") return false;
      sl.team = 1 - sl.team;
      return true;
    case "b":
      if (ready.has(mine)) ready.delete(mine);
      else {
        // Leave: the slot goes back to a bot (or to the keyboard for player 1).
        sl.ctrl = mine === 0 ? "kb" : "cpu";
        cursors.delete(pad);
      }
      return true;
    default:
      return false;
  }
}

/** Pause menu: resume, help, quit — mouse, keyboard or gamepad. */
let pauseFocus = 0;
function showPause(g: Game): void {
  menuRoot.replaceChildren();
  menuRoot.className = "pause";
  menuRoot.classList.remove("hidden");
  const box = h("div", "pause-box", menuRoot);
  h("div", "pause-title", box, "PAUSE");
  const items: [string, () => void][] = [
    ["Reprendre", () => togglePause(g)],
    ["Aide (commandes)", () => g.hud.toggleHelp()],
    ["Quitter le combat", () => quitMatch()],
  ];
  items.forEach(([label, act], i) => {
    const b = h("button", `pause-item${i === pauseFocus ? " pad-focus" : ""}`, box, label);
    b.addEventListener("click", act);
  });
  h("div", "pause-hint", box, "Manette : ↑/↓ puis A · B ou Start pour reprendre");
}

function quitMatch(): void {
  game?.view.dispose();
  game = null;
  menuIntro = true;
  buildShowcase();
  showMenu();
}

/** Gamepad buttons outside the fight: select screen, pause menu, end screen. */
let padSignature = "";

function padMenus(): void {
  const g = game;
  // A gamepad plugged in or out: the select screen says so at once.
  const st = input.padStatus();
  const sig = st.blocked + st.pads.map((p) => p.slot + p.id).join("|");
  if (sig !== padSignature) {
    padSignature = sig;
    if (!g && menuRoot.className.startsWith("select")) showMenu();
  }
  const fighting = !!g && !g.world.over && !g.paused;
  const presses = input.menuPresses(fighting);
  let redraw = false;
  let reshow = false;
  for (const { pad, button } of presses) {
    if (g && !g.world.over) {
      if (!g.paused) {
        if (button === "start") togglePause(g);
        continue;
      }
      // Paused: navigate the pause menu.
      if (button === "start" || button === "b") togglePause(g);
      else if (button === "up" || button === "down") {
        pauseFocus = (pauseFocus + (button === "down" ? 1 : 2)) % 3;
        showPause(g);
      } else if (button === "a") (document.querySelectorAll<HTMLButtonElement>(".pause-item")[pauseFocus])?.click();
      continue;
    }
    if (g && g.world.over) {
      // End screen: A or Start for a rematch, B back to the select screen.
      if (button === "a" || button === "start") startGame();
      else if (button === "b") quitMatch();
      return;
    }
    if (!game && !versusOn && menuRoot.className.startsWith("select")) {
      const picked = padSelect(pad, button);
      if (game) return; // Start launched the match
      reshow = true;
      redraw ||= picked;
    }
  }
  if (redraw) buildShowcase();
  if (reshow) showMenu();
}

input.onKey = (code) => {
  if (!game || game.world.over) return;
  if (code === "Escape") togglePause(game);
};

window.addEventListener("resize", () => {
  game?.view.resize();
  showcase?.resize();
});

/**
 * Game tempo: share of real time the fixed-step simulation runs at. Everything scales
 * together, so balance is unchanged. Back to 1 with rhythm v3 (decision 0011), whose
 * slower numbers already calm the fight; kept as a single knob to try other tempos.
 */
const GAME_SPEED = 1;

let last = performance.now();
let acc = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.poll();
  padMenus();
  const g = game;
  if (g && !g.paused && !g.world.over) {
    const tick = 1 / g.world.config.tickRate;
    // Slow motion after a K.-O.: the simulation simply advances slower.
    acc += dt * GAME_SPEED * g.view.timeScale();
    while (acc >= tick && !g.world.over) {
      acc -= tick;
      g.view.capture();
      const w = g.world;
      const fwd = g.view.forward();
      step(
        w,
        w.fighters.map((f, i) => {
          const bot = g.bots[i];
          return bot ? botCommand(w, f, bot) : input.command(i, g.ctrls[i]!, fwd);
        }),
      );
    }
    rumbles(g);
    g.hud.update(g.names);
    if (g.world.over) showEnd(g);
  }
  if (g) g.view.render(dt * (g.paused ? 0 : GAME_SPEED * g.view.timeScale()), g.paused ? 1 : acc / (1 / g.world.config.tickRate));
  else if (showcase) showcase.showcase(dt);
  else renderer.clear();
  requestAnimationFrame(frame);
}

async function boot(): Promise<void> {
  const loading = h("div", "loading", menuRoot);
  h("div", "logo", loading, "MYTHIC MAYHEM");
  const bar = h("div", "loading-bar", loading);
  const fill = h("div", "loading-fill", bar);
  const label = h("div", "loading-label", loading, "Chargement des combattants…");
  // The village's photo textures, alongside (painted ones stand in for any that fail).
  const photos = loadPhotoTextures(new URL("assets/textures/", document.baseURI).href);
  try {
    library = await loadModels(new URL("models/", document.baseURI).href, (done, total) => {
      fill.style.width = `${(100 * done) / total}%`;
    });
  } catch (e) {
    // The game stays playable with simple shapes if the models cannot load.
    label.textContent = `Modèles 3D indisponibles : affichage simplifié. (${e instanceof Error ? e.message : String(e)})`;
    console.error(e);
    await new Promise((r) => setTimeout(r, 4000));
  }
  await photos;
  if (library) {
    studio = new PortraitStudio(library);
    if (import.meta.env.DEV) (window as unknown as { __studio: PortraitStudio }).__studio = studio;
    // Busts for the roster first, then the full figures, rendered in the background.
    for (const r of playable) void studio.get(r.dir, r.character, r.kit!, "bust");
    for (const r of playable) void studio.get(r.dir, r.character, r.kit!, "full");
  }
  buildShowcase();
  showMenu();
}

requestAnimationFrame(frame);
void boot();
