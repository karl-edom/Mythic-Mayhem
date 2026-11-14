// The effects toolkit: what the attack effects are built from (vfx.ts, moveFx.ts,
// specialFx.ts). Display only: the simulation knows nothing of it.
//
// - Particles: thousands of them in one draw call each, moved by the graphics card
//   (each one knows where and when it was born, its speed, drag and gravity: its whole
//   flight is a formula, nothing is updated per frame on the CPU). Sparks stretch along
//   their motion as seen on screen; smoke and fire grow, turn and fade.
// - Lights: a few point lights that impacts, fireballs and explosions borrow for an
//   instant, so a blast lights up the street and the fighters around it. Always the same
//   number in the scene (switched off when idle): no shader is ever recompiled.
// - Marks: scorches and cracks left on the ground, fading after a few seconds.
// - Screen: shockwaves that bend the picture, a chromatic split, a flash, a zoom blur:
//   read by the post-processing (postfx.ts), set by the effects.
// No dependency, textures painted in code.

import * as THREE from "three";

// ---------------------------------------------------------------------------
// Sprite atlas: 4 × 2 cells of 128 px, painted once.

/** Cells of the sprite atlas. */
export const Sprite = {
  /** Soft round glow. */
  Glow: 0,
  /** A spark streak: bright core along its length (stretched with speed). */
  Spark: 1,
  /** A lump of smoke: soft, uneven edge. */
  Smoke: 2,
  /** A tongue of flame, point up. */
  Flame: 3,
  /** A four-pointed star (a glint). */
  Star: 4,
  /** A thin ring. */
  Ring: 5,
  /** A sharp chip (debris, shards). */
  Shard: 6,
  /** A grainy dust cloud. */
  Dust: 7,
} as const;
export type Sprite = (typeof Sprite)[keyof typeof Sprite];

let atlasTex: THREE.CanvasTexture | null = null;
function atlas(): THREE.CanvasTexture {
  if (atlasTex) return atlasTex;
  const C = 128;
  const c = document.createElement("canvas");
  c.width = C * 4;
  c.height = C * 2;
  const g = c.getContext("2d")!;
  let seed = 11;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cell = (i: number, draw: () => void) => {
    g.save();
    g.translate((i % 4) * C, Math.floor(i / 4) * C);
    g.beginPath();
    g.rect(0, 0, C, C);
    g.clip();
    draw();
    g.restore();
  };
  const radial = (x: number, y: number, rad: number, stops: [number, number][]) => {
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    for (const [at, a] of stops) grad.addColorStop(at, `rgba(255,255,255,${a})`);
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  };
  // Glow: a gaussian-like falloff, bright small core.
  cell(Sprite.Glow, () => radial(64, 64, 64, [[0, 1], [0.12, 0.85], [0.35, 0.35], [0.7, 0.07], [1, 0]]));
  // Spark: a vertical streak, hot core, soft sides.
  cell(Sprite.Spark, () => {
    for (let y = 0; y < C; y++) {
      const t = y / C;
      const w = 10 * Math.sin(Math.PI * t) ** 0.6;
      const grad = g.createLinearGradient(64 - w, 0, 64 + w, 0);
      grad.addColorStop(0, "rgba(255,255,255,0)");
      grad.addColorStop(0.5, `rgba(255,255,255,${0.35 + 0.65 * Math.sin(Math.PI * t)})`);
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.fillRect(64 - w, y, w * 2, 1);
    }
  });
  // Smoke: overlapping soft blobs, uneven edge.
  cell(Sprite.Smoke, () => {
    for (let i = 0; i < 22; i++) {
      const a = r() * Math.PI * 2;
      const d = r() * 26;
      radial(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 18 + r() * 22, [[0, 0.5], [0.6, 0.22], [1, 0]]);
    }
  });
  // Flame: a teardrop, round bottom, pointed top.
  cell(Sprite.Flame, () => {
    const grad = g.createRadialGradient(64, 86, 2, 64, 78, 46);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.45, "rgba(255,255,255,0.75)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(64, 6);
    g.bezierCurveTo(94, 48, 108, 82, 64, 120);
    g.bezierCurveTo(20, 82, 34, 48, 64, 6);
    g.fill();
  });
  // Star: four long thin points and a round core.
  cell(Sprite.Star, () => {
    g.translate(64, 64);
    for (let i = 0; i < 4; i++) {
      g.rotate(Math.PI / 2);
      const grad = g.createLinearGradient(0, 0, 62, 0);
      grad.addColorStop(0, "rgba(255,255,255,1)");
      grad.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, -5);
      g.lineTo(62, 0);
      g.lineTo(0, 5);
      g.fill();
    }
    g.setTransform(1, 0, 0, 1, (Sprite.Star % 4) * C, Math.floor(Sprite.Star / 4) * C);
    radial(64, 64, 22, [[0, 1], [0.5, 0.6], [1, 0]]);
  });
  // Ring: a thin bright circle with a soft inner wake.
  cell(Sprite.Ring, () => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 62);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.7, "rgba(255,255,255,0.08)");
    grad.addColorStop(0.88, "rgba(255,255,255,0.5)");
    grad.addColorStop(0.95, "rgba(255,255,255,1)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, C, C);
  });
  // Shard: a sharp irregular chip.
  cell(Sprite.Shard, () => {
    g.fillStyle = "rgba(255,255,255,1)";
    g.beginPath();
    g.moveTo(64, 8);
    g.lineTo(92, 70);
    g.lineTo(70, 120);
    g.lineTo(40, 84);
    g.closePath();
    g.fill();
  });
  // Dust: grainy, mottled cloud.
  cell(Sprite.Dust, () => {
    for (let i = 0; i < 140; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 46;
      radial(64 + Math.cos(a) * d, 64 + Math.sin(a) * d, 4 + r() * 10, [[0, 0.35], [1, 0]]);
    }
  });
  atlasTex = new THREE.CanvasTexture(c);
  atlasTex.colorSpace = THREE.NoColorSpace;
  return atlasTex;
}

