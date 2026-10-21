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
  /** The head (eyes) and the right hand, world space: bones of the model, else guessed. */
  head: THREE.Vector3;
  hand: THREE.Vector3;
  /** Its second colour (light) and its main colour (strong): techniques are drawn in them. */
  color: THREE.Color;
  accent: THREE.Color;
}

const glow = glowTexture();
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const UP = new THREE.Vector3(0, 1, 0);

const added = (map: THREE.Texture, color: THREE.ColorRepresentation, opacity = 1) =>
  new THREE.Sprite(noOutline(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false })));
const painted = (map: THREE.Texture, color: THREE.ColorRepresentation, opacity = 1) =>
  new THREE.Sprite(noOutline(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false })));

let powTex: THREE.CanvasTexture | null = null;
/** A comic-book impact star: jagged points, black outline, white inside (tinted per sprite). */
function powTexture(): THREE.CanvasTexture {
  if (powTex) return powTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.beginPath();
  const n = 14;
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2;
    const d = i % 2 ? 26 + r() * 8 : 50 + r() * 12;
    const x = 64 + Math.cos(a) * d;
    const y = 64 + Math.sin(a) * d;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.closePath();
  g.fillStyle = "#fff2a0";
  g.fill();
  g.lineWidth = 4;
  g.lineJoin = "round";
  g.strokeStyle = "#15121f";
  g.stroke();
  powTex = new THREE.CanvasTexture(c);
  powTex.colorSpace = THREE.SRGBColorSpace;
  return powTex;
}

let ensoTex: THREE.CanvasTexture | null = null;
/** The ensō: one brush stroke round, thick then dry, left open. */
function ensoTexture(): THREE.CanvasTexture {
  if (ensoTex) return ensoTex;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.lineCap = "round";
  const steps = 120;
  for (let i = 0; i < steps; i++) {
    const a0 = -1.2 + (i / steps) * Math.PI * 1.85;
    const a1 = a0 + (Math.PI * 1.85) / steps + 0.01;
    const k = i / steps;
    g.strokeStyle = `rgba(255,255,255,${0.95 - 0.5 * k})`;
    g.lineWidth = 22 * (1 - 0.7 * k) + 3;
    g.beginPath();
    g.arc(128, 128, 96 + 4 * Math.sin(k * 7), a0, a1);
    g.stroke();
  }
  ensoTex = new THREE.CanvasTexture(c);
  ensoTex.colorSpace = THREE.SRGBColorSpace;
  return ensoTex;
}

