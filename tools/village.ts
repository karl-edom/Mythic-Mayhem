// Generates the Japanese village arena (data/arenas/village-japonais.json):
//
//   node tools/village.ts
//
// A paved main street between two rows of two-storey townhouses (machiya) that can
// be crossed (front and back doors), climbed (stairs inside, a window onto the front
// canopy, the tiled roof above), a shrine on a stone terrace up a flight of steps
// behind a torii, and south of the houses a stream with an arched bridge, cherry
// trees, a watchtower and market stalls.
//
// The output is plain data, validated like any arena: solid pieces (`props`, the
// engine's collisions) and drawn-only scenery (`decor`: eaves, lattices, lanterns,
// curtains, blossom, the painted floor).

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ArenaDef, DecorPlacement, PropPlacement, RampDir } from "../src/brawl/arena.ts";
import { loadPropCatalog } from "../src/brawl/load.ts";
import { validateArena } from "../src/brawl/arena.ts";

const ROOT = new URL("../", import.meta.url).pathname;
const W = 64;
const D = 48;

const props: PropPlacement[] = [];
const decor: DecorPlacement[] = [];
const r2 = (v: number) => Math.round(v * 100) / 100;
function prop(p: PropPlacement): number {
  const out: PropPlacement = { kind: p.kind, x: r2(p.x), z: r2(p.z) };
  for (const k of ["y", "w", "d", "h"] as const) if (p[k] !== undefined) out[k] = r2(p[k]!);
  if (p.dir) out.dir = p.dir;
  props.push(out);
  return props.length - 1;
}
function deco(d: DecorPlacement): void {
  const out: DecorPlacement = { look: d.look, x: r2(d.x), z: r2(d.z) };
  for (const k of ["y", "w", "d", "h", "yaw", "s"] as const) if (d[k] !== undefined) out[k] = r2(d[k]!);
  if (d.color) out.color = d.color;
  if (d.on !== undefined) out.on = d.on;
  decor.push(out);
}
/** A box from x0..x1 × z0..z1 (any order), from `y` up `h`. */
function box(kind: string, x0: number, x1: number, z0: number, z1: number, h: number, y = 0): number {
  return prop({ kind, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: Math.abs(x1 - x0), d: Math.abs(z1 - z0), h, ...(y ? { y } : {}) });
}
/** A ramp over x0..x1 × z0..z1 rising toward `dir`, from `y` up `h`. */
function ramp(kind: string, x0: number, x1: number, z0: number, z1: number, h: number, dir: RampDir, y = 0): number {
  const along = dir[1] === "x" ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const across = dir[1] === "x" ? Math.abs(z1 - z0) : Math.abs(x1 - x0);
  return prop({ kind, x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: across, d: along, h, dir, ...(y ? { y } : {}) });
}

// Seeded random: the same village every time.
let seed = 20261019;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]!;

// ---------------------------------------------------------------------------
// The floor, painted: the street's paving, earth lanes, grass, the stream.
deco({ look: "paint-dirt", x: 0, z: 0, w: W, d: D });
deco({ look: "paint-paving", x: 0, z: 0, w: W, d: 7.4 });
deco({ look: "paint-paving", x: 0, z: -10, w: 6, d: 9 });
deco({ look: "paint-paving", x: 0, z: 10, w: 6, d: 8 });
deco({ look: "paint-grass", x: -16, z: 19, w: 30, d: 9 });
deco({ look: "paint-grass", x: 18, z: 19, w: 28, d: 9 });
deco({ look: "paint-gravel", x: 0, z: -19.5, w: 30, d: 9 });
deco({ look: "paint-moss", x: -24, z: -18, w: 14, d: 10 });
deco({ look: "paint-moss", x: 24, z: -18, w: 14, d: 10 });
deco({ look: "paint-water", x: 0, z: 18.5, w: W, d: 3.2 });
deco({ look: "water", x: 0, z: 18.5, w: W, d: 3.2, y: 0.03 });