// ---------------------------------------------------------------------------
// Particles.

/** One particle (or several, with `count`). Colours may go above 1: they glow (bloom). */
export interface Emit {
  pos: THREE.Vector3;
  /** Speed, m/s. */
  vel?: THREE.Vector3;
  /** Seconds. */
  life: number;
  /** Size at birth and at death, metres. */
  size: [number, number];
  /** Colour at birth and at death (linear, may exceed 1 to glow). */
  color: [THREE.ColorRepresentation, THREE.ColorRepresentation];
  /** Opacity at birth and at death. */
  alpha?: [number, number];
  sprite: Sprite;
  /** Speed lost per second (1/s): 0 = none, 4 = stops quickly. */
  drag?: number;
  /** m/s² downwards (negative rises). */
  gravity?: number;
  /** Starting angle and turning speed (rad, rad/s), for round sprites. */
  rot?: number;
  spin?: number;
  /** Stretched along its motion on screen: seconds of travel the streak covers. */
  stretch?: number;
  /** Born that many seconds later. */
  delay?: number;
}

const QUAD = new Float32Array([-0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5]);
const QUAD_INDEX = [0, 1, 2, 0, 2, 3];

const PARTICLE_VERT = /* glsl */ `
  attribute vec2 corner;
  attribute vec4 p0;      // xyz start, w birth time
  attribute vec4 v0;      // xyz speed, w life
  attribute vec4 sizes;   // size0, size1, stretch, sprite
  attribute vec4 c0;      // rgb, alpha at birth
  attribute vec4 c1;      // rgb, alpha at death
  attribute vec4 phys;    // drag, gravity, rot, spin
  uniform float time;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    float age = time - p0.w;
    float k = age / v0.w;
    if (k < 0.0 || k > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
    float drag = max(phys.x, 1e-3);
    float e = exp(-drag * age);
    vec3 g = vec3(0.0, -phys.y, 0.0);
    vec3 pos = p0.xyz + v0.xyz * (1.0 - e) / drag + g / drag * (age - (1.0 - e) / drag);
    vec3 vel = v0.xyz * e + g * (1.0 - e) / drag;
    float size = mix(sizes.x, sizes.y, k);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    vec2 off;
    if (sizes.z > 0.0) {
      // A streak: along the motion as seen from the camera, as long as its travel.
      vec3 vv = (modelViewMatrix * vec4(vel, 0.0)).xyz;
      float len = length(vv.xy);
      vec2 dir = len > 1e-4 ? vv.xy / len : vec2(0.0, 1.0);
      vec2 side = vec2(-dir.y, dir.x);
      off = side * corner.x * size + dir * corner.y * (size + len * sizes.z);
    } else {
      float a = phys.z + phys.w * age;
      float c = cos(a), s = sin(a);
      off = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y) * size;
    }
    mv.xy += off;
    gl_Position = projectionMatrix * mv;
    float cellX = mod(sizes.w, 4.0), cellY = floor(sizes.w / 4.0);
    vUv = vec2((cellX + corner.x + 0.5) / 4.0, 1.0 - (cellY + 0.5 - corner.y) / 2.0);
    // Fades in over the first few percent of its life (no popping).
    float fadeIn = smoothstep(0.0, 0.06, k);
    vColor = mix(c0, c1, k);
    vColor.a *= fadeIn;
  }`;

