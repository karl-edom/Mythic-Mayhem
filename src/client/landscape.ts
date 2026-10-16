// The land around the arena, built entirely in code (no model or image files):
// rolling hills dressed as a patchwork of fields with hedgerows, a winding river,
// woods and poplar lines, a walled town on a hill, soft clouds and aerial haze.
// Lit with standard (physically based) materials and flat-shaded facets, like a
// painted backdrop; the fighters stay cel-shaded in front of it.

import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Arena } from "../brawl/arena.ts";
import { noOutline } from "./toon.ts";

type Rng = () => number;

// ---------------------------------------------------------------------------
// Smooth value noise (deterministic), for hills and colour variation.

function hash(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const s = (t: number) => t * t * (3 - 2 * t);
  const a = hash(xi, yi, seed);
  const b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed);
  const d = hash(xi + 1, yi + 1, seed);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}

function fbm(x: number, y: number, seed: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise(x * f, y * f, seed + i * 17);
    amp *= 0.5;
    f *= 2.03;
  }
  return sum;
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------------
// The terrain: flat inside and around the arena, rising into hills further out.

export interface Land {
  /** Ground height at (x, z). */
  height(x: number, z: number): number;
  /** Distance to the river's centre line (metres). */
  river(x: number, z: number): number;
}

function makeLand(arena: Arena, seed: number): Land {
  const { halfW, halfD } = arena;
  const span = Math.max(halfW, halfD);
  // River: a gentle curve crossing the valley in front of one long side.
  const riverZ = (x: number) => halfD + span * 0.9 + Math.sin(x / (span * 0.9)) * span * 0.35 + Math.sin(x / (span * 0.31) + 1) * span * 0.08;
  const river = (x: number, z: number) => Math.abs(z - riverZ(x));
  const height = (x: number, z: number) => {
    // Distance outside the arena (with a flat margin for the walls and the near meadow).
    const dx = Math.max(0, Math.abs(x) - halfW - 6);
    const dz = Math.max(0, Math.abs(z) - halfD - 6);
    const out = Math.hypot(dx, dz);
    // A wide valley floor, gentle slopes, then real hills far away.
    const rise = smoothstep(span * 0.4, span * 3.2, out);
    const far = smoothstep(span * 4, span * 8, out);
    const hills = fbm(x / (span * 1.6), z / (span * 1.6), seed) * span * 0.55 + fbm(x / (span * 0.45), z / (span * 0.45), seed + 5, 3) * span * 0.08;
    let h = rise * (hills - span * 0.12) + far * fbm(x / (span * 2.5), z / (span * 2.5), seed + 11) * span * 1.6;
    // The river runs in a soft valley.
    const r = river(x, z);
    h -= (1 - smoothstep(4, 22, r)) * Math.max(0, h + 1.2);
    return h;
  };
  return { height, river };
}

/** Field grid: which field (cell) a point is in, and how close it is to a field edge (0 = on it). */
function fieldAt(x: number, z: number, scale = 1): { cu: number; cv: number; edge: number } {
  const ang = 0.35;
  const [ca, sa] = [Math.cos(ang), Math.sin(ang)];
  const u = (x * ca - z * sa) / (26 * scale);
  const v = (x * sa + z * ca) / (18 * scale) + Math.floor(u) * 0.37;
  const fu = u - Math.floor(u);
  const fv = v - Math.floor(v);
  return { cu: Math.floor(u), cv: Math.floor(v), edge: Math.min(fu, 1 - fu, fv, 1 - fv) };
}

// ---------------------------------------------------------------------------
// Palette (afternoon light, slightly desaturated so the fighters stand out).

const FIELD_COLORS = ["#7aa34e", "#8fb65a", "#a7bf63", "#d2bf6e", "#c9ad5f", "#9a8a5a", "#6e9748", "#b9c272"].map((c) => new THREE.Color(c));
const HEDGE = new THREE.Color("#4a6e34");
const MEADOW = new THREE.Color("#86b356");
const ROCK = new THREE.Color("#9c9787");
// Japan: rice paddies, some flooded (they mirror the sky), some green with young rice, on earth dikes.
const PADDY_COLORS = ["#86c05a", "#95c963", "#74b04f", "#a9cd6c", "#b4d1d6", "#7fae45", "#9cc45e", "#8bbd57"].map((c) => new THREE.Color(c));
const DIKE = new THREE.Color("#9a8a5e");

