// Arenas as data: a rectangle of floor closed by walls, spawn points, and props
// picked from a shared catalogue (data/arenas/props.json). Props block movement
// and projectiles, can hide a fighter from view, and some of them break.
// Pure: no I/O, the browser runs the same checks as the tools.

import { Reader } from "../sim/validate.ts";

export type PropShape =
  | { type: "box"; width: number; depth: number; height: number }
  | { type: "cylinder"; radius: number; height: number };

/** One entry of the prop catalogue. */
export interface PropKind {
  id: string;
  /** How the renderer draws it (tree, rock, crate…); the engine ignores it. */
  look: string;
  color: string;
  shape: PropShape;
  /** Hit points; null = indestructible. */
  hp: number | null;
}

export type PropCatalog = Record<string, PropKind>;

export interface ArenaDef {
  schemaVersion: 1;
  id: string;
  name: string;
  /** Floor size in metres, centred on the origin (x across, z along). */
  width: number;
  depth: number;
  /** Floor colour, display only. */
  ground: string;
  spawns: { x: number; z: number }[];
  props: { kind: string; x: number; z: number; rotated?: boolean }[];
}

export interface Prop {
  id: number;
  kind: PropKind;
  x: number;
  z: number;
  /** Footprint half-sizes for boxes (rotation swaps width and depth). */
  halfW: number;
  halfD: number;
  height: number;
  hp: number;
  alive: boolean;
}

export interface Arena {
  def: ArenaDef;
  halfW: number;
  halfD: number;
  props: Prop[];
}

/** Props at least this tall hide a standing fighter. */
export const SIGHT_HEIGHT = 1.6;

/** An open training floor, used when no arena is given (tests, tools). */
export const OPEN_ARENA: ArenaDef = {
  schemaVersion: 1,
  id: "terrain-vague",
  name: "Terrain vague",
  width: 40,
  depth: 30,
  ground: "#ffe2a8",
  spawns: [
    { x: 0, z: 7 },
    { x: 0, z: -7 },
  ],
  props: [],
};

export function buildArena(def: ArenaDef, catalog: PropCatalog): Arena {
  return {
    def,
    halfW: def.width / 2,
    halfD: def.depth / 2,
    props: def.props.map((p, id) => {
      const kind = catalog[p.kind]!;
      const s = kind.shape;
      const [w, d] = s.type === "box" ? (p.rotated ? [s.depth, s.width] : [s.width, s.depth]) : [s.radius * 2, s.radius * 2];
      return { id, kind, x: p.x, z: p.z, halfW: w / 2, halfD: d / 2, height: s.height, hp: kind.hp ?? Infinity, alive: true };
    }),
  };
}

/** Horizontal distance from (x, z) to the prop's footprint (0 inside). */
export function distToProp(p: Prop, x: number, z: number): number {
  if (p.kind.shape.type === "cylinder") return Math.max(0, Math.hypot(x - p.x, z - p.z) - p.halfW);
  const dx = Math.max(0, Math.abs(x - p.x) - p.halfW);
  const dz = Math.max(0, Math.abs(z - p.z) - p.halfD);
  return Math.hypot(dx, dz);
}

/** Pushes a circle of radius r at (pos.x, pos.z) out of the prop. Returns true if it moved. */
export function pushOut(p: Prop, pos: { x: number; z: number }, r: number): boolean {
  if (p.kind.shape.type === "cylinder") {
    const dx = pos.x - p.x;
    const dz = pos.z - p.z;
    const d = Math.hypot(dx, dz);
    const min = p.halfW + r;
    if (d >= min) return false;
    const nx = d > 1e-9 ? dx / d : 1;
    const nz = d > 1e-9 ? dz / d : 0;
    pos.x = p.x + nx * min;
    pos.z = p.z + nz * min;
    return true;
  }
  const cx = Math.max(p.x - p.halfW, Math.min(p.x + p.halfW, pos.x));
  const cz = Math.max(p.z - p.halfD, Math.min(p.z + p.halfD, pos.z));
  const dx = pos.x - cx;
  const dz = pos.z - cz;
  const d = Math.hypot(dx, dz);
  if (d >= r) return false;
  if (d > 1e-9) {
    pos.x = cx + (dx / d) * r;
    pos.z = cz + (dz / d) * r;
    return true;
  }
  // Centre inside the box: leave by the nearest face.
  const exits = [
    { d: pos.x - (p.x - p.halfW), x: p.x - p.halfW - r, z: pos.z },
    { d: p.x + p.halfW - pos.x, x: p.x + p.halfW + r, z: pos.z },
    { d: pos.z - (p.z - p.halfD), x: pos.x, z: p.z - p.halfD - r },
    { d: p.z + p.halfD - pos.z, x: pos.x, z: p.z + p.halfD + r },
  ].sort((a, b) => a.d - b.d);
  pos.x = exits[0]!.x;
  pos.z = exits[0]!.z;
  return true;
}