const PARTICLE_FRAG = /* glsl */ `
  uniform sampler2D map;
  uniform float additive;
  varying vec2 vUv;
  varying vec4 vColor;
  void main() {
    float a = texture2D(map, vUv).a * vColor.a;
    if (a < 0.002) discard;
    // Additive: premultiplied light; blended: colour over what is behind.
    gl_FragColor = additive > 0.5 ? vec4(vColor.rgb * a, a) : vec4(vColor.rgb, a);
  }`;

/** A pool of particles, drawn in one call; the oldest are reused when it is full. */
export class ParticleSystem {
  readonly mesh: THREE.Mesh;
  private geo: THREE.InstancedBufferGeometry;
  private attrs: Record<"p0" | "v0" | "sizes" | "c0" | "c1" | "phys", THREE.InstancedBufferAttribute>;
  private next = 0;
  private dirty = { from: Infinity, to: -1 };
  private readonly max: number;
  private material: THREE.ShaderMaterial;
  /** Seconds since the start, as the shader sees it. */
  time = 0;

  constructor(max: number, additive: boolean) {
    this.max = max;
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.setAttribute("corner", new THREE.BufferAttribute(QUAD, 2));
    this.geo.setIndex(QUAD_INDEX);
    const make = () => {
      const a = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4);
      a.setUsage(THREE.DynamicDrawUsage);
      return a;
    };
    this.attrs = { p0: make(), v0: make(), sizes: make(), c0: make(), c1: make(), phys: make() };
    // Nobody alive yet: every particle born long ago, dead.
    for (let i = 0; i < max; i++) {
      this.attrs.p0.setW(i, -1e6);
      this.attrs.v0.setW(i, 1);
    }
    for (const [k, a] of Object.entries(this.attrs)) this.geo.setAttribute(k, a);
    this.geo.instanceCount = max;
    this.material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, map: { value: atlas() }, additive: { value: additive ? 1 : 0 } },
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    // Marked: post-processing leaves them out of the occlusion pass and does not brighten
    // them again; no ink outline either.
    this.material.userData.hdr = true;
    this.material.userData.outlineParameters = { visible: false };
    this.mesh = new THREE.Mesh(this.geo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 6 : 5;
  }

  emit(e: Emit, count = 1): void {
    const c0 = new THREE.Color(e.color[0]);
    const c1 = new THREE.Color(e.color[1]);
    const [a0, a1] = e.alpha ?? [1, 0];
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const v = e.vel ?? { x: 0, y: 0, z: 0 };
      this.attrs.p0.setXYZW(i, e.pos.x, e.pos.y, e.pos.z, this.time + (e.delay ?? 0));
      this.attrs.v0.setXYZW(i, v.x, v.y, v.z, Math.max(0.01, e.life));
      this.attrs.sizes.setXYZW(i, e.size[0], e.size[1], e.stretch ?? 0, e.sprite);
      this.attrs.c0.setXYZW(i, c0.r, c0.g, c0.b, a0);
      this.attrs.c1.setXYZW(i, c1.r, c1.g, c1.b, a1);
      this.attrs.phys.setXYZW(i, e.drag ?? 0, e.gravity ?? 0, e.rot ?? 0, e.spin ?? 0);
      this.dirty.from = Math.min(this.dirty.from, i);
      this.dirty.to = Math.max(this.dirty.to, i);
    }
  }

  update(dt: number): void {
    this.time += dt;
    this.material.uniforms.time!.value = this.time;
    if (this.dirty.to < 0) return;
    // Upload only the slots written this frame (when the ring wraps, the whole range).
    const from = this.dirty.from;
    const count = this.dirty.to - from + 1;
    for (const a of Object.values(this.attrs)) {
      a.clearUpdateRanges();
      a.addUpdateRange(from * 4, count * 4);
      a.needsUpdate = true;
    }
    this.dirty = { from: Infinity, to: -1 };
  }

  dispose(): void {
    this.geo.dispose();
    this.material.dispose();
  }
}

