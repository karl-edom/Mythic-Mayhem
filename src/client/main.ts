// Browser entry: loading screen, fighter select (with a live 3D showcase of
// the chosen fighters in the chosen arena), then a 1v1 against a bot.
// Fixed-step simulation (60 Hz) driven by commands; rendering only reads it.

import { rng } from "../sim/math.ts";
import { BOT_LEVELS, botCommand, createBot, type BrawlBot } from "../brawl/bot.ts";
import { buildArena, type ArenaDef } from "../brawl/arena.ts";
import { createBrawl, createDuel, step, type BrawlWorld } from "../brawl/world.ts";
import { Hud } from "./hud.ts";
import { Input } from "./input.ts";
import { loadModels, type ModelLibrary } from "./models.ts";
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
let library: ModelLibrary | null = null;

type Level = keyof typeof BOT_LEVELS;
const LEVEL_NAMES: Record<Level, string> = { facile: "Facile", normal: "Normal", difficile: "Difficile" };
const choice = {
  p1: playable[0],
  p2: playable[1] ?? playable[0],
  level: "normal" as Level,
  arena: arenas[0] as ArenaDef | undefined,
  /** Which slot the next card click fills. */
  slot: "p1" as "p1" | "p2",
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
/** Menu backdrop: the two chosen fighters idling in the chosen arena. */
let showcase: ArenaView | null = null;

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
  if (!choice.p1?.kit || !choice.p2?.kit) return;
  const arena = choice.arena ? buildArena(choice.arena, propCatalog) : undefined;
  const s = arena?.def.spawns[0] ?? { x: 0, z: 7 };
  // Side by side on the first spawn point, facing the middle of the arena (the camera).
  const len = Math.hypot(s.x, s.z) || 1;
  const d = { x: -s.x / len, z: -s.z / len };
  const side = { x: -d.z, z: d.x };
  const world = createBrawl(
    [
      // Player 1 on the screen's left (the camera faces the fighters, so that is +side).
      { kit: choice.p1.kit, team: 0, pos: { x: s.x + side.x * 1.3, y: 0, z: s.z + side.z * 1.3 } },
      { kit: choice.p2.kit, team: 1, pos: { x: s.x - side.x * 1.3, y: 0, z: s.z - side.z * 1.3 } },
    ],
    undefined,
    arena,
  );
  for (const f of world.fighters) f.facing = { x: d.x, y: 0, z: d.z };
  showcase = new ArenaView(renderer, world, [choice.p1.character, choice.p2.character], 0, library);
  showcase.showcaseAt({ x: s.x, z: s.z }, d);
  if (import.meta.env.DEV) (window as unknown as { __showcase: ArenaView }).__showcase = showcase;
}

function fighterCard(r: RosterEntry, parent: HTMLElement): void {
  const tags = [choice.p1 === r ? "p1" : "", choice.p2 === r ? "p2" : ""].filter(Boolean);
  const card = h("button", `card ${tags.join(" ")}`, parent);
  card.style.setProperty("--primary", r.character.colors.primary);
  card.style.setProperty("--secondary", r.character.colors.secondary);
  const emblem = h("div", "emblem", card, r.character.name.slice(0, 1).toUpperCase());
  emblem.setAttribute("aria-hidden", "true");
  h("div", "card-name", card, r.character.name);
  h("div", "card-universe", card, r.character.universe + (r.local ? " · pack local" : ""));
  for (const t of tags) h("span", `slot-tag ${t}`, card, t === "p1" ? "J1" : "CPU");
  card.addEventListener("click", () => {
    choice[choice.slot] = r;
    choice.slot = choice.slot === "p1" ? "p2" : "p1";
    buildShowcase();
    showMenu();
  });
}

function plate(r: RosterEntry | undefined, side: "left" | "right", label: string, active: boolean): HTMLElement {
  const p = document.createElement("button");
  p.className = `plate ${side}${active ? " active" : ""}`;
  if (!r) return p;
  p.style.setProperty("--primary", r.character.colors.primary);
  p.style.setProperty("--secondary", r.character.colors.secondary);
  h("div", "plate-label", p, label);
  h("div", "plate-name", p, r.character.name);
  h("div", "plate-desc", p, r.character.description);
  if (r.kit) h("div", "plate-kit", p, `${r.kit.archetype} · ${r.kit.light.hits.length} coups · ${r.kit.specials.map((s) => s.id).join(" · ")}`);
  p.addEventListener("click", () => {
    choice.slot = side === "left" ? "p1" : "p2";
    showMenu();
  });
  return p;
}

