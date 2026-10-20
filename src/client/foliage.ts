// Trees of the village, built the way games build them: trunks and branches are
// tapered tubes along curves (photo bark, see villageTex.ts), and the foliage is
// hundreds of small cut-out cards (blossom clusters, needle tufts, bamboo leaves)
// painted in code. The cards are lit as one soft volume (normals point out of their
// clump) and sway in the wind. Drawn only: nothing here touches the simulation.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { noOutline } from "./toon.ts";
import { ROUGH_MEAN, photo } from "./villageTex.ts";

type Rng = () => number;
export type FoliageKind = "blossom" | "needles" | "bamboo" | "grass";

/** Wind clock of every leaf (seconds), advanced by the village's animation. */
export const windTime = { value: 0 };

// ---------------------------------------------------------------------------
// Card textures: a 2 × 2 atlas of variants, painted on a canvas, then turned into
// a texture whose transparent pixels keep the leaf colour (else the mipmaps would
// darken every edge).

const CELL = 256;

function painter(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Five-petalled cherry flowers, buds and a few twigs, in loose clusters. */
function paintBlossom(g: CanvasRenderingContext2D, r: Rng): void {
  g.strokeStyle = "#4a3028";
  g.lineCap = "round";
  for (let k = 0; k < 3; k++) {
    g.lineWidth = 2 + r() * 2;
    g.beginPath();
    g.moveTo(CELL * 0.5, CELL * 0.95);
    g.quadraticCurveTo(CELL * (0.2 + r() * 0.6), CELL * 0.55, CELL * (0.15 + r() * 0.7), CELL * (0.12 + r() * 0.3));
    g.stroke();
  }
  for (let k = 0; k < 34; k++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * CELL * 0.4;
    const x = CELL / 2 + Math.cos(a) * d;
    const y = CELL / 2 + Math.sin(a) * d * 0.9;
    const size = 9 + r() * 7;
    if (r() < 0.15) {
      g.fillStyle = `hsl(${338 + r() * 10}, 70%, ${62 + r() * 10}%)`;
      g.beginPath();
      g.ellipse(x, y, size * 0.35, size * 0.5, r() * 3, 0, Math.PI * 2);
      g.fill();
      continue;
    }
    const hue = 335 + r() * 18;
    const light = 84 + r() * 9;
    const turn = r() * Math.PI;
    for (let p = 0; p < 5; p++) {
      const pa = turn + (p / 5) * Math.PI * 2;
      g.fillStyle = `hsl(${hue}, ${55 + r() * 25}%, ${light}%)`;
      g.beginPath();
      g.ellipse(x + Math.cos(pa) * size * 0.5, y + Math.sin(pa) * size * 0.5, size * 0.5, size * 0.36, pa, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = `hsl(${342 + r() * 8}, 65%, 58%)`;
    g.beginPath();
    g.arc(x, y, size * 0.22, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#e8c860";
    for (let s = 0; s < 5; s++) g.fillRect(x + (r() - 0.5) * size * 0.5, y + (r() - 0.5) * size * 0.5, 1.5, 1.5);
  }
}

/** A tuft of pine needles fanning out from a short twig. */
function paintNeedles(g: CanvasRenderingContext2D, r: Rng): void {
  g.lineCap = "round";
  const bx = CELL * 0.5;
  const by = CELL * 0.92;
  const tx = CELL * (0.4 + r() * 0.2);
  const ty = CELL * 0.35;
  g.strokeStyle = "#5a4430";
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(bx, by);
  g.lineTo(tx, ty);
  g.stroke();
  for (let k = 0; k < 260; k++) {
    const t = Math.pow(r(), 0.7);
    const x = bx + (tx - bx) * t;
    const y = by + (ty - by) * t;
    const a = -Math.PI / 2 + (r() - 0.5) * Math.PI * 1.5;
    const len = CELL * (0.12 + r() * 0.22) * (1.1 - t * 0.3);
    const light = 20 + r() * 18;
    g.strokeStyle = `hsl(${95 + r() * 30}, ${30 + r() * 20}%, ${light}%)`;
    g.lineWidth = 1.2 + r() * 1.2;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    g.stroke();
  }
}

/** Long, narrow bamboo leaves hanging in a fan from a thin twig. */
function paintBamboo(g: CanvasRenderingContext2D, r: Rng): void {
  const ox = CELL * 0.5;
  const oy = CELL * 0.12;
  g.strokeStyle = "#7d8a48";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(ox, 0);
  g.lineTo(ox, oy);
  g.stroke();
  const n = 5 + Math.floor(r() * 3);
  for (let k = 0; k < n; k++) {
    const a = Math.PI / 2 + (k / (n - 1) - 0.5) * 2.2 + (r() - 0.5) * 0.2;
    const len = CELL * (0.55 + r() * 0.3);
    const wid = CELL * (0.05 + r() * 0.025);
    g.save();
    g.translate(ox, oy);
    g.rotate(a - Math.PI / 2);
    const light = 34 + r() * 16;
    g.fillStyle = `hsl(${80 + r() * 18}, ${38 + r() * 20}%, ${light}%)`;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(wid, len * 0.35, 0, len);
    g.quadraticCurveTo(-wid, len * 0.35, 0, 0);
    g.fill();
    g.strokeStyle = `hsl(85, 30%, ${light - 10}%)`;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(0, len * 0.95);
    g.stroke();
    g.restore();
  }
}

/** A tuft of grass: thin, tapering blades rising from the bottom edge and bending. */
function paintGrass(g: CanvasRenderingContext2D, r: Rng): void {
  for (let k = 0; k < 70; k++) {
    const x = CELL * (0.12 + r() * 0.76);
    const h = CELL * (0.45 + r() * 0.5);
    const bend = (r() - 0.5) * CELL * 0.35;
    const w = 3 + r() * 4;
    const light = 26 + r() * 22;
    g.fillStyle = `hsl(${78 + r() * 30}, ${40 + r() * 25}%, ${light}%)`;
    g.beginPath();
    g.moveTo(x - w / 2, CELL);
    g.quadraticCurveTo(x - w / 3 + bend * 0.4, CELL - h * 0.55, x + bend, CELL - h);
    g.quadraticCurveTo(x + w / 3 + bend * 0.4, CELL - h * 0.55, x + w / 2, CELL);
    g.fill();
  }
}

const PAINT: Record<FoliageKind, (g: CanvasRenderingContext2D, r: Rng) => void> = { blossom: paintBlossom, needles: paintNeedles, bamboo: paintBamboo, grass: paintGrass };
const atlases = new Map<FoliageKind, THREE.DataTexture>();

function atlas(kind: FoliageKind): THREE.DataTexture {
  const hit = atlases.get(kind);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = c.height = CELL * 2;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  for (let k = 0; k < 4; k++) {
    g.save();
    g.beginPath();
    g.rect((k % 2) * CELL, Math.floor(k / 2) * CELL, CELL, CELL);
    g.clip();
    g.translate((k % 2) * CELL, Math.floor(k / 2) * CELL);
    PAINT[kind](g, painter(kind.length * 977 + k * 131));
    g.restore();
  }
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  // Transparent pixels take the mean colour of the painted ones.
  const sum = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < d.length; i += 4)
    if (d[i + 3]! > 128) {
      for (let j = 0; j < 3; j++) sum[j]! += d[i + j]!;
      n++;
    }
  for (let i = 0; i < d.length; i += 4)
    if (d[i + 3]! < 8) for (let j = 0; j < 3; j++) d[i + j] = sum[j]! / Math.max(1, n);
  const t = new THREE.DataTexture(new Uint8Array(d.buffer.slice(0)), c.width, c.height, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = true;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
  atlases.set(kind, t);
  return t;
}

/**
 * The material of one tree's foliage (its own copy: props fade one at a time). The
 * cards are cut out by alpha test, lit on both sides with the clump's normals, and
 * sway with the wind (attribute `sway`: 0 = still, 1 = free tip).
 */
export function foliageMaterial(kind: FoliageKind): THREE.MeshStandardMaterial {
  const m = noOutline(
    new THREE.MeshStandardMaterial({
      map: atlas(kind), alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true, roughness: 0.75, metalness: 0,
      // A little light of their own: thin petals and leaves let the sun through.
      emissive: kind === "blossom" ? "#5a3640" : "#16200c", emissiveIntensity: 1,
    }),
  );
  m.onBeforeCompile = (shader) => {
    shader.uniforms.windTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float sway;\nuniform float windTime;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vec4 windWorld = modelMatrix * vec4( transformed, 1.0 );
float windPhase = windTime * 1.6 + windWorld.x * 0.35 + windWorld.z * 0.27;
transformed.x += ( sin( windPhase ) * 0.06 + sin( windPhase * 3.7 + windWorld.y ) * 0.025 ) * sway;
transformed.z += ( cos( windPhase * 0.8 ) * 0.05 + sin( windPhase * 4.3 + windWorld.x ) * 0.02 ) * sway;
transformed.y += sin( windPhase * 2.9 + windWorld.z ) * 0.015 * sway;`,
      );
    // Both faces keep the clump's normal (lit as a volume, not as flat cards).
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>", THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", ""));
  };
  m.customProgramCacheKey = () => "village-foliage";
  return m;
}

// ---------------------------------------------------------------------------
// Geometry.

/** An ellipsoid clump of foliage: centre, radii, and how much it sways. */
export interface Clump {
  c: THREE.Vector3;
  rad: THREE.Vector3;
  sway: number;
}

export interface CardOptions {
  /** Cards per cubic metre of clump (at least 6 per clump). */
  density: number;
  size: [number, number];
  /** Bias towards the surface (1 = uniform in volume, higher = on the shell). */
  shell: number;
  /** Cards turn their face up (0 = any way, 1 = flat): pine pads. */
  flat?: number;
  /** Cards hang along their length (bamboo leaves). */
  hang?: boolean;
  /** Colour of each card is this, varied by ± tint. */
  color: THREE.Color;
  tint: number;
}

/** Foliage cards over the clumps, merged into one geometry. */
export function cards(r: Rng, clumps: Clump[], o: CardOptions): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const sw: number[] = [];
  const idx: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (const cl of clumps) {
    const n = Math.max(6, Math.round(o.density * (4 / 3) * Math.PI * cl.rad.x * cl.rad.y * cl.rad.z));
    for (let k = 0; k < n; k++) {
      // A point in the ellipsoid, pushed towards its surface.
      const dir = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
      if (dir.lengthSq() < 1e-4) dir.set(0, 1, 0);
      dir.normalize();
      const rr = Math.pow(r(), 1 / o.shell);
      const local = dir.clone().multiplyScalar(rr);
      const p = new THREE.Vector3(local.x * cl.rad.x, local.y * cl.rad.y, local.z * cl.rad.z).add(cl.c);
      // The card's plane: random, or mostly facing up, or hanging.
      let face = new THREE.Vector3(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1).normalize();
      if (o.flat) face.lerp(up, o.flat).normalize();
      let along: THREE.Vector3;
      if (o.hang) {
        face = new THREE.Vector3(face.x, 0, face.z).normalize();
        if (face.lengthSq() < 1e-4) face.set(1, 0, 0);
        along = new THREE.Vector3(0, -1, 0).add(new THREE.Vector3((r() - 0.5) * 0.6, 0, (r() - 0.5) * 0.6)).normalize();
      } else {
        along = new THREE.Vector3().crossVectors(face, Math.abs(face.y) < 0.9 ? up : new THREE.Vector3(1, 0, 0)).normalize();
        along.applyAxisAngle(face, r() * Math.PI * 2);
      }
      const side = new THREE.Vector3().crossVectors(face, along).normalize();
      const size = o.size[0] + r() * (o.size[1] - o.size[0]);
      // Lit as part of the clump: the normal points out of it, a little towards the card's own.
      const nrm = local.lengthSq() > 1e-4 ? local.clone().normalize() : up.clone();
      nrm.multiplyScalar(0.75).add(face.clone().multiplyScalar(face.dot(nrm) >= 0 ? 0.25 : -0.25)).normalize();
      const cell = Math.floor(r() * 4);
      const [u0, v0] = [(cell % 2) * 0.5, Math.floor(cell / 2) * 0.5];
      const shade = 0.82 + rr * 0.18;
      const c = o.color.clone().offsetHSL((r() - 0.5) * o.tint * 0.1, (r() - 0.5) * o.tint, (r() - 0.5) * o.tint).multiplyScalar(shade);
      const base = pos.length / 3;
      // Hanging cards are pinned at their top edge; the others at their middle.
      const top = o.hang ? 0 : 0.5;
      for (const [a, b] of [[-0.5, -top], [0.5, -top], [0.5, 1 - top], [-0.5, 1 - top]] as const) {
        const v = p.clone().addScaledVector(side, a * size).addScaledVector(along, b * size);
        pos.push(v.x, v.y, v.z);
        nor.push(nrm.x, nrm.y, nrm.z);
        uv.push(u0 + (a + 0.5) * 0.5, v0 + (1 - (b + top)) * 0.5);
        col.push(c.r, c.g, c.b);
        sw.push(cl.sway * (0.6 + rr * 0.4) * (o.hang ? 0.5 + (b + top) : 1));
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("sway", new THREE.Float32BufferAttribute(sw, 1));
  g.setIndex(idx);
  return g;
}

/**
 * A tube along a curve that narrows from r0 to r1. UVs in metres for bark that runs
 * along the branch: u around it, v along it.
 */
export function branch(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, metres = 1, segments = 8, radial = 7): THREE.BufferGeometry {
  const frames = curve.computeFrenetFrames(segments, false);
  const len = curve.getLength();
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = curve.getPointAt(t);
    const rad = r0 + (r1 - r0) * t;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      // (As TubeGeometry: -cos, so the faces turn outwards.)
      const n = frames.normals[i]!.clone().multiplyScalar(-Math.cos(a)).addScaledVector(frames.binormals[i]!, Math.sin(a));
      pos.push(p.x + n.x * rad, p.y + n.y * rad, p.z + n.z * rad);
      nor.push(n.x, n.y, n.z);
      uv.push(((j / radial) * Math.PI * 2 * Math.max(rad, 0.05)) / metres, (t * len) / metres);
    }
  }
  for (let i = 0; i < segments; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Bark: the photo surface if it loaded, else a plain colour. */
export function barkMaterial(name: "bark-sakura" | "bark-pine", fallback: THREE.ColorRepresentation): THREE.MeshStandardMaterial {
  const s = photo(name);
  return noOutline(
    s
      ? new THREE.MeshStandardMaterial({ map: s.map, normalMap: s.normal ?? null, roughnessMap: s.rough ?? null, roughness: 0.95 / ROUGH_MEAN, metalness: 0 })
      : new THREE.MeshStandardMaterial({ color: fallback, roughness: 0.95, metalness: 0 }),
  );
}

const curve = (...pts: THREE.Vector3[]) => new THREE.CatmullRomCurve3(pts);
const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------------------
// The three trees of the village.

export interface Tree {
  wood: THREE.BufferGeometry;
  leaves: THREE.BufferGeometry;
}

/**
 * The crown of a cherry tree, around its centre (canopy-local): limbs rising from
 * the top of the trunk (`trunkTop` below the centre), forking into twigs, each twig
 * ending in a clump of blossom.
 */
export function sakuraCrown(r: Rng, radius: number, trunkTop: number): Tree {
  const wood: THREE.BufferGeometry[] = [];
  const clumps: Clump[] = [];
  const base = v3(0, -trunkTop, 0);
  const limbs = 5 + Math.floor(r() * 2);
  for (let i = 0; i < limbs; i++) {
    const a = (i / limbs) * Math.PI * 2 + r() * 0.8;
    const out = radius * (0.55 + r() * 0.3);
    const tip = v3(Math.cos(a) * out, (r() - 0.2) * radius * 0.45, Math.sin(a) * out);
    const mid = base.clone().lerp(tip, 0.45).add(v3((r() - 0.5) * 0.4, 0.35, (r() - 0.5) * 0.4));
    const limb = curve(base.clone().add(v3(0, 0.2 * i / limbs, 0)), mid, tip);
    wood.push(branch(limb, 0.13 * radius / 2.4, 0.04, 1.2, 8, 7));
    clumps.push({ c: tip.clone(), rad: v3(0.95, 0.7, 0.95).multiplyScalar(radius / 2.4 * (0.9 + r() * 0.35)), sway: 0.6 });
    for (let k = 0; k < 2; k++) {
      const from = limb.getPointAt(0.55 + r() * 0.2);
      const b = (r() - 0.5) * 1.6;
      const to = from.clone().add(v3(Math.cos(a + b) * radius * 0.4, 0.3 + r() * 0.6, Math.sin(a + b) * radius * 0.4));
      wood.push(branch(curve(from, from.clone().lerp(to, 0.5).add(v3(0, 0.15, 0)), to), 0.045, 0.015, 1.2, 5, 5));
      clumps.push({ c: to, rad: v3(0.75, 0.55, 0.75).multiplyScalar(radius / 2.4 * (0.85 + r() * 0.3)), sway: 0.8 });
    }
  }
  clumps.push({ c: v3(0, radius * 0.35, 0), rad: v3(1.1, 0.75, 1.1).multiplyScalar(radius / 2.4), sway: 0.5 });
  const leaves = cards(r, clumps, { density: 55, size: [0.45, 0.7], shell: 2.2, color: new THREE.Color("#ffffff"), tint: 0.12 });
  return { wood: mergeGeometries(wood), leaves };
}

/** A Japanese black pine: a leaning, twisting trunk and flat cloud-pruned pads. */
export function pineTree(r: Rng, s: number): Tree {
  const wood: THREE.BufferGeometry[] = [];
  const clumps: Clump[] = [];
  const lean = (r() - 0.5) * 0.9;
  const h = 4.6 * s;
  const trunk = curve(v3(0, 0, 0), v3(lean * 0.4, h * 0.35, 0.15), v3(lean * 1.1, h * 0.7, -0.1), v3(lean * 1.5, h, 0.1));
  wood.push(branch(trunk, 0.24 * s, 0.07, 1, 12, 9));
  const pads = 5;
  for (let k = 0; k < pads; k++) {
    const t = 0.42 + (k / (pads - 1)) * 0.5;
    const from = trunk.getPointAt(t);
    const a = k * 2.4 + r();
    const reach = (1.7 - t) * 1.3 * s;
    const to = from.clone().add(v3(Math.cos(a) * reach, 0.25 + r() * 0.3, Math.sin(a) * reach));
    wood.push(branch(curve(from, from.clone().lerp(to, 0.5).add(v3(0, -0.15, 0)), to), 0.09 * s, 0.03, 1, 6, 6));
    const w = (1.0 + (1 - t) * 1.3 + r() * 0.3) * s;
    clumps.push({ c: to.clone().add(v3(0, 0.15, 0)), rad: v3(w, 0.32 * s, w * (0.75 + r() * 0.25)), sway: 0.35 });
  }
  clumps.push({ c: trunk.getPointAt(1).add(v3(0, 0.2, 0)), rad: v3(0.9, 0.4, 0.8).multiplyScalar(s), sway: 0.4 });
  const leaves = cards(r, clumps, { density: 70, size: [0.4, 0.65], shell: 1.6, flat: 0.55, color: new THREE.Color("#ffffff"), tint: 0.1 });
  return { wood: mergeGeometries(wood), leaves };
}

/** A clump of bamboo: tall culms with nodes, side twigs and hanging leaves. */
export function bambooClump(r: Rng, s: number): Tree {
  const wood: THREE.BufferGeometry[] = [];
  const clumps: Clump[] = [];
  const n = 7;
  for (let k = 0; k < n; k++) {
    const hh = (5.2 + r() * 2.8) * s;
    const x = (r() - 0.5) * 1.3;
    const z = (r() - 0.5) * 1.3;
    const bend = v3(x * 0.5 + (r() - 0.5) * 0.4, 0, z * 0.5 + (r() - 0.5) * 0.4);
    const culm = curve(v3(x, 0, z), v3(x, hh * 0.5, z).addScaledVector(bend, 0.25), v3(x, hh, z).add(bend));
    wood.push(branch(culm, 0.055, 0.03, 1, 10, 7));
    // Nodes: a slight ring every 30 cm or so.
    for (let y = 0.3; y < 0.97; y += 0.3 / hh + 0.04) {
      const p = culm.getPointAt(y);
      const ring = new THREE.TorusGeometry(0.05 - y * 0.02, 0.008, 4, 8).rotateX(Math.PI / 2).translate(p.x, p.y, p.z);
      ring.deleteAttribute("uv");
      ring.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(ring.attributes.position!.count * 2), 2));
      wood.push(ring);
    }
    for (let t = 0.5; t < 0.98; t += 0.09) {
      const p = culm.getPointAt(t);
      const a = r() * Math.PI * 2;
      const to = p.clone().add(v3(Math.cos(a) * 0.45, 0.12, Math.sin(a) * 0.45));
      wood.push(branch(curve(p, to), 0.012, 0.006, 1, 2, 4));
      clumps.push({ c: to, rad: v3(0.42, 0.3, 0.42), sway: 0.9 });
    }
  }
  const leaves = cards(r, clumps, { density: 60, size: [0.38, 0.55], shell: 1.4, hang: true, color: new THREE.Color("#ffffff"), tint: 0.12 });
  return { wood: mergeGeometries(wood), leaves };
}

/**
 * Tufts of grass over the points given: two crossed upright cards each, rooted at
 * the ground (they sway at the tip only), lit as a lawn (normals mostly up).
 */
export function grassTufts(r: Rng, points: { x: number; z: number }[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  const col: number[] = [];
  const sw: number[] = [];
  const idx: number[] = [];
  const tint = new THREE.Color();
  for (const p of points) {
    const h = 0.16 + r() * 0.2;
    const w = 0.3 + r() * 0.16;
    const a0 = r() * Math.PI;
    const cell = Math.floor(r() * 4);
    const [u0, v0] = [(cell % 2) * 0.5, Math.floor(cell / 2) * 0.5];
    tint.setHSL(0.22 + r() * 0.06, 0.3 + r() * 0.2, 0.36 + r() * 0.12).multiplyScalar(1.5);
    for (const a of [a0, a0 + Math.PI / 2]) {
      const dx = (Math.cos(a) * w) / 2;
      const dz = (Math.sin(a) * w) / 2;
      const base = pos.length / 3;
      for (const [sx, sy] of [[-1, 0], [1, 0], [1, 1], [-1, 1]] as const) {
        pos.push(p.x + dx * sx, sy * h, p.z + dz * sx);
        // Up, leaning a little out of the card: soft, even light over the lawn.
        nor.push(-Math.sin(a) * 0.25, 1, Math.cos(a) * 0.25);
        uv.push(u0 + ((sx + 1) / 2) * 0.5, v0 + sy * 0.5);
        col.push(tint.r, tint.g, tint.b);
        sw.push(sy * 0.6);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("sway", new THREE.Float32BufferAttribute(sw, 1));
  g.setIndex(idx);
  return g;
}