// ---------------------------------------------------------------------------
// Lights.

interface Lit {
  light: THREE.PointLight;
  age: number;
  life: number;
  peak: number;
  /** Follows something (a fireball) while it lives. */
  follow?: () => THREE.Vector3 | null;
}

/** A few point lights, lent to effects for a moment; the dimmest is taken back when all are busy. */
export class LightPool {
  private lights: Lit[] = [];
  constructor(scene: THREE.Scene, count = 4) {
    for (let i = 0; i < count; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 8, 2);
      light.castShadow = false;
      scene.add(light);
      this.lights.push({ light, age: 1, life: 1, peak: 0 });
    }
  }

  /**
   * A flash of light at `pos`: up at once, then dying out over `life` seconds.
   * `intensity`: candela-like (20 lights up a street for a few metres).
   */
  flash(pos: THREE.Vector3, color: THREE.ColorRepresentation, intensity: number, distance: number, life: number, follow?: () => THREE.Vector3 | null): void {
    const free = this.lights.reduce((best, l) => (this.level(l) < this.level(best) ? l : best));
    free.light.position.copy(pos);
    free.light.color.set(color);
    free.light.distance = distance;
    free.peak = intensity;
    free.age = 0;
    free.life = life;
    free.follow = follow;
    free.light.intensity = intensity;
  }

  private level(l: Lit): number {
    return l.age >= l.life ? 0 : l.peak * (1 - l.age / l.life);
  }

  update(dt: number): void {
    for (const l of this.lights) {
      if (l.age >= l.life) {
        l.light.intensity = 0;
        continue;
      }
      l.age += dt;
      const k = Math.min(1, l.age / l.life);
      if (l.follow) {
        const p = l.follow();
        if (p) l.light.position.copy(p);
        else l.age = l.life;
      }
      // Fast out, a long soft tail, a slight flicker.
      l.light.intensity = l.peak * (1 - k) ** 2 * (0.9 + 0.1 * Math.sin(l.age * 90));
    }
  }
}

// ---------------------------------------------------------------------------
// Marks on the ground.

let scorchTex: THREE.CanvasTexture | null = null;
let crackTex: THREE.CanvasTexture | null = null;

