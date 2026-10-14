// Maps a fighter's simulation state to a KayKit animation, every frame.
// Attack clips are re-timed so that their impact frame lands exactly when the
// simulation's hitbox goes live: what you see is what hits.

import * as THREE from "three";
import type { BrawlWorld, Fighter } from "../brawl/world.ts";
import type { WeaponStyle } from "./models.ts";

/** Fraction of an attack clip where the blow connects. */
const IMPACT = 0.42;

const LIGHT: Record<WeaponStyle, string[]> = {
  "1h": ["1H_Melee_Attack_Slice_Diagonal", "1H_Melee_Attack_Slice_Horizontal", "1H_Melee_Attack_Stab", "1H_Melee_Attack_Chop"],
  "2h": ["2H_Melee_Attack_Slice", "2H_Melee_Attack_Stab", "2H_Melee_Attack_Chop", "2H_Melee_Attack_Spin"],
  dual: ["1H_Melee_Attack_Slice_Diagonal", "Dualwield_Melee_Attack_Stab", "1H_Melee_Attack_Slice_Horizontal", "1H_Melee_Attack_Chop"],
  unarmed: ["Unarmed_Melee_Attack_Punch_A", "Unarmed_Melee_Attack_Punch_B", "Unarmed_Melee_Attack_Kick"],
};
const HEAVY: Record<WeaponStyle, string> = {
  "1h": "1H_Melee_Attack_Chop",
  "2h": "2H_Melee_Attack_Chop",
  dual: "Dualwield_Melee_Attack_Stab",
  unarmed: "Unarmed_Melee_Attack_Kick",
};
const AERIAL: Record<WeaponStyle, string> = {
  "1h": "1H_Melee_Attack_Slice_Horizontal",
  "2h": "2H_Melee_Attack_Slice",
  dual: "Dualwield_Melee_Attack_Stab",
  unarmed: "Unarmed_Melee_Attack_Kick",
};
const IDLE: Record<WeaponStyle, string> = { "1h": "Idle", "2h": "2H_Melee_Idle", dual: "Idle", unarmed: "Unarmed_Idle" };

interface Want {
  clip: string;
  /** Changes when the same clip must restart (next combo hit, new hitstun…). */
  key: string;
  loop?: boolean;
  /** Play the clip from `from` (seconds) to its end in `duration` seconds. */
  duration?: number;
  from?: number;
  /** Fixed playback speed (loops). */
  speed?: number;
  /** Hold a pose: time is set by hand, the mixer does not advance it. */
  holdAt?: number;
  fade?: number;
}

export class Animator {
  private actions = new Map<string, THREE.AnimationAction>();
  private key = "";
  private current: THREE.AnimationAction | null = null;
  private mixer: THREE.AnimationMixer;
  private clips: Map<string, THREE.AnimationClip>;
  private style: WeaponStyle;
  private lastPos = new THREE.Vector3();
  private velocity = new THREE.Vector3();

  constructor(mixer: THREE.AnimationMixer, clips: Map<string, THREE.AnimationClip>, style: WeaponStyle) {
    this.mixer = mixer;
    this.clips = clips;
    this.style = style;
  }

  private action(name: string): THREE.AnimationAction | null {
    let a = this.actions.get(name);
    if (!a) {
      const clip = this.clips.get(name);
      if (!clip) return null;
      a = this.mixer.clipAction(clip);
      this.actions.set(name, a);
    }
    return a;
  }

  private len(name: string): number {
    return this.clips.get(name)?.duration ?? 1;
  }

  /**
   * Clip timing so that the clip's impact frame lands exactly `startup` seconds in,
   * and what follows the impact fills the rest of the move (`total - startup`).
   */
  private strike(clip: string, key: string, startup: number, total: number, startFrac = 0): Want {
    const d = this.len(clip);
    const impact = Math.max(IMPACT * d, startFrac * d + 0.01);
    let speed = (d - impact) / Math.max(0.05, total - startup);
    let from = impact - speed * startup;
    if (from < startFrac * d) {
      from = startFrac * d;
      speed = (impact - from) / Math.max(0.02, startup);
    }
    return { clip, key, from, duration: (d - from) / speed, fade: 0.05 };
  }

