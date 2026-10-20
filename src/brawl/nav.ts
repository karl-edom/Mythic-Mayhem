// Ground navigation for bots: a grid over the arena floor (half-metre cells) marking
// where a body cannot stand (walls, posts, anything taller than a step that is not
// hanging above head height), and an A* search on it. Built once per arena and
// rebuilt when a prop breaks. Pure: same results in the browser and the tools.

import { distToProp, surfaceAt, type Arena } from "./arena.ts";
import { hyp } from "../sim/math.ts";

/** Grid cell size, metres. */
const CELL = 0.5;
/** Clearance kept from walls (about a fighter's radius). */
const CLEAR = 0.42;
/** Bodies are this tall; props whose bottom is higher do not block (they hang above). */
const BODY = 1.8;
/** Steps lower than this are walked onto. */
const STEP = 0.45;

interface Grid {
  cols: number;
  rows: number;
  x0: number;
  z0: number;
  blocked: Uint8Array;
  /** Props standing when built: rebuilt when that changes. */
  alive: number;
}

const grids = new WeakMap<Arena, Grid>();

function build(arena: Arena, alive: number): Grid {
  const cols = Math.ceil((arena.halfW * 2) / CELL);
  const rows = Math.ceil((arena.halfD * 2) / CELL);
  const g: Grid = { cols, rows, x0: -arena.halfW, z0: -arena.halfD, blocked: new Uint8Array(cols * rows), alive };
  const blockers = arena.props.filter((p) => p.alive && p.base < BODY && !p.rise);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = g.x0 + (i + 0.5) * CELL;
      const z = g.z0 + (j + 0.5) * CELL;
      const edge = Math.abs(x) > arena.halfW - CLEAR || Math.abs(z) > arena.halfD - CLEAR;
      g.blocked[j * cols + i] = edge || blockers.some((p) => distToProp(p, x, z) < CLEAR && surfaceAt(p, x, z) > STEP) ? 1 : 0;
    }
  return g;
}

function grid(arena: Arena): Grid {
  const alive = arena.props.reduce((n, p) => n + (p.alive ? 1 : 0), 0);
  let g = grids.get(arena);
  if (!g || g.alive !== alive) {
    g = build(arena, alive);
    grids.set(arena, g);
  }
  return g;
}

const cellOf = (g: Grid, x: number, z: number) => {
  const i = Math.max(0, Math.min(g.cols - 1, Math.floor((x - g.x0) / CELL)));
  const j = Math.max(0, Math.min(g.rows - 1, Math.floor((z - g.z0) / CELL)));
  return j * g.cols + i;
};
const centre = (g: Grid, c: number) => ({ x: g.x0 + ((c % g.cols) + 0.5) * CELL, z: g.z0 + (Math.floor(c / g.cols) + 0.5) * CELL });

/** True if a straight walk from a to b crosses no blocked cell. */
export function walkClear(arena: Arena, a: { x: number; z: number }, b: { x: number; z: number }): boolean {
  const g = grid(arena);
  const n = Math.ceil(hyp(b.x - a.x, b.z - a.z) / (CELL * 0.5));
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    if (g.blocked[cellOf(g, a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)]) return false;
  }
  return true;
}

/** Nearest free cell to a point (a goal standing against a wall still has a way to it). */
function freeNear(g: Grid, c: number): number {
  if (!g.blocked[c]) return c;
  const ci = c % g.cols;
  const cj = Math.floor(c / g.cols);
  for (let r = 1; r < 8; r++)
    for (let dj = -r; dj <= r; dj++)
      for (let di = -r; di <= r; di++) {
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) continue;
        if (!g.blocked[j * g.cols + i]) return j * g.cols + i;
      }
  return c;
}

/**
 * Path on the floor from `from` to `to` (A*, eight directions, no corner cutting),
 * pulled straight where nothing is in the way. Returns the way points after the
 * start, ending at `to`; null if there is no way.
 */
export function findPath(arena: Arena, from: { x: number; z: number }, to: { x: number; z: number }): { x: number; z: number }[] | null {
  const g = grid(arena);
  const start = freeNear(g, cellOf(g, from.x, from.z));
  const goal = freeNear(g, cellOf(g, to.x, to.z));
  if (start === goal) return [to];
  const n = g.cols * g.rows;
  const cost = new Float32Array(n).fill(Infinity);
  const prev = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  // Binary heap of [f, cell].
  const heap: [number, number][] = [];
  const push = (f: number, c: number) => {
    heap.push([f, c]);
    let k = heap.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap[p]![0] <= heap[k]![0]) break;
      [heap[p], heap[k]] = [heap[k]!, heap[p]!];
      k = p;
    }
  };
  const pop = () => {
    const top = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && heap[l]![0] < heap[m]![0]) m = l;
        if (r < heap.length && heap[r]![0] < heap[m]![0]) m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k]!, heap[m]!];
        k = m;
      }
    }
    return top;
  };
  const gi = goal % g.cols;
  const gj = Math.floor(goal / g.cols);
  const h = (c: number) => {
    const di = Math.abs((c % g.cols) - gi);
    const dj = Math.abs(Math.floor(c / g.cols) - gj);
    return Math.max(di, dj) + 0.414 * Math.min(di, dj);
  };
  cost[start] = 0;
  push(h(start), start);
  while (heap.length) {
    const [, c] = pop();
    if (closed[c]) continue;
    closed[c] = 1;
    if (c === goal) break;
    const ci = c % g.cols;
    const cj = Math.floor(c / g.cols);
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) continue;
        const nc = j * g.cols + i;
        if (g.blocked[nc] || closed[nc]) continue;
        // No cutting a corner between two blocked cells.
        if (di && dj && (g.blocked[cj * g.cols + i] || g.blocked[j * g.cols + ci])) continue;
        const nd = cost[c]! + (di && dj ? 1.414 : 1);
        if (nd < cost[nc]!) {
          cost[nc] = nd;
          prev[nc] = c;
          push(nd + h(nc), nc);
        }
      }
  }
  if (prev[goal] === -1) return null;
  const cells: number[] = [];
  for (let c = goal; c !== start && c !== -1; c = prev[c]!) cells.push(c);
  cells.reverse();
  // String pulling: from each kept point, jump to the farthest one still in straight view.
  const pts = cells.map((c) => centre(g, c));
  pts[pts.length - 1] = to;
  const out: { x: number; z: number }[] = [];
  let at = from;
  let k = 0;
  while (k < pts.length) {
    let far = k;
    for (let m = pts.length - 1; m > k; m--)
      if (walkClear(arena, at, pts[m]!)) {
        far = m;
        break;
      }
    out.push(pts[far]!);
    at = pts[far]!;
    k = far + 1;
  }
  return out;
}
