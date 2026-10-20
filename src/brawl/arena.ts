// Arenas as data: a rectangle of floor closed by walls, spawn points, and props
// picked from a shared catalogue (data/arenas/props.json). Props block movement
// and projectiles, can hide a fighter from view, and some of them break.
// Pure: no I/O, the browser runs the same checks as the tools.

import { Reader } from "../sim/validate.ts";
import { hyp } from "../sim/math.ts";

export type PropShape =
  | { type: "box"; width: number; depth: number; height: number }
  | { type: "cylinder"; radius: number; height: number }
  /** Walkable slope (or stairs): rises from 0 to `height` over `length`; `width` across. */
  | { type: "ramp"; width: number; length: number; height: number };

/** Direction a ramp rises towards. */
export type RampDir = "+x" | "-x" | "+z" | "-z";
export const RAMP_DIRS: readonly RampDir[] = ["+x", "-x", "+z", "-z"];

/** One entry of the prop catalogue. */
export interface PropKind {
  id: string;
  /** How the renderer draws it (tree, rock, crate…); the engine ignores it. */
  look: string;
  color: string;
  shape: PropShape;
  /** Hit points; null = indestructible. */
  hp: number | null;
  /** Present if a fighter can pick it up and throw it. The thrown prop breaks on impact. */
  throwable?: { damage: number; knockback: number; hitstun: number };
}

export type PropCatalog = Record<string, PropKind>;

/**
 * One prop placed in an arena. `y` lifts it off the floor (a floor upstairs, a roof, a
 * beam): bodies pass under it and stand on it. `w`, `d`, `h` override the catalogue
 * shape's sizes (width across x, depth along z, height; a cylinder's diameter is `w`;
 * a ramp's length runs along its direction), so one kind serves many pieces.
 */
export interface PropPlacement {
  kind: string;
  x: number;
  z: number;
  y?: number;
  w?: number;
  d?: number;
  h?: number;
  rotated?: boolean;
  dir?: RampDir;
}

/**
 * Scenery drawn only (the engine ignores it): eaves overhanging the walls, lanterns,
 * shop curtains, petals… `look` names a drawing known to the renderer; unknown ones are
 * skipped. `yaw` turns it (radians), `s` scales it, `color` tints it when it can be.
 */
export interface DecorPlacement {
  look: string;
  x: number;
  z: number;
  y?: number;
  w?: number;
  d?: number;
  h?: number;
  yaw?: number;
  s?: number;
  color?: string;
  /** Index of the prop it belongs to (an eave on its roof): drawn with it, faded and broken with it. */
  on?: number;
}

export interface ArenaDef {
  schemaVersion: 1;
  id: string;
  name: string;
  /** Floor size in metres, centred on the origin (x across, z along). */
  width: number;
  depth: number;
  /** Floor colour, display only. */
  ground: string;
  /** A painted floor (paths, paving, grass) the renderer knows by this name; display only. */
  floor?: string;
  spawns: { x: number; z: number }[];
  props: PropPlacement[];
  decor?: DecorPlacement[];
}

export interface Prop {
  id: number;
  kind: PropKind;
  x: number;
  z: number;
  /** Footprint half-sizes for boxes (rotation swaps width and depth). */
  halfW: number;
  halfD: number;
  /** Height of the volume (a ramp's rise), from its bottom. */
  height: number;
  /** Height of its bottom above the floor (0: it stands on the floor). */
  base: number;
  /** For ramps: the axis and sign it rises along; null for flat tops. */
  rise: { axis: "x" | "z"; sign: 1 | -1 } | null;
  hp: number;
  /** Standing in the arena (blocks movement, sight and projectiles). */
  alive: boolean;
  /** Fighter carrying it overhead, or null. */
  held: number | null;
  /** Thrown and in flight. */
  flying: boolean;
}

export interface Arena {
  def: ArenaDef;
  halfW: number;
  halfD: number;
  props: Prop[];
}

/** Eye height above the feet, for line of sight. */
export const EYE_HEIGHT = 1.6;

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
      let rise: Prop["rise"] = null;
      let [w, d] = [0, 0];
      let height: number;
      if (s.type === "box") {
        const [bw, bd] = [p.w ?? s.width, p.d ?? s.depth];
        [w, d] = p.rotated ? [bd, bw] : [bw, bd];
        height = p.h ?? s.height;
      } else if (s.type === "cylinder") {
        const dia = p.w ?? s.radius * 2;
        [w, d] = [dia, dia];
        height = p.h ?? s.height;
      } else {
        const dir = p.dir ?? "+z";
        rise = { axis: dir[1] as "x" | "z", sign: dir[0] === "+" ? 1 : -1 };
        // A ramp: `w` is its width across, `d` its length along the slope.
        const [across, along] = [p.w ?? s.width, p.d ?? s.length];
        [w, d] = rise.axis === "x" ? [along, across] : [across, along];
        height = p.h ?? s.height;
      }
      return {
        id, kind, x: p.x, z: p.z, halfW: w / 2, halfD: d / 2, height, base: p.y ?? 0, rise,
        hp: kind.hp ?? Infinity, alive: true, held: null, flying: false,
      };
    }),
  };
}