  private want(w: BrawlWorld, f: Fighter): Want {
    const a = f.action;
    const c = w.config;
    if (!f.alive) return { clip: "Death_A", key: `dead${f.respawnAt}`, duration: this.len("Death_A") * 0.8, fade: 0.05 };
    if (w.over) return w.winner === f.team ? { clip: "Cheer", key: "win", loop: true } : { clip: IDLE[this.style], key: "end", loop: true };
    const facing = new THREE.Vector3(f.facing.x, 0, f.facing.z);
    switch (a?.kind) {
      case "light": {
        const s = f.kit.light.hits[a.index]!;
        const list = LIGHT[this.style];
        return this.strike(list[a.index % list.length]!, `light${a.index}:${w.tick - Math.round(a.t * c.tickRate)}`, s.startup, s.startup + s.active + s.recovery);
      }
      case "aerial": {
        const s = f.kit.light.hits[0]!;
        return this.strike(AERIAL[this.style], `aerial:${w.tick - Math.round(a.t * c.tickRate)}`, s.startup, s.startup + s.active + s.recovery);
      }
      case "landing":
        return { clip: "Jump_Land", key: `land${a.until}`, duration: c.landingLag + 0.15, fade: 0.04 };
      case "heavy": {
        const h = f.kit.heavy;
        const clip = HEAVY[this.style];
        const d = this.len(clip);
        if (a.charging) {
          const k = h.maxCharge > 0 ? Math.min(1, a.charge / h.maxCharge) : 0;
          return { clip, key: "heavy-charge", holdAt: d * (0.08 + 0.2 * k), fade: 0.08 };
        }
        return this.strike(clip, "heavy-strike", h.startup, h.startup + h.active + h.recovery, 0.28);
      }
      case "special": {
        const sp = f.kit.specials[a.slot]!;
        const del = sp.delivery;
        const clip =
          del.type === "projectile" ? "Spellcast_Shoot"
          : del.type === "rush" ? "1H_Melee_Attack_Stab"
          : del.castRange <= 0.5 ? "2H_Melee_Attack_Spin" : "Spellcast_Long";
        return this.strike(clip, `special${a.slot}`, sp.startup, sp.startup + sp.recovery);
      }
      case "rush":
        return { clip: "Running_B", key: "rush", loop: true, speed: 2.2, fade: 0.04 };
      case "breaker":
        return { clip: "Spellcast_Raise", key: `breaker${w.tick - Math.round(a.t * c.tickRate)}`, duration: c.breakerDuration, fade: 0.03 };
      case "dodge": {
        const side = a.dir.x * -facing.z + a.dir.z * facing.x;
        const fwd = a.dir.x * facing.x + a.dir.z * facing.z;
        const clip = Math.abs(fwd) >= Math.abs(side) ? (fwd > 0 ? "Dodge_Forward" : "Dodge_Backward") : side > 0 ? "Dodge_Right" : "Dodge_Left";
        return { clip, key: `dodge${w.tick - Math.round(a.t * c.tickRate)}`, duration: c.dodgeDuration + 0.2, fade: 0.04 };
      }
      case "hitstun": {
        const clip = Math.round(a.until * 10) % 2 ? "Hit_A" : "Hit_B";
        return { clip, key: `hit${a.until}`, duration: Math.max(0.25, a.until - w.time + 0.1), fade: 0.03 };
      }
      case "blockstun":
        return { clip: "Block_Hit", key: `block${a.until}`, duration: 0.35, fade: 0.03 };
      case "guard":
        return { clip: "Blocking", key: "guard", loop: true, fade: 0.08 };
      case "guardbroken":
        return { clip: "Hit_B", key: `broken${a.until}`, duration: c.guardBreakStun, fade: 0.03 };
      case "knockdown": {
        const left = a.until - w.time;
        const up = this.len("Lie_StandUp") * 0.6;
        if (left > up) return { clip: "Death_B", key: `down${a.until}`, duration: this.len("Death_B") * 0.6, fade: 0.04 };
        return { clip: "Lie_StandUp", key: `up${a.until}`, duration: Math.max(0.2, left + c.getUpInvulnerable), fade: 0.05 };
      }
      case "charge":
        return { clip: "Spellcasting", key: "charge", loop: true, fade: 0.1 };
      case "lift":
        return { clip: "PickUp", key: `lift${a.prop}`, duration: c.liftTime + 0.1, fade: 0.05 };
      case "throw":
        return this.strike("Throw", "throw", c.throwStartup, c.throwStartup + c.throwRecovery);
      default:
        break;
    }
    // Free: in the air, moving or idle. Movement direction comes from how the body actually moved.
    if (f.pos.y > f.floor + 0.05) {
      // Second jump: a fresh take-off pose while rising.
      if (f.airJumpsLeft < c.airJumps && f.vel.y > 0) return { clip: "Jump_Start", key: `airjump${f.airJumpsLeft}`, duration: 0.35, fade: 0.05 };
      return { clip: "Jump_Idle", key: "air", loop: true, fade: 0.1 };
    }
    const v = this.velocity;
    const speed = Math.hypot(v.x, v.z);
    if (speed > 0.8) {
      const fwd = (v.x * facing.x + v.z * facing.z) / speed;
      const side = (v.x * -facing.z + v.z * facing.x) / speed;
      if (fwd > 0.5) return { clip: "Running_A", key: "run", loop: true, speed: Math.max(0.7, speed / 6.5), fade: 0.15 };
      if (fwd < -0.5) return { clip: "Walking_Backwards", key: "back", loop: true, speed: Math.max(0.8, speed / 3), fade: 0.15 };
      return side > 0
        ? { clip: "Running_Strafe_Right", key: "strafeR", loop: true, speed: speed / 6, fade: 0.15 }
        : { clip: "Running_Strafe_Left", key: "strafeL", loop: true, speed: speed / 6, fade: 0.15 };
    }
    return { clip: IDLE[this.style], key: "idle", loop: true, fade: 0.2 };
  }

