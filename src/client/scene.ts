// Three.js view of a BrawlWorld, in a cel-shaded anime style. Read-only: it
// never changes the simulation. Readability first: every state that matters to
// the opponent has a visual cue.
//   strike → a trail that follows the weapon while the blow travels
//   guard → bubble · guard broken → spinning stars · energy charge → aura column · counter stance → pale aura
//   invulnerable → blinking · area special → magic circle filling up until impact

import * as THREE from "three";
import { OutlineEffect } from "three/examples/jsm/effects/OutlineEffect.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { distToProp, segmentInterval, surfaceAt } from "../brawl/arena.ts";
import type { Character } from "../brawl/character.ts";
import type { Strike } from "../brawl/kit.ts";
import { FIGHTER_HEIGHT, bodyCenter, lockTarget, type BrawlWorld, type Fighter } from "../brawl/world.ts";
import { Animator } from "./animator.ts";
import { applyWear, damageStage, propColor, wearLean } from "./damage.ts";
import { buildEnvironment } from "./environment.ts";
import { attachWeapon, defaultLook, instantiate, proceduralEnv, skyLight, weaponStyle, type ModelInstance, type ModelLibrary } from "./models.ts";
import { glowTexture, magicCircleTexture, noOutline, toon } from "./toon.ts";
import { WeaponTrail } from "./trail.ts";
import { buildPizza } from "./pizza.ts";
import { Vfx } from "./vfx.ts";
import { PostFX } from "./postfx.ts";
import { handLook, projectileLook, zoneFlames, type HandLook, type ProjectileLook } from "./moveFx.ts";

interface FighterView {
  root: THREE.Group;
  model: ModelInstance | null;
  animator: Animator | null;
  /** Body materials (model or fallback capsule), for the hit flash. */
  materials: (THREE.MeshToonMaterial | THREE.MeshStandardMaterial)[];
  shadow: THREE.Mesh;
  /** Player colour: a ring on the ground and a tag over the head (who is who, at 4). */
  ring: THREE.Mesh;
  tag: THREE.Sprite;
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
  /** Last wind-up glinted (so each heavy or special glints once). */
  windupKey: string;
  /** Frames rendered for this fighter. */
  frame: number;
  wasAirborne: boolean;
  /** Per special: what glows in the hand or on the blade, a weapon taken just for it. */
  moveFx: { slot: number; hand: HandLook | null; weapon: THREE.Group | null; bare: boolean }[];
  /** The weapons held the rest of the time (hidden while a special's own weapon is out). */
  mainWeapons: THREE.Object3D[];
}

