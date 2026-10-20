// The looks of the techniques, chosen per special in character.json (`moves`): what a
// projectile looks like in flight (a beam, a fireball, a bullet, a rocket), what glows
// in the hand or on the blade while the special lasts (a ball of ki, a spinning orb,
// lightning, flames), and how an area burns or blows up. Visual only: the simulation
// does not know about any of it.

import * as THREE from "three";
import type { MoveStyle } from "../brawl/character.ts";
import { glowTexture, noOutline } from "./toon.ts";

const glow = glowTexture();

let flameTex: THREE.CanvasTexture | null = null;
/** A soft tongue of flame: white-yellow at its root, orange, then red and gone. */
export function flameTexture(): THREE.CanvasTexture {
  if (flameTex) return flameTex;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 92, 2, 32, 80, 60);
  grad.addColorStop(0, "rgba(255,250,220,1)");
  grad.addColorStop(0.25, "rgba(255,200,80,0.95)");
  grad.addColorStop(0.55, "rgba(255,110,20,0.7)");
  grad.addColorStop(0.85, "rgba(200,30,10,0.25)");
  grad.addColorStop(1, "rgba(120,0,0,0)");
  g.fillStyle = grad;
  // A drop shape, pointed at the top.
  g.beginPath();
  g.moveTo(32, 4);
  g.bezierCurveTo(46, 40, 62, 70, 58, 96);
  g.bezierCurveTo(54, 122, 10, 122, 6, 96);
  g.bezierCurveTo(2, 70, 18, 40, 32, 4);
  g.fill();
  flameTex = new THREE.CanvasTexture(c);
  flameTex.colorSpace = THREE.SRGBColorSpace;
  return flameTex;
}

const additive = (map: THREE.Texture, color: THREE.ColorRepresentation, opacity = 1) =>
  noOutline(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
/** Painted over the scene (not added to it): saturated fire that holds against a pale wall. */
const painted = (map: THREE.Texture, color: THREE.ColorRepresentation, opacity = 1) =>
  noOutline(new THREE.SpriteMaterial({ map, color, transparent: true, opacity, depthWrite: false }));

let puffTex: THREE.CanvasTexture | null = null;
/** A ragged puff (of flame or smoke), white, lumpy at the edge: tinted per sprite. */
export function puffTexture(): THREE.CanvasTexture {
  if (puffTex) return puffTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  let seed = 11;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * 14;
    const x = 32 + Math.cos(a) * d;
    const y = 32 + Math.sin(a) * d;
    const rad = 10 + r() * 12;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, "rgba(255,255,255,0.5)");
    grad.addColorStop(0.6, "rgba(255,255,255,0.25)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  puffTex = new THREE.CanvasTexture(c);
  puffTex.colorSpace = THREE.SRGBColorSpace;
  return puffTex;
}

/** A flickering bunch of flames (sprites), `size` metres high, round its origin. */
export function flames(count: number, size: number, spread: number): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(additive(flameTexture(), 0xff9a50, 0.7));
    s.userData.seed = Math.random() * 100;
    s.userData.base = new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.3) * spread, (Math.random() - 0.5) * spread);
    s.userData.size = size * (0.6 + Math.random() * 0.6);
    g.add(s);
  }
  g.userData.flicker = (t: number) => {
    for (const s of g.children as THREE.Sprite[]) {
      const k = Math.sin(t * 17 + s.userData.seed) * 0.5 + 0.5;
      const sz = s.userData.size as number;
      s.scale.set(sz * (0.45 + 0.2 * k), sz * (0.8 + 0.4 * k), 1);
      s.position.copy(s.userData.base as THREE.Vector3).add(new THREE.Vector3(0, sz * 0.25 * k, 0));
      s.material.opacity = 0.45 + 0.3 * k;
    }
  };
  return g;
}

/**
 * Short-lived glowing motes (embers, sparks, energy), each a sprite in world space,
 * moved and faded by `update(dt)`.
 */
