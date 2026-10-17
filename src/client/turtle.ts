// A turtle warrior, built entirely in code: no model file. Humanoid skeleton with the
// VRM bone names (so every shared animation is retargeted onto it like on the anime
// avatars), rigid body parts carried by the bones, physically based materials with
// painted textures: scaly skin, a domed carapace with raised scutes, a segmented
// plastron, leather wraps, a cloth mask whose tails flutter.
//
// Generic on purpose: the mask colour comes from the fighter's look (outfit colour),
// the weapons from its `show` list. Any character built on it stays a data pack.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

/** Bone name, parent, rest position in the model (metres, T-pose, facing +Z). */
export const TURTLE_BONES: [string, string | null, number, number, number][] = [
  ["hips", null, 0, 0.92, 0],
  ["spine", "hips", 0, 1.04, 0],
  ["chest", "spine", 0, 1.2, 0],
  ["neck", "chest", 0, 1.43, 0.01],
  ["head", "neck", 0, 1.5, 0.02],
  ["leftUpperArm", "chest", 0.25, 1.37, 0],
  ["leftLowerArm", "leftUpperArm", 0.51, 1.37, 0],
  ["leftHand", "leftLowerArm", 0.74, 1.37, 0],
  ["rightUpperArm", "chest", -0.25, 1.37, 0],
  ["rightLowerArm", "rightUpperArm", -0.51, 1.37, 0],
  ["rightHand", "rightLowerArm", -0.74, 1.37, 0],
  ["leftUpperLeg", "hips", 0.13, 0.88, 0],
  ["leftLowerLeg", "leftUpperLeg", 0.13, 0.5, 0],
  ["leftFoot", "leftLowerLeg", 0.13, 0.09, 0],
  ["leftToes", "leftFoot", 0.13, 0.03, 0.12],
  ["rightUpperLeg", "hips", -0.13, 0.88, 0],
  ["rightLowerLeg", "rightUpperLeg", -0.13, 0.5, 0],
  ["rightFoot", "rightLowerLeg", -0.13, 0.09, 0],
  ["rightToes", "rightFoot", -0.13, 0.03, 0.12],
];

/** Mask tails: length (metres) and segments along it. */
const TAIL_LENGTH = 0.55;
const TAIL_ROWS = 14;

/** Optional parts, shown only when the look's `show` list names them. */
const OPTIONAL = ["Katana_Back"];

/** Height of the model (feet to top of head), metres. */
export const TURTLE_HEIGHT = 1.74;

// ---------------------------------------------------------------------------
// Painted textures (canvas): colour maps and matching bump maps.

export function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

export function texture(c: HTMLCanvasElement, color = true, repeat: [number, number] = [1, 1]): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}

export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Small reptile scales: a jittered cell pattern, darker in the creases, with freckles. */
function skinTextures(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const N = 512;
  const r = seeded(7);
  const pts: [number, number][] = [];
  const grid = 26;
  for (let i = 0; i < grid; i++)
    for (let j = 0; j < grid; j++) pts.push([((i + 0.2 + r() * 0.6) / grid) * N, ((j + 0.2 + r() * 0.6) / grid) * N]);
  const [cm, gm] = canvas(N, N);
  const [cb, gb] = canvas(N, N);
  const img = gm.createImageData(N, N);
  const bimg = gb.createImageData(N, N);
  const base = new THREE.Color("#ffffff");
  const cell = N / grid;
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      // Distance to the nearest and second nearest scale centres (wrapping).
      const gi = Math.floor(x / cell);
      const gj = Math.floor(y / cell);
      let d1 = 1e9;
      let d2 = 1e9;
      let id = 0;
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++) {
          const ii = (gi + a + grid) % grid;
          const jj = (gj + b + grid) % grid;
          const p = pts[ii * grid + jj]!;
          let dx = p[0] - x;
          let dy = p[1] - y;
          if (dx > N / 2) dx -= N;
          if (dx < -N / 2) dx += N;
          if (dy > N / 2) dy -= N;
          if (dy < -N / 2) dy += N;
          const d = dx * dx + dy * dy;
          if (d < d1) {
            d2 = d1;
            d1 = d;
            id = ii * grid + jj;
          } else if (d < d2) d2 = d;
        }
      const edge = Math.sqrt(d2) - Math.sqrt(d1); // 0 on the crease
      const crease = Math.min(1, edge / 3.5);
      const tone = 0.86 + ((id * 2654435761) % 1000) / 1000 * 0.16;
      const k = (0.72 + 0.28 * crease) * tone;
      const o = (y * N + x) * 4;
      img.data[o] = base.r * 255 * k;
      img.data[o + 1] = base.g * 255 * k;
      img.data[o + 2] = base.b * 255 * k;
      img.data[o + 3] = 255;
      const h = 255 * (0.3 + 0.7 * Math.min(1, edge / 6));
      bimg.data[o] = bimg.data[o + 1] = bimg.data[o + 2] = h;
      bimg.data[o + 3] = 255;
    }
  gm.putImageData(img, 0, 0);
  gb.putImageData(bimg, 0, 0);
  // Mottling: broad, soft darker patches, as on the reference sheet.
  gm.globalCompositeOperation = "multiply";
  for (let i = 0; i < 26; i++) {
    const x = r() * N;
    const y = r() * N;
    const rad = 30 + r() * 70;
    const grad = gm.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, "rgba(120,130,90,0.55)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    gm.fillStyle = grad;
    gm.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // Freckles: a few darker spots.
  gm.globalCompositeOperation = "multiply";
  for (let i = 0; i < 70; i++) {
    gm.fillStyle = `rgba(${150 + r() * 40},${160 + r() * 40},${110 + r() * 30},0.5)`;
    gm.beginPath();
    gm.arc(r() * N, r() * N, 2 + r() * 6, 0, Math.PI * 2);
    gm.fill();
  }
  return { map: texture(cm, true, [3, 3]), bump: texture(cb, false, [3, 3]) };
}

