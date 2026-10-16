// Three.js view of a BrawlWorld, in a cel-shaded anime style. Read-only: it
// never changes the simulation. Readability first: every state that matters to
// the opponent has a visual cue.
//   strike → a trail that follows the weapon while the blow travels
//   guard → bubble · guard broken → spinning stars · energy charge → aura column
//   invulnerable → blinking · area special → magic circle filling up until impact

import * as THREE from "three";
import { OutlineEffect } from "three/examples/jsm/effects/OutlineEffect.js";
import { distToProp, segmentInterval, surfaceAt } from "../brawl/arena.ts";
import type { Character } from "../brawl/character.ts";
import type { Strike } from "../brawl/kit.ts";
import { FIGHTER_HEIGHT, bodyCenter, lockTarget, type BrawlWorld, type Fighter } from "../brawl/world.ts";
import { Animator } from "./animator.ts";
import { buildEnvironment } from "./environment.ts";
import { defaultLook, instantiate, weaponStyle, type ModelInstance, type ModelLibrary } from "./models.ts";
import { glowTexture, magicCircleTexture, noOutline, toon } from "./toon.ts";
import { WeaponTrail } from "./trail.ts";
import { Vfx } from "./vfx.ts";

interface FighterView {
  root: THREE.Group;
  model: ModelInstance | null;
  animator: Animator | null;
  /** Body materials (model or fallback capsule), for the hit flash. */
  materials: THREE.MeshToonMaterial[];
  shadow: THREE.Mesh;
  guard: THREE.Mesh;
  aura: THREE.Mesh;
  stars: THREE.Group;
  chargeOrb: THREE.Sprite;
  /** Red glow while health is low (hits send the fighter further, rhythm v3). */
  lowHp: THREE.Sprite;
  /** Ribbon following the weapon during strikes (anime models). */
  trail: WeaponTrail | null;
  flashUntil: number;
  /** Last strike whose slash arc was spawned (so each blow draws one arc). */
  slashKey: string;
  wasAirborne: boolean;
}

export function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  return renderer;
}

/** Slash tilt per combo hit, so consecutive blows read as different swings. */
const SLASH_TILT = [0.55, -0.55, 0.05, 1.1, -1.0];