class Motes {
  readonly group = new THREE.Group();
  private list: {
    s: THREE.Sprite;
    v: THREE.Vector3;
    age: number;
    life: number;
    size: number;
    grow: number;
    gravity: number;
    alpha: number;
    from?: THREE.Color;
    to?: THREE.Color;
    spin: number;
  }[] = [];
  private map: THREE.Texture;
  private add: boolean;
  /** `painted`: drawn over the scene instead of added to its light (flames, smoke). */
  constructor(map: THREE.Texture = glow, painted = false) {
    this.map = map;
    this.add = !painted;
  }
  /** `to`: the colour it turns to by the end of its life (fire goes yellow, orange, red). */
  emit(
    at: THREE.Vector3,
    v: THREE.Vector3,
    color: THREE.ColorRepresentation,
    size: number,
    life: number,
    opts: { grow?: number; gravity?: number; alpha?: number; to?: THREE.ColorRepresentation } = {},
  ): void {
    const s = new THREE.Sprite((this.add ? additive : painted)(this.map, color, opts.alpha ?? 1));
    s.position.copy(at);
    s.material.rotation = Math.random() * Math.PI * 2;
    this.group.add(s);
    const to = opts.to === undefined ? undefined : new THREE.Color(opts.to);
    this.list.push({
      s,
      v,
      age: 0,
      life,
      size,
      grow: opts.grow ?? 0,
      gravity: opts.gravity ?? 0,
      alpha: opts.alpha ?? 1,
      ...(to ? { from: new THREE.Color(color), to } : {}),
      spin: (Math.random() - 0.5) * 4,
    });
  }
  update(dt: number): void {
    this.list = this.list.filter((m) => {
      m.age += dt;
      const k = m.age / m.life;
      if (k >= 1) {
        this.group.remove(m.s);
        m.s.material.dispose();
        return false;
      }
      m.v.y -= m.gravity * dt;
      m.s.position.addScaledVector(m.v, dt);
      m.s.scale.setScalar(m.size * (1 + m.grow * k) * (1 - k * 0.5));
      m.s.material.opacity = m.alpha * (1 - k) * (m.to ? Math.min(1, k * 8) : 1);
      if (m.to) {
        m.s.material.color.lerpColors(m.from!, m.to, k);
        m.s.material.rotation += m.spin * dt;
      }
      return true;
    });
  }
  dispose(): void {
    for (const m of this.list) m.s.material.dispose();
    this.list = [];
    this.group.clear();
  }
}

/** A random unit vector. */
const anyDir = () => new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();

let streamTex: THREE.CanvasTexture | null = null;
/** Streaks of energy along a beam (scrolled along it): bright, uneven, tileable. */
function streamTexture(): THREE.CanvasTexture {
  if (streamTex) return streamTex;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(255,255,255,0.35)";
  g.fillRect(0, 0, 64, 256);
  let seed = 3;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 40; i++) {
    const x = r() * 64;
    const y = r() * 256;
    const len = 30 + r() * 90;
    const grad = g.createLinearGradient(0, y, 0, y + len);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    const w = 2 + r() * 6;
    for (const dy of [0, -256, 256]) g.fillRect(x - w / 2, y + dy, w, len);
  }
  streamTex = new THREE.CanvasTexture(c);
  streamTex.colorSpace = THREE.SRGBColorSpace;
  streamTex.wrapS = streamTex.wrapT = THREE.RepeatWrapping;
  return streamTex;
}

let swirlTex: THREE.CanvasTexture | null = null;
/** Diagonal streaks of wind (wrapped on a ball and spun, they swirl). */
function swirlTexture(): THREE.CanvasTexture {
  if (swirlTex) return swirlTex;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 128;
  const g = c.getContext("2d")!;
  g.lineCap = "round";
  for (let i = 0; i < 14; i++) {
    const y0 = (i / 14) * 128;
    g.strokeStyle = `rgba(255,255,255,${0.35 + (i % 3) * 0.25})`;
    g.lineWidth = 2 + (i % 4);
    for (const dx of [0, -256, 256]) {
      g.beginPath();
      g.moveTo(dx, y0);
      g.bezierCurveTo(dx + 80, y0 + 30, dx + 170, y0 - 20, dx + 256, y0 + 40);
      g.stroke();
    }
  }
  swirlTex = new THREE.CanvasTexture(c);
  swirlTex.colorSpace = THREE.SRGBColorSpace;
  swirlTex.wrapS = swirlTex.wrapT = THREE.RepeatWrapping;
  return swirlTex;
}

