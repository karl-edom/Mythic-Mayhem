// Three.js view of a BrawlWorld. Read-only: it never changes the simulation.
// Readability first: every state that matters to the opponent has a visual cue.
//   wind-up (startup) → faint hitbox outline · active hitbox → solid sphere
//   guard → bubble · guard broken → spinning stars · energy charge → aura column
//   invulnerable → blinking · area special → ground ring filling up until impact

import * as THREE from "three";
import type { Character } from "../brawl/character.ts";
import type { Strike } from "../brawl/kit.ts";
import { distToProp, type Prop } from "../brawl/arena.ts";
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

const mat = (color: string | number) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 });

/** Simple, readable shapes per prop look. The collision shape is the prop's footprint and height. */
function buildProp(p: Prop): THREE.Group {
  const g = new THREE.Group();
  const s = p.kind.shape;
  const w = p.halfW * 2;
  const d = p.halfD * 2;
  const h = p.height;
  const add = (m: THREE.Mesh, y: number) => {
    m.position.y = y;
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };
  if (p.rise) {
    // Ramps and stairs: built along local +x rising, then turned to face their direction.
    const run = p.rise.axis === "x" ? w : d;
    const across = p.rise.axis === "x" ? d : w;
    const body = new THREE.Group();
    if (p.kind.look === "stairs") {
      const n = Math.max(2, Math.round(h / 0.3));
      for (let i = 0; i < n; i++) {
        const sh = (h * (i + 1)) / n;
        const step = new THREE.Mesh(new THREE.BoxGeometry(run / n, sh, across), mat(p.kind.color));
        step.position.set(-run / 2 + (run / n) * (i + 0.5), sh / 2, 0);
        step.castShadow = step.receiveShadow = true;
        body.add(step);
      }
    } else {
      const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(run, 0), new THREE.Vector2(run, h)]);
      const geo = new THREE.ExtrudeGeometry(tri, { depth: across, bevelEnabled: false });
      geo.translate(-run / 2, 0, -across / 2);
      const wedge = new THREE.Mesh(geo, mat(p.kind.color));
      wedge.castShadow = wedge.receiveShadow = true;
      body.add(wedge);
    }
    // Local +x → world rising direction.
    body.rotation.y = p.rise.axis === "x" ? (p.rise.sign > 0 ? 0 : Math.PI) : p.rise.sign > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(body);
    return g;
  }
  switch (p.kind.look) {
    case "platform":
    case "terrace":
    case "tower": {
      add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(p.kind.color)), h / 2);
      // A lighter rim on top reads as "you can stand here".
      const rim = add(new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 0.15, d + 0.1), mat(0xf4ecd8)), h - 0.07);
      rim.castShadow = false;
      break;
    }
    case "tree":
      add(new THREE.Mesh(new THREE.CylinderGeometry(p.halfW * 0.7, p.halfW, h * 0.45, 12), mat(0xa47148)), h * 0.225);
      add(new THREE.Mesh(new THREE.SphereGeometry(p.halfW * 2.2, 16, 12), mat(p.kind.color)), h * 0.72);
      break;
    case "house": {
      add(new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.6, d), mat(p.kind.color)), h * 0.3);
      const roof = add(new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) / 2 + 0.3, h * 0.4, 4), mat(0xe76f51)), h * 0.8);
      roof.rotation.y = Math.PI / 4;
      roof.scale.set(w / Math.hypot(w, d) * 1.414, 1, d / Math.hypot(w, d) * 1.414);
      break;
    }
    case "crate": {
      add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(p.kind.color)), h / 2);
      const band = add(new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, h * 0.15, d * 1.02), mat(0x8d5a2b)), h / 2);
      band.castShadow = false;
      break;
    }
    case "fence":
      for (let i = 0; i < 5; i++) {
        const post = add(new THREE.Mesh(new THREE.BoxGeometry(0.15, h, 0.15), mat(p.kind.color)), h / 2);
        const along = -0.5 + i / 4;
        post.position.x = w > d ? along * (w - 0.2) : 0;
        post.position.z = w > d ? 0 : along * (d - 0.2);
      }
      add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, d), mat(p.kind.color)), h * 0.75);
      add(new THREE.Mesh(new THREE.BoxGeometry(w, 0.15, d), mat(p.kind.color)), h * 0.35);
      break;
    case "rock": {
      const r = add(new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), mat(p.kind.color)), h / 2);
      r.scale.set(w / 2, h / 2, d / 2);
      break;
    }
    default:
      add(
        s.type === "cylinder" ? new THREE.Mesh(new THREE.CylinderGeometry(p.halfW, p.halfW, h, 20), mat(p.kind.color)) : new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(p.kind.color)),
        h / 2,
      );
  }
  return g;
}

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
  private props: THREE.Object3D[] = [];
  private raycaster = new THREE.Raycaster();
  private debris: { mesh: THREE.Mesh; vel: THREE.Vector3; until: number }[] = [];

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
    this.buildArena();
    this.fighters = world.fighters.map((f) => this.buildFighter(f, characters[f.id]!));
    this.resize();
  }

  private buildArena(): void {
    const { halfW, halfD, def } = this.world.arena;
    const span = Math.max(halfW, halfD);
    this.scene.fog = new THREE.Fog(SKY, span * 2, span * 5);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8c8a0, 1.6));
    const sun = new THREE.DirectionalLight(0xfff4dd, 2.2);
    sun.position.set(span * 0.6, span * 1.4, span * 0.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(4096, 4096);
    Object.assign(sun.shadow.camera, { left: -span - 4, right: span + 4, top: span + 4, bottom: -span - 4, far: span * 4 });
    this.scene.add(sun);

    // Grass all around, the arena floor, a faint grid to read distances.
    const grass = new THREE.Mesh(new THREE.PlaneGeometry(span * 8, span * 8), new THREE.MeshStandardMaterial({ color: 0x9be37a }));
    grass.rotation.x = -Math.PI / 2;
    grass.position.y = -0.02;
    this.scene.add(grass);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, halfD * 2), new THREE.MeshStandardMaterial({ color: def.ground }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const grid = new THREE.GridHelper(Math.max(halfW, halfD) * 2, Math.round(Math.max(halfW, halfD) / 2), 0xffffff, 0xffffff);
    (grid.material as THREE.Material).opacity = 0.18;
    (grid.material as THREE.Material).transparent = true;
    grid.scale.set(halfW / Math.max(halfW, halfD), 1, halfD / Math.max(halfW, halfD));
    grid.position.y = 0.01;
    this.scene.add(grid);

    // Low wall of colourful blocks along the four edges.
    const colors = [0xff6b6b, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xb388ff];
    let k = 0;
    const edge = (x0: number, z0: number, x1: number, z1: number) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const n = Math.max(1, Math.round(len / 3));
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        const block = new THREE.Mesh(
          new THREE.BoxGeometry((len / n) * 0.94, 1, 0.8),
          new THREE.MeshStandardMaterial({ color: colors[k++ % colors.length] }),
        );
        block.position.set(x0 + (x1 - x0) * t, 0.5, z0 + (z1 - z0) * t);
        block.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
        block.castShadow = true;
        this.scene.add(block);
      }
    };
    const o = 0.4;
    edge(-halfW - o, -halfD - o, halfW + o, -halfD - o);
    edge(halfW + o, -halfD - o, halfW + o, halfD + o);
    edge(halfW + o, halfD + o, -halfW - o, halfD + o);
    edge(-halfW - o, halfD + o, -halfW - o, -halfD - o);

    for (const p of this.world.arena.props) {
      const mesh = buildProp(p);
      mesh.position.set(p.x, 0, p.z);
      mesh.userData.prop = p.id;
      this.scene.add(mesh);
      this.props.push(mesh);
    }
  }

  /** Bits flying out of a broken prop. */
  private burst(p: Prop): void {
    this.props[p.id]!.visible = false;
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshStandardMaterial({ color: p.kind.color }));
      m.position.set(p.x, p.height * 0.6, p.z);
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * (2 + Math.random() * 3), 4 + Math.random() * 4, Math.sin(a) * (2 + Math.random() * 3));
      this.scene.add(m);
      this.debris.push({ mesh: m, vel: v, until: performance.now() + 1200 });
    }
  }

  private syncDebris(dt: number): void {
    const now = performance.now();
    this.debris = this.debris.filter((d) => {
      d.vel.y -= 25 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      if (d.mesh.position.y < 0.12) {
        d.mesh.position.y = 0.12;
        d.vel.set(d.vel.x * 0.5, 0, d.vel.z * 0.5);
      }
      d.mesh.rotation.x += dt * 8;
      if (now < d.until) return true;
      this.scene.remove(d.mesh);
      return false;
    });
  }

  /** Props between the camera and the player turn see-through, so the player is never lost behind a wall. */
  private syncProps(): void {
    const me = this.world.fighters[this.focus]!;
    const cam = this.camera.position;
    // Cast rays from the camera to the player's feet, chest and head: whatever they cross is in the way.
    const blocking = new Set<number>();
    for (const h of [0.2, FIGHTER_HEIGHT * 0.6, FIGHTER_HEIGHT]) {
      const target = new THREE.Vector3(me.pos.x, me.pos.y + h, me.pos.z);
      const dir = target.clone().sub(cam);
      this.raycaster.set(cam, dir.clone().normalize());
      this.raycaster.far = dir.length();
      for (const hit of this.raycaster.intersectObjects(this.props, true)) {
        let o: THREE.Object3D | null = hit.object;
        while (o && o.userData.prop === undefined) o = o.parent;
        if (o) blocking.add(o.userData.prop as number);
      }
    }
    const flying = new Map(this.world.projectiles.filter((q) => q.prop !== undefined).map((q) => [q.prop!, q]));
    this.world.arena.props.forEach((p, i) => {
      const mesh = this.props[i]!;
      mesh.visible = p.alive || p.held !== null || p.flying;
      mesh.rotation.set(0, 0, 0);
      if (p.held !== null) {
        // Carried overhead; while lifting it rises from the floor.
        const f = this.world.fighters[p.held]!;
        const lift = f.action?.kind === "lift" ? Math.min(1, f.action.t / this.world.config.liftTime) : 1;
        mesh.position.set(f.pos.x, f.pos.y + lift * (FIGHTER_HEIGHT + 0.1), f.pos.z);
        return;
      }
      const q = flying.get(i);
      if (q) {
        mesh.position.set(q.pos.x, q.pos.y - p.height / 2, q.pos.z);
        mesh.rotation.set(this.world.time * 9, 0, 0);
        return;
      }
      if (!p.alive) return;
      const hides = blocking.has(i) || distToProp(p, cam.x, cam.z) < 1;
      mesh.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          const m = o.material as THREE.MeshStandardMaterial;
          m.transparent = hides;
          m.opacity = hides ? 0.3 : 1;
          m.depthWrite = !hides;
        }
      });
      // Breakable props darken as they take damage.
      if (p.kind.hp !== null) {
        const k = 0.45 + 0.55 * Math.max(0, p.hp / p.kind.hp);
        mesh.traverse((o) => {
          if (o instanceof THREE.Mesh) (o.material as THREE.MeshStandardMaterial).color.set(p.kind.color).multiplyScalar(k);
        });
      }
    });
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
    for (const e of w.events.slice(this.lastEvent)) {
      if (e.type === "hit" || e.type === "guardBreak") this.fighters[e.target]!.flashUntil = t + 0.12;
      if (e.type === "propBroken") this.burst(w.arena.props[e.prop]!);
    }
    this.lastEvent = w.events.length;

    w.fighters.forEach((f, i) => this.syncFighter(f, this.fighters[i]!, t));
    this.syncProjectiles();
    this.syncZones();
    this.syncCamera(dt);
    this.syncProps();
    this.syncDebris(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private syncFighter(f: Fighter, v: FighterView, t: number): void {
    v.root.visible = f.alive;
    v.shadow.visible = f.alive;
    v.hitbox.visible = false;
    if (!f.alive) return;
    v.root.position.set(f.pos.x, f.pos.y, f.pos.z);
    v.root.rotation.y = Math.atan2(f.facing.x, f.facing.z);
    v.shadow.position.set(f.pos.x, f.floor + 0.02, f.pos.z);
    v.shadow.scale.setScalar(Math.max(0.4, 1 - (f.pos.y - f.floor) * 0.15));

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
      if (p.prop !== undefined) continue; // drawn as the prop itself
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
        g.position.set(z.center.x, z.center.y + 0.03, z.center.z);
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
      // Aim between the two, but never so far ahead that the player leaves the frame on a big map.
      const ahead = Math.min(p.distanceTo(o) * 0.6, 4);
      wantLook = p.clone().addScaledVector(dir, ahead).add(new THREE.Vector3(0, 1, 0));
    } else {
      wantPos = new THREE.Vector3(0, 14, 22);
      wantLook = new THREE.Vector3(0, 0, 0);
    }
    // Stay inside the walls: near an edge the camera comes closer instead of looking through the wall.
    const { halfW, halfD } = this.world.arena;
    const cx = Math.max(-halfW + 0.5, Math.min(halfW - 0.5, wantPos.x));
    const cz = Math.max(-halfD + 0.5, Math.min(halfD - 0.5, wantPos.z));
    // ...and rises by what it lost, to keep the player and the opponent in frame.
    wantPos.y += Math.hypot(cx - wantPos.x, cz - wantPos.z) * 0.3;
    wantPos.x = cx;
    wantPos.z = cz;
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