/** True if the floor segment a→b crosses the prop's footprint. */
export function segmentHitsProp(p: Prop, a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (p.kind.shape.type === "cylinder") {
    const l2 = dx * dx + dz * dz;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2));
    return Math.hypot(a.x + dx * t - p.x, a.z + dz * t - p.z) < p.halfW;
  }
  // Slab test.
  let t0 = 0;
  let t1 = 1;
  for (const [o, d, lo, hi] of [
    [a.x, dx, p.x - p.halfW, p.x + p.halfW],
    [a.z, dz, p.z - p.halfD, p.z + p.halfD],
  ] as const) {
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return false;
      continue;
    }
    let ta = (lo - o) / d;
    let tb = (hi - o) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/** True if a standing-height prop stands between the two points. */
export function sightBlocked(arena: Arena, a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  return arena.props.some((p) => p.alive && p.height >= SIGHT_HEIGHT && segmentHitsProp(p, a, b));
}

/** Hard limits for arena files. */
const LIMITS = {
  size: [20, 120],
  coord: [-60, 60],
} as const;
export const MAX_PROPS = 200;

export type ArenaValidation = { ok: true; def: ArenaDef } | { ok: false; errors: string[] };

export function validateArena(data: unknown, catalog: PropCatalog): ArenaValidation {
  const r = new Reader();
  const o = r.obj(data, "arena");
  if (!o) return { ok: false, errors: r.errors };
  if (o.schemaVersion !== 1) return { ok: false, errors: ["arena.schemaVersion: 1 attendu"] };
  const id = r.str(o, "id", "arena");
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 40) : id;
  const width = r.num(o, "width", "arena", LIMITS.size);
  const depth = r.num(o, "depth", "arena", LIMITS.size);
  const ground = typeof o.ground === "string" && /^#[0-9a-fA-F]{6}$/.test(o.ground) ? o.ground : "#ffe2a8";
  const readPoints = (v: unknown, path: string) =>
    Array.isArray(v)
      ? v.map((p, i) => {
          const po = r.obj(p, `${path}[${i}]`);
          return po ? { x: r.num(po, "x", `${path}[${i}]`, LIMITS.coord), z: r.num(po, "z", `${path}[${i}]`, LIMITS.coord), raw: po } : undefined;
        })
      : (r.errors.push(`${path}: liste attendue`), []);
  const spawns = readPoints(o.spawns, "arena.spawns");
  if (spawns.length < 2) r.errors.push("arena.spawns: au moins 2 points d'apparition");
  const rawProps = readPoints(o.props, "arena.props");
  if (rawProps.length > MAX_PROPS) r.errors.push(`arena.props: au plus ${MAX_PROPS} éléments`);
  const props = rawProps.map((p, i) => {
    if (!p) return undefined;
    const kind = p.raw.kind;
    if (typeof kind !== "string" || !catalog[kind]) {
      r.errors.push(`arena.props[${i}].kind: élément inconnu "${String(kind)}" (voir data/arenas/props.json)`);
      return undefined;
    }
    return { kind, x: p.x, z: p.z, rotated: p.raw.rotated === true };
  });
  if (r.errors.length > 0) return { ok: false, errors: r.errors };

  const def: ArenaDef = {
    schemaVersion: 1,
    id,
    name,
    width,
    depth,
    ground,
    spawns: spawns.map((s) => ({ x: s!.x, z: s!.z })),
    props: props.map((p) => p!),
  };
  // Geometry: every prop inside the walls, every spawn point clear of props.
  const arena = buildArena(def, catalog);
  const errors: string[] = [];
  arena.props.forEach((p, i) => {
    if (Math.abs(p.x) + p.halfW > arena.halfW || Math.abs(p.z) + p.halfD > arena.halfD)
      errors.push(`arena.props[${i}] (${p.kind.id}) : dépasse des murs`);
  });
  def.spawns.forEach((s, i) => {
    if (Math.abs(s.x) > arena.halfW - 1 || Math.abs(s.z) > arena.halfD - 1) errors.push(`arena.spawns[${i}] : trop près des murs`);
    const blocking = arena.props.find((p) => distToProp(p, s.x, s.z) < 1.5);
    if (blocking) errors.push(`arena.spawns[${i}] : trop près de props[${blocking.id}] (${blocking.kind.id})`);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, def };
}