/** Small coloured label (« J1 », « CPU3 ») drawn on a canvas, for the tag over a fighter's head. */
function tagTexture(text: string, color: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(8, 6, 112, 40, 10);
  g.fill();
  g.beginPath();
  g.moveTo(52, 46);
  g.lineTo(64, 60);
  g.lineTo(76, 46);
  g.fill();
  g.fillStyle = "#16121f";
  g.font = "bold 30px sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 64, 27);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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

/**
 * Rim light on a fighter's material (as in Smash): a warm glow along the silhouette's
 * edges, facing away from the camera, so fighters stand out from busy scenery.
 */
/**
 * Building parts the camera looks through (they fade, see syncProps) instead of
 * pulling the camera in front of them: inside a house the camera keeps its distance,
 * as in a 3D arena brawler. Ground volumes (terrace, stone stairs, bridge) still push it.
 */
const SEE_THROUGH = new Set([
  "machiya-wall", "plaster-wall", "wood-floor", "tatami", "roof-tile", "roof-flat",
  "wood-stairs", "wood-post", "torii-post", "sakura", "bamboo-fence",
]);

function rimLight(m: THREE.Material): void {
  if (m.userData.rim || !("emissive" in m)) return;
  m.userData.rim = true;
  // On top of any shader change the material already has (hair, for one).
  const prev = m.onBeforeCompile.bind(m);
  const prevKey = m.customProgramCacheKey.bind(m);
  m.customProgramCacheKey = () => `${prevKey()}|rim`;
  m.onBeforeCompile = (shader, renderer) => {
    prev(shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
      {
        float rim = 1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0);
        // Softer on pale surfaces (a white gi would glow): the rim lifts dark ones most.
        float pale = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
        totalEmissiveRadiance += vec3(1.0, 0.93, 0.82) * pow(rim, 3.0) * 0.5 * (1.0 - 0.75 * pale);
      }`,
    );
  };
  m.needsUpdate = true;
}

/** Slash tilt per combo hit, so consecutive blows read as different swings. */
const SLASH_TILT = [0.55, -0.55, 0.05, 1.1, -1.0];

export class ArenaView {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
  private fighters: FighterView[] = [];
  private projectiles = new Map<object, THREE.Group>();
  /** Projectiles with a look of their own (beam, fire, bullet, rocket). */
  private looks = new Map<object, { look: ProjectileLook; kind: string; color: string }>();
  private zones = new Map<
    object,
    { group: THREE.Group; circle: THREE.Mesh; fill: THREE.Mesh; center: THREE.Vector3; color: string; look?: string; fire?: THREE.Group; leap?: boolean; owner: number; radius: number }
  >();
  private camPos = new THREE.Vector3(0, 6, 14);
  private camLook = new THREE.Vector3();
  private lastEvent = 0;
  private props: THREE.Object3D[] = [];
  /** Scenery that moves by itself (environment.ts). */
  private animateScenery: ((t: number, dt: number) => void)[] = [];
  private sceneryTime = 0;
  /** Props shuddering after a hit, until this time (ms). */
  private propShake = new Map<number, number>();
  private raycaster = new THREE.Raycaster();
  private vfx: Vfx;
  private outline: OutlineEffect;
  /** Occlusion, bloom, colour grade, tone mapping (postfx.ts). */
  private post: PostFX;
  private glow = glowTexture();
  private circleTex = magicCircleTexture();
  /** Hit-stop: animations freeze briefly on impact (visual only). */
  private freezeUntil = 0;
  /** Real-time moment until which the match plays in slow motion (after a K.-O.). */
  slowUntil = 0;
  private frame = 0;
  private showcaseDistance = 4.4;
  /** Shared camera: a scratch camera to test framings, and the last distance found. */
  private fitCam = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);
  private fitDist = 16;
  /** Positions before the last simulation step, for in-between frames. */
  private prevPos = new WeakMap<object, { x: number; y: number; z: number }>();
  private alpha = 1;

  private renderer: THREE.WebGLRenderer;
  private world: BrawlWorld;
  private characters: Character[];
  private focus: number;
  private library: ModelLibrary | null;

  /** Player colours, one per fighter (slot or team colour), and their tags (« J1 », « CPU3 »). */
  private colors: string[];
  private labels: string[];
  /** Three or more fighters: one camera framing everyone, as in Smash. */
  private shared: boolean;

  constructor(
    renderer: THREE.WebGLRenderer,
    world: BrawlWorld,
    characters: Character[],
    focus: number,
    library: ModelLibrary | null,
    opts: { colors?: string[]; labels?: string[]; shared?: boolean } = {},
  ) {
    this.colors = opts.colors ?? ["#ff4d4d", "#3d8bff", "#ffc93c", "#38c96b"];
    this.labels = opts.labels ?? world.fighters.map((f) => (f.id === focus ? "J1" : `CPU${f.id + 1}`));
    this.shared = opts.shared ?? world.fighters.length > 2;
    this.renderer = renderer;
    this.world = world;
    this.characters = characters;
    this.focus = focus;
    this.library = library;
    this.outline = new OutlineEffect(renderer, { defaultThickness: 0.003, defaultColor: [0.08, 0.06, 0.1], defaultAlpha: 1 });
    this.post = new PostFX(renderer, this.scene, this.camera, this.outline);
    this.vfx = new Vfx(this.scene);
    // The light of an outdoor sky (HDRI) for everything physically lit; a studio made in
    // code if it could not be loaded.
    if (!proceduralEnv.map) {
      const pmrem = new THREE.PMREMGenerator(renderer);
      proceduralEnv.map = skyLight.hdr ? pmrem.fromEquirectangular(skyLight.hdr).texture : pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
    }
    // Image-based light for everything physically lit: soft reflections and fill.
    this.scene.environment = proceduralEnv.map;
    this.scene.environmentIntensity = 0.35;
    const env = buildEnvironment(this.scene, world.arena);
    this.props = env.props;
    this.animateScenery = env.animate;
    this.fighters = world.fighters.map((f) => this.buildFighter(f, characters[f.id]!));
    this.resize();
  }

  private buildFighter(f: Fighter, ch: Character): FighterView {
    const r = f.kit.stats.radius;
    const root = new THREE.Group();
    let model: ModelInstance | null = null;
    let animator: Animator | null = null;
    let materials: (THREE.MeshToonMaterial | THREE.MeshStandardMaterial)[];
    if (this.library) {
      const look = ch.look ?? defaultLook(f.kit.archetype);
      model = instantiate(this.library, look);
      animator = new Animator(model.mixer, model.clips, weaponStyle(look), f.kit.specials.map((sp) => ch.moves[sp.id]?.pose));
      root.add(model.root);
      materials = model.materials;
      for (const m of materials) rimLight(m);
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

    // Player colour: a ring round the feet and a tag over the head.
    const color = this.colors[f.id] ?? "#ffffff";
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(r * 1.35, r * 1.75, 40),
      noOutline(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false })),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.renderOrder = 2;
    this.scene.add(ring);
    // Constant size on screen, however far the shared camera pulls back.
    const tag = new THREE.Sprite(
      noOutline(new THREE.SpriteMaterial({ map: tagTexture(this.labels[f.id] ?? "", color), depthTest: false, transparent: true, sizeAttenuation: false })),
    );
    tag.scale.set(0.06, 0.03, 1);
    tag.renderOrder = 20;
    this.scene.add(tag);

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

    // The looks of the specials that the model carries: a weapon drawn just for one, what
    // glows in the hand or along the blade.
    const moveFx: FighterView["moveFx"] = [];
    const mainWeapons: THREE.Object3D[] = [];
    if (model) {
      const rig = model.root;
      rig.traverse((o) => {
        if (o.userData.weapon) mainWeapons.push(o);
      });
      f.kit.specials.forEach((sp, slot) => {
        const style = ch.moves[sp.id];
        if (!style || (!style.hand && !style.weapon)) return;
        let weapon: THREE.Group | null = null;
        // "None": the weapon is put away for this one (hand signs, a bare-handed blow).
        const bare = style.weapon === "None";
        if (style.weapon && !bare) {
          const host = rig.children[0] ?? rig;
          weapon = attachWeapon(host, style.weapon);
          if (weapon) weapon.visible = false;
        }
        let hand: HandLook | null = null;
        if (style.hand) {
          // Flames go along the blade (the special's own weapon, else the main one).
          const blade = style.hand === "fire" && !bare ? (weapon ?? mainWeapons.find((w) => !String(w.userData.weapon).endsWith("_Offhand"))) : undefined;
          const tip = blade?.getObjectByName("trailTip");
          hand = handLook(style.hand, style.color ?? ch.colors.secondary, tip ? tip.position.y : 0);
          if (blade && tip) blade.add(hand.obj);
          else {
            const bone = rig.getObjectByName("rightHand");
            if (bone) {
              bone.add(hand.obj);
              // Just past the knuckles, in the bone's units.
              const scale = bone.getWorldScale(new THREE.Vector3()).x || 1;
              hand.obj.position.set(-0.09 / scale, -0.01 / scale, 0);
              hand.obj.scale.setScalar(1 / scale);
            } else hand = null;
          }
          if (hand) hand.obj.visible = false;
        }
        moveFx.push({ slot, hand, weapon, bare });
      });
    }

    let trail: WeaponTrail | null = null;
    if (model?.trail) {
      trail = new WeaponTrail();
      this.scene.add(trail.mesh);
    }

    this.scene.add(root);
    return {
      root, model, animator, materials, shadow, ring, tag, guard, aura, stars, chargeOrb, lowHp, trail,
      flashUntil: 0, slashKey: "", wasAirborne: false, windupKey: "", frame: 0, moveFx, mainWeapons,
    };
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h);
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
          // A special that cuts many times at once: its slashes across the target.
          if (e.slot !== undefined) {
            const id = w.fighters[e.source]!.kit.specials[e.slot]?.id;
            const n = id ? this.characters[e.source]!.moves[id]?.slashes ?? 0 : 0;
            if (n > 0) this.vfx.slashes(this.center(w.fighters[e.target]!), n, this.characters[e.source]!.colors.primary);
          }
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
          // A blow that does not break it yet: the prop shudders and sheds dust; past
          // 2/3 and 1/3 of its hit points it cracks, loses parts, and leans.
          const p = w.arena.props[e.prop]!;
          this.propShake.set(e.prop, now + 160);
          if (e.amount >= 20) this.vfx.dust(new THREE.Vector3(p.x, p.base + Math.min(p.height * 0.5, 1.5), p.z), 3);
          const chips = applyWear(this.props[p.id]!, p, damageStage(p));
          if (chips.length) this.vfx.chips(chips);
          break;
        }
        case "propBroken": {
          const p = w.arena.props[e.prop]!;
          const obj = this.props[p.id]!;
          obj.visible = false;
          // Big props burst into more and bigger pieces, spread over their volume.
          const vol = p.halfW * p.halfD * p.height * 4;
          this.vfx.debris(
            new THREE.Vector3(p.x, p.base + Math.max(0.4, p.height * 0.5), p.z),
            propColor(obj),
            Math.round(THREE.MathUtils.clamp(6 + vol / 4, 8, 30)),
            THREE.MathUtils.clamp(Math.cbrt(vol) * 0.12, 0.18, 0.5),
            Math.min(Math.max(p.halfW, p.halfD), p.height / 2),
          );
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
        case "special": {
          // The technique's name, written beside the fighter (on the camera's right).
          const f = w.fighters[e.unit]!;
          const id = f.kit.specials[e.slot]?.id;
          const text = id ? this.characters[e.unit]!.moves[id]?.callout : undefined;
          if (text) {
            const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).setY(0).normalize();
            this.vfx.callout(this.center(f).addScaledVector(right, 1.3).add(new THREE.Vector3(0, 1.1, 0)), text, this.characters[e.unit]!.colors.primary);
          }
          break;
        }
        case "counter": {
          // Counter: a flash where the defender reappears, behind the attacker.
          const d = w.fighters[e.unit]!;
          this.vfx.glint(this.center(d), 0xffffff, 2.2);
          this.vfx.ring(this.center(d), this.characters[e.unit]!.colors.primary, 2.4);
          this.freezeUntil = now + 120;
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
        case "tech": {
          // Ground tech: a white ring and a puff of dust where the fighter springs up.
          const f = w.fighters[e.unit]!;
          const at = new THREE.Vector3(f.pos.x, f.floor + 0.05, f.pos.z);
          this.vfx.groundWave(at, 0xffffff, 1.8);
          this.vfx.dust(at, 6);
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

  /**
   * Remembers where everything stands before a simulation step, so that frames drawn
   * between two steps can show the exact in-between position (see `drawn`).
   */
  capture(): void {
    for (const f of this.world.fighters) this.prevPos.set(f, { ...f.pos });
    for (const p of this.world.projectiles) this.prevPos.set(p, { ...p.pos });
  }

  /**
   * Where to draw a moving thing this frame: between its previous and current
   * simulation positions. Without it, on screens faster than 60 Hz (or when frames and
   * steps drift apart) bodies advance by uneven jumps and look doubled, see-through.
   */
  private drawn(o: { pos: { x: number; y: number; z: number } }): THREE.Vector3 {
    const c = o.pos;
    const a = this.prevPos.get(o);
    const v = new THREE.Vector3(c.x, c.y, c.z);
    // A teleport (respawn) is not interpolated.
    if (!a || Math.hypot(c.x - a.x, c.y - a.y, c.z - a.z) > 3) return v;
    return v.set(a.x + (c.x - a.x) * this.alpha, a.y + (c.y - a.y) * this.alpha, a.z + (c.z - a.z) * this.alpha);
  }

  /** `alpha`: share of a simulation step elapsed since the last one (0 to 1). */
  render(dt: number, alpha = 1): void {
    this.alpha = Math.max(0, Math.min(1, alpha));
    this.frame++;
    this.onEvents();
    const frozen = performance.now() < this.freezeUntil;
    this.world.fighters.forEach((f, i) => this.syncFighter(f, this.fighters[i]!, dt, frozen));
    this.syncProjectiles();
    this.syncZones();
    this.syncCamera(dt);
    this.syncProps();
    this.vfx.update(dt);
    this.sceneryTime += dt;
    for (const a of this.animateScenery) a(this.sceneryTime, dt);
    this.post.render();
  }

  private syncFighter(f: Fighter, v: FighterView, dt: number, frozen: boolean): void {
    const w = this.world;
    const t = w.time;
    const ch = this.characters[f.id]!;
    // A fallen fighter stays on the ground (death animation) until respawn.
    const shown = f.alive || v.model !== null;
    v.root.visible = shown;
    v.shadow.visible = f.alive;
    v.ring.visible = f.alive;
    v.tag.visible = f.alive && (this.shared || f.id !== this.focus);
    const drawnAt = this.drawn(f);
    v.root.position.copy(drawnAt);
    // Turning is smoothed (the simulation snaps): a fast but visible pivot.
    const yaw = Math.atan2(f.facing.x, f.facing.z);
    let dy = yaw - v.root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    v.root.rotation.y += v.frame > 0 && dt > 0 ? dy * (1 - Math.exp(-dt * 20)) : dy;
    v.shadow.position.set(drawnAt.x, f.floor + 0.02, drawnAt.z);
    v.ring.position.set(drawnAt.x, f.floor + 0.03, drawnAt.z);
    v.tag.position.set(drawnAt.x, drawnAt.y + FIGHTER_HEIGHT + 0.45, drawnAt.z);
    v.shadow.scale.setScalar(Math.max(0.4, 1 - (drawnAt.y - f.floor) * 0.15));
    // Hitlag freezes the pose of both bodies at the moment of contact.
    const lagged = f.hitlagUntil > w.time;
    v.animator?.update(w, f, dt, frozen || lagged, drawnAt);
    // A hitlag shudder: the struck body trembles in place.
    if (lagged && f.action && (f.action.kind === "hitstun" || f.action.kind === "knockdown"))
      v.root.position.x += Math.sin(performance.now() * 0.25) * 0.05;
    v.frame++;

    // Launched hard: a trail of puffs shows how far and how fast the blow sends.
    const launch = Math.hypot(f.vel.x, f.vel.z);
    if (f.alive && !lagged && launch > w.config.knockdownSpeed * 0.8 && v.frame % 2 === 0)
      this.vfx.puff(this.center(f), 0.5 + launch * 0.06);

    // Wind-up: a glint just before a heavy blow or a special goes off.
    const act = f.action;
    let windup: string | null = null;
    if (act?.kind === "heavy" && !act.charging) windup = `h${act.charge}`;
    else if (act?.kind === "special") windup = `s${act.slot}:${w.tick - Math.round(act.t * w.config.tickRate)}`;
    if (windup && windup !== v.windupKey) {
      v.windupKey = windup;
      const color = act?.kind === "heavy" ? 0xffb347 : this.characters[f.id]!.colors.secondary;
      const at = this.center(f).add(new THREE.Vector3(f.facing.x, 0.25, f.facing.z).multiplyScalar(0.6));
      this.vfx.glint(at, color, act?.kind === "heavy" ? 1.6 : 1.3);
    } else if (!windup) v.windupKey = "";

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
    // Energy charge: a column of the fighter's colour. Counter stance: a pale, slow,
    // breathing column (careful: a blow struck now is answered in the back).
    v.aura.visible = a?.kind === "charge" || a?.kind === "counter";
    if (v.aura.visible) {
      const m = v.aura.material as THREE.MeshBasicMaterial;
      const counter = a?.kind === "counter";
      m.color.set(counter ? 0xdff6ff : this.characters[f.id]!.colors.secondary);
      m.opacity = counter ? 0.16 + 0.1 * Math.sin(t * 7) : 0.22 + 0.12 * Math.sin(t * 22);
      v.aura.rotation.y += dt * (counter ? 1 : 3);
    }
    v.stars.visible = a?.kind === "guardbroken";
    v.stars.rotation.y = t * 6;

    // A special under way: its own weapon in hand, its light in the fist or on the blade.
    const slot = a && (a.kind === "special" || a.kind === "rush" || a.kind === "leap" || a.kind === "counter") ? a.slot : -1;
    let swapped = false;
    for (const fx of v.moveFx) {
      const on = fx.slot === slot && f.alive;
      if (fx.weapon) fx.weapon.visible = on;
      if (fx.weapon || fx.bare) swapped ||= on;
      if (fx.hand) {
        fx.hand.obj.visible = on;
        if (on) fx.hand.update(t);
      }
    }
    for (const m of v.mainWeapons) if (!String(m.userData.weapon).endsWith("_Offhand")) m.visible = !swapped;

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
    const cam = this.camera.position;
    const blocking = new Set<number>();
    // Shared camera: nobody may be hidden; over the shoulder: only the player.
    const watched = this.shared ? this.world.fighters.filter((f) => f.alive) : [this.world.fighters[this.focus]!];
    for (const me of watched)
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
    // The same on the volumes themselves, with a thick line of sight (left, middle and
    // right of the body; feet, waist and head): a wall that only hides an arm or the
    // feet is still in the way, and a ray through three points can slip past it.
    for (const me of watched) {
      const flat = new THREE.Vector3(me.pos.x - cam.x, 0, me.pos.z - cam.z);
      const side = new THREE.Vector3(-flat.z, 0, flat.x).normalize().multiplyScalar(0.55);
      const len = Math.max(1e-3, Math.hypot(flat.x, flat.z));
      const stop = Math.max(0, 1 - 0.7 / len);
      this.world.arena.props.forEach((p, i) => {
        if (!p.alive || blocking.has(i)) return;
        const top = p.base + p.height;
        for (const o of [-1, 0, 1])
          for (const h of [0.15, FIGHTER_HEIGHT * 0.55, FIGHTER_HEIGHT]) {
            const b = { x: me.pos.x + side.x * o, z: me.pos.z + side.z * o };
            const iv = segmentInterval(p, cam, b);
            if (!iv || iv[0] > stop) continue;
            const y0 = cam.y + (me.pos.y + h - cam.y) * iv[0];
            const y1 = cam.y + (me.pos.y + h - cam.y) * Math.min(iv[1], stop);
            if (Math.max(y0, y1) > p.base && Math.min(y0, y1) < top) {
              blocking.add(i);
              return;
            }
          }
      });
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
      const lean = wearLean(obj);
      if (lean) obj.rotation.copy(lean);
      const shakeUntil = this.propShake.get(i);
      if (shakeUntil !== undefined) {
        const k = Math.max(0, (shakeUntil - performance.now()) / 160);
        obj.position.set(p.x + Math.sin(performance.now() * 0.09) * 0.06 * k, p.base, p.z + Math.cos(performance.now() * 0.11) * 0.06 * k);
        if (k <= 0) this.propShake.delete(i);
      }
      // Camera inside (or right against) a prop: hide it outright; layered see-through
      // surfaces would still veil the view. Trees reach well beyond their trunk.
      const reach = p.kind.look === "tree" ? 2.6 : 1;
      if (distToProp(p, cam.x, cam.z) < reach && cam.y < p.base + p.height + 1.5 && cam.y > p.base - 1.5) {
        obj.visible = false;
        return;
      }
      const hides = blocking.has(i);
      const damage = p.kind.hp !== null && Number.isFinite(p.hp) ? 0.7 + 0.3 * Math.max(0, p.hp / p.kind.hp) : 1;
      obj.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        for (const m of [o.material].flat() as THREE.MeshToonMaterial[]) {
          m.userData.baseColor ??= m.color.clone();
          m.color.copy(m.userData.baseColor as THREE.Color).multiplyScalar(damage);
          // (The shader is built opaque or see-through: switching needs a rebuild.)
          if (m.transparent !== hides) {
            m.transparent = hides;
            m.needsUpdate = true;
          }
          // Faint enough that the player seen through it does not look like a ghost.
          m.opacity = hides ? 0.12 : 1;
          m.depthWrite = !hides;
          // The ink outline would stay opaque around a see-through prop: hide it too.
          const outline = m.userData.outlineParameters as { visible?: boolean } | undefined;
          if (outline) outline.visible = !hides;
        }
      });
    });
  }

  private syncProjectiles(): void {
    const seen = new Set<object>();
    const t = this.world.time;
    for (const p of this.world.projectiles) {
      if (p.prop !== undefined) continue; // drawn as the prop itself
      seen.add(p);
      let g = this.projectiles.get(p);
      const ch = this.characters[p.owner]!;
      const id = this.world.fighters[p.owner]!.kit.specials[p.slot]?.id;
      const style = id ? ch.moves[id] : undefined;
      const color = style?.color ?? ch.colors.secondary;
      if (!g) {
        const owner = this.world.fighters[p.owner]!;
        // Fired from the hands (or the muzzle) of the owner as drawn now.
        const hand = this.fighters[p.owner]?.model?.root.getObjectByName("rightHand");
        const origin = hand ? hand.getWorldPosition(new THREE.Vector3()) : this.center(owner).add(new THREE.Vector3(owner.facing.x, 0, owner.facing.z).multiplyScalar(0.5));
        const look = projectileLook(this.scene, style?.projectile, color, p.size, origin);
        if (look) {
          g = look.group;
          this.looks.set(p, { look, kind: style!.projectile!, color });
          if (style?.projectile === "bullet" || style?.projectile === "rocket") this.vfx.glint(origin, 0xffd27a, 1.2);
          if (style?.projectile === "beam") this.vfx.ring(origin, color, 1.6);
          this.projectiles.set(p, g);
        } else {
          g = new THREE.Group();
          const pizzaLook = style?.projectile === "pizza";
          if (pizzaLook) {
            // A pizza flung like a frisbee: tilted, spinning, a faint glow behind it.
            const pizza = buildPizza(Math.max(0.4, p.size * 1.4));
            pizza.rotation.z = 0.25;
            pizza.userData.spin = true;
            g.add(pizza);
          }
          const halo = new THREE.Sprite(
            noOutline(new THREE.SpriteMaterial({ map: this.glow, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
          );
          halo.scale.setScalar(p.size * 3.4);
          const core = new THREE.Sprite(
            noOutline(new THREE.SpriteMaterial({ map: this.glow, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })),
          );
          core.scale.setScalar(p.size * 0.9);
          // Behind a drawn object, only a faint glow.
          if (pizzaLook) {
            halo.material.opacity = 0.18;
            g.add(halo);
          } else g.add(halo, core);
          this.scene.add(g);
          this.projectiles.set(p, g);
        }
      }
      g.position.copy(this.drawn(p));
      const dir = new THREE.Vector3(p.dir.x, p.dir.y, p.dir.z);
      this.looks.get(p)?.look.update(t, g.position, dir);
      for (const c of g.children) if (c.userData.spin) c.rotation.y += 0.45;
      const kind = this.looks.get(p)?.kind;
      if (kind === "fire" || kind === "rocket") {
        if (this.frame % 3 === 0) this.vfx.puff(g.position.clone().addScaledVector(dir, -0.4), kind === "rocket" ? 0.5 : 0.7);
      } else if (kind !== "beam" && this.frame % 2 === 0) this.vfx.speedLines(g.position.clone(), dir, color);
    }
    for (const [p, g] of this.projectiles)
      if (!seen.has(p)) {
        const look = this.looks.get(p);
        const at = g.position.clone();
        if (look) {
          look.look.dispose();
          this.looks.delete(p);
          if (look.kind === "rocket" || look.kind === "fire") this.explosion(at, look.kind === "rocket" ? 1.4 : 0.9);
          else if (look.kind === "beam") {
            this.vfx.hit(at, look.color, true);
            this.vfx.ring(at, look.color, 3);
          } else this.vfx.glint(at, 0xffd27a, 0.8);
        } else {
          this.vfx.ring(at, 0xffffff, 1.5);
          this.scene.remove(g);
        }
        this.projectiles.delete(p);
      }
  }

  /** A burst of fire and smoke: rockets, fireballs, exploding areas. */
  private explosion(at: THREE.Vector3, size: number): void {
    this.vfx.hit(at, 0xff7a1a, true);
    this.vfx.ring(at, 0xffb347, 2.4 * size);
    this.vfx.flames(at, Math.round(8 * size), size);
    this.vfx.shake = Math.max(this.vfx.shake, 0.3 * size);
  }

  /** Area specials: a magic circle in the owner's colour, filling up until the strike. */
  private syncZones(): void {
    const seen = new Set<object>();
    const t = this.world.time;
    for (const z of this.world.zones) {
      seen.add(z);
      let entry = this.zones.get(z);
      if (!entry) {
        const ch = this.characters[z.owner]!;
        const id = this.world.fighters[z.owner]!.kit.specials[z.slot]?.id;
        const style = id ? ch.moves[id] : undefined;
        const look = style?.zone;
        const color = look === "fire" ? "#ff6a1a" : look === "blast" ? "#ff3a2a" : (style?.color ?? ch.colors.primary);
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
        entry = { group, circle, fill, center: group.position.clone(), color, look, leap: z.leap, owner: z.owner, radius: z.radius };
        if (look === "fire") {
          entry.fire = zoneFlames(z.radius);
          group.add(entry.fire);
        }
        this.zones.set(z, entry);
      }
      const k = Math.min(1, (t - z.createdAt) / Math.max(1e-6, z.triggerAt - z.createdAt));
      entry.fill.scale.setScalar(Math.max(0.01, k));
      entry.circle.rotation.z = t * 1.5;
      (entry.circle.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.5 * k;
      (entry.fire?.userData.flicker as ((t: number, k: number) => void) | undefined)?.(t, k);
    }
    for (const [z, e] of this.zones)
      if (!seen.has(z)) {
        // The circle resolves: a burst of light where it struck (of fire, an explosion).
        const radius = (z as { radius: number }).radius;
        // (A leap cut short in the air takes its circle away without striking.)
        const owner = this.world.fighters[e.owner]!;
        const landed = !e.leap || Math.hypot(owner.pos.x - e.center.x, owner.pos.z - e.center.z) < e.radius + 0.5;
        if (e.look && landed) this.explosion(e.center.clone().setY(e.center.y + 0.6), radius * 0.6);
        this.vfx.groundWave(e.center, e.color, (z as { radius: number }).radius * 1.6);
        this.vfx.ring(e.center.clone().setY(e.center.y + 1), e.color, (z as { radius: number }).radius * 1.5);
        this.scene.remove(e.group);
        this.zones.delete(z);
      }
  }

  /** Lock-on camera: behind the player, looking towards the opponent, with a little shake on impacts. */
  private syncCamera(dt: number): void {
    if (this.shared) {
      this.sharedCamera(dt);
      return;
    }
    const me = this.world.fighters[this.focus]!;
    const foe = lockTarget(this.world, me);
    const p = this.drawn(me);
    let wantPos: THREE.Vector3;
    let wantLook: THREE.Vector3;
    if (foe && me.alive) {
      const o = this.drawn(foe);
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
      if (!pr.alive || SEE_THROUGH.has(pr.kind.id)) continue;
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

  /**
   * Shared camera (three or more fighters): seen from one side of the arena and from
   * above, it frames every fighter in the match, closing in when they bunch up and
   * pulling back when they scatter. Movement stays relative to it, as in Smash.
   */
  private sharedCamera(dt: number): void {
    const live = this.world.fighters.filter((f) => f.alive);
    const bodies = (live.length ? live : this.world.fighters).map((f) => this.drawn(f));
    // Feet and the top of the tag over the head must both be on screen.
    const pts = bodies.flatMap((p) => [p, p.clone().add(new THREE.Vector3(0, FIGHTER_HEIGHT + 0.7, 0))]);
    // Free part of the screen (normalised coordinates): above the panels, below the clock.
    const box = { x0: -0.82, x1: 0.82, y0: -0.42, y1: 0.78 };
    const cam = this.fitCam;
    cam.fov = this.camera.fov;
    cam.aspect = this.camera.aspect;
    cam.updateProjectionMatrix();
    const back = new THREE.Vector3(0, 0.68, 0.74).normalize(); // from the target toward the camera
    const target = new THREE.Box3().setFromPoints(bodies).getCenter(new THREE.Vector3());
    let dist = this.fitDist;
    const ndc = new THREE.Vector3();
    const right = new THREE.Vector3();
    const upGround = new THREE.Vector3();
    for (let it = 0; it < 4; it++) {
      cam.position.copy(target).addScaledVector(back, dist);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      let [x0, x1, y0, y1] = [Infinity, -Infinity, Infinity, -Infinity];
      for (const p of pts) {
        ndc.copy(p).project(cam);
        [x0, x1, y0, y1] = [Math.min(x0, ndc.x), Math.max(x1, ndc.x), Math.min(y0, ndc.y), Math.max(y1, ndc.y)];
      }
      // Re-centre the points in the free box, then scale the distance to fit them in it.
      const half = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * dist;
      right.set(1, 0, 0);
      upGround.set(0, 0, -1);
      const dx = ((x0 + x1) / 2 - (box.x0 + box.x1) / 2) * half * cam.aspect;
      const dy = ((y0 + y1) / 2 - (box.y0 + box.y1) / 2) * half * 1.4;
      target.addScaledVector(right, dx).addScaledVector(upGround, dy);
      const need = Math.max((x1 - x0) / (box.x1 - box.x0), (y1 - y0) / (box.y1 - box.y0));
      dist = THREE.MathUtils.clamp(dist * THREE.MathUtils.clamp(need, 0.7, 1.4), 8, 28);
    }
    this.fitDist = dist;
    const wantPos = target.clone().addScaledVector(back, dist);
    const k = 1 - Math.exp(-dt * 3.5);
    this.camPos.lerp(wantPos, k);
    this.camLook.lerp(target, k);
    const shake = this.vfx.shake;
    this.camera.position.copy(this.camPos).add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, 0));
    this.camera.lookAt(this.camLook);
  }

  /** Menu backdrop framing: fighters at `anchor`, facing `dir`, camera in front of them. */
  showcaseAt(anchor: { x: number; z: number }, dir: { x: number; z: number }, count = 2): void {
    this.showcaseFrame = { anchor: new THREE.Vector3(anchor.x, 0, anchor.z), dir: new THREE.Vector3(dir.x, 0, dir.z).normalize() };
    this.showcaseDistance = 4.4 + Math.max(0, count - 2) * 1.6;
    // Scenery between the camera and the fighters (or around the camera) is hidden.
    const d = this.showcaseFrame.dir;
    const cam = { x: anchor.x + d.x * 6.4, z: anchor.z + d.z * 6.4 };
    const side = { x: -d.z, z: d.x };
    this.world.arena.props.forEach((p, i) => {
      const lanes = [-2.6, -1.2, 0, 1.2, 2.6].map((o) => segmentInterval(p, { x: anchor.x + side.x * o, z: anchor.z + side.z * o }, cam));
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
      .addScaledVector(f.dir, this.showcaseDistance)
      .addScaledVector(side, Math.sin(t * 0.35) * 0.8)
      .add(new THREE.Vector3(0, 1.55 + Math.sin(t * 0.5) * 0.08, 0));
    this.camera.lookAt(f.anchor.clone().add(new THREE.Vector3(0, 1.15, 0)));
    w.fighters.forEach((fi, i) => this.syncFighter(fi, this.fighters[i]!, dt, false));
    this.vfx.update(dt);
    this.sceneryTime += dt;
    for (const a of this.animateScenery) a(this.sceneryTime, dt);
    this.post.render();
  }

  dispose(): void {
    this.post.dispose();
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        for (const m of [o.material].flat() as THREE.Material[]) m.dispose();
      }
    });
    this.scene.clear();
  }
}

