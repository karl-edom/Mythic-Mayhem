// Procedural weapons for the anime fighters, built in metres with the blade along +Y
// and the grip at the origin. Thin, clean shapes that read well in cel shading;
// no model files to ship or license.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { noOutline, outlineOf, toon } from "./toon.ts";

export const ANIME_WEAPONS = [
  "1H_Katana", "2H_Odachi", "Kunai", "Kunai_Offhand", "2H_Staff", "Sai", "Sai_Offhand", "Sakabato", "Bo", "Nunchaku", "Nunchaku_Offhand",
  "Mugenjin", "Chokuto", "Claws", "Claws_Offhand", "Staff_Gnarled", "Pan", "Bottle", "Chainsaw", "Sniper", "Gun", "Bazooka",
] as const;

const STEEL = 0xe8eef6;

function part(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, outline = 0.0025): THREE.Mesh {
  const m = toon(color);
  outlineOf(m, outline);
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  return mesh;
}

/** Slightly curved single-edged blade (katana family), extruded thin. */
function curvedBlade(length: number, width: number, curve: number, teeth = 0): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const n = 12;
  // Back of the blade, then the edge on the way down; the tip is a short diagonal.
  for (let i = 0; i <= n; i++) {
    const y = (i / n) * length;
    s[i === 0 ? "moveTo" : "lineTo"](-width / 2 + curve * (y / length) ** 2, y);
  }
  s.lineTo(width / 2 + curve - width * 0.2, length - width * 1.4);
  // The edge, straight, or cut into saw teeth (`teeth` of them).
  const m = teeth > 0 ? teeth * 2 : n;
  for (let i = m; i >= 0; i--) {
    const y = (i / m) * (length - width * 1.4);
    const tooth = teeth > 0 && i % 2 === 1 ? width * 0.35 : 0;
    s.lineTo(width / 2 + curve * (y / length) ** 2 + tooth, y);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
  g.translate(0, 0, -0.003);
  // The flat of the blade faces sideways (X), the edge forward (Z).
  g.rotateY(Math.PI / 2);
  return g;
}

/** Where the trail of a swing is drawn: from `base` to `tip` along the weapon (+Y). */
function markTrail(g: THREE.Group, base: number, tip: number): void {
  for (const [name, y] of [["trailBase", base], ["trailTip", tip]] as const) {
    const m = new THREE.Object3D();
    m.name = name;
    m.position.y = y;
    g.add(m);
  }
}

function katana(bladeLength: number, handle: number, scale = 1, opts: { curve?: number; teeth?: number; steel?: number; hilt?: number; guard?: number } = {}): THREE.Group {
  const g = new THREE.Group();
  const tsuka = part(new THREE.CylinderGeometry(0.017 * scale, 0.017 * scale, handle, 8), opts.hilt ?? 0x1d1b2a);
  tsuka.position.y = -handle / 2 + 0.06;
  g.add(tsuka);
  // Diamond wrap pattern suggested by a few light rings.
  for (let i = 1; i < 5; i++) {
    const ring = part(new THREE.TorusGeometry(0.0175 * scale, 0.003, 4, 10), 0xd8d0c0, 0);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06 - (handle * i) / 5;
    g.add(ring);
  }
  const tsuba = part(new THREE.CylinderGeometry((opts.guard ?? 0.042) * scale, (opts.guard ?? 0.042) * scale, 0.01, 12), 0x8a6a2c);
  tsuba.position.y = 0.07;
  g.add(tsuba);
  const blade = part(curvedBlade(bladeLength, 0.032 * scale, (opts.curve ?? 0.05) * scale, opts.teeth ?? 0), opts.steel ?? STEEL, 0.002);
  blade.position.y = 0.076;
  blade.userData.blade = true;
  g.add(blade);
  markTrail(g, 0.08, 0.076 + bladeLength);
  return g;
}

function kunai(): THREE.Group {
  const g = new THREE.Group();
  const handle = part(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 6), 0x2b2b38);
  g.add(handle);
  const ring = part(new THREE.TorusGeometry(0.022, 0.005, 6, 12), 0x50505e);
  ring.position.y = -0.07;
  g.add(ring);
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0.03, 0.04);
  s.lineTo(0, 0.17);
  s.lineTo(-0.03, 0.04);
  s.lineTo(0, 0);
  const bladeGeo = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: false });
  bladeGeo.translate(0, 0, -0.004);
  const blade = part(bladeGeo, STEEL, 0.002);
  blade.position.y = 0.05;
  g.add(blade);
  markTrail(g, 0.05, 0.22);
  return g;
}

