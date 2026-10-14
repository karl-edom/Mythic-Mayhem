// Browser entry: fighter select menu, then a 1v1 against a bot.
// Fixed-step simulation (60 Hz) driven by commands; rendering only reads it.

import { rng } from "../sim/math.ts";
import { BOT_LEVELS, botCommand, createBot, type BrawlBot } from "../brawl/bot.ts";
import { buildArena, type ArenaDef } from "../brawl/arena.ts";
import { createDuel, step, type BrawlWorld } from "../brawl/world.ts";
import { Hud } from "./hud.ts";
import { Input } from "./input.ts";
import { loadArenaDefs, loadRoster, propCatalog, type RosterEntry } from "./roster.ts";
import { ArenaView, createRenderer } from "./scene.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#view")!;
const hudRoot = document.querySelector<HTMLDivElement>("#hud")!;
const menuRoot = document.querySelector<HTMLDivElement>("#menu")!;
const renderer = createRenderer(canvas);
const input = new Input(window);
const roster = loadRoster();
const playable = roster.filter((r) => r.kit);
const arenas = loadArenaDefs();

type Level = keyof typeof BOT_LEVELS;
const choice = {
  p1: playable[0],
  p2: playable[1] ?? playable[0],
  level: "normal" as Level,
  arena: arenas[0] as ArenaDef | undefined,
};

interface Game {
  world: BrawlWorld;
  view: ArenaView;
  hud: Hud;
  bot: BrawlBot;
  paused: boolean;
  names: string[];
}
let game: Game | null = null;

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent.appendChild(e);
  return e;
}

function fighterCard(r: RosterEntry, parent: HTMLElement, selected: boolean, onPick: () => void): void {
  const card = h("button", `card${selected ? " selected" : ""}`, parent);
  card.style.setProperty("--primary", r.character.colors.primary);
  card.style.setProperty("--secondary", r.character.colors.secondary);
  h("div", "swatch", card);
  h("div", "card-name", card, r.character.name);
  h("div", "card-universe", card, r.character.universe + (r.local ? " · pack local" : ""));
  h("div", "card-desc", card, r.character.description);
  if (r.kit) h("div", "card-kit", card, `${r.kit.archetype} · ${r.kit.light.hits.length} coups · ${r.kit.specials.map((s) => s.id).join(", ")}`);
  card.addEventListener("click", onPick);
}

function showMenu(): void {
  hudRoot.replaceChildren();
  menuRoot.replaceChildren();
  menuRoot.classList.remove("hidden");
  const box = h("div", "menu-box", menuRoot);
  h("h1", "title", box, "Mythic Mayhem");
  h("p", "subtitle", box, "Arène 1 contre 1 — choisis ton combattant et ton adversaire");
  if (playable.length === 0) {
    h("p", "error", box, "Aucun combattant valide trouvé.");
    return;
  }
  const cols = h("div", "columns", box);
  for (const side of ["p1", "p2"] as const) {
    const col = h("div", "column", cols);
    h("h2", "", col, side === "p1" ? "Toi" : "Adversaire (bot)");
    const grid = h("div", "grid", col);
    for (const r of playable)
      fighterCard(r, grid, choice[side] === r, () => {
        choice[side] = r;
        showMenu();
      });
  }
  const arenaRow = h("div", "levels", box);
  h("span", "", arenaRow, "Arène :");
  for (const a of arenas) {
    const b = h("button", `pill${choice.arena === a ? " selected" : ""}`, arenaRow, `${a.name} · ${a.width}×${a.depth} m`);
    b.addEventListener("click", () => {
      choice.arena = a;
      showMenu();
    });
  }
  const levels = h("div", "levels", box);
  h("span", "", levels, "Niveau du bot :");
  for (const l of Object.keys(BOT_LEVELS) as Level[]) {
    const b = h("button", `pill${choice.level === l ? " selected" : ""}`, levels, l);
    b.addEventListener("click", () => {
      choice.level = l;
      showMenu();
    });
  }
  const start = h("button", "start", box, "Combattre !");
  start.addEventListener("click", startGame);

  const invalid = roster.filter((r) => !r.kit);
  if (invalid.length > 0) {
    const d = h("details", "invalid", box);
    h("summary", "", d, `${invalid.length} pack(s) refusé(s) par le validateur`);
    for (const r of invalid) {
      h("div", "invalid-name", d, `${r.character.name} — ${r.dir}${r.points !== undefined ? ` (${r.points.toFixed(1)} pts)` : ""}`);
      const ul = h("ul", "", d);
      for (const e of r.errors) h("li", "", ul, e);
    }
  }
  h("p", "hint", box, "Tes personnages : dépose un dossier avec character.json et kit.json dans packs/local/ (voir docs/design/fan-packs.md).");
}

function startGame(): void {
  if (!choice.p1?.kit || !choice.p2?.kit) return;
  menuRoot.classList.add("hidden");
  game?.view.dispose();
  const world = createDuel(choice.p1.kit, choice.p2.kit, undefined, choice.arena && buildArena(choice.arena, propCatalog));
  const characters = [choice.p1.character, choice.p2.character];
  const view = new ArenaView(renderer, world, characters, 0);
  const hud = new Hud(hudRoot, world, characters, 0);
  const bot = createBot(rng((Math.random() * 2 ** 32) >>> 0), BOT_LEVELS[choice.level]);
  game = { world, view, hud, bot, paused: false, names: characters.map((c) => c.name) };
  input.clear();
  hud.flash("Combattez !", 1.2);
}

function showEnd(g: Game): void {
  const w = g.world;
  const text = w.winner === null ? "Égalité !" : w.winner === 0 ? "Victoire !" : "Défaite…";
  g.hud.flash(text, 9999);
  menuRoot.replaceChildren();
  menuRoot.classList.remove("hidden");
  const box = h("div", "menu-box end", menuRoot);
  h("h1", "title", box, text);
  h("p", "subtitle", box, `K.-O. : ${w.score[0]} – ${w.score[1]} · ${Math.round(w.time)} s`);
  const again = h("button", "start", box, "Revanche");
  again.addEventListener("click", startGame);
  const back = h("button", "pill", box, "Changer de combattants");
  back.addEventListener("click", () => {
    game?.view.dispose();
    game = null;
    showMenu();
  });
}

input.onKey = (code) => {
  if (!game || game.world.over) return;
  if (code === "Escape") {
    game.paused = !game.paused;
    game.hud.flash(game.paused ? "Pause" : "", game.paused ? 9999 : 0);
  }
  if (code === "KeyH") game.hud.toggleHelp();
};

window.addEventListener("resize", () => game?.view.resize());

let last = performance.now();
let acc = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.poll();
  const g = game;
  if (g && !g.paused && !g.world.over) {
    const tick = 1 / g.world.config.tickRate;
    acc += dt;
    while (acc >= tick && !g.world.over) {
      acc -= tick;
      const me = input.command(0, g.view.forward());
      step(g.world, [me, botCommand(g.world, g.world.fighters[1]!, g.bot)]);
    }
    g.hud.update(g.names);
    if (g.world.over) showEnd(g);
  }
  if (g) g.view.render(dt);
  else renderer.clear();
  requestAnimationFrame(frame);
}

showMenu();
requestAnimationFrame(frame);