/** A projectile as drawn in flight; `update` each frame, `remove` when it is gone. */
export interface ProjectileLook {
  group: THREE.Group;
  update(t: number, pos: THREE.Vector3, dir: THREE.Vector3): void;
  dispose(): void;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The drawn projectile for a look. `origin`: where it was fired from (a beam stretches
 * from there to its head). Default (`undefined` look): handled by the scene (ball).
 */
export function projectileLook(scene: THREE.Scene, look: MoveStyle["projectile"], color: string, size: number, origin: THREE.Vector3): ProjectileLook | null {
  const group = new THREE.Group();
  scene.add(group);
  const extra: THREE.Object3D[] = [];
  const done = () => {
    scene.remove(group);
    for (const o of extra) scene.remove(o);
  };
  switch (look) {
    case "beam": {
      // A column of light from the hands to the head of the beam: a white core in a
      // coloured sheath, and a big bright ball at the head.
      // Energy streams along it (a scrolled texture), a soft outer glow, rings racing
      // forward, sparks thrown off the head, a burning point at the hands.
      const body = new THREE.Group();
      const unit = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
      unit.translate(0, 0.5, 0);
      const stream = streamTexture().clone();
      stream.needsUpdate = true;
      const sheath = new THREE.Mesh(unit, noOutline(new THREE.MeshBasicMaterial({ color, map: stream, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
      const outer = new THREE.Mesh(unit, noOutline(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
      const core = new THREE.Mesh(unit, noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
      body.add(outer, sheath, core);
      const rings: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(
          new THREE.TorusGeometry(1, 0.08, 6, 28).rotateX(Math.PI / 2),
          noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false })),
        );
        rings.push(ring);
        body.add(ring);
      }
      body.position.copy(origin);
      scene.add(body);
      extra.push(body);
      const muzzle = new THREE.Sprite(additive(glow, color));
      muzzle.position.copy(origin);
      scene.add(muzzle);
      extra.push(muzzle);
      const motes = new Motes();
      scene.add(motes.group);
      extra.push(motes.group);
      const head = new THREE.Sprite(additive(glow, color));
      const headCore = new THREE.Sprite(additive(glow, 0xffffff));
      group.add(head, headCore);
      const last = origin.clone();
      let prev = -1;
      return {
        group,
        update(t, pos) {
          const dt = prev < 0 ? 0 : Math.min(0.05, Math.max(0, t - prev));
          prev = t;
          last.copy(pos);
          const d = pos.clone().sub(origin);
          const len = Math.max(0.01, d.length());
          const dir = d.normalize();
          body.quaternion.setFromUnitVectors(UP, dir);
          const r = size * (0.55 + 0.06 * Math.sin(t * 40));
          sheath.scale.set(r, len, r);
          outer.scale.set(r * 1.9, len, r * 1.9);
          core.scale.set(r * 0.3, len, r * 0.3);
          stream.repeat.set(2, len / 1.6);
          stream.offset.y = -t * 6;
          rings.forEach((ring, i) => {
            const along = ((t * 2.2 + i / rings.length) % 1) * len;
            ring.position.set(0, along, 0);
            ring.scale.setScalar(r * (1.25 + 0.35 * Math.sin(t * 20 + i)));
            (ring.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - along / len);
          });
          muzzle.scale.setScalar(size * (2.4 + 0.4 * Math.sin(t * 45)));
          head.scale.setScalar(size * (2.1 + 0.25 * Math.sin(t * 33)));
          headCore.scale.setScalar(size * 0.8);
          for (let i = 0; i < 3; i++) {
            const v = anyDir().multiplyScalar(3 + Math.random() * 4).addScaledVector(dir, -2);
            motes.emit(pos, v, i ? color : 0xffffff, size * 0.35, 0.25 + Math.random() * 0.2);
          }
          motes.update(dt);
        },
        // The column stays a moment after the impact, thinning out, so the beam reads.
        dispose() {
          scene.remove(group);
          const r0 = sheath.scale.x;
          const start = performance.now();
          const fade = () => {
            const k = (performance.now() - start) / 350;
            if (k >= 1) {
              motes.dispose();
              done();
              return;
            }
            motes.update(1 / 60);
            muzzle.scale.multiplyScalar(0.9);
            sheath.scale.x = sheath.scale.z = r0 * (1 - k);
            core.scale.x = core.scale.z = r0 * 0.45 * (1 - k * k);
            (sheath.material as THREE.MeshBasicMaterial).opacity = 0.8 * (1 - k);
            requestAnimationFrame(fade);
          };
          void last;
          requestAnimationFrame(fade);
        },
      };
    }
    case "fire": {
      // A ball of rolling flame: churning orange puffs painted over the scene (they hold
      // against a pale wall where added light washes out to white), a hot yellow heart, a
      // tail of flame that reddens and smoke that darkens behind it, embers falling.
      const halo = new THREE.Sprite(additive(glow, 0xff5a10, 0.4));
      halo.scale.setScalar(size * 3.4);
      const body = Array.from({ length: 6 }, (_, i) => {
        const p = new THREE.Sprite(painted(puffTexture(), i % 2 ? 0xff6a12 : 0xe8400c, 0.9));
        group.add(p);
        return { p, off: anyDir().multiplyScalar(size * 0.25), spin: (i % 2 ? 1 : -1) * (3 + i), phase: i };
      });
      const lick = flames(6, size * 1.8, size * 0.6);
      const heart = new THREE.Sprite(additive(glow, 0xffd27a, 0.9));
      heart.scale.setScalar(size * 1.3);
      group.add(halo, lick, heart);
      const tail = new Motes(puffTexture(), true);
      const glowTail = new Motes(puffTexture());
      const smoke = new Motes(puffTexture(), true);
      const embers = new Motes();
      for (const m of [smoke, tail, glowTail, embers]) {
        scene.add(m.group);
        extra.push(m.group);
      }
      let prev = -1;
      let owed = 0;
      return {
        group,
        update(t, pos, dir) {
          const dt = prev < 0 ? 0 : Math.min(0.05, Math.max(0, t - prev));
          prev = t;
          for (const b of body) {
            b.p.position.copy(b.off).multiplyScalar(1 + 0.3 * Math.sin(t * 13 + b.phase));
            b.p.material.rotation = t * b.spin;
            b.p.scale.setScalar(size * (1.7 + 0.25 * Math.sin(t * 17 + b.phase)));
          }
          (lick.userData.flicker as (t: number) => void)(t);
          heart.scale.setScalar(size * (1.2 + 0.15 * Math.sin(t * 31)));
          owed += dt * 150;
          for (; owed >= 1; owed--) {
            const at = pos.clone().addScaledVector(anyDir(), size * 0.45);
            const v = anyDir().multiplyScalar(0.8).addScaledVector(dir, -1.2).add(new THREE.Vector3(0, 0.8, 0));
            tail.emit(at, v, 0xff8a20, size * 1.4, 0.3 + Math.random() * 0.15, { grow: 0.4, alpha: 0.85, to: 0x8a1408 });
            if (Math.random() < 0.5) glowTail.emit(at, v.clone(), 0xffc060, size * 0.9, 0.22, { alpha: 0.6, to: 0xff4010 });
            if (Math.random() < 0.3) smoke.emit(at.clone().addScaledVector(dir, -size * 0.6), new THREE.Vector3(0, 1.1, 0).addScaledVector(anyDir(), 0.4), 0x3a302a, size * 1.1, 0.75, { grow: 1.8, alpha: 0.35, to: 0x6a625c });
            if (Math.random() < 0.15) embers.emit(at, anyDir().multiplyScalar(1.8).addScaledVector(dir, -1.5), Math.random() < 0.5 ? 0xffd27a : 0xff5a1a, size * 0.18, 0.5 + Math.random() * 0.3, { gravity: 3 });
          }
          for (const m of [tail, glowTail, smoke, embers]) m.update(dt);
        },
        dispose: () => {
          for (const m of [tail, glowTail, smoke, embers]) m.dispose();
          done();
        },
      };
    }
    case "tornado": {
      // A twister standing on the ground (Sonic Wind): three helical bands of light that
      // widen toward the top, spinning fast, swaying a little as it travels.
      const h = size * 4;
      const twister = new THREE.Group();
      twister.position.y = -size; // its foot on the ground (the projectile flies at body height)
      const mat = noOutline(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      const core = noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      for (let k = 0; k < 3; k++) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 48; i++) {
          const u = i / 48;
          const a = u * Math.PI * 5 + (k * Math.PI * 2) / 3;
          const r = size * (0.25 + 1.4 * u * u);
          pts.push(new THREE.Vector3(Math.cos(a) * r, u * h, Math.sin(a) * r));
        }
        twister.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, size * 0.06, 5, false), k === 0 ? core : mat));
      }
      const swirl = new THREE.Sprite(additive(glow, color, 0.5));
      swirl.scale.set(size * 2.4, h, 1);
      swirl.position.y = h / 2;
      twister.add(swirl);
      group.add(twister);
      return {
        group,
        update(t) {
          twister.rotation.y = t * 18;
          twister.rotation.z = 0.08 * Math.sin(t * 7);
        },
        dispose: done,
      };
    }
    case "bullet": {
      // A tracer: a short bright streak along its path.
      const geo = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6);
      geo.translate(0, -0.45, 0);
      const streak = new THREE.Mesh(geo, noOutline(new THREE.MeshBasicMaterial({ color: 0xfff3b0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })));
      const spark = new THREE.Sprite(additive(glow, 0xffd27a));
      spark.scale.setScalar(0.45);
      group.add(streak, spark);
      return {
        group,
        update(_t, _pos, dir) {
          streak.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
        },
        dispose: done,
      };
    }
    case "rocket": {
      const rocket = new THREE.Group();
      const olive = new THREE.MeshStandardMaterial({ color: 0x55602f, roughness: 0.6 });
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 12), olive);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0x8a1a12, roughness: 0.5 }));
      nose.position.y = 0.28;
      rocket.add(body, nose);
      for (let i = 0; i < 4; i++) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.1, 0.07), olive);
        fin.position.set(Math.cos((i * Math.PI) / 2) * 0.07, -0.16, Math.sin((i * Math.PI) / 2) * 0.07);
        fin.rotation.y = -(i * Math.PI) / 2;
        rocket.add(fin);
      }
      const jet = flames(4, 0.5, 0.06);
      jet.rotation.x = Math.PI;
      jet.position.y = -0.3;
      rocket.add(jet);
      group.add(rocket);
      return {
        group,
        update(t, _pos, dir) {
          rocket.quaternion.setFromUnitVectors(UP, dir.clone().normalize());
          rocket.rotateY(t * 12);
          (jet.userData.flicker as (t: number) => void)(t);
        },
        dispose: done,
      };
    }
    case undefined: {
      // A ball of energy: a white core, its colour round it, a ring spinning on it,
      // and motes left behind along its path.
      const halo = new THREE.Sprite(additive(glow, color));
      halo.scale.setScalar(size * 3.4);
      const core = new THREE.Sprite(additive(glow, 0xffffff));
      core.scale.setScalar(size * 0.9);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(size * 0.9, size * 0.08, 6, 32),
        noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })),
      );
      group.add(halo, core, ring);
      const trail = new Motes();
      scene.add(trail.group);
      extra.push(trail.group);
      let prev = -1;
      return {
        group,
        update(t, pos, dir) {
          const dt = prev < 0 ? 0 : Math.min(0.05, Math.max(0, t - prev));
          prev = t;
          ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
          ring.rotateZ(t * 10);
          ring.scale.setScalar(1 + 0.15 * Math.sin(t * 30));
          halo.scale.setScalar(size * (3.2 + 0.4 * Math.sin(t * 25)));
          for (let i = 0; i < 2; i++) trail.emit(pos.clone().addScaledVector(anyDir(), size * 0.4), anyDir().multiplyScalar(0.6), i ? color : 0xffffff, size * 1.1, 0.35, { grow: -0.5, alpha: 0.8 });
          trail.update(dt);
        },
        dispose: () => {
          trail.dispose();
          done();
        },
      };
    }
    default:
      scene.remove(group);
      return null;
  }
}