function buildTerrain(arena: Arena, land: Land, seed: number, japan: boolean): THREE.Mesh {
  const span = Math.max(arena.halfW, arena.halfD);
  const size = span * 18;
  const seg = 220;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position!;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  // Fields: cells of a slightly rotated grid, each with its own crop colour; hedges on the borders.
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = land.height(x, z);
    pos.setY(i, y);
    const f = fieldAt(x, z, japan ? 0.5 : 1);
    const palette = japan ? PADDY_COLORS : FIELD_COLORS;
    const cell = palette[Math.floor(hash(f.cu, f.cv, seed) * palette.length)]!;
    const border = f.edge;
    const nearArena = 1 - smoothstep(span * 0.35, span * 1.2, Math.hypot(Math.max(0, Math.abs(x) - arena.halfW), Math.max(0, Math.abs(z) - arena.halfD)));
    // Paddies only on the flat valley floor; slopes stay wooded grass.
    const flat = japan ? 1 - smoothstep(span * 0.15, span * 0.45, y) : 1;
    c.copy(MEADOW).lerp(cell, flat).lerp(MEADOW, nearArena);
    if (border < (japan ? 0.07 : 0.05) && nearArena < 0.5 && flat > 0.5) c.lerp(japan ? DIKE : HEDGE, 0.75);
    // Large-scale tone variation and rocky high ground.
    const tone = 0.88 + fbm(x / 30, z / 30, seed + 9, 3) * 0.24;
    c.multiplyScalar(tone);
    if (y > span * 0.75) c.lerp(ROCK, smoothstep(span * 0.75, span * 1.1, y) * 0.6);
    // River banks: darker, wetter grass.
    const r = land.river(x, z);
    if (r < 9) c.lerp(new THREE.Color("#5c7f45"), 1 - r / 9);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  // UVs in metres / 6 for a fine detail texture (grass speckle, furrows) multiplied over the colours.
  const uv = geo.attributes.uv!;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 6, pos.getZ(i) / 6);
  const mat = noOutline(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map: detailTexture() }));
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  m.position.y = -0.04;
  return m;
}

