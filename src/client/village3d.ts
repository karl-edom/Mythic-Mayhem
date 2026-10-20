// The Japanese village, drawn: every solid piece of the arena (walls, floors, roofs,
// stairs, posts, lanterns…) keeps exactly the volume the simulation uses, dressed with
// the surfaces of villageTex.ts (UVs in metres, so a wall of any size shows
// boards of the right width); and the drawn-only decor (eaves, lattices, curtains,
// lanterns, signs, blossom, water, petals). Nothing here touches the simulation.

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { DecorPlacement, Prop } from "../brawl/arena.ts";
import { bambooClump, barkMaterial, branch, foliageMaterial, pineTree, sakuraCrown, windTime } from "./foliage.ts";
import { noOutline } from "./toon.ts";
import { ROUGH_MEAN, ashlar, boards, cloth, floorTexture, kawara, paintedPaving, paving, photo, planks, plaster, tatami, timber, type FloorPaint, type Surface } from "./villageTex.ts";

/** Looks drawn here (others go to props3d.ts). */
export const VILLAGE_LOOKS = new Set([
  "machiya-wall", "plaster-wall", "wood-floor", "tatami", "roof-tile", "roof-flat", "wood-stairs", "stone-terrace", "stone-stairs",
  "wood-post", "torii-post", "stone-lantern", "sakura", "bamboo-fence", "well", "wood-deck", "stall-counter", "bridge-arch", "bridge-deck",
]);

/** Something that moves by itself (cloth, water, petals). */
export type Animate = (t: number, dt: number) => void;

function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * UVs in metres from the geometry's own positions (plus `offset`, its place in the
 * world, so neighbouring pieces line up): each face takes the plane it faces most.
 */
function worldUV(geo: THREE.BufferGeometry, metres: number, offset = new THREE.Vector3()): THREE.BufferGeometry {
  const g = flat(geo);
  g.computeVertexNormals();
  const p = g.attributes.position!;
  const n = g.attributes.normal!;
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + offset.x;
    const y = p.getY(i) + offset.y;
    const z = p.getZ(i) + offset.z;
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    let u: number;
    let v: number;
    if (ay >= ax && ay >= az) [u, v] = [x, z];
    else if (ax >= az) [u, v] = [z, y];
    else [u, v] = [x, y];
    uv[i * 2] = u / metres;
    uv[i * 2 + 1] = v / metres;
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/**
 * A material of one surface, own copy (props fade and darken one at a time). The
 * colour multiplies the texture; with a roughness map, `roughness` stays the mean.
 */
function surf(s: Surface, color: THREE.ColorRepresentation, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  const roughness = opts.roughness ?? 0.85;
  return noOutline(
    new THREE.MeshStandardMaterial({
      color, map: s.map, normalMap: s.normal ?? null, normalScale: new THREE.Vector2(1, 1), metalness: 0, ...opts,
      roughnessMap: s.rough ?? null, roughness: s.rough ? roughness / ROUGH_MEAN : roughness,
    }),
  );
}
function plain(color: THREE.ColorRepresentation, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return noOutline(new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts }));
}

/**
 * Foliage: casts shadows but does not receive them (thousands of cards would shade
 * each other into a dark mass); the clump normals give it its volume.
 */
function leafMesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  const m = mesh(geo, mat);
  m.receiveShadow = false;
  return m;
}

/** The geometry without an index (merging needs them all alike). */
const flat = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/** A box from its bottom centre. */
function boxAt(w: number, h: number, d: number, x = 0, y = 0, z = 0): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return g;
}

/**
 * A slab under four top corners (in order round the quad), `thick` deep, as one
 * closed solid; its top UVs run `u` across and `v` down the slope, in metres.
 */