/** What glows in the hand (or along the blade) during a special. */
export interface HandLook {
  obj: THREE.Object3D;
  update(t: number): void;
  /** Called instead of `update` while the look is off: what it left in the air dies out. */
  idle?(t: number): void;
}

/** Builds a hand effect. `blade`: the weapon's length along +Y (flames on it), or 0. */
export function handLook(look: NonNullable<MoveStyle["hand"]>, color: string, blade: number): HandLook {
  const obj = new THREE.Group();
  switch (look) {
    case "ki": {
      // Gathering ki: motes drawn in from all round into a bright, throbbing ball.
      const halo = new THREE.Sprite(additive(glow, color, 0.75));
      const core = new THREE.Sprite(additive(glow, 0xffffff));
      obj.add(halo, core);
      const motes: { s: THREE.Sprite; from: THREE.Vector3; phase: number }[] = [];
      for (let i = 0; i < 10; i++) {
        const s = new THREE.Sprite(additive(glow, i % 3 ? color : 0xffffff));
        motes.push({ s, from: anyDir().multiplyScalar(0.35 + Math.random() * 0.2), phase: Math.random() });
        obj.add(s);
      }
      return {
        obj,
        update(t) {
          halo.scale.setScalar(0.38 + 0.06 * Math.sin(t * 25));
          core.scale.setScalar(0.12 + 0.02 * Math.sin(t * 40));
          for (const m of motes) {
            const k = (t * 2.5 + m.phase) % 1;
            m.s.position.copy(m.from).multiplyScalar(1 - k);
            m.s.scale.setScalar(0.05 + 0.04 * (1 - k));
            m.s.material.opacity = Math.sin(Math.PI * k);
          }
        },
      };
    }
    case "orb": {
      // A ball of spinning wind: a bright core, a translucent shell, rings whipping round.
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 20, 14),
        noOutline(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false })),
      );
      const core = new THREE.Sprite(additive(glow, 0xffffff, 0.8));
      core.scale.setScalar(0.14);
      const halo = new THREE.Sprite(additive(glow, color, 0.4));
      obj.add(shell, core, halo);
      // Two shells of streaking wind, spun on different axes: the ball churns.
      const swirls = [0.15, 0.17].map((r, i) => {
        const m = new THREE.Mesh(
          new THREE.SphereGeometry(r, 24, 16),
          noOutline(new THREE.MeshBasicMaterial({ map: swirlTexture(), color: i ? color : 0xffffff, transparent: true, opacity: i ? 0.9 : 0.45, blending: THREE.AdditiveBlending, depthWrite: false })),
        );
        obj.add(m);
        return m;
      });
      const orbit = Array.from({ length: 8 }, (_, i) => {
        const s = new THREE.Sprite(additive(glow, i % 2 ? color : 0xffffff));
        s.scale.setScalar(0.04);
        obj.add(s);
        return { s, tilt: anyDir(), phase: Math.random() * 6 };
      });
      const rings: THREE.Mesh[] = [];
      for (let i = 0; i < 3; i++) {
        const r = new THREE.Mesh(
          new THREE.TorusGeometry(0.14, 0.006, 4, 32, Math.PI * 1.3),
          noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false })),
        );
        r.rotation.set(i * 1.1, i * 0.7, 0);
        rings.push(r);
        obj.add(r);
      }
      return {
        obj,
        update(t) {
          rings.forEach((r, i) => {
            r.rotation.z = t * (22 + i * 5);
            r.rotation.x += 0.05 * (i + 1);
          });
          swirls[0]!.rotation.set(t * 9, t * 23, 0);
          swirls[1]!.rotation.set(-t * 14, 0, t * 19);
          for (const o of orbit) {
            const a = t * 18 + o.phase;
            const side = new THREE.Vector3().crossVectors(o.tilt, UP).normalize();
            const up2 = new THREE.Vector3().crossVectors(side, o.tilt);
            o.s.position.copy(side).multiplyScalar(Math.cos(a) * 0.22).addScaledVector(up2, Math.sin(a) * 0.22);
          }
          halo.scale.setScalar(0.5 + 0.06 * Math.sin(t * 30));
        },
      };
    }
    case "lightning": {
      // Crackling arcs round the hand, redrawn every frame, and a white-blue glow.
      const halo = new THREE.Sprite(additive(glow, color, 0.9));
      const core = new THREE.Sprite(additive(glow, 0xffffff));
      core.scale.setScalar(0.25);
      const n = 16;
      const pos = new Float32Array(n * 6 * 2 * 3);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const arcs = new THREE.LineSegments(geo, noOutline(new THREE.LineBasicMaterial({ color: 0xe8f6ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
      arcs.frustumCulled = false;
      obj.add(halo, core, arcs);
      let last = -1;
      return {
        obj,
        update(t) {
          halo.scale.setScalar(0.55 + 0.15 * Math.random());
          if (t - last < 0.03) return;
          last = t;
          let k = 0;
          for (let a = 0; a < n; a++) {
            const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
            let p = new THREE.Vector3();
            // A few bolts reach far out, the others crackle close round the hand.
            const step = a % 4 === 0 ? 0.11 : 0.05;
            for (let s = 0; s < 6; s++) {
              const q = p.clone().addScaledVector(dir, step).add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(step * 1.1));
              pos.set([p.x, p.y, p.z], k);
              pos.set([q.x, q.y, q.z], k + 3);
              k += 6;
              p = q;
              if (k >= pos.length) break;
            }
          }
          geo.attributes.position!.needsUpdate = true;
        },
      };
    }
    case "fire": {
      const fire = bladeFire(blade);
      obj.add(fire.obj);
      return { obj, update: (t) => fire.update(t, 1), idle: (t) => fire.update(t, 0) };
    }
  }
}

/**
 * Fire along a blade (`blade`: its length along +Y, in its own units) or, without one,
 * round a fist. `level` 0..1: 0 out (what is still in the air dies out), a low level
 * smoulders, 1 blazes. Flames and a glow on the blade itself; licks of flame and embers
 * shed into the world, so a swing leaves a burning wake.
 */
export function bladeFire(blade: number): { obj: THREE.Group; update(t: number, level: number): void } {
  const obj = new THREE.Group();
  const len = blade > 0 ? blade : 0;
  const n = blade > 0 ? 10 : 6;
  // The painted body of the flames (saturated orange), then the added light of their core.
  const under = Array.from({ length: n }, (_, i) => {
    const p = new THREE.Sprite(painted(puffTexture(), i % 2 ? 0xff6a12 : 0xe0400c, 0));
    obj.add(p);
    return { p, y: blade > 0 ? 0.12 + (i / (n - 1)) * (len - 0.12) : 0, off: anyDir().multiplyScalar(0.04), phase: i * 1.7 };
  });
  const f = flames(n, blade > 0 ? 0.42 : 0.36, 0.06);
  if (blade > 0)
    f.children.forEach((s, i) => {
      (s.userData.base as THREE.Vector3).set(0, 0.1 + (i / (n - 1)) * (len - 0.1), 0);
    });
  const halo = new THREE.Sprite(additive(glow, 0xff6a1a, 0.5));
  halo.position.y = len / 2;
  obj.add(f, halo);
  const licks = new Motes(puffTexture(), true);
  const embers = new Motes();
  let scene: THREE.Object3D | null = null;
  let prev = -1;
  let owed = 0;
  const at = new THREE.Vector3();
  return {
    obj,
    update(t, level) {
      const dt = prev < 0 ? 0 : Math.min(0.05, Math.max(0, t - prev));
      prev = t;
      const on = level > 0;
      f.visible = halo.visible = on;
      for (const u of under) u.p.visible = on;
      if (on) {
        (f.userData.flicker as (t: number) => void)(t);
        f.scale.setScalar(0.5 + 0.5 * level);
        for (const s of f.children as THREE.Sprite[]) s.material.opacity *= 0.4 + 0.6 * level;
        for (const u of under) {
          const k = 0.5 + 0.5 * Math.sin(t * 15 + u.phase);
          u.p.position.set(u.off.x, u.y + 0.06 * k, u.off.z);
          u.p.scale.setScalar((blade > 0 ? 0.26 : 0.3) * (0.5 + 0.5 * level) * (0.85 + 0.3 * k));
          u.p.material.rotation = t * 3 + u.phase;
          u.p.material.opacity = 0.75 * (0.35 + 0.65 * level);
        }
        halo.scale.set(blade > 0 ? 0.5 : 0.5, blade > 0 ? len + 0.3 : 0.5, 1).multiplyScalar(0.5 + 0.5 * level);
        halo.material.opacity = 0.2 + 0.35 * level;
      }
      // What it sheds lives in the world (the scene), so it trails behind a swing.
      if (!scene) obj.traverseAncestors((a) => {
        if ((a as THREE.Scene).isScene) scene = a;
      });
      if (scene && !licks.group.parent) scene.add(licks.group, embers.group);
      if (scene && on && obj.visible) {
        obj.updateWorldMatrix(true, false);
        owed += dt * 70 * level;
        for (; owed >= 1; owed--) {
          at.set(0, blade > 0 ? 0.1 + Math.random() * (len - 0.1) : 0, 0);
          obj.localToWorld(at);
          licks.emit(at.clone(), new THREE.Vector3(0, 1.2, 0).addScaledVector(anyDir(), 0.4), 0xff9a30, 0.3, 0.3 + Math.random() * 0.15, { grow: 0.6, alpha: 0.7, to: 0x7a1206 });
          if (Math.random() < 0.25) embers.emit(at.clone(), new THREE.Vector3(0, 1.5, 0).addScaledVector(anyDir(), 1), Math.random() < 0.5 ? 0xffd27a : 0xff6a1a, 0.04, 0.6 + Math.random() * 0.4);
        }
      }
      licks.update(dt);
      embers.update(dt);
    },
  };
}

/** Flames licking up inside a circle, until it strikes. */
export function zoneFlames(radius: number): THREE.Group {
  const g = new THREE.Group();
  const n = Math.round(6 + radius * 6);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = radius * (0.35 + 0.6 * ((i * 0.618) % 1));
    const f = flames(2, 0.9, 0.1);
    f.position.set(Math.cos(a) * r, 0.3, Math.sin(a) * r);
    g.add(f);
  }
  g.userData.flicker = (t: number, k: number) => {
    for (const f of g.children) {
      (f.userData.flicker as (t: number) => void)(t);
      f.scale.setScalar(0.3 + 0.9 * k);
    }
  };
  return g;
}

