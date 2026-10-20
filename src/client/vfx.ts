// Anime impact effects: spark stars, streaks, shockwave rings, slash arcs,
// speed lines and dust. All additive sprites or flat meshes, no outlines,
// each with a short life. Purely visual: nothing here touches the simulation.

import * as THREE from "three";
import { flameTexture } from "./moveFx.ts";
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

  /**
   * Hit: a white-hot flash, an anime burst of sharp rays (white over the attacker's
   * colour), sparks that fly off, fall and stretch with their speed, a shockwave ring.
   */
  hit(pos: THREE.Vector3, color: THREE.ColorRepresentation, big: boolean): void {
    const size = big ? 2.6 : 1.6;
    const flash = this.sprite(this.glow, 0xffffff, 0.7);
    flash.position.copy(pos);
    this.add(flash, 0.07, (k) => {
      flash.scale.setScalar(size * (0.45 + k * 0.25));
      flash.material.opacity = 0.7 * (1 - k);
    });
    const spin = Math.random() * Math.PI;
    const back = this.sprite(burstTexture(), color);
    back.position.copy(pos);
    back.material.rotation = spin + 0.2;
    this.add(back, big ? 0.26 : 0.18, (k) => {
      back.scale.setScalar(size * 1.35 * (0.55 + Math.sqrt(k) * 0.7));
      back.material.opacity = 1 - k * k;
    });
    const burst = this.sprite(burstTexture(), 0xffffff);
    burst.position.copy(pos);
    burst.material.rotation = spin;
    this.add(burst, big ? 0.18 : 0.13, (k) => {
      burst.scale.setScalar(size * (0.5 + Math.sqrt(k) * 0.6));
      burst.material.opacity = 1 - k;
    });
    this.sparks(pos, color, big ? 16 : 9, big ? 11 : 7);
    if (big) this.ring(pos, color, 3.2);
    this.shake = Math.max(this.shake, big ? 0.35 : 0.12);
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
    this.add(ring, 0.3, (k) => {
      // Fast out, slowing down: a burst, not a steady growth.
      ring.scale.setScalar(size * (0.25 + (1 - (1 - k) ** 3) * 0.8));
      m.opacity = 1 - k;
    });
    ring.onBeforeRender = (_r, _s, cam) => ring.quaternion.copy(cam.quaternion);
  }

  /** Ground shockwave (landing a heavy blow, knockdown, area special). */
  groundWave(pos: THREE.Vector3, color: THREE.ColorRepresentation, size: number): void {
    const m = noOutline(new THREE.MeshBasicMaterial({ color, map: ringTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m);
    ring.rotation.x = -Math.PI / 2;
    ring.position.copy(pos).setY(pos.y + 0.05);
    this.add(ring, 0.45, (k) => {
      ring.scale.setScalar(size * (0.2 + (1 - (1 - k) ** 3) * 0.9));
      m.opacity = 0.95 * (1 - k);
    });
    // The ground kicks up: dust thrown out along the front.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.random() * 0.4;
      const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const s = new THREE.Sprite(noOutline(new THREE.SpriteMaterial({ map: this.glow, color: 0xe8dcc0, transparent: true, opacity: 0.5, depthWrite: false })));
      const at = pos.clone().setY(pos.y + 0.25);
      this.add(s, 0.5, (k) => {
        s.position.copy(at).addScaledVector(d, size * (0.2 + (1 - (1 - k) ** 3) * 0.85));
        s.scale.setScalar(0.5 + k * size * 0.35);
        s.material.opacity = 0.5 * (1 - k);
      });
    }
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
    for (let i = 0; i < count; i++) {
      const s = this.sprite(flameTexture(), 0xff9a50, 0.65);
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a), 0.6 + Math.random(), Math.sin(a)).multiplyScalar(size * (1.5 + Math.random() * 2));
      s.position.copy(pos);
      const sz = size * (0.8 + Math.random() * 0.8);
      this.add(s, 0.45 + Math.random() * 0.3, (k, dt) => {
        s.position.addScaledVector(v, dt * (1 - k * 0.6));
        s.scale.set(sz * (0.6 + k * 0.6), sz * (1 + k), 1);
        s.material.opacity = 0.65 * (1 - k);
      });
    }
    // Dark smoke billowing up after it (drawn over, not added: it gives the fire its contrast).
    for (let i = 0; i < 6; i++) {
      const smoke = new THREE.Sprite(noOutline(new THREE.SpriteMaterial({ map: this.glow, color: i % 2 ? 0x3a3330 : 0x4d4540, transparent: true, opacity: 0, depthWrite: false })));
      const v = new THREE.Vector3((Math.random() - 0.5) * 1.2, 1.2 + Math.random() * 1.2, (Math.random() - 0.5) * 1.2).multiplyScalar(size);
      const at = pos.clone();
      const delay = 0.08 + i * 0.03;
      this.add(smoke, 1.3, (k, dt) => {
        const age = k * 1.3 - delay;
        if (age < 0) return;
        at.addScaledVector(v, dt);
        v.multiplyScalar(Math.exp(-dt * 1.5));
        smoke.position.copy(at);
        smoke.scale.setScalar(size * (1.0 + age * 2.4));
        smoke.material.opacity = 0.75 * Math.min(1, age * 6) * (1 - k);
      });
    }
  }

  /** Launch trail: a puff left behind a fighter sent flying, bigger the faster it goes. */
  puff(pos: THREE.Vector3, size: number): void {
    const s = new THREE.Sprite(
      noOutline(new THREE.SpriteMaterial({ map: this.glow, color: 0xf2efe8, transparent: true, opacity: 0.55, depthWrite: false })),
    );
    s.position.copy(pos);
    this.add(s, 0.45, (k) => {
      s.scale.setScalar(size * (0.6 + k * 0.9));
      s.material.opacity = 0.55 * (1 - k);
    });
  }

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
   * The name of a technique, written top to bottom in bold brush-like strokes beside the
   * fighter: it stamps in (scale down, fade in), holds, and fades. Drawn over the scene.
   */
  callout(pos: THREE.Vector3, text: string, color: THREE.ColorRepresentation): void {
    const chars = [...text];
    const cell = 112;
    const c = document.createElement("canvas");
    c.width = 160;
    c.height = cell * chars.length + 48;
    const g = c.getContext("2d")!;
    // A brush stroke of the fighter's colour behind the characters.
    g.fillStyle = `#${new THREE.Color(color).getHexString()}`;
    g.globalAlpha = 0.85;
    g.beginPath();
    g.moveTo(52, 10);
    g.quadraticCurveTo(120, 0, 112, c.height * 0.5);
    g.quadraticCurveTo(104, c.height - 6, 58, c.height - 14);
    g.quadraticCurveTo(36, c.height * 0.5, 52, 10);
    g.fill();
    g.globalAlpha = 1;
    g.font = `900 ${cell * 0.86}px "Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", "Noto Serif CJK JP", "MS Mincho", serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.lineJoin = "round";
    chars.forEach((ch, i) => {
      const y = 24 + cell * (i + 0.5);
      g.lineWidth = 14;
      g.strokeStyle = "#ffffff";
      g.strokeText(ch, 80, y);
      g.fillStyle = "#111111";
      g.fillText(ch, 80, y);
    });
    const map = new THREE.CanvasTexture(c);
    map.colorSpace = THREE.SRGBColorSpace;
    const m = noOutline(new THREE.SpriteMaterial({ map, transparent: true, depthTest: false, depthWrite: false }));
    const sprite = new THREE.Sprite(m);
    sprite.renderOrder = 10;
    sprite.position.copy(pos);
    const h = 0.6 * chars.length + 0.3;
    const w = (h * c.width) / c.height;
    this.add(sprite, 1.4, (k) => {
      const stamp = Math.min(1, k / 0.08);
      const s = 1 + 0.35 * (1 - stamp) * (1 - stamp);
      sprite.scale.set(w * s, h * s, 1);
      m.opacity = stamp * (k > 0.75 ? (1 - k) / 0.25 : 1);
      if (k >= 1) map.dispose();
    });
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
    this.effects = this.effects.filter((e) => {
      e.age += dt;
      const k = Math.min(1, e.age / e.life);
      e.update(k, dt);
      if (k < 1) return true;
      this.scene.remove(e.obj);
      e.obj.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Sprite) {
          if (o instanceof THREE.Mesh) o.geometry.dispose();
          for (const m of [o.material].flat() as THREE.Material[]) m.dispose();
        }
      });
      return false;
    });
  }
}