/** Scute centres and half sizes in texture space (u around, v from the top down); u = 0.5 is the spine. */
const SCUTES: { u: number; v: number; rx: number; ry: number }[] = [];
for (let i = 0; i < 5; i++) SCUTES.push({ u: 0.5, v: 0.12 + i * 0.18, rx: 0.085, ry: 0.09 });
for (const side of [-1, 1]) for (let i = 0; i < 4; i++) SCUTES.push({ u: 0.5 + side * 0.19, v: 0.18 + i * 0.2, rx: 0.1, ry: 0.1 });
for (const side of [-1, 1]) for (let i = 0; i < 7; i++) SCUTES.push({ u: 0.5 + side * 0.36, v: 0.08 + i * 0.14, rx: 0.06, ry: 0.07 });

/** How high the shell rises at (u, v): each scute is a low dome, the seams are grooves. */
function scuteRelief(u: number, v: number): number {
  let best = 0;
  for (const s of SCUTES) {
    const dx = (u - s.u) / s.rx;
    const dy = (v - s.v) / s.ry;
    // Hexagonal distance, so plates meet along straight seams.
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const d = Math.max(ax * 0.866 + ay * 0.5, ay);
    best = Math.max(best, 1 - Math.min(1, d));
  }
  return Math.sqrt(best);
}

/**
 * Carapace scutes in UV space (u around, v from top to bottom): a row of vertebral
 * scutes down the spine, costal scutes either side, marginal scutes along the rim.
 * Each scute has growth rings and a lighter centre.
 */