function slab(c: THREE.Vector3[], thick: number, metres: number): THREE.BufferGeometry {
  const top = c;
  const bot = c.map((p) => p.clone().add(new THREE.Vector3(0, -thick, 0)));
  const pos: number[] = [];
  const uv: number[] = [];
  const across = top[0]!.distanceTo(top[1]!);
  const along = top[1]!.distanceTo(top[2]!);
  const quad = (a: THREE.Vector3, b: THREE.Vector3, cc: THREE.Vector3, d: THREE.Vector3, uvq: number[][]) => {
    for (const [i, p] of [[0, a], [1, b], [2, cc], [0, a], [2, cc], [3, d]] as const) {
      pos.push(p.x, p.y, p.z);
      uv.push(uvq[i]![0]! / metres, uvq[i]![1]! / metres);
    }
  };
  const fullUV = [[0, along], [across, along], [across, 0], [0, 0]];
  quad(top[0]!, top[1]!, top[2]!, top[3]!, fullUV);
  quad(bot[3]!, bot[2]!, bot[1]!, bot[0]!, fullUV);
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const len = top[i]!.distanceTo(top[j]!);
    quad(bot[i]!, bot[j]!, top[j]!, top[i]!, [[0, 0], [len, 0], [len, thick], [0, thick]]);
  }
  // The corners may come round either way: turn the solid outward (its top facing up).
  const a = new THREE.Vector3(pos[0], pos[1], pos[2]);
  const b = new THREE.Vector3(pos[3], pos[4], pos[5]);
  const cc = new THREE.Vector3(pos[6], pos[7], pos[8]);
  if (b.clone().sub(a).cross(cc.clone().sub(b)).y < 0)
    for (let t = 0; t < pos.length; t += 9) {
      for (let k = 0; k < 3; k++) [pos[t + 3 + k], pos[t + 6 + k]] = [pos[t + 6 + k]!, pos[t + 3 + k]!];
      const u = (t / 9) * 6;
      for (let k = 0; k < 2; k++) [uv[u + 2 + k], uv[u + 4 + k]] = [uv[u + 4 + k]!, uv[u + 2 + k]!];
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/**
 * Kawara in relief over a roof slope (corners as for slab: c0 → c1 along the eave,
 * c3 above c0): rows of round tiles 25 cm apart over shallow pans, in courses that
 * step down the slope, lined up with the kawara texture (4 rows and 3 courses a
 * repeat); and, along the eave, a round end tile under each row.
 */
function kawaraRelief(c: THREE.Vector3[], metres: number): { tiles: THREE.BufferGeometry; ends: THREE.BufferGeometry } {
  const across = c[0]!.distanceTo(c[1]!);
  const along = c[0]!.distanceTo(c[3]!);
  const ax = c[1]!.clone().sub(c[0]!).normalize();
  const up = c[3]!.clone().sub(c[0]!).normalize();
  const n = ax.clone().cross(up).normalize();
  if (n.y < 0) n.negate();
  const pitch = metres / 4;
  const course = metres / 3;
  // Round tile over the middle of each row, a shallow pan between; never below the slab.
  const profile = (x: number) => 0.05 * Math.sqrt(Math.max(0, 1 - ((x - 0.5) / 0.22) ** 2)) + 0.015 * (1 - Math.cos(Math.PI * x) ** 2);
  // Each course stands proud at its lower end, over the top of the next one down.
  const lift = (sv: number) => 0.03 * (((along - sv) / course) % 1);
  const us: number[] = [];
  for (let u0 = 0; u0 < across; u0 += pitch) for (const f of [0, 0.15, 0.3, 0.5, 0.7, 0.85]) if (u0 + f * pitch < across) us.push(u0 + f * pitch);
  us.push(across);
  const ss = [0];
  for (let k = Math.floor(along / course); k >= 1; k--) {
    const sb = along - k * course;
    if (sb > 0.01) ss.push(sb - 0.004, sb + 0.004);
  }
  ss.push(along);
  const pos: number[] = [];
  const uv: number[] = [];
  for (const sv of ss)
    for (const u of us) {
      const h = 0.016 + profile((u / pitch) % 1) + lift(sv);
      const p = c[0]!.clone().addScaledVector(ax, u).addScaledVector(up, sv).addScaledVector(n, h);
      pos.push(p.x, p.y, p.z);
      uv.push(u / metres, (along - sv) / metres);
    }
  const idx: number[] = [];
  const row = us.length;
  for (let j = 0; j < ss.length - 1; j++)
    for (let i = 0; i < row - 1; i++) {
      const a = j * row + i;
      idx.push(a, a + 1, a + row + 1, a, a + row + 1, a + row);
    }
  const tiles = new THREE.BufferGeometry();
  tiles.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  tiles.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  tiles.setIndex(idx);
  tiles.computeVertexNormals();
  // Facing up: flip the winding if the grid came out upside down.
  if ((tiles.attributes.normal!.getY(0) ?? 1) < 0) {
    for (let t = 0; t < idx.length; t += 3) [idx[t + 1], idx[t + 2]] = [idx[t + 2]!, idx[t + 1]!];
    tiles.setIndex(idx);
    tiles.computeVertexNormals();
  }
  const ends: THREE.BufferGeometry[] = [];
  const turn = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
  for (let u = pitch / 2; u < across; u += pitch) {
    const disc = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 10).applyQuaternion(turn);
    const p = c[0]!.clone().addScaledVector(ax, u).addScaledVector(up, -0.015).addScaledVector(n, 0.016 + 0.05 + lift(0) - 0.01);
    ends.push(flat(disc.translate(p.x, p.y, p.z)));
  }
  return { tiles, ends: mergeGeometries(ends) };
}
/**
 * The four top corners of a ramp prop (local coordinates, centre of its footprint at
 * the origin, its bottom at y = 0): low edge first, going round.
 */
function rampCorners(p: Prop): THREE.Vector3[] {
  const r = p.rise!;
  const hw = p.halfW;
  const hd = p.halfD;
  const h = p.height;
  if (r.axis === "z") {
    const lo = -r.sign * hd;
    const hi = r.sign * hd;
    const pts = [new THREE.Vector3(-hw, 0, lo), new THREE.Vector3(hw, 0, lo), new THREE.Vector3(hw, h, hi), new THREE.Vector3(-hw, h, hi)];
    return r.sign > 0 ? pts : [pts[1]!, pts[0]!, pts[3]!, pts[2]!];
  }
  const lo = -r.sign * hw;
  const hi = r.sign * hw;
  const pts = [new THREE.Vector3(lo, 0, hd), new THREE.Vector3(lo, 0, -hd), new THREE.Vector3(hi, h, -hd), new THREE.Vector3(hi, h, hd)];
  return r.sign > 0 ? pts : [pts[1]!, pts[0]!, pts[3]!, pts[2]!];
}

/** Steps up a ramp's footprint: `n` treads, each a box from the floor (or `under` deep). */
function steps(p: Prop, n: number, under = Infinity): THREE.BufferGeometry {
  const r = p.rise!;
  const along = r.axis === "x" ? p.halfW * 2 : p.halfD * 2;
  const across = r.axis === "x" ? p.halfD * 2 : p.halfW * 2;
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const top = (p.height * (i + 1)) / n;
    const h = Math.min(top, under);
    const run = along / n;
    const c = -along / 2 + run * (i + 0.5);
    const g = r.axis === "x" ? boxAt(run, h, across, c * r.sign, top - h, 0) : boxAt(across, h, run, 0, top - h, c * r.sign);
    parts.push(flat(g));
  }
  return mergeGeometries(parts);
}

// ---------------------------------------------------------------------------
// Solid pieces.

