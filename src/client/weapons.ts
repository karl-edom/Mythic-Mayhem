// Procedural weapons for the anime fighters, built in metres with the blade along +Y
// and the grip at the origin. Thin, clean shapes that read well in cel shading;
// no model files to ship or license.

import * as THREE from "three";
import { noOutline, outlineOf, toon } from "./toon.ts";

export const ANIME_WEAPONS = ["1H_Katana", "2H_Odachi", "Kunai", "Kunai_Offhand", "2H_Staff"] as const;

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
  g.add(blade);
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
  return g;
}

/** Builds a weapon by name, or null for names that are not anime weapons. */
export function buildWeapon(name: string): THREE.Group | null {
  switch (name) {
    case "1H_Katana":
      return katana(0.72, 0.26);
    case "2H_Odachi":
      return katana(1.05, 0.38, 1.25);
    case "Kunai":
    case "Kunai_Offhand":
      return kunai();
    case "2H_Staff":
      return staff();
    default:
      return null;
  }
}