function shellTextures(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const W = 1024;
  const H = 512;
  const [cm, gm] = canvas(W, H);
  const [cb, gb] = canvas(W, H);
  const r = seeded(11);
  gm.fillStyle = "#231d0e";
  gm.fillRect(0, 0, W, H);
  gb.fillStyle = "#202020";
  gb.fillRect(0, 0, W, H);
  for (const s of SCUTES) {
    const cx = s.u * W;
    const cy = s.v * H;
    const rx = s.rx * W;
    const ry = s.ry * H;
    // Hexagon-ish plate, rings from the edge inward.
    for (let k = 10; k >= 1; k--) {
      const f = k / 10;
      const light = 0.55 + (1 - f) * 0.45 + (r() - 0.5) * 0.06;
      gm.fillStyle = `rgb(${Math.round(128 * light)},${Math.round(104 * light)},${Math.round(46 * light)})`;
      gb.fillStyle = `rgb(${Math.round(90 + (1 - f) * 150)},${Math.round(90 + (1 - f) * 150)},${Math.round(90 + (1 - f) * 150)})`;
      for (const g of [gm, gb]) {
        g.beginPath();
        for (let a = 0; a < 6; a++) {
          const ang = (a / 6) * Math.PI * 2 + Math.PI / 6;
          const x = cx + Math.cos(ang) * rx * f * (0.92 + r() * 0.06);
          const y = cy + Math.sin(ang) * ry * f * (0.92 + r() * 0.06);
          if (a === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        g.fill();
      }
    }
    // Scratches and darker blotches: a shell that has seen fights.
    gm.strokeStyle = "rgba(30,25,10,0.35)";
    gm.lineWidth = 1.5;
    for (let k = 0; k < 3; k++) {
      gm.beginPath();
      const x = cx + (r() - 0.5) * rx;
      const y = cy + (r() - 0.5) * ry;
      gm.moveTo(x, y);
      gm.lineTo(x + (r() - 0.5) * rx * 0.8, y + (r() - 0.5) * ry * 0.8);
      gm.stroke();
    }
  }
  return { map: texture(cm), bump: texture(cb, false) };
}

/** Plastron: two columns of plates with deep seams, worn lighter in the middle. */
function plastronTextures(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const W = 512;
  const H = 512;
  const [cm, gm] = canvas(W, H);
  const [cb, gb] = canvas(W, H);
  const grad = gm.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
  grad.addColorStop(0, "#d2ad55");
  grad.addColorStop(1, "#a07a2e");
  gm.fillStyle = grad;
  gm.fillRect(0, 0, W, H);
  gb.fillStyle = "#c8c8c8";
  gb.fillRect(0, 0, W, H);
  const r = seeded(5);
  // Mottling.
  for (let i = 0; i < 400; i++) {
    gm.fillStyle = `rgba(${120 + r() * 60},${90 + r() * 50},${40 + r() * 30},0.12)`;
    gm.beginPath();
    gm.arc(r() * W, r() * H, 3 + r() * 14, 0, Math.PI * 2);
    gm.fill();
  }
  // Seams: the central line and five rows (u spans the front of the body: 0.5 = middle).
  const rows = [0.2, 0.36, 0.52, 0.68, 0.84];
  for (const [g, color, width] of [
    [gm, "#5a4320", 7],
    [gb, "#202020", 12],
  ] as const) {
    g.strokeStyle = color;
    g.lineWidth = width;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(W / 2, H * 0.08);
    g.lineTo(W / 2, H * 0.95);
    for (const v of rows) {
      g.moveTo(W * 0.18, H * v + 10);
      g.quadraticCurveTo(W / 2, H * v - 14, W * 0.82, H * v + 10);
    }
    g.stroke();
  }
  return { map: texture(cm), bump: texture(cb, false) };
}

/** Coarse dyed cloth: weave, stains and worn patches. */
function clothTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#9a7a5c";
  g.fillRect(0, 0, 256, 256);
  const r = seeded(3);
  for (let i = 0; i < 256; i += 2) {
    g.fillStyle = `rgba(60,40,25,${0.08 + r() * 0.08})`;
    g.fillRect(0, i, 256, 1);
    g.fillRect(i, 0, 1, 256);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? "40,25,12" : "190,160,120"},${0.08 + r() * 0.1})`;
    g.beginPath();
    g.arc(r() * 256, r() * 256, 6 + r() * 26, 0, Math.PI * 2);
    g.fill();
  }
  return texture(c, true, [2, 2]);
}

/** Leather strips: diagonal wraps with darker edges and stitches. */
function wrapTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 64);
  g.fillStyle = "#5e3c22";
  g.fillRect(0, 0, 256, 64);
  for (let i = -2; i < 12; i++) {
    const x = i * 26;
    const grad = g.createLinearGradient(x, 0, x + 26, 0);
    grad.addColorStop(0, "#4a2d17");
    grad.addColorStop(0.35, "#8a5a33");
    grad.addColorStop(1, "#5e3a1f");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x, 64);
    g.lineTo(x + 26, 64);
    g.lineTo(x + 46, 0);
    g.lineTo(x + 20, 0);
    g.fill();
  }
  return texture(c, true, [3, 1]);
}

// ---------------------------------------------------------------------------
// Geometry helpers.

/** A sphere squashed to the given radii. */
export function blob(rx: number, ry: number, rz: number, seg = 32): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
  g.scale(rx, ry, rz);
  return g;
}

/** Capsule between two points (for limbs). */
export function limb(a: THREE.Vector3, b: THREE.Vector3, ra: number, rb: number): THREE.BufferGeometry {
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(rb, ra, len, 24, 6, true);
  // Muscle: bulge in the middle third.
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / len + 0.5;
    const k = 1 + 0.16 * Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.15) / 0.7)));
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  const ends = [new THREE.SphereGeometry(ra, 24, 12), new THREE.SphereGeometry(rb, 24, 12)];
  ends[0]!.translate(0, -len / 2, 0);
  ends[1]!.translate(0, len / 2, 0);
  const merged = mergeSimple([g, ...ends]);
  const dir = b.clone().sub(a).normalize();
  merged.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  merged.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return merged;
}

/** Merges geometries keeping position, normal and uv only. */
export function mergeSimple(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const total = parts.reduce((n, g) => n + g.attributes.position!.count, 0);
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);
  let o = 0;
  for (const g of parts) {
    const n = g.attributes.position!.count;
    pos.set(g.attributes.position!.array as Float32Array, o * 3);
    nor.set(g.attributes.normal!.array as Float32Array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array as Float32Array, o * 2);
    o += n;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  m.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  m.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return m;
}

/** Band of cloth or leather around a limb axis (Y), slightly irregular. */
export function band(radius: number, width: number, tilt: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius, radius * 1.02, width, 28, 1, true);
  g.rotateX(tilt);
  return g;
}

// ---------------------------------------------------------------------------

export interface TurtleMaterials {
  skin: THREE.MeshPhysicalMaterial;
  shell: THREE.MeshPhysicalMaterial;
  plastron: THREE.MeshPhysicalMaterial;
  leather: THREE.MeshStandardMaterial;
  cloth: THREE.MeshStandardMaterial;
  rim: THREE.MeshPhysicalMaterial;
  mask: THREE.MeshPhysicalMaterial;
}

let shared: TurtleMaterials | null = null;

function materials(): TurtleMaterials {
  if (shared) return shared;
  const skin = skinTextures();
  const shell = shellTextures();
  const plastron = plastronTextures();
  shared = {
    skin: new THREE.MeshPhysicalMaterial({
      name: "skin", color: "#506a22", map: skin.map, bumpMap: skin.bump, bumpScale: 1.4,
      roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.5, sheen: 0.15, sheenColor: new THREE.Color("#a6c46a"), sheenRoughness: 0.7,
    }),
    shell: new THREE.MeshPhysicalMaterial({
      name: "shell", color: "#ffffff", map: shell.map, bumpMap: shell.bump, bumpScale: 4,
      roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3,
    }),
    plastron: new THREE.MeshPhysicalMaterial({
      name: "plastron", color: "#ffffff", map: plastron.map, bumpMap: plastron.bump, bumpScale: 3,
      roughness: 0.62, clearcoat: 0.2, clearcoatRoughness: 0.5,
    }),
    cloth: new THREE.MeshStandardMaterial({ name: "cloth", color: "#5a3a22", map: clothTexture(), roughness: 0.92, side: THREE.DoubleSide }),
    rim: new THREE.MeshPhysicalMaterial({ name: "rim", color: "#4b3b1b", roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.35 }),
    leather: new THREE.MeshStandardMaterial({ name: "leather", color: "#ffffff", map: wrapTexture(), roughness: 0.78 }),
    mask: new THREE.MeshPhysicalMaterial({
      name: "mask", color: "#b8121a", roughness: 0.75, sheen: 0.35, sheenColor: new THREE.Color("#ff6a5a"), sheenRoughness: 0.5, side: THREE.DoubleSide,
    }),
  };
  return shared;
}

/**
 * The turtle in T-pose, facing +Z, feet at y = 0. Bones are plain objects with the
 * VRM humanoid names; each body part hangs from the bone that moves it.
 */
export function buildTurtleRig(): THREE.Group {
  const M = materials();
  const rig = new THREE.Group();
  rig.name = "turtle";
  const world = new Map<string, THREE.Vector3>();
  const bones = new Map<string, THREE.Bone>();
  for (const [name, parent, x, y, z] of TURTLE_BONES) {
    const b = new THREE.Bone();
    b.name = name;
    const w = new THREE.Vector3(x, y, z);
    world.set(name, w);
    const pw = parent ? world.get(parent)! : new THREE.Vector3();
    b.position.copy(w.clone().sub(pw));
    (parent ? bones.get(parent)! : rig).add(b);
    bones.set(name, b);
  }
  /** Adds a mesh to a bone, the geometry given in model (T-pose world) coordinates. */
  const put = (bone: string, geo: THREE.BufferGeometry, mat: THREE.Material, name = "") => {
    const w = world.get(bone)!;
    geo.translate(-w.x, -w.y, -w.z);
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    bones.get(bone)!.add(m);
    return m;
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // --- Torso: a rigid body inside the shell, as a real turtle's.
  put("spine", blob(0.23, 0.2, 0.17).translate(0, 1.04, 0.0), M.skin);
  put("chest", blob(0.26, 0.24, 0.18).translate(0, 1.22, 0.0), M.skin);
  // Plastron: the front of a squashed sphere, with its plates painted and embossed.
  {
    // Centred on +Z (phi = π/2); u runs across the front, v from the top down.
    const g = new THREE.SphereGeometry(1, 48, 40, Math.PI * 0.5 - 1.05, 2.1, 0.32, 2.5);
    g.scale(0.25, 0.33, 0.2);
    g.translate(0, 1.14, 0.03);
    put("chest", g, M.plastron, "plastron");
  }
  // Carapace: a deep dome over the back, scutes raised by its bump map and by the geometry.
  {
    // Centred on −Z (phi = −π/2): u = 0.5 runs down the spine, where the texture puts it.
    const g = new THREE.SphereGeometry(1, 64, 48, -Math.PI * 0.5 - Math.PI * 0.62, Math.PI * 1.24, 0.25, 2.62);
    const p = g.attributes.position!;
    const uv = g.attributes.uv!;
    for (let i = 0; i < p.count; i++) {
      // Raised plates with grooves between them, and a ridge along the spine.
      const x = p.getX(i);
      const k = 1 + 0.06 * scuteRelief(uv.getX(i), 1 - uv.getY(i));
      p.setXYZ(i, x * k, p.getY(i) * k, p.getZ(i) * k * (1 + 0.08 * Math.max(0, 1 - Math.abs(x) * 2.2)));
    }
    g.computeVertexNormals();
    g.scale(0.34, 0.38, 0.25);
    g.translate(0, 1.13, -0.05);
    put("chest", g, M.shell, "carapace");
  }
  // Rim of marginal scutes where back and front shells meet.
  {
    const g = new THREE.TorusGeometry(1, 0.1, 12, 64);
    g.scale(0.31, 0.36, 1);
    g.translate(0, 1.13, -0.06);
    put("chest", g, M.rim);
  }
  // Optional (`Katana_Back`): two sheaths crossed over the shell, the hilts above the
  // shoulders. The right one still holds a sword; the left one is empty (its sword is in
  // hand). A leather strap across the plastron holds them.
  {
    const back = new THREE.Group();
    back.name = "Katana_Back";
    const lacquer = new THREE.MeshPhysicalMaterial({ color: "#1d1712", roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.2 });
    const wrapMat = new THREE.MeshStandardMaterial({ color: "#1d2c5e", roughness: 0.8 });
    const gold = new THREE.MeshPhysicalMaterial({ color: "#b08a3e", metalness: 0.85, roughness: 0.35 });
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      back.add(m);
      return m;
    };
    for (const s of [1, -1]) {
      // Mouth over the shoulder, tip at the opposite hip, bowed out over the dome.
      const mouth = V(s * 0.17, 1.43, -0.25);
      const curve = new THREE.QuadraticBezierCurve3(mouth, V(0, 1.14, s > 0 ? -0.4 : -0.43), V(-s * 0.19, 0.86, -0.27));
      const sheath = new THREE.TubeGeometry(curve, 24, 0.021, 10);
      add(sheath, lacquer);
      const end = curve.getPoint(1);
      add(new THREE.SphereGeometry(0.023, 10, 8).translate(end.x, end.y, end.z), gold);
      const out = mouth.clone().sub(curve.getPoint(0.06)).normalize();
      const turn = new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), out);
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.03, 12).applyQuaternion(turn).translate(mouth.x, mouth.y, mouth.z), gold);
      if (s > 0) {
        // The sheathed sword: guard, wrapped grip, pommel.
        const guard = mouth.clone().addScaledVector(out, 0.025);
        add(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 16).applyQuaternion(turn).translate(guard.x, guard.y, guard.z), gold);
        const grip = guard.clone().addScaledVector(out, 0.13);
        add(new THREE.CylinderGeometry(0.017, 0.019, 0.24, 10).applyQuaternion(turn).translate(grip.x, grip.y, grip.z), wrapMat);
        for (let k = 0; k < 5; k++) {
          const ring = guard.clone().addScaledVector(out, 0.03 + k * 0.045);
          add(new THREE.TorusGeometry(0.019, 0.003, 4, 12).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), out)).translate(ring.x, ring.y, ring.z), gold);
        }
        const pommel = guard.clone().addScaledVector(out, 0.255);
        add(new THREE.SphereGeometry(0.02, 10, 8).translate(pommel.x, pommel.y, pommel.z), gold);
      }
    }
    // Strap: from the left shoulder across the plastron to the right hip, and round the back.
    const strap = new THREE.CatmullRomCurve3([V(0.2, 1.42, -0.18), V(0.22, 1.4, 0.06), V(0.07, 1.24, 0.25), V(-0.12, 1.02, 0.24), V(-0.24, 0.96, 0.05), V(-0.2, 0.9, -0.2)]);
    const band = new THREE.TubeGeometry(strap, 40, 0.012, 6);
    add(band, M.leather);
    for (const m of back.children) {
      // Built in model coordinates: move into the chest bone's space.
      (m as THREE.Mesh).geometry.translate(-world.get("chest")!.x, -world.get("chest")!.y, -world.get("chest")!.z);
    }
    bones.get("chest")!.add(back);
  }
  // Pelvis, and a cloth sash wound twice round the waist, knotted in front, with a
  // long flap hanging between the thighs (as on the reference sheet).
  put("hips", blob(0.2, 0.13, 0.15).translate(0, 0.88, 0), M.skin);
  {
    for (const [y, r] of [[0.95, 0.045], [0.9, 0.04]] as const) {
      const g = new THREE.TorusGeometry(1, r, 10, 48);
      g.rotateX(Math.PI / 2);
      g.scale(0.25, 1, 0.195);
      g.translate(0, y, 0.01);
      put("hips", g, M.cloth, "sash");
    }
    put("hips", blob(0.055, 0.045, 0.04).translate(0, 0.93, 0.205), M.cloth); // knot
    // Front flap: wider at the bottom, gently curved over the thighs, frayed hem.
    const L = 0.36;
    const flap = new THREE.PlaneGeometry(0.13, L, 4, 12);
    const fp = flap.attributes.position!;
    for (let i = 0; i < fp.count; i++) {
      const t = 0.5 - fp.getY(i) / L; // 0 at the knot, 1 at the hem
      const x = fp.getX(i) * (0.75 + t * 0.5);
      fp.setXYZ(i, x, fp.getY(i), -x * x * 2 + t * 0.03 + Math.sin(fp.getX(i) * 60) * 0.004 * t);
    }
    flap.computeVertexNormals();
    flap.translate(0, 0.91 - L / 2, 0.215);
    put("hips", flap, M.cloth, "flap");
    // Two short tails of the knot.
    for (const [x, rot] of [[-0.035, 0.35], [0.04, -0.3]] as const) {
      const tail = new RoundedBoxGeometry(0.045, 0.14, 0.012, 2, 0.005);
      tail.rotateZ(rot);
      tail.translate(x, 0.87, 0.225);
      put("hips", tail, M.cloth);
    }
  }

  // --- Neck and head.
  put("neck", limb(V(0, 1.4, 0.0), V(0, 1.52, 0.04), 0.085, 0.075), M.skin);
  {
    // Skull and the broad, rounded snout.
    put("head", blob(0.13, 0.135, 0.14, 40).translate(0, 1.61, 0.03), M.skin, "skull");
    put("head", blob(0.112, 0.075, 0.11, 40).translate(0, 1.545, 0.085), M.skin, "snout");
    // Mouth, one per expression (see paintTurtle), drawn on the snout's surface: a
    // confident half smile (fierce), a small gentle smile (calm), a wide open grin with
    // teeth (wild).
    const mouthMat = new THREE.MeshStandardMaterial({ color: "#1d2610", roughness: 0.8 });
    {
      const SC = V(0, 1.545, 0.085);
      const SR = V(0.112, 0.075, 0.11);
      /** The point of the snout's surface in front of (x, y), lifted by `lift`. */
      const onSnout = (x: number, y: number, lift = 0.0015) => {
        const k = Math.max(0, 1 - (x / SR.x) ** 2 - ((y - SC.y) / SR.y) ** 2);
        const p = V(x, y, SC.z + SR.z * Math.sqrt(k));
        const n = V((p.x - SC.x) / SR.x ** 2, (p.y - SC.y) / SR.y ** 2, (p.z - SC.z) / SR.z ** 2).normalize();
        return p.addScaledVector(n, lift);
      };
      const line = (f: (u: number) => [number, number], r: number, name: string) => {
        const pts = Array.from({ length: 17 }, (_, i) => onSnout(...f(i / 16)));
        put("head", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, r, 6), mouthMat, name);
      };
      // Fierce: lower on the left, the right corner pulled up in a smirk.
      line((u) => {
        const x = -0.07 + u * 0.145;
        return [x, 1.528 + 0.004 * Math.sin(u * Math.PI) * -1 + 0.014 * u ** 3];
      }, 0.0042, "expr:fierce");
      // Calm: short, both corners gently up.
      line((u) => {
        const x = -0.05 + u * 0.1;
        return [x, 1.53 + 0.008 * ((x / 0.05) ** 2)];
      }, 0.0038, "expr:calm");
      // Wild: an open grin, upper teeth showing, corners high.
      {
        const top = (x: number) => 1.548 + 0.01 * ((x / 0.07) ** 2);
        const bot = (x: number) => 1.548 - 0.03 * (1 - (x / 0.07) ** 2) + 0.01 * ((x / 0.07) ** 2);
        const grid = (y0: (x: number) => number, y1: (x: number) => number, lift: number) => {
          const pos: number[] = [];
          const idx: number[] = [];
          const n = 20;
          for (let i = 0; i <= n; i++)
            for (let j = 0; j <= 4; j++) {
              const x = -0.07 + (i / n) * 0.14;
              const p = onSnout(x, y0(x) + (y1(x) - y0(x)) * (j / 4), lift);
              pos.push(p.x, p.y, p.z);
            }
          for (let i = 0; i < n; i++)
            for (let j = 0; j < 4; j++) {
              const a0 = i * 5 + j;
              idx.push(a0, a0 + 5, a0 + 1, a0 + 1, a0 + 5, a0 + 6);
            }
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
          g.setIndex(idx);
          g.computeVertexNormals();
          return g;
        };
        const inside = new THREE.MeshStandardMaterial({ color: "#3a1512", roughness: 0.9, side: THREE.DoubleSide });
        put("head", grid(top, bot, 0.0012), inside, "expr:wild");
        const teethMat = new THREE.MeshPhysicalMaterial({ color: "#f4f1e6", roughness: 0.3, clearcoat: 0.6, side: THREE.DoubleSide });
        put("head", grid(top, (x) => top(x) - 0.009 * (1 - (x / 0.075) ** 2), 0.0022), teethMat, "expr:wild");
        line((u) => {
          const x = -0.072 + u * 0.144;
          return [x, top(x)];
        }, 0.0035, "expr:wild");
        line((u) => {
          const x = -0.072 + u * 0.144;
          return [x, bot(x)];
        }, 0.0035, "expr:wild");
      }
    }
    // Nostrils.
    for (const s of [-1, 1]) put("head", blob(0.007, 0.005, 0.004).translate(s * 0.018, 1.585, 0.19), mouthMat);
    // Mask band: cloth hugging the skull (each vertex laid on the head's surface),
    // dipping a little over the eyes, knotted at the back.
    {
      const c = new THREE.Vector3(0, 1.61, 0.03);
      const rad = new THREE.Vector3(0.13, 0.135, 0.14);
      const cols = 64;
      const rows = 4;
      const pos: number[] = [];
      const uvs: number[] = [];
      const idx: number[] = [];
      for (let j = 0; j <= rows; j++)
        for (let i = 0; i <= cols; i++) {
          const ang = (i / cols) * Math.PI * 2;
          // 8.5 cm wide, a touch lower at the front (over the eyes) than at the knot.
          const y = 1.594 + (j / rows) * 0.085 - 0.008 * Math.cos(ang);
          const k = Math.sqrt(Math.max(0, 1 - ((y - c.y) / rad.y) ** 2));
          const p = new THREE.Vector3(c.x + Math.sin(ang) * rad.x * k, y, c.z + Math.cos(ang) * rad.z * k);
          const n = new THREE.Vector3((p.x - c.x) / rad.x ** 2, (p.y - c.y) / rad.y ** 2, (p.z - c.z) / rad.z ** 2).normalize();
          // Cloth stands off the skin a few millimetres, a little more at its edges (rolled hem).
          const edge = j === 0 || j === rows ? 0.009 : 0.006;
          p.addScaledVector(n, edge);
          pos.push(p.x, p.y, p.z);
          uvs.push(i / cols, j / rows);
        }
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < cols; i++) {
          const a0 = j * (cols + 1) + i;
          const a1 = a0 + cols + 1;
          idx.push(a0, a0 + 1, a1, a0 + 1, a1 + 1, a1);
        }
      const band = new THREE.BufferGeometry();
      band.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      band.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
      band.setIndex(idx);
      band.computeVertexNormals();
      put("head", band, M.mask, "mask");
    }
    put("head", blob(0.032, 0.028, 0.024).translate(0, 1.636, -0.122), M.mask, "mask"); // knot
    // Two tails hanging from the knot. Their shape is recomputed every frame as cloth
    // (see animateTurtle): they hang, trail behind when the turtle moves, and ripple.
    for (const s of [-1, 1]) {
      const tail = new THREE.PlaneGeometry(0.055, TAIL_LENGTH, 1, TAIL_ROWS);
      tail.translate(0, -TAIL_LENGTH / 2, 0);
      const m = put("head", tail.translate(s * 0.018, 1.632, -0.13), M.mask, "maskTail");
      m.userData.tailSide = s;
    }
    // Eyes, set in the mask, and the brows that give the expression:
    // fierce: a determined frown; calm: level brows, softer, rounder eyes;
    // wild: brows flung up, eyes wide open with small pupils looking slightly askew.
    const white = new THREE.MeshPhysicalMaterial({ color: "#f5f2ea", roughness: 0.25, clearcoat: 1 });
    const iris = new THREE.MeshPhysicalMaterial({ color: "#2a1a0e", roughness: 0.1, clearcoat: 1 });
    const looks = {
      fierce: { eye: [0.036, 0.026], pupil: [0.014, 0.017, 0], brow: [0.32, 1.655, 0] },
      calm: { eye: [0.037, 0.029], pupil: [0.016, 0.019, 0], brow: [0.06, 1.666, 0.004] },
      wild: { eye: [0.04, 0.034], pupil: [0.011, 0.013, 0.008], brow: [-0.22, 1.678, 0.006] },
    } as const;
    for (const [mood, k] of Object.entries(looks))
      for (const s of [-1, 1]) {
        // Set into the mask's eye holes: they follow the curve of the face, barely proud of the cloth.
        const eye = blob(k.eye[0], k.eye[1], 0.013);
        eye.rotateY(s * 0.35);
        put("head", eye.translate(s * 0.054, 1.632, 0.172), white, `expr:${mood}`);
        const pupil = blob(k.pupil[0], k.pupil[1], 0.006);
        pupil.rotateY(s * 0.35);
        // Wild: the pupils wander a little apart.
        put("head", pupil.translate(s * (0.05 + k.pupil[2]), 1.628 + k.pupil[2] * 0.5, 0.184), iris, `expr:${mood}`);
        const brow = new RoundedBoxGeometry(0.075, 0.02, 0.03, 2, 0.009);
        brow.rotateZ(s * k.brow[0]);
        brow.translate(s * 0.05, k.brow[1], 0.18 + k.brow[2]);
        put("head", brow, M.mask, `expr:${mood}`);
      }
  }

  // --- Arms (along ±X in the T-pose): heavy shoulders, bulging biceps, thick forearms.
  for (const s of [1, -1]) {
    const side = s > 0 ? "left" : "right";
    const sx = (x: number) => s * x;
    const UA = `${side}UpperArm`;
    const LA = `${side}LowerArm`;
    put(UA, blob(0.115, 0.11, 0.11).translate(sx(0.255), 1.385, 0), M.skin); // deltoid
    put(UA, limb(V(sx(0.27), 1.37, 0), V(sx(0.5), 1.37, 0), 0.085, 0.068), M.skin);
    put(UA, blob(0.075, 0.07, 0.068).translate(sx(0.39), 1.398, 0.03), M.skin); // biceps
    put(UA, blob(0.07, 0.062, 0.06).translate(sx(0.37), 1.36, -0.035), M.skin); // triceps
    put(LA, blob(0.07, 0.068, 0.068).translate(sx(0.51), 1.37, 0), M.skin); // elbow
    put(LA, limb(V(sx(0.52), 1.37, 0), V(sx(0.72), 1.37, 0), 0.074, 0.054), M.skin);
    put(LA, blob(0.07, 0.066, 0.068).translate(sx(0.57), 1.38, 0.008), M.skin); // forearm muscle
    // Wrist wraps: overlapping strips of worn leather.
    for (let k = 0; k < 6; k++) {
      const b = band(0.08 - k * 0.003, 0.034, (k % 2 ? 1 : -1) * 0.15);
      b.rotateZ(Math.PI / 2);
      b.translate(sx(0.565 + k * 0.028), 1.372, 0);
      put(LA, b, M.leather);
    }
    // Fist: palm, three thick fingers curled, the thumb across.
    const fist = new RoundedBoxGeometry(0.105, 0.09, 0.1, 3, 0.032);
    fist.translate(sx(0.8), 1.365, 0.005);
    put(`${side}Hand`, fist, M.skin);
    for (let k = 0; k < 3; k++) {
      const f = new THREE.CapsuleGeometry(0.021, 0.05, 4, 10);
      f.rotateX(Math.PI / 2);
      f.translate(sx(0.845), 1.345, 0.032 - k * 0.032);
      put(`${side}Hand`, f, M.skin);
    }
    const thumb = new THREE.CapsuleGeometry(0.018, 0.045, 4, 10);
    thumb.rotateZ(Math.PI / 2);
    thumb.translate(sx(0.805), 1.335, 0.055);
    put(`${side}Hand`, thumb, M.skin);
  }

  // --- Legs: powerful thighs, heavy calves, broad three-toed feet.
  for (const s of [1, -1]) {
    const side = s > 0 ? "left" : "right";
    const sx = (x: number) => s * x;
    const UL = `${side}UpperLeg`;
    const LL = `${side}LowerLeg`;
    put(UL, limb(V(sx(0.13), 0.86, 0), V(sx(0.13), 0.54, 0), 0.12, 0.088), M.skin);
    put(UL, blob(0.085, 0.13, 0.08).translate(sx(0.13), 0.7, 0.045), M.skin); // quadriceps
    put(UL, blob(0.07, 0.11, 0.07).translate(sx(0.16), 0.74, -0.03), M.skin); // hamstring
    put(LL, limb(V(sx(0.13), 0.5, 0), V(sx(0.13), 0.12, 0), 0.088, 0.062), M.skin);
    put(LL, blob(0.075, 0.11, 0.075).translate(sx(0.13), 0.38, -0.04), M.skin); // calf
    // Knee pad: a padded leather cap with a rolled rim, strapped behind the knee.
    const pad = new RoundedBoxGeometry(0.15, 0.15, 0.07, 4, 0.03);
    const pp = pad.attributes.position!;
    for (let i = 0; i < pp.count; i++) {
      // Curve it around the knee.
      const x = pp.getX(i);
      pp.setZ(i, pp.getZ(i) - x * x * 3);
    }
    pad.computeVertexNormals();
    pad.translate(sx(0.13), 0.5, 0.075);
    put(LL, pad, M.leather);
    const strap = band(0.098, 0.03, 0);
    strap.translate(sx(0.13), 0.5, 0.0);
    put(LL, strap, M.leather);
    // Shin wraps, over the skin.
    for (let k = 0; k < 8; k++) {
      const b = band(0.1 - k * 0.0045, 0.05, (k % 2 ? 1 : -1) * 0.12);
      b.translate(sx(0.13), 0.41 - k * 0.037, -0.01);
      put(LL, b, M.leather);
    }
    // Foot: a broad pad with three stubby toes.
    put(`${side}Foot`, blob(0.075, 0.05, 0.115).translate(sx(0.13), 0.05, 0.035), M.skin);
    for (let k = -1; k <= 1; k++) {
      const toe = new THREE.CapsuleGeometry(0.028, 0.045, 4, 10);
      toe.rotateX(Math.PI / 2);
      toe.translate(sx(0.13) + k * 0.046, 0.032, 0.145 - Math.abs(k) * 0.012);
      put(`${side}Foot`, toe, M.skin);
    }
  }
  // A slightly big head: the face must read from the arena camera.
  bones.get("head")!.scale.setScalar(1.15);
  rig.updateMatrixWorld(true);
  return rig;
}

/**
 * Brings an instance's mask tails to life: each frame they are rebuilt as a ribbon
 * that leaves the knot backward, then hangs under gravity, trails against the head's
 * motion (inertia) and ripples. Purely visual.
 */
export function animateTurtle(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.name !== "maskTail") return;
    const mesh = o;
    mesh.geometry = mesh.geometry.clone();
    const side = (mesh.userData.tailSide as number) ?? 1;
    const pos = mesh.geometry.attributes.position as THREE.BufferAttribute;
    // Rest geometry: the knot point of each row pair (top row's centre), in mesh space.
    const knot = new THREE.Vector3(pos.getX(0) + pos.getX(1), pos.getY(0) + pos.getY(1), pos.getZ(0) + pos.getZ(1)).multiplyScalar(0.5);
    const lastKnot = new THREE.Vector3();
    const flow = new THREE.Vector3(0, -1, 0); // smoothed hanging direction, world space
    let last = 0;
    const wp = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const back = new THREE.Vector3();
    const sideV = new THREE.Vector3();
    const inv = new THREE.Matrix4();
    const pt = new THREE.Vector3();
    mesh.onBeforeRender = () => {
      const now = performance.now() / 1000;
      // Shadow and outline passes render the mesh again in the same frame: once is enough.
      if (last && now - last < 0.004) return;
      const dt = last ? Math.min(0.05, now - last) : 0;
      last = now;
      mesh.updateWorldMatrix(true, false);
      wp.copy(knot).applyMatrix4(mesh.matrixWorld);
      mesh.getWorldQuaternion(q);
      back.set(0, 0, -1).applyQuaternion(q);
      sideV.set(1, 0, 0).applyQuaternion(q);
      // Inertia: the knot's motion pushes the cloth the other way.
      const vel = dt > 0 && lastKnot.lengthSq() > 0 ? wp.clone().sub(lastKnot).divideScalar(dt) : new THREE.Vector3();
      lastKnot.copy(wp);
      const want = new THREE.Vector3(0, -1, 0)
        .addScaledVector(back, 0.55)
        .addScaledVector(sideV, side * 0.22)
        .addScaledVector(vel, -0.09)
        .normalize();
      flow.lerp(want, dt > 0 ? 1 - Math.exp(-dt * 7) : 1).normalize();
      inv.copy(mesh.matrixWorld).invert();
      // Walk down the ribbon: leaves the knot backward, bends into the hanging direction.
      const p = wp.clone();
      const seg = TAIL_LENGTH / TAIL_ROWS;
      for (let r = 0; r <= TAIL_ROWS; r++) {
        const t = r / TAIL_ROWS;
        if (r > 0) {
          const dir = back.clone().lerp(flow, Math.min(1, t * 2.2)).normalize();
          p.addScaledVector(dir, seg);
        }
        // Ripple across the ribbon, growing toward its end; plus a slight twist.
        const wave = Math.sin(now * 7 + side - t * 9) * 0.035 * t;
        const twist = Math.sin(now * 4 + side * 2 - t * 5) * 0.5 * t;
        const across = sideV.clone().multiplyScalar(Math.cos(twist)).addScaledVector(back, Math.sin(twist));
        const w = 0.0275 * (1 - t * 0.35);
        for (const k of [0, 1]) {
          pt.copy(p).addScaledVector(across, (k === 0 ? -1 : 1) * w).addScaledVector(sideV, wave * side).applyMatrix4(inv);
          pos.setXYZ(r * 2 + k, pt.x, pt.y, pt.z);
        }
      }
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    };
  });
}

/**
 * Dresses an instance (its materials are its own copies by then): the mask colour, the
 * face of the chosen expression (fierce by default; calm, wild), the optional parts.
 */
export function paintTurtle(root: THREE.Object3D, look: { show: string[]; outfit?: string; expression?: string }): void {
  const mood = look.expression ?? "fierce";
  const c = look.outfit ? new THREE.Color(look.outfit) : null;
  root.traverse((o) => {
    if (OPTIONAL.includes(o.name)) o.visible = look.show.includes(o.name);
    if (o.name.startsWith("expr:")) o.visible = o.name === `expr:${mood}`;
    if (c && o instanceof THREE.Mesh && /^mask/.test((o.material as THREE.Material).name)) (o.material as THREE.MeshPhysicalMaterial).color.copy(c);
  });
}