/** Neutral detail texture (around white): speckles and short strokes, so grass and soil have grain up close. */
function detailTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#e9e9e9";
  g.fillRect(0, 0, 256, 256);
  let s = 12345;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 2600; i++) {
    const v = 200 + Math.floor(r() * 55);
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 1 + r();
    const x = r() * 256;
    const y = r() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 3, y - 2 - r() * 5);
    g.stroke();
  }
  for (let i = 0; i < 400; i++) {
    const v = 170 + Math.floor(r() * 40);
    g.fillStyle = `rgba(${v},${v},${v},0.5)`;
    g.beginPath();
    g.arc(r() * 256, r() * 256, 2 + r() * 6, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function buildRiver(arena: Arena, land: Land): THREE.Mesh {
  const span = Math.max(arena.halfW, arena.halfD);
  const pts: number[] = [];
  const idx: number[] = [];
  const n = 260;
  const x0 = -span * 9;
  const x1 = span * 9;
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    // Find the centre line numerically (the curve the land carves).
    let best = 0;
    let bestD = Infinity;
    for (let z = arena.halfD; z < arena.halfD + span * 2; z += 0.5) {
      const d = land.river(x, z);
      if (d < bestD) [bestD, best] = [d, z];
    }
    const w = 5 + Math.sin(i * 0.21) * 1.2;
    const y = Math.min(land.height(x, best - w), land.height(x, best + w), land.height(x, best)) + 0.25;
    pts.push(x, y, best - w, x, y, best + w);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mat = noOutline(new THREE.MeshStandardMaterial({ color: "#5f8fb5", roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.92 }));
  return new THREE.Mesh(geo, mat);
}

// ---------------------------------------------------------------------------
// Vegetation: three tree shapes, built once, instanced by the hundred.

/** Lumpy, smooth-shaded version of a shape: shared vertices pushed about, normals recomputed. */
function jitter(geo: THREE.BufferGeometry, amount: number, r: Rng): THREE.BufferGeometry {
  const base = geo.clone();
  base.deleteAttribute("normal");
  if (base.attributes.uv) base.deleteAttribute("uv");
  const g = mergeVertices(base, 1e-4);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + (r() - 0.5) * amount, p.getY(i) + (r() - 0.5) * amount, p.getZ(i) + (r() - 0.5) * amount);
  g.computeVertexNormals();
  return g;
}

/**
 * Vertex colours: the base colour, lighter on top and darker underneath (foliage is
 * lit from above and self-shades), with a little noise. Returned non-indexed for merging.
 */
function paint(geo: THREE.BufferGeometry, color: THREE.Color, r: Rng, spread = 0.12): THREE.BufferGeometry {
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute("uv");
  const n = g.attributes.position!.count;
  const nor = g.attributes.normal!;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const k = (1 - spread + r() * spread * 2) * (0.78 + 0.32 * (nor.getY(i) * 0.5 + 0.5));
    col.set([color.r * k, color.g * k, color.b * k], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/** Broadleaf tree about 7 m tall: trunk, a few limbs, a crown of lumpy clusters. */
export function broadleafGeometry(r: Rng, leaf = new THREE.Color("#5f9a3e")): THREE.BufferGeometry {
  const bark = new THREE.Color("#6b4a32");
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.38, 3.2, 7);
  trunk.translate(0, 1.6, 0);
  parts.push(paint(jitter(trunk, 0.05, r), bark, r, 0.08));
  for (let i = 0; i < 3; i++) {
    const limb = new THREE.CylinderGeometry(0.08, 0.14, 1.8, 5);
    limb.translate(0, 0.9, 0);
    limb.rotateZ(0.7);
    limb.rotateY((i / 3) * Math.PI * 2 + r());
    limb.translate(0, 2.6, 0);
    parts.push(paint(limb, bark, r, 0.08));
  }
  for (let i = 0; i < 9; i++) {
    const rad = 1.1 + r() * 0.8;
    const blob = new THREE.IcosahedronGeometry(rad, 2);
    const a = r() * Math.PI * 2;
    const d = i === 0 ? 0 : 0.8 + r() * 1.1;
    blob.scale(1, 0.82, 1);
    blob.translate(Math.cos(a) * d, 4.2 + r() * 1.6 - d * 0.35, Math.sin(a) * d);
    parts.push(paint(jitter(blob, 0.25, r), leaf.clone().multiplyScalar(0.85 + r() * 0.3), r));
  }
  return mergeGeometries(parts)!;
}

/** Hedge bush: one lumpy mound, about 2 m. */
function bushGeometry(r: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const b = new THREE.IcosahedronGeometry(0.9 + r() * 0.4, 1);
    b.scale(1.3, 0.85, 1);
    b.translate((i - 1) * 0.9, 0.7, (r() - 0.5) * 0.4);
    parts.push(paint(jitter(b, 0.2, r), new THREE.Color("#4f7a36"), r));
  }
  return mergeGeometries(parts)!;
}

/** Lombardy poplar: tall and narrow, about 12 m. */
function poplarGeometry(r: Rng): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.12, 0.22, 2, 6);
  trunk.translate(0, 1, 0);
  const crown = new THREE.IcosahedronGeometry(1, 3);
  crown.scale(1.3, 5.2, 1.3);
  crown.translate(0, 6.8, 0);
  return mergeGeometries([paint(trunk, new THREE.Color("#5e4632"), r, 0.05), paint(jitter(crown, 0.35, r), new THREE.Color("#4f8a3a"), r)])!;
}

/** Pine: irregular stacked cones, about 9 m. */
function pineGeometry(r: Rng): THREE.BufferGeometry {
  const parts = [paint(new THREE.CylinderGeometry(0.14, 0.26, 2.4, 6).translate(0, 1.2, 0), new THREE.Color("#5a3f2b"), r, 0.05)];
  // (pine parts are all non-indexed and coloured, like the other trees)
  for (let i = 0; i < 4; i++) {
    const cone = new THREE.ConeGeometry(2.1 - i * 0.42, 2.8, 8);
    cone.translate(0, 2.6 + i * 1.55, 0);
    parts.push(paint(jitter(cone, 0.2, r), new THREE.Color("#3f6f3a"), r));
  }
  return mergeGeometries(parts)!;
}

function forest(
  geo: THREE.BufferGeometry,
  spots: { x: number; z: number; s: number }[],
  land: Land,
  r: Rng,
  shadows: boolean,
): THREE.InstancedMesh {
  const mat = noOutline(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  const inst = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const tint = new THREE.Color();
  spots.forEach((p, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * Math.PI * 2);
    m.compose(new THREE.Vector3(p.x, land.height(p.x, p.z) - 0.1, p.z), q, new THREE.Vector3(p.s, p.s * (0.9 + r() * 0.25), p.s));
    inst.setMatrixAt(i, m);
    // Each tree a little lighter, darker, yellower or bluer than the next.
    const k = 0.75 + r() * 0.4;
    const warm = r() * 0.25;
    inst.setColorAt(i, tint.setRGB(k * (0.92 + warm), k * (0.95 + warm * 0.4), k * (0.85 + r() * 0.15)));
  });
  inst.castShadow = shadows;
  inst.receiveShadow = true;
  return inst;
}

// ---------------------------------------------------------------------------
// A walled town on a hill: curtain wall, round towers with slate cones, red roofs, a spire.