/** Builds a village prop: its own group, local origin at the bottom centre of its footprint. */
export function buildVillageProp(p: Prop): THREE.Group {
  const g = new THREE.Group();
  const w = p.halfW * 2;
  const d = p.halfD * 2;
  const h = p.height;
  const at = new THREE.Vector3(p.x, p.base, p.z);
  const r = rand(p.id * 7919 + 13);
  switch (p.kind.look) {
    case "machiya-wall": {
      // Dark board cladding below, plaster above, a timber rail between, a cap beam on top.
      const lower = Math.min(h, h > 1.2 ? 0.95 : h);
      g.add(mesh(worldUV(boxAt(w, lower, d), boards().metres, at), surf(boards(), "#ffffff")));
      if (h > lower + 0.05) {
        g.add(mesh(worldUV(boxAt(w * 0.995, h - lower - 0.12, d * 0.96, 0, lower), plaster().metres, at), surf(plaster(), p.kind.color, { roughness: 0.95 })));
        g.add(mesh(worldUV(boxAt(w + 0.02, 0.1, d + 0.04, 0, lower - 0.02), 1, at), surf(timber(), "#6a4a32")));
        g.add(mesh(worldUV(boxAt(w + 0.02, 0.14, d + 0.06, 0, h - 0.14), 1, at), surf(timber(), "#5a3e2a")));
      }
      // Posts at both ends.
      for (const s of [-1, 1]) {
        const long = w >= d;
        const post = long ? boxAt(0.16, h, d + 0.06, s * (w / 2 - 0.08)) : boxAt(w + 0.06, h, 0.16, 0, 0, s * (d / 2 - 0.08));
        g.add(mesh(worldUV(post, 1, at), surf(timber(), "#5e4230")));
      }
      break;
    }
    case "plaster-wall": {
      const sill = h < 0.6;
      g.add(mesh(worldUV(boxAt(w, h, d), plaster().metres, at), surf(plaster(), sill ? "#cdb898" : p.kind.color, { roughness: 0.95 })));
      g.add(mesh(worldUV(boxAt(w + 0.02, Math.min(0.12, h), d + 0.05), 1, at), surf(timber(), "#5e4230")));
      if (!sill) {
        g.add(mesh(worldUV(boxAt(w + 0.02, 0.1, d + 0.05, 0, h - 0.1), 1, at), surf(timber(), "#5e4230")));
        const long = w >= d;
        const len = long ? w : d;
        const n = Math.max(1, Math.round(len / 1.8));
        for (let i = 0; i <= n; i++) {
          const t = -len / 2 + (len * i) / n;
          const c = Math.max(-len / 2 + 0.07, Math.min(len / 2 - 0.07, t));
          const post = long ? boxAt(0.13, h, d + 0.04, c) : boxAt(w + 0.04, h, 0.13, 0, 0, c);
          g.add(mesh(worldUV(post, 1, at), surf(timber(), "#5e4230")));
        }
      }
      break;
    }
    case "wood-floor":
    case "wood-deck":
    case "bridge-deck": {
      const red = p.kind.look === "bridge-deck";
      g.add(mesh(worldUV(boxAt(w, h, d), planks().metres, at), surf(planks(), red ? "#c9a27a" : "#ffffff")));
      if (red || p.base > 0.5) {
        // Edge beams (vermilion on a bridge).
        for (const s of [-1, 1]) {
          const beam = w >= d ? boxAt(w + 0.04, h + 0.06, 0.14, 0, -0.06, s * (d / 2 - 0.05)) : boxAt(0.14, h + 0.06, d + 0.04, s * (w / 2 - 0.05), -0.06);
          g.add(mesh(beam, red ? plain("#b8452c", { roughness: 0.5 }) : surf(timber(), "#5e4230")));
        }
      }
      break;
    }
    case "tatami": {
      g.add(mesh(worldUV(boxAt(w, h - 0.02, d), 1, at), surf(timber(), "#5a3e2a")));
      const top = new THREE.PlaneGeometry(w - 0.04, d - 0.04);
      top.rotateX(-Math.PI / 2);
      top.translate(0, h + 0.002, 0);
      g.add(mesh(worldUV(top, tatami().metres, at), surf(tatami(), "#ffffff", { roughness: 0.9 }), false));
      break;
    }
    case "roof-tile": {
      // A tiled slope with a little thickness, dark rafters under it, a bargeboard all round.
      const c = rampCorners(p);
      const th = 0.16;
      // Raise the tiles a hair so they cover the collision surface exactly.
      const top = c.map((v) => v.clone().add(new THREE.Vector3(0, 0.04, 0)));
      const tile = () => surf(kawara(), "#ffffff", { roughness: 0.55, metalness: 0.05, normalScale: new THREE.Vector2(0.35, 0.35) });
      g.add(mesh(slab(top, th, kawara().metres), tile()));
      // The tiles themselves in relief over it, and their round ends along the eave.
      const relief = kawaraRelief(top, kawara().metres);
      g.add(mesh(relief.tiles, tile()));
      if (relief.ends.attributes.position) g.add(mesh(relief.ends, plain("#454d59", { roughness: 0.45 })));
      const under = c.map((v) => v.clone().add(new THREE.Vector3(0, -th + 0.02, 0)));
      g.add(mesh(slab(under, 0.08, 1), surf(timber(), "#3e2c20")));
      // A thin lip along the low edge, under the end tiles.
      const lip = new THREE.CylinderGeometry(0.05, 0.05, c[0]!.distanceTo(c[1]!), 8);
      lip.rotateZ(Math.PI / 2);
      const mid = c[0]!.clone().add(c[1]!).multiplyScalar(0.5);
      const dir = c[1]!.clone().sub(c[0]!).normalize();
      lip.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir));
      lip.translate(mid.x, mid.y + 0.02, mid.z);
      g.add(mesh(lip, plain("#4a5260", { roughness: 0.5 })));
      break;
    }
    case "roof-flat": {
      g.add(mesh(worldUV(boxAt(w, h, d), 1, at), surf(timber(), "#6a4a32")));
      break;
    }
    case "wood-stairs": {
      const n = Math.max(3, Math.round(h / 0.21));
      g.add(mesh(worldUV(steps(p, n, 0.08), 1, at), surf(planks(), "#e8d0b0")));
      // Stringers along both sides.
      const c = rampCorners(p);
      for (const [a, b] of [[0, 3], [1, 2]] as const) {
        const s = c[b]!.clone().sub(c[a]!);
        const len = s.length();
        const geo = new THREE.BoxGeometry(0.08, 0.25, len);
        geo.lookAt(s);
        const m = c[a]!.clone().add(c[b]!).multiplyScalar(0.5);
        geo.translate(m.x, m.y - 0.1, m.z);
        g.add(mesh(geo, surf(timber(), "#5e4230")));
      }
      break;
    }
    case "stone-terrace": {
      g.add(mesh(worldUV(boxAt(w, h - 0.08, d), ashlar().metres, at), surf(ashlar(), "#ffffff", { roughness: 0.92 })));
      g.add(mesh(worldUV(boxAt(w + 0.12, 0.1, d + 0.12, 0, h - 0.1), paving().metres, at), surf(paving(), "#e6e0d2", { roughness: 0.9 })));
      break;
    }
    case "stone-stairs": {
      const n = Math.max(3, Math.round(p.height / 0.2));
      g.add(mesh(worldUV(steps(p, n), ashlar().metres, at), surf(ashlar(), "#ffffff", { roughness: 0.9 })));
      break;
    }
    case "bridge-arch": {
      const n = Math.max(4, Math.round(p.height / 0.15));
      g.add(mesh(worldUV(steps(p, n, 0.12), planks().metres, at), surf(planks(), "#d7b48c")));
      const c = rampCorners(p);
      for (const [a, b] of [[0, 3], [1, 2]] as const) {
        const s = c[b]!.clone().sub(c[a]!);
        const geo = new THREE.BoxGeometry(0.16, 0.3, s.length() + 0.1);
        geo.lookAt(s);
        const m = c[a]!.clone().add(c[b]!).multiplyScalar(0.5);
        geo.translate(m.x, m.y - 0.12, m.z);
        g.add(mesh(geo, plain("#b8452c", { roughness: 0.45 })));
      }
      break;
    }
    case "wood-post": {
      g.add(mesh(new THREE.CylinderGeometry(p.halfW * 0.92, p.halfW, h, 10).translate(0, h / 2, 0), surf(timber(), p.kind.color === "#6b4a32" ? "#7a5638" : p.kind.color)));
      g.add(mesh(new THREE.CylinderGeometry(p.halfW * 1.15, p.halfW * 1.25, 0.12, 10).translate(0, 0.06, 0), plain("#8e887c", { roughness: 0.95 })));
      break;
    }
    case "torii-post": {
      g.add(mesh(new THREE.CylinderGeometry(p.halfW * 0.9, p.halfW, h, 20).translate(0, h / 2, 0), plain("#c8321e", { roughness: 0.4 })));
      g.add(mesh(new THREE.CylinderGeometry(p.halfW * 1.12, p.halfW * 1.15, 0.5, 20).translate(0, 0.25, 0), plain("#1c1a1a", { roughness: 0.5 })));
      break;
    }
    case "stone-lantern": {
      // Tōrō: base, shaft, platform, the fire box (lit), a curved roof, a jewel on top.
      const stone = plain("#a8a296", { roughness: 0.95 });
      const s = h / 1.9;
      const parts: [THREE.BufferGeometry, number][] = [
        [new THREE.CylinderGeometry(0.42 * s, 0.46 * s, 0.18 * s, 6), 0.09],
        [new THREE.CylinderGeometry(0.13 * s, 0.16 * s, 0.6 * s, 10), 0.48],
        [new THREE.CylinderGeometry(0.34 * s, 0.24 * s, 0.14 * s, 6), 0.85],
        [new THREE.CylinderGeometry(0.21 * s, 0.21 * s, 0.34 * s, 6), 1.09],
        [new THREE.ConeGeometry(0.46 * s, 0.32 * s, 6), 1.42],
        [new THREE.SphereGeometry(0.08 * s, 10, 8), 1.66],
      ];
      for (const [geo, y] of parts) g.add(mesh(geo.translate(0, y * s, 0), stone));
      const fire = new THREE.Mesh(new THREE.CylinderGeometry(0.215 * s, 0.215 * s, 0.2 * s, 6, 1, true).translate(0, 1.09 * s, 0), noOutline(new THREE.MeshStandardMaterial({ color: "#ffd9a0", emissive: "#ff9a40", emissiveIntensity: 2.2, side: THREE.DoubleSide })));
      g.add(fire);
      break;
    }
    case "sakura": {
      // A gnarled trunk with a flared foot; the limbs and the blossom are the canopy (decor).
      const bark = barkMaterial("bark-sakura", "#5a3f33");
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.15, 1.2, 0.05), new THREE.Vector3(-0.1, 2.3, 0.1), new THREE.Vector3(0.05, h + 0.4, 0)]);
      g.add(mesh(branch(curve, p.halfW * 0.85, p.halfW * 0.5, 1.2, 12, 10), bark));
      g.add(mesh(branch(new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.5, 0)]), p.halfW * 1.35, p.halfW * 0.85, 1.2, 2, 10), bark));
      break;
    }
    case "bamboo-fence": {
      const long = w >= d;
      const len = long ? w : d;
      const n = Math.round(len / 0.09);
      const parts: THREE.BufferGeometry[] = [];
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + (len * (i + 0.5)) / n;
        const hh = h * (0.94 + r() * 0.06);
        const c = new THREE.CylinderGeometry(0.035, 0.04, hh, 6);
        c.translate(long ? t : 0, hh / 2, long ? 0 : t);
        parts.push(c);
      }
      for (const y of [0.35, h - 0.3]) {
        const rail = new THREE.CylinderGeometry(0.04, 0.04, len, 6);
        rail.rotateZ(Math.PI / 2);
        if (!long) rail.rotateY(Math.PI / 2);
        rail.translate(0, y, long ? 0.06 : 0);
        parts.push(rail);
      }
      g.add(mesh(mergeGeometries(parts.map(flat)), plain("#bba76c", { roughness: 0.6 })));
      break;
    }
    case "well": {
      const ring = new THREE.CylinderGeometry(p.halfW, p.halfW * 1.05, h, 18, 1, true);
      ring.translate(0, h / 2, 0);
      g.add(mesh(worldUV(ring, ashlar().metres, at), surf(ashlar(), "#ffffff", { side: THREE.DoubleSide })));
      g.add(mesh(new THREE.CircleGeometry(p.halfW * 0.92, 18).rotateX(-Math.PI / 2).translate(0, h * 0.6, 0), plain("#1d2a2c", { roughness: 0.2 })));
      // A little roof on two posts, a pulley.
      for (const s of [-1, 1]) g.add(mesh(boxAt(0.12, 2.1, 0.12, s * p.halfW * 0.9), surf(timber(), "#6a4a32")));
      const roof = new THREE.BoxGeometry(p.halfW * 2.6, 0.08, 1.1);
      for (const s of [-1, 1]) {
        const half = roof.clone();
        half.rotateX(s * 0.5);
        half.translate(0, 2.3, s * 0.23);
        g.add(mesh(half, plain("#4a5260", { roughness: 0.6 })));
      }
      g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12).rotateZ(Math.PI / 2).translate(0, 1.95, 0), plain("#3a2a20")));
      break;
    }
    case "stall-counter": {
      g.add(mesh(worldUV(boxAt(w, h, d), planks().metres, at), surf(planks(), "#b98d62")));
      // Goods: baskets of fruit and vegetables, a few jars.
      const fruit = ["#e2542c", "#f0a830", "#7cba3c", "#d8d0b0", "#9c3a5a"];
      for (let i = 0; i < Math.floor(w / 0.5); i++) {
        const x = -w / 2 + 0.3 + i * 0.5;
        g.add(mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.12, 10).translate(x, h + 0.06, 0), plain("#a8844e")));
        const col = fruit[Math.floor(r() * fruit.length)]!;
        for (let k = 0; k < 4; k++) g.add(mesh(new THREE.SphereGeometry(0.06, 8, 6).translate(x + (r() - 0.5) * 0.18, h + 0.15, (r() - 0.5) * 0.18), plain(col, { roughness: 0.6 })));
      }
      break;
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Decor.