// ---------------------------------------------------------------------------
// Townhouses. `face` is the side of the street door: +1 = +z, -1 = −z.
const T = 0.3; // wall thickness
const FLOOR1 = 0.3; // ground floor top (tatami, one step up)
const STOREY = 2.6; // ground storey wall height
const UP = STOREY + 0.25; // upstairs floor top
const UPWALL = 2.0;
const EAVE = UP + UPWALL; // top of the upstairs walls: where the roof starts
const RISE = 1.5;
const SHOPS = ["酒", "茶", "米", "宿", "薬", "菓子", "団子", "麺", "刀", "傘", "湯", "魚"];
const WALLS = ["#efe6d2", "#e9dcc2", "#f3ecdc", "#e4d6bb"];

function machiya(cx: number, cz: number, w: number, d: number, face: 1 | -1, n: number): void {
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const front = cz + (face * d) / 2;
  const back = cz - (face * d) / 2;
  const inner = (z: number, k: number) => z - face * k; // from the front wall inward
  const fz = (k: number) => front - face * k; // a depth k behind the front face
  const wallCol = pick(WALLS);
  // Ground floor, a step up.
  box("tatami", x0 + T, x1 - T, fz(T), back + face * T, FLOOR1);
  // Ground storey walls: front with the shop door, back with a back door, sides full.
  const door = 2.4;
  const dc = cx + (n % 2 ? 0.9 : -0.9);
  const fw1 = box("machiya-wall", x0, dc - door / 2, front, fz(T), STOREY);
  const fw2 = box("machiya-wall", dc + door / 2, x1, front, fz(T), STOREY);
  const bc = cx - (n % 2 ? 1.6 : -1.6);
  box("machiya-wall", x0, bc - 1, back, back + face * T, STOREY);
  box("machiya-wall", bc + 1, x1, back, back + face * T, STOREY);
  box("machiya-wall", x0, x0 + T, front, back, STOREY);
  box("machiya-wall", x1 - T, x1, front, back, STOREY);
  // Lattice fronts (kōshi) on the shop front.
  for (const [a, b, on] of [[x0 + 0.3, dc - door / 2 - 0.2, fw1], [dc + door / 2 + 0.2, x1 - 0.3, fw2]] as const)
    if (b - a > 0.6) deco({ look: "koshi", x: (a + b) / 2, z: front + face * 0.06, y: 0.35, w: b - a, h: 1.7, yaw: face > 0 ? 0 : Math.PI, on });
  // Stairs up along the back wall (x0 side), the upstairs floor beside them.
  const stairLen = 4.2;
  const sw = 1.1;
  const sz0 = back + face * T;
  const sz1 = back + face * (T + sw);
  ramp("wood-stairs", x0 + T, x0 + T + stairLen, sz0, sz1, UP - FLOOR1, "+x", FLOOR1);
  const upstairs = box("wood-floor", x0 + T, x1 - T, sz1, fz(T), 0.25, STOREY);
  box("wood-floor", x0 + T + stairLen, x1 - T, sz0, sz1, 0.25, STOREY);
  // Upstairs walls: a wide bay at the front, open from the floor to the eaves (2 m, a
  // body's height and more), onto the canopy: the way out over the street.
  const win = 2.6;
  box("plaster-wall", x0, cx - win / 2, front, fz(T), UPWALL, UP);
  box("plaster-wall", cx + win / 2, x1, front, fz(T), UPWALL, UP);
  box("plaster-wall", x0, x1, back, back + face * T, UPWALL, UP);
  box("plaster-wall", x0, x0 + T, front, back, UPWALL, UP);
  box("plaster-wall", x1 - T, x1, front, back, UPWALL, UP);
  // The canopy (hisashi) over the shop front: a short tiled slope, walkable.
  const canopy = ramp("roof-tile", x0 - 0.2, x1 + 0.2, front, front + face * 1.3, 0.45, face > 0 ? "-z" : "+z", STOREY - 0.05);
  deco({ look: "kanban", x: dc, z: front + face * 1.32, y: STOREY - 0.35, w: 1.6, h: 0.42, yaw: face > 0 ? 0 : Math.PI, color: "#2a1d14", on: canopy });
  decorText.push({ i: decor.length - 1, text: SHOPS[n % SHOPS.length]! });
  // The curtain (noren) in the door and a lantern hang from the canopy: they fade
  // and fall with it.
  deco({ look: "noren", x: dc, z: front + face * 0.08, y: 2.45, w: door - 0.2, h: 0.9, yaw: face > 0 ? 0 : Math.PI, color: pick(["#23395b", "#7a1f2b", "#2f4f3a", "#3a2a4a"]), on: canopy });
  deco({ look: "chochin", x: dc + (door / 2 + 0.35) * (n % 2 ? 1 : -1), z: front + face * 0.45, y: 2.25, s: 1, on: canopy });
  // The roof: two tiled slopes to a ridge along the street, overhanging all round.
  const ov = 0.7;
  const roofFront = ramp("roof-tile", x0 - 0.4, x1 + 0.4, cz, front + face * ov, RISE, face > 0 ? "-z" : "+z", EAVE);
  const roofBack = ramp("roof-tile", x0 - 0.4, x1 + 0.4, back - face * ov, cz, RISE, face > 0 ? "+z" : "-z", EAVE);
  deco({ look: "ridge", x: cx, z: cz, y: EAVE + RISE, w: w + 1.0, on: roofFront });
  for (const [x, on] of [[x0 - 0.02, roofBack], [x1 + 0.02, roofFront]] as const)
    deco({ look: "gable", x, z: cz, y: EAVE, w: d, h: RISE, yaw: Math.PI / 2, color: wallCol, on });
  deco({ look: "beams", x: cx, z: cz, y: STOREY, w, d, h: 0.25, on: upstairs });
}