function townGeometry(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: "#e6dcc4", roughness: 0.9, flatShading: true });
  const slate = new THREE.MeshStandardMaterial({ color: "#56637a", roughness: 0.7, flatShading: true });
  const tile = new THREE.MeshStandardMaterial({ color: "#b65a3c", roughness: 0.85, flatShading: true });
  const plaster = new THREE.MeshStandardMaterial({ color: "#efe3c8", roughness: 0.9, flatShading: true });
  for (const m of [stone, slate, tile, plaster]) noOutline(m);
  const ring = 46;
  const towers = 9;
  for (let i = 0; i < towers; i++) {
    const a0 = (i / towers) * Math.PI * 2;
    const a1 = ((i + 1) / towers) * Math.PI * 2;
    const p0 = new THREE.Vector3(Math.cos(a0) * ring, 0, Math.sin(a0) * ring * 0.7);
    const p1 = new THREE.Vector3(Math.cos(a1) * ring, 0, Math.sin(a1) * ring * 0.7);
    const len = p0.distanceTo(p1);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, 9, 2.4), stone);
    wall.position.copy(p0).add(p1).multiplyScalar(0.5).setY(4.5);
    wall.rotation.y = -Math.atan2(p1.z - p0.z, p1.x - p0.x);
    g.add(wall);
    const n = Math.floor(len / 2.2);
    for (let k = 0; k < n; k++) {
      const merlon = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 2.4), stone);
      merlon.position.copy(p0.clone().lerp(p1, (k + 0.5) / n)).setY(9.6);
      merlon.rotation.y = wall.rotation.y;
      g.add(merlon);
    }
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 15, 14), stone);
    tower.position.copy(p0).setY(7.5);
    g.add(tower);
    const hoard = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 2.2, 14), new THREE.MeshStandardMaterial({ color: "#7b5233", roughness: 0.9 }));
    noOutline(hoard.material as THREE.Material);
    hoard.position.copy(p0).setY(15.6);
    g.add(hoard);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.6, 8, 14), slate);
    roof.position.copy(p0).setY(20.7);
    g.add(roof);
  }
  // Houses inside: whitewashed walls, red tiled roofs.
  for (let i = 0; i < 70; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * (ring - 8);
    const w = 5 + r() * 4;
    const dd = 4 + r() * 3;
    const h = 5 + r() * 5;
    const house = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), plaster);
    body.position.y = h / 2;
    house.add(body);
    const roofGeo = new THREE.CylinderGeometry(0.01, dd * 0.75, w + 0.6, 4, 1);
    roofGeo.rotateZ(Math.PI / 2);
    roofGeo.rotateX(Math.PI / 4);
    const roof = new THREE.Mesh(roofGeo, tile);
    roof.scale.set(1, 0.9, 1);
    roof.position.y = h + dd * 0.35;
    house.add(roof);
    house.position.set(Math.cos(a) * d, 0, Math.sin(a) * d * 0.7);
    house.rotation.y = r() * Math.PI;
    g.add(house);
  }
  // Church with its spire.
  const nave = new THREE.Mesh(new THREE.BoxGeometry(18, 12, 8), stone);
  nave.position.set(-6, 6, 4);
  g.add(nave);
  const belfry = new THREE.Mesh(new THREE.BoxGeometry(6, 22, 6), stone);
  belfry.position.set(4, 11, 4);
  g.add(belfry);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(4.4, 16, 4), slate);
  spire.position.set(4, 30, 4);
  spire.rotation.y = Math.PI / 4;
  g.add(spire);
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return g;
}

// ---------------------------------------------------------------------------
// Japan: bamboo groves, cedars, cherry trees, a five-storey pagoda and temple halls on
// the hill, a vermilion bridge over the river, and a snow-capped volcano far away.

