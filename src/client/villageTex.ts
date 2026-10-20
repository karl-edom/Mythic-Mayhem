// Textures of the Japanese village: plaster, dark board cladding, timber, roof tiles
// (kawara), stone paving and ashlar, tatami, planks, earth and gravel. Photo-scanned
// maps (CC0, public/assets/textures, see public/assets/CREDITS.md) once loaded; else
// painted in code: each painted one tiles seamlessly and, where relief matters
// (tiles, stones, planks), comes with a normal map computed from a painted height
// field. Scale: `metres` of the world per texture repeat, for materials whose UVs are
// in metres (see village3d.ts).

import * as THREE from "three";

export interface Surface {
  map: THREE.Texture;
  normal?: THREE.Texture;
  /** Roughness, mean ROUGH_MEAN: the material's roughness is divided by it. */
  rough?: THREE.Texture;
  /** World metres covered by one repeat of the texture. */
  metres: number;
}

/** Mean of the photo roughness maps (scaled to it when converted). */
export const ROUGH_MEAN = 200 / 255;

/**
 * The photo-scanned surfaces (Poly Haven, CC0) and the world metres one image covers.
 * Their diffuse maps were scaled to the mean colour of the painted surface they
 * replace, so the tints of each element stay as they were. Two stay painted, as they
 * read better: the roof tiles (kawara; no photo shows rows of round Japanese tiles)
 * and the tatami (the photo loses the dark cloth borders).
 */
const PHOTOS: Record<string, number> = { plaster: 2, boards: 1.6, timber: 1, paving: 2, ashlar: 1.9, planks: 1.9, dirt: 2, gravel: 1.9 };
const photos = new Map<string, Surface>();

/**
 * Loads the photo surfaces from `base` (…/assets/textures/). A surface whose images
 * do not load stays painted; this never throws.
 */
export async function loadPhotoTextures(base: string): Promise<void> {
  const loader = new THREE.TextureLoader();
  const load = async (url: string, color: boolean) => {
    const t = await loader.loadAsync(new URL(url, base).href);
    t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  await Promise.all(
    Object.entries(PHOTOS).map(async ([name, metres]) => {
      try {
        const [map, normal, rough] = await Promise.all([load(`${name}/diffuse.webp`, true), load(`${name}/normal.webp`, false), load(`${name}/rough.webp`, false)]);
        photos.set(name, { map, normal, rough, metres });
      } catch (e) {
        console.warn(`Texture photo « ${name} » indisponible, version peinte :`, e);
      }
    }),
  );
}

/** A photo surface, if it loaded (floor layers: paving, dirt, gravel). */
export const photo = (name: string): Surface | undefined => photos.get(name);

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d", { willReadFrequently: true })!];
}

