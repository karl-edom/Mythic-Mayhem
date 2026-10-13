// HTML overlay: health, energy, victory gauge, timer, specials, messages.
// Built with textContent only: names from fan packs are never parsed as HTML.

import type { Character } from "../brawl/character.ts";
import type { BrawlWorld } from "../brawl/world.ts";
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

  private world: BrawlWorld;

  constructor(root: HTMLElement, world: BrawlWorld, characters: Character[], player: number) {
    this.world = world;
    root.replaceChildren();
    const top = el("div", "hud-top", root);
    world.fighters.forEach((f, i) => {
      const ch = characters[i]!;
      const panel = el("div", `hud-panel ${i === 0 ? "left" : "right"}`, top);
      panel.style.setProperty("--primary", ch.colors.primary);
      panel.style.setProperty("--secondary", ch.colors.secondary);
      const title = el("div", "hud-name", panel, ch.name);
      el("span", "hud-tag", title, i === player ? "Toi" : "Bot");
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
    const left = Math.max(0, w.config.timeLimit - w.time);
    this.timer.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;

    for (const e of w.events.slice(this.lastEvent)) {
      if (e.type === "ko") this.flash(`K.-O. ! ${names[e.target]} est à terre`);
      if (e.type === "guardBreak") this.flash("Garde brisée !", 0.6);
    }
    this.lastEvent = w.events.length;
    if (performance.now() > this.bannerUntil && !w.over) this.banner.classList.remove("show");
  }
}