function staff(): THREE.Group {
  const g = new THREE.Group();
  const shaft = part(new THREE.CylinderGeometry(0.02, 0.022, 1.7, 8), 0x3a2a4a);
  shaft.position.y = 0.35;
  g.add(shaft);
  for (const y of [-0.5, 1.2]) {
    const cap = part(new THREE.CylinderGeometry(0.028, 0.028, 0.06, 8), 0xc9a646);
    cap.position.y = y;
    g.add(cap);
  }
  // Crystal head: glows, so no ink outline.
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.07),
    noOutline(new THREE.MeshBasicMaterial({ color: 0x9fe8ff })),
  );
  crystal.scale.y = 1.6;
  crystal.position.y = 1.32;
  g.add(crystal);
  const fork = part(new THREE.TorusGeometry(0.08, 0.008, 6, 16, Math.PI), 0xc9a646);
  fork.position.y = 1.24;
  g.add(fork);
  markTrail(g, 0.2, 1.4);
  return g;
}

/**
 * Sai: a round steel prong with two curved side tines (yoku) and a wrapped grip with a
 * pommel. Polished steel, physically lit: it catches the light when it turns.
 */
function sai(): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xd2d6dd, metalness: 1, roughness: 0.22 });
  const wrap = new THREE.MeshStandardMaterial({ color: 0x5a3520, roughness: 0.8 });
  outlineOf(steel, 0.002);
  outlineOf(wrap, 0.0025);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = true;
    g.add(mesh);
    return mesh;
  };
  add(new THREE.CylinderGeometry(0.016, 0.016, 0.13, 10), wrap).position.y = 0;
  add(new THREE.SphereGeometry(0.022, 12, 8), steel).position.y = -0.075;
  // Central prong: octagonal, tapering to a point.
  add(new THREE.CylinderGeometry(0.004, 0.011, 0.4, 8), steel).position.y = 0.28;
  // Side tines: a curve out from the guard, then up.
  for (const s of [-1, 1]) {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.07, 0), new THREE.Vector3(s * 0.075, 0.075, 0), new THREE.Vector3(s * 0.06, 0.19, 0));
    add(new THREE.TubeGeometry(curve, 16, 0.0065, 6), steel);
    add(new THREE.SphereGeometry(0.008, 8, 6), steel).position.set(s * 0.06, 0.19, 0);
  }
  add(new THREE.CylinderGeometry(0.02, 0.02, 0.016, 10), steel).position.y = 0.07;
  markTrail(g, 0.1, 0.48);
  return g;
}

/**
 * Bō: a long hardwood staff, slightly thicker in the middle, cloth wraps where the hands
 * hold it and at both ends. Held by the right hand at the origin, the left a little
 * lower; most of its length rises above the right hand.
 */
function bo(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a2e, roughness: 0.55 });
  const wrap = new THREE.MeshStandardMaterial({ color: 0x3b2a4a, roughness: 0.85 });
  outlineOf(wood, 0.0025);
  outlineOf(wrap, 0.0025);
  const len = 1.75;
  const shaft = new THREE.CylinderGeometry(0.018, 0.018, len, 12, 12);
  const sp = shaft.attributes.position!;
  for (let i = 0; i < sp.count; i++) {
    const k = 1 + 0.18 * (1 - Math.abs(sp.getY(i) / (len / 2)) ** 2);
    sp.setX(i, sp.getX(i) * k);
    sp.setZ(i, sp.getZ(i) * k);
  }
  shaft.computeVertexNormals();
  const m = new THREE.Mesh(shaft, wood);
  m.position.y = 0.32;
  m.castShadow = true;
  g.add(m);
  for (const [y, h] of [[0.0, 0.14], [-0.45, 0.14], [0.32 + len / 2 - 0.06, 0.1], [0.32 - len / 2 + 0.06, 0.1]] as const) {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0225, 0.0225, h, 12), wrap);
    band.position.y = y;
    g.add(band);
  }
  markTrail(g, 0.5, 0.32 + len / 2);
  return g;
}

/**
 * Nunchaku: the held stick, a short chain, and the free stick, which swings like a
 * pendulum on the chain: it hangs, lags behind the hand and whips round at the end of
 * a blow (simulated each frame, visual only).
 */