let tomoeTex: THREE.CanvasTexture | null = null;
/** The Sharingan: a red iris ringed in black, the pupil, three commas round it. */
function tomoeTexture(): THREE.CanvasTexture {
  if (tomoeTex) return tomoeTex;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 56);
  grad.addColorStop(0, "#ff4a3a");
  grad.addColorStop(0.7, "#d0101a");
  grad.addColorStop(1, "#7a0008");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(64, 64, 56, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 5;
  g.strokeStyle = "#140406";
  g.stroke();
  // The faint ring the commas sit on.
  g.lineWidth = 2;
  g.strokeStyle = "rgba(20,4,6,0.6)";
  g.beginPath();
  g.arc(64, 64, 30, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#140406";
  g.beginPath();
  g.arc(64, 64, 11, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    const x = 64 + Math.cos(a) * 30;
    const y = 64 + Math.sin(a) * 30;
    g.beginPath();
    g.arc(x, y, 8, 0, Math.PI * 2);
    g.fill();
    // The comma's tail, curling along the ring.
    g.beginPath();
    g.moveTo(x + Math.cos(a + Math.PI / 2) * 8, y + Math.sin(a + Math.PI / 2) * 8);
    g.quadraticCurveTo(x + Math.cos(a + 1.2) * 22, y + Math.sin(a + 1.2) * 22, 64 + Math.cos(a + 0.75) * 31, 64 + Math.sin(a + 0.75) * 31);
    g.quadraticCurveTo(x + Math.cos(a + 0.6) * 12, y + Math.sin(a + 0.6) * 12, x + Math.cos(a - Math.PI / 2) * 8, y + Math.sin(a - Math.PI / 2) * 8);
    g.fill();
  }
  tomoeTex = new THREE.CanvasTexture(c);
  tomoeTex.colorSpace = THREE.SRGBColorSpace;
  return tomoeTex;
}

export class SpecialFx {
  private vfx: Vfx;
  /** Effects held on a fighter while its special lasts (glowing eyes), by its root. */
  private held = new Map<THREE.Object3D, { fx: Fx; obj: THREE.Object3D; update(me: FxFighter, t: number): void }>();
  private ticks = 0;
  constructor(vfx: Vfx) {
    this.vfx = vfx;
  }

  /**
   * Every frame, for each fighter: `fx` is the effect of the special it is in (or none).
   * Draws what lasts as long as the special does.
   */
  frame(fx: Fx | undefined, me: FxFighter, t: number): void {
    this.ticks++;
    let h = this.held.get(me.root);
    if (h && h.fx !== fx) {
      h.obj.parent?.remove(h.obj);
      this.held.delete(me.root);
      h = undefined;
    }
    if (fx === "chidori" && this.ticks % 2 === 0) {
      // The hand drags lightning along the ground as he runs: bolts from the fist to the
      // floor behind, and a scorch of light where they strike.
      const side = new THREE.Vector3().crossVectors(me.facing, UP);
      const ground = me.feet.clone().addScaledVector(me.facing, -rnd(0.2, 1.1)).addScaledVector(side, rnd(-0.35, 0.35));
      this.bolt(me.hand, ground, me.color, 0.1, 7);
      const scorch = added(glow, me.color, 0.7);
      scorch.position.copy(ground).setY(ground.y + 0.05);
      this.vfx.add(scorch, 0.3, (k) => {
        scorch.scale.setScalar(0.5 * (1 - k * 0.5));
        scorch.material.opacity = 0.7 * (1 - k);
      });
    }
    if (fx === "sharingan" && !h && me.model) {
      // Red eyes lit in the counter stance.
      const obj = new THREE.Group();
      // Painted red points (they hold against a pale wall), a red glow over them.
      const eyes = [-1, 1].map(() => {
        const e = painted(glow, 0xe00010, 1);
        e.scale.setScalar(0.1);
        e.renderOrder = 4;
        obj.add(e);
        return e;
      });
      const glare = added(glow, 0xff2020, 0.5);
      glare.scale.setScalar(0.5);
      obj.add(glare);
      me.root.parent?.add(obj);
      h = {
        fx,
        obj,
        update: (m, tt) => {
          const side = new THREE.Vector3().crossVectors(m.facing, UP);
          // Eye height of a 1.8 m figure, scaled with the fighter's on-screen size.
          const front = m.feet.clone().add(new THREE.Vector3(0, 1.6 * m.root.scale.y, 0)).addScaledVector(m.facing, 0.14);
          eyes.forEach((e, i) => e.position.copy(front).addScaledVector(side, i ? 0.035 : -0.035));
          glare.position.copy(front);
          glare.material.opacity = 0.45 + 0.15 * Math.sin(tt * 9);
        },
      };
      this.held.set(me.root, h);
    }
    h?.update(me, t);
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
    if (fx === "crescent") this.crescent(target.center, me.facing, me.accent);
    if (fx === "chidori") this.thunderclap(target.center, me.color);
    if (fx === "cross") this.cross(target.center, me.facing, me.accent);
    if (fx === "pow") this.pow(target.center, me.accent);
    if (fx === "claws") this.claws(target.center, me.facing, me.accent);
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

  /** A burst goes off round the fighter (`radius` metres). */
  blast(fx: Fx | undefined, me: FxFighter, at: THREE.Vector3, radius: number): void {
    if (fx === "windmill") this.windmill(at.clone().setY(me.center.y), radius, me.accent);
    if (fx === "flurry") this.flurry(at.clone().setY(me.center.y), radius, me.accent);
  }

  /** The counter triggers: `me` dodged `attacker`'s blow and reappears behind it. */
  counter(fx: Fx | undefined, me: FxFighter, attacker: FxFighter): void {
    if (fx === "whirl") this.whirl(me.center, me.accent);
    if (fx === "guard") this.guard(me.center, me.accent);
    if (fx === "enso") this.enso(me.center, me.accent);
    // (From the simulation's position: the drawn model has not caught up with the jump yet.)
    if (fx === "sharingan") this.tomoe(me.center.clone().add(new THREE.Vector3(0, 0.62, 0)).addScaledVector(me.facing, 0.35), attacker);
    if (fx === "substitution") {
      // Where the blow landed: a puff of smoke, and a log in his place.
      const spot = attacker.feet.clone().addScaledVector(attacker.facing, 1.1);
      this.smoke(spot.clone().setY(spot.y + 0.9), 1.4);
      this.log(spot, attacker.facing);
      this.smoke(me.center, 0.9);
    }
  }

  /** A flat sheet of light in the colour, added to the scene (for the cuts and rings). */
  private sheet(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, opacity: number): THREE.Mesh {
    return new THREE.Mesh(geo, noOutline(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })));
  }

  /**
   * Two blades crossed through the target (Leonardo): an X of light, white edges over
   * the mask colour, opening outward, with steel sparks.
   */
  private cross(at: THREE.Vector3, facing: THREE.Vector3, color: THREE.Color): void {
    const g = new THREE.Group();
    g.position.copy(at);
    g.rotation.y = Math.atan2(facing.x, facing.z) + Math.PI / 2;
    const light = color.clone().lerp(new THREE.Color(0xffffff), 0.5);
    const cuts = [-0.75, 0.75].map((a) => {
      const c = new THREE.Group();
      const band = this.sheet(new THREE.PlaneGeometry(2.6, 0.16), color, 0.6);
      const edge = this.sheet(new THREE.PlaneGeometry(2.6, 0.04), light, 1);
      c.add(band, edge);
      c.rotation.z = a;
      g.add(c);
      return { c, band, edge };
    });
    this.vfx.add(g, 0.35, (k) => {
      const draw = Math.min(1, k / 0.18);
      const fade = k < 0.4 ? 1 : (1 - k) / 0.6;
      cuts.forEach(({ c, band, edge }, i) => {
        // The second cut follows the first by a blink.
        const d = Math.max(0, Math.min(1, (draw - i * 0.3) / 0.7));
        c.scale.set(d, 1 + 0.6 * k, 1);
        (band.material as THREE.MeshBasicMaterial).opacity = 0.6 * fade;
        (edge.material as THREE.MeshBasicMaterial).opacity = fade;
      });
    });
    this.vfx.hit(at, light, false);
    this.vfx.shake = Math.max(this.vfx.shake, 0.4);
  }

  /**
   * The leader's guard holds (Leonardo's counter): two blades crossed before him flash,
   * steel rings out (sparks), a ring of the mask colour.
   */
  private guard(at: THREE.Vector3, color: THREE.Color): void {
    const g = new THREE.Group();
    g.position.copy(at);
    const light = color.clone().lerp(new THREE.Color(0xffffff), 0.6);
    const blades = [-0.8, 0.8].map((a) => {
      const m = this.sheet(new THREE.PlaneGeometry(0.05, 1.5), 0xffffff, 1);
      m.rotation.z = a;
      g.add(m);
      return m;
    });
    const star = added(glow, light, 1);
    g.add(star);
    this.vfx.add(g, 0.45, (k) => {
      for (const b of blades) (b.material as THREE.MeshBasicMaterial).opacity = 1 - k;
      star.scale.setScalar(1.2 * (1 - k) + 0.2);
      star.material.opacity = 1 - k;
    });
    this.vfx.ring(at, color, 2);
    this.vfx.hit(at, 0xe8f4ff, false);
  }

  /**
   * A comic-book impact (the Turtles): a jagged star of yellow and the colour, black
   * outlined, popping big and shrinking, with speed streaks round it.
   */
  private pow(at: THREE.Vector3, color: THREE.Color): void {
    const s = painted(powTexture(), 0xffffff, 1);
    s.position.copy(at);
    s.renderOrder = 5;
    s.material.rotation = rnd(-0.4, 0.4);
    const inner = painted(powTexture(), color, 0.9);
    inner.position.copy(at);
    inner.renderOrder = 6;
    inner.material.rotation = s.material.rotation + 0.3;
    const g = new THREE.Group();
    g.add(s, inner);
    this.vfx.add(g, 0.4, (k) => {
      const pop = k < 0.12 ? 0.6 + 4 * k : 1.08 - 0.25 * (k - 0.12);
      s.scale.setScalar(1.7 * pop);
      inner.scale.setScalar(0.95 * pop);
      const o = k < 0.6 ? 1 : (1 - k) / 0.4;
      s.material.opacity = o;
      inner.material.opacity = 0.9 * o;
    });
    this.vfx.speedLines(at, new THREE.Vector3(0, 1, 0), 0xffffff);
    this.vfx.shake = Math.max(this.vfx.shake, 0.45);
  }

  /**
   * Shredder's claws: three parallel rakes of light torn diagonally across the target,
   * dark red edged in pale steel.
   */
  private claws(at: THREE.Vector3, facing: THREE.Vector3, color: THREE.Color): void {
    const g = new THREE.Group();
    g.position.copy(at);
    g.rotation.y = Math.atan2(facing.x, facing.z) + Math.PI / 2;
    const rakes = [-0.22, 0, 0.22].map((off) => {
      const r = new THREE.Group();
      const band = this.sheet(new THREE.PlaneGeometry(2, 0.12), color, 0.75);
      const edge = this.sheet(new THREE.PlaneGeometry(2, 0.035), 0xe8ecf4, 1);
      r.add(band, edge);
      r.position.y = off;
      g.add(r);
      return { r, band, edge };
    });
    g.rotation.z = -0.6;
    this.vfx.add(g, 0.35, (k) => {
      const draw = Math.min(1, k / 0.15);
      const fade = k < 0.4 ? 1 : (1 - k) / 0.6;
      rakes.forEach(({ r, band, edge }, i) => {
        r.scale.set(Math.max(0.01, Math.min(1, draw * 1.3 - i * 0.15)), 1, 1);
        (band.material as THREE.MeshBasicMaterial).opacity = 0.75 * fade;
        (edge.material as THREE.MeshBasicMaterial).opacity = fade;
      });
    });
    this.vfx.hit(at, 0xe8ecf4, false);
    this.vfx.shake = Math.max(this.vfx.shake, 0.45);
  }

  /**
   * A weapon whirled round (bō, nunchaku, staff): two rings of motion blur, flat and
   * tilted, spinning out to the burst's reach, with wind thrown off them.
   */
  private windmill(at: THREE.Vector3, radius: number, color: THREE.Color): void {
    const g = new THREE.Group();
    g.position.copy(at);
    const light = color.clone().lerp(new THREE.Color(0xffffff), 0.5);
    const rings = [0, 0.5].map((tilt, i) => {
      const r = new THREE.Group();
      // In the colour, not white: on the pale paving, added white only washes out.
      const blur = this.sheet(new THREE.RingGeometry(0.55, 1, 64, 1, 0, Math.PI * 1.5), color, 0.5);
      const edge = this.sheet(new THREE.RingGeometry(0.95, 1, 64, 1, 0, Math.PI * 1.5), i ? color : light, 0.6);
      blur.rotation.x = edge.rotation.x = -Math.PI / 2;
      r.add(blur, edge);
      r.rotation.z = tilt;
      g.add(r);
      return { r, blur, edge };
    });
    const dust = at.clone().setY(Math.max(0, at.y - 0.9));
    this.vfx.dust(dust, 10);
    this.vfx.add(g, 0.5, (k) => {
      const grow = 0.4 + 0.6 * (1 - (1 - Math.min(1, k / 0.4)) ** 2);
      const fade = k < 0.5 ? 1 : (1 - k) / 0.5;
      rings.forEach(({ r, blur, edge }, i) => {
        r.scale.setScalar(radius * grow * (i ? 0.8 : 1));
        r.rotation.y = (i ? -1 : 1) * k * 22;
        (blur.material as THREE.MeshBasicMaterial).opacity = 0.5 * fade;
        (edge.material as THREE.MeshBasicMaterial).opacity = 0.6 * fade;
      });
    });
  }

  /**
   * Raphaël's fury: a storm of quick stabs all round him, short bright thrusts in every
   * direction, one after another.
   */
  private flurry(at: THREE.Vector3, radius: number, color: THREE.Color): void {
    const light = color.clone().lerp(new THREE.Color(0xffffff), 0.5);
    for (let i = 0; i < 14; i++) {
      const dir = new THREE.Vector3(rnd(-1, 1), rnd(-0.5, 0.6), rnd(-1, 1)).normalize();
      const len = radius * rnd(0.6, 1);
      const stab = this.sheet(new THREE.PlaneGeometry(len, 0.07), i % 2 ? light : color, 0.9);
      const g = new THREE.Group();
      g.position.copy(at);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir);
      stab.position.x = len / 2;
      g.add(stab);
      const delay = (i / 14) * 0.6;
      this.vfx.add(g, 0.35, (k) => {
        const kk = Math.max(0, (k - delay) / (1 - delay));
        // Thrust out fast, then thin away.
        g.scale.set(Math.min(1, kk * 4) + 0.001, 1 - kk, 1);
        (stab.material as THREE.MeshBasicMaterial).opacity = kk > 0 ? 0.9 * (1 - kk) : 0;
      });
    }
    this.vfx.ring(at, color, radius * 2);
  }

  /**
   * The master's calm (Splinter's aiki): a brush circle, the ensō, painted round him in
   * one stroke of black ink over a glow of the colour, then it fades like ink drying.
   */
  private enso(at: THREE.Vector3, color: THREE.Color): void {
    const s = painted(ensoTexture(), 0x1a1414, 1);
    s.position.copy(at);
    s.renderOrder = 5;
    const back = added(glow, color.clone().lerp(new THREE.Color(0xffffff), 0.4), 0.5);
    back.position.copy(at);
    const g = new THREE.Group();
    g.add(back, s);
    this.vfx.add(g, 0.8, (k) => {
      s.scale.setScalar(2.2 + 0.3 * k);
      s.material.rotation = -0.4 + 0.25 * k;
      s.material.opacity = k < 0.6 ? Math.min(1, k * 8) : (1 - k) / 0.4;
      back.scale.setScalar(2.4);
      back.material.opacity = 0.5 * (1 - k);
    });
  }

  /**
   * A jagged bolt of lightning from `a` to `b` (`kinks` segments, offsets up to 18 % of
   * its length), redrawn twice during its short life so it flickers.
   */
  private bolt(a: THREE.Vector3, b: THREE.Vector3, color: THREE.ColorRepresentation, life: number, kinks: number): void {
    const n = kinks;
    const pos = new Float32Array((n + 1) * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const len = a.distanceTo(b);
    const shape = () => {
      for (let i = 0; i <= n; i++) {
        const p = a.clone().lerp(b, i / n);
        if (i > 0 && i < n) p.add(new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).multiplyScalar(len * 0.18));
        pos.set([p.x, p.y, p.z], i * 3);
      }
      geo.attributes.position!.needsUpdate = true;
    };
    shape();
    const core = new THREE.Line(geo, noOutline(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
    const glowLine = new THREE.Line(geo, noOutline(new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })));
    glowLine.scale.setScalar(1.002);
    const g = new THREE.Group();
    g.add(glowLine, core);
    core.frustumCulled = glowLine.frustumCulled = false;
    let flips = 0;
    this.vfx.add(g, life, (k) => {
      if (k > 0.5 && flips === 0) {
        flips++;
        shape();
      }
      (core.material as THREE.LineBasicMaterial).opacity = 1 - k;
      (glowLine.material as THREE.LineBasicMaterial).opacity = 0.8 * (1 - k);
    });
  }

  /**
   * The Chidori strikes home: bolts burst out of the target all round, a blue-white
   * flash, a ring of lightning on the ground.
   */
  private thunderclap(at: THREE.Vector3, color: THREE.Color): void {
    for (let i = 0; i < 12; i++) {
      const d = new THREE.Vector3(rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1)).normalize();
      this.bolt(at, at.clone().addScaledVector(d, rnd(0.9, 2)), color, rnd(0.12, 0.22), 8);
    }
    const flash = added(glow, color, 0.9);
    flash.position.copy(at);
    this.vfx.add(flash, 0.25, (k) => {
      flash.scale.setScalar(2.4 * (0.5 + k));
      flash.material.opacity = 0.9 * (1 - k) * (1 - k);
    });
    const ground = at.clone().setY(Math.max(0, at.y - 0.9));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      this.bolt(ground, ground.clone().add(new THREE.Vector3(Math.cos(a), 0.02, Math.sin(a)).multiplyScalar(rnd(1, 1.8))), color, 0.2, 6);
    }
    this.vfx.groundWave(ground, color, 2.6);
    this.vfx.shake = Math.max(this.vfx.shake, 0.5);
  }

  /**
   * The Sharingan sees the blow coming: its pattern (red iris, three black commas)
   * flares before his face and spins, and the attacker is caught in a red glare.
   */
  private tomoe(at: THREE.Vector3, attacker: FxFighter): void {
    const s = painted(tomoeTexture(), 0xffffff, 1);
    s.position.copy(at);
    s.renderOrder = 5;
    this.vfx.add(s, 0.65, (k) => {
      const pop = Math.min(1, k / 0.15);
      s.scale.setScalar(0.2 + 0.6 * pop * (1 - 0.15 * k));
      s.material.rotation = -k * 7;
      s.material.opacity = k < 0.6 ? 1 : (1 - k) / 0.4;
    });
    const glare = added(glow, 0xff1a1a, 0.6);
    glare.position.copy(attacker.center);
    this.vfx.add(glare, 0.4, (k) => {
      glare.scale.setScalar(2.2);
      glare.material.opacity = 0.6 * (1 - k);
    });
  }

  /**
   * A blade falling from the sky: a tall crescent of light cut top to bottom through the
   * target (white edge, a tail of the fighter's colour), then the ground splits under it.
   */
  private crescent(at: THREE.Vector3, facing: THREE.Vector3, color: THREE.Color): void {
    const g = new THREE.Group();
    g.position.copy(at);
    // The arc stands in the plane of the blow (facing and up), seen side on by the camera.
    g.rotation.y = Math.atan2(facing.x, facing.z) - Math.PI / 2;
    const arc = (r: number, w: number, c: THREE.ColorRepresentation, o: number) => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(r - w, r, 48, 1, -Math.PI * 0.15, Math.PI * 0.75),
        noOutline(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })),
      );
      g.add(m);
      return m;
    };
    const light = color.clone().lerp(new THREE.Color(0xffffff), 0.55);
    const tail = arc(1.5, 0.45, color, 0.45);
    const edge = arc(1.5, 0.07, light, 0.85);
    this.vfx.add(g, 0.32, (k) => {
      // Sweeps down (the arc turns), thins out and fades.
      g.rotation.z = -1.2 * Math.min(1, k / 0.35);
      const fade = k < 0.35 ? 1 : (1 - k) / 0.65;
      (tail.material as THREE.MeshBasicMaterial).opacity = 0.45 * fade;
      (edge.material as THREE.MeshBasicMaterial).opacity = 0.85 * fade;
      edge.scale.setScalar(1 + 0.08 * k);
    });
    const ground = at.clone().setY(Math.max(0, at.y - 0.9));
    this.vfx.groundWave(ground, light, 2.6);
    this.vfx.debris(ground, 0x9a8f80, 12, 0.18, 0.6);
    this.vfx.dust(ground, 8);
    this.vfx.shake = Math.max(this.vfx.shake, 0.55);
  }

  /**
   * A full turn of the blade round the fighter, at the waist: a flat ring of light that
   * opens out, white at its leading edge, with wind thrown off it.
   */
  private whirl(at: THREE.Vector3, color: THREE.Color): void {
    const g = new THREE.Group();
    g.position.copy(at);
    const ring = (inner: number, c: THREE.ColorRepresentation, o: number) => {
      const m = new THREE.Mesh(
        new THREE.RingGeometry(inner, 1, 64, 1, 0, Math.PI * 1.8),
        noOutline(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })),
      );
      m.rotation.x = -Math.PI / 2;
      g.add(m);
      return m;
    };
    const light = color.clone().lerp(new THREE.Color(0xffffff), 0.55);
    const band = ring(0.72, color, 0.4);
    const edge = ring(0.94, light, 0.85);
    const wind = Array.from({ length: 12 }, (_, i) => {
      const s = added(glow, i % 2 ? light : color, 0.8);
      g.add(s);
      return { s, a: (i / 12) * Math.PI * 2 };
    });
    this.vfx.add(g, 0.4, (k) => {
      const r = 0.6 + 1.6 * (1 - (1 - k) ** 2);
      const fade = 1 - k;
      for (const m of [band, edge]) {
        m.scale.setScalar(r);
        m.rotation.z = -k * 9;
      }
      (band.material as THREE.MeshBasicMaterial).opacity = 0.4 * fade;
      (edge.material as THREE.MeshBasicMaterial).opacity = 0.85 * fade;
      for (const w of wind) {
        const a = w.a - k * 9;
        w.s.position.set(Math.cos(a) * r * 1.1, 0, Math.sin(a) * r * 1.1);
        w.s.scale.set(0.3 * fade, 0.08, 1);
        w.s.material.opacity = 0.8 * fade;
      }
    });
    this.vfx.shake = Math.max(this.vfx.shake, 0.35);
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
        noOutline(new THREE.MeshBasicMaterial({ map: swirlTexture(), color: i ? tint : 0xcfeeff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })),
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
        (b.material as THREE.MeshBasicMaterial).opacity = (i ? 0.8 : 0.45) * fade;
      });
      heart.scale.setScalar(0.5 * r);
      heart.material.opacity = 0.8 * fade;
      halo.scale.setScalar(2.4 * r);
      halo.material.opacity = 0.3 * fade;
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

