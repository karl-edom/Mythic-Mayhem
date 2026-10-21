// Signature effects of the specials (character.json, `moves.<id>.fx`): what a technique
// draws when it starts, when it hits, when its counter triggers. Display only: the
// simulation does not know about any of it, and a pack only names an effect from the
// list (SPECIAL_FX), it never brings code.

import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { MoveStyle } from "../brawl/character.ts";
import { puffTexture, swirlTexture } from "./moveFx.ts";
import { glowTexture, noOutline, toon } from "./toon.ts";
import type { Vfx } from "./vfx.ts";

type Fx = NonNullable<MoveStyle["fx"]>;

/** What an effect needs to know of a fighter on screen. */
export interface FxFighter {
  /** Middle of the body, world space. */
  center: THREE.Vector3;
  /** Feet, world space. */
  feet: THREE.Vector3;
  /** Facing on the floor plane (unit). */
  facing: THREE.Vector3;
  /** The fighter's drawn root (its transform) and model (copied for clones), if any. */
  root: THREE.Object3D;
  model: THREE.Object3D | null;
  color: THREE.Color;
}

const glow = glowTexture();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);

const added = (map: THREE.Texture, color: THREE.ColorRepresentation, opacity = 1) =>
  new THREE.Sprite(noOutline(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })));
const painted = (map: THREE.Texture, color: THREE.ColorRepresentation, opacity = 1) =>
  new THREE.Sprite(noOutline(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false })));

export class SpecialFx {
  private vfx: Vfx;
  constructor(vfx: Vfx) {
    this.vfx = vfx;
  }

  /** The special starts. */
  start(fx: Fx | undefined, me: FxFighter): void {
    if (fx === "clones") {
      // Two clones pop out beside him as he leaves.
      const side = new THREE.Vector3().crossVectors(me.facing, UP).normalize();
      for (const s of [-1, 1]) this.clone(me, me.feet.clone().addScaledVector(side, s * 0.9).addScaledVector(me.facing, -0.3), me.facing, 0.35);
    }
  }