/** Bamboo clump: a dozen tall leaning canes with feathery tufts, about 11 m. */
function bambooGeometry(r: Rng): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const cane = new THREE.Color("#8fae4c");
  const leaf = new THREE.Color("#8cb850");
  for (let i = 0; i < 12; i++) {
    const h = 8 + r() * 4;
    const lean = new THREE.Euler((r() - 0.5) * 0.25, 0, (r() - 0.5) * 0.25);
    const base = new THREE.Vector3((r() - 0.5) * 2.4, 0, (r() - 0.5) * 2.4);
    const c = new THREE.CylinderGeometry(0.06, 0.09, h, 5);
    c.translate(0, h / 2, 0);
    c.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(lean));
    c.translate(base.x, 0, base.z);
    parts.push(paint(c, cane, r, 0.1));
    // Feathery foliage: many small leaf sprays along the upper half, hanging out sideways.
    for (let k = 0; k < 7; k++) {
      const t = 0.45 + (k / 7) * 0.55;
      const spray = new THREE.IcosahedronGeometry(0.45 + r() * 0.3, 1);
      spray.scale(1.6, 0.45, 0.9);
      spray.rotateY(r() * Math.PI * 2);
      const at = new THREE.Vector3(0, h * t, 0).applyEuler(lean).add(base);
      const a = r() * Math.PI * 2;
      const out = 0.5 + r() * 0.7;
      spray.translate(at.x + Math.cos(a) * out, at.y - 0.2, at.z + Math.sin(a) * out);
      parts.push(paint(jitter(spray, 0.12, r), leaf.clone().multiplyScalar(0.85 + r() * 0.3), r));
    }
  }
  return mergeGeometries(parts)!;
}

/** Japanese cedar: tall dark narrow cone, about 14 m. */
function cedarGeometry(r: Rng): THREE.BufferGeometry {
  const parts = [paint(new THREE.CylinderGeometry(0.16, 0.3, 4, 6).translate(0, 2, 0), new THREE.Color("#5b3b2a"), r, 0.05)];
  for (let i = 0; i < 5; i++) {
    const cone = new THREE.ConeGeometry(1.7 - i * 0.28, 3.2, 8);
    cone.translate(0, 4 + i * 2, 0);
    parts.push(paint(jitter(cone, 0.25, r), new THREE.Color("#355a35"), r));
  }
  return mergeGeometries(parts)!;
}

/** Roof with upturned corners: a flat pyramid whose eave corners lift. */
function eaveRoof(w: number, rise: number, mat: THREE.Material): THREE.Mesh {
  const geo = new THREE.ConeGeometry(w * 0.72, rise, 4, 2, true);
  geo.rotateY(Math.PI / 4);
  const p = geo.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < -rise / 2 + 1e-3) {
      // Corners flare up and out; mid-edges sag a little.
      const x = p.getX(i);
      const z = p.getZ(i);
      const corner = Math.min(1, (Math.abs(x) * Math.abs(z)) / ((w / 2) * (w / 2)));
      p.setY(i, y + corner * rise * 0.35);
    }
  }
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  return m;
}

function pagodaGroup(): THREE.Group {
  const g = new THREE.Group();
  const red = noOutline(new THREE.MeshStandardMaterial({ color: "#c2452f", roughness: 0.6 }));
  const plaster = noOutline(new THREE.MeshStandardMaterial({ color: "#efe6d4", roughness: 0.9 }));
  const roof = noOutline(new THREE.MeshStandardMaterial({ color: "#3d434d", roughness: 0.6, side: THREE.DoubleSide }));
  const gold = noOutline(new THREE.MeshStandardMaterial({ color: "#c9a548", roughness: 0.4, metalness: 0.6 }));
  const stone = noOutline(new THREE.MeshStandardMaterial({ color: "#b3ab9b", roughness: 0.95 }));
  const base = new THREE.Mesh(new THREE.BoxGeometry(14, 1.6, 14), stone);
  base.position.y = 0.8;
  g.add(base);
  let y = 1.6;
  for (let i = 0; i < 5; i++) {
    const w = 10 - i * 1.3;
    const h = i === 0 ? 4.2 : 3;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), i % 2 ? plaster : red);
    body.position.y = y + h / 2;
    g.add(body);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.3, w + 0.6), red);
    rail.position.y = y + 0.15;
    g.add(rail);
    const rf = eaveRoof(w * 1.75, 2.4, roof);
    rf.position.y = y + h + 0.9;
    g.add(rf);
    y += h + 1.1;
  }
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 9, 8), gold);
  spire.position.y = y + 4;
  g.add(spire);
  for (let k = 0; k < 7; k++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.12, 6, 12), gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y + 1.5 + k * 0.9;
    g.add(ring);
  }
  return g;
}

function templeHall(w: number, d: number, h: number): THREE.Group {
  const g = new THREE.Group();
  const wood = noOutline(new THREE.MeshStandardMaterial({ color: "#8a5b3a", roughness: 0.8 }));
  const red = noOutline(new THREE.MeshStandardMaterial({ color: "#c2452f", roughness: 0.6 }));
  const roof = noOutline(new THREE.MeshStandardMaterial({ color: "#3d434d", roughness: 0.6, side: THREE.DoubleSide }));
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wood);
  body.position.y = h / 2 + 1;
  g.add(body);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(w + 3, 1, d + 3), red);
  deck.position.y = 0.5;
  g.add(deck);
  const rf = eaveRoof(Math.max(w, d) * 1.6, h * 0.9, roof);
  rf.scale.set(1, 1, d / w);
  rf.position.y = h + 1 + h * 0.4;
  g.add(rf);
  return g;
}