const decorText: { i: number; text: string }[] = [];

const rows: [number, number][] = [[-26, 8], [-16, 8], [-7, 6], [7, 6], [16, 8], [26, 8]];
rows.forEach(([cx, w], i) => machiya(cx, -8, w, 8, 1, i));
rows.forEach(([cx, w], i) => machiya(cx, 8, w, 8, -1, i + 6));

// Lanterns strung across the street.
for (const x of [-21, -11.5, 11.5, 21]) deco({ look: "lantern-string", x, z: 0, y: 3.4, w: 8.6, yaw: Math.PI / 2 });
// Shop banners (nobori) and street clutter.
for (const [x, z] of [[-20.6, -3.3], [-2.8, -3.4], [12.6, 3.4], [21, 3.3], [-12, 3.4]] as const)
  deco({ look: "nobori", x, z, y: 0, h: 3.2, color: pick(["#c8321e", "#2e4f8a", "#e0a020", "#3d7a3a"]) });
// Throwable crates and barrels by the shops.
for (const [x, z] of [[-21, -3.1], [10.8, 3.1], [-10.9, 3.2], [20.9, -3.2]] as const) prop({ kind: "crate", x, z });
for (const [x, z] of [[-29.8, -2.8], [29.6, 2.8], [-3.4, 3.1], [3.4, -3.1]] as const) prop({ kind: "barrel", x, z });

