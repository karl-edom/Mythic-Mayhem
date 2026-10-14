// Keyboard and gamepad → Command. Uses physical key codes, so the same keys
// work on AZERTY (Z Q S D) and QWERTY (W A S D) layouts.

import type { Command } from "../brawl/world.ts";

export const KEY_HELP: [string, string][] = [
  ["Z Q S D / flèches", "se déplacer (relatif à la caméra)"],
  ["Espace", "sauter"],
  ["J", "attaque légère (répéter pour enchaîner)"],
  ["K (maintenir)", "attaque lourde, chargeable, brise la garde"],
  ["L (maintenir)", "garde"],
  ["Maj", "esquive (invulnérable au début)"],
  ["Maj sous les coups ou en garde", "dégagement : repousse l'adversaire (50 d'énergie)"],
  ["U / I / O", "spéciales 1 / 2 / 3"],
  ["F", "ramasser une caisse ou un tonneau, puis lancer"],
  ["E (maintenir)", "recharger l'énergie"],
  ["Échap", "pause"],
  ["H", "afficher / masquer l'aide"],
];

type Button = "jump" | "light" | "heavy" | "guard" | "dodge" | "charge" | "grab" | "s0" | "s1" | "s2";

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

/** Standard gamepad mapping: A jump, X light, Y heavy, B dodge, RB guard, RT charge, LT grab/throw, LB + X/Y/B specials. */
function readGamepad(): { held: Set<string>; stick: { x: number; y: number } } | null {
  const pad = navigator.getGamepads?.().find((p) => p);
  if (!pad) return null;
  const b = (i: number) => !!pad.buttons[i]?.pressed;
  const held = new Set<string>();
  const shift = b(4);
  if (b(0) && !shift) held.add("jump");
  if (b(2)) held.add(shift ? "s0" : "light");
  if (b(3)) held.add(shift ? "s1" : "heavy");
  if (b(1)) held.add(shift ? "s2" : "dodge");
  if (b(5)) held.add("guard");
  if (b(7)) held.add("charge");
  if (b(6)) held.add("grab");
  const dz = (v: number | undefined) => (v !== undefined && Math.abs(v) > 0.2 ? v : 0);
  const stick = { x: dz(pad.axes[0]) || (b(15) ? 1 : b(14) ? -1 : 0), y: dz(pad.axes[1]) || (b(13) ? 1 : b(12) ? -1 : 0) };
  return { held, stick };
}

export class Input {
  private held = new Set<string>();
  private pressed = new Set<string>();
  private padPrev = new Set<string>();
  onKey: ((code: string) => void) | null = null;

  constructor(target: Window) {
    target.addEventListener("keydown", (e) => {
      if (e.repeat) return;
      const k = KEYS[e.code];
      if (k) {
        this.held.add(k);
        this.pressed.add(k);
        e.preventDefault();
      }
      this.onKey?.(e.code);
    });
    target.addEventListener("keyup", (e) => {
      const k = KEYS[e.code];
      if (k) this.held.delete(k);
    });
    target.addEventListener("blur", () => this.held.clear());
  }

  /** Called once per animation frame, before simulation ticks. */
  poll(): void {
    const pad = readGamepad();
    if (!pad) return;
    for (const k of pad.held) if (!this.padPrev.has(k)) this.pressed.add(k);
    this.padPrev = pad.held;
    this.padStick = pad.stick;
  }

  private padStick = { x: 0, y: 0 };

  /**
   * Builds the command for one tick. `forward` is the camera's forward
   * direction on the floor; presses are consumed so they fire exactly once.
   */
  command(unit: number, forward: { x: number; z: number }): Command {
    const has = (k: string) => this.held.has(k) || this.padPrev.has(k);
    const take = (k: string) => {
      const p = this.pressed.has(k);
      this.pressed.delete(k);
      return p;
    };
    let fx = (has("up") ? 1 : 0) - (has("down") ? 1 : 0) - this.padStick.y;
    let rx = (has("right") ? 1 : 0) - (has("left") ? 1 : 0) + this.padStick.x;
    const l = Math.hypot(fx, rx);
    if (l > 1) {
      fx /= l;
      rx /= l;
    }
    // Right of forward on the floor plane (y up): (-z, x)
    const move = { x: forward.x * fx - forward.z * rx, z: forward.z * fx + forward.x * rx };
    const special = take("s0") ? 0 : take("s1") ? 1 : take("s2") ? 2 : undefined;
    return {
      unit,
      move,
      jump: take("jump"),
      grab: take("grab"),
      light: take("light"),
      dodge: take("dodge"),
      special,
      heavy: has("heavy"),
      guard: has("guard"),
      charge: has("charge"),
    };
  }

  clear(): void {
    this.pressed.clear();
  }
}
