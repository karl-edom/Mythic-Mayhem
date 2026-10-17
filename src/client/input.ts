// Player input → Command. Several devices at once: the keyboard and up to four
// gamepads, each driving its own fighter (local multiplayer). Keyboard keys use
// physical codes, so the same keys work on AZERTY (Z Q S D) and QWERTY (W A S D).

import type { Command } from "../brawl/world.ts";

export const KEY_HELP: [string, string][] = [
  ["Z Q S D / flèches", "se déplacer"],
  ["Espace", "sauter : garde l'élan (maintenu : saut complet ; tapé : petit saut ; en l'air : double saut)"],
  ["J", "attaque légère : avance ; enchaîne jusqu'à 3 coups si le précédent a touché ; en l'air : coup aérien"],
  ["K (maintenir)", "attaque lourde, chargeable"],
  ["L (maintenir)", "bouclier ; relâché juste avant l'impact : parade"],
  ["Maj", "esquive ; sous les coups : dégagement (50 d'énergie)"],
  ["U / I / O", "spéciales 1 / 2 / 3"],
  ["F", "ramasser, puis lancer"],
  ["E (maintenir)", "recharger l'énergie"],
  ["Échap / H", "pause / aide"],
];

/** Gamepad layout, Smash-like (Xbox names; PlayStation: A = ✕, B = ○, X = □, Y = △). */
export const PAD_HELP: [string, string][] = [
  ["Stick gauche", "se déplacer (plus ou moins vite selon l'inclinaison)"],
  ["A", "attaque légère (combo si ça touche) ; en l'air : coup aérien"],
  ["X (maintenir)", "attaque lourde, chargeable"],
  ["B", "spéciale 1 ; B + stick incliné : spéciale 2"],
  ["LT", "spéciale 3"],
  ["Y", "sauter (maintenu : saut complet ; tapé : petit saut) ; en l'air : double saut"],
  ["RB (maintenir)", "bouclier ; relâché juste avant l'impact : parade"],
  ["RT", "esquive ; sous les coups : dégagement"],
  ["LB", "ramasser, puis lancer"],
  ["Croix bas (maintenir)", "recharger l'énergie"],
  ["Start / Select", "pause / aide"],
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

export type MenuButton = "a" | "b" | "x" | "y" | "start" | "help" | "left" | "right" | "up" | "down";

/** Stick dead zone (radial) and the tilt from which B gives the second special. */
const DEAD = 0.18;
const TILT = 0.5;

/**
 * Reads one standard-mapping gamepad: held buttons and the left stick (radial dead
 * zone, rescaled so movement starts smoothly at its edge). Pure, for tests.
 */
export function readPad(buttons: readonly boolean[], axes: readonly number[]): { held: Set<Button>; stick: { x: number; y: number } } {
  const b = (i: number) => !!buttons[i];
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
  if (b(13)) held.add("charge");
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
    x = (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
    y = b(12) ? -1 : 0;
  }
  return { held, stick: { x, y } };
}

interface PadState {
  held: Set<Button>;
  pressed: Set<Button>;
  stick: { x: number; y: number };
  connected: boolean;
  /** Direction pushed last frame (stick or d-pad), and when it repeats next, for menus. */
  nav: string;
  navRepeat: number;
}

export class Input {
  private keysHeld = new Set<string>();
  private keysPressed = new Set<string>();
  private pads: PadState[] = [0, 1, 2, 3].map(() => ({ held: new Set(), pressed: new Set(), stick: { x: 0, y: 0 }, connected: false, nav: "", navRepeat: 0 }));
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
      this.onKey?.(e.code);
    });
    target.addEventListener("keyup", (e) => {
      const k = KEYS[e.code];
      if (k) this.keysHeld.delete(k);
    });
    target.addEventListener("blur", () => this.keysHeld.clear());
  }

  /** Called once per animation frame, before simulation ticks: reads every gamepad. */
  poll(): void {
    const list = navigator.getGamepads?.() ?? [];
    for (let i = 0; i < this.pads.length; i++) {
      const pad = list[i];
      const s = this.pads[i]!;
      if (!pad || !pad.connected) {
        s.connected = false;
        s.held.clear();
        continue;
      }
      s.connected = true;
      const r = readPad(
        pad.buttons.map((b) => b.pressed || b.value > 0.5),
        pad.axes,
      );
      for (const k of r.held) if (!s.held.has(k)) s.pressed.add(k);
      s.held = r.held;
      s.stick = r.stick;
      // Menu navigation: stick or d-pad, one step per push, repeating while held.
      const bt = (i: number) => !!pad.buttons[i]?.pressed;
      const ax = pad.axes[0] ?? 0;
      const ay = pad.axes[1] ?? 0;
      const nav =
        ax > 0.6 || bt(15) ? "navR" : ax < -0.6 || bt(14) ? "navL" : ay < -0.6 || bt(12) ? "navU" : ay > 0.6 || bt(13) ? "navD" : "";
      const now = performance.now();
      if (nav && (nav !== s.nav || now >= s.navRepeat)) {
        s.pressed.add(nav as Button);
        s.navRepeat = now + (nav !== s.nav ? 380 : 140);
      }
      s.nav = nav;
    }
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
    const pad = navigator.getGamepads?.()[pi];
    const act = (pad as (Gamepad & { vibrationActuator?: { playEffect?: (t: string, p: object) => Promise<unknown> } }) | null)?.vibrationActuator;
    act?.playEffect?.("dual-rumble", { duration: ms, strongMagnitude: strength, weakMagnitude: Math.min(1, strength * 1.4) })?.catch(() => {});
  }

  clear(): void {
    this.keysPressed.clear();
    for (const p of this.pads) p.pressed.clear();
  }
}
