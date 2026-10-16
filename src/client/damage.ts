// Visible wear on arena props. A prop goes through two damage stages before it
// breaks (at 2/3 and 1/3 of its hit points): dark cracks spread over its real
// surface, small parts (merlons, eaves, braces, rails) come off as debris, and tall
// things start to lean. It tells both players, at a glance, how close a wall or a
// tower is to giving way.

import * as THREE from "three";
import type { Prop } from "../brawl/arena.ts";
import { noOutline } from "./toon.ts";

/** 0 = intact, 1 = cracked, 2 = crumbling. */
export function damageStage(p: Prop): 0 | 1 | 2 {
  if (p.kind.hp === null || !Number.isFinite(p.hp)) return 0;
  const f = p.hp / p.kind.hp;
  return f > 2 / 3 ? 0 : f > 1 / 3 ? 1 : 2;
}

/** A detached part, to be thrown as debris from where it was. */
export interface Chip {
  pos: THREE.Vector3;
  color: THREE.Color;
  size: number;
}

interface WearState {
  stage: number;
  rand: () => number;
  lean: THREE.Euler;
}

const crackMaterial = () =>
  noOutline(
    new THREE.MeshBasicMaterial({
      color: 0x1a1512,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );

function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const noRaycast = () => {};

/**
 * Brings the prop's 3D object to the given stage (never backwards). Returns the parts
 * that came off, in world space, for the caller to throw as debris.
 */
export function applyWear(obj: THREE.Object3D, p: Prop, stage: number): Chip[] {
  const st: WearState = (obj.userData.wear ??= {
    stage: 0,
    rand: seeded(Math.round(p.x * 97 + p.z * 53) + 11),
    lean: new THREE.Euler(),
  });
  const chips: Chip[] = [];
  while (st.stage < stage) {
    st.stage++;
    if (p.kind.look !== "tree") addCracks(obj, p, st.rand, st.stage);
    // Ramps and stairs stay whole: they are still walked on, every step must show.
    if (!p.rise) chips.push(...shedParts(obj, st.rand, st.stage));
    // Tall and narrow things lean; squat ones only settle a little.
    const tall = p.height / Math.max(p.halfW, p.halfD) > 3;
    const deg = (tall ? [0, 2.5, 6] : [0, 0.5, 1.2])[st.stage]!;
    const a = st.rand() * Math.PI * 2;
    st.lean.set((Math.cos(a) * deg * Math.PI) / 180, 0, (Math.sin(a) * deg * Math.PI) / 180);
  }
  return chips;
}

/** Current lean of a worn prop (applied by the scene every frame). */
export function wearLean(obj: THREE.Object3D): THREE.Euler | null {
  return (obj.userData.wear as WearState | undefined)?.lean ?? null;
}

// ---------------------------------------------------------------------------

/**
 * Cracks: jagged dark ribbons that branch, drawn on the prop's faces. Each point of
 * a crack is found by casting a ray at the prop, so cracks lie on whatever surface
 * is there (stonework, a plastered wall, a lumpy rock, a round column).
 */
function addCracks(obj: THREE.Object3D, p: Prop, r: () => number, stage: number): void {
  obj.updateMatrixWorld(true);
  const targets: THREE.Mesh[] = [];
  obj.traverse((o) => {
    if (o instanceof THREE.Mesh && o.visible && !o.userData.crack) targets.push(o);
  });
  if (!targets.length) return;
  const ray = new THREE.Raycaster();
  const hw = p.halfW;
  const hd = p.halfD;
  const h = p.height;
  // The four sides (outward normal, in-plane horizontal axis, half width), and the top for low props.
  const faces: { n: THREE.Vector3; u: THREE.Vector3; half: number; area: number }[] = [
    { n: new THREE.Vector3(0, 0, 1), u: new THREE.Vector3(1, 0, 0), half: hw, area: hw * 2 * h },
    { n: new THREE.Vector3(0, 0, -1), u: new THREE.Vector3(1, 0, 0), half: hw, area: hw * 2 * h },
    { n: new THREE.Vector3(1, 0, 0), u: new THREE.Vector3(0, 0, 1), half: hd, area: hd * 2 * h },
    { n: new THREE.Vector3(-1, 0, 0), u: new THREE.Vector3(0, 0, 1), half: hd, area: hd * 2 * h },
  ];
  const quads: number[] = [];
  const width = THREE.MathUtils.clamp(Math.min(h, Math.max(hw, hd)) * 0.025, 0.025, 0.07);
  const surf = (face: (typeof faces)[number], u: number, y: number): { at: THREE.Vector3; n: THREE.Vector3 } | null => {
    const origin = obj.localToWorld(face.u.clone().multiplyScalar(u).addScaledVector(face.n, Math.max(hw, hd) + 1.5).setY(y));
    const dir = face.n.clone().negate().transformDirection(obj.matrixWorld);
    ray.set(origin, dir);
    ray.far = Math.max(hw, hd) * 2 + 3;
    const hit = ray.intersectObjects(targets, false)[0];
    if (!hit?.face) return null;
    const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
    return { at: obj.worldToLocal(hit.point.clone()), n: n.transformDirection(new THREE.Matrix4().copy(obj.matrixWorld).invert()) };
  };
  const walk = (face: (typeof faces)[number], u0: number, y0: number, len: number, angle: number, depth: number) => {
    let u = u0;
    let y = y0;
    let prev = surf(face, u, y);
    const steps = 3 + Math.floor(r() * 4);
    for (let i = 0; i < steps && prev; i++) {
      angle += (r() - 0.5) * 1.3;
      const step = len * (0.6 + r() * 0.6);
      u += Math.cos(angle) * step;
      y += Math.sin(angle) * step;
      if (Math.abs(u) > face.half * 0.98 || y < 0.05 || y > h * 0.98) break;
      const next = surf(face, u, y);
      if (!next) break;
      // A quad from prev to next, flat against the surface, tapering along the crack.
      const along = next.at.clone().sub(prev.at);
      const side = along.clone().cross(prev.n).normalize().multiplyScalar((width * (1 - i / (steps + 1))) / 2);
      const side2 = along.clone().cross(next.n).normalize().multiplyScalar((width * (1 - (i + 1) / (steps + 1))) / 2);
      const a = prev.at.clone().addScaledVector(prev.n, 0.012);
      const b = next.at.clone().addScaledVector(next.n, 0.012);
      quads.push(...a.clone().add(side).toArray(), ...a.clone().sub(side).toArray(), ...b.clone().add(side2).toArray());
      quads.push(...a.clone().sub(side).toArray(), ...b.clone().sub(side2).toArray(), ...b.clone().add(side2).toArray());
      if (depth < 1 && r() < 0.35) walk(face, u, y, len * 0.7, angle + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.5), depth + 1);
      prev = next;
    }
  };
  for (const face of faces) {
    const count = Math.max(1, Math.min(5, Math.round((face.area / 5) * (stage === 1 ? 0.6 : 1))));
    for (let k = 0; k < count; k++) {
      // Cracks start low (where the blows land) and run upward, or from an edge.
      const len = Math.min(h, face.half * 2) * 0.12 + 0.08;
      walk(face, (r() * 2 - 1) * face.half * 0.85, 0.15 + r() * Math.min(h * 0.6, 1.8), len, Math.PI / 2 + (r() - 0.5) * 1.6, 0);
    }
  }
  if (!quads.length) return;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(quads, 3));
  const crack = new THREE.Mesh(geo, crackMaterial());
  crack.userData.crack = true;
  crack.raycast = noRaycast;
  obj.add(crack);
}