// ---------------------------------------------------------------------------
// The shrine: torii in the gap of the north row, stone steps, a terrace, the hall.
const toriiL = prop({ kind: "torii-post", x: -2.4, z: -10.5 });
prop({ kind: "torii-post", x: 2.4, z: -10.5 });
deco({ look: "torii-top", x: 0, z: -10.5, y: 4.6, w: 4.8, on: toriiL });
ramp("stone-stairs", -2.6, 2.6, -12.4, -15, 1.2, "-z");
box("stone-terrace", -15, 15, -15, -23.4, 1.2);
for (const x of [-4.2, 4.2]) prop({ kind: "stone-lantern", x, z: -16.4, y: 1.2 });
// Hall (haiden): open at the front between vermilion posts, a deck, a big roof.
const hx0 = -5.5;
const hx1 = 5.5;
const hz0 = -17.6; // front
const hz1 = -22.6; // back
box("wood-deck", hx0, hx1, hz0, hz1, 0.35, 1.2);
const HW = 1.55 + 3.0; // hall wall top
box("plaster-wall", hx0, hx1, hz1, hz1 + T, 3.0, 1.55);
box("plaster-wall", hx0, hx0 + T, hz0 + 1.2, hz1, 3.0, 1.55);
box("plaster-wall", hx1 - T, hx1, hz0 + 1.2, hz1, 3.0, 1.55);
for (const x of [hx0 + 0.2, -1.9, 1.9, hx1 - 0.2]) prop({ kind: "wood-post", x, z: hz0 + 0.2, y: 1.55, h: 3.0, w: 0.36 });
const HR = 2.8; // hall roof rise: steep, as on a shrine
// The front (+z) slope rises toward the ridge (−z), the back one toward +z.
const hallRoof = ramp("roof-tile", hx0 - 1.4, hx1 + 1.4, (hz0 + hz1) / 2, hz0 + 1.8, HR, "-z", HW);
ramp("roof-tile", hx0 - 1.4, hx1 + 1.4, hz1 - 1.4, (hz0 + hz1) / 2, HR, "+z", HW);
deco({ look: "ridge", x: 0, z: (hz0 + hz1) / 2, y: HW + HR, w: hx1 - hx0 + 3.0, s: 1.4, on: hallRoof });
for (const x of [hx0 - 0.02, hx1 + 0.02]) deco({ look: "gable", x, z: (hz0 + hz1) / 2, y: HW, w: hz0 - hz1, h: HR, yaw: Math.PI / 2, color: "#f1e8d6", on: hallRoof });
deco({ look: "shimenawa", x: 0, z: hz0 + 0.15, y: 1.55 + 2.7, w: 7.5 });
deco({ look: "offering-box", x: 0, z: hz0 - 0.6, y: 1.55 });
deco({ look: "beams", x: 0, z: (hz0 + hz1) / 2, y: 1.55 + 3.0, w: hx1 - hx0, d: hz0 - hz1, h: 0.3, on: hallRoof });
// Cherry trees and lanterns on the terrace, pines and bamboo round it.
for (const [x, z] of [[-11.5, -19.5], [11.5, -19.5]] as const) {
  const t = prop({ kind: "sakura", x, z, y: 1.2 });
  deco({ look: "sakura-canopy", x, z, y: 1.2 + 3.0, s: 1.15, on: t });
}
for (const x of [-8, 8]) prop({ kind: "stone-lantern", x, z: -21.8, y: 1.2 });
for (const [x, z] of [[-26, -18], [-20, -21], [26, -18.5], [20.5, -21.5]] as const) deco({ look: "pine", x, z, s: 1 + rnd() * 0.3 });
for (let i = 0; i < 9; i++) deco({ look: "bamboo", x: -30 + rnd() * 8, z: -21 + rnd() * 2.5, s: 0.9 + rnd() * 0.4 });
for (let i = 0; i < 9; i++) deco({ look: "bamboo", x: 22 + rnd() * 8, z: -21 + rnd() * 2.5, s: 0.9 + rnd() * 0.4 });
// Rock gardens and fences in the back lanes.
for (const [x, z] of [[-22, -16.5], [23, -16.8], [-27, -14], [28, -14]] as const) prop({ kind: "rock-garden", x, z, w: 1.4 + rnd(), d: 1 + rnd() * 0.6, h: 0.7 + rnd() * 0.5 });
for (const [x, z] of [[-18, -13.8], [18, -13.8]] as const) prop({ kind: "bamboo-fence", x, z, w: 6 });