/** Snow-capped volcano: a broad concave cone, fading blue with distance, snow on top. */
function volcano(radius: number, height: number, seed: number): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(radius * 0.08, radius, height, 96, 24, true);
  const p = geo.attributes.position!;
  const col = new Float32Array(p.count * 3);
  // Already hazed by distance (fog is off for it, so it can stand beyond the fog's end).
  const rock = new THREE.Color("#93a1bb");
  const snow = new THREE.Color("#f2f5fa");
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i) / height + 0.5; // 0 foot, 1 rim
    const a = Math.atan2(p.getZ(i), p.getX(i));
    // Concave profile: steep at the top, sweeping out at the foot.
    const prof = Math.pow(1 - y, 1.8);
    const rad = radius * (0.08 + 0.92 * prof);
    p.setXYZ(i, Math.cos(a) * rad, y * height, Math.sin(a) * rad);
    // Snow line with ragged gullies.
    const line = 0.62 + 0.08 * Math.sin(a * 9 + seed) + 0.05 * Math.sin(a * 23);
    c.copy(rock).lerp(snow, smoothstep(line, line + 0.04, y));
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = noOutline(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, fog: false }));
  return new THREE.Mesh(geo, mat);
}

/** Arched vermilion footbridge, `span` metres long, deck rising along X. */
function archBridge(span: number, width: number): THREE.Group {
  const g = new THREE.Group();
  const red = noOutline(new THREE.MeshStandardMaterial({ color: "#c94a31", roughness: 0.6 }));
  const deck = noOutline(new THREE.MeshStandardMaterial({ color: "#7d5a3c", roughness: 0.85 }));
  const n = 16;
  const arc = (t: number) => Math.sin(t * Math.PI) * span * 0.18;
  for (let i = 0; i < n; i++) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    const x0 = (t0 - 0.5) * span;
    const x1 = (t1 - 0.5) * span;
    const len = Math.hypot(x1 - x0, arc(t1) - arc(t0));
    const plank = new THREE.Mesh(new THREE.BoxGeometry(len + 0.05, 0.3, width), deck);
    plank.position.set((x0 + x1) / 2, (arc(t0) + arc(t1)) / 2, 0);
    plank.rotation.z = Math.atan2(arc(t1) - arc(t0), x1 - x0);
    g.add(plank);
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(len + 0.05, 0.18, 0.18), red);
      rail.position.set(plank.position.x, plank.position.y + 1.1, (s * width) / 2);
      rail.rotation.z = plank.rotation.z;
      g.add(rail);
      if (i % 2 === 0) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.2, 0.22), red);
        post.position.set(x0, arc(t0) + 0.6, (s * width) / 2);
        g.add(post);
      }
    }
  }
  return g;
}