function nunchaku(): THREE.Group {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b3f22, roughness: 0.45 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: 1, roughness: 0.3 });
  outlineOf(wood, 0.0025);
  const stick = () => {
    const geo = new THREE.CylinderGeometry(0.015, 0.016, 0.3, 8);
    const mesh = new THREE.Mesh(geo, wood);
    mesh.castShadow = true;
    return mesh;
  };
  const held = stick();
  held.position.y = 0.1;
  g.add(held);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.012, 8), steel);
  cap.position.y = 0.25;
  g.add(cap);
  // The free half hangs from the top of the held stick: chain (local −Y), then stick.
  const swing = new THREE.Group();
  swing.position.y = 0.255;
  g.add(swing);
  const chain = 0.09;
  for (let i = 0; i < 5; i++) {
    const link = new THREE.Mesh(new THREE.TorusGeometry(0.008, 0.0025, 4, 8), steel);
    link.position.y = -(i + 0.5) * (chain / 5);
    link.rotation.y = i % 2 ? Math.PI / 2 : 0;
    swing.add(link);
  }
  const free = stick();
  free.position.y = -chain - 0.15;
  swing.add(free);
  for (const [name, y] of [["trailBase", -chain], ["trailTip", -chain - 0.3]] as const) {
    const o = new THREE.Object3D();
    o.name = name;
    o.position.y = y;
    swing.add(o);
  }
  // Pendulum: the free end's world position is integrated (Verlet) and kept at the
  // chain's length from the pivot; the free half is then turned toward it.
  const reach = chain + 0.3;
  const tip = new THREE.Vector3();
  const prev = new THREE.Vector3();
  const pivot = new THREE.Vector3();
  const pq = new THREE.Quaternion();
  let last = 0;
  free.onBeforeRender = () => {
    const now = performance.now() / 1000;
    if (last && now - last < 0.004) return;
    const dt = last ? Math.min(0.033, now - last) : 0;
    last = now;
    swing.parent!.updateWorldMatrix(true, false);
    swing.getWorldPosition(pivot);
    const scale = swing.parent!.getWorldScale(new THREE.Vector3()).y;
    if (dt === 0 || tip.lengthSq() === 0) {
      tip.copy(pivot).add(new THREE.Vector3(0, -reach * scale, 0));
      prev.copy(tip);
    } else {
      const v = tip.clone().sub(prev).multiplyScalar(0.94);
      prev.copy(tip);
      tip.add(v).add(new THREE.Vector3(0, -9.8 * dt * dt, 0));
    }
    const d = tip.clone().sub(pivot);
    if (d.lengthSq() < 1e-8) d.set(0, -1, 0);
    d.setLength(reach * scale);
    tip.copy(pivot).add(d);
    swing.parent!.getWorldQuaternion(pq);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), d.clone().normalize());
    swing.quaternion.copy(pq.invert().multiply(q));
  };
  return g;
}

/** A material of the arms built below: physically lit, with the ink outline. */
function mat(color: THREE.ColorRepresentation, metal = 0, rough = 0.6, outline = 0.0025): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color, metalness: metal, roughness: rough });
  outlineOf(m, outline);
  return m;
}
function add(g: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  g.add(mesh);
  return mesh;
}

/**
 * Tekko-kagi: three long blades rising from a steel plate strapped over the fist and the
 * back of the hand.
 */
function claws(): THREE.Group {
  const g = new THREE.Group();
  const steel = mat(0xc9ced8, 1, 0.25, 0.002);
  const strap = mat(0x2a1e2c, 0, 0.8);
  add(g, new RoundedBoxGeometry(0.075, 0.1, 0.03, 2, 0.008), steel, 0, 0.02, 0.03);
  add(g, new THREE.CylinderGeometry(0.035, 0.035, 0.03, 10, 1, true), strap, 0, -0.02, 0);
  for (const x of [-0.025, 0, 0.025]) {
    const s = new THREE.Shape();
    s.moveTo(-0.007, 0);
    s.lineTo(0.007, 0);
    s.lineTo(0.004, 0.3);
    s.lineTo(-0.002, 0.34);
    s.lineTo(-0.007, 0.3);
    s.lineTo(-0.007, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false });
    geo.rotateY(Math.PI / 2);
    const b = add(g, geo, steel, x, 0.06, 0.03);
    b.userData.blade = true;
  }
  markTrail(g, 0.1, 0.4);
  return g;
}

