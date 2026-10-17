// A pizza, as a projectile look: a golden crust ring round a painted top (tomato,
// melted cheese with browned spots, pepperoni, basil), cut in eight. Built in code.

import * as THREE from "three";
import { outlineOf } from "./toon.ts";

let top: THREE.CanvasTexture | null = null;

function topTexture(): THREE.CanvasTexture {
  if (top) return top;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const R = 128;
  let s = 7;
  const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  // Tomato, then cheese melted over most of it in soft lobes.
  g.fillStyle = "#c2321c";
  g.beginPath();
  g.arc(R, R, R, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#f3cf5e";
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * R * 0.82;
    g.beginPath();
    g.arc(R + Math.cos(a) * d, R + Math.sin(a) * d, 14 + r() * 22, 0, Math.PI * 2);
    g.fill();
  }
  // Browned spots on the cheese.
  for (let i = 0; i < 40; i++) {
    const a = r() * Math.PI * 2;
    const d = Math.sqrt(r()) * R * 0.85;
    g.fillStyle = `rgba(190,120,40,${0.25 + r() * 0.3})`;
    g.beginPath();
    g.arc(R + Math.cos(a) * d, R + Math.sin(a) * d, 2 + r() * 5, 0, Math.PI * 2);
    g.fill();
  }
  // Pepperoni: dark rims, glistening tops.
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + r() * 0.4;
    const d = i === 0 ? 0 : R * (0.35 + r() * 0.4);
    const x = R + Math.cos(a) * d;
    const y = R + Math.sin(a) * d;
    g.fillStyle = "#7e1a12";
    g.beginPath();
    g.arc(x, y, 18, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#b2281a";
    g.beginPath();
    g.arc(x, y, 15, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(255,200,170,0.5)";
    g.beginPath();
    g.arc(x - 4, y - 4, 3, 0, Math.PI * 2);
    g.fill();
  }
  // Basil leaves.
  for (let i = 0; i < 5; i++) {
    const a = r() * Math.PI * 2;
    const d = R * (0.2 + r() * 0.55);
    g.save();
    g.translate(R + Math.cos(a) * d, R + Math.sin(a) * d);
    g.rotate(r() * Math.PI);
    g.fillStyle = "#2f7a2a";
    g.beginPath();
    g.ellipse(0, 0, 9, 4.5, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // Eight cuts.
  g.strokeStyle = "rgba(120,60,20,0.55)";
  g.lineWidth = 2;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI;
    g.beginPath();
    g.moveTo(R - Math.cos(a) * R, R - Math.sin(a) * R);
    g.lineTo(R + Math.cos(a) * R, R + Math.sin(a) * R);
    g.stroke();
  }
  top = new THREE.CanvasTexture(c);
  top.colorSpace = THREE.SRGBColorSpace;
  return top;
}

/** A pizza of the given radius, lying in the XZ plane (spin it about Y). */
export function buildPizza(radius: number): THREE.Group {
  const g = new THREE.Group();
  const crustMat = new THREE.MeshStandardMaterial({ color: 0xd99a4e, roughness: 0.75 });
  outlineOf(crustMat, 0.003);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.97, radius * 0.08, 40), crustMat);
  g.add(base);
  const face = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.9, 40), new THREE.MeshStandardMaterial({ map: topTexture(), roughness: 0.55 }));
  face.rotation.x = -Math.PI / 2;
  face.position.y = radius * 0.041;
  g.add(face);
  const crust = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.93, radius * 0.08, 10, 40), crustMat);
  crust.rotation.x = Math.PI / 2;
  crust.position.y = radius * 0.04;
  g.add(crust);
  return g;
}