export interface DecorContext {
  /** Drawn objects of the props, for decor that belongs to one (`on`). */
  props: THREE.Object3D[];
  animate: Animate[];
}

const textures = new Map<string, THREE.CanvasTexture>();
/** A painted sign board: dark wood, the shop's name in gold, written top to bottom. */
function signTexture(text: string): THREE.CanvasTexture {
  const hit = textures.get(text);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2b1d14";
  g.fillRect(0, 0, 256, 96);
  g.strokeStyle = "#8a6a3a";
  g.lineWidth = 6;
  g.strokeRect(5, 5, 246, 86);
  g.fillStyle = "#e8c66a";
  g.font = "bold 64px 'Hiragino Mincho ProN', 'Yu Mincho', serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 52);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  textures.set(text, t);
  return t;
}

/** A paper lantern: red, glowing, black caps, a tassel. */
function chochin(scale = 1, color = "#d23a24"): THREE.Group {
  const g = new THREE.Group();
  const body = new THREE.SphereGeometry(0.22 * scale, 16, 12);
  body.scale(1, 1.3, 1);
  g.add(new THREE.Mesh(body, noOutline(new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4, roughness: 0.7 }))));
  for (const s of [-1, 1]) g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.1 * scale, 0.12 * scale, 0.05 * scale, 12).translate(0, s * 0.27 * scale, 0), plain("#1a1414")));
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.005, 0.18 * scale, 6).translate(0, -0.38 * scale, 0), plain("#e8c040")));
  return g;
}

