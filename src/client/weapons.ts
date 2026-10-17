// Procedural weapons for the anime fighters, built in metres with the blade along +Y
// and the grip at the origin. Thin, clean shapes that read well in cel shading;
// no model files to ship or license.

import * as THREE from "three";
import { noOutline, outlineOf, toon } from "./toon.ts";

export const ANIME_WEAPONS = ["1H_Katana", "2H_Odachi", "Kunai", "Kunai_Offhand", "2H_Staff", "Sai", "Sai_Offhand", "Sakabato", "Bo", "Nunchaku", "Nunchaku_Offhand"] as const;

const STEEL = 0xe8eef6;

function part(geo: THREE.BufferGeometry, color: THREE.ColorRepresentation, outline = 0.0025): THREE.Mesh {
  const m = toon(color);
  outlineOf(m, outline);
  const mesh = new THREE.Mesh(geo, m);
  mesh.castShadow = true;
  return mesh;
}

/** Slightly curved single-edged blade (katana family), extruded thin. */
function curvedBlade(length: number, width: number, curve: number): THREE.BufferGeometry {
  const s = new THREE.Shape();
  const n = 12;
  // Back of the blade, then the edge on the way down; the tip is a short diagonal.
  for (let i = 0; i <= n; i++) {
    const y = (i / n) * length;
    s[i === 0 ? "moveTo" : "lineTo"](-width / 2 + curve * (y / length) ** 2, y);
  }
  s.lineTo(width / 2 + curve - width * 0.2, length - width * 1.4);
  for (let i = n; i >= 0; i--) {
    const y = (i / n) * (length - width * 1.4);
    s.lineTo(width / 2 + curve * (y / length) ** 2, y);
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

function katana(bladeLength: number, handle: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const tsuka = part(new THREE.CylinderGeometry(0.017 * scale, 0.017 * scale, handle, 8), 0x1d1b2a);
  tsuka.position.y = -handle / 2 + 0.06;
  g.add(tsuka);
  // Diamond wrap pattern suggested by a few light rings.
  for (let i = 1; i < 5; i++) {
    const ring = part(new THREE.TorusGeometry(0.0175 * scale, 0.003, 4, 10), 0xd8d0c0, 0);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06 - (handle * i) / 5;
    g.add(ring);
  }
  const tsuba = part(new THREE.CylinderGeometry(0.042 * scale, 0.042 * scale, 0.01, 12), 0x8a6a2c);
  tsuba.position.y = 0.07;
  g.add(tsuba);
  const blade = part(curvedBlade(bladeLength, 0.032 * scale, 0.05 * scale), STEEL, 0.002);
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
    default:
      return null;
  }
}