export class ArenaView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
  private fighters: FighterView[] = [];
  private projectiles = new Map<object, THREE.Group>();
  private zones = new Map<object, { group: THREE.Group; circle: THREE.Mesh; fill: THREE.Mesh; center: THREE.Vector3; color: string }>();
  private camPos = new THREE.Vector3(0, 6, 14);
  private camLook = new THREE.Vector3();
  private lastEvent = 0;
  private props: THREE.Object3D[] = [];
  /** Props shuddering after a hit, until this time (ms). */
  private propShake = new Map<number, number>();
  private raycaster = new THREE.Raycaster();
  private vfx: Vfx;
  private outline: OutlineEffect;
  private glow = glowTexture();
  private circleTex = magicCircleTexture();
  /** Hit-stop: animations freeze briefly on impact (visual only). */
  private freezeUntil = 0;
  /** Real-time moment until which the match plays in slow motion (after a K.-O.). */
  slowUntil = 0;
  private frame = 0;

  private renderer: THREE.WebGLRenderer;
  private world: BrawlWorld;
  private characters: Character[];
  private focus: number;
  private library: ModelLibrary | null;

  constructor(renderer: THREE.WebGLRenderer, world: BrawlWorld, characters: Character[], focus: number, library: ModelLibrary | null) {
    this.renderer = renderer;
    this.world = world;
    this.characters = characters;
    this.focus = focus;
    this.library = library;
    this.outline = new OutlineEffect(renderer, { defaultThickness: 0.003, defaultColor: [0.08, 0.06, 0.1], defaultAlpha: 1 });
    this.vfx = new Vfx(this.scene);
    this.props = buildEnvironment(this.scene, world.arena).props;
    this.fighters = world.fighters.map((f) => this.buildFighter(f, characters[f.id]!));
    this.resize();
  }

  private buildFighter(f: Fighter, ch: Character): FighterView {
    const r = f.kit.stats.radius;
    const root = new THREE.Group();
    let model: ModelInstance | null = null;
    let animator: Animator | null = null;
    let materials: THREE.MeshToonMaterial[];
    if (this.library) {
      const look = ch.look ?? defaultLook(f.kit.archetype);
      model = instantiate(this.library, look);
      animator = new Animator(model.mixer, model.clips, weaponStyle(look));
      root.add(model.root);
      materials = model.materials;
    } else {
      // Fallback while models are unavailable: a coloured capsule.
      const m = toon(ch.colors.primary);
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(r, FIGHTER_HEIGHT - 2 * r, 6, 16), m);
      body.position.y = FIGHTER_HEIGHT / 2;
      body.castShadow = true;
      root.add(body);
      materials = [m];
    }

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(r * 1.3, 24),
      noOutline(new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false })),
    );
    shadow.rotation.x = -Math.PI / 2;
    this.scene.add(shadow);

    const guard = new THREE.Mesh(
      new THREE.SphereGeometry(FIGHTER_HEIGHT * 0.62, 24, 16),
      noOutline(
        new THREE.MeshBasicMaterial({ color: 0x7fdcff, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }),
      ),
    );
    guard.position.y = FIGHTER_HEIGHT / 2;
    root.add(guard);

    const aura = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 1.8, r * 2.6, FIGHTER_HEIGHT * 1.5, 24, 1, true),
      noOutline(
        new THREE.MeshBasicMaterial({
          color: ch.colors.secondary, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
        }),
      ),
    );
    aura.position.y = FIGHTER_HEIGHT * 0.72;
    root.add(aura);

    const stars = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), toon(0xffd60a));
      const a = (i / 3) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45);
      stars.add(s);
    }
    stars.position.y = FIGHTER_HEIGHT + 0.35;
    root.add(stars);


    const lowHp = new THREE.Sprite(
      noOutline(new THREE.SpriteMaterial({ map: this.glow, color: 0xff2a3d, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })),
    );
    lowHp.scale.set(2.2, 3.2, 1);
    lowHp.position.y = FIGHTER_HEIGHT * 0.55;
    lowHp.visible = false;
    root.add(lowHp);

    const chargeOrb = new THREE.Sprite(
      noOutline(new THREE.SpriteMaterial({ map: this.glow, color: 0xff9f1c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
    );
    root.add(chargeOrb);

    let trail: WeaponTrail | null = null;
    if (model?.trail) {
      trail = new WeaponTrail();
      this.scene.add(trail.mesh);
    }

    this.scene.add(root);
    return {
      root, model, animator, materials, shadow, guard, aura, stars, chargeOrb, lowHp, trail,
      flashUntil: 0, slashKey: "", wasAirborne: false,
    };
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

  /** Simulation speed wanted by the view: slow motion right after a K.-O. */
  timeScale(): number {
    return performance.now() < this.slowUntil ? 0.3 : 1;
  }

  private center(f: Fighter): THREE.Vector3 {
    const c = bodyCenter(f);
    return new THREE.Vector3(c.x, c.y, c.z);
  }

  private onEvents(): void {
    const w = this.world;
    const now = performance.now();
    for (const e of w.events.slice(this.lastEvent)) {
      switch (e.type) {
        case "hit": {
          const big = e.knockdown || e.by === "heavy" || e.by === "special" || e.by === "throw";
          this.fighters[e.target]!.flashUntil = w.time + 0.1;
          this.vfx.hit(this.center(w.fighters[e.target]!), this.characters[e.source]!.colors.secondary, big);
          this.freezeUntil = now + (big ? 110 : 55);
          if (e.knockdown) this.vfx.groundWave(new THREE.Vector3(w.fighters[e.target]!.pos.x, w.fighters[e.target]!.floor, w.fighters[e.target]!.pos.z), 0xffffff, 3);
          break;
        }
        case "block":
          this.vfx.block(this.center(w.fighters[e.target]!));
          break;
        case "guardBreak":
          this.fighters[e.target]!.flashUntil = w.time + 0.15;
          this.vfx.hit(this.center(w.fighters[e.target]!), 0xffd60a, true);
          this.freezeUntil = now + 140;
          break;
        case "slam": {
          const t = w.fighters[e.target]!;
          this.vfx.hit(this.center(t), 0xffffff, true);
          this.vfx.dust(new THREE.Vector3(t.pos.x, t.floor, t.pos.z), 8);
          break;
        }
        case "ko":
          this.vfx.hit(this.center(w.fighters[e.target]!), 0xffffff, true);
          this.vfx.ring(this.center(w.fighters[e.target]!), 0xff4d4d, 6);
          this.slowUntil = now + 900;
          this.freezeUntil = now + 160;
          break;
        case "propHit": {
          // A blow that does not break it yet: the prop shudders and sheds chips.
          const p = w.arena.props[e.prop]!;
          this.propShake.set(e.prop, now + 160);
          if (e.amount >= 20) this.vfx.dust(new THREE.Vector3(p.x, Math.min(p.height * 0.5, 1.5), p.z), 3);
          break;
        }
        case "propBroken": {
          const p = w.arena.props[e.prop]!;
          this.props[p.id]!.visible = false;
          this.vfx.debris(new THREE.Vector3(p.x, Math.max(0.4, p.height * 0.6), p.z), p.kind.color);
          break;
        }
        case "dodge":
        case "lift": {
          const f = w.fighters[e.unit]!;
          this.vfx.dust(new THREE.Vector3(f.pos.x, f.floor, f.pos.z), 4);
          break;
        }
        case "breaker": {
          // Visual indicator of the breaker: a white shockwave the size of its reach.
          const f = w.fighters[e.unit]!;
          const c = this.center(f);
          this.vfx.ring(c, 0xffffff, w.config.breakerRadius * 2);
          this.vfx.groundWave(new THREE.Vector3(f.pos.x, f.floor, f.pos.z), 0xbfefff, w.config.breakerRadius * 1.6);
          this.fighters[e.unit]!.flashUntil = w.time + 0.12;
          this.freezeUntil = now + 90;
          break;
        }
        case "parry": {
          // Parry: a crisp white-cyan flash on the defender, the attacker reels.
          const d = w.fighters[e.unit]!;
          this.vfx.hit(this.center(d), 0xbff6ff, true);
          this.vfx.ring(this.center(d), 0xffffff, 2.6);
          this.fighters[e.unit]!.flashUntil = w.time + 0.15;
          this.freezeUntil = now + 160;
          break;
        }
        case "airJump": {
          // Double jump: a little ring of air under the feet.
          const f = w.fighters[e.unit]!;
          this.vfx.ring(new THREE.Vector3(f.pos.x, f.pos.y + 0.1, f.pos.z), 0xffffff, 1.4);
          break;
        }
        case "respawn":
          this.vfx.groundWave(new THREE.Vector3(w.fighters[e.unit]!.pos.x, 0, w.fighters[e.unit]!.pos.z), 0x9fe6ff, 2.5);
          break;
        default:
          break;
      }
    }
    this.lastEvent = w.events.length;
  }

  render(dt: number): void {
    this.frame++;
    this.onEvents();
    const frozen = performance.now() < this.freezeUntil;
    this.world.fighters.forEach((f, i) => this.syncFighter(f, this.fighters[i]!, dt, frozen));
    this.syncProjectiles();
    this.syncZones();
    this.syncCamera(dt);
    this.syncProps();
    this.vfx.update(dt);
    this.outline.render(this.scene, this.camera);
  }

  private syncFighter(f: Fighter, v: FighterView, dt: number, frozen: boolean): void {
    const w = this.world;
    const t = w.time;
    const ch = this.characters[f.id]!;
    // A fallen fighter stays on the ground (death animation) until respawn.
    const shown = f.alive || v.model !== null;
    v.root.visible = shown;
    v.shadow.visible = f.alive;
    v.root.position.set(f.pos.x, f.pos.y, f.pos.z);
    v.root.rotation.y = Math.atan2(f.facing.x, f.facing.z);
    v.shadow.position.set(f.pos.x, f.floor + 0.02, f.pos.z);
    v.shadow.scale.setScalar(Math.max(0.4, 1 - (f.pos.y - f.floor) * 0.15));
    v.animator?.update(w, f, dt, frozen);

    const a = f.action;
    const flashing = v.flashUntil > t;
    for (const m of v.materials) m.emissive.setHex(flashing ? 0xffffff : 0x000000);

    const invulnerable = f.alive && (f.invulnerableUntil > t || (a?.kind === "dodge" && a.t < w.config.dodgeInvulnerable));
    // (The breaker is invulnerable too, but its shockwave already shows it: no blinking.)
    if (v.model) v.model.root.visible = !(invulnerable && Math.floor(t * 14) % 2 === 0);

    v.guard.visible = a?.kind === "guard" || a?.kind === "blockstun";
    if (v.guard.visible) {
      // The shield shrinks and turns red as it wears out.
      const k = Math.max(0, f.shield / w.config.shieldMax);
      const m = v.guard.material as THREE.MeshBasicMaterial;
      m.opacity = 0.22 + 0.06 * Math.sin(t * 12) + (1 - k) * 0.12;
      m.color.setRGB(0.5 + 0.5 * (1 - k), 0.86 * k + 0.2 * (1 - k), 1 * k + 0.25 * (1 - k));
      v.guard.scale.setScalar(0.45 + 0.55 * k);
    }
    // Low health: a red halo, because hits now send this fighter flying further.
    const low = f.alive && f.hp / f.kit.stats.hp < 0.35;
    v.lowHp.visible = low;
    if (low) v.lowHp.material.opacity = 0.3 + 0.15 * Math.sin(t * 8);
    v.aura.visible = a?.kind === "charge";
    if (v.aura.visible) {
      (v.aura.material as THREE.MeshBasicMaterial).opacity = 0.22 + 0.12 * Math.sin(t * 22);
      v.aura.rotation.y += dt * 3;
    }
    v.stars.visible = a?.kind === "guardbroken";
    v.stars.rotation.y = t * 6;

    v.chargeOrb.visible = a?.kind === "heavy" && a.charging;
    if (a?.kind === "heavy" && a.charging) {
      const k = f.kit.heavy.maxCharge > 0 ? a.charge / f.kit.heavy.maxCharge : 0;
      v.chargeOrb.scale.setScalar(0.4 + 1.2 * k + 0.1 * Math.sin(t * 30));
      v.chargeOrb.position.set(0, FIGHTER_HEIGHT * 0.55, f.kit.stats.radius + 0.4);
    }

    // Attack readability: a trail follows the weapon while the blow travels (from just
    // before the hitbox goes live to just after). Models without weapon points fall back
    // to one slash arc when the hitbox goes live.
    let strike: Strike | undefined;
    let at = 0;
    let key = "";
    let tilt = 0;
    if (a?.kind === "light") {
      strike = f.kit.light.hits[a.index];
      at = a.t;
      key = `l${a.index}:${w.tick - Math.round(a.t * w.config.tickRate)}`;
      tilt = SLASH_TILT[a.index % SLASH_TILT.length]!;
    } else if (a?.kind === "aerial") {
      strike = f.kit.light.hits[0];
      at = a.t;
      key = `a${w.tick - Math.round(a.t * w.config.tickRate)}`;
      tilt = -0.9;
    } else if (a?.kind === "heavy") {
      strike = f.kit.heavy;
      at = a.charging ? 0 : a.t;
      key = `h${w.tick - Math.round(a.t * w.config.tickRate)}`;
      tilt = 1.2;
    }
    let swinging = !!strike && at >= strike.startup - 0.12 && at <= strike.startup + strike.active + 0.08;
    if (a?.kind === "special") {
      const sp = f.kit.specials[a.slot]!;
      swinging = a.t >= sp.startup - 0.1 && a.t <= sp.startup + 0.15;
    }
    if (a?.kind === "rush") swinging = true;
    const heavyish = a?.kind === "heavy" || a?.kind === "special" || a?.kind === "rush";
    if (v.trail && v.model?.trail) {
      v.model.root.updateMatrixWorld(true);
      const base = v.model.trail.base.getWorldPosition(new THREE.Vector3());
      const tip = v.model.trail.tip.getWorldPosition(new THREE.Vector3());
      v.trail.update(base, tip, swinging && f.alive, dt, heavyish ? 0xffa53d : ch.colors.secondary);
    } else if (strike && at >= strike.startup && v.slashKey !== key) {
      v.slashKey = key;
      const origin = this.center(f).add(new THREE.Vector3(f.facing.x, 0, f.facing.z).multiplyScalar(0.2));
      const color = a?.kind === "heavy" ? 0xffa53d : ch.colors.secondary;
      this.vfx.slash(origin, Math.atan2(f.facing.x, f.facing.z), tilt, strike.reach + strike.size * (a?.kind === "heavy" ? 1.3 : 1), color);
    }

    // Motion cues: speed lines when dashing, dust when landing.
    const fast = a?.kind === "rush" || a?.kind === "dodge";
    if (fast && this.frame % 2 === 0) {
      const dir = a?.kind === "dodge" ? new THREE.Vector3(a.dir.x, 0, a.dir.z) : new THREE.Vector3(f.facing.x, 0, f.facing.z);
      this.vfx.speedLines(this.center(f), dir, ch.colors.secondary);
    }
    const airborne = f.pos.y > f.floor + 0.05;
    if (v.wasAirborne && !airborne && f.alive) this.vfx.dust(new THREE.Vector3(f.pos.x, f.floor, f.pos.z), 4);
    v.wasAirborne = airborne;
  }

  /** Props between the camera and the player turn see-through, so the player is never lost behind a wall. */
  private syncProps(): void {
    const me = this.world.fighters[this.focus]!;
    const cam = this.camera.position;
    const blocking = new Set<number>();
    for (const h of [0.6, FIGHTER_HEIGHT * 0.6, FIGHTER_HEIGHT]) {
      const target = new THREE.Vector3(me.pos.x, me.pos.y + h, me.pos.z);
      const dir = target.clone().sub(cam);
      this.raycaster.set(cam, dir.clone().normalize());
      // Stop short of the player: the stairs or crate they stand on must not count as "in the way".
      this.raycaster.far = Math.max(0, dir.length() - 0.8);
      for (const hit of this.raycaster.intersectObjects(this.props, true)) {
        let o: THREE.Object3D | null = hit.object;
        while (o && o.userData.prop === undefined) o = o.parent;
        if (o) blocking.add(o.userData.prop as number);
      }
    }
    const flying = new Map(this.world.projectiles.filter((q) => q.prop !== undefined).map((q) => [q.prop!, q]));
    this.world.arena.props.forEach((p, i) => {
      const obj = this.props[i]!;
      obj.visible = p.alive || p.held !== null || p.flying;
      obj.rotation.set(0, 0, 0);
      if (p.held !== null) {
        const f = this.world.fighters[p.held]!;
        const lift = f.action?.kind === "lift" ? Math.min(1, f.action.t / this.world.config.liftTime) : 1;
        obj.position.set(f.pos.x, f.pos.y + lift * (FIGHTER_HEIGHT + 0.1), f.pos.z);
        return;
      }
      const q = flying.get(i);
      if (q) {
        obj.position.set(q.pos.x, q.pos.y - p.height / 2, q.pos.z);
        obj.rotation.set(this.world.time * 9, 0, 0);
        return;
      }
      if (!p.alive) return;
      const shakeUntil = this.propShake.get(i);
      if (shakeUntil !== undefined) {
        const k = Math.max(0, (shakeUntil - performance.now()) / 160);
        obj.position.set(p.x + Math.sin(performance.now() * 0.09) * 0.06 * k, 0, p.z + Math.cos(performance.now() * 0.11) * 0.06 * k);
        if (k <= 0) this.propShake.delete(i);
      }
      // Camera inside (or right against) a prop: hide it outright; layered see-through
      // surfaces would still veil the view. Trees reach well beyond their trunk.
      const reach = p.kind.look === "tree" ? 2.6 : 1;
      if (distToProp(p, cam.x, cam.z) < reach && cam.y < p.height + 1.5) {
        obj.visible = false;
        return;
      }
      const hides = blocking.has(i);
      const damage = p.kind.hp !== null ? 0.5 + 0.5 * Math.max(0, p.hp / p.kind.hp) : 1;
      obj.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const m = o.material as THREE.MeshToonMaterial;
        m.userData.baseColor ??= m.color.clone();
        m.color.copy(m.userData.baseColor as THREE.Color).multiplyScalar(damage);
        m.transparent = hides;
        // Faint enough that the player seen through it does not look like a ghost.
        m.opacity = hides ? 0.12 : 1;
        m.depthWrite = !hides;
        // The ink outline would stay opaque around a see-through prop: hide it too.
        const outline = m.userData.outlineParameters as { visible?: boolean } | undefined;
        if (outline) outline.visible = !hides;
      });
    });
  }

  private syncProjectiles(): void {
    const seen = new Set<object>();
    for (const p of this.world.projectiles) {
      if (p.prop !== undefined) continue; // drawn as the prop itself
      seen.add(p);
      let g = this.projectiles.get(p);
      if (!g) {
        const ch = this.characters[p.owner]!;
        g = new THREE.Group();
        const halo = new THREE.Sprite(
          noOutline(new THREE.SpriteMaterial({ map: this.glow, color: ch.colors.secondary, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
        );
        halo.scale.setScalar(p.size * 3.4);
        const core = new THREE.Sprite(
          noOutline(new THREE.SpriteMaterial({ map: this.glow, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
        );
        core.scale.setScalar(p.size * 0.9);
        g.add(halo, core);
        this.scene.add(g);
        this.projectiles.set(p, g);
      }
      g.position.set(p.pos.x, p.pos.y, p.pos.z);
      if (this.frame % 2 === 0) this.vfx.speedLines(g.position.clone(), new THREE.Vector3(p.dir.x, p.dir.y, p.dir.z), this.characters[p.owner]!.colors.secondary);
    }
    for (const [p, g] of this.projectiles)
      if (!seen.has(p)) {
        this.vfx.ring(g.position.clone(), 0xffffff, 1.5);
        this.scene.remove(g);
        this.projectiles.delete(p);
      }
  }

  /** Area specials: a magic circle in the owner's colour, filling up until the strike. */
  private syncZones(): void {
    const seen = new Set<object>();
    const t = this.world.time;
    for (const z of this.world.zones) {
      seen.add(z);
      let entry = this.zones.get(z);
      if (!entry) {
        const color = this.characters[z.owner]!.colors.primary;
        const group = new THREE.Group();
        const circle = new THREE.Mesh(
          new THREE.PlaneGeometry(z.radius * 2, z.radius * 2),
          noOutline(new THREE.MeshBasicMaterial({ map: this.circleTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
        );
        const fill = new THREE.Mesh(
          new THREE.CircleGeometry(z.radius, 48),
          noOutline(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending })),
        );
        circle.rotation.x = fill.rotation.x = -Math.PI / 2;
        fill.position.y = 0.01;
        group.add(circle, fill);
        group.position.set(z.center.x, z.center.y + 0.04, z.center.z);
        this.scene.add(group);
        entry = { group, circle, fill, center: group.position.clone(), color };
        this.zones.set(z, entry);
      }
      const k = Math.min(1, (t - z.createdAt) / Math.max(1e-6, z.triggerAt - z.createdAt));
      entry.fill.scale.setScalar(Math.max(0.01, k));
      entry.circle.rotation.z = t * 1.5;
      (entry.circle.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.5 * k;
    }
    for (const [z, e] of this.zones)
      if (!seen.has(z)) {
        // The circle resolves: a burst of light where it struck.
        this.vfx.groundWave(e.center, e.color, (z as { radius: number }).radius * 1.6);
        this.vfx.ring(e.center.clone().setY(e.center.y + 1), e.color, (z as { radius: number }).radius * 1.5);
        this.scene.remove(e.group);
        this.zones.delete(z);
      }
  }

  /** Lock-on camera: behind the player, looking towards the opponent, with a little shake on impacts. */
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
      const right = new THREE.Vector3(-dir.z, 0, dir.x);
      wantPos = p.clone().addScaledVector(dir, -7).addScaledVector(right, 1.6).add(new THREE.Vector3(0, 3.6, 0));
      const ahead = Math.min(p.distanceTo(o) * 0.6, 4);
      wantLook = p.clone().addScaledVector(dir, ahead).add(new THREE.Vector3(0, 1.1, 0));
    } else {
      wantPos = p.clone().add(new THREE.Vector3(0, 9, 12));
      wantLook = p.clone();
    }
    const { halfW, halfD } = this.world.arena;
    const cx = Math.max(-halfW + 0.5, Math.min(halfW - 0.5, wantPos.x));
    const cz = Math.max(-halfD + 0.5, Math.min(halfD - 0.5, wantPos.z));
    const lost = Math.hypot(cx - wantPos.x, cz - wantPos.z);
    wantPos.y += lost * 0.45;
    wantPos.x = cx;
    wantPos.z = cz;
    // Spring arm: a prop between the player's head and the camera pulls the camera in front of it.
    const head = p.clone().add(new THREE.Vector3(0, 1.6, 0));
    const hit = this.firstBlock(head, wantPos);
    let pulled = lost / 5;
    if (hit < 1) {
      wantPos = head.clone().lerp(wantPos, Math.max(0.12, hit - 0.06));
      wantPos.y += 0.8 * (1 - hit);
      pulled = Math.max(pulled, 1 - hit);
    }
    // Pushed close by a wall or a prop: aim nearer the player so they stay in frame.
    wantLook.lerp(p.clone().add(new THREE.Vector3(0, 1.1, 0)), Math.min(1, pulled));
    // Moving in (to avoid an obstacle) is immediate; moving back out is smooth.
    const closer = wantPos.distanceTo(head) < this.camPos.distanceTo(head) - 0.2;
    const k = 1 - Math.exp(-dt * (closer ? 25 : 6));
    this.camPos.lerp(wantPos, k);
    this.camLook.lerp(wantLook, k);
    const s = this.vfx.shake;
    const jitter = new THREE.Vector3((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    this.camera.position.copy(this.camPos).add(jitter);
    this.camera.lookAt(this.camLook);
  }

  /** First point (0..1) where segment a→b enters a standing prop below its top; 1 if clear. */
  private firstBlock(a: THREE.Vector3, b: THREE.Vector3): number {
    let first = 1;
    for (const pr of this.world.arena.props) {
      if (!pr.alive) continue;
      const iv = segmentInterval(pr, a, b);
      if (!iv) continue;
      for (const t of iv) {
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        if (a.y + (b.y - a.y) * t < surfaceAt(pr, x, z) + 0.3 && t < first) first = t;
      }
    }
    return first;
  }

  private showcaseFrame: { anchor: THREE.Vector3; dir: THREE.Vector3 } | null = null;

  /** Menu backdrop framing: fighters at `anchor`, facing `dir`, camera in front of them. */
  showcaseAt(anchor: { x: number; z: number }, dir: { x: number; z: number }): void {
    this.showcaseFrame = { anchor: new THREE.Vector3(anchor.x, 0, anchor.z), dir: new THREE.Vector3(dir.x, 0, dir.z).normalize() };
    // Scenery between the camera and the fighters (or around the camera) is hidden.
    const d = this.showcaseFrame.dir;
    const cam = { x: anchor.x + d.x * 6.4, z: anchor.z + d.z * 6.4 };
    const side = { x: -d.z, z: d.x };
    this.world.arena.props.forEach((p, i) => {
      const lanes = [-1.2, 0, 1.2].map((o) => segmentInterval(p, { x: anchor.x + side.x * o, z: anchor.z + side.z * o }, cam));
      if (lanes.some(Boolean) || distToProp(p, cam.x, cam.z) < 1) this.props[i]!.visible = false;
    });
  }

  /** Menu backdrop: the chosen fighters idle while the camera sways gently. */
  showcase(dt: number): void {
    this.frame++;
    const w = this.world;
    const t = performance.now() / 1000;
    const f = this.showcaseFrame ?? { anchor: new THREE.Vector3(), dir: new THREE.Vector3(0, 0, 1) };
    const side = new THREE.Vector3(-f.dir.z, 0, f.dir.x);
    this.camera.position
      .copy(f.anchor)
      .addScaledVector(f.dir, 4.4)
      .addScaledVector(side, Math.sin(t * 0.35) * 0.8)
      .add(new THREE.Vector3(0, 1.55 + Math.sin(t * 0.5) * 0.08, 0));
    this.camera.lookAt(f.anchor.clone().add(new THREE.Vector3(0, 1.15, 0)));
    w.fighters.forEach((fi, i) => this.syncFighter(fi, this.fighters[i]!, dt, false));
    this.vfx.update(dt);
    this.outline.render(this.scene, this.camera);
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

