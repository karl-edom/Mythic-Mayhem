// Anime look: cel shading (3-tone gradient), ink outlines, and procedural
// textures drawn on canvases (no image files to ship or license).

import * as THREE from "three";

let gradient: THREE.DataTexture | null = null;

/** Three hard light steps: shadow, mid-tone, lit. The core of the cel-shaded look. */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  const steps = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(steps, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = THREE.NearestFilter;
  gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export function toon(color: THREE.ColorRepresentation, map: THREE.Texture | null = null): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ color, map, gradientMap: toonGradient() });
}

/** Effects (glows, rings, sparks) must not get an ink outline. */
export function noOutline<T extends THREE.Material>(m: T): T {
  m.userData.outlineParameters = { visible: false };
  return m;
}

export function outlineOf(m: THREE.Material, thickness: number, color = [0.08, 0.06, 0.1]): void {
  m.userData.outlineParameters = { thickness, color, alpha: 1, visible: true };
}

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return [c, c.getContext("2d")!];
}

/** Deterministic pseudo-random for textures (same look on every load). */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function texture(c: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

/** Painted grass: soft patches of two greens, a few blade strokes. */
export function grassTexture(base = "#8fd16a"): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = seeded(7);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 70; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(70,150,60,0.18)" : "rgba(200,240,140,0.16)";
    g.beginPath();
    g.ellipse(r() * 256, r() * 256, 10 + r() * 30, 6 + r() * 18, r() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = "rgba(60,130,50,0.35)";
  g.lineWidth = 1.5;
  for (let i = 0; i < 220; i++) {
    const x = r() * 256;
    const y = r() * 256;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + (r() - 0.5) * 3, y - 4 - r() * 5);
    g.stroke();
  }
  return texture(c);
}

/** Stone paving: irregular rounded slabs with dark joints. */
export function pavingTexture(base = "#e8d3a8"): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = seeded(11);
  g.fillStyle = "#9c8463";
  g.fillRect(0, 0, 256, 256);
  const rows = 6;
  for (let y = 0; y < rows; y++) {
    const h = 256 / rows;
    let x = y % 2 ? -20 : 0;
    while (x < 256) {
      const w = 34 + r() * 30;
      const shade = 0.9 + r() * 0.2;
      const col = new THREE.Color(base).multiplyScalar(shade);
      g.fillStyle = `#${col.getHexString()}`;
      g.beginPath();
      g.roundRect(x + 2, y * h + 2, w - 4, h - 4, 6);
      g.fill();
      x += w;
    }
  }
  return texture(c);
}

/** Packed earth for a dirt arena floor. */
export function dirtTexture(base = "#e2c48f"): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  const r = seeded(23);
  g.fillStyle = base;
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 400; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(150,110,60,0.12)" : "rgba(255,240,200,0.14)";
    g.beginPath();
    g.arc(r() * 256, r() * 256, 1 + r() * 4, 0, Math.PI * 2);
    g.fill();
  }
  return texture(c);
}

/** Wood planks for crates, terraces and towers. */
export function woodTexture(base = "#d9a46c"): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = seeded(31);
  g.fillStyle = base;
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = "rgba(90,50,20,0.55)";
    g.fillRect(0, i * 32, 128, 2);
  }
  g.strokeStyle = "rgba(110,60,25,0.25)";
  for (let i = 0; i < 30; i++) {
    const y = r() * 128;
    g.beginPath();
    g.moveTo(0, y);
    g.bezierCurveTo(40, y + 3, 80, y - 3, 128, y + r() * 4);
    g.stroke();
  }
  return texture(c);
}

/** Rough stone blocks for walls, ramps and platforms. */
export function stoneTexture(base = "#c9c1b0"): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const r = seeded(43);
  g.fillStyle = "#7d7466";
  g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 4; y++)
    for (let x = -1; x < 4; x++) {
      const ox = (y % 2) * 16;
      const col = new THREE.Color(base).multiplyScalar(0.88 + r() * 0.2);
      g.fillStyle = `#${col.getHexString()}`;
      g.fillRect(x * 32 + ox + 1, y * 32 + 1, 30, 30);
    }
  return texture(c);
}

/** Radial glow (white core, soft falloff): projectiles, auras, flashes. */
export function glowTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,0.8)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Anime impact star: sharp spikes, used for hit sparks. */
export function starTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.translate(128, 128);
  g.fillStyle = "white";
  const spikes = 10;
  g.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const rad = i % 2 === 0 ? 120 - (i % 4) * 25 : 28;
    g.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  g.closePath();
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Magic circle for area specials: rings, runes, a hexagram. Tinted by material colour. */
export function magicCircleTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 512);
  g.translate(256, 256);
  g.strokeStyle = "white";
  g.fillStyle = "white";
  g.lineWidth = 10;
  g.beginPath();
  g.arc(0, 0, 240, 0, Math.PI * 2);
  g.stroke();
  g.lineWidth = 4;
  for (const rad of [210, 150]) {
    g.beginPath();
    g.arc(0, 0, rad, 0, Math.PI * 2);
    g.stroke();
  }
  // Hexagram.
  g.lineWidth = 5;
  for (const off of [0, Math.PI / 3]) {
    g.beginPath();
    for (let i = 0; i <= 3; i++) {
      const a = off + (i / 3) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(Math.cos(a) * 150, Math.sin(a) * 150);
    }
    g.stroke();
  }
  // Rune ticks between the outer rings.
  for (let i = 0; i < 36; i++) {
    g.save();
    g.rotate((i / 36) * Math.PI * 2);
    g.fillRect(-3, -232, 6, i % 3 === 0 ? 18 : 10);
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Puffy anime cloud for the sky. */
export function cloudTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 128);
  const r = seeded(5);
  for (let i = 0; i < 9; i++) {
    const x = 50 + r() * 156;
    const y = 70 - r() * 25;
    const rad = 22 + r() * 26;
    g.fillStyle = "rgba(255,255,255,1)";
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  }
  // Soft blue underside.
  g.globalCompositeOperation = "source-atop";
  const grad = g.createLinearGradient(0, 40, 0, 128);
  grad.addColorStop(0, "rgba(255,255,255,0)");
  grad.addColorStop(1, "rgba(170,200,240,0.8)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
