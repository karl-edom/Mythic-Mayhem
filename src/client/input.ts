// Player input → Command. Several devices at once: the keyboard and up to four
// gamepads, each driving its own fighter (local multiplayer). Keyboard keys use
// physical codes, so the same keys work on AZERTY (Z Q S D) and QWERTY (W A S D).

import type { Command } from "../brawl/world.ts";

export const KEY_HELP: [string, string][] = [
  ["Z Q S D / flèches", "se déplacer"],
  ["Espace", "sauter : garde l'élan (maintenu : saut complet ; tapé : petit saut ; en l'air : double saut)"],
  ["J", "attaque légère : avance ; enchaîne jusqu'à 3 coups si le précédent a touché ; en l'air : coup aérien, visé vers l'adversaire"],
  ["Espace + J / L + J (en l'air)", "coup aérien vers le haut / vers le bas (plus lent : plaque au sol)"],
  ["K (maintenir)", "attaque lourde, chargeable"],
  ["L (maintenir)", "bouclier ; relâché juste avant l'impact : parade"],
  ["Maj", "esquive ; sous les coups : dégagement (50 d'énergie)"],
  ["U / I / O", "spéciales 1 / 2 / 3"],
  ["F", "ramasser, puis lancer"],
  ["E (maintenir)", "recharger l'énergie"],
  ["Échap", "pause (l'aide des commandes est dans le menu pause)"],
];

/** Gamepad layout, Smash-like (Xbox names; PlayStation: A = ✕, B = ○, X = □, Y = △). */
export const PAD_HELP: [string, string][] = [
  ["Stick gauche", "se déplacer (plus ou moins vite selon l'inclinaison)"],
  ["A", "attaque légère (combo si ça touche) ; en l'air : coup aérien, visé vers l'adversaire"],
  ["Y + A / RB + A (en l'air)", "coup aérien vers le haut / vers le bas (plus lent : plaque au sol)"],
  ["X (maintenir)", "attaque lourde, chargeable"],
  ["B", "spéciale 1 ; B + stick incliné : spéciale 2"],
  ["LT", "spéciale 3"],
  ["Y", "sauter (maintenu : saut complet ; tapé : petit saut) ; en l'air : double saut"],
  ["RB (maintenir)", "bouclier ; relâché juste avant l'impact : parade"],
  ["RT", "esquive ; sous les coups : dégagement"],
  ["LB", "ramasser, puis lancer"],
  ["Croix bas ou clic du stick gauche (maintenir)", "recharger l'énergie"],
  ["Start", "pause (l'aide des commandes est dans le menu pause)"],
];

type Button = "jump" | "light" | "heavy" | "guard" | "dodge" | "charge" | "grab" | "s0" | "s1" | "s2" | "start" | "help" | "navL" | "navR" | "navU" | "navD";

const KEYS: Record<string, Button | "up" | "down" | "left" | "right"> = {
  KeyW: "up", ArrowUp: "up",
  KeyS: "down", ArrowDown: "down",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
  Space: "jump",
  KeyJ: "light",
  KeyK: "heavy",
  KeyL: "guard",
  ShiftLeft: "dodge", ShiftRight: "dodge",
  KeyE: "charge",
  KeyF: "grab",
  KeyU: "s0", KeyI: "s1", KeyO: "s2",
};

/** Who drives a fighter: the keyboard, a gamepad (by index), or a bot. */
export type Controller = "cpu" | "kb" | `pad${number}`;

export const padIndex = (c: Controller): number | null => (c.startsWith("pad") ? Number(c.slice(3)) : null);

/** Keys that act in the menus: arrows, Enter (A), Backspace (B), X (give), T (team). */
const KEY_MENU: Record<string, MenuButton> = {
  ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down",
  Enter: "a", NumpadEnter: "a", Backspace: "b", KeyX: "x", KeyT: "y",
};

export type MenuButton = "a" | "b" | "x" | "y" | "start" | "help" | "left" | "right" | "up" | "down";

