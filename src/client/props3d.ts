// Arena props, built in code with real detail: coursed stone walls, fluted columns,
// mossy rocks, banded crates and staved barrels, timber-framed houses, a planked
// watchtower, stairs on stringers, and their Japanese counterparts (plaster walls
// with tiled caps, machiya, vermilion posts, bamboo fences, cherry trees).
// Every prop keeps exactly the footprint and height the simulation uses, and owns
// its materials (damage darkens them one prop at a time).

import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Prop } from "../brawl/arena.ts";
import { broadleafGeometry } from "./landscape.ts";
import { stoneTexture, woodTexture } from "./toon.ts";

export type Theme = "meadow" | "village" | "japan";

type Rng = () => number;

function rand(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const tex = { wood: null as THREE.Texture | null, stone: null as THREE.Texture | null };
const woodMap = () => (tex.wood ??= woodTexture("#d9b48a"));
const stoneMap = () => (tex.stone ??= stoneTexture("#d8d0bf"));

function std(color: THREE.ColorRepresentation, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts });
}

/** Material with a texture repeated `sx` × `sy` times. */
function mapped(color: THREE.ColorRepresentation, map: THREE.Texture, sx: number, sy: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  const t = map.clone();
  t.needsUpdate = true;
  t.repeat.set(sx, sy);
  return std(color, { map: t, ...opts });
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadows = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

/** Gives every vertex of `geo` one colour (for merged, vertex-coloured assemblies). */
function tint(geo: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute("uv");
  const n = g.attributes.position!.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * Coursed stonework filling a w × h × d box: staggered blocks of slightly varied size
 * and shade over a dark mortar core. `ruined` knocks out some top blocks.
 */
export function stonework(w: number, h: number, d: number, r: Rng, base = "#cfc6b2", ruined = false): THREE.Group {
  const g = new THREE.Group();
  const mortar = mesh(new THREE.BoxGeometry(w * 0.97, h * 0.98, d * 0.97), std("#6f685c"));
  mortar.position.y = (h * 0.98) / 2;
  g.add(mortar);
  const along = w >= d ? "x" : "z";
  const long = Math.max(w, d);
  const thick = Math.min(w, d);
  const rows = Math.max(1, Math.round(h / 0.42));
  const rowH = h / rows;
  const parts: THREE.BufferGeometry[] = [];
  const col = new THREE.Color();
  for (let row = 0; row < rows; row++) {
    let x = -long / 2 - (row % 2 ? 0.35 : 0);
    while (x < long / 2) {
      const len = Math.min(0.55 + r() * 0.6, long / 2 - x);
      if (len > 0.08) {
        const top = row === rows - 1;
        if (!(ruined && top && r() < 0.35)) {
          const bh = rowH * (0.9 + r() * 0.06);
          const box = new THREE.BoxGeometry(len - 0.04, bh, thick + 0.04 + r() * 0.03);
          const cx = Math.max(-long / 2 + len / 2, x + len / 2);
          if (along === "x") box.translate(cx, row * rowH + bh / 2, (r() - 0.5) * 0.02);
          else {
            box.rotateY(Math.PI / 2);
            box.translate((r() - 0.5) * 0.02, row * rowH + bh / 2, cx);
          }
          col.set(base).multiplyScalar(0.82 + r() * 0.3);
          if (row === 0) col.multiplyScalar(0.85); // damp at the foot
          parts.push(tint(box, col.clone()));
        }
      }
      x += len;
    }
  }
  g.add(mesh(mergeGeometries(parts)!, std("#ffffff", { vertexColors: true, roughness: 0.95 })));
  return g;
}

/** Lumpy smooth rock with moss on whatever faces up. */
function rockGeometry(w: number, h: number, d: number, r: Rng): THREE.BufferGeometry {
  const base = new THREE.IcosahedronGeometry(1, 3);
  base.deleteAttribute("normal");
  base.deleteAttribute("uv");
  const g = mergeVertices(base, 1e-4);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const k = 0.82 + r() * 0.3;
    p.setXYZ(i, p.getX(i) * k * (w / 2), Math.max(-0.05, p.getY(i) * k) * h * 0.55 + h * 0.42, p.getZ(i) * k * (d / 2));
  }
  g.computeVertexNormals();
  const nor = g.attributes.normal!;
  const col = new Float32Array(p.count * 3);
  const stone = new THREE.Color("#a8a397");
  const moss = new THREE.Color("#6f8f45");
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.copy(stone).multiplyScalar(0.85 + r() * 0.25);
    c.lerp(moss, Math.max(0, (nor.getY(i) - 0.55) / 0.45) * 0.85);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}

/** Gable roof prism, ridge along X, overhanging the given footprint. */
function gableRoof(w: number, d: number, rise: number, overhang = 0.5): THREE.BufferGeometry {
  const tri = new THREE.Shape([new THREE.Vector2(-d / 2 - overhang, 0), new THREE.Vector2(d / 2 + overhang, 0), new THREE.Vector2(0, rise)]);
  const geo = new THREE.ExtrudeGeometry(tri, { depth: w + overhang * 2, bevelEnabled: false });
  geo.translate(0, 0, -(w + overhang * 2) / 2);
  geo.rotateY(Math.PI / 2);
  return geo;
}

/** Tiles drawn on a canvas: rows of rounded tiles, for roofs. */
function tileTexture(base: string, dark: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  g.fillStyle = dark;
  g.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++) {
      const x = col * 16 + (row % 2) * 8;
      const grad = g.createLinearGradient(x, 0, x + 16, 0);
      grad.addColorStop(0, dark);
      grad.addColorStop(0.5, base);
      grad.addColorStop(1, dark);
      g.fillStyle = grad;
      g.beginPath();
      g.roundRect(x + 1, row * 16 + 1, 14, 15, 5);
      g.fill();
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

const roofTiles = { red: null as THREE.CanvasTexture | null, grey: null as THREE.CanvasTexture | null };
const redTiles = () => (roofTiles.red ??= tileTexture("#c4643f", "#8a3c26"));
const greyTiles = () => (roofTiles.grey ??= tileTexture("#6a7280", "#3c424d"));

export function buildProp(p: Prop, theme: Theme): THREE.Group {
  const g = new THREE.Group();
  const w = p.halfW * 2;
  const d = p.halfD * 2;
  const h = p.height;
  const r = rand(Math.round(p.x * 131 + p.z * 71) + 7);
  const japan = theme === "japan";
  const add = (m: THREE.Object3D, y = 0, x = 0, z = 0) => {
    m.position.set(x, y, z);
    g.add(m);
    return m;
  };
  const long = Math.max(w, d);
  const alongX = w >= d;

  if (p.rise) {
    // Ramps and stairs: the body is built rising along +X, then turned.
    const run = p.rise.axis === "x" ? w : d;
    const across = p.rise.axis === "x" ? d : w;
    const body = new THREE.Group();
    if (p.kind.look === "stairs") {
      const n = Math.max(3, Math.round(h / 0.25));
      const tread = mapped("#ffffff", woodMap(), 1, 0.3);
      for (let i = 0; i < n; i++) {
        const sh = (h * (i + 1)) / n;
        const step = mesh(new THREE.BoxGeometry(run / n + 0.04, 0.08, across), tread);
        step.position.set(-run / 2 + (run / n) * (i + 0.5), sh - 0.04, 0);
        body.add(step);
        const riser = mesh(new THREE.BoxGeometry(0.04, h / n, across - 0.1), std(japan ? "#3d2a1c" : "#6b4a2e"));
        riser.position.set(-run / 2 + (run / n) * i, sh - h / n / 2, 0);
        body.add(riser);
      }
      // Stringers: the two slanted beams the steps rest on.
      const len = Math.hypot(run, h);
      for (const side of [-1, 1]) {
        const s = mesh(new THREE.BoxGeometry(len, 0.3, 0.12), std(japan ? "#b8402c" : "#5e3f26"));
        s.rotation.z = Math.atan2(h, run);
        s.position.set(0, h / 2 - 0.1, (side * across) / 2);
        body.add(s);
      }
      // Fill underneath so it reads as solid (it is solid in the simulation).
      const under = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(run, 0), new THREE.Vector2(run, h)]);
      const ug = new THREE.ExtrudeGeometry(under, { depth: across - 0.2, bevelEnabled: false });
      ug.translate(-run / 2, -0.05, -(across - 0.2) / 2);
      body.add(mesh(ug, std(japan ? "#2e2620" : "#4a3828")));
    } else {
      // Stone ramp: blocks as courses along the slope, with a dressed top surface.
      const tri = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(run, 0), new THREE.Vector2(run, h)]);
      const geo = new THREE.ExtrudeGeometry(tri, { depth: across, bevelEnabled: false });
      geo.translate(-run / 2, 0, -across / 2);
      body.add(mesh(geo, mapped("#ffffff", stoneMap(), 0.45, 0.45)));
      const top = mesh(new THREE.BoxGeometry(Math.hypot(run, h), 0.12, across + 0.1), std("#bdb4a2", { roughness: 0.95 }));
      top.rotation.z = Math.atan2(h, run);
      top.position.y = h / 2 + 0.03;
      body.add(top);
    }
    body.rotation.y = p.rise.axis === "x" ? (p.rise.sign > 0 ? 0 : Math.PI) : p.rise.sign > 0 ? -Math.PI / 2 : Math.PI / 2;
    g.add(body);
    return g;
  }

  switch (p.kind.look) {
    case "tree": {
      const leaf = japan ? new THREE.Color("#f2b7c8") : new THREE.Color(p.kind.color).lerp(new THREE.Color("#5f9a3e"), 0.5);
      const tree = add(mesh(broadleafGeometry(r, leaf), std("#ffffff", { vertexColors: true, roughness: 0.9 })));
      tree.scale.set(1.1, h / 6.6, 1.1);
      tree.rotation.y = r() * Math.PI * 2;
      break;
    }
    case "rock":
      add(mesh(rockGeometry(w, h, d, r), std("#ffffff", { vertexColors: true, roughness: 0.95 }))).rotation.y = r() * Math.PI;
      break;
    case "crate": {
      add(mesh(new THREE.BoxGeometry(w * 0.96, h * 0.96, d * 0.96), mapped("#f2dcc0", woodMap(), 1, 1)), h / 2);
      // Frame on all twelve edges, and a diagonal brace on each side.
      const frame = std("#6e4524");
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) add(mesh(new THREE.BoxGeometry(0.1, h, 0.1), frame), h / 2, (sx * w) / 2 - sx * 0.05, (sz * d) / 2 - sz * 0.05);
      for (const y of [0.05, h - 0.05]) {
        for (const s of [-1, 1]) {
          add(mesh(new THREE.BoxGeometry(w, 0.1, 0.1), frame), y, 0, (s * d) / 2 - s * 0.05);
          add(mesh(new THREE.BoxGeometry(0.1, 0.1, d), frame), y, (s * w) / 2 - s * 0.05, 0);
        }
      }
      for (const s of [-1, 1]) {
        const brace = add(mesh(new THREE.BoxGeometry(Math.hypot(w, h) * 0.9, 0.09, 0.05), frame), h / 2, 0, (s * d) / 2);
        brace.rotation.z = Math.atan2(h, w) * s;
      }
      break;
    }
    case "barrel": {
      // Staves bulging at the middle, three iron hoops.
      const pts = Array.from({ length: 13 }, (_, i) => {
        const t = i / 12;
        return new THREE.Vector2(p.halfW * (0.8 + 0.2 * Math.sin(t * Math.PI)), t * h);
      });
      add(mesh(new THREE.LatheGeometry(pts, 20), mapped(japan ? "#e8d6a8" : "#c98f5f", woodMap(), 3, 1)));
      const hoop = std(japan ? "#4d6b3a" : "#3e3c3a", { metalness: japan ? 0 : 0.5, roughness: 0.5 });
      for (const t of [0.12, 0.5, 0.88]) {
        const rad = p.halfW * (0.8 + 0.2 * Math.sin(t * Math.PI)) + 0.012;
        add(mesh(new THREE.CylinderGeometry(rad, rad, 0.07, 20, 1, true), hoop, false), t * h);
      }
      add(mesh(new THREE.CircleGeometry(p.halfW * 0.8, 20).rotateX(-Math.PI / 2), mapped("#b98250", woodMap(), 1, 1)), h - 0.01);
      break;
    }
    case "fence": {
      if (japan) {
        // Bamboo fence: close vertical canes, two lashed rails.
        const cane = std("#c9b46a", { roughness: 0.6 });
        const n = Math.round(long / 0.12);
        for (let i = 0; i < n; i++) {
          const along = -long / 2 + (long * (i + 0.5)) / n;
          const c = mesh(new THREE.CylinderGeometry(0.05, 0.05, h * (0.95 + r() * 0.08), 6), cane);
          c.position.set(alongX ? along : 0, h / 2, alongX ? 0 : along);
          g.add(c);
        }
        for (const y of [h * 0.3, h * 0.75]) add(mesh(new THREE.BoxGeometry(alongX ? long : 0.14, 0.06, alongX ? 0.14 : long), std("#5b3d23")), y);
      } else {
        const wood = std("#a07a50");
        const n = Math.max(2, Math.round(long / 1.2));
        for (let i = 0; i <= n; i++) {
          const along = -long / 2 + (long * i) / n;
          const post = mesh(new THREE.CylinderGeometry(0.07, 0.09, h * 1.05, 6), wood);
          post.position.set(alongX ? along : 0, h / 2, alongX ? 0 : along);
          post.rotation.set((r() - 0.5) * 0.08, 0, (r() - 0.5) * 0.08);
          g.add(post);
        }
        for (const y of [h * 0.35, h * 0.8]) {
          const rail = add(mesh(new THREE.BoxGeometry(alongX ? long : 0.07, 0.1, alongX ? 0.07 : long), wood), y);
          rail.rotation.set(0, 0, (r() - 0.5) * 0.04);
        }
      }
      break;
    }
    case "pillar": {
      if (japan) {
        // Vermilion post on a black lacquered foot, with a cap: a torii's leg.
        add(mesh(new THREE.CylinderGeometry(p.halfW * 0.55, p.halfW * 0.6, h, 20), std("#d2452f", { roughness: 0.5 })), h / 2);
        add(mesh(new THREE.CylinderGeometry(p.halfW * 0.7, p.halfW * 0.75, 0.5, 20), std("#1f1b1b", { roughness: 0.4 })), 0.25);
        add(mesh(new THREE.BoxGeometry(w * 1.1, 0.3, d * 1.1), std("#1f1b1b", { roughness: 0.4 })), h - 0.15);
        break;
      }
      // Ruined column: plinth, fluted shaft, capital, broken top.
      const marble = std("#e5ddc9", { roughness: 0.75 });
      add(mesh(new THREE.BoxGeometry(w, 0.35, d), marble), 0.175);
      add(mesh(new THREE.CylinderGeometry(p.halfW * 0.86, p.halfW * 0.9, 0.2, 24), marble), 0.45);
      const shaft = new THREE.CylinderGeometry(p.halfW * 0.68, p.halfW * 0.74, h - 1.0, 24, 4);
      const sp = shaft.attributes.position!;
      for (let i = 0; i < sp.count; i++) {
        // Flutes: shallow grooves around the shaft.
        const a = Math.atan2(sp.getZ(i), sp.getX(i));
        const k = 1 - 0.05 * Math.max(0, Math.cos(a * 12));
        sp.setXYZ(i, sp.getX(i) * k, sp.getY(i), sp.getZ(i) * k);
      }
      shaft.computeVertexNormals();
      add(mesh(shaft, marble), 0.55 + (h - 1.0) / 2);
      const cap = add(mesh(new THREE.CylinderGeometry(p.halfW * 0.95, p.halfW * 0.72, 0.3, 24), marble), h - 0.3);
      cap.rotation.z = (r() - 0.5) * 0.08;
      add(mesh(new THREE.BoxGeometry(w * 0.98, 0.16, d * 0.98), marble), h - 0.08);
      break;
    }
    case "wall": {
      if (japan) {
        // Dobei: white plaster on a dark timber skirt, under a little tiled roof.
        add(mesh(new THREE.BoxGeometry(w, h * 0.75, d), std("#f1ebdf", { roughness: 0.95 })), (h * 0.75) / 2);
        add(mesh(new THREE.BoxGeometry(w + 0.02, h * 0.28, d + 0.02), mapped("#5a4636", woodMap(), long / 2, 1)), h * 0.14);
        const roof = mesh(gableRoof(alongX ? long : d, alongX ? d : long, 0.35, 0.25), mapped("#ffffff", greyTiles(), long / 1.2, 0.5));
        if (!alongX) roof.rotation.y = Math.PI / 2;
        add(roof, h * 0.75);
        break;
      }
      add(stonework(w, h, d, r, "#d2c9b4", true));
      break;
    }
    case "house": {
      if (japan) {
        // Machiya: dark timber lattice front, white plaster sides, grey tiled roof, low eaves.
        const wallH = h * 0.58;
        add(mesh(new THREE.BoxGeometry(w, wallH, d), std("#efe7d6", { roughness: 0.95 })), wallH / 2);
        const lattice = std("#3b2a1e", { roughness: 0.7 });
        for (const side of [-1, 1]) {
          for (let i = 0; i < Math.round(w / 0.18); i++) {
            add(mesh(new THREE.BoxGeometry(0.05, wallH * 0.7, 0.05), lattice), wallH * 0.4, -w / 2 + 0.1 + i * 0.18, (side * d) / 2 + side * 0.03);
          }
          add(mesh(new THREE.BoxGeometry(w + 0.1, 0.18, 0.12), lattice), wallH * 0.78, 0, (side * d) / 2 + side * 0.05);
        }
        for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) add(mesh(new THREE.BoxGeometry(0.22, wallH, 0.22), lattice), wallH / 2, (x * w) / 2, (z * d) / 2);
        const roof = mesh(gableRoof(w, d, h - wallH, 0.8), mapped("#ffffff", greyTiles(), w / 1.2, 2));
        add(roof, wallH);
        add(mesh(new THREE.BoxGeometry(w + 1.7, 0.16, 0.2), std("#2c2f36")), h - 0.04);
        break;
      }
      // Timber-framed house: plaster panels, dark posts, braces and beams, tiled roof, chimney.
      const wallH = h * 0.6;
      add(mesh(new THREE.BoxGeometry(w, 0.5, d), mapped("#ffffff", stoneMap(), w / 2, 0.3)), 0.25);
      add(mesh(new THREE.BoxGeometry(w * 0.99, wallH - 0.5, d * 0.99), std("#f3e7cf", { roughness: 0.95 })), 0.5 + (wallH - 0.5) / 2);
      const beam = std("#5c3b24", { roughness: 0.8 });
      for (const side of [-1, 1]) {
        for (let i = 0; i <= Math.round(w / 1.4); i++) {
          const x = -w / 2 + (w * i) / Math.round(w / 1.4);
          add(mesh(new THREE.BoxGeometry(0.2, wallH - 0.5, 0.06), beam), 0.5 + (wallH - 0.5) / 2, x, (side * d) / 2 + side * 0.03);
        }
        for (const y of [0.55, wallH * 0.62, wallH - 0.08]) add(mesh(new THREE.BoxGeometry(w + 0.05, 0.16, 0.07), beam), y, 0, (side * d) / 2 + side * 0.035);
        for (let i = 0; i < Math.round(w / 1.4); i++) {
          const x0 = -w / 2 + (w * (i + 0.5)) / Math.round(w / 1.4);
          const brace = add(mesh(new THREE.BoxGeometry(1.2, 0.12, 0.05), beam), wallH * 0.38, x0, (side * d) / 2 + side * 0.04);
          brace.rotation.z = (i % 2 ? 1 : -1) * 0.55;
        }
        for (const x of [-w / 3, w / 3]) {
          add(mesh(new THREE.BoxGeometry(0.9, 0.8, 0.06), std("#3e5a6e", { roughness: 0.2, metalness: 0.2 })), wallH * 0.8, x, (side * d) / 2 + side * 0.04);
          add(mesh(new THREE.BoxGeometry(1.05, 0.1, 0.18), beam), wallH * 0.8 - 0.45, x, (side * d) / 2 + side * 0.08);
        }
      }
      add(mesh(new THREE.BoxGeometry(1.1, 1.9, 0.08), std("#6b4428")), 1.45, 0, d / 2 + 0.05);
      add(mesh(gableRoof(w, d, h - wallH, 0.55), mapped("#ffffff", redTiles(), w / 1.1, 2)), wallH);
      add(mesh(new THREE.BoxGeometry(0.7, 1.6, 0.7), mapped("#ffffff", stoneMap(), 0.5, 1)), h - 0.2, w * 0.28, -d * 0.12);
      break;
    }
    case "platform": {
      if (japan) {
        // Ishigaki: battered stone base, a plastered parapet line on top.
        add(stonework(w, h - 0.25, d, r, "#b7b1a4"));
        add(mesh(new THREE.BoxGeometry(w + 0.1, 0.25, d + 0.1), std("#e9e3d6")), h - 0.125);
        break;
      }
      add(stonework(w, h - 0.2, d, r, "#d0c7b2"));
      add(mesh(new THREE.BoxGeometry(w + 0.2, 0.2, d + 0.2), std("#e2d9c4", { roughness: 0.9 })), h - 0.1);
      break;
    }
    case "terrace": {
      // A wooden stage: deck planks over posts and skirting, a low rail on the back edge.
      add(mesh(new THREE.BoxGeometry(w, h - 0.15, d), mapped("#ffffff", woodMap(), w / 1.5, h / 1.5, { color: japan ? "#8a6648" : "#c39a6c" })), (h - 0.15) / 2);
      add(mesh(new THREE.BoxGeometry(w + 0.15, 0.15, d + 0.15), mapped("#ffffff", woodMap(), w / 0.8, 1, { color: japan ? "#b48a63" : "#d9b48a" })), h - 0.075);
      const post = std(japan ? "#b8402c" : "#6b4a2e");
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(mesh(new THREE.BoxGeometry(0.25, h, 0.25), post), h / 2, (sx * w) / 2, (sz * d) / 2);
      break;
    }
    case "tower": {
      // Watchtower (yagura in Japan): planked or plastered body, corner posts, cross braces, a rail around the top.
      const body = japan ? std("#efe7d6", { roughness: 0.95 }) : mapped("#ffffff", woodMap(), w / 1.2, h / 1.2, { color: "#c9a27a" });
      add(mesh(new THREE.BoxGeometry(w * 0.98, h, d * 0.98), body), h / 2);
      const beam = std(japan ? "#3b2a1e" : "#5e3f26");
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) add(mesh(new THREE.BoxGeometry(0.32, h, 0.32), beam), h / 2, (x * w) / 2, (z * d) / 2);
      for (const side of [-1, 1]) {
        for (const [face, rot] of [["x", 0], ["z", Math.PI / 2]] as const) {
          const brace = mesh(new THREE.BoxGeometry(Math.hypot(w, h) * 0.95, 0.16, 0.08), beam);
          brace.rotation.z = Math.atan2(h, w) * side;
          brace.rotation.y = rot;
          if (face === "x") add(brace, h / 2, 0, (side * d) / 2 + side * 0.05);
          else add(brace, h / 2, (side * w) / 2 + side * 0.05, 0);
        }
      }
      add(mesh(new THREE.BoxGeometry(w + 0.3, 0.16, d + 0.3), beam), h - 0.08);
      // Top rail (posts and handrail) that fighters stand behind.
      for (const s of [-1, 1]) {
        add(mesh(new THREE.BoxGeometry(w + 0.3, 0.08, 0.08), beam), h + 0.75, 0, (s * (d + 0.3)) / 2);
        add(mesh(new THREE.BoxGeometry(0.08, 0.08, d + 0.3), beam), h + 0.75, (s * (w + 0.3)) / 2, 0);
      }
      for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) add(mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), beam), h + 0.4, (x * (w + 0.3)) / 2, (z * (d + 0.3)) / 2);
      break;
    }
    case "lantern": {
      // Tōrō: stone lantern (Japan), or a lamp post elsewhere.
      const stone = std("#a7a296", { roughness: 0.95 });
      add(mesh(new THREE.CylinderGeometry(w * 0.45, w * 0.5, 0.2, 6), stone), 0.1);
      add(mesh(new THREE.CylinderGeometry(w * 0.16, w * 0.2, h * 0.45, 8), stone), 0.2 + h * 0.225);
      add(mesh(new THREE.BoxGeometry(w * 0.6, 0.12, w * 0.6), stone), h * 0.66);
      add(mesh(new THREE.BoxGeometry(w * 0.42, h * 0.18, w * 0.42), std("#fff1c2", { emissive: "#ffcf73", emissiveIntensity: 0.6 })), h * 0.66 + 0.06 + h * 0.09);
      add(mesh(new THREE.ConeGeometry(w * 0.6, h * 0.16, 6), stone), h * 0.93);
      break;
    }
    default:
      add(
        mesh(p.kind.shape.type === "cylinder" ? new THREE.CylinderGeometry(p.halfW, p.halfW, h, 16) : new THREE.BoxGeometry(w, h, d), std(p.kind.color)),
        h / 2,
      );
  }
  return g;
}