/** Rails of a balcony or a bridge: posts and two rails, `w` long along local x. */
function railing(w: number, h: number, color: string): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = Math.max(2, Math.round(w / 0.9));
  for (let i = 0; i <= n; i++) parts.push(flat(boxAt(0.07, h, 0.07, -w / 2 + (w * i) / n)));
  for (const y of [h - 0.05, h * 0.45]) parts.push(flat(boxAt(w, 0.06, 0.08, 0, y)));
  void color;
  return mergeGeometries(parts);
}

/**
 * Builds one decor item, in world coordinates (or in its prop's own frame when it
 * belongs to one: then it is added to that prop's object). Unknown looks: null.
 */
export function buildDecor(d: DecorPlacement, i: number, ctx: DecorContext): THREE.Object3D | null {
  const r = rand(i * 104729 + 7);
  const y = d.y ?? 0;
  const s = d.s ?? 1;
  const g = new THREE.Group();
  const look = d.look;
  if (look.startsWith("kanban-")) {
    const text = String.fromCodePoint(...look.slice(7).split("-").map((h) => parseInt(h, 16)));
    const w = d.w ?? 1.4;
    const h = d.h ?? 0.4;
    const board = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), [plain("#2b1d14"), plain("#2b1d14"), plain("#2b1d14"), plain("#2b1d14"), noOutline(new THREE.MeshStandardMaterial({ map: signTexture(text), roughness: 0.6 })), plain("#2b1d14")]);
    board.position.y = h / 2;
    board.castShadow = true;
    g.add(board);
  } else
    switch (look) {
      case "koshi": {
        // Lattice of thin vertical slats in a frame.
        const w = d.w ?? 2;
        const h = d.h ?? 1.7;
        const parts: THREE.BufferGeometry[] = [];
        const n = Math.round(w / 0.06);
        for (let k = 0; k < n; k++) parts.push(flat(boxAt(0.025, h, 0.035, -w / 2 + (w * (k + 0.5)) / n)));
        for (const yy of [0, h - 0.05, h * 0.5]) parts.push(flat(boxAt(w, 0.05, 0.05, 0, yy)));
        g.add(mesh(mergeGeometries(parts), surf(timber(), "#4e3624")));
        break;
      }
      case "noren": {
        // Shop curtain: three panels hanging from a rod, a white crest, swaying.
        const w = d.w ?? 2;
        const h = d.h ?? 0.9;
        const color = d.color ?? "#23395b";
        const panels: THREE.Mesh[] = [];
        for (let k = 0; k < 3; k++) {
          const pw = w / 3 - 0.03;
          const geo = new THREE.PlaneGeometry(pw, h, 4, 6);
          geo.translate(0, -h / 2, 0);
          const m = new THREE.Mesh(geo, noOutline(new THREE.MeshStandardMaterial({ color, map: cloth().map, roughness: 0.95, side: THREE.DoubleSide })));
          m.position.set(-w / 2 + (w * (k + 0.5)) / 3, 0, 0);
          m.castShadow = true;
          panels.push(m);
          g.add(m);
        }
        const crest = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.14, 24), plain("#f4efe2", { side: THREE.DoubleSide }));
        crest.position.set(0, -h * 0.45, 0.01);
        g.add(crest);
        g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, w + 0.2, 8).rotateZ(Math.PI / 2), plain("#3a2a20")));
        const ph = r() * 6;
        ctx.animate.push((t) => panels.forEach((m, k) => (m.rotation.x = Math.sin(t * 1.3 + ph + k * 0.7) * 0.06)));
        break;
      }
      case "chochin": {
        g.add(chochin(s));
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 4).translate(0, 0.42 * s, 0), plain("#2a2020"));
        g.add(rope);
        const ph = r() * 6;
        ctx.animate.push((t) => (g.rotation.z = Math.sin(t * 1.1 + ph) * 0.05));
        break;
      }
      case "lantern-string": {
        // A rope sagging across the street, five lanterns on it.
        const w = d.w ?? 8;
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 16; k++) {
          const t = k / 16;
          pts.push(new THREE.Vector3(-w / 2 + w * t, -0.6 * 4 * t * (1 - t), 0));
        }
        g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.012, 4), plain("#2a2020"), false));
        for (let k = 1; k <= 5; k++) {
          const t = k / 6;
          const l = chochin(0.75, k % 2 ? "#d23a24" : "#f2e0b0");
          l.position.set(-w / 2 + w * t, -0.6 * 4 * t * (1 - t) - 0.3, 0);
          g.add(l);
        }
        break;
      }
      case "rail": {
        g.add(mesh(railing(d.w ?? 2, d.h ?? 0.6, "#5e4230"), surf(timber(), "#5e4230")));
        break;
      }
      case "bridge-rail": {
        // Vermilion railing following the arch, with bronze-capped posts (giboshi).
        const w = d.w ?? 7;
        const parts: THREE.BufferGeometry[] = [];
        const hAt = (x: number) => 1.0 * Math.max(0, 1 - Math.abs(x) / (w / 2)) ** 0.6 + 0.0;
        const n = 8;
        for (let k = 0; k <= n; k++) {
          const x = -w / 2 + (w * k) / n;
          parts.push(flat(boxAt(0.1, 0.85, 0.1, x, hAt(x))));
        }
        const top: THREE.Vector3[] = [];
        for (let k = 0; k <= 20; k++) {
          const x = -w / 2 + (w * k) / 20;
          top.push(new THREE.Vector3(x, hAt(x) + 0.82, 0));
        }
        g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(top), 30, 0.05, 6), plain("#c8321e", { roughness: 0.4 })));
        g.add(mesh(mergeGeometries(parts), plain("#c8321e", { roughness: 0.4 })));
        for (const x of [-w / 2, w / 2]) g.add(mesh(new THREE.SphereGeometry(0.08, 10, 8).translate(x, hAt(x) + 0.95, 0), plain("#b08a3e", { metalness: 0.8, roughness: 0.35 })));
        break;
      }
      case "ridge": {
        // The ridge: a round cap along the top, demon tiles (onigawara) at both ends.
        const w = d.w ?? 6;
        g.add(mesh(new THREE.CylinderGeometry(0.17 * s, 0.17 * s, w, 12).rotateZ(Math.PI / 2).translate(0, 0.08 * s, 0), plain("#3e4652", { roughness: 0.45 })));
        g.add(mesh(boxAt(w, 0.16 * s, 0.26 * s, 0, -0.06 * s), plain("#555e6a", { roughness: 0.5 })));
        for (const sx of [-1, 1]) {
          const oni = new THREE.Mesh(new THREE.BoxGeometry(0.16 * s, 0.5 * s, 0.42 * s), plain("#3a414c", { roughness: 0.45 }));
          oni.position.set((sx * w) / 2, 0.18 * s, 0);
          oni.castShadow = true;
          g.add(oni);
        }
        break;
      }
      case "gable": {
        // Triangle of plaster under the roof's end, timber framed.
        const w = d.w ?? 6;
        const h = d.h ?? 1.5;
        const shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, h)]);
        const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: false });
        geo.translate(0, 0, -0.06);
        g.add(mesh(worldUV(geo, plaster().metres), surf(plaster(), d.color ?? "#efe6d2", { roughness: 0.95 })));
        g.add(mesh(boxAt(0.12, h, 0.16), surf(timber(), "#5e4230")));
        g.add(mesh(boxAt(w, 0.12, 0.16), surf(timber(), "#5e4230")));
        break;
      }
      case "beams": {
        // Beam ends showing under the eaves along both long sides.
        const w = d.w ?? 6;
        const dd = d.d ?? 6;
        const parts: THREE.BufferGeometry[] = [];
        const n = Math.round(w / 0.9);
        for (let k = 0; k <= n; k++)
          for (const sz of [-1, 1]) parts.push(flat(boxAt(0.12, 0.16, 0.5, -w / 2 + (w * k) / n, -0.02, (sz * dd) / 2)));
        g.add(mesh(mergeGeometries(parts), surf(timber(), "#4e3624")));
        break;
      }
      case "torii-top": {
        // Kasagi: a black beam, its ends swept up, over the shimaki; the vermilion nuki
        // below, the tablet between them.
        const w = d.w ?? 5;
        const span = w + 2.0;
        const path: THREE.Vector3[] = [];
        for (let k = 0; k <= 24; k++) {
          const t = k / 24 - 0.5;
          path.push(new THREE.Vector3(t * span, 0.3 + 0.45 * (t * 2) ** 4, 0));
        }
        const section = new THREE.Shape([new THREE.Vector2(-0.24, -0.15), new THREE.Vector2(0.24, -0.15), new THREE.Vector2(0.3, 0.15), new THREE.Vector2(-0.3, 0.15)]);
        const kasagi = new THREE.ExtrudeGeometry(section, { steps: 40, bevelEnabled: false, extrudePath: new THREE.CatmullRomCurve3(path) });
        g.add(mesh(kasagi, plain("#1f1b1b", { roughness: 0.45 })));
        g.add(mesh(boxAt(w + 1.5, 0.24, 0.4, 0, -0.04), plain("#c8321e", { roughness: 0.4 })));
        g.add(mesh(boxAt(w + 1.0, 0.24, 0.28, 0, -1.0), plain("#c8321e", { roughness: 0.4 })));
        g.add(mesh(boxAt(0.62, 0.8, 0.12, 0, -0.82), plain("#1f1b1b")));
        break;
      }
      case "shimenawa": {
        // Straw rope sagging between the hall posts, paper streamers (shide) hanging.
        const w = d.w ?? 7;
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= 16; k++) {
          const t = k / 16;
          pts.push(new THREE.Vector3(-w / 2 + w * t, -0.35 * 4 * t * (1 - t), 0));
        }
        g.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.12, 8), plain("#d8c48a", { roughness: 0.95 })));
        for (let k = 1; k < 6; k++) {
          const t = k / 6;
          const shide = new THREE.PlaneGeometry(0.16, 0.5);
          shide.translate(-w / 2 + w * t, -0.35 * 4 * t * (1 - t) - 0.38, 0.05);
          g.add(mesh(shide, plain("#ffffff", { side: THREE.DoubleSide }), false));
        }
        break;
      }
      case "offering-box": {
        g.add(mesh(worldUV(boxAt(1.6, 0.7, 0.8), 1), surf(timber(), "#6a4a32")));
        g.add(mesh(boxAt(1.64, 0.06, 0.84, 0, 0.7), plain("#b08a3e", { metalness: 0.7, roughness: 0.4 })));
        const rope = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8).translate(0, 1.9, -0.6);
        g.add(mesh(rope, plain("#c83a2a", { roughness: 0.8 })));
        g.add(mesh(new THREE.SphereGeometry(0.16, 12, 10).translate(0, 3.15, -0.6), plain("#c8a050", { metalness: 0.8, roughness: 0.3 })));
        break;
      }
      case "sakura-canopy": {
        // Limbs rising out of the trunk (its top is 0.6 m below the canopy's centre),
        // forking into twigs, each ending in a clump of blossom.
        const tree = sakuraCrown(r, 2.4 * s, 0.7);
        g.add(mesh(tree.wood, barkMaterial("bark-sakura", "#5a3f33")));
        g.add(leafMesh(tree.leaves, foliageMaterial("blossom")));
        ctx.animate.push((t) => (windTime.value = t));
        break;
      }
      case "pine": {
        // A Japanese black pine: a leaning trunk, flat cloud-pruned pads of needles.
        const tree = pineTree(r, s);
        g.add(mesh(tree.wood, barkMaterial("bark-pine", "#4d3a2e")));
        g.add(leafMesh(tree.leaves, foliageMaterial("needles")));
        ctx.animate.push((t) => (windTime.value = t));
        break;
      }
      case "bamboo": {
        const tree = bambooClump(r, s);
        g.add(mesh(tree.wood, plain("#8cae55", { roughness: 0.5 })));
        g.add(leafMesh(tree.leaves, foliageMaterial("bamboo")));
        ctx.animate.push((t) => (windTime.value = t));
        break;
      }
      case "nobori": {
        // A tall banner on a pole, fluttering.
        const h = d.h ?? 3.2;
        g.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, h, 6).translate(0, h / 2, 0), plain("#3a2a20")));
        const geo = new THREE.PlaneGeometry(0.5, h * 0.62, 2, 8);
        geo.translate(0.27, h * 0.6, 0);
        const flag = mesh(geo, noOutline(new THREE.MeshStandardMaterial({ color: d.color ?? "#c8321e", map: cloth().map, roughness: 0.9, side: THREE.DoubleSide })));
        g.add(flag);
        const ph = r() * 6;
        ctx.animate.push((t) => (flag.rotation.y = Math.sin(t * 2.1 + ph) * 0.15));
        break;
      }
      case "awning": {
        // Cloth over a stall, sagging a little, striped.
        const w = d.w ?? 3.6;
        const dd = d.d ?? 2.4;
        const geo = new THREE.PlaneGeometry(w + 0.2, dd + 0.2, 8, 6);
        geo.rotateX(-Math.PI / 2);
        const p = geo.attributes.position!;
        for (let k = 0; k < p.count; k++) p.setY(k, 0.18 - 0.12 * (1 - (2 * p.getX(k) / w) ** 2));
        geo.computeVertexNormals();
        g.add(mesh(geo, noOutline(new THREE.MeshStandardMaterial({ color: d.color ?? "#c8321e", map: cloth().map, roughness: 0.9, side: THREE.DoubleSide }))));
        break;
      }
      case "tower-roof": {
        const w = d.w ?? 4;
        const roof = new THREE.ConeGeometry(w * 0.75, 1.2, 4, 1);
        roof.rotateY(Math.PI / 4);
        roof.translate(0, 0.6, 0);
        g.add(mesh(roof, plain("#4a5260", { roughness: 0.55 })));
        for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) g.add(mesh(boxAt(0.1, 2.5, 0.1, (dx * w) / 2.6, -2.5, (dz * w) / 2.6), surf(timber(), "#5e4230")));
        break;
      }
      case "fire-bell": {
        g.add(mesh(new THREE.CylinderGeometry(0.14, 0.24, 0.42, 14).translate(0, -0.2, 0), plain("#7a6a3a", { metalness: 0.85, roughness: 0.35 })));
        break;
      }
      case "stepping-stone": {
        const st = new THREE.CylinderGeometry(0.42 * s, 0.48 * s, 0.22, 9);
        st.scale(1, 1, 0.8);
        st.translate(0, 0.08, 0);
        g.add(mesh(st, plain("#9c968a", { roughness: 0.9 })));
        break;
      }
      case "water": {
        // The stream: a moving surface, clear and green-blue, with sky reflections.
        const w = d.w ?? 10;
        const dd = d.d ?? 3;
        const geo = new THREE.PlaneGeometry(w, dd, 1, 1);
        geo.rotateX(-Math.PI / 2);
        const normal = paintedPaving().normal!.clone();
        normal.needsUpdate = true;
        normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
        normal.repeat.set(w / 2, dd / 2);
        const mat = noOutline(
          new THREE.MeshPhysicalMaterial({
            color: "#4b8a8a", roughness: 0.08, metalness: 0, transmission: 0, transparent: true, opacity: 0.72,
            normalMap: normal, normalScale: new THREE.Vector2(0.25, 0.25), clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2,
          }),
        );
        const m = new THREE.Mesh(geo, mat);
        m.receiveShadow = true;
        g.add(m);
        ctx.animate.push((t) => normal.offset.set(t * 0.05, t * 0.02));
        break;
      }
      case "petals": {
        // Petals drifting down over the village: one point cloud, each petal on its own path.
        const n = 420;
        const w = d.w ?? 60;
        const dd = d.d ?? 40;
        const pos = new Float32Array(n * 3);
        const seedv = new Float32Array(n);
        for (let k = 0; k < n; k++) {
          pos.set([(r() - 0.5) * w, r() * 9, (r() - 0.5) * dd], k * 3);
          seedv[k] = r() * 100;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const c = document.createElement("canvas");
        c.width = c.height = 32;
        const cg = c.getContext("2d")!;
        cg.fillStyle = "#ffd6e4";
        cg.beginPath();
        cg.ellipse(16, 16, 12, 7, 0.6, 0, Math.PI * 2);
        cg.fill();
        const tx = new THREE.CanvasTexture(c);
        tx.colorSpace = THREE.SRGBColorSpace;
        const pts = new THREE.Points(geo, noOutline(new THREE.PointsMaterial({ size: 0.13, map: tx, transparent: true, alphaTest: 0.3, color: "#ffffff", depthWrite: false })));
        pts.frustumCulled = false;
        g.add(pts);
        ctx.animate.push((t, dt) => {
          for (let k = 0; k < n; k++) {
            let py = pos[k * 3 + 1]! - dt * (0.45 + (seedv[k]! % 1) * 0.3);
            pos[k * 3] = pos[k * 3]! + Math.sin(t * 0.8 + seedv[k]!) * dt * 0.6 + dt * 0.25;
            pos[k * 3 + 2] = pos[k * 3 + 2]! + Math.cos(t * 0.6 + seedv[k]!) * dt * 0.4;
            if (py < 0) {
              py = 8 + (seedv[k]! % 3);
              pos[k * 3] = ((seedv[k]! * 37) % w) - w / 2;
            }
            if (pos[k * 3]! > w / 2) pos[k * 3] = -w / 2;
            pos[k * 3 + 1] = py;
          }
          geo.attributes.position!.needsUpdate = true;
        });
        break;
      }
      default:
        // Floor paint is drawn by villageFloor; unknown looks are skipped.
        return null;
    }
  // Placement: in its prop's frame if it belongs to one, else in the world.
  g.position.set(d.x, y, d.z);
  g.rotation.y = d.yaw ?? 0;
  if (d.on !== undefined && ctx.props[d.on]) {
    const host = ctx.props[d.on]!;
    host.updateMatrixWorld(true);
    host.worldToLocal(g.position);
    g.rotation.y -= host.rotation.y;
    host.add(g);
    return null;
  }
  return g;
}