function showMenu(): void {
  hudRoot.replaceChildren();
  menuRoot.replaceChildren();
  menuRoot.classList.remove("hidden");
  menuRoot.className = "select";
  const top = h("header", "select-top", menuRoot);
  h("div", "logo", top, "MYTHIC MAYHEM");
  h("div", "logo-sub", top, "Choisis ton combattant");
  if (playable.length === 0) {
    h("p", "error", menuRoot, "Aucun combattant valide trouvé.");
    return;
  }
  const stage = h("div", "select-stage", menuRoot);
  stage.append(plate(choice.p1, "left", "JOUEUR 1", choice.slot === "p1"), plate(choice.p2, "right", "ADVERSAIRE · CPU", choice.slot === "p2"));

  const bottom = h("div", "select-bottom", menuRoot);
  const hint = h("div", "select-hint", bottom, choice.slot === "p1" ? "Clique un personnage pour le Joueur 1" : "Clique un personnage pour l'adversaire");
  hint.setAttribute("role", "status");
  const grid = h("div", "roster", bottom);
  for (const r of playable) fighterCard(r, grid);

  const options = h("div", "options", bottom);
  const arenaGroup = h("div", "option-group", options);
  h("span", "option-label", arenaGroup, "Arène");
  for (const a of arenas) {
    const b = h("button", `chip${choice.arena === a ? " selected" : ""}`, arenaGroup, a.name);
    b.addEventListener("click", () => {
      choice.arena = a;
      buildShowcase();
      showMenu();
    });
  }
  const levelGroup = h("div", "option-group", options);
  h("span", "option-label", levelGroup, "Bot");
  for (const l of Object.keys(BOT_LEVELS) as Level[]) {
    const b = h("button", `chip${choice.level === l ? " selected" : ""}`, levelGroup, LEVEL_NAMES[l]);
    b.addEventListener("click", () => {
      choice.level = l;
      showMenu();
    });
  }
  const start = h("button", "start", options, "COMBATTRE");
  start.addEventListener("click", startGame);

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

function startGame(): void {
  if (!choice.p1?.kit || !choice.p2?.kit) return;
  menuRoot.classList.add("hidden");
  showcase?.dispose();
  showcase = null;
  game?.view.dispose();
  const world = createDuel(choice.p1.kit, choice.p2.kit, undefined, choice.arena && buildArena(choice.arena, propCatalog));
  const characters = [choice.p1.character, choice.p2.character];
  const view = new ArenaView(renderer, world, characters, 0, library);
  const hud = new Hud(hudRoot, world, characters, 0);
  const bot = createBot(rng((Math.random() * 2 ** 32) >>> 0), BOT_LEVELS[choice.level]);
  game = { world, view, hud, bot, paused: false, names: characters.map((c) => c.name) };
  // Development aid (absent from builds): lets automated checks reach the match state.
  if (import.meta.env.DEV) (window as unknown as { __game: Game }).__game = game;
  input.clear();
  hud.flash("COMBATTEZ !", 1.2);
}

function showEnd(g: Game): void {
  const w = g.world;
  const text = w.winner === null ? "ÉGALITÉ" : w.winner === 0 ? "VICTOIRE" : "DÉFAITE";
  g.hud.flash(text, 9999);
  menuRoot.replaceChildren();
  menuRoot.className = "end";
  menuRoot.classList.remove("hidden");
  const box = h("div", "end-box", menuRoot);
  h("div", "end-score", box, `K.-O. ${w.score[0]} – ${w.score[1]} · ${Math.round(w.time)} s`);
  const again = h("button", "start", box, "REVANCHE");
  again.addEventListener("click", startGame);
  const back = h("button", "chip", box, "Changer de combattants");
  back.addEventListener("click", () => {
    game?.view.dispose();
    game = null;
    buildShowcase();
    showMenu();
  });
}

input.onKey = (code) => {
  if (!game || game.world.over) return;
  if (code === "Escape") {
    game.paused = !game.paused;
    game.hud.flash(game.paused ? "PAUSE" : "", game.paused ? 9999 : 0);
  }
  if (code === "KeyH") game.hud.toggleHelp();
};

window.addEventListener("resize", () => {
  game?.view.resize();
  showcase?.resize();
});

let last = performance.now();
let acc = 0;
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  input.poll();
  const g = game;
  if (g && !g.paused && !g.world.over) {
    const tick = 1 / g.world.config.tickRate;
    // Slow motion after a K.-O.: the simulation simply advances slower.
    acc += dt * g.view.timeScale();
    while (acc >= tick && !g.world.over) {
      acc -= tick;
      const me = input.command(0, g.view.forward());
      step(g.world, [me, botCommand(g.world, g.world.fighters[1]!, g.bot)]);
    }
    g.hud.update(g.names);
    if (g.world.over) showEnd(g);
  }
  if (g) g.view.render(dt * (g.paused ? 0 : g.view.timeScale()));
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
  buildShowcase();
  showMenu();
}

requestAnimationFrame(frame);
void boot();