/**
 * Height of the prop's top above (x, z), the point being clamped into the footprint.
 * Flat for boxes and cylinders, a slope for ramps.
 */
export function surfaceAt(p: Prop, x: number, z: number): number {
  if (!p.rise) return p.base + p.height;
  const half = p.rise.axis === "x" ? p.halfW : p.halfD;
  const along = p.rise.sign * ((p.rise.axis === "x" ? x - p.x : z - p.z));
  const t = (Math.max(-half, Math.min(half, along)) + half) / (2 * half);
  return p.base + p.height * t;
}

/** True if the prop's volume, at (x, z), overlaps the heights from y0 to y1. */
export function spansHeight(p: Prop, x: number, z: number, y0: number, y1: number): boolean {
  return y1 > p.base && y0 < surfaceAt(p, x, z);
}

/**
 * Height of the walkable ground at (x, z): the highest prop top covering that point
 * and not above `below` (a floor upstairs does not count for someone under it), or the floor.
 */
export function groundHeight(arena: Arena, x: number, z: number, below = Infinity): number {
  let h = 0;
  for (const p of arena.props) {
    if (!p.alive || distToProp(p, x, z) !== 0) continue;
    const top = surfaceAt(p, x, z);
    if (top <= below + 1e-6) h = Math.max(h, top);
  }
  return h;
}

/** Horizontal distance from (x, z) to the prop's footprint (0 inside). */
export function distToProp(p: Prop, x: number, z: number): number {
  if (p.kind.shape.type === "cylinder") return Math.max(0, hyp(x - p.x, z - p.z) - p.halfW);
  const dx = Math.max(0, Math.abs(x - p.x) - p.halfW);
  const dz = Math.max(0, Math.abs(z - p.z) - p.halfD);
  return hyp(dx, dz);
}

/** Pushes a circle of radius r at (pos.x, pos.z) out of the prop. Returns true if it moved. */
export function pushOut(p: Prop, pos: { x: number; z: number }, r: number, from?: { x: number; z: number }): boolean {
  if (p.kind.shape.type === "cylinder") {
    const dx = pos.x - p.x;
    const dz = pos.z - p.z;
    const d = hyp(dx, dz);
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
  const d = hyp(dx, dz);
  if (d >= r) return false;
  if (d > 1e-9) {
    pos.x = cx + (dx / d) * r;
    pos.z = cz + (dz / d) * r;
    return true;
  }
  // Centre inside the box: leave by the side it came from (a fast body may be past the
  // middle of a thick volume, and the nearest face would put it through to the far
  // side); without a way in known, by the nearest face.
  const exits = [
    { d: pos.x - (p.x - p.halfW), x: p.x - p.halfW - r, z: pos.z },
    { d: p.x + p.halfW - pos.x, x: p.x + p.halfW + r, z: pos.z },
    { d: pos.z - (p.z - p.halfD), x: pos.x, z: p.z - p.halfD - r },
    { d: p.z + p.halfD - pos.z, x: pos.x, z: p.z + p.halfD + r },
  ];
  if (from) for (const e of exits) e.d = hyp(e.x - from.x, e.z - from.z);
  exits.sort((a, b) => a.d - b.d);
  pos.x = exits[0]!.x;
  pos.z = exits[0]!.z;
  return true;
}

/** True if the floor segment a→b crosses the prop's footprint. */
export function segmentHitsProp(p: Prop, a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  return segmentInterval(p, a, b) !== null;
}

/** The part [t0, t1] of segment a→b (t in 0..1) that lies over the prop's footprint, or null. */
export function segmentInterval(p: Prop, a: { x: number; z: number }, b: { x: number; z: number }): [number, number] | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  if (p.kind.shape.type === "cylinder") {
    // Solve |a + t·d − c|² = r².
    const fx = a.x - p.x;
    const fz = a.z - p.z;
    const A = dx * dx + dz * dz;
    const B = 2 * (fx * dx + fz * dz);
    const C = fx * fx + fz * fz - p.halfW * p.halfW;
    if (A < 1e-12) return C < 0 ? [0, 1] : null;
    const disc = B * B - 4 * A * C;
    if (disc <= 0) return null;
    const q = Math.sqrt(disc);
    const t0 = Math.max(0, (-B - q) / (2 * A));
    const t1 = Math.min(1, (-B + q) / (2 * A));
    return t0 < t1 ? [t0, t1] : null;
  }
  // Slab test.
  let t0 = 0;
  let t1 = 1;
  for (const [o, d, lo, hi] of [
    [a.x, dx, p.x - p.halfW, p.x + p.halfW],
    [a.z, dz, p.z - p.halfD, p.z + p.halfD],
  ] as const) {
    if (Math.abs(d) < 1e-12) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let ta = (lo - o) / d;
    let tb = (hi - o) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return null;
  }
  return [t0, t1];
}