/** Stick dead zone (radial) and the tilt from which B gives the second special. */
const DEAD = 0.18;
const TILT = 0.5;

/**
 * The d-pad. Standard mapping: buttons 12-15. Other pads (many Bluetooth and
 * PlayStation pads in some browsers) report it as axes instead: a « hat » axis (9),
 * one value per direction and above 1 when released, or a pair of axes (6, 7) at -1/0/1.
 */
export function readDpad(buttons: readonly boolean[], axes: readonly number[], standard: boolean): { up: boolean; down: boolean; left: boolean; right: boolean } {
  const b = (i: number) => !!buttons[i];
  const out = { up: b(12), down: b(13), left: b(14), right: b(15) };
  if (standard) return out;
  const hat = axes[9];
  if (hat !== undefined && hat >= -1.05 && hat <= 1.05) {
    // Eight positions from up (-1) clockwise in steps of 2/7.
    const k = Math.round((hat + 1) / (2 / 7)) % 8;
    out.up ||= k === 7 || k === 0 || k === 1;
    out.right ||= k >= 1 && k <= 3;
    out.down ||= k >= 3 && k <= 5;
    out.left ||= k >= 5 && k <= 7;
  } else if (axes.length >= 8) {
    const [x, y] = [axes[6] ?? 0, axes[7] ?? 0];
    out.left ||= x < -0.5;
    out.right ||= x > 0.5;
    out.up ||= y < -0.5;
    out.down ||= y > 0.5;
  }
  return out;
}

/**
 * Reads one gamepad: held buttons and the left stick (radial dead zone, rescaled so
 * movement starts smoothly at its edge). Pure, for tests.
 */
export function readPad(buttons: readonly boolean[], axes: readonly number[], standard = true): { held: Set<Button>; stick: { x: number; y: number } } {
  const b = (i: number) => !!buttons[i];
  const pad = readDpad(buttons, axes, standard);
  const held = new Set<Button>();
  if (b(0)) held.add("light");
  if (b(1)) held.add("s0"); // resolved to s0 / s1 by the stick when pressed
  if (b(2)) held.add("heavy");
  if (b(3)) held.add("jump");
  if (b(4)) held.add("grab");
  if (b(5)) held.add("guard");
  if (b(6)) held.add("s2");
  if (b(7)) held.add("dodge");
  if (b(8)) held.add("help");
  if (b(9)) held.add("start");
  // Recharge: d-pad down, or a click of the left stick (standing still anyway), held.
  if (pad.down || b(10)) held.add("charge");
  let x = axes[0] ?? 0;
  let y = axes[1] ?? 0;
  const m = Math.hypot(x, y);
  if (m < DEAD) [x, y] = [0, 0];
  else {
    const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
    [x, y] = [x * k, y * k];
  }
  // The d-pad moves too (left/right/up), for pads whose stick drifts or is missing.
  if (!x && !y) {
    x = (pad.right ? 1 : 0) - (pad.left ? 1 : 0);
    y = pad.up ? -1 : 0;
  }
  return { held, stick: { x, y } };
}

interface PadState {
  held: Set<Button>;
  pressed: Set<Button>;
  stick: { x: number; y: number };
  connected: boolean;
  /** Browser's index of the device driving this slot (-1 = none yet). */
  device: number;
  /** Device name and button layout as reported by the browser, for the on-screen diagnosis. */
  id: string;
  standard: boolean;
  /** Direction pushed last frame (stick or d-pad), and when it repeats next, for menus. */
  nav: string;
  navRepeat: number;
}

export class Input {
  private keysHeld = new Set<string>();
  private keysPressed = new Set<string>();
  private pads: PadState[] = [0, 1, 2, 3].map(() => ({ held: new Set(), pressed: new Set(), stick: { x: 0, y: 0 }, connected: false, device: -1, id: "", standard: true, nav: "", navRepeat: 0 }));
  /** Keyboard presses for the menus (arrows, Enter, Backspace, X, T), consumed by menuPresses. */
  private keyMenu: MenuButton[] = [];
  /** Why gamepads cannot be read here, if they cannot (for the diagnosis). */
  blocked = "";
  onKey: ((code: string) => void) | null = null;