function tex(c: HTMLCanvasElement, color: boolean): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** Value noise (tileable over `period` cells). */
function noise2(seed: number, period: number): (x: number, y: number) => number {
  const r = seeded(seed);
  const g = Array.from({ length: period * period }, () => r());
  const at = (i: number, j: number) => g[((j % period) + period) % period * period + (((i % period) + period) % period)]!;
  return (x: number, y: number) => {
    const i = Math.floor(x);
    const j = Math.floor(y);
    const fx = x - i;
    const fy = y - j;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const b = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/** Fractal noise in 0..1, tileable on a size×size image. */
function fbm(seed: number, size: number, base: number, octaves = 4): (x: number, y: number) => number {
  const layers = Array.from({ length: octaves }, (_, o) => ({ n: noise2(seed + o * 17, base << o), f: (base << o) / size, a: 0.5 ** o }));
  const norm = layers.reduce((s, l) => s + l.a, 0);
  return (x, y) => layers.reduce((s, l) => s + l.n(x * l.f, y * l.f) * l.a, 0) / norm;
}

/** Normal map from a height field (0..1 per pixel), wrapping at the edges. */
function normalFrom(h: Float32Array, w: number, ht: number, strength: number): THREE.CanvasTexture {
  const [c, g] = canvas(w, ht);
  const img = g.createImageData(w, ht);
  const at = (x: number, y: number) => h[((y + ht) % ht) * w + ((x + w) % w)]!;
  for (let y = 0; y < ht; y++)
    for (let x = 0; x < w; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const k = (y * w + x) * 4;
      img.data[k] = ((dx / l) * 0.5 + 0.5) * 255;
      img.data[k + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      img.data[k + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[k + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  return tex(c, false);
}

/** Paints an image pixel by pixel from a function giving [r, g, b] (0..255) and a height. */
function paint(size: number, fn: (x: number, y: number) => [number, number, number, number]): { color: THREE.CanvasTexture; height: Float32Array; canvas: HTMLCanvasElement } {
  const [c, g] = canvas(size);
  const img = g.createImageData(size, size);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const [r, gg, b, h] = fn(x, y);
      const k = (y * size + x) * 4;
      img.data[k] = r;
      img.data[k + 1] = gg;
      img.data[k + 2] = b;
      img.data[k + 3] = 255;
      height[y * size + x] = h;
    }
  g.putImageData(img, 0, 0);
  return { color: tex(c, true), height, canvas: c };
}

const cache = new Map<string, Surface>();
/** The painted surface, painted once. */
const painted = (key: string, make: () => Surface): Surface => {
  let s = cache.get(key);
  if (!s) cache.set(key, (s = make()));
  return s;
};
/** The photo surface if it loaded, else the painted one. */
const once = (key: string, make: () => Surface): Surface => photos.get(key) ?? painted(key, make);

const clamp = (v: number) => Math.max(0, Math.min(255, v));
const mixc = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i]! - v) * t);

/** Lime plaster: warm white, faint trowel mottling, a little grime. Tinted by the material. */
export const plaster = () =>
  once("plaster", () => {
    const N = 256;
    const n = fbm(3, N, 4, 5);
    const fine = fbm(9, N, 32, 2);
    const p = paint(N, (x, y) => {
      const v = 0.86 + (n(x, y) - 0.5) * 0.12 + (fine(x, y) - 0.5) * 0.06;
      return [clamp(255 * v), clamp(250 * v), clamp(240 * v), n(x, y) * 0.3 + fine(x, y) * 0.2];
    });
    return { map: p.color, normal: normalFrom(p.height, N, N, 1.2), metres: 2.5 };
  });

/** Dark vertical board cladding (the lower walls): boards ~14 cm, gaps, grain, weathering. */
export const boards = () =>
  once("boards", () => {
    const N = 256;
    const per = 8; // boards per repeat (1.12 m)
    const grain = fbm(21, N, 8, 3);
    const r = seeded(4);
    const tone = Array.from({ length: per }, () => 0.75 + r() * 0.35);
    const p = paint(N, (x, y) => {
      const b = Math.floor((x / N) * per);
      const u = ((x / N) * per) % 1;
      const gap = u < 0.06 || u > 0.97 ? 1 : 0;
      const g = grain(x * 0.5, y * 3);
      const v = tone[b]! * (0.8 + g * 0.4) * (gap ? 0.35 : 1);
      return [clamp(78 * v), clamp(56 * v), clamp(40 * v), gap ? 0 : 0.6 + g * 0.2];
    });
    return { map: p.color, normal: normalFrom(p.height, N, N, 3), metres: 1.12 };
  });

/** Timber (posts, beams, rails): mid brown, long grain. */
export const timber = () =>
  once("timber", () => {
    const N = 256;
    const grain = fbm(31, N, 4, 4);
    const p = paint(N, (x, y) => {
      const g = grain(x * 0.25, y * 2.5);
      const v = 0.8 + g * 0.45;
      return [clamp(118 * v), clamp(84 * v), clamp(56 * v), g];
    });
    return { map: p.color, normal: normalFrom(p.height, N, N, 1.5), metres: 1 };
  });

/**
 * Kawara roof tiles: columns of round-backed tiles (25 cm) in courses (30 cm) that
 * overlap downhill, a shadow under each course, per-tile shade. Texture v runs down
 * the slope.
 */
export const kawara = () =>
  once("kawara", () => {
    const N = 512;
    const cols = 4;
    const rows = 3; // per metre-ish repeat (1 m across, 0.9 m along)
    const r = seeded(8);
    const shade = Array.from({ length: cols * rows }, () => 0.82 + r() * 0.3);
    const p = paint(N, (x, y) => {
      const cu = (x / N) * cols;
      const cv = (y / N) * rows;
      const i = Math.floor(cu);
      const j = Math.floor(cv);
      const u = cu - i;
      const v = cv - j;
      // Round back across the tile, a lip at its lower end, its top tucked under the course above.
      const arch = Math.sin(Math.PI * u) ** 0.5;
      const lip = v > 0.86 ? (1 - v) / 0.14 : 1;
      const under = v < 0.16 ? 0.4 + (v / 0.16) * 0.6 : 1;
      const h = arch * 0.8 + v * 0.3;
      const base = [104, 110, 120];
      // Lit crowns, dark grooves between the columns, a sheen near the crown.
      const light = 0.38 + arch * 0.72 + Math.max(0, Math.sin(Math.PI * u) - 0.85) * 1.2;
      const k = shade[j * cols + i]! * light * under * (0.8 + lip * 0.2);
      const seam = u < 0.04 || u > 0.96 ? 0.3 : 1;
      return [clamp(base[0]! * k * seam), clamp(base[1]! * k * seam), clamp(base[2]! * k * seam), h * lip];
    });
    return { map: p.color, normal: normalFrom(p.height, N, N, 9), metres: 1 };
  });

/** Stone paving (ishidatami): irregular slabs in loose courses, mortar and moss in the joints. */
export const paving = () => once("paving", paintPaving);
/** The painted paving (the stream's ripples and the painted floor use it). */
export const paintedPaving = () => painted("paving", paintPaving);
function paintPaving(): Surface {
  const N = 512;
  const r = seeded(12);
  const [c, g] = canvas(N);
  const [hc, hg] = canvas(N);
  g.fillStyle = "#6f6a58";
  g.fillRect(0, 0, N, N);
  hg.fillStyle = "#000";
  hg.fillRect(0, 0, N, N);
  const rows = 6;
  for (let j = 0; j < rows; j++) {
    const y0 = (j / rows) * N;
    const hh = N / rows;
    let x = r() * 40;
    while (x < N + 40) {
      const w = 50 + r() * 70;
      const tone = 150 + r() * 45;
      for (const dx of [0, -N, N]) {
        const sx = x + dx + 3;
        const sy = y0 + 3 + (r() - 0.5) * 2;
        g.fillStyle = `rgb(${tone + 8},${tone + 4},${tone - 8})`;
        g.beginPath();
        g.roundRect(sx, sy, w - 6, hh - 6, 7);
        g.fill();
        hg.fillStyle = "#fff";
        hg.beginPath();
        hg.roundRect(sx, sy, w - 6, hh - 6, 9);
        hg.fill();
      }
      x += w;
    }
  }
  // Speckle and stains.
  const n = fbm(5, N, 8, 4);
  const img = g.getImageData(0, 0, N, N);
  const himg = hg.getImageData(0, 0, N, N);
  const height = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) {
    const x = i % N;
    const y = Math.floor(i / N);
    const v = 0.86 + n(x, y) * 0.28 + (r() - 0.5) * 0.08;
    img.data[i * 4] = clamp(img.data[i * 4]! * v);
    img.data[i * 4 + 1] = clamp(img.data[i * 4 + 1]! * v);
    img.data[i * 4 + 2] = clamp(img.data[i * 4 + 2]! * v);
    height[i] = (himg.data[i * 4]! / 255) * 0.8 + n(x, y) * 0.2;
  }
  g.putImageData(img, 0, 0);
  void hc;
  return { map: tex(c, true), normal: normalFrom(height, N, N, 4), metres: 2.2 };
}

/** Ashlar (terrace walls, lantern stone): granite blocks in courses, chiselled faces. */
export const ashlar = () =>
  once("ashlar", () => {
    const N = 256;
    const n = fbm(14, N, 8, 4);
    const r = seeded(15);
    const rows = 4;
    const offs = Array.from({ length: rows }, () => r());
    const lens = Array.from({ length: rows }, () => 2 + Math.floor(r() * 2));
    const p = paint(N, (x, y) => {
      const j = Math.floor((y / N) * rows);
      const v = ((y / N) * rows) % 1;
      const u = ((x / N) * lens[j]! + offs[j]!) % 1;
      const joint = v < 0.05 || v > 0.95 || u < 0.03 || u > 0.97;
      const k = (joint ? 0.55 : 0.92) * (0.85 + n(x, y) * 0.3);
      return [clamp(196 * k), clamp(190 * k), clamp(176 * k), joint ? 0 : 0.7 + n(x * 2, y * 2) * 0.3];
    });
    return { map: p.color, normal: normalFrom(p.height, N, N, 3), metres: 2 };
  });

/** Tatami: woven rush mats (90 × 180 cm) with dark cloth borders. */
export const tatami = () =>
  once("tatami", () => {
    const N = 512;
    const r = seeded(16);
    const p = paint(N, (x, y) => {
      // Two mats side by side per repeat (1.8 m square).
      const u = (x / N) * 2;
      const v = y / N;
      const fu = u % 1;
      const border = fu < 0.04 || fu > 0.96 || v < 0.02 || v > 0.98;
      if (border) return [40, 52, 44, 0.6];
      const weave = Math.sin(y * 1.9) * 0.5 + 0.5;
      const k = 0.82 + weave * 0.12 + (r() - 0.5) * 0.04;
      return [clamp(200 * k), clamp(196 * k), clamp(132 * k), weave * 0.5];
    });
    return { map: p.color, normal: normalFrom(p.height, N, N, 1.5), metres: 1.8 };
  });

/** Floor planks: light wood boards (18 cm) of varied tone, staggered joints. */
export const planks = () =>
  once("planks", () => {
    const N = 512;
    const per = 6;
    const r = seeded(18);
    const tone = Array.from({ length: per }, () => 0.8 + r() * 0.3);
    const joint = Array.from({ length: per }, () => r());
    const grain = fbm(19, N, 4, 4);
    const p = paint(N, (x, y) => {
      const b = Math.floor((y / N) * per);
      const v = ((y / N) * per) % 1;
      const u = (x / N + joint[b]!) % 1;
      const gap = v < 0.05 || v > 0.97 || u < 0.008;
      const g = grain(x * 2.5, y * 0.3);
      const k = tone[b]! * (0.82 + g * 0.35) * (gap ? 0.4 : 1);
      return [clamp(176 * k), clamp(130 * k), clamp(88 * k), gap ? 0 : 0.6 + g * 0.3];
    });
    return { map: p.color, normal: normalFrom(p.height, N, N, 2.5), metres: 1.1 };
  });

/** Woven cloth (curtains, awnings, banners): white, tinted by the material. */
export const cloth = () =>
  once("cloth", () => {
    const N = 128;
    const p = paint(N, (x, y) => {
      const w = ((x % 2) ^ (y % 2)) ? 0.94 : 1;
      return [clamp(240 * w), clamp(240 * w), clamp(240 * w), w];
    });
    return { map: p.color, metres: 0.25 };
  });

/** The arena floor, painted from the arena's `paint-*` decor rectangles (see village3d.ts). */
export interface FloorPaint {
  kind: "dirt" | "paving" | "grass" | "gravel" | "moss" | "water";
  x: number;
  z: number;
  w: number;
  d: number;
}

/**
 * The painted floor and where the photo surfaces go on it (see villageFloor): `mask`
 * holds the share of paving (red), gravel (green) and earth (blue) at each pixel; the
 * rest (grass, moss, the stream bed) stays painted.
 */
export interface FloorTextures {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  mask: THREE.CanvasTexture;
}

/**
 * One big texture for the whole floor (about 3 cm a pixel): earth, then paving,
 * grass, gravel, moss and the stream bed, with soft edges; its normal map; and the
 * mask of the photo surfaces.
 */
const floors = new Map<string, FloorTextures>();
export function floorTexture(width: number, depth: number, paints: FloorPaint[]): FloorTextures {
  // Painting takes a moment: the same plan is painted once (menu backdrop, then the match).
  const key = JSON.stringify([width, depth, paints]);
  const hit = floors.get(key);
  if (hit) return hit;
  const made = paintFloor(width, depth, paints);
  floors.set(key, made);
  return made;
}

function paintFloor(width: number, depth: number, paints: FloorPaint[]): FloorTextures {
  const ppm = 32; // pixels per metre
  const W = Math.round(width * ppm);
  const H = Math.round(depth * ppm);
  const [c, g] = canvas(W, H);
  const [mc, mg] = canvas(W, H);
  const mask = mg.createImageData(W, H);
  const height = new Float32Array(W * H);
  const n = fbm(41, 512, 6, 5);
  const fine = fbm(42, 512, 48, 2);
  const r = seeded(43);
  const px = (x: number) => (x + width / 2) * ppm;
  const pz = (z: number) => (z + depth / 2) * ppm;
  const img = g.createImageData(W, H);
  // Which paint is on top at each pixel (later wins), blended at the borders.
  const layers = paints.map((p) => ({ ...p, x0: px(p.x - p.w / 2), x1: px(p.x + p.w / 2), z0: pz(p.z - p.d / 2), z1: pz(p.z + p.d / 2) }));
  const colours: Record<FloorPaint["kind"], number[]> = {
    dirt: [196, 172, 128],
    paving: [168, 160, 140],
    grass: [104, 150, 70],
    gravel: [205, 200, 186],
    moss: [96, 128, 70],
    water: [52, 78, 74],
  };
  const pav = paintedPaving();
  const pavImg = pav.map.image as HTMLCanvasElement;
  const pavData = pavImg.getContext("2d")!.getImageData(0, 0, pavImg.width, pavImg.height).data;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let col = colours.dirt.slice();
      let h = 0.3 + n(x % 512, y % 512) * 0.2;
      // Shares of the photo surfaces: each layer covers what is under it by t.
      let [wp, wg, wd] = [0, 0, 1];
      for (const l of layers) {
        if (l.kind === "dirt") continue;
        const edge = Math.min(x - l.x0, l.x1 - x, y - l.z0, l.z1 - y);
        const soft = l.kind === "paving" ? 3 : l.kind === "water" ? 6 : 24;
        const jag = (fine(x % 512, y % 512) - 0.5) * soft * 1.6;
        const t = Math.max(0, Math.min(1, (edge + jag) / soft));
        if (t <= 0) continue;
        let lc = colours[l.kind];
        let lh = h;
        if (l.kind === "paving") {
          // The paving texture itself, 3 m a repeat.
          const tx = Math.floor(((x / ppm) / pav.metres) * pavImg.width) % pavImg.width;
          const ty = Math.floor(((y / ppm) / pav.metres) * pavImg.height) % pavImg.height;
          const k = (ty * pavImg.width + tx) * 4;
          lc = [pavData[k]!, pavData[k + 1]!, pavData[k + 2]!];
          lh = (pavData[k]! - 100) / 120;
        } else if (l.kind === "grass") {
          const v = 0.75 + n(x % 512, y % 512) * 0.4 + (fine(x % 512, y % 512) - 0.5) * 0.3;
          lc = lc.map((c2) => c2 * v);
          lh = 0.4 + fine(x % 512, y % 512) * 0.5;
        } else if (l.kind === "gravel") {
          const s = r();
          lc = lc.map((c2) => c2 * (0.85 + s * 0.25));
          lh = s;
        } else if (l.kind === "moss") {
          const v = 0.7 + n(x % 512, y % 512) * 0.5;
          lc = lc.map((c2) => c2 * v);
        } else if (l.kind === "water") {
          const v = 0.7 + fine(x % 512, y % 512) * 0.5;
          lc = lc.map((c2) => c2 * v);
          lh = fine(x % 512, y % 512) * 0.6;
        }
        col = mixc(col, lc, t);
        h = h + (lh - h) * t;
        [wp, wg, wd] = [wp * (1 - t) + (l.kind === "paving" ? t : 0), wg * (1 - t) + (l.kind === "gravel" ? t : 0), wd * (1 - t)];
      }
      // Ground grime and a little light/dark variation everywhere.
      const v = 0.9 + n(x % 512, y % 512) * 0.18;
      const k = (y * W + x) * 4;
      img.data[k] = clamp(col[0]! * v);
      img.data[k + 1] = clamp(col[1]! * v);
      img.data[k + 2] = clamp(col[2]! * v);
      img.data[k + 3] = 255;
      height[y * W + x] = h;
      mask.data[k] = wp * 255;
      mask.data[k + 1] = wg * 255;
      mask.data[k + 2] = wd * 255;
      mask.data[k + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  mg.putImageData(mask, 0, 0);
  const map = tex(c, true);
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  const normal = normalFrom(height, W, H, 2.5);
  normal.wrapS = normal.wrapT = THREE.ClampToEdgeWrapping;
  const weights = tex(mc, false);
  weights.wrapS = weights.wrapT = THREE.ClampToEdgeWrapping;
  return { map, normal, mask: weights };
}
