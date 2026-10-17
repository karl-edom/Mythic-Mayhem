// HTML overlay: health, energy, victory gauge, timer, specials, messages.
// Built with textContent only: names from fan packs are never parsed as HTML.

import type { Character } from "../brawl/character.ts";
import { canSee, dodgeStaleNow, grabbable, lockTarget, type BrawlWorld } from "../brawl/world.ts";
import { KEY_HELP, PAD_HELP } from "./input.ts";

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
  breaker: HTMLDivElement | null;
  dodge: HTMLDivElement | null;
  pips: HTMLDivElement[];
  /** K.-O. count, when there are no pips to fill (« K.-O. au temps » with no cap). */
  count: HTMLDivElement | null;
  panel: HTMLDivElement;
  pipBox: HTMLDivElement | null;
}

const SPECIAL_KEYS = ["U", "I", "O"];
const PAD_SPECIALS = ["B", "B+stick", "LT"];

export class Hud {
  private sides: Side[] = [];
  private timer: HTMLDivElement;
  private banner: HTMLDivElement;
  private help: HTMLDivElement;
  private lastEvent = 0;
  private bannerUntil = 0;
  private hidden: HTMLSpanElement | null = null;
  private prompt: HTMLDivElement;
  private combo: HTMLDivElement;
  private comboCount = 0;
  private comboUntil = 0;
  private player: number;

  private world: BrawlWorld;