/** The Japanese countryside around the shrine. */
function buildJapan(scene: THREE.Scene, arena: Arena, land: Land, r: Rng, free: (x: number, z: number, m: number) => boolean): void {
  const { halfW, halfD } = arena;
  const span = Math.max(halfW, halfD);
  const cedars: { x: number; z: number; s: number }[] = [];
  const sakura: { x: number; z: number; s: number }[] = [];
  const bamboo: { x: number; z: number; s: number }[] = [];
  // Hills: cedar forest high up, cherry trees and bamboo lower down.
  for (let i = 0; i < 50; i++) {
    const a = r() * Math.PI * 2;
    const d = span * (1.5 + r() * 5.5);
    const cx = Math.cos(a) * d;
    const cz = Math.sin(a) * d;
    const n = 6 + Math.floor(r() * 16);
    for (let k = 0; k < n; k++) {
      const x = cx + (r() - 0.5) * 22;
      const z = cz + (r() - 0.5) * 22;
      if (!free(x, z, 8)) continue;
      const h = land.height(x, z);
      if (h > span * 0.35) cedars.push({ x, z, s: 0.7 + r() * 0.5 });
      else if (h > span * 0.12) (r() < 0.5 ? bamboo : sakura).push({ x, z, s: 0.7 + r() * 0.4 });
    }
  }
  // Around the walls: cherry trees in bloom and bamboo groves.
  for (let i = 0; i < 80; i++) {
    const a = r() * Math.PI * 2;
    const x = Math.cos(a) * (halfW + 12 + r() * 30);
    const z = Math.sin(a) * (halfD + 12 + r() * 30);
    if (free(x, z, 10)) (r() < 0.55 ? sakura : bamboo).push({ x, z, s: 0.75 + r() * 0.35 });
  }
  scene.add(forest(cedarGeometry(r), cedars, land, r, false));
  scene.add(forest(broadleafGeometry(r, new THREE.Color("#f3b9cb")), sakura, land, r, true));
  scene.add(forest(bambooGeometry(r), bamboo, land, r, false));

  // Pagoda and temple halls on the hill beyond the river.
  const tx = -span * 3.2;
  const tz = span * 5.2;
  const temple = new THREE.Group();
  const pagoda = pagodaGroup();
  pagoda.position.set(-14, 0, 0);
  temple.add(pagoda);
  const hall = templeHall(22, 14, 8);
  hall.position.set(14, 0, -4);
  temple.add(hall);
  const gate = templeHall(10, 6, 5);
  gate.position.set(10, 0, 18);
  temple.add(gate);
  temple.position.set(tx, land.height(tx, tz) - 0.5, tz);
  temple.rotation.y = 0.5;
  temple.scale.setScalar(1.2);
  scene.add(temple);
  // A second pagoda on the other side, so one shows from every angle.
  const p2 = pagodaGroup();
  const px = span * 4.5;
  const pz = -span * 3.6;
  p2.position.set(px, land.height(px, pz) - 0.5, pz);
  p2.scale.setScalar(0.9);
  scene.add(p2);

  // Vermilion bridge over the river, just in front of the arena.
  let bz = halfD;
  let best = Infinity;
  for (let z = halfD; z < halfD + span * 2; z += 0.5) {
    const d = land.river(6, z);
    if (d < best) [best, bz] = [d, z];
  }
  const bridge = archBridge(18, 3);
  bridge.rotation.y = Math.PI / 2;
  bridge.position.set(6, land.height(6, bz) + 0.4, bz);
  scene.add(bridge);

  // The volcano on the horizon, behind the shrine.
  const v = volcano(span * 5, span * 2.6, 1);
  v.position.set(span * 2.5, -span * 0.5, -span * 9.5);
  scene.add(v);
}

// ---------------------------------------------------------------------------
// Sky: gradient with a warm glow toward the sun; soft layered clouds.

function skyDome(radius: number, sunDir: THREE.Vector3): THREE.Mesh {
  const mat = noOutline(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color("#5d9bd8") },
        horizon: { value: new THREE.Color("#dbe8ee") },
        glow: { value: new THREE.Color("#fff1d2") },
        sun: { value: sunDir.clone().normalize() },
      },
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 glow; uniform vec3 sun; varying vec3 vDir;
        void main(){
          float h = clamp(vDir.y, 0.0, 1.0);
          vec3 col = mix(horizon, top, pow(h, 0.45));
          float s = max(dot(vDir, sun), 0.0);
          col = mix(col, glow, pow(s, 6.0) * 0.55 + pow(s, 200.0) * 0.6);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  return new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), mat);
}