/** A gnarled wooden staff: bent, knotted, thicker toward its head, a few twigs. */
function gnarledStaff(): THREE.Group {
  const g = new THREE.Group();
  const wood = mat(0x5a3a22, 0, 0.8);
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push(new THREE.Vector3(Math.sin(t * 7) * 0.02, -0.55 + t * 1.65, Math.cos(t * 5) * 0.018));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const tube = new THREE.TubeGeometry(curve, 40, 0.02, 8);
  // Thicker toward the head, with knots.
  const p = tube.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) + 0.55) / 1.65;
    const k = 0.85 + 0.45 * t ** 3 + 0.18 * Math.max(0, Math.sin(t * 31)) ** 6;
    const c = curve.getPoint(Math.min(1, Math.max(0, t)));
    p.setX(i, c.x + (p.getX(i) - c.x) * k);
    p.setZ(i, c.z + (p.getZ(i) - c.z) * k);
  }
  tube.computeVertexNormals();
  add(g, tube, wood);
  // The head: a curled knob.
  add(g, new THREE.TorusGeometry(0.035, 0.022, 8, 14, Math.PI * 1.4), wood, 0.02, 1.12, 0).rotation.y = Math.PI / 2;
  for (const [y, a] of [[0.7, 0.7], [0.35, -0.8]] as const) {
    const twig = add(g, new THREE.CylinderGeometry(0.003, 0.008, 0.08, 5), wood, Math.sign(a) * 0.03, y, 0);
    twig.rotation.z = -a;
  }
  markTrail(g, 0.5, 1.12);
  return g;
}

/** A cast-iron frying pan: held by the handle, the pan's face toward the foe. */
function pan(): THREE.Group {
  const g = new THREE.Group();
  const iron = mat(0x2b2b30, 0.6, 0.45);
  const wood = mat(0x6b4426, 0, 0.7);
  add(g, new THREE.CylinderGeometry(0.016, 0.014, 0.16, 8), wood, 0, -0.01, 0);
  add(g, new THREE.CylinderGeometry(0.009, 0.009, 0.1, 6), iron, 0, 0.12, 0);
  const dish = new THREE.CylinderGeometry(0.13, 0.11, 0.035, 24, 1, false);
  dish.rotateX(Math.PI / 2);
  const d = add(g, dish, iron, 0, 0.3, 0);
  d.userData.blade = true;
  markTrail(g, 0.2, 0.43);
  return g;
}

/** A broken bottle held by its neck, the jagged glass up. */
function bottle(): THREE.Group {
  const g = new THREE.Group();
  const glass = new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.75 });
  outlineOf(glass, 0.002);
  add(g, new THREE.CylinderGeometry(0.014, 0.016, 0.1, 10), glass, 0, -0.02, 0);
  add(g, new THREE.CylinderGeometry(0.04, 0.016, 0.05, 12), glass, 0, 0.055, 0);
  add(g, new THREE.CylinderGeometry(0.04, 0.04, 0.08, 12, 1, true), glass, 0, 0.12, 0);
  // The broken edge: shards of different heights.
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const shard = new THREE.ConeGeometry(0.018, 0.05 + ((i * 37) % 5) * 0.012, 3);
    shard.scale(1, 1, 0.3);
    shard.rotateY(-a + Math.PI / 2);
    const m = add(g, shard, glass, Math.cos(a) * 0.035, 0.18 + ((i * 37) % 5) * 0.006, Math.sin(a) * 0.035);
    m.userData.blade = true;
  }
  markTrail(g, 0.08, 0.24);
  return g;
}

/** A chainsaw: the motor block in the hand, the bar and its chain out in front. */
function chainsaw(): THREE.Group {
  const g = new THREE.Group();
  const body = mat(0xe86a12, 0, 0.5);
  const dark = mat(0x26262c, 0.3, 0.5);
  const steel = mat(0xc0c4cc, 1, 0.3, 0.002);
  add(g, new RoundedBoxGeometry(0.09, 0.2, 0.15, 3, 0.02), body, 0, 0.0, -0.02);
  add(g, new THREE.TorusGeometry(0.045, 0.01, 6, 12, Math.PI), dark, 0, 0.05, 0.07).rotation.y = Math.PI / 2;
  add(g, new THREE.BoxGeometry(0.012, 0.5, 0.065), steel, 0, 0.35, -0.02).userData.blade = true;
  // The chain: teeth round the bar.
  for (let i = 0; i < 20; i++) {
    const y = 0.12 + i * 0.024;
    for (const z of [-0.055, 0.015]) add(g, new THREE.BoxGeometry(0.016, 0.012, 0.012), dark, 0, y, z);
  }
  markTrail(g, 0.12, 0.6);
  return g;
}