  constructor(
    root: HTMLElement,
    world: BrawlWorld,
    characters: Character[],
    player: number,
    colors: string[] = [],
    opts: { labels?: string[]; humans?: number[]; keyboard?: boolean[]; pads?: boolean } = {},
  ) {
    this.world = world;
    this.player = player;
    const humans = opts.humans ?? [player];
    const human = (i: number) => humans.includes(i);
    /** Button hints for a special, by who plays: keys on the keyboard, buttons on a pad. */
    const hint = (i: number, s: number) => (!human(i) ? "" : opts.keyboard && !opts.keyboard[i] ? PAD_SPECIALS[s]! : SPECIAL_KEYS[s]!);
    const breakerHint = (i: number) => (!human(i) ? "" : opts.keyboard && !opts.keyboard[i] ? "RT" : "Maj");
    root.replaceChildren();
    const many = world.fighters.length > 2;
    const top = el("div", `hud-top${many ? " many" : ""}`, root);
    // Three or more: a row of compact panels along the bottom, as in Smash.
    const bottom = many ? el("div", "hud-bottom", root) : null;
    if (many) top.appendChild(this.center());
    world.fighters.forEach((f, i) => {
      const ch = characters[i]!;
      const panel = el("div", `hud-panel ${many ? "compact" : i === 0 ? "left" : "right"}`, bottom ?? top);
      if (colors[i]) panel.style.setProperty("--slot", colors[i]!);
      panel.style.setProperty("--primary", ch.colors.primary);
      panel.style.setProperty("--secondary", ch.colors.secondary);
      const title = el("div", "hud-name", panel, ch.name);
      el("span", "hud-tag", title, opts.labels && (many || humans.length > 1) ? opts.labels[i]! : i === player ? "Toi" : many ? `CPU${i + 1}` : "Bot");
      // « Out of sight » makes sense in a duel; with everyone on screen, it would only clutter.
      if (i === player && !many && humans.length === 1) this.hidden = el("span", "hud-tag hidden-tag", title, "Hors de vue");
      el("div", "hud-universe", panel, ch.universe);
      const hpBar = el("div", "bar hp", panel);
      const hpLag = el("div", "fill lag", hpBar);
      const hp = el("div", "fill", hpBar);
      const enBar = el("div", "bar energy", panel);
      const energy = el("div", "fill", enBar);
      for (const sp of f.kit.specials) {
        const mark = el("div", "cost-mark", enBar);
        mark.style[i === 0 ? "left" : "right"] = `${sp.energyCost}%`;
      }
      // Compact panels (3 or more fighters) keep only the player's own specials.
      const detailed = !many || human(i);
      const specials = detailed ? el("div", "hud-specials", panel) : null;
      const specialEls = specials
        ? f.kit.specials.map((sp, s) => el("div", "special", specials, `${hint(i, s) ? hint(i, s) + " · " : ""}${sp.id} (${sp.energyCost})`))
        : [];
      // The breaker is everyone's escape: shown with the specials, lit when affordable.
      const breaker = specials ? el("div", "special breaker", specials, `${breakerHint(i) ? breakerHint(i) + " · " : ""}dégagement (${world.config.breakerCost})`) : null;
      // Dodge staling, shown as filled pips: the more, the slower and less safe the next dodge.
      const dodge = specials ? el("div", "special dodge-wear ready", specials) : null;
      if (dodge) dodge.title = "Usure des esquives";
      if (!many && i === 0) top.appendChild(this.center());
      const pipBox = many ? el("div", "pips", panel) : null;
      this.sides.push({ hp, hpLag, energy, specials: specialEls, breaker, dodge, pips: [], count: null, panel, pipBox });
    });
    this.timer = root.querySelector(".hud-timer")!;
    // Victory gauge: lives left (« 3 vies »), or K.-O. scored toward the cap, or a plain count.
    const c = this.world.config;
    const pipCount = c.rule === "stock" ? c.stocks : c.koToWin;
    this.sides.forEach((s, i) => {
      const box = s.pipBox ?? root.querySelectorAll<HTMLDivElement>(".hud-center .pips")[i]!;
      if (pipCount > 0) for (let k = 0; k < pipCount; k++) s.pips.push(el("div", `pip${c.rule === "stock" ? " life" : ""}`, box));
      else s.count = el("div", "ko-count", box, "0 K.-O.");
    });
    this.banner = el("div", "hud-banner", root);
    this.prompt = el("div", "hud-prompt", root);
    this.combo = el("div", "hud-combo", root);
    this.help = el("div", "hud-help", root);
    // Help: the gamepad layout when a pad is plugged in, the keyboard one otherwise.
    const rows = opts.pads ? PAD_HELP : KEY_HELP;
    el("div", "help-title", this.help, opts.pads ? "Manette" : "Clavier");
    for (const [k, v] of rows) {
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

  flash(text: string, seconds = 1.2, sub = ""): void {
    this.banner.replaceChildren();
    el("div", "banner-main", this.banner, text);
    if (sub) el("div", "banner-sub", this.banner, sub);
    this.banner.classList.remove("show");
    void this.banner.offsetWidth; // restart the entrance animation
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
      s.specials.forEach((el, k) => el.classList.toggle("ready", f.alive && f.energy >= f.kit.specials[k]!.energyCost));
      s.breaker?.classList.toggle("ready", f.alive && f.energy >= w.config.breakerCost);
      if (s.dodge) {
        const wear = Math.ceil(dodgeStaleNow(w, f) - 1e-6);
        const pips = "●".repeat(wear) + "○".repeat(w.config.dodgeStaleMax - wear);
        if (s.dodge.textContent !== `esquive ${pips}`) s.dodge.textContent = `esquive ${pips}`;
        s.dodge.classList.toggle("ready", wear <= 1);
      }
      const gauge = w.config.rule === "stock" ? f.stocks : (w.score[f.team] ?? 0);
      s.pips.forEach((p, k) => p.classList.toggle("on", k < gauge));
      if (s.count) s.count.textContent = `${w.score[f.team] ?? 0} K.-O.`;
      s.panel.classList.toggle("out", w.config.rule === "stock" && f.stocks === 0 && !f.alive);
    });
    // Readability cue for hiding: the player knows when the opponent cannot see them.
    const me = w.fighters[this.player]!;
    const foe = lockTarget(w, me) ?? w.fighters.find((f) => f.team !== me.team);
    this.hidden?.classList.toggle("on", !!foe && me.alive && foe.alive && !canSee(w, me, foe));
    // Contextual prompt: what the grab button does right now.
    const prompt = !me.alive ? "" : me.carrying !== null ? "F · lancer" : grabbable(w, me) && !me.action ? "F · ramasser" : "";
    this.prompt.textContent = prompt;
    this.prompt.classList.toggle("show", prompt !== "");
    const left = Math.max(0, w.config.timeLimit - w.time);
    this.timer.textContent = `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, "0")}`;

    for (const e of w.events.slice(this.lastEvent)) {
      // Combo counter: consecutive hits landed by the player.
      if (e.type === "hit" && e.source === this.player) {
        this.comboCount = performance.now() < this.comboUntil ? this.comboCount + 1 : 1;
        this.comboUntil = performance.now() + 1100;
        if (this.comboCount >= 2) {
          this.combo.textContent = `${this.comboCount} HITS`;
          this.combo.classList.remove("pop");
          void this.combo.offsetWidth;
          this.combo.classList.add("pop", "show");
        }
      }
      if (e.type === "ko") this.flash("K.-O. !", 1.4, names[e.target] ? `${names[e.target]} est à terre` : "");
      if (e.type === "guardBreak") this.flash("BOUCLIER BRISÉ", 0.8);
      if (e.type === "slam") this.flash("CONTRE LE MUR", 0.7);
      if (e.type === "breaker") this.flash("DÉGAGEMENT", 0.6);
      if (e.type === "parry") this.flash("PARADE !", 0.7);
    }
    this.lastEvent = w.events.length;
    if (performance.now() > this.bannerUntil && !w.over) this.banner.classList.remove("show");
    if (performance.now() > this.comboUntil) this.combo.classList.remove("show");
  }
}