  /** `frozen`: hit-stop, the pose holds for a few frames on impact. */
  update(w: BrawlWorld, f: Fighter, dt: number, frozen: boolean): void {
    if (dt > 0) {
      this.velocity.set((f.pos.x - this.lastPos.x) / dt, 0, (f.pos.z - this.lastPos.z) / dt);
      this.lastPos.set(f.pos.x, f.pos.y, f.pos.z);
    }
    const want = this.want(w, f);
    const next = this.action(want.clip);
    if (!next) return;
    if (want.key !== this.key) {
      this.key = want.key;
      const clipLen = this.len(want.clip);
      next.reset();
      next.enabled = true;
      next.setLoop(want.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      next.clampWhenFinished = !want.loop;
      if (want.holdAt !== undefined) {
        next.time = want.holdAt;
        next.timeScale = 0;
      } else if (want.duration !== undefined) {
        next.time = want.from ?? 0;
        next.timeScale = (clipLen - (want.from ?? 0)) / want.duration;
      } else next.timeScale = want.speed ?? 1;
      next.play();
      if (this.current && this.current !== next) next.crossFadeFrom(this.current, want.fade ?? 0.1, false);
      this.current = next;
    } else if (want.holdAt !== undefined) next.time = want.holdAt;
    else if (want.loop && want.speed !== undefined) next.timeScale = want.speed;
    this.mixer.update(frozen ? 0 : dt);
  }
}