// ---------------------------------------------------------------------------
// South: the stream, an arched bridge, cherry trees, a well, a watchtower, stalls.
ramp("bridge-arch", -1.5, 1.5, 14.6, 16.9, 1.0, "+z");
box("bridge-deck", -1.5, 1.5, 16.9, 20.1, 0.25, 0.75);
ramp("bridge-arch", -1.5, 1.5, 20.1, 22.4, 1.0, "-z");
deco({ look: "bridge-rail", x: -1.45, z: 18.5, y: 0, w: 7.8, yaw: Math.PI / 2 });
deco({ look: "bridge-rail", x: 1.45, z: 18.5, y: 0, w: 7.8, yaw: Math.PI / 2 });
// Stepping stones across the stream, west.
for (let i = 0; i < 5; i++) deco({ look: "stepping-stone", x: -16 + i * 0.35, z: 16.9 + i * 0.8, s: 0.9 });
for (const [x, z] of [[-9, 22], [9.5, 21.5], [-23, 14.6], [14.5, 14.6]] as const) {
  const t = prop({ kind: "sakura", x, z });
  deco({ look: "sakura-canopy", x, z, y: 3.0, s: 1, on: t });
}
prop({ kind: "well", x: -13.5, z: 14.4 });
for (const [x, z] of [[-6, 14.2], [6, 14.2]] as const) prop({ kind: "stone-lantern", x, z });
// Watchtower (yagura): four posts, a deck at 3.6 m, stairs up, a small roof.
const tx = -27;
const tz = 21;
for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]] as const) prop({ kind: "wood-post", x: tx + dx, z: tz + dz, h: 3.6, w: 0.34 });
const deck = box("wood-deck", tx - 1.6, tx + 1.6, tz - 1.6, tz + 1.6, 0.3, 3.6);
ramp("wood-stairs", tx + 1.6, tx + 6.6, tz - 1.6, tz - 0.4, 3.9, "-x");
deco({ look: "rail", x: tx, z: tz + 1.6, y: 3.9, w: 3.2, h: 0.8, on: deck });
deco({ look: "rail", x: tx - 1.6, z: tz, y: 3.9, w: 3.2, h: 0.8, yaw: Math.PI / 2, on: deck });
deco({ look: "tower-roof", x: tx, z: tz, y: 6.4, w: 4, on: deck });
deco({ look: "fire-bell", x: tx + 0.6, z: tz + 0.6, y: 5.8 });
// Market stalls: posts, a cloth roof one can stand on, a counter (breakable).
for (const [sx, sz] of [[20, 15.5], [26.5, 15.5], [23.2, 22]] as const) {
  for (const [dx, dz] of [[-1.5, -0.9], [1.5, -0.9], [-1.5, 0.9], [1.5, 0.9]] as const) prop({ kind: "wood-post", x: sx + dx, z: sz + dz, h: 2.4, w: 0.2 });
  const top = box("roof-flat", sx - 1.8, sx + 1.8, sz - 1.2, sz + 1.2, 0.15, 2.4);
  deco({ look: "awning", x: sx, z: sz, y: 2.4, w: 3.6, d: 2.4, color: pick(["#c8321e", "#2e4f8a", "#e9e1cf"]), on: top });
  prop({ kind: "stall-counter", x: sx, z: sz - 0.9, w: 2.6 });
}
for (const [x, z] of [[18, 20.5], [29.5, 19.5], [24, 13.6]] as const) prop({ kind: "crate", x, z });
for (const [x, z] of [[19.2, 20.6], [29.3, 21]] as const) prop({ kind: "barrel", x, z });
// Petals drifting over the whole village.
deco({ look: "petals", x: 0, z: 0, w: W, d: D, y: 0 });

// ---------------------------------------------------------------------------
const def: ArenaDef = {
  schemaVersion: 1,
  id: "village-japonais",
  name: "Village aux cerisiers",
  width: W,
  depth: D,
  ground: "#d8c9a6",
  floor: "village-japonais",
  spawns: [
    { x: -18, z: 0 },
    { x: 18, z: 0 },
    { x: -5, z: 1.5 },
    { x: 5, z: -1.5 },
  ],
  props,
  decor,
};
// Shop signs: the arena format has no free text, so the sign's writing is folded into
// its look name as code points ("kanban-9152" for 酒); the renderer unfolds it.
for (const { i, text } of decorText) decor[i]!.look = `kanban-${[...text].map((c) => c.codePointAt(0)!.toString(16)).join("-")}`;

const catalog = loadPropCatalog();
const v = validateArena(def, catalog);
if (!v.ok) {
  console.error(v.errors.join("\n"));
  process.exit(1);
}
writeFileSync(join(ROOT, "data/arenas/village-japonais.json"), JSON.stringify(def) + "\n");
console.log(`village-japonais.json : ${props.length} éléments, ${decor.length} décors`);
