// Anime impact effects: spark stars, streaks, shockwave rings, slash arcs,
// speed lines and dust. All additive sprites or flat meshes, no outlines,
// each with a short life. Purely visual: nothing here touches the simulation.

import * as THREE from "three";
import { glowTexture, noOutline, starTexture, toon } from "./toon.ts";

interface Effect {
  obj: THREE.Object3D;
  age: number;
  life: number;
  /** k goes 0 → 1 over the effect's life. */
  update: (k: number, dt: number) => void;
}

export class Vfx {
  private effects: Effect[] = [];
  private glow = glowTexture();
  private star = starTexture();
  private scene: THREE.Scene;
  /** Camera shake amplitude, decays by itself. */
  shake = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  private add(obj: THREE.Object3D, life: number, update: Effect["update"]): void {
    this.scene.add(obj);
    this.effects.push({ obj, age: 0, life, update });
  }

  private sprite(map: THREE.Texture, color: THREE.ColorRepresentation, opacity = 1): THREE.Sprite {
    const m = noOutline(
      new THREE.SpriteMaterial({ map, color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    return new THREE.Sprite(m);
  }

  /** Hit: white star, coloured streaks flying out, a shockwave ring for big hits. */
  hit(pos: THREE.Vector3, color: THREE.ColorRepresentation, big: boolean): void {
    const size = big ? 2.4 : 1.5;
    const star = this.sprite(this.star, 0xffffff);
    star.position.copy(pos);
    star.material.rotation = Math.random() * Math.PI;
    this.add(star, big ? 0.22 : 0.16, (k) => {
      star.scale.setScalar(size * (0.5 + k * 0.8));
      star.material.opacity = 1 - k;
    });
    const tinted = this.sprite(this.star, color, 0.9);
    tinted.position.copy(pos);
    tinted.material.rotation = Math.random() * Math.PI;
    this.add(tinted, big ? 0.3 : 0.2, (k) => {
      tinted.scale.setScalar(size * 1.3 * (0.6 + k));
      tinted.material.opacity = 0.9 * (1 - k);
    });
    const n = big ? 12 : 7;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), Math.sin(a) * 0.8 + 0.2, Math.sin(a * 1.7)).normalize();
      const streak = this.sprite(this.glow, color);
      streak.position.copy(pos);
      const speed = (big ? 9 : 6) * (0.6 + Math.random() * 0.6);
      this.add(streak, 0.25, (k, dt) => {
        streak.position.addScaledVector(dir, speed * dt * (1 - k));
        streak.scale.set(0.12, 0.6 * (1 - k) + 0.05, 1);
        streak.material.rotation = Math.atan2(dir.y, dir.x) - Math.PI / 2;
        streak.material.opacity = 1 - k;
      });
    }
    if (big) this.ring(pos, color, 3.2);
    this.shake = Math.max(this.shake, big ? 0.35 : 0.12);
  }

  /** Blocked hit: a cold flash of hexagonal light. */
  block(pos: THREE.Vector3): void {
    const flash = this.sprite(this.glow, 0x7fdcff);
    flash.position.copy(pos);
    this.add(flash, 0.18, (k) => {
      flash.scale.setScalar(1.6 + k);
      flash.material.opacity = 1 - k;
    });
    this.ring(pos, 0x9fe6ff, 1.6);
    this.shake = Math.max(this.shake, 0.06);
  }

  /** Expanding ring facing the camera. */
  ring(pos: THREE.Vector3, color: THREE.ColorRepresentation, size: number): void {
    const m = noOutline(new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48), m);
    ring.position.copy(pos);
    this.add(ring, 0.28, (k) => {
      ring.scale.setScalar(size * (0.3 + k));
      m.opacity = 1 - k;
    });
    ring.onBeforeRender = (_r, _s, cam) => ring.quaternion.copy(cam.quaternion);
  }

  /** Ground shockwave (landing a heavy blow, knockdown, area special). */
  groundWave(pos: THREE.Vector3, color: THREE.ColorRepresentation, size: number): void {
    const m = noOutline(new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), m);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos).setY(pos.y + 0.05);
    this.add(ring, 0.4, (k) => {
      ring.scale.setScalar(size * (0.2 + k));
      m.opacity = 0.9 * (1 - k);
    });
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
  dust(pos: THREE.Vector3, count = 5): void {
    for (let i = 0; i < count; i++) {
      const m = noOutline(new THREE.SpriteMaterial({ map: this.glow, color: 0xe8dcc0, transparent: true, opacity: 0.6, depthWrite: false }));
      const s = new THREE.Sprite(m);
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), 0.4, Math.sin(a)).multiplyScalar(1.5 + Math.random());
      s.position.copy(pos).setY(pos.y + 0.2);
      this.add(s, 0.5, (k, dt) => {
        s.position.addScaledVector(v, dt * (1 - k));
        s.scale.setScalar(0.5 + k * 1.2);
        m.opacity = 0.6 * (1 - k);
      });
    }
  }

  /** Chunks of a broken prop, cel-shaded and outlined like the prop itself. */
  debris(pos: THREE.Vector3, color: THREE.ColorRepresentation): void {
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), toon(color));
      m.position.copy(pos);
      m.castShadow = true;
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 3), 4 + Math.random() * 4, Math.sin(a) * (2 + Math.random() * 3));
      const spin = new THREE.Vector3(Math.random(), Math.random(), Math.random()).multiplyScalar(10);
      this.add(m, 1.1, (k, dt) => {
        v.y -= 25 * dt;
        m.position.addScaledVector(v, dt);
        if (m.position.y < 0.11) {
          m.position.y = 0.11;
          v.set(v.x * 0.5, -v.y * 0.25, v.z * 0.5);
        }
        m.rotation.x += spin.x * dt;
        m.rotation.y += spin.y * dt;
        m.scale.setScalar(k > 0.8 ? (1 - k) * 5 : 1);
      });
    }
    this.dust(pos, 6);
  }

  update(dt: number): void {
    this.shake *= Math.exp(-dt * 12);
    this.effects = this.effects.filter((e) => {
      e.age += dt;
      const k = Math.min(1, e.age / e.life);
      e.update(k, dt);
      if (k < 1) return true;
      this.scene.remove(e.obj);
      e.obj.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      return false;
    });
  }
}