  constructor(target: Window) {
    target.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = KEYS[e.code];
      if (k) {
        this.keysHeld.add(k);
        this.keysPressed.add(k);
        e.preventDefault();
      }
      const menu = KEY_MENU[e.code];
      if (menu) this.keyMenu.push(menu);
      this.onKey?.(e.code);
    });
    target.addEventListener("keyup", (e) => {
      const k = KEYS[e.code];
      if (k) this.keysHeld.delete(k);
    });
    target.addEventListener("blur", () => this.keysHeld.clear());
  }

  /**
   * Called once per animation frame, before simulation ticks: reads every gamepad.
   * Devices are given our slots 0-3 in the order they appear, whatever their browser
   * index (Steam and other drivers create virtual pads with high indices).
   */
  poll(): void {
    let list: readonly (Gamepad | null)[] = [];
    try {
      list = navigator.getGamepads?.() ?? [];
      const policy = (globalThis.document as (Document & { featurePolicy?: { allowsFeature?: (f: string) => boolean } }) | undefined)?.featurePolicy;
      this.blocked =
        typeof navigator.getGamepads !== "function"
          ? "ce navigateur ne gère pas les manettes"
          : policy?.allowsFeature?.("gamepad") === false
            ? "le navigateur refuse l'accès aux manettes dans cette fenêtre intégrée"
            : "";
    } catch (e) {
      // A page embedded in another one may be refused the gamepads (permissions policy).
      this.blocked = "le navigateur refuse l'accès aux manettes dans cette fenêtre";
      list = [];
    }
    const live = list.filter((p): p is Gamepad => !!p && p.connected);
    // Free the slots of devices that went away, then seat newcomers.
    for (const s of this.pads) if (s.device >= 0 && !live.some((p) => p.index === s.device)) Object.assign(s, { device: -1, connected: false, held: new Set() });
    for (const p of live) {
      if (this.pads.some((s) => s.device === p.index)) continue;
      const free = this.pads.find((s) => s.device < 0);
      if (free) free.device = p.index;
    }
    for (const s of this.pads) {
      const pad = live.find((p) => p.index === s.device);
      if (!pad) {
        s.connected = false;
        s.held.clear();
        continue;
      }
      s.connected = true;
      s.id = pad.id;
      s.standard = pad.mapping === "standard";
      const r = readPad(
        pad.buttons.map((b) => b.pressed || b.value > 0.5),
        pad.axes,
        s.standard,
      );
      for (const k of r.held) if (!s.held.has(k)) s.pressed.add(k);
      s.held = r.held;
      s.stick = r.stick;
      // Menu navigation: stick or d-pad, one step per push, repeating while held.
      const d = readDpad(pad.buttons.map((b) => b.pressed), pad.axes, s.standard);
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const nav = ax > 0.6 || d.right ? "navR" : ax < -0.6 || d.left ? "navL" : ay < -0.6 || d.up ? "navU" : ay > 0.6 || d.down ? "navD" : "";
      const now = performance.now();
      if (nav && (nav !== s.nav || now >= s.navRepeat)) {
        s.pressed.add(nav as Button);
        s.navRepeat = now + (nav !== s.nav ? 380 : 140);
      }
      s.nav = nav;
    }
  }

  /** What the game sees of the gamepads, for the on-screen diagnosis. */
  padStatus(): { blocked: string; pads: { slot: number; id: string; standard: boolean }[] } {
    return {
      blocked: this.blocked,
      pads: this.pads.flatMap((p, i) => (p.connected ? [{ slot: i, id: p.id, standard: p.standard }] : [])),
    };
  }

  /** Indices of the gamepads plugged in. */
  connectedPads(): number[] {
    return this.pads.flatMap((p, i) => (p.connected ? [i] : []));
  }

  /**
   * Menu and pause buttons: presses of A, B, Start or Select on any gamepad since the
   * last call (consumed). In a match, only Start and Select are taken.
   */
  menuPresses(inMatch: boolean): { pad: number; button: MenuButton }[] {
    const out: { pad: number; button: MenuButton }[] = [];
    // The keyboard navigates the menus too (pad -1): useful when a gamepad driver turns
    // the pad into arrow keys and Enter, as Steam's desktop mode does.
    if (!inMatch) for (const b of this.keyMenu) out.push({ pad: -1, button: b });
    this.keyMenu = [];
    this.pads.forEach((p, i) => {
      const take = (b: Button, name: MenuButton) => {
        if (p.pressed.has(b)) {
          p.pressed.delete(b);
          out.push({ pad: i, button: name });
        }
      };
      take("start", "start");
      take("help", "help");
      // During a fight, menu directions are not wanted: drop them so they do not pile up.
      if (inMatch) for (const b of ["navL", "navR", "navU", "navD"] as const) p.pressed.delete(b);
      if (!inMatch) {
        take("light", "a");
        take("s0", "b");
        take("jump", "y");
        take("heavy", "x");
        take("navL", "left");
        take("navR", "right");
        take("navU", "up");
        take("navD", "down");
      }
    });
    return out;
  }

  /**
   * Builds the command of one fighter for one tick, from its controller. `forward` is
   * the camera's forward direction on the floor; presses are consumed so they fire once.
   */
  command(unit: number, controller: Controller, forward: { x: number; z: number }): Command {
    const pi = padIndex(controller);
    const pad = pi !== null ? this.pads[pi] : undefined;
    const held = (k: string) => (pad ? pad.held.has(k as Button) : this.keysHeld.has(k));
    const take = (k: string) => {
      const set = pad ? pad.pressed : this.keysPressed;
      const p = set.has(k as Button);
      set.delete(k as Button);
      return p;
    };
    let fx: number;
    let rx: number;
    if (pad) {
      fx = -pad.stick.y;
      rx = pad.stick.x;
    } else {
      fx = (held("up") ? 1 : 0) - (held("down") ? 1 : 0);
      rx = (held("right") ? 1 : 0) - (held("left") ? 1 : 0);
    }
    const l = Math.hypot(fx, rx);
    if (l > 1) {
      fx /= l;
      rx /= l;
    }
    // Right of forward on the floor plane (y up): (-z, x)
    const move = { x: forward.x * fx - forward.z * rx, z: forward.z * fx + forward.x * rx };
    let special: number | undefined;
    if (pad) {
      // B alone: first special; B with the stick tilted: second; LT: third.
      if (take("s0")) special = l > TILT ? 1 : 0;
      else if (take("s2")) special = 2;
    } else special = take("s0") ? 0 : take("s1") ? 1 : take("s2") ? 2 : undefined;
    return {
      unit,
      move,
      jump: take("jump"),
      jumpHeld: held("jump"),
      grab: take("grab"),
      light: take("light"),
      dodge: take("dodge"),
      special,
      heavy: held("heavy"),
      guard: held("guard"),
      charge: held("charge"),
    };
  }

  /** A short rumble on a gamepad (hits given and taken), where the browser supports it. */
  rumble(controller: Controller, strength: number, ms: number): void {
    const pi = padIndex(controller);
    if (pi === null) return;
    const device = this.pads[pi]?.device ?? -1;
    const pad = device >= 0 ? navigator.getGamepads?.()[device] : null;
    const act = (pad as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } }) | null)?.vibrationActuator;
    act?.playEffect?.("dual-rumble", { duration: ms, strongMagnitude: strength, weakMagnitude: Math.min(1, strength * 1.4) })?.catch(() => {});
  }

  clear(): void {
    this.keysPressed.clear();
    for (const p of this.pads) p.pressed.clear();
  }
}