/**
 * The aura of a fighter charging energy, round its feet (fighter space, 1.8 m tall):
 * tongues of flame in its colour licking up round the body, motes of energy shooting
 * up, a glowing circle on the ground and pebbles lifting off it. Driven by the clock
 * alone (`update(t)`), so it loops seamlessly; `obj.visible` turns it on and off.
 */
export function chargeAura(color: string): { obj: THREE.Group; update(t: number): void } {
  const obj = new THREE.Group();
  const seed = (i: number, k: number) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  const back = new THREE.Sprite(additive(glow, color, 0.18));
  back.position.y = 1.0;
  obj.add(back);
  const flames = Array.from({ length: 16 }, (_, i) => {
    const s = new THREE.Sprite(additive(flameTexture(), color, 0));
    obj.add(s);
    return { s, a: (i / 16) * Math.PI * 2 + seed(i, 1), r: 0.42 + seed(i, 2) * 0.2, phase: seed(i, 3), speed: 1.4 + seed(i, 4) * 0.6 };
  });
  const motes = Array.from({ length: 22 }, (_, i) => {
    const s = new THREE.Sprite(additive(glow, i % 3 === 0 ? 0xffffff : color, 0));
    obj.add(s);
    return { s, a: seed(i, 5) * Math.PI * 2, r: 0.2 + seed(i, 6) * 0.5, phase: seed(i, 7), speed: 2 + seed(i, 8) * 1.5 };
  });
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    noOutline(new THREE.MeshBasicMaterial({ map: glow, color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })),
  );
  ground.position.y = 0.03;
  obj.add(ground);
  const rock = new THREE.MeshStandardMaterial({ color: 0x4a443c, roughness: 0.9 });
  const pebbles = Array.from({ length: 7 }, (_, i) => {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(0.04 + seed(i, 9) * 0.035, 0), rock);
    obj.add(m);
    return { m, a: seed(i, 10) * Math.PI * 2, r: 0.5 + seed(i, 11) * 0.5, phase: seed(i, 12), spin: 3 + seed(i, 13) * 5 };
  });
  return {
    obj,
    update(t) {
      const beat = 0.5 + 0.5 * Math.sin(t * 18);
      back.scale.set(1.6 + 0.2 * beat, 2.6 + 0.3 * beat, 1);
      for (const f of flames) {
        const p = (t * f.speed + f.phase) % 1;
        const a = f.a + t * 1.2;
        f.s.position.set(Math.cos(a) * f.r * (1 - p * 0.3), 0.15 + p * 1.75, Math.sin(a) * f.r * (1 - p * 0.3));
        f.s.scale.set(0.26 * (1 - p * 0.5), 0.7 + p * 0.8, 1);
        f.s.material.opacity = 0.32 * Math.sin(Math.PI * p);
      }
      for (const m of motes) {
        const p = (t * m.speed + m.phase) % 1;
        m.s.position.set(Math.cos(m.a) * m.r, p * 2.5, Math.sin(m.a) * m.r);
        m.s.scale.set(0.06, 0.08 + 0.22 * (1 - p), 1);
        m.s.material.opacity = (1 - p) * 0.9;
      }
      ground.scale.setScalar(2.2 + 0.4 * beat);
      (ground.material as THREE.MeshBasicMaterial).opacity = 0.7 + 0.3 * beat;
      for (const pb of pebbles) {
        const p = (t * 0.6 + pb.phase) % 1;
        pb.m.position.set(Math.cos(pb.a) * pb.r, 0.05 + p * 1.1 + 0.03 * Math.sin(t * 9 + pb.a), Math.sin(pb.a) * pb.r);
        pb.m.rotation.set(t * pb.spin, t * pb.spin * 0.7, 0);
        pb.m.scale.setScalar(p < 0.85 ? 1 : (1 - p) / 0.15);
      }
    },
  };
}

