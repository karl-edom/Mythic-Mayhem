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
      const body = new THREE.Group();
      const unit = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
      unit.translate(0, 0.5, 0);
      const sheath = new THREE.Mesh(unit, noOutline(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })));
      const core = new THREE.Mesh(unit, noOutline(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false })));
      body.add(sheath, core);
      body.position.copy(origin);
      scene.add(body);
      extra.push(body);
      const head = new THREE.Sprite(additive(glow, color));
      const headCore = new THREE.Sprite(additive(glow, 0xffffff));
      group.add(head, headCore);
      const last = origin.clone();
      return {
        group,
        update(t, pos) {
          last.copy(pos);
          const d = pos.clone().sub(origin);
          const len = Math.max(0.01, d.length());
          body.quaternion.setFromUnitVectors(UP, d.normalize());
          const r = size * (0.55 + 0.06 * Math.sin(t * 40));
          sheath.scale.set(r, len, r);
          core.scale.set(r * 0.3, len, r * 0.3);
          head.scale.setScalar(size * (2.1 + 0.25 * Math.sin(t * 33)));
          headCore.scale.setScalar(size * 0.8);
        },
        // The column stays a moment after the impact, thinning out, so the beam reads.
        dispose() {
          scene.remove(group);
          const r0 = sheath.scale.x;
          const start = performance.now();
          const fade = () => {
            const k = (performance.now() - start) / 350;
            if (k >= 1) {
              done();
              return;
            }
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
      const f = flames(7, size * 2, size * 0.7);
      const halo = new THREE.Sprite(additive(glow, 0xff6a1a, 0.35));
      halo.scale.setScalar(size * 3);
      group.add(halo, f);
      return {
        group,
        update(t) {
          (f.userData.flicker as (t: number) => void)(t);
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
    default:
      scene.remove(group);
      return null;
  }
}

/** What glows in the hand (or along the blade) during a special. */
export interface HandLook {
  obj: THREE.Object3D;
  update(t: number): void;
}

/** Builds a hand effect. `blade`: the weapon's length along +Y (flames on it), or 0. */
export function handLook(look: NonNullable<MoveStyle["hand"]>, color: string, blade: number): HandLook {
  const obj = new THREE.Group();
  switch (look) {
    case "ki": {
      const halo = new THREE.Sprite(additive(glow, color, 0.75));
      const core = new THREE.Sprite(additive(glow, 0xffffff));
      obj.add(halo, core);
      return {
        obj,
        update(t) {
          halo.scale.setScalar(0.38 + 0.06 * Math.sin(t * 25));
          core.scale.setScalar(0.12);
        },
      };
    }
    case "orb": {
      // A ball of spinning wind: a bright core, a translucent shell, rings whipping round.
      const shell = new THREE.Mesh(
        new THREE.SphereGeometry(0.13, 20, 14),
        noOutline(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false })),
      );
      const core = new THREE.Sprite(additive(glow, 0xffffff));
      core.scale.setScalar(0.22);
      const halo = new THREE.Sprite(additive(glow, color, 0.8));
      obj.add(shell, core, halo);
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
          halo.scale.setScalar(0.5 + 0.06 * Math.sin(t * 30));
        },
      };
    }
    case "lightning": {
      // Crackling arcs round the hand, redrawn every frame, and a white-blue glow.
      const halo = new THREE.Sprite(additive(glow, color, 0.9));
      const core = new THREE.Sprite(additive(glow, 0xffffff));
      core.scale.setScalar(0.25);
      const n = 10;
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
            for (let s = 0; s < 6; s++) {
              const q = p.clone().addScaledVector(dir, 0.045).add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.05));
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
      // Along the blade if there is one, else round the fist.
      const f = flames(blade > 0 ? 9 : 5, blade > 0 ? 0.32 : 0.3, 0.05);
      if (blade > 0)
        f.children.forEach((s, i) => {
          (s.userData.base as THREE.Vector3).set(0, 0.1 + (i / (f.children.length - 1)) * (blade - 0.1), 0);
        });
      const halo = new THREE.Sprite(additive(glow, 0xff6a1a, 0.5));
      halo.scale.setScalar(0.5);
      halo.position.y = blade / 2;
      obj.add(f, halo);
      return {
        obj,
        update(t) {
          (f.userData.flicker as (t: number) => void)(t);
        },
      };
    }
  }
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
