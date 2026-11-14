// Anime impact effects: spark stars, streaks, shockwave rings, slash arcs,
// speed lines and dust. All additive sprites or flat meshes, no outlines,
// each with a short life. Purely visual: nothing here touches the simulation.

import * as THREE from "three";
import { deepen } from "./energy.ts";
import { GroundMarks, LightPool, ParticleSystem, ScreenFx, Sprite, type Emit } from "./fxkit.ts";
import { flameTexture, puffTexture } from "./moveFx.ts";
import { glowTexture, noOutline, starTexture, toon } from "./toon.ts";

// ---------------------------------------------------------------------------
// Textures painted once: an anime impact burst (sharp rays), a soft shockwave ring,
// a spark streak (bright head, fading tail) and a hexagonal guard.

const painted = new Map<string, THREE.CanvasTexture>();
function paintTexture(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const hit = painted.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  painted.set(key, t);
  return t;
}

/** Sharp rays of uneven length round a hot core: the « bam » of an anime impact. */
const burstTexture = () =>
  paintTexture("burst", 256, 256, (g) => {
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    g.translate(128, 128);
    const rays = 14;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2 + (r() - 0.5) * 0.25;
      const len = 60 + r() * 66;
      const w = 0.09 + r() * 0.06;
      const grad = g.createLinearGradient(0, 0, Math.cos(a) * len, Math.sin(a) * len);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(0.6, "rgba(255,255,255,0.85)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(Math.cos(a - w) * 14, Math.sin(a - w) * 14);
      g.lineTo(Math.cos(a) * len, Math.sin(a) * len);
      g.lineTo(Math.cos(a + w) * 14, Math.sin(a + w) * 14);
      g.fill();
    }
    const core = g.createRadialGradient(0, 0, 0, 0, 0, 40);
    core.addColorStop(0, "rgba(255,255,255,1)");
    core.addColorStop(0.5, "rgba(255,255,255,0.8)");
    core.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = core;
    g.fillRect(-40, -40, 80, 80);
  });

/** A shockwave: clear inside, a bright thin front, a soft wake behind it. */
const ringTexture = () =>
  paintTexture("ring", 256, 256, (g) => {
    const grad = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.78, "rgba(255,255,255,0)");
    grad.addColorStop(0.88, "rgba(255,255,255,0.3)");
    grad.addColorStop(0.94, "rgba(255,255,255,1)");
    grad.addColorStop(0.985, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  });

/** A spark streak, pointing up: white-hot head, a tail that thins and fades. */
const sparkTexture = () =>
  paintTexture("spark", 32, 128, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.25, "rgba(255,255,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(16, 0);
    g.quadraticCurveTo(30, 10, 16, 128);
    g.quadraticCurveTo(2, 10, 16, 0);
    g.fill();
  });

/** A hexagonal guard: a bright rim and a faint fill. */
const hexTexture = () =>
  paintTexture("hex", 256, 256, (g) => {
    const hex = (rad: number) => {
      g.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        const x = 128 + Math.cos(a) * rad;
        const y = 128 + Math.sin(a) * rad;
        if (i) g.lineTo(x, y);
        else g.moveTo(x, y);
      }
    };
    hex(116);
    g.fillStyle = "rgba(255,255,255,0.18)";
    g.fill();
    g.lineWidth = 10;
    g.strokeStyle = "rgba(255,255,255,1)";
    g.stroke();
    hex(84);
    g.lineWidth = 3;
    g.strokeStyle = "rgba(255,255,255,0.6)";
    g.stroke();
  });

interface Effect {
  obj: THREE.Object3D;
  age: number;
  life: number;
  /** k goes 0 → 1 over the effect's life. */
  update: (k: number, dt: number) => void;
  keep: boolean;
}