/**
 * Round a fighter whose blade burns (look.burning): embers rising off the body and a
 * low orange glow at the feet, brighter while it strikes (`level` 0..1). Driven by the
 * clock alone, in fighter space.
 */
export function emberAura(): { obj: THREE.Group; update(t: number, level: number): void } {
  const obj = new THREE.Group();
  const seed = (i: number, k: number) => ((Math.sin(i * 12.9898 + k * 78.233) * 43758.5453) % 1 + 1) % 1;
  const heat = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
    noOutline(new THREE.MeshBasicMaterial({ map: glow, color: 0xff5a14, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })),
  );
  heat.position.y = 0.03;
  obj.add(heat);
  const embers = Array.from({ length: 14 }, (_, i) => {
    const s = new THREE.Sprite(additive(glow, i % 3 ? 0xff7a1a : 0xffd27a, 0));
    obj.add(s);
    return { s, a: seed(i, 1) * Math.PI * 2, r: 0.3 + seed(i, 2) * 0.35, phase: seed(i, 3), speed: 0.35 + seed(i, 4) * 0.3, sway: seed(i, 5) * 6 };
  });
  return {
    obj,
    update(t, level) {
      heat.scale.setScalar(1.5 + 0.3 * level + 0.1 * Math.sin(t * 9));
      (heat.material as THREE.MeshBasicMaterial).opacity = 0.25 + 0.35 * level;
      for (const e of embers) {
        const p = (t * e.speed * (1 + level) + e.phase) % 1;
        const a = e.a + 0.4 * Math.sin(t * 2 + e.sway);
        e.s.position.set(Math.cos(a) * e.r, 0.1 + p * 2.2, Math.sin(a) * e.r);
        e.s.scale.setScalar(0.035 + 0.02 * level);
        e.s.material.opacity = Math.sin(Math.PI * p) * (0.6 + 0.4 * level);
      }
    },
  };
}