  /** The special lands on `target`. */
  hit(fx: Fx | undefined, me: FxFighter, target: FxFighter): void {
    if (fx === "spiral") this.spiral(target.center, target.center.clone().sub(me.center).setY(0).normalize(), me.color);
    if (fx === "clones") {
      // Four clones round the target, all at it at once, gone in smoke.
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
        this.clone(me, target.feet.clone().addScaledVector(dir, 1.05), dir.clone().negate(), 0.45);
      }
      this.vfx.speedLines(target.center, UP.clone(), 0xffffff);
    }
  }

  /** The counter triggers: `me` dodged `attacker`'s blow and reappears behind it. */
  counter(fx: Fx | undefined, me: FxFighter, attacker: FxFighter): void {
    if (fx === "substitution") {
      // Where the blow landed: a puff of smoke, and a log in his place.
      const spot = attacker.feet.clone().addScaledVector(attacker.facing, 1.1);
      this.smoke(spot.clone().setY(spot.y + 0.9), 1.4);
      this.log(spot, attacker.facing);
      this.smoke(me.center, 0.9);
    }
  }

  /**
   * Ninja smoke: thick white-grey puffs bursting out and rolling away, painted over the
   * scene (they hide what is behind), a short white flash at the heart.
   */
  smoke(at: THREE.Vector3, size: number): void {
    const g = new THREE.Group();
    g.position.copy(at);
    const puffs = Array.from({ length: 12 }, (_, i) => {
      const s = painted(puffTexture(), i % 3 ? 0xf4f2ee : 0xc9c5c0, 0.95);
      s.material.rotation = rnd(0, Math.PI * 2);
      const dir = new THREE.Vector3(rnd(-1, 1), rnd(-0.4, 0.9), rnd(-1, 1)).normalize();
      g.add(s);
      return { s, dir, reach: size * rnd(0.35, 0.7), big: size * rnd(0.7, 1.1), spin: rnd(-2, 2) };
    });
    const flash = added(glow, 0xffffff, 0.9);
    g.add(flash);
    this.vfx.add(g, 0.7, (k) => {
      const out = 1 - (1 - k) ** 3;
      for (const p of puffs) {
        p.s.position.copy(p.dir).multiplyScalar(p.reach * out).add(new THREE.Vector3(0, size * 0.3 * k, 0));
        p.s.scale.setScalar(p.big * (0.4 + 0.8 * out));
        p.s.material.rotation += p.spin * 0.016;
        p.s.material.opacity = 0.95 * (k < 0.55 ? 1 : (1 - k) / 0.45);
      }
      flash.scale.setScalar(size * 1.2 * (1 - k));
      flash.material.opacity = 0.9 * Math.max(0, 1 - k * 4);
    });
  }

  /** The log left in the substitute's place: it stands a moment, tips over, rolls, fades. */
  private log(feet: THREE.Vector3, facing: THREE.Vector3): void {
    const bark = toon("#7a5634");
    const cut = toon("#d9b47a");
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 1.25, 12, 1, true), bark);
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.17, 12), cut);
    top.rotation.x = -Math.PI / 2;
    top.position.y = 0.625;
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.19, 12), cut);
    bottom.rotation.x = Math.PI / 2;
    bottom.position.y = -0.625;
    // A stub of branch, so it reads as wood.
    const stub = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.22, 6), bark);
    stub.position.set(0.17, 0.2, 0);
    stub.rotation.z = -1.0;
    const log = new THREE.Group();
    log.add(body, top, bottom, stub);
    for (const m of [bark, cut]) m.transparent = true;
    const pivot = new THREE.Group();
    pivot.position.copy(feet);
    // It falls away from the attacker.
    pivot.rotation.y = Math.atan2(facing.x, facing.z);
    log.position.y = 0.625;
    pivot.add(log);
    this.vfx.add(pivot, 1.3, (k) => {
      const fall = Math.min(1, Math.max(0, (k - 0.18) / 0.3));
      // Tips over forward (+z in the pivot), lands on its side, bounces a little.
      log.rotation.x = (Math.PI / 2) * fall * fall + (fall >= 1 ? 0.06 * Math.sin((k - 0.48) * 40) * (1 - k) : 0);
      log.position.set(0, 0.625 * Math.cos(log.rotation.x) + 0.19 * Math.sin(log.rotation.x), 0.625 * Math.sin(log.rotation.x));
      const o = k < 0.8 ? 1 : (1 - k) / 0.2;
      bark.opacity = cut.opacity = o;
    });
  }

  /**
   * A copy of the fighter, frozen in its pose of the moment, popping in and out of smoke
   * at `feet`, turned to `facing` (shadow clones).
   */
  private clone(me: FxFighter, feet: THREE.Vector3, facing: THREE.Vector3, life: number): void {
    if (!me.model) return;
    me.root.updateMatrixWorld(true);
    const copy = SkeletonUtils.clone(me.model);
    const holder = new THREE.Group();
    holder.position.copy(feet);
    holder.rotation.y = Math.atan2(facing.x, facing.z);
    holder.scale.copy(me.root.scale);
    holder.add(copy);
    // Its own effects (glow in the hand, flames) stay with the real one.
    copy.traverse((o) => {
      if (o instanceof THREE.Sprite || (o instanceof THREE.Points)) o.visible = false;
    });
    const center = feet.clone().setY(feet.y + 0.9);
    this.smoke(center, 1.0);
    let gone = false;
    this.vfx.add(
      holder,
      life,
      (k) => {
        if (k >= 1 && !gone) {
          gone = true;
          this.smoke(center, 0.9);
        }
      },
      true,
    );
  }

  /**
   * A spinning ball of wind grinding into the target: a ball of streaking wind growing
   * and spinning, rings whipping round the axis of the blow, a white heart, wind
   * streaks flung out, then the shockwave.
   */
  private spiral(at: THREE.Vector3, dir: THREE.Vector3, color: THREE.Color): void {
    const g = new THREE.Group();
    g.position.copy(at);
    // The ball's axis along the blow.
    g.quaternion.setFromUnitVectors(UP, dir.lengthSq() > 0 ? dir : new THREE.Vector3(0, 0, 1));
    const tint = new THREE.Color(0x6ec8ff);
    const balls = [0, 1].map((i) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(1, 28, 18),
        noOutline(new THREE.MeshBasicMaterial({ map: swirlTexture(), color: i ? tint : 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })),
      );
      g.add(m);
      return m;
    });
    const heart = added(glow, 0xffffff, 1);
    const halo = added(glow, tint, 0.7);
    g.add(heart, halo);
    const rings = Array.from({ length: 3 }, (_, i) => {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.035, 6, 48, Math.PI * 1.4),
        noOutline(new THREE.MeshBasicMaterial({ color: i ? tint : 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })),
      );
      r.rotation.x = Math.PI / 2;
      r.position.y = (i - 1) * 0.12;
      g.add(r);
      return r;
    });
    const streaks = Array.from({ length: 14 }, () => {
      const s = added(glow, Math.random() < 0.5 ? 0xffffff : tint, 1);
      g.add(s);
      return { s, a: rnd(0, Math.PI * 2), y: rnd(-0.4, 0.4), speed: rnd(2.5, 4) };
    });
    void color;
    this.vfx.add(g, 0.5, (k) => {
      const grow = Math.min(1, k / 0.25);
      const r = 0.25 + 0.75 * grow;
      const fade = k < 0.6 ? 1 : (1 - k) / 0.4;
      balls.forEach((b, i) => {
        b.scale.setScalar(r * (i ? 1.08 : 0.92));
        b.rotation.y = k * (i ? -38 : 46);
        (b.material as THREE.MeshBasicMaterial).opacity = 0.9 * fade;
      });
      heart.scale.setScalar(0.9 * r);
      heart.material.opacity = fade;
      halo.scale.setScalar(3.2 * r);
      halo.material.opacity = 0.6 * fade;
      rings.forEach((ring, i) => {
        ring.scale.setScalar(r * (1.15 + 0.5 * k + i * 0.12));
        ring.rotation.z = k * (30 + i * 9);
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * fade;
      });
      for (const st of streaks) {
        const d = r + st.speed * k;
        const a = st.a + k * 9;
        st.s.position.set(Math.cos(a) * d, st.y, Math.sin(a) * d);
        st.s.scale.setScalar(0.12 * (1 - k));
        st.s.material.opacity = fade;
      }
    });
    this.vfx.groundWave(at.clone().setY(Math.max(0, at.y - 0.9)), tint, 3.4);
    this.vfx.shake = Math.max(this.vfx.shake, 0.5);
  }
}