type P3 = { x: number; y: number; z: number };

/**
 * True if a prop stands between two eyes (3D points): the sight line passes over
 * the prop's footprint lower than its top. From a roof, one sees over walls.
 */
export function sightBlocked(arena: Arena, a: P3, b: P3): boolean {
  return arena.props.some((p) => {
    if (!p.alive) return false;
    const iv = segmentInterval(p, a, b);
    if (!iv) return false;
    return iv.some((t) => {
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      const y = a.y + (b.y - a.y) * t;
      return y < surfaceAt(p, x, z) && y > p.base;
    });
  });
}

/** Hard limits for arena files. */
const LIMITS = {
  size: [20, 120],
  coord: [-60, 60],
  /** Lift off the floor, and sizes of a placed piece, metres. */
  lift: [0, 30],
  piece: [0.05, 120],
} as const;
export const MAX_PROPS = 800;
export const MAX_DECOR = 3000;

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
    const isRamp = catalog[kind]!.shape.type === "ramp";
    const dir = p.raw.dir;
    if (isRamp && !RAMP_DIRS.includes(dir as RampDir))
      r.errors.push(`arena.props[${i}].dir: une rampe indique vers où elle monte (${RAMP_DIRS.join(", ")})`);
    const extra: Partial<PropPlacement> = {};
    for (const [k, range] of [["y", LIMITS.lift], ["w", LIMITS.piece], ["d", LIMITS.piece], ["h", LIMITS.piece]] as const)
      if (p.raw[k] !== undefined) extra[k] = r.num(p.raw, k, `arena.props[${i}]`, range);
    return { kind, x: p.x, z: p.z, rotated: p.raw.rotated === true, ...(isRamp ? { dir: dir as RampDir } : {}), ...extra };
  });
  // Decor: drawn only, so only shape-checked (numbers in range, a known kind of name).
  const decor: DecorPlacement[] = [];
  if (o.decor !== undefined) {
    if (!Array.isArray(o.decor)) r.errors.push("arena.decor: liste attendue");
    else if (o.decor.length > MAX_DECOR) r.errors.push(`arena.decor: au plus ${MAX_DECOR} éléments`);
    else
      o.decor.forEach((v, i) => {
        const dv = r.obj(v, `arena.decor[${i}]`);
        if (!dv) return;
        const look = typeof dv.look === "string" && /^[a-z0-9-]{1,40}$/.test(dv.look) ? dv.look : null;
        if (!look) return r.errors.push(`arena.decor[${i}].look: nom de dessin attendu (a-z, 0-9, -)`);
        const d: DecorPlacement = { look, x: r.num(dv, "x", `arena.decor[${i}]`, LIMITS.coord), z: r.num(dv, "z", `arena.decor[${i}]`, LIMITS.coord) };
        for (const [k, range] of [["y", LIMITS.lift], ["w", LIMITS.piece], ["d", LIMITS.piece], ["h", LIMITS.piece], ["s", [0.05, 20]], ["yaw", [-7, 7]]] as const)
          if (dv[k] !== undefined) d[k] = r.num(dv, k, `arena.decor[${i}]`, range);
        if (typeof dv.color === "string" && /^#[0-9a-fA-F]{6}$/.test(dv.color)) d.color = dv.color;
        if (dv.on !== undefined) {
          if (Number.isInteger(dv.on) && (dv.on as number) >= 0 && (dv.on as number) < rawProps.length) d.on = dv.on as number;
          else r.errors.push(`arena.decor[${i}].on: index d'élément attendu (0 à ${rawProps.length - 1})`);
        }
        decor.push(d);
      });
  }
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
    ...(decor.length ? { decor } : {}),
    ...(typeof o.floor === "string" && /^[a-z0-9-]{1,40}$/.test(o.floor) ? { floor: o.floor } : {}),
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
    // Clear around a spawn point on the floor (what hangs high above it does not matter).
    const blocking = arena.props.find((p) => distToProp(p, s.x, s.z) < 1.5 && p.base < 2.2);
    if (blocking) errors.push(`arena.spawns[${i}] : trop près de props[${blocking.id}] (${blocking.kind.id})`);
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, def };
}
