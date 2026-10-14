// HTML overlay: health, energy, victory gauge, timer, specials, messages.
// Built with textContent only: names from fan packs are never parsed as HTML.

import type { Character } from "../brawl/character.ts";
import { canSee, grabbable, type BrawlWorld } from "../brawl/world.ts";
import { KEY_HELP } from "./input.ts";

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: HTMLElement, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.className = cls;
  if (text !== undefined) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

interface Side {
  hp: HTMLDivElement;
  hpLag: HTMLDivElement;
  energy: HTMLDivElement;
  specials: HTMLDivElement[];
  pips: HTMLDivElement[];
}

const SPECIAL_KEYS = ["U", "I", "O"];

export class Hud {
  private sides: Side[] = [];
  private timer: HTMLDivElement;
  private banner: HTMLDivElement;
  private help: HTMLDivElement;
  private lastEvent = 0;
  private bannerUntil = 0;
  private hidden: HTMLSpanElement | null = null;
  private prompt: HTMLDivElement;
  private player: number;

  private world: BrawlWorld;

  constructor(root: HTMLElement, world: BrawlWorld, characters: Character[], player: number) {
    this.world = world;
    this.player = player;
    root.replaceChildren();
    const top = el("div", "hud-top", root);
    world.fighters.forEach((f, i) => {
      const ch = characters[i]!;
      const panel = el("div", `hud-panel ${i === 0 ? "left" : "right"}`, top);
      panel.style.setProperty("--primary", ch.colors.primary);
      panel.style.setProperty("--secondary", ch.colors.secondary);
      const title = el("div", "hud-name", panel, ch.name);
      el("span", "hud-tag", title, i === player ? "Toi" : "Bot");
      if (i === player) this.hidden = el("span", "hud-tag hidden-tag", title, "Hors de vue");
      el("div", "hud-universe", panel, ch.universe);
      const hpBar = el("div", "bar hp", panel);
      const hpLag = el("div", "fill lag", hpBar);
      const hp = el("div", "fill", hpBar);
      const enBar = el("div", "bar energy", panel);
      const energy = el("div", "fill", enBar);
      for (const sp of f.kit.specials) {
        const mark = el("div", "cost-mark", enBar);
        mark.style.left = `${sp.energyCost}%`;
      }
      const specials = el("div", "hud-specials", panel);
      const specialEls = f.kit.specials.map((sp, s) =>
        el("div", "special", specials, `${i === player ? SPECIAL_KEYS[s] + " · " : ""}${sp.id} (${sp.energyCost})`),
      );
      if (i === 0) top.appendChild(this.center());
      this.sides.push({ hp, hpLag, energy, specials: specialEls, pips: [] });
    });
    this.timer = root.querySelector(".hud-timer")!;
    this.sides.forEach((s, i) => {
      const box = root.querySelectorAll<HTMLDivElement>(".pips")[i]!;
      for (let k = 0; k < this.world.config.koToWin; k++) s.pips.push(el("div", "pip", box));
    });
    this.banner = el("div", "hud-banner", root);
    this.prompt = el("div", "hud-prompt", root);
    this.help = el("div", "hud-help", root);
    for (const [k, v] of KEY_HELP) {
      const row = el("div", "row", this.help);
      el("b", "", row, k);
      el("span", "", row, v);
    }
  }

  private center(): HTMLDivElement {
    const c = document.createElement("div");
    c.className = "hud-center";
    el("div", "pips left", c);
    el("div", "hud-timer", c);
    el("div", "pips right", c);
    return c;
  }

  toggleHelp(): void {
    this.help.classList.toggle("hidden");
  }

  flash(text: string, seconds = 1.2): void {
    this.banner.textContent = text;
    this.banner.classList.add("show");
    this.bannerUntil = performance.now() + seconds * 1000;
  }

  update(names: string[]): void {
    const w = this.world;
    w.fighters.forEach((f, i) => {
      const s = this.sides[i]!;
      const hp = f.alive ? (100 * f.hp) / f.kit.stats.hp : 0;
      s.hp.style.width = `${hp}%`;
      const lag = parseFloat(s.hpLag.style.width || "100");
      s.hpLag.style.width = `${Math.max(hp, lag - 0.6)}%`;
      s.energy.style.width = `${(100 * f.energy) / w.config.energyMax}%`;
      f.kit.specials.forEach((sp, k) => s.specials[k]!.classList.toggle("ready", f.alive && f.energy >= sp.energyCost));
      s.pips.forEach((p, k) => p.classList.toggle("on", k < (w.score[i] ?? 0)));
    });
    // Readability cue for hiding: the player knows when the opponent cannot see them.
    const me = w.fighters[this.player]!;
    const foe = w.fighters.find((f) => f.team !== me.team);
    this.hidden?.classList.toggle("on", !!foe && me.alive && foe.alive && !canSee(w, me, foe));
    // Contextual prompt: what the grab button does right now.
    const prompt = !me.alive ? "" : me.carrying !== null ? "F · lancer" : grabbable(w, me) && !me.action ? "F · ramasser" : "";
    this.prompt.textContent = prompt;
    this.prompt.classList.toggle("show", prompt !== "");
    const left = Math.max(0, w.config.timeLimit - w.time);
    this.timer.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;

    for (const e of w.events.slice(this.lastEvent)) {
      if (e.type === "ko") this.flash(`K.-O. ! ${names[e.target]} est à terre`);
      if (e.type === "guardBreak") this.flash("Garde brisée !", 0.6);
      if (e.type === "slam") this.flash("Contre le mur !", 0.6);
    }
    this.lastEvent = w.events.length;
    if (performance.now() > this.bannerUntil && !w.over) this.banner.classList.remove("show");
  }
}