export class Vfx {
  private effects: Effect[] = [];
  private glow = glowTexture();
  private star = starTexture();
  private scene: THREE.Scene;
  /** Camera shake amplitude, decays by itself. */
  shake = 0;
  /** Light particles (sparks, fire, glows) and blended ones (smoke, dust). */
  readonly glowParts: ParticleSystem;
  readonly smokeParts: ParticleSystem;
  /** Point lights lent to impacts, fireballs, explosions. */
  readonly lights: LightPool;
  /** Scorches and cracks on the ground. */
  readonly marks: GroundMarks;
  /** What the effects ask of the picture (read by the post-processing). */
  readonly screen = new ScreenFx();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.glowParts = new ParticleSystem(8000, true);
    this.smokeParts = new ParticleSystem(3000, false);
    scene.add(this.glowParts.mesh, this.smokeParts.mesh);
    this.lights = new LightPool(scene, 4);
    this.marks = new GroundMarks(scene);
  }

  /** Light particles: sparks, embers, fire, glows. */
  spark(e: Emit, count = 1): void {
    this.glowParts.emit(e, count);
  }

  /** Blended particles: smoke, dust. */
  smoke(e: Emit, count = 1): void {
    this.smokeParts.emit(e, count);
  }

  /**
   * Adds a short-lived effect, driven by `update(k, dt)` (k 0 → 1 over `life` seconds).
   * `keep`: its geometries and materials are shared (a copy of a fighter): not disposed.
   */
  add(obj: THREE.Object3D, life: number, update: Effect["update"], keep = false): void {
    this.scene.add(obj);
    this.effects.push({ obj, age: 0, life, update, keep });
  }

  private sprite(map: THREE.Texture, color: THREE.ColorRepresentation, opacity = 1): THREE.Sprite {
    const m = noOutline(
      new THREE.SpriteMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    return new THREE.Sprite(m);
  }

  /**
   * Hit: a white-hot flash, an anime burst of sharp rays (white over the attacker's
   * colour), sparks that fly off, fall and stretch with their speed, a shockwave ring.
   */
  hit(pos: THREE.Vector3, color: THREE.ColorRepresentation, big: boolean): void {
    const size = big ? 1.7 : 1.1;
    const tint = new THREE.Color(color);
    const deep = deepen(tint);
    const hot = deep.clone().lerp(new THREE.Color(1, 1, 1), 0.3);
    // A short, tight white core (not a blob that hides the fighters).
    const flash = this.sprite(this.glow, hot, 0.7);
    flash.position.copy(pos);
    this.add(flash, 0.06, (k) => {
      flash.scale.setScalar(size * 0.55 * (0.6 + k * 0.6));
      flash.material.opacity = 0.9 * (1 - k);
    });
    const spin = Math.random() * Math.PI;
    const back = this.sprite(burstTexture(), deep);
    back.position.copy(pos);
    back.material.rotation = spin + 0.2;
    this.add(back, big ? 0.22 : 0.15, (k) => {
      back.scale.setScalar(size * 1.25 * (0.5 + Math.sqrt(k) * 0.75));
      back.material.opacity = 0.9 * (1 - k * k);
    });
    const burst = this.sprite(burstTexture(), hot);
    burst.position.copy(pos);
    burst.material.rotation = spin;
    this.add(burst, big ? 0.14 : 0.1, (k) => {
      burst.scale.setScalar(size * 0.8 * (0.5 + Math.sqrt(k) * 0.6));
      burst.material.opacity = 0.55 * (1 - k);
    });
    // Sparks: many, fast, white-hot, cooling to the blow's colour as they fall.
    const n = big ? 34 : 16;
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 - 0.2, Math.random() - 0.5).normalize().multiplyScalar((big ? 9 : 6) + Math.random() * (big ? 12 : 7));
      this.spark({
        pos, vel: v, life: 0.22 + Math.random() * 0.3, size: [0.045, 0.02], stretch: 0.045,
        color: [hot.clone().multiplyScalar(1.9), deep.clone().multiplyScalar(1.5)], alpha: [1, 0],
        sprite: Sprite.Spark, drag: 3.5, gravity: 14,
      });
    }
    // A few slower glowing motes that linger.
    for (let i = 0; i < (big ? 10 : 4); i++)
      this.spark({
        pos, vel: new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(3), life: 0.4 + Math.random() * 0.35,
        size: [0.12, 0.02], color: [hot.clone().multiplyScalar(1.6), deep.clone().multiplyScalar(1.2)], sprite: Sprite.Glow, drag: 2.5, gravity: -1,
      });
    // The blow lights its surroundings for an instant.
    this.lights.flash(pos, hot, big ? 7 : 3, big ? 6 : 4, big ? 0.22 : 0.12);
    if (big) {
      this.ring(pos, color, 3.2);
      this.screen.ripple(pos, 0.012, 2.4, 0.4);
      this.screen.kick(0.006);
    }
    this.shake = Math.max(this.shake, big ? 0.35 : 0.12);
  }

  /**
   * An explosion (rockets, fireballs, blasts): a white flash, a rolling fireball that
   * climbs and darkens into smoke, embers thrown out, a shockwave that bends the air,
   * dust along the ground, a scorch left behind, the street lit orange for a moment.
   */
  explode(pos: THREE.Vector3, size: number, color: THREE.ColorRepresentation = 0xff7a1a, ground?: number): void {
    const fire = new THREE.Color(color);
    const floor = ground ?? pos.y - 0.6;
    this.lights.flash(pos.clone().setY(pos.y + 0.5), fire.clone().lerp(new THREE.Color(1, 0.85, 0.6), 0.4), 16 * size, 10 * size, 0.7);
    // Flash.
    this.spark({ pos, life: 0.1, size: [0.9 * size, 1.9 * size], color: [new THREE.Color(2.3, 1.45, 0.6), new THREE.Color(1.6, 0.6, 0.15)], sprite: Sprite.Glow });
    // Fireball: puffs of light, hot yellow to deep red, swelling and rising.
    const puffs = Math.round(20 * size);
    for (let i = 0; i < puffs; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize();
      const sp = (2.5 + Math.random() * 5) * size;
      this.spark({
        pos: pos.clone().addScaledVector(dir, 0.15 * size), vel: dir.multiplyScalar(sp), life: 0.45 + Math.random() * 0.45,
        size: [0.45 * size, (0.9 + Math.random() * 0.6) * size],
        color: [new THREE.Color(2.3, 0.95, 0.22), fire.clone().multiplyScalar(0.45)], alpha: [0.85, 0],
        sprite: Sprite.Smoke, drag: 3.2, gravity: -2.2, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 2,
      });
    }
    // Inner tongues of flame.
    for (let i = 0; i < Math.round(10 * size); i++) {
      const a = Math.random() * Math.PI * 2;
      this.spark({
        pos, vel: new THREE.Vector3(Math.cos(a) * 2, 3 + Math.random() * 3, Math.sin(a) * 2).multiplyScalar(size), life: 0.35 + Math.random() * 0.25,
        size: [0.5 * size, 0.9 * size], color: [new THREE.Color(2.6, 1.6, 0.6), new THREE.Color(1.2, 0.3, 0.06)], sprite: Sprite.Flame, drag: 2.5, gravity: -3,
      });
    }
    // Smoke: dark, slow, climbing and spreading after the fire.
    for (let i = 0; i < Math.round(16 * size); i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, 0.6 + Math.random() * 0.6, Math.random() - 0.5);
      const grey = 0.05 + Math.random() * 0.05;
      this.smoke({
        pos: pos.clone().addScaledVector(dir, 0.3 * size), vel: dir.multiplyScalar((1.2 + Math.random() * 2) * size), life: 1.6 + Math.random() * 1.2,
        size: [0.7 * size, (2 + Math.random()) * size], color: [new THREE.Color(grey * 1.3, grey * 1.15, grey), new THREE.Color(grey * 1.8, grey * 1.75, grey * 1.7)],
        alpha: [0.8, 0], sprite: Sprite.Smoke, drag: 1.4, gravity: -0.7, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.8,
        delay: 0.08 + Math.random() * 0.2,
      });
    }
    // Embers: thrown out, falling, streaking.
    for (let i = 0; i < Math.round(46 * size); i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.1, Math.random() - 0.5).normalize().multiplyScalar((7 + Math.random() * 14) * size);
      this.spark({
        pos, vel: v, life: 0.5 + Math.random() * 0.9, size: [0.05, 0.025], stretch: 0.035,
        color: [new THREE.Color(3, 1.9, 0.7), new THREE.Color(1.4, 0.3, 0.05)], sprite: Sprite.Spark, drag: 1.4, gravity: 12,
      });
    }
    // Dust kicked along the ground, and the shockwave.
    this.dustRing(new THREE.Vector3(pos.x, floor, pos.z), 2.4 * size, 18);
    this.groundWave(new THREE.Vector3(pos.x, floor, pos.z), color, 2.4 * size);
    this.marks.add(new THREE.Vector3(pos.x, floor, pos.z), 3.4 * size, "scorch", 7);
    this.screen.ripple(pos, 0.025 * Math.min(1.6, size), 4.5 * size, 0.6);
    this.screen.kick(0.012 * Math.min(1.5, size), 0.06, 0xffb070);
    this.shake = Math.max(this.shake, 0.4 * size);
  }

  /** Dust thrown out in a ring along the ground (landings, slams, blasts). */
  dustRing(at: THREE.Vector3, size: number, count = 12): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const v = new THREE.Vector3(Math.cos(a), 0.15 + Math.random() * 0.3, Math.sin(a)).multiplyScalar(size * (1.6 + Math.random() * 1.2));
      const tone = 0.32 + Math.random() * 0.1;
      this.smoke({
        pos: at.clone().setY(at.y + 0.15), vel: v, life: 0.6 + Math.random() * 0.4, size: [0.3 * size, 0.8 * size],
        color: [new THREE.Color(tone, tone * 0.9, tone * 0.78), new THREE.Color(tone, tone * 0.93, tone * 0.82)], alpha: [0.45, 0],
        sprite: Sprite.Dust, drag: 3, gravity: -0.3, rot: Math.random() * 6.28, spin: (Math.random() - 0.5),
      });
    }
  }

  /** A trail left by something in flight: a few motes along its path. */
  trail(at: THREE.Vector3, dir: THREE.Vector3, color: THREE.ColorRepresentation, size: number, count = 2): void {
    // Deep colour, faint: a wake overlaps itself a dozen times, a bright one turns to fog.
    const c = deepen(color);
    for (let i = 0; i < count; i++) {
      const jitter = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(size * 0.6);
      this.spark({
        pos: at.clone().add(jitter), vel: dir.clone().multiplyScalar(-1.5).add(jitter.multiplyScalar(2)), life: 0.25 + Math.random() * 0.2,
        size: [size * 0.55, size * 0.1], color: [c.clone().multiplyScalar(1.3), c.clone().multiplyScalar(0.7)], alpha: [0.45, 0], sprite: Sprite.Glow, drag: 3,
      });
    }
  }

  /** Energy being gathered: motes drawn in towards a point (a charging technique). */
  gather(at: THREE.Vector3, color: THREE.ColorRepresentation, radius: number, count = 3): void {
    const c = new THREE.Color(color);
    for (let i = 0; i < count; i++) {
      const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      const from = at.clone().addScaledVector(dir, radius * (0.7 + Math.random() * 0.5));
      const life = 0.3 + Math.random() * 0.15;
      // Speed so that it reaches the point at the end of its life (drag 0).
      this.spark({
        pos: from, vel: at.clone().sub(from).divideScalar(life), life, size: [0.03, 0.09], stretch: 0.03,
        color: [c.clone().multiplyScalar(0.9), c.clone().lerp(new THREE.Color(1, 1, 1), 0.25).multiplyScalar(1.5)], alpha: [0.15, 0.8], sprite: Sprite.Spark,
      });
    }
  }

  /** Sparks: fly off, fall, stretched along their motion as seen on screen. */
  private sparks(pos: THREE.Vector3, color: THREE.ColorRepresentation, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 - 0.15, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      const s = this.sprite(sparkTexture(), i % 3 === 0 ? 0xffffff : color);
      const at = pos.clone();
      s.position.copy(at);
      const life = 0.22 + Math.random() * 0.18;
      this.add(s, life, (k, dt) => {
        v.y -= 18 * dt;
        v.multiplyScalar(Math.exp(-dt * 3));
        at.addScaledVector(v, dt);
        s.position.copy(at);
        const len = 0.12 + v.length() * 0.05;
        s.scale.set(0.09 * (1 - k * 0.5), len * (1 - k * 0.6), 1);
        s.material.opacity = 1 - k * k;
      });
      s.onBeforeRender = (_r, _s, cam) => {
        const a = at.clone().project(cam);
        const b = at.clone().add(v.clone().multiplyScalar(0.05)).project(cam);
        s.material.rotation = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
      };
    }
  }

  /**
   * Impact frame (a K.O.): for a blink, a huge burst of rays over everything around
   * the victim, the « freeze » of anime fighters and Smash.
   */
  impact(pos: THREE.Vector3, color: THREE.ColorRepresentation): void {
    // The inverted « impact frame », a zoom blur on the victim, a big shockwave.
    this.screen.invert = 0.07;
    this.screen.zoomTo(pos, 0.9);
    this.screen.ripple(pos, 0.035, 6, 0.7);
    this.screen.kick(0.02);
    this.lights.flash(pos, color, 14, 10, 0.5);
    for (const [tint, size, life, turn, alpha] of [[color, 8, 0.2, 0.15, 0.75], [0xffffff, 4.5, 0.12, 0, 0.55]] as const) {
      const s = this.sprite(burstTexture(), tint);
      s.material.depthTest = false;
      s.renderOrder = 9;
      s.position.copy(pos);
      s.material.rotation = Math.random() * Math.PI + turn;
      this.add(s, life, (k) => {
        s.scale.setScalar(size * (0.8 + k * 0.35));
        s.material.opacity = alpha * (k < 0.3 ? 1 : 1 - (k - 0.3) / 0.7);
      });
    }
  }

  /** Blocked hit: a hexagonal guard flashes up, sparks glance off it. */
  block(pos: THREE.Vector3): void {
    const hex = this.sprite(hexTexture(), 0x8fe4ff);
    hex.position.copy(pos);
    hex.material.rotation = (Math.random() - 0.5) * 0.3;
    this.add(hex, 0.22, (k) => {
      const pop = k < 0.2 ? 0.7 + (k / 0.2) * 0.35 : 1.05 + (k - 0.2) * 0.15;
      hex.scale.setScalar(1.9 * pop);
      hex.material.opacity = k < 0.2 ? 1 : 1 - (k - 0.2) / 0.8;
    });
    const flash = this.sprite(this.glow, 0x7fdcff, 0.8);
    flash.position.copy(pos);
    this.add(flash, 0.12, (k) => {
      flash.scale.setScalar(1.4 + k);
      flash.material.opacity = 0.8 * (1 - k);
    });
    this.sparks(pos, 0xbff6ff, 6, 6);
    this.shake = Math.max(this.shake, 0.06);
  }

  /** Expanding ring facing the camera. */
  ring(pos: THREE.Vector3, color: THREE.ColorRepresentation, size: number): void {
    const m = noOutline(new THREE.MeshBasicMaterial({ color, map: ringTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
    ring.position.copy(pos);
    // A sharp, quick shockwave: it reads as a snap, not as a veil over the fighters.
    this.add(ring, 0.24, (k) => {
      ring.scale.setScalar(size * 0.5 * (0.25 + (1 - (1 - k) ** 3) * 0.8));
      m.opacity = 0.4 * (1 - k) ** 1.5;
    });
    ring.onBeforeRender = (_r, _s, cam) => ring.quaternion.copy(cam.quaternion);
  }

  /**
   * A bolt of lightning striking the ground at `pos` from high above: a jagged white
   * line with a coloured glow down its length, a flash where it lands, gone in a blink.
   */
  bolt(pos: THREE.Vector3, color: THREE.ColorRepresentation, height = 14): void {
    const pts: number[] = [];
    let x = 0;
    let z = 0;
    const n = 14;
    for (let i = 0; i < n; i++) {
      const y0 = height * (1 - i / n);
      const y1 = height * (1 - (i + 1) / n);
      const nx = i === n - 1 ? 0 : x + (Math.random() - 0.5) * 1.2;
      const nz = i === n - 1 ? 0 : z + (Math.random() - 0.5) * 1.2;
      pts.push(x, y0, z, nx, y1, nz);
      x = nx;
      z = nz;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    const core = noOutline(new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const group = new THREE.Group();
    group.add(new THREE.LineSegments(geo, core));
    const sheath = this.sprite(this.glow, color, 0.7);
    sheath.scale.set(1.6, height, 1);
    sheath.position.y = height / 2;
    const flash = this.sprite(this.glow, 0xffffff);
    flash.scale.setScalar(3.5);
    flash.position.y = 0.4;
    group.add(sheath, flash);
    group.position.copy(pos);
    this.add(group, 0.35, (k) => {
      // It flickers out: on, off, on, fading.
      const on = k < 0.15 || (k > 0.3 && k < 0.5) ? 1 : 0.35;
      core.opacity = on * (1 - k);
      sheath.material.opacity = 0.7 * on * (1 - k);
      flash.material.opacity = 1 - k;
    });
    this.lights.flash(pos.clone().setY(pos.y + 1.5), new THREE.Color(color).lerp(new THREE.Color(1, 1, 1), 0.5), 24, 14, 0.4);
    for (let i = 0; i < 30; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.8 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(6 + Math.random() * 10);
      this.spark({ pos: pos.clone().setY(pos.y + 0.1), vel: v, life: 0.3 + Math.random() * 0.4, size: [0.04, 0.02], stretch: 0.04, color: [new THREE.Color(4, 4, 5), new THREE.Color(color).multiplyScalar(2)], sprite: Sprite.Spark, drag: 3, gravity: 14 });
    }
    this.marks.add(pos, 2.6, "scorch", 6);
    this.screen.kick(0.008, 0.35, 0xdff4ff);
    this.shake = Math.max(this.shake, 0.35);
  }

  /** Ground shockwave (landing a heavy blow, knockdown, area special). */
  groundWave(pos: THREE.Vector3, color: THREE.ColorRepresentation, size: number): void {
    // Added light over a pale ground reads as a white veil: the wave keeps a deep tint
    // and stays faint; the dust it raises does the rest.
    const m = noOutline(new THREE.MeshBasicMaterial({ color: deepen(color, 0.6), map: ringTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos).setY(pos.y + 0.05);
    this.add(ring, 0.45, (k) => {
      ring.scale.setScalar(size * (0.2 + (1 - (1 - k) ** 3) * 0.9));
      m.opacity = 0.35 * (1 - k) ** 1.6;
    });
    this.dustRing(pos, size * 0.45, 10);
  }

  /** Blade arc in front of the fighter, tilted per combo hit. */
  slash(origin: THREE.Vector3, yaw: number, tilt: number, radius: number, color: THREE.ColorRepresentation): void {
    const m = noOutline(
      new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    );
    const arc = new THREE.Mesh(new THREE.RingGeometry(radius * 0.55, radius, 32, 1, -Math.PI * 0.55, Math.PI * 1.1), m);
    const holder = new THREE.Group();
    holder.position.copy(origin);
    holder.rotation.set(0, yaw, 0);
    arc.rotation.set(-Math.PI / 2 + tilt, 0, Math.PI / 2);
    holder.add(arc);
    this.add(holder, 0.16, (k) => {
      m.opacity = 0.85 * (1 - k);
      arc.scale.setScalar(0.9 + k * 0.25);
    });
  }

  /** Speed lines streaming behind a fast-moving fighter. */
  speedLines(pos: THREE.Vector3, dir: THREE.Vector3, color: THREE.ColorRepresentation): void {
    for (let i = 0; i < 3; i++) {
      const s = this.sprite(this.glow, color, 0.7);
      s.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, Math.random() * 1.6 - 0.6, (Math.random() - 0.5) * 0.8));
      const back = dir.clone().multiplyScalar(-1);
      this.add(s, 0.2, (k, dt) => {
        s.position.addScaledVector(back, 6 * dt);
        s.scale.set(0.06, 1.2 * (1 - k), 1);
        s.material.opacity = 0.7 * (1 - k);
      });
      s.onBeforeRender = (_r, _s, cam) => {
        // Align the streak with the movement as seen on screen.
        const a = pos.clone().project(cam);
        const b = pos.clone().add(dir).project(cam);
        s.material.rotation = Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2;
      };
    }
  }

  /** Soft dust puffs at the feet. */
  /**
   * Wind-up glint: a sharp star that pops and shrinks on the attacker just before a
   * heavy blow or a special goes off — the « here it comes » of anime fighters.
   */
  glint(pos: THREE.Vector3, color: THREE.ColorRepresentation, size = 1.4): void {
    const s = this.sprite(this.star, color);
    s.position.copy(pos);
    this.add(s, 0.28, (k) => {
      const grow = k < 0.25 ? k / 0.25 : 1 - (k - 0.25) / 0.75;
      s.scale.setScalar(size * Math.max(0.05, grow));
      s.material.rotation = k * 2.5;
      s.material.opacity = 1 - k * 0.6;
    });
    const halo = this.sprite(this.glow, color, 0.7);
    halo.position.copy(pos);
    this.add(halo, 0.28, (k) => {
      halo.scale.setScalar(size * 1.6 * (0.4 + k));
      halo.material.opacity = 0.7 * (1 - k);
    });
  }

  /** Flames bursting out and rising, then gone (fire, explosions). */
  flames(pos: THREE.Vector3, count: number, size: number): void {
    for (let i = 0; i < count * 3; i++) {
      const a = Math.random() * Math.PI * 2;
      this.spark({
        pos: pos.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(Math.random() * 0.4 * size)),
        vel: new THREE.Vector3(Math.cos(a) * 1.5, 2.5 + Math.random() * 3, Math.sin(a) * 1.5).multiplyScalar(size), life: 0.4 + Math.random() * 0.4,
        size: [0.5 * size, 1.1 * size], color: [new THREE.Color(4.5, 2.8, 1.1), new THREE.Color(1.4, 0.3, 0.06)], sprite: Sprite.Flame, drag: 2, gravity: -2.5,
      });
    }
    for (let i = 0; i < count; i++)
      this.smoke({
        pos: pos.clone().setY(pos.y + 0.5 * size), vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, 2 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5).multiplyScalar(size),
        life: 1.2 + Math.random() * 0.8, size: [0.7 * size, 2.4 * size], color: [new THREE.Color(0.1, 0.09, 0.08), new THREE.Color(0.22, 0.21, 0.2)], alpha: [0.7, 0],
        sprite: Sprite.Smoke, drag: 1.2, gravity: -0.6, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.6, delay: 0.1 + Math.random() * 0.15,
      });
  }

  /** Launch trail: a puff left behind a fighter sent flying, bigger the faster it goes. */
  puff(pos: THREE.Vector3, size: number): void {
    // Ragged and thin, so the fighter flying ahead of it stays in sight.
    const s = new THREE.Sprite(
      noOutline(new THREE.SpriteMaterial({ map: puffTexture(), color: 0xe4ddd2, transparent: true, opacity: 0.3, depthWrite: false })),
    );
    s.position.copy(pos);
    s.material.rotation = Math.random() * Math.PI * 2;
    this.add(s, 0.4, (k) => {
      s.scale.setScalar(size * (0.45 + k * 0.7));
      s.material.opacity = 0.3 * (1 - k);
    });
  }

  dust(pos: THREE.Vector3, count = 5): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const tone = 0.62 + Math.random() * 0.12;
      this.smoke({
        pos: pos.clone().setY(pos.y + 0.15), vel: new THREE.Vector3(Math.cos(a), 0.35, Math.sin(a)).multiplyScalar(1.4 + Math.random() * 1.2),
        life: 0.55 + Math.random() * 0.3, size: [0.35, 1.0], color: [new THREE.Color(tone, tone * 0.93, tone * 0.82), new THREE.Color(tone, tone * 0.95, tone * 0.86)],
        alpha: [0.5, 0], sprite: Sprite.Dust, drag: 3, gravity: -0.2, rot: Math.random() * 6.28, spin: (Math.random() - 0.5),
      });
    }
  }

  /** Chunks of a broken prop, cel-shaded and outlined like the prop itself. */
  debris(pos: THREE.Vector3, color: THREE.ColorRepresentation, count = 10, size = 0.22, spread = 0): void {
    for (let i = 0; i < count; i++) {
      const s = size * (0.6 + Math.random() * 0.8);
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s * (0.5 + Math.random() * 0.5), s), toon(color));
      m.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread));
      m.castShadow = true;
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 3), 4 + Math.random() * 4, Math.sin(a) * (2 + Math.random() * 3));
      const spin = new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(10);
      this.add(m, 1.1, (k, dt) => {
        v.y -= 25 * dt;
        m.position.addScaledVector(v, dt);
        if (m.position.y < s / 2) {
          m.position.y = s / 2;
          v.set(v.x * 0.5, -v.y * 0.25, v.z * 0.5);
        }
        m.rotation.x += spin.x * dt;
        m.rotation.y += spin.y * dt;
        m.scale.setScalar(k > 0.8 ? (1 - k) * 5 : 1);
      });
    }
    this.dust(pos, 6);
  }

  /** Parts falling off a damaged prop: each drops from where it was, with a puff of dust. */
  chips(list: { pos: THREE.Vector3; color: THREE.Color; size: number }[]): void {
    for (const c of list) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(c.size, c.size * 0.7, c.size), toon(c.color));
      m.position.copy(c.pos);
      m.castShadow = true;
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * 1.5, 1 + Math.random() * 2, Math.sin(a) * 1.5);
      const spin = new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(6);
      this.add(m, 1.6, (k, dt) => {
        v.y -= 25 * dt;
        m.position.addScaledVector(v, dt);
        if (m.position.y < c.size * 0.35) {
          m.position.y = c.size * 0.35;
          v.set(v.x * 0.4, -v.y * 0.2, v.z * 0.4);
          spin.multiplyScalar(0.5);
        }
        m.rotation.x += spin.x * dt;
        m.rotation.z += spin.z * dt;
        m.scale.setScalar(k > 0.85 ? (1 - k) / 0.15 : 1);
      });
    }
    if (list.length) this.dust(list[0]!.pos, 4);
  }

  /**
   * Blade cuts across a target, one after the other within a blink: thin bright streaks
   * at many angles (nine for the nine-headed dragon), each with a white core.
   */
  slashes(pos: THREE.Vector3, count: number, color: THREE.ColorRepresentation): void {
    for (let i = 0; i < count; i++) {
      // Spread the angles evenly, starting from a vertical cut.
      const angle = Math.PI / 2 + (i * Math.PI) / count + (Math.random() - 0.5) * 0.15;
      const delay = (i / count) * 0.12;
      const off = new THREE.Vector3((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.25);
      for (const [tex, tint, width] of [[this.glow, color, 0.2], [this.glow, 0xffffff, 0.06]] as const) {
        const s = this.sprite(tex, tint);
        s.position.copy(pos).add(off);
        s.material.rotation = angle;
        s.visible = false;
        this.add(s, 0.32 + delay, (k) => {
          const t = (k * (0.32 + delay) - delay) / 0.32;
          s.visible = t >= 0;
          if (t < 0) return;
          // Drawn out fast, then thins and fades.
          s.scale.set(width * (1 - t * 0.7), 3.4 * Math.min(1, t * 5), 1);
          s.material.opacity = 1 - t;
        });
      }
    }
    this.shake = Math.max(this.shake, 0.45);
  }

  update(dt: number): void {
    this.shake *= Math.exp(-dt * 12);
    this.glowParts.update(dt);
    this.smokeParts.update(dt);
    this.lights.update(dt);
    this.marks.update(dt);
    this.screen.update(dt);
    this.effects = this.effects.filter((e) => {
      e.age += dt;
      const k = Math.min(1, e.age / e.life);
      e.update(k, dt);
      if (k < 1) return true;
      this.scene.remove(e.obj);
      if (!e.keep) e.obj.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
          for (const m of [o.material].flat() as THREE.Material[]) m.dispose();
        }
      });
      return false;
    });
  }
}