/**
 * The village floor, painted from the arena's `paint-*` decor. Where the photo
 * surfaces loaded, paving, gravel and earth are theirs, tiled in metres and blended
 * by the floor's mask (grass, moss and the stream bed stay painted).
 */
export function villageFloor(width: number, depth: number, decor: DecorPlacement[]): THREE.Mesh {
  const paints: FloorPaint[] = decor
    .filter((d) => d.look.startsWith("paint-"))
    .map((d) => ({ kind: d.look.slice(6) as FloorPaint["kind"], x: d.x, z: d.z, w: d.w ?? 4, d: d.d ?? 4 }));
  const { map, normal, mask } = floorTexture(width, depth, paints);
  const geo = new THREE.PlaneGeometry(width, depth);
  geo.rotateX(-Math.PI / 2);
  const mat = noOutline(new THREE.MeshStandardMaterial({ map, normalMap: normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.92 }));
  splatFloor(mat, mask, width, depth);
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  m.position.y = 0.01;
  return m;
}

/** Blends the photo paving, gravel and earth into the painted floor (see villageFloor). */
function splatFloor(mat: THREE.MeshStandardMaterial, mask: THREE.Texture, width: number, depth: number): void {
  const layers = ["paving", "gravel", "dirt"].map(photo);
  if (!layers.some(Boolean)) return;
  // A missing layer keeps its share painted (its samplers then read the painted floor).
  const on = new THREE.Vector3(...layers.map((l) => (l ? 1 : 0)));
  const metres = new THREE.Vector3(...layers.map((l) => l?.metres ?? 1));
  const uniforms = {
    floorMask: { value: mask },
    floorSize: { value: new THREE.Vector2(width, depth) },
    floorOn: { value: on },
    floorMetres: { value: metres },
    ...Object.fromEntries(layers.flatMap((l, i) => [[`floorC${i}`, { value: l?.map ?? mat.map }], [`floorN${i}`, { value: l?.normal ?? mat.normalMap }]])),
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform sampler2D floorMask, floorC0, floorC1, floorC2, floorN0, floorN1, floorN2;
uniform vec2 floorSize;
uniform vec3 floorOn, floorMetres;`,
      )
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
vec3 floorW = texture2D( floorMask, vMapUv ).rgb * floorOn;
float floorPhoto = floorW.r + floorW.g + floorW.b;
vec2 floorM = vMapUv * floorSize;
diffuseColor.rgb = diffuseColor.rgb * ( 1.0 - floorPhoto )
  + texture2D( floorC0, floorM / floorMetres.x ).rgb * floorW.r
  + texture2D( floorC1, floorM / floorMetres.y ).rgb * floorW.g
  + texture2D( floorC2, floorM / floorMetres.z ).rgb * floorW.b;`,
      )
      .replace(
        "#include <normal_fragment_maps>",
        THREE.ShaderChunk.normal_fragment_maps.replace(
          "vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;",
          `vec3 mapN = ( texture2D( normalMap, vNormalMapUv ).xyz * ( 1.0 - floorPhoto )
      + texture2D( floorN0, floorM / floorMetres.x ).xyz * floorW.r
      + texture2D( floorN1, floorM / floorMetres.y ).xyz * floorW.g
      + texture2D( floorN2, floorM / floorMetres.z ).xyz * floorW.b ) * 2.0 - 1.0;`,
        ),
      );
  };
  mat.customProgramCacheKey = () => "village-floor-splat";
}
