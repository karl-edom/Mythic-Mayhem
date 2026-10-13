// Three.js view of a BrawlWorld. Read-only: it never changes the simulation.
// Readability first: every state that matters to the opponent has a visual cue.
//   wind-up (startup) → faint hitbox outline · active hitbox → solid sphere
//   guard → bubble · guard broken → spinning stars · energy charge → aura column
//   invulnerable → blinking · area special → ground ring filling up until impact

import * as THREE from "three";
import type { Character } from "../brawl/character.ts";
import type { Strike } from "../brawl/kit.ts";
import { FIGHTER_HEIGHT, lockTarget, strikeCenter, type BrawlWorld, type Fighter } from "../brawl/world.ts";

interface FighterView {
  root: THREE.Group;
  body: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  accentMat: THREE.MeshStandardMaterial;
  shadow: THREE.Mesh;
  guard: THREE.Mesh;
  aura: THREE.Mesh;
  stars: THREE.Group;
  hitbox: THREE.Mesh;
  hitboxMat: THREE.MeshBasicMaterial;
  chargeOrb: THREE.Mesh;
  flashUntil: number;
}

const SKY = 0xbfe8ff;

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  return renderer;
}

export class ArenaView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 200);
  private fighters: FighterView[] = [];
  private projectiles = new Map<object, THREE.Mesh>();
  private zones = new Map<object, THREE.Group>();
  private camPos = new THREE.Vector3(0, 6, 14);
  private camLook = new THREE.Vector3();
  private lastEvent = 0;

  private renderer: THREE.WebGLRenderer;
  private world: BrawlWorld;
  private characters: Character[];
  /** The fighter the camera follows (the local player). */
  private focus: number;

  constructor(renderer: THREE.WebGLRenderer, world: BrawlWorld, characters: Character[], focus: number) {
    this.renderer = renderer;
    this.world = world;
    this.characters = characters;
    this.focus = focus;
    this.scene.background = new THREE.Color(SKY);
    this.scene.fog = new THREE.Fog(SKY, 40, 90);
    this.buildArena();
    this.fighters = world.fighters.map((f) => this.buildFighter(f, characters[f.id]!));
    this.resize();
  }

  private buildArena(): void {
    const R = this.world.config.arenaRadius;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8c8a0, 1.6));
    const sun = new THREE.DirectionalLight(0xfff4dd, 2.2);
    sun.position.set(12, 25, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -R - 2, right: R + 2, top: R + 2, bottom: -R - 2 });
    this.scene.add(sun);

    // Grass outside, a warm sand disc inside, concentric rings to read distances.
    const grass = new THREE.Mesh(new THREE.CircleGeometry(80, 64), new THREE.MeshStandardMaterial({ color: 0x9be37a }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.02;
    this.scene.add(grass);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R, 96), new THREE.MeshStandardMaterial({ color: 0xffe2a8 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    for (const r of [R * 0.33, R * 0.66]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.06, r + 0.06, 96), new THREE.MeshBasicMaterial({ color: 0xf2c879 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.01;
      this.scene.add(ring);
    }
    // Low wall made of colourful blocks.
    const colors = [0xff6b6b, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xb388ff];
    const n = 48;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const block = new THREE.Mesh(
        new THREE.BoxGeometry(((2 * Math.PI * R) / n) * 0.92, 1, 0.8),
        new THREE.MeshStandardMaterial({ color: colors[i % colors.length] }),
      );
      block.position.set(Math.cos(a) * (R + 0.4), 0.5, Math.sin(a) * (R + 0.4));
      block.rotation.y = -a + Math.PI / 2;
      block.castShadow = true;
      this.scene.add(block);
    }
    // A few trees around for scale and cheer.
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + 0.2;
      const d = R + 6 + (i % 3) * 3;
      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2), new THREE.MeshStandardMaterial({ color: 0xa47148 }));
      trunk.position.y = 1;
      const top = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), new THREE.MeshStandardMaterial({ color: 0x4caf50 }));
      top.position.y = 3;
      tree.add(trunk, top);
      tree.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
      this.scene.add(tree);
    }
  }

  private buildFighter(f: Fighter, ch: Character): FighterView {
    const r = f.kit.stats.radius;
    const root = new THREE.Group();
    const body = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: ch.colors.primary, roughness: 0.6 });
    const accentMat = new THREE.MeshStandardMaterial({ color: ch.colors.secondary, roughness: 0.4 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(r, FIGHTER_HEIGHT - 2 * r - 0.35, 6, 16), bodyMat);
    torso.position.y = (FIGHTER_HEIGHT - 0.35) / 2;
    torso.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), accentMat);
    head.position.y = FIGHTER_HEIGHT - 0.25;
    head.castShadow = true;
    // The "nose" shows where the fighter faces (attacks come out this way).
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 12), accentMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, FIGHTER_HEIGHT * 0.55, r + 0.2);
    body.add(torso, head, nose);
    root.add(body);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(r * 1.2, 24),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }),
    );
    shadow.rotation.x = -Math.PI / 2;
    this.scene.add(shadow);

    const guard = new THREE.Mesh(
      new THREE.SphereGeometry(FIGHTER_HEIGHT * 0.65, 20, 14),
      new THREE.MeshBasicMaterial({ color: 0x7fdcff, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    guard.position.y = FIGHTER_HEIGHT / 2;
    root.add(guard);

    const aura = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 2, r * 2.4, FIGHTER_HEIGHT * 1.4, 24, 1, true),
      new THREE.MeshBasicMaterial({ color: ch.colors.secondary, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false }),
    );
    aura.position.y = FIGHTER_HEIGHT * 0.7;
    root.add(aura);

    const stars = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), new THREE.MeshBasicMaterial({ color: 0xffd60a }));
      const a = (i / 3) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45);
      stars.add(s);
    }
    stars.position.y = FIGHTER_HEIGHT + 0.35;
    root.add(stars);

    const hitboxMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false });
    const hitbox = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), hitboxMat);
    this.scene.add(hitbox);

    const chargeOrb = new THREE.Mesh(
      new THREE.SphereGeometry(1, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xff9f1c, transparent: true, opacity: 0.7 }),
    );
    root.add(chargeOrb);

    this.scene.add(root);
    return { root, body, bodyMat, accentMat, shadow, guard, aura, stars, hitbox, hitboxMat, chargeOrb, flashUntil: 0 };
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Camera forward direction on the floor plane, for camera-relative movement. */
  forward(): { x: number; z: number } {
    const v = new THREE.Vector3();
    this.camera.getWorldDirection(v);
    const l = Math.hypot(v.x, v.z) || 1;
    return { x: v.x / l, z: v.z / l };
  }

  render(dt: number): void {
    const w = this.world;
    const t = w.time;
    for (const e of w.events.slice(this.lastEvent))
      if (e.type === "hit" || e.type === "guardBreak") this.fighters[e.target]!.flashUntil = t + 0.12;
    this.lastEvent = w.events.length;

    w.fighters.forEach((f, i) => this.syncFighter(f, this.fighters[i]!, t));
    this.syncProjectiles();
    this.syncZones();
    this.syncCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private syncFighter(f: Fighter, v: FighterView, t: number): void {
    v.root.visible = f.alive;
    v.shadow.visible = f.alive;
    v.hitbox.visible = false;
    if (!f.alive) return;
    v.root.position.set(f.pos.x, f.pos.y, f.pos.z);
    v.root.rotation.y = Math.atan2(f.facing.x, f.facing.z);
    v.shadow.position.set(f.pos.x, 0.02, f.pos.z);
    v.shadow.scale.setScalar(Math.max(0.4, 1 - f.pos.y * 0.15));

    const a = f.action;
    const flashing = v.flashUntil > t;
    v.bodyMat.emissive.setHex(flashing ? 0xffffff : 0x000000);
    v.bodyMat.emissiveIntensity = flashing ? 0.9 : 0;

    const invulnerable = f.invulnerableUntil > t || (a?.kind === "dodge" && a.t < this.world.config.dodgeInvulnerable);
    const blink = invulnerable && Math.floor(t * 12) % 2 === 0;
    v.body.visible = !blink;

    // Knocked down: lie on the back.
    v.body.rotation.x = a?.kind === "knockdown" ? -Math.PI / 2.2 : a?.kind === "dodge" ? -0.35 : 0;
    v.body.position.y = a?.kind === "knockdown" ? 0.3 : 0;

    v.guard.visible = a?.kind === "guard" || a?.kind === "blockstun";
    v.aura.visible = a?.kind === "charge";
    if (v.aura.visible) (v.aura.material as THREE.MeshBasicMaterial).opacity = 0.2 + 0.15 * Math.sin(t * 20);
    v.stars.visible = a?.kind === "guardbroken";
    v.stars.rotation.y = t * 6;

    v.chargeOrb.visible = a?.kind === "heavy" && a.charging;
    if (a?.kind === "heavy" && a.charging) {
      const k = f.kit.heavy.maxCharge > 0 ? a.charge / f.kit.heavy.maxCharge : 0;
      v.chargeOrb.scale.setScalar(0.15 + 0.35 * k);
      v.chargeOrb.position.set(0, FIGHTER_HEIGHT * 0.55, f.kit.stats.radius + 0.5);
    }

    // Attack hitboxes: outline during wind-up (telegraph), solid while live.
    let strike: Strike | undefined;
    let at = 0;
    if (a?.kind === "light") {
      strike = f.kit.light.hits[a.index];
      at = a.t;
    } else if (a?.kind === "heavy" && !a.charging) {
      strike = f.kit.heavy;
      at = a.t;
    } else if (a?.kind === "heavy") strike = f.kit.heavy;
    if (strike && at < strike.startup + strike.active) {
      const live = at >= strike.startup;
      const c = strikeCenter(f, strike);
      v.hitbox.visible = true;
      v.hitbox.position.set(c.x, c.y, c.z);
      v.hitbox.scale.setScalar(strike.size);
      v.hitboxMat.color.set(a?.kind === "heavy" ? 0xff7b00 : 0xffffff);
      v.hitboxMat.opacity = live ? 0.6 : 0.15;
      v.hitboxMat.wireframe = !live;
    }
  }

  private syncProjectiles(): void {
    const seen = new Set<object>();
    for (const p of this.world.projectiles) {
      seen.add(p);
      let m = this.projectiles.get(p);
      if (!m) {
        const ch = this.characters[p.owner]!;
        m = new THREE.Mesh(new THREE.SphereGeometry(p.size, 16, 12), new THREE.MeshBasicMaterial({ color: ch.colors.secondary }));
        this.scene.add(m);
        this.projectiles.set(p, m);
      }
      m.position.set(p.pos.x, p.pos.y, p.pos.z);
    }
    for (const [p, m] of this.projectiles)
      if (!seen.has(p)) {
        this.scene.remove(m);
        this.projectiles.delete(p);
      }
  }

  private syncZones(): void {
    const seen = new Set<object>();
    const t = this.world.time;
    for (const z of this.world.zones) {
      seen.add(z);
      let g = this.zones.get(z);
      if (!g) {
        const color = this.characters[z.owner]!.colors.primary;
        g = new THREE.Group();
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(z.radius - 0.12, z.radius, 64),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
        );
        const fill = new THREE.Mesh(
          new THREE.CircleGeometry(z.radius, 64),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false }),
        );
        fill.name = "fill";
        g.add(ring, fill);
        g.rotation.x = -Math.PI / 2;
        g.position.set(z.center.x, 0.03, z.center.z);
        this.scene.add(g);
        this.zones.set(z, g);
      }
      const k = Math.min(1, (t - z.createdAt) / Math.max(1e-6, z.triggerAt - z.createdAt));
      g.getObjectByName("fill")!.scale.setScalar(Math.max(0.01, k));
    }
    for (const [z, g] of this.zones)
      if (!seen.has(z)) {
        this.scene.remove(g);
        this.zones.delete(z);
      }
  }

  /** Lock-on camera: behind the player, looking towards the opponent. */
  private syncCamera(dt: number): void {
    const me = this.world.fighters[this.focus]!;
    const foe = lockTarget(this.world, me);
    const p = new THREE.Vector3(me.pos.x, me.pos.y, me.pos.z);
    let wantPos: THREE.Vector3;
    let wantLook: THREE.Vector3;
    if (foe && me.alive) {
      const o = new THREE.Vector3(foe.pos.x, foe.pos.y, foe.pos.z);
      const dir = o.clone().sub(p).setY(0);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
      dir.normalize();
      // Over the right shoulder, high enough to see the opponent past the player.
      const right = new THREE.Vector3(-dir.z, 0, dir.x);
      wantPos = p.clone().addScaledVector(dir, -7.5).addScaledVector(right, 1.8).add(new THREE.Vector3(0, 4.2, 0));
      wantLook = p.clone().lerp(o, 0.6).add(new THREE.Vector3(0, 1, 0));
    } else {
      wantPos = new THREE.Vector3(0, 14, 22);
      wantLook = new THREE.Vector3(0, 0, 0);
    }
    const k = 1 - Math.exp(-dt * 6);
    this.camPos.lerp(wantPos, k);
    this.camLook.lerp(wantLook, k);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }

  dispose(): void {
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
    this.scene.clear();
  }
}