/**
 * Afterimages: fading copies of the fighter, in its pose of the moment, left behind as
 * it dashes (rush, dive). A few copies are made once and reused.
 */
export class GhostTrail {
  private scene: THREE.Scene;
  private model: THREE.Object3D;
  private color: THREE.Color;
  private pool: { holder: THREE.Group; pairs: [THREE.Object3D, THREE.Object3D][]; mat: THREE.MeshBasicMaterial; age: number }[] = [];
  private static readonly LIFE = 0.28;
  private static readonly MAX = 6;

  constructor(scene: THREE.Scene, model: THREE.Object3D, color: THREE.ColorRepresentation) {
    this.scene = scene;
    this.model = model;
    this.color = new THREE.Color(color);
  }

  /** Leaves a copy where the fighter is now. */
  drop(): void {
    let g = this.pool.find((p) => p.age >= GhostTrail.LIFE);
    if (!g) {
      if (this.pool.length >= GhostTrail.MAX) return;
      const copy = SkeletonUtils.clone(this.model);
      // Painted, not added: a tinted see-through copy that stays readable on a pale wall.
      const mat = noOutline(new THREE.MeshBasicMaterial({ color: this.color, transparent: true, opacity: 0, depthWrite: false }));
      copy.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.material = mat;
          o.castShadow = o.receiveShadow = false;
        }
        if (o instanceof THREE.Sprite || o instanceof THREE.Points || o instanceof THREE.Line) o.visible = false;
      });
      const holder = new THREE.Group();
      holder.matrixAutoUpdate = false;
      holder.add(copy);
      const src: THREE.Object3D[] = [];
      const dst: THREE.Object3D[] = [];
      this.model.traverse((o) => src.push(o));
      copy.traverse((o) => dst.push(o));
      g = { holder, pairs: src.length === dst.length ? src.map((o, i) => [o, dst[i]!]) : [], mat, age: GhostTrail.LIFE };
      this.pool.push(g);
      this.scene.add(holder);
    }
    for (const [a, b] of g.pairs) {
      b.position.copy(a.position);
      b.quaternion.copy(a.quaternion);
      b.scale.copy(a.scale);
    }
    this.model.parent?.updateMatrixWorld(true);
    g.holder.matrix.copy(this.model.parent?.matrixWorld ?? new THREE.Matrix4());
    g.holder.matrixWorldNeedsUpdate = true;
    g.holder.visible = true;
    g.age = 0;
  }

  update(dt: number): void {
    for (const g of this.pool) {
      if (g.age >= GhostTrail.LIFE) continue;
      g.age += dt;
      const k = Math.min(1, g.age / GhostTrail.LIFE);
      g.mat.opacity = 0.32 * (1 - k);
      if (k >= 1) g.holder.visible = false;
    }
  }

  dispose(): void {
    for (const g of this.pool) {
      this.scene.remove(g.holder);
      g.mat.dispose();
    }
    this.pool = [];
  }
}