/**
 * Small parts come off: among the prop's meshes, the smaller ones (never the main
 * body), preferably high up. A fifth go at the first stage, a quarter more at the second.
 */
function shedParts(obj: THREE.Object3D, r: () => number, stage: number): Chip[] {
  obj.updateMatrixWorld(true);
  const parts: { m: THREE.Mesh; vol: number; y: number; center: THREE.Vector3 }[] = [];
  const box = new THREE.Box3();
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || !o.visible || o.userData.crack) return;
    box.setFromObject(o);
    const s = box.getSize(new THREE.Vector3());
    parts.push({ m: o, vol: Math.max(s.x * s.y * s.z, 1e-4), y: box.max.y, center: box.getCenter(new THREE.Vector3()) });
  });
  if (parts.length < 4) return [];
  const total = parts.reduce((a, b) => a + b.vol, 0);
  const top = Math.max(...parts.map((q) => q.y));
  const loose = parts.filter((q) => q.vol < total * 0.08);
  // Higher parts first, with some randomness.
  loose.sort((a, b) => b.y / top + r() * 0.6 - (a.y / top + r() * 0.6));
  const n = Math.round(loose.length * (stage === 1 ? 0.2 : 0.25));
  return loose.slice(0, n).map((q) => {
    q.m.visible = false;
    const mat = q.m.material as THREE.MeshStandardMaterial;
    const color = (mat.userData.baseColor as THREE.Color | undefined)?.clone() ?? mat.color?.clone() ?? new THREE.Color(0x888888);
    if (mat.vertexColors) color.set(0x9a948a);
    return { pos: q.center, color, size: THREE.MathUtils.clamp(Math.cbrt(q.vol), 0.12, 0.4) };
  });
}

/** A representative colour of the prop, for its debris when it breaks. */
export function propColor(obj: THREE.Object3D): THREE.Color {
  let best: THREE.Mesh | null = null;
  let bestVol = 0;
  const box = new THREE.Box3();
  obj.traverse((o) => {
    if (!(o instanceof THREE.Mesh) || o.userData.crack) return;
    const s = box.setFromObject(o).getSize(new THREE.Vector3());
    if (s.x * s.y * s.z > bestVol) [best, bestVol] = [o, s.x * s.y * s.z];
  });
  const m = (best as THREE.Mesh | null)?.material as THREE.MeshStandardMaterial | undefined;
  if (!m || m.vertexColors) return new THREE.Color(0x9a948a);
  return ((m.userData.baseColor as THREE.Color | undefined) ?? m.color).clone();
}
