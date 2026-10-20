export interface Vec {
  x: number;
  y: number;
}

export const vec = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const len = (a: Vec): number => hyp(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => hyp(a.x - b.x, a.y - b.y);

// Deterministic maths for the simulation (decision 0026). Online, every player runs the
// match and must get the very same numbers. + − × ÷ and Math.sqrt are exactly rounded
// (IEEE 754) in every browser; Math.hypot, Math.sin, Math.cos, Math.pow and ** are not
// (each engine rounds them its own way), so the simulation uses these instead.

/** Length of (a, b, c): Math.sqrt of the sum of squares. */
export const hyp = (a: number, b: number, c = 0): number => Math.sqrt(a * a + b * b + c * c);

/** base^n for a whole n ≥ 0, by plain multiplication. */
export function powi(base: number, n: number): number {
  let r = 1;
  for (let i = 0; i < n; i++) r *= base;
  return r;
}

/** Cosine and sine of an angle (radians), by Taylor series after bringing it into [−π, π]. */
export function cosSin(a: number): [number, number] {
  const TAU = 6.283185307179586;
  const x = a - Math.round(a / TAU) * TAU;
  const x2 = x * x;
  // Up to x^16 / x^17: off by less than 2e-7 at ±π, far less for small angles.
  let c = 1;
  let s = 1;
  for (let k = 16; k >= 2; k -= 2) c = 1 - (x2 / (k * (k - 1))) * c;
  for (let k = 17; k >= 3; k -= 2) s = 1 - (x2 / (k * (k - 1))) * s;
  return [c, x * s];
}

export function norm(a: Vec, fallback: Vec = { x: 1, y: 0 }): Vec {
  const l = len(a);
  return l > 1e-9 ? { x: a.x / l, y: a.y / l } : fallback;
}

/** Distance from point p to segment [a, b]. */
export function distToSegment(p: Vec, a: Vec, b: Vec): number {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return dist(p, add(a, scale(ab, t)));
}

/** Small deterministic PRNG (mulberry32). Same seed, same sequence, on every platform. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