function scorchTexture(): THREE.CanvasTexture {
  if (scorchTex) return scorchTex;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  let seed = 5;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * 90;
    const rad = 14 + r() * 34;
    const grad = g.createRadialGradient(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 0, 128 + Math.cos(a) * d, 128 + Math.sin(a) * d, rad);
    grad.addColorStop(0, `rgba(0,0,0,${0.22 * (1 - d / 110)})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
  }
  // Rays thrown outwards from the centre.
  g.strokeStyle = "rgba(0,0,0,0.18)";
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2;
    g.lineWidth = 2 + r() * 5;
    g.beginPath();
    g.moveTo(128 + Math.cos(a) * 30, 128 + Math.sin(a) * 30);
    g.lineTo(128 + Math.cos(a) * (80 + r() * 46), 128 + Math.sin(a) * (80 + r() * 46));
    g.stroke();
  }
  scorchTex = new THREE.CanvasTexture(c);
  scorchTex.colorSpace = THREE.SRGBColorSpace;
  return scorchTex;
}

function crackTexture(): THREE.CanvasTexture {
  if (crackTex) return crackTex;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  let seed = 9;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  g.lineCap = "round";
  g.lineJoin = "round";
  const branch = (x: number, y: number, a: number, len: number, w: number, depth: number) => {
    let px = x;
    let py = y;
    const steps = 5 + Math.floor(r() * 4);
    g.lineWidth = w;
    g.strokeStyle = `rgba(0,0,0,${0.75})`;
    g.beginPath();
    g.moveTo(px, py);
    for (let i = 0; i < steps; i++) {
      a += (r() - 0.5) * 0.7;
      px += Math.cos(a) * (len / steps);
      py += Math.sin(a) * (len / steps);
      g.lineTo(px, py);
      if (depth > 0 && r() < 0.3) {
        g.stroke();
        branch(px, py, a + (r() - 0.5) * 1.6, len * 0.45, w * 0.6, depth - 1);
        g.lineWidth = w;
        g.strokeStyle = "rgba(0,0,0,0.75)";
        g.beginPath();
        g.moveTo(px, py);
      }
    }
    g.stroke();
  };
  for (let i = 0; i < 9; i++) branch(128, 128, (i / 9) * Math.PI * 2 + r() * 0.4, 70 + r() * 50, 4, 2);
  const grad = g.createRadialGradient(128, 128, 0, 128, 128, 34);
  grad.addColorStop(0, "rgba(0,0,0,0.55)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  crackTex = new THREE.CanvasTexture(c);
  crackTex.colorSpace = THREE.SRGBColorSpace;
  return crackTex;
}

interface Mark {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  alpha: number;
}

/** Scorches and cracks on the floor (or on a roof), fading away. At most a dozen at a time. */
export class GroundMarks {
  private marks: Mark[] = [];
  private scene: THREE.Scene;
  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  add(at: THREE.Vector3, size: number, kind: "scorch" | "crack", life = 6): void {
    if (this.marks.length >= 12) this.remove(this.marks[0]!);
    const m = new THREE.MeshBasicMaterial({
      map: kind === "scorch" ? scorchTexture() : crackTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
      color: kind === "scorch" ? 0x1a1410 : 0x2a2420,
    });
    m.userData.outlineParameters = { visible: false };
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), m);
    mesh.rotation.set(-Math.PI / 2, 0, Math.random() * Math.PI * 2);
    mesh.position.set(at.x, at.y + 0.02, at.z);
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    this.marks.push({ mesh, age: 0, life, alpha: kind === "scorch" ? 0.9 : 0.8 });
  }

  private remove(mk: Mark): void {
    this.scene.remove(mk.mesh);
    mk.mesh.geometry.dispose();
    (mk.mesh.material as THREE.Material).dispose();
    this.marks = this.marks.filter((x) => x !== mk);
  }

  update(dt: number): void {
    for (const mk of [...this.marks]) {
      mk.age += dt;
      const k = mk.age / mk.life;
      (mk.mesh.material as THREE.MeshBasicMaterial).opacity = mk.alpha * (k < 0.7 ? 1 : Math.max(0, 1 - (k - 0.7) / 0.3));
      if (k >= 1) this.remove(mk);
    }
  }
}

// ---------------------------------------------------------------------------
// Screen effects, read by the post-processing.

export interface Ripple {
  /** World position of the centre. */
  at: THREE.Vector3;
  age: number;
  life: number;
  /** Strength of the bend (screen fraction) and how far the front travels (world metres). */
  strength: number;
  reach: number;
}

/** What the effects ask of the picture: bends, a chromatic split, a flash, a zoom blur. */
export class ScreenFx {
  ripples: Ripple[] = [];
  /** Chromatic split, screen fraction; decays by itself. */
  aberration = 0;
  /** White (or coloured) flash over the picture, 0–1; decays fast. */
  flash = 0;
  flashColor = new THREE.Color(1, 1, 1);
  /** Inverted « impact frame » for a few frames (a K.O.), seconds left. */
  invert = 0;
  /** Zoom blur towards a point, 0–1. */
  zoom = 0;
  zoomAt = new THREE.Vector3();

  ripple(at: THREE.Vector3, strength: number, reach: number, life = 0.55): void {
    if (this.ripples.length >= 4) this.ripples.shift();
    this.ripples.push({ at: at.clone(), age: 0, life, strength, reach });
  }

  kick(aberration: number, flash = 0, color: THREE.ColorRepresentation = 0xffffff): void {
    this.aberration = Math.max(this.aberration, aberration);
    if (flash > this.flash) {
      this.flash = flash;
      this.flashColor.set(color);
    }
  }

  zoomTo(at: THREE.Vector3, amount: number): void {
    this.zoom = Math.max(this.zoom, amount);
    this.zoomAt.copy(at);
  }

  update(dt: number): void {
    for (const r of this.ripples) r.age += dt;
    this.ripples = this.ripples.filter((r) => r.age < r.life);
    this.aberration *= Math.exp(-dt * 9);
    this.flash *= Math.exp(-dt * 18);
    this.zoom *= Math.exp(-dt * 7);
    this.invert = Math.max(0, this.invert - dt);
  }
}