function cloudSprite(r: Rng): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  // Many soft puffs, lit from above, shaded underneath.
  for (let i = 0; i < 26; i++) {
    const x = 90 + r() * 330;
    const y = 120 + (r() - 0.5) * 70 - Math.sin(((x - 90) / 330) * Math.PI) * 40;
    const rad = 30 + r() * 55;
    const grad = g.createRadialGradient(x, y - rad * 0.3, rad * 0.1, x, y, rad);
    grad.addColorStop(0, "rgba(255,255,255,0.95)");
    grad.addColorStop(0.6, "rgba(246,248,252,0.75)");
    grad.addColorStop(1, "rgba(235,240,248,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  g.globalCompositeOperation = "source-atop";
  const shade = g.createLinearGradient(0, 90, 0, 220);
  shade.addColorStop(0, "rgba(255,255,255,0)");
  shade.addColorStop(1, "rgba(150,165,190,0.55)");
  g.fillStyle = shade;
  g.fillRect(0, 0, 512, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------

export interface LandscapeOptions {
  /** Wooded meadow around the ruins, or farmland around the village. */
  theme: "meadow" | "village" | "japan";
  seed: number;
}

/**
 * Builds everything outside the arena walls and returns the ground height function
 * (so other scenery can sit on it). Expects the sun direction for the sky glow.
 */
export function buildLandscape(scene: THREE.Scene, arena: Arena, sunDir: THREE.Vector3, opts: LandscapeOptions): Land {
  const { halfW, halfD } = arena;
  const span = Math.max(halfW, halfD);
  const r = (() => {
    let s = opts.seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  })();
  const land = makeLand(arena, opts.seed);

  const horizon = new THREE.Color("#dbe8ee");
  scene.background = horizon;
  // Aerial perspective: distant hills fade into the haze.
  scene.fog = new THREE.Fog(horizon, span * 1.8, span * 10);
  scene.add(skyDome(span * 12, sunDir));

  scene.add(buildTerrain(arena, land, opts.seed, opts.theme === "japan"));
  scene.add(buildRiver(arena, land));

  // Where trees may stand: outside the walls, off the river, sparse on the near meadow.
  const free = (x: number, z: number, margin: number) =>
    (Math.abs(x) > halfW + margin || Math.abs(z) > halfD + margin) && land.river(x, z) > 9;

  if (opts.theme === "japan") buildJapan(scene, arena, land, r, free);
  else {
    // Woods: clumps of broadleaf trees and pines on the hills.
    const broad: { x: number; z: number; s: number }[] = [];
    const pines: { x: number; z: number; s: number }[] = [];
    const clumps = opts.theme === "meadow" ? 46 : 30;
    for (let i = 0; i < clumps; i++) {
      const a = r() * Math.PI * 2;
      const d = span * (1.5 + r() * 5.5);
      const cx = Math.cos(a) * d;
      const cz = Math.sin(a) * d;
      const n = 6 + Math.floor(r() * 16);
      for (let k = 0; k < n; k++) {
        const x = cx + (r() - 0.5) * 22;
        const z = cz + (r() - 0.5) * 22;
        if (!free(x, z, 8)) continue;
        (land.height(x, z) > span * 0.5 && r() < 0.6 ? pines : broad).push({ x, z, s: 0.65 + r() * 0.45 });
      }
    }
    // A ring of trees just outside the walls, framing the arena.
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const x = Math.cos(a) * (halfW + 16 + r() * 30);
      const z = Math.sin(a) * (halfD + 16 + r() * 30);
      if (free(x, z, 12)) broad.push({ x, z, s: 0.7 + r() * 0.35 });
    }
    // Poplar lines along field edges and the river.
    const poplars: { x: number; z: number; s: number }[] = [];
    for (let line = 0; line < 7; line++) {
      const a = r() * Math.PI * 2;
      const d = span * (1.6 + r() * 4);
      const dir = r() * Math.PI;
      for (let k = 0; k < 9; k++) {
        const x = Math.cos(a) * d + Math.cos(dir) * k * 7;
        const z = Math.sin(a) * d + Math.sin(dir) * k * 7;
        if (free(x, z, 8)) poplars.push({ x, z, s: 0.85 + r() * 0.3 });
      }
    }
    // Hedgerows: bushes along the field edges, on the farmland beyond the near meadow.
    const bushes: { x: number; z: number; s: number }[] = [];
    for (let x = -span * 7; x < span * 7; x += 1.5)
      for (let z = -span * 7; z < span * 7; z += 1.5) {
        const out = Math.hypot(Math.max(0, Math.abs(x) - halfW), Math.max(0, Math.abs(z) - halfD));
        if (out < span * 1.1 || !free(x, z, 8)) continue;
        // Not every edge is hedged: some fields stay open.
        const f = fieldAt(x, z);
        if (f.edge < 0.03 && hash(f.cu, f.cv, opts.seed + 3) < 0.7) bushes.push({ x: x + (r() - 0.5) * 0.6, z: z + (r() - 0.5) * 0.6, s: 0.55 + r() * 0.5 });
      }
    scene.add(forest(bushGeometry(r), bushes, land, r, false));
    scene.add(forest(broadleafGeometry(r), broad, land, r, true));
    scene.add(forest(pineGeometry(r), pines, land, r, false));
    scene.add(forest(poplarGeometry(r), poplars, land, r, false));

    // The walled town on a hill, beyond the river.
    const town = townGeometry(r);
    const tx = -span * 3.2;
    const tz = span * 5.2;
    town.position.set(tx, land.height(tx, tz) - 1, tz);
    town.rotation.y = 0.4;
    town.scale.setScalar(opts.theme === "village" ? 1.1 : 0.9);
    scene.add(town);
  }

  // Clouds: big soft sprites high above, a few low wisps.
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(noOutline(new THREE.SpriteMaterial({ map: cloudSprite(r), transparent: true, depthWrite: false, fog: false, opacity: 0.95 })));
    const a = r() * Math.PI * 2;
    const dist = span * (3 + r() * 6);
    s.position.set(Math.cos(a) * dist, span * (1.6 + r() * 1.6), Math.sin(a) * dist);
    const w = span * (2.2 + r() * 2);
    s.scale.set(w, w * 0.45, 1);
    scene.add(s);
  }
  return land;
}