/** Firearms: the barrel along +Y from the hand, the stock behind, the sights on top. */
function sniper(): THREE.Group {
  const g = new THREE.Group();
  const metal = mat(0x2e3036, 0.7, 0.35);
  const wood = mat(0x5a3a1e, 0, 0.6);
  add(g, new THREE.CylinderGeometry(0.011, 0.013, 0.7, 10), metal, 0, 0.45, 0.02);
  add(g, new RoundedBoxGeometry(0.04, 0.3, 0.06, 2, 0.01), wood, 0, 0.12, 0.0);
  add(g, new RoundedBoxGeometry(0.035, 0.26, 0.09, 2, 0.012), wood, 0, -0.2, -0.015);
  const scope = add(g, new THREE.CylinderGeometry(0.018, 0.018, 0.2, 12), metal, 0, 0.18, 0.06);
  scope.userData.scope = true;
  add(g, new THREE.CylinderGeometry(0.024, 0.02, 0.03, 12), metal, 0, 0.29, 0.06);
  add(g, new THREE.BoxGeometry(0.02, 0.03, 0.06), metal, 0, 0.05, -0.05);
  markTrail(g, 0.2, 0.8);
  return g;
}
function gun(): THREE.Group {
  const g = new THREE.Group();
  const metal = mat(0x2a2b30, 0.7, 0.35);
  add(g, new RoundedBoxGeometry(0.045, 0.24, 0.07, 2, 0.008), metal, 0, 0.12, 0.01);
  add(g, new THREE.CylinderGeometry(0.009, 0.009, 0.14, 8), metal, 0, 0.3, 0.02);
  add(g, new THREE.BoxGeometry(0.03, 0.04, 0.11), metal, 0, 0.0, -0.05).rotation.x = 0.3;
  add(g, new THREE.BoxGeometry(0.025, 0.035, 0.12), metal, 0, 0.16, -0.08);
  markTrail(g, 0.1, 0.37);
  return g;
}
function bazooka(): THREE.Group {
  const g = new THREE.Group();
  const olive = mat(0x4f5a2e, 0.2, 0.6);
  const dark = mat(0x26262c, 0.3, 0.5);
  add(g, new THREE.CylinderGeometry(0.055, 0.055, 0.95, 16, 1, true), olive, 0, 0.22, 0.07);
  add(g, new THREE.CylinderGeometry(0.07, 0.06, 0.08, 16, 1, true), dark, 0, 0.7, 0.07);
  add(g, new THREE.CylinderGeometry(0.065, 0.055, 0.06, 16, 1, true), dark, 0, -0.27, 0.07);
  add(g, new THREE.BoxGeometry(0.03, 0.04, 0.1), dark, 0, 0.0, -0.01);
  markTrail(g, 0.0, 0.75);
  return g;
}

/** Builds a weapon by name, or null for names that are not anime weapons. */
export function buildWeapon(name: string): THREE.Group | null {
  switch (name) {
    case "1H_Katana":
      return katana(0.72, 0.26);
    case "Sakabato": {
      // Reversed edge: the cutting edge on the inside of the curve, toward the wielder.
      const k = katana(0.74, 0.27);
      for (const c of k.children) if (c.userData.blade) c.rotation.y += Math.PI;
      return k;
    }
    case "2H_Odachi":
      return katana(1.05, 0.38, 1.25);
    case "Kunai":
    case "Kunai_Offhand":
      return kunai();
    case "2H_Staff":
      return staff();
    case "Sai":
    case "Sai_Offhand":
      return sai();
    case "Bo":
      return bo();
    case "Nunchaku":
    case "Nunchaku_Offhand":
      return nunchaku();
    case "Mugenjin":
      // Shishio's blade: saw-toothed, dark, its edge notched to hold the flames.
      return katana(0.76, 0.27, 1, { teeth: 22, steel: 0xa8a8b0, hilt: 0x3a1e1a });
    case "Chokuto":
      // Straight, plain, a small guard: the ninja's sword.
      return katana(0.68, 0.22, 1, { curve: 0, hilt: 0x2a2a30, guard: 0.03 });
    case "Claws":
    case "Claws_Offhand":
      return claws();
    case "Staff_Gnarled":
      return gnarledStaff();
    case "Pan":
      return pan();
    case "Bottle":
      return bottle();
    case "Chainsaw":
      return chainsaw();
    case "Sniper":
      return sniper();
    case "Gun":
      return gun();
    case "Bazooka":
      return bazooka();
    default:
      return null;
  }
}
