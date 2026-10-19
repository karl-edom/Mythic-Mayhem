// A swordsman in kimono and hakama, built entirely in code: no model file. Same humanoid
// skeleton (VRM bone names) as the turtle, rigid parts carried by the bones, physically
// based materials with painted cloth: a crossed-collar gi with wide sleeves, pleated
// hakama, an obi with the hakama ties bowed in front, tabi and zōri, a sheath through
// the belt, spiky bangs and a long ponytail that swings.
//
// Generic on purpose: hair and hakama colours come from the fighter's look (`hair`,
// `outfit`), the sword from its `show` list, and so do optional details (a scar,
// `Scar_Cross`). Any character built on it stays a data pack.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { blob, canvas, limb, mergeSimple, seeded, texture } from "./turtle.ts";

/** Bone name, parent, rest position in the model (metres, T-pose, facing +Z). */
export const SWORDSMAN_BONES: [string, string | null, number, number, number][] = [
  ["hips", null, 0, 0.92, 0],
  ["spine", "hips", 0, 1.04, 0],
  ["chest", "spine", 0, 1.2, 0],
  ["neck", "chest", 0, 1.42, 0],
  ["head", "neck", 0, 1.5, 0.01],
  ["leftUpperArm", "chest", 0.18, 1.37, 0],
  ["leftLowerArm", "leftUpperArm", 0.44, 1.37, 0],
  ["leftHand", "leftLowerArm", 0.66, 1.37, 0],
  ["rightUpperArm", "chest", -0.18, 1.37, 0],
  ["rightLowerArm", "rightUpperArm", -0.44, 1.37, 0],
  ["rightHand", "rightLowerArm", -0.66, 1.37, 0],
  ["leftUpperLeg", "hips", 0.1, 0.88, 0],
  ["leftLowerLeg", "leftUpperLeg", 0.1, 0.49, 0],
  ["leftFoot", "leftLowerLeg", 0.1, 0.08, 0],
  ["leftToes", "leftFoot", 0.1, 0.02, 0.11],
  ["rightUpperLeg", "hips", -0.1, 0.88, 0],
  ["rightLowerLeg", "rightUpperLeg", -0.1, 0.49, 0],
  ["rightFoot", "rightLowerLeg", -0.1, 0.08, 0],
  ["rightToes", "rightFoot", -0.1, 0.02, 0.11],
];

/** Height of the model (soles to the top of the hair), metres. */
export const SWORDSMAN_HEIGHT = 1.72;


// ---------------------------------------------------------------------------
// Painted textures.

/** Plain-weave cloth: fine threads, slubs and soft creases. White, tinted by the material. */
function weave(seed: number, slub: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#f2f2f2";
  g.fillRect(0, 0, 256, 256);
  const r = seeded(seed);
  for (let i = 0; i < 256; i += 2) {
    g.fillStyle = `rgba(0,0,0,${0.03 + r() * 0.04})`;
    g.fillRect(0, i, 256, 1);
    g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.03})`;
    g.fillRect(i, 0, 1, 256);
  }
  for (let i = 0; i < 160 * slub; i++) {
    g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,255,255"},${0.05 + r() * 0.08})`;
    g.fillRect(r() * 256, r() * 256, 3 + r() * 14, 1);
  }
  for (let i = 0; i < 14; i++) {
    const x = r() * 256;
    const grad = g.createLinearGradient(x - 10, 0, x + 10, 0);
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(0.5, `rgba(0,0,0,${0.05 + r() * 0.05})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(x - 10, 0, 20, 256);
  }
  return texture(c, true, [3, 3]);
}

/** Soft folds of cloth for a bump map: long creases, mostly along the fall of the fabric. */
function folds(seed: number): THREE.CanvasTexture {
  const [c, g] = canvas(256, 256);
  g.fillStyle = "#808080";
  g.fillRect(0, 0, 256, 256);
  const r = seeded(seed);
  for (let i = 0; i < 26; i++) {
    const x = r() * 256;
    const w = 6 + r() * 18;
    const lean = (r() - 0.5) * 60;
    const grad = g.createLinearGradient(x - w, 0, x + w, 0);
    const dark = r() < 0.5;
    grad.addColorStop(0, "rgba(128,128,128,0)");
    grad.addColorStop(0.5, dark ? `rgba(60,60,60,${0.25 + r() * 0.3})` : `rgba(200,200,200,${0.2 + r() * 0.3})`);
    grad.addColorStop(1, "rgba(128,128,128,0)");
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(x - w, 0);
    g.lineTo(x + w, 0);
    g.lineTo(x + w + lean, 256);
    g.lineTo(x - w + lean, 256);
    g.fill();
  }
  return texture(c, false, [2, 1]);
}

/** Hair: long strands with darker roots between locks and light sheen streaks. */
function hairTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 256);
  g.fillStyle = "#e8e8e8";
  g.fillRect(0, 0, 128, 256);
  const r = seeded(11);
  for (let i = 0; i < 220; i++) {
    const x = r() * 128;
    g.strokeStyle = r() < 0.6 ? `rgba(0,0,0,${0.08 + r() * 0.18})` : `rgba(255,255,255,${0.15 + r() * 0.25})`;
    g.lineWidth = 0.6 + r() * 1.4;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + (r() - 0.5) * 10, 90, x + (r() - 0.5) * 10, 170, x + (r() - 0.5) * 8, 256);
    g.stroke();
  }
  return texture(c, true, [2, 1]);
}

/** Woven straw for the sandal soles. */
function strawTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(64, 128);
  g.fillStyle = "#c9a86a";
  g.fillRect(0, 0, 64, 128);
  for (let y = 0; y < 128; y += 6) {
    g.fillStyle = y % 12 ? "rgba(90,60,20,0.25)" : "rgba(255,240,200,0.25)";
    g.fillRect(0, y, 64, 3);
  }
  return texture(c, true, [1, 1]);
}

// ---------------------------------------------------------------------------
// Geometry helpers.

/**
 * A flared, pleated tube of cloth along Y (open at both ends): `rTop` at `yTop`, `rBot`
 * at `yBot`, deep box pleats round it, a little flattened front to back.
 */
function pleatedTube(yTop: number, yBot: number, rTop: number, rBot: number, pleats: number, depth = 0.85, rows = 8): THREE.BufferGeometry {
  const h = yTop - yBot;
  const g = new THREE.CylinderGeometry(rTop, rBot, h, pleats * 6, rows, true);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const t = 0.5 - p.getY(i) / h; // 0 at the top, 1 at the hem
    // Triangle wave: sharp pressed pleats, deeper toward the hem.
    const tri = Math.abs(((a * pleats) / Math.PI) % 2) - 0.5;
    const k = 1 + tri * (0.03 + 0.05 * t);
    p.setXYZ(i, x * k, p.getY(i), z * k * depth);
  }
  g.computeVertexNormals();
  g.translate(0, (yTop + yBot) / 2, 0);
  return g;
}

/**
 * A kimono sleeve along X from `x0` to `x1` (side ±1): a tube that widens and whose
 * underside hangs down in a deep pocket toward the cuff.
 */
function sleeve(side: number, x0: number, x1: number, r0: number, r1: number, sag: number, y: number): THREE.BufferGeometry {
  const len = Math.abs(x1 - x0);
  const g = new THREE.CylinderGeometry(r1, r0, len, 28, 8, true);
  const p = g.attributes.position!;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / len + 0.5; // 0 at the shoulder end, 1 at the cuff
    const below = Math.max(0, -p.getX(i)); // the side that becomes the underside (−Y) after rotation
    p.setX(i, p.getX(i) - below * sag * t * t);
  }
  g.computeVertexNormals();
  // Cylinder axis Y → X (pointing to the side), its local −X side → world −Y.
  g.rotateZ(-side * Math.PI / 2);
  if (side < 0) g.rotateX(Math.PI);
  g.translate(side * (x0 + x1) / 2, y, 0);
  return g;
}

/**
 * A kimono sleeve as one piece of cloth from the shoulder (`x0`) to the wrist (`x1`),
 * skinned to the chest, upper and lower arm: it bends at the elbow with no seam. Its
 * underside hangs in a pocket (the tamoto) that closes again before the cuff, so the
 * opening at the wrist stays the size of the arm instead of a wide flat disc.
 */
export function skinnedSleeve(c: Ctx, side: number, x0: number, x1: number, r0: number, r1: number, pocket: number, mat: THREE.Material, name: string): THREE.SkinnedMesh {
  const segs = 28;
  const sides = 28;
  const y = 1.372;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const S = THREE.MathUtils.smoothstep;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const x = x0 + (x1 - x0) * t;
    const r = r0 + (r1 - r0) * t;
    // The pocket deepens past the elbow and closes toward the cuff.
    const depth = pocket * S(t, 0.25, 0.7) * (1 - 0.9 * S(t, 0.86, 1));
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const down = Math.max(0, -Math.sin(a));
      // A soft wrinkle round the elbow, where the cloth bunches.
      const bunch = 1 + 0.06 * Math.exp(-(((t - 0.52) / 0.08) ** 2)) * Math.sin(a * 5);
      const dy = Math.sin(a) * r * bunch - depth * down ** 1.5;
      const dz = Math.cos(a) * r * 0.92 * bunch;
      pos.push(side * x, y + dy, dz);
      uv.push(k / sides, t * 2);
    }
  }
  for (let i = 0; i < segs; i++)
    for (let k = 0; k < sides; k++) {
      const a = i * (sides + 1) + k;
      const b = a + sides + 1;
      if (side > 0) idx.push(a, a + 1, b, a + 1, b + 1, b);
      else idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const arm = side > 0 ? "left" : "right";
  return c.skinned(g, mat, name, ["chest", `${arm}UpperArm`, `${arm}LowerArm`], (p) => {
    const ax = Math.abs(p.x);
    const chest = 1 - S(ax, 0.17, 0.25);
    const lower = S(ax, 0.4, 0.49);
    return [chest, Math.max(0, 1 - chest - lower), lower];
  });
}

/**
 * A lock of hair along a smooth curve through `pts`: a flattened, tapering tube whose
 * flat side lies along the surface it grows from (`out` gives the outward direction at
 * a point). It widens from `root` × its width and narrows to a point, or to `end` × its
 * width (locks gathered at a tie). With both at 1: a flat band (a collar).
 */
function lock(pts: THREE.Vector3[], width: number, thick: number, out: (p: THREE.Vector3) => THREE.Vector3, end = 0, root = 0.35): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0.5);
  const segs = 16;
  const sides = 8;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    side.crossVectors(tan, out(p)).normalize();
    up.crossVectors(side, tan).normalize();
    // Full width a little after the root, then tapering.
    const w = width * (root + (1 - root) * Math.min(1, t / 0.2)) * (end + (1 - end) * Math.pow(1 - t, 0.85));
    const h = thick * (w / width);
    for (let k = 0; k <= sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      pos.push(p.x + side.x * Math.cos(a) * w + up.x * Math.sin(a) * h, p.y + side.y * Math.cos(a) * w + up.y * Math.sin(a) * h, p.z + side.z * Math.cos(a) * w + up.z * Math.sin(a) * h);
      uv.push(k / sides, t);
    }
  }
  for (let i = 0; i < segs; i++)
    for (let k = 0; k < sides; k++) {
      const a = i * (sides + 1) + k;
      const b = a + sides + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The face area painted by faceTexture, in model coordinates (metres). */
const FACE = { x0: -0.085, x1: 0.085, y0: 1.45, y1: 1.65 };

/**
 * A thin skin over the front of the head carrying the painted features: a grid cast
 * onto the head's surface from the front, lifted a hair off it.
 */
function faceShell(head: THREE.Mesh[]): THREE.BufferGeometry {
  const n = 48;
  const ray = new THREE.Raycaster();
  const pos: number[] = [];
  const uv: number[] = [];
  const ok: boolean[] = [];
  for (let j = 0; j <= n; j++)
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      const v = j / n;
      const x = FACE.x0 + (FACE.x1 - FACE.x0) * u;
      const y = FACE.y0 + (FACE.y1 - FACE.y0) * v;
      ray.set(new THREE.Vector3(x, y, 0.4), new THREE.Vector3(0, 0, -1));
      const hit = ray.intersectObjects(head, false)[0];
      ok.push(!!hit);
      const p = hit ? hit.point.clone().add(new THREE.Vector3(0, 0, 0.0008)) : new THREE.Vector3(x, y, 0);
      pos.push(p.x, p.y, p.z);
      uv.push(u, v);
    }
  const idx: number[] = [];
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + n + 1;
      if (ok[a] && ok[a + 1] && ok[b] && ok[b + 1]) idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const faces = new Map<string, THREE.CanvasTexture>();

/**
 * The painted face, anime style: almond eyes with a heavy upper lash line flicking out,
 * a large iris with a dark top, a pupil and two highlights, a lid crease, fine brows, a
 * hint of nose, a small mouth; optionally a cross-shaped scar on the left cheek.
 */
export interface FaceStyle {
  brows?: string;
  iris?: string;
  scar?: boolean;
  /** calm (default): soft; fierce: narrowed eyes, brows drawn down; wild: eyes wide, a grin. */
  mood?: "calm" | "fierce" | "wild";
  /** Three marks on each cheek. */
  whiskers?: boolean;
  /** The whole face wrapped in bandages, the eyes in shadow. */
  bandaged?: boolean;
}

function faceTexture(o: FaceStyle): THREE.CanvasTexture {
  const key = JSON.stringify(o);
  const cached = faces.get(key);
  if (cached) return cached;
  const W = 512;
  const H = Math.round((W * (FACE.y1 - FACE.y0)) / (FACE.x1 - FACE.x0));
  const [c, g] = canvas(W, H);
  const P = (x: number, y: number): [number, number] => [((x - FACE.x0) / (FACE.x1 - FACE.x0)) * W, (1 - (y - FACE.y0) / (FACE.y1 - FACE.y0)) * H];
  const m = W / (FACE.x1 - FACE.x0); // pixels per metre
  const iris = new THREE.Color(o.iris ?? "#6b4596");
  const irisDark = iris.clone().multiplyScalar(0.35);
  const brow = o.brows ?? "#3a2418";
  const mood = o.mood ?? "calm";
  // Eye opening and iris size by mood.
  const open = (mood === "fierce" ? 0.72 : mood === "wild" ? 1.25 : 1) * 1.18;
  const irisK = mood === "wild" ? 0.72 : 1;
  g.lineCap = "round";
  g.lineJoin = "round";
  if (o.bandaged) {
    // Bandages wound across the face, overlapping, with a dark hollow round the eyes.
    const r = seeded(4);
    g.fillStyle = "#cdbf9f";
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) {
      const y = (i / 26) * H + (r() - 0.5) * 8;
      g.save();
      g.translate(W / 2, y);
      g.rotate((r() - 0.5) * 0.5);
      const grad = g.createLinearGradient(0, -9, 0, 9);
      grad.addColorStop(0, "#a8987a");
      grad.addColorStop(0.3, "#e0d4b8");
      grad.addColorStop(1, "#9e8f70");
      g.fillStyle = grad;
      g.fillRect(-W, -9, W * 2, 18);
      g.strokeStyle = "rgba(90,70,50,0.35)";
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(-W, 9);
      g.lineTo(W, 9);
      g.stroke();
      g.restore();
    }
    for (const s of [-1, 1]) {
      const [cx, cy] = P(s * 0.032, 1.578);
      const shade = g.createRadialGradient(cx, cy, 4, cx, cy, 0.03 * m);
      shade.addColorStop(0, "rgba(20,12,10,0.95)");
      shade.addColorStop(0.6, "rgba(30,20,15,0.8)");
      shade.addColorStop(1, "rgba(30,20,15,0)");
      g.fillStyle = shade;
      g.beginPath();
      g.ellipse(cx, cy, 0.03 * m, 0.016 * m, s * 0.15, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Modelling painted under the features: the face turns away toward the temples and
  // the jaw (darker, warmer), the fringe casts a soft shadow across the brow, and the
  // lids carry a touch of colour.
  if (!o.bandaged) {
    for (const s of [-1, 1]) {
      const [x0] = P(s * 0.045, 0);
      const [x1] = P(s * 0.088, 0);
      const side = g.createLinearGradient(x0, 0, x1, 0);
      side.addColorStop(0, "rgba(170,85,70,0)");
      side.addColorStop(1, "rgba(150,70,60,0.32)");
      g.fillStyle = side;
      g.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), H);
    }
    const [, yb0] = P(0, 1.65);
    const [, yb1] = P(0, 1.612);
    const fringe = g.createLinearGradient(0, yb0, 0, yb1);
    fringe.addColorStop(0, "rgba(110,50,45,0.38)");
    fringe.addColorStop(1, "rgba(110,50,45,0)");
    g.fillStyle = fringe;
    g.fillRect(0, yb0, W, yb1 - yb0);
    const [, yj0] = P(0, 1.505);
    const [, yj1] = P(0, 1.45);
    const jaw = g.createLinearGradient(0, yj0, 0, yj1);
    jaw.addColorStop(0, "rgba(150,70,60,0)");
    jaw.addColorStop(1, "rgba(150,70,60,0.22)");
    g.fillStyle = jaw;
    g.fillRect(0, yj0, W, yj1 - yj0);
    for (const s of [-1, 1]) {
      const [ex, ey] = P(s * 0.033, 1.589);
      const lid = g.createRadialGradient(ex, ey, 0, ex, ey, 0.02 * m);
      lid.addColorStop(0, "rgba(190,80,85,0.28)");
      lid.addColorStop(1, "rgba(190,80,85,0)");
      g.fillStyle = lid;
      g.beginPath();
      g.ellipse(ex, ey, 0.022 * m, 0.011 * m, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (const s of [-1, 1]) {
    const [cx, cy] = P(s * 0.032, 1.578);
    const hw = 0.0205 * m;
    const inner = cx - s * hw;
    const outer = cx + s * hw;
    // Almond: the upper lid arches high and lifts at the outer corner, the lower is flatter.
    const almond = () => {
      g.beginPath();
      g.moveTo(inner, cy + 2);
      g.bezierCurveTo(inner + s * hw * 0.4, cy - 0.0105 * m * open, outer - s * hw * 0.35, cy - 0.011 * m * open, outer, cy - 0.0035 * m);
      g.bezierCurveTo(outer - s * hw * 0.3, cy + 0.006 * m * open, inner + s * hw * 0.4, cy + 0.0065 * m * open, inner, cy + 2);
      g.closePath();
    };
    g.save();
    almond();
    g.fillStyle = "#f8f4ee";
    g.fill();
    g.clip();
    // Iris, a little toward the nose, its top hidden under the lid.
    const ix = cx - s * 0.002 * m;
    const iy = cy - 0.001 * m;
    const ir = 0.0099 * m * irisK;
    const grad = g.createLinearGradient(0, iy - ir, 0, iy + ir);
    grad.addColorStop(0, `#${irisDark.getHexString()}`);
    grad.addColorStop(0.55, `#${iris.getHexString()}`);
    grad.addColorStop(1, `#${iris.clone().lerp(new THREE.Color("#ffffff"), 0.35).getHexString()}`);
    g.fillStyle = grad;
    g.beginPath();
    g.ellipse(ix, iy, ir * 0.85, ir, 0, 0, Math.PI * 2);
    g.fill();
    // Fibres radiating from the pupil, a glow low in the iris, a dark ring round it.
    const rs = seeded(s > 0 ? 3 : 4);
    for (let k = 0; k < 40; k++) {
      const a = (k / 40) * Math.PI * 2 + rs() * 0.1;
      g.strokeStyle = rs() < 0.5 ? `rgba(255,255,255,${0.08 + rs() * 0.12})` : `rgba(0,0,0,${0.1 + rs() * 0.15})`;
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(ix + Math.cos(a) * ir * 0.3, iy + Math.sin(a) * ir * 0.38);
      g.lineTo(ix + Math.cos(a) * ir * 0.8, iy + Math.sin(a) * ir * 0.95);
      g.stroke();
    }
    const glow = g.createRadialGradient(ix, iy + ir * 0.55, 1, ix, iy + ir * 0.55, ir * 0.7);
    glow.addColorStop(0, `#${iris.clone().lerp(new THREE.Color("#ffffff"), 0.55).getHexString()}`);
    glow.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = glow;
    g.globalAlpha = 0.6;
    g.beginPath();
    g.ellipse(ix, iy, ir * 0.85, ir, 0, 0, Math.PI * 2);
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = `#${irisDark.clone().multiplyScalar(0.6).getHexString()}`;
    g.lineWidth = 3;
    g.beginPath();
    g.ellipse(ix, iy, ir * 0.85, ir, 0, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = "#140a12";
    g.beginPath();
    g.ellipse(ix, iy + 1, ir * 0.32, ir * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    // Shadow of the upper lid across the white and the iris.
    const lid = g.createLinearGradient(0, cy - 0.011 * m, 0, cy);
    lid.addColorStop(0, "rgba(70,35,35,0.55)");
    lid.addColorStop(1, "rgba(70,35,35,0)");
    g.fillStyle = lid;
    g.fillRect(cx - hw - 4, cy - 0.012 * m, hw * 2 + 8, 0.012 * m);
    g.fillStyle = "#ffffff";
    g.beginPath();
    g.arc(ix + s * ir * 0.35, iy - ir * 0.4, ir * 0.24, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.arc(ix - s * ir * 0.3, iy + ir * 0.45, ir * 0.11, 0, Math.PI * 2);
    g.fill();
    g.restore();
    // Upper lash line: heavy, thickening outward, with a flick at the outer corner.
    g.strokeStyle = "#1a100c";
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(inner + s * 2, cy - 1);
    g.bezierCurveTo(inner + s * hw * 0.4, cy - 0.0108 * m * open, outer - s * hw * 0.35, cy - 0.0113 * m * open, outer + s * 4, cy - 0.0045 * m);
    g.stroke();
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(outer - s * 6, cy - 0.0062 * m);
    g.lineTo(outer + s * 0.004 * m, cy - 0.0075 * m);
    g.stroke();
    // Lower lashes: a fine line on the outer half.
    g.strokeStyle = "rgba(70,40,30,0.8)";
    g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(cx, cy + 0.0062 * m);
    g.quadraticCurveTo(outer - s * hw * 0.3, cy + 0.0058 * m, outer, cy - 0.0028 * m);
    g.stroke();
    // Lid crease.
    g.strokeStyle = "rgba(120,70,55,0.45)";
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(inner + s * hw * 0.35, cy - 0.0125 * m);
    g.quadraticCurveTo(cx + s * hw * 0.2, cy - 0.0155 * m, outer - s * 3, cy - 0.0095 * m);
    g.stroke();
    // Brow: fine, tapering outward; drawn down at the inner end when fierce, flung up when wild.
    if (o.bandaged) continue;
    const tilt = mood === "fierce" ? -0.006 : mood === "wild" ? 0.006 : 0;
    const [bx0, by0] = P(s * 0.011, 1.606 + tilt);
    const [bx1, by1] = P(s * 0.056, 1.603 - tilt * 0.3 + (mood === "wild" ? 0.003 : 0));
    g.strokeStyle = brow;
    for (let k = 0; k < 6; k++) {
      g.lineWidth = 6 - k * 0.7;
      g.beginPath();
      g.moveTo(bx0 + s * k * 6, by0 + k * 0.2);
      g.quadraticCurveTo((bx0 + bx1) / 2, by0 - 7, bx1, by1 + 1);
      g.stroke();
    }
  }
  // Warmth: a blush on the cheeks and the tip of the nose, painted very softly.
  if (!o.bandaged)
    for (const [x, y, rx, a] of [[-0.045, 1.535, 0.022, 0.22], [0.045, 1.535, 0.022, 0.22], [0, 1.546, 0.008, 0.12]] as const) {
      const [bx, by] = P(x, y);
      const bl = g.createRadialGradient(bx, by, 0, bx, by, rx * m);
      bl.addColorStop(0, `rgba(235,120,110,${a})`);
      bl.addColorStop(1, "rgba(235,120,110,0)");
      g.fillStyle = bl;
      g.beginPath();
      g.ellipse(bx, by, rx * m, rx * m * 0.6, 0, 0, Math.PI * 2);
      g.fill();
    }
  // Nose: just the shadow under its tip, and a touch along one side.
  if (!o.bandaged) {
    const [nx, ny] = P(0.0, 1.543);
    g.strokeStyle = "rgba(150,85,65,0.55)";
    g.lineWidth = 2.5;
    g.beginPath();
    g.moveTo(nx - 7, ny);
    g.quadraticCurveTo(nx, ny + 3, nx + 6, ny - 1);
    g.stroke();
    g.strokeStyle = "rgba(170,110,90,0.25)";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(nx - 4, ny - 30);
    g.lineTo(nx - 6, ny - 6);
    g.stroke();
  }
  // Whiskers: three dark marks across each cheek.
  if (o.whiskers)
    for (const s of [-1, 1])
      for (let k = 0; k < 3; k++) {
        const [a, b] = P(s * 0.03, 1.54 - k * 0.008);
        const [c2, d] = P(s * 0.062, 1.543 - k * 0.011);
        g.strokeStyle = "rgba(60,35,30,0.8)";
        g.lineWidth = 2.2;
        g.beginPath();
        g.moveTo(a, b);
        g.lineTo(c2, d);
        g.stroke();
      }
  // Mouth: a wild open grin with teeth, a hard line when fierce, else small and calm.
  if (mood === "wild") {
    const [mx, my] = P(0, 1.51);
    g.fillStyle = "#3a1512";
    g.beginPath();
    g.moveTo(mx - 24, my - 4);
    g.quadraticCurveTo(mx, my + 2, mx + 24, my - 4);
    g.quadraticCurveTo(mx, my + 26, mx - 24, my - 4);
    g.fill();
    g.fillStyle = "#f6f1e6";
    g.beginPath();
    g.moveTo(mx - 21, my - 2);
    g.quadraticCurveTo(mx, my + 4, mx + 21, my - 2);
    g.quadraticCurveTo(mx, my + 10, mx - 21, my - 2);
    g.fill();
    g.strokeStyle = "#5a2a22";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(mx - 24, my - 4);
    g.quadraticCurveTo(mx, my + 2, mx + 24, my - 4);
    g.quadraticCurveTo(mx, my + 26, mx - 24, my - 4);
    g.stroke();
  } else {
    const [mx, my] = P(0, 1.508);
    g.strokeStyle = "#7e3e34";
    g.lineWidth = 2.6;
    g.beginPath();
    g.moveTo(mx - 17, my);
    g.quadraticCurveTo(mx, my + (mood === "fierce" ? -1.5 : 2.5), mx + 17, my - 0.5);
    g.stroke();
    g.strokeStyle = "rgba(200,105,95,0.5)";
    g.lineWidth = 4;
    g.beginPath();
    g.moveTo(mx - 8, my + 8);
    g.quadraticCurveTo(mx, my + 10, mx + 8, my + 8);
    g.stroke();
  }
  // Scar: two thin healed cuts crossing on the left cheek, the long one slanting down
  // toward the nose.
  if (o.scar) {
    const cut = (x0: number, y0: number, x1: number, y1: number, w: number) => {
      const [a, b] = P(x0, y0);
      const [c2, d] = P(x1, y1);
      g.strokeStyle = "rgba(240,190,175,0.7)";
      g.lineWidth = w + 2;
      g.beginPath();
      g.moveTo(a, b);
      g.lineTo(c2, d);
      g.stroke();
      g.strokeStyle = "#a4443a";
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(a, b);
      g.lineTo(c2, d);
      g.stroke();
    };
    cut(0.056, 1.552, 0.039, 1.53, 1.6);
    cut(0.04, 1.548, 0.054, 1.535, 1.4);
  }
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  faces.set(key, t);
  return t;
}

// ---------------------------------------------------------------------------

/** Cloth of one colour channel (main, accent, trim): woven, with soft folds; tinted by the look. */
function clothMaterial(name: string, color: string, seed: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    name, color, map: weave(seed, 1 + (seed % 2)), bumpMap: folds(seed + 2), bumpScale: 2.2, roughness: 0.9,
    sheen: 0.25, sheenColor: new THREE.Color("#ffffff"), sheenRoughness: 0.85, side: THREE.DoubleSide,
  });
}

export interface HumanMaterials {
  skin: THREE.MeshPhysicalMaterial;
  /** Colour channels: main garment (`outfit`), accent (`accent`), trim (`trim`). */
  cloth1: THREE.MeshPhysicalMaterial;
  cloth2: THREE.MeshPhysicalMaterial;
  cloth3: THREE.MeshPhysicalMaterial;
  hair: THREE.MeshPhysicalMaterial;
  tabi: THREE.MeshStandardMaterial;
  straw: THREE.MeshStandardMaterial;
  thong: THREE.MeshStandardMaterial;
  lacquer: THREE.MeshPhysicalMaterial;
  brass: THREE.MeshPhysicalMaterial;
  face: THREE.MeshPhysicalMaterial;
  leather: THREE.MeshPhysicalMaterial;
  metal: THREE.MeshPhysicalMaterial;
  white: THREE.MeshPhysicalMaterial;
  gold: THREE.MeshPhysicalMaterial;
  bandage: THREE.MeshPhysicalMaterial;
  fur: THREE.MeshPhysicalMaterial;
  fur2: THREE.MeshPhysicalMaterial;
  dark: THREE.MeshStandardMaterial;
}

let shared: HumanMaterials | null = null;

/** Bandage strips, wound and overlapping. */
function bandageTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 256);
  g.fillStyle = "#d3c6a6";
  g.fillRect(0, 0, 128, 256);
  const r = seeded(17);
  for (let y = -10; y < 266; y += 11 + r() * 5) {
    g.save();
    g.translate(64, y);
    g.rotate((r() - 0.5) * 0.35);
    const grad = g.createLinearGradient(0, -6, 0, 6);
    grad.addColorStop(0, "#9c8c6c");
    grad.addColorStop(0.35, "#e2d7bd");
    grad.addColorStop(1, "#a39374");
    g.fillStyle = grad;
    g.fillRect(-90, -6, 180, 12);
    g.restore();
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = `rgba(90,60,40,${0.05 + r() * 0.1})`;
    g.beginPath();
    g.arc(r() * 128, r() * 256, 3 + r() * 10, 0, Math.PI * 2);
    g.fill();
  }
  return texture(c, true, [3, 2]);
}

/** Fur: dense short strands, darker at the roots, lighter tips. White, tinted by the material. */
function furTexture(seed: number): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const [c, g] = canvas(256, 256);
  const [cb, gb] = canvas(256, 256);
  g.fillStyle = "#d8d8d8";
  g.fillRect(0, 0, 256, 256);
  gb.fillStyle = "#808080";
  gb.fillRect(0, 0, 256, 256);
  const r = seeded(seed);
  for (let i = 0; i < 4200; i++) {
    const x = r() * 256;
    const y = r() * 256;
    const a = Math.PI / 2 + (r() - 0.5) * 0.9;
    const l = 4 + r() * 7;
    const shade = r();
    g.strokeStyle = shade < 0.5 ? `rgba(0,0,0,${0.08 + r() * 0.15})` : `rgba(255,255,255,${0.15 + r() * 0.25})`;
    gb.strokeStyle = shade < 0.5 ? "rgba(40,40,40,0.4)" : "rgba(220,220,220,0.4)";
    for (const [ctx] of [[g], [gb]] as const) {
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
  }
  return { map: texture(c, true, [3, 3]), bump: texture(cb, false, [3, 3]) };
}

function materials(): HumanMaterials {
  if (shared) return shared;
  const fur = furTexture(31);
  shared = {
    skin: new THREE.MeshPhysicalMaterial({
      name: "skin", color: "#e0a786", roughness: 0.72, sheen: 0.18, sheenColor: new THREE.Color("#ff9f86"), sheenRoughness: 0.7,
    }),
    cloth1: clothMaterial("cloth1", "#8a8276", 7),
    cloth2: clothMaterial("cloth2", "#e8e1d0", 5),
    cloth3: clothMaterial("cloth3", "#8d867b", 11),
    hair: new THREE.MeshPhysicalMaterial({
      name: "hair", color: "#1d1612", map: hairTexture(), roughness: 0.5, sheen: 0.35, sheenColor: new THREE.Color("#ffd0b0"), sheenRoughness: 0.4,
      clearcoat: 0.2, clearcoatRoughness: 0.4, side: THREE.DoubleSide,
    }),
    tabi: new THREE.MeshStandardMaterial({ name: "tabi", color: "#f1eee6", roughness: 0.9 }),
    straw: new THREE.MeshStandardMaterial({ name: "straw", color: "#ffffff", map: strawTexture(), roughness: 0.95 }),
    thong: new THREE.MeshStandardMaterial({ name: "thong", color: "#e9e2d0", roughness: 0.8 }),
    lacquer: new THREE.MeshPhysicalMaterial({ name: "lacquer", color: "#4a1d12", roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15 }),
    face: new THREE.MeshPhysicalMaterial({
      name: "face", map: faceTexture({}), transparent: true, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false,
    }),
    brass: new THREE.MeshPhysicalMaterial({ name: "brass", color: "#b08a3e", metalness: 0.85, roughness: 0.35 }),
    leather: new THREE.MeshPhysicalMaterial({ name: "leather", color: "#1e1a1c", roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.4 }),
    metal: new THREE.MeshPhysicalMaterial({ name: "metal", color: "#4a4d55", metalness: 0.9, roughness: 0.32, clearcoat: 0.3 }),
    white: new THREE.MeshPhysicalMaterial({ name: "white", color: "#f3f2ee", roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
    gold: new THREE.MeshPhysicalMaterial({ name: "gold", color: "#d8a83a", metalness: 0.6, roughness: 0.35, clearcoat: 0.4 }),
    bandage: new THREE.MeshPhysicalMaterial({ name: "bandage", color: "#ffffff", map: bandageTexture(), roughness: 0.9, sheen: 0.2 }),
    fur: new THREE.MeshPhysicalMaterial({ name: "fur", color: "#8a6a4a", map: fur.map, bumpMap: fur.bump, bumpScale: 3, roughness: 0.95, sheen: 0.6, sheenColor: new THREE.Color("#ffffff"), sheenRoughness: 0.6 }),
    fur2: new THREE.MeshPhysicalMaterial({ name: "fur2", color: "#e8d8b8", map: fur.map, bumpMap: fur.bump, bumpScale: 3, roughness: 0.95, sheen: 0.6, sheenColor: new THREE.Color("#ffffff"), sheenRoughness: 0.6 }),
    dark: new THREE.MeshStandardMaterial({ name: "dark", color: "#1d1612", roughness: 0.6 }),
  };
  return shared;
}

/** What a part builder works with: the rig being built and helpers to hang pieces on it. */
export interface Ctx {
  rig: THREE.Group;
  M: HumanMaterials;
  world: Map<string, THREE.Vector3>;
  bones: Map<string, THREE.Bone>;
  /** The part being built: every piece added is tagged with it (see paintSwordsman). */
  part: string;
  /** Adds a mesh to a bone, the geometry given in model (T-pose world) coordinates. */
  put: (bone: string, geo: THREE.BufferGeometry, mat: THREE.Material, name?: string) => THREE.Mesh;
  /** Cloth deformed by several bones (skinning), weighted by rest position. */
  skinned: (geo: THREE.BufferGeometry, mat: THREE.Material, name: string, names: string[], weights: (p: THREE.Vector3) => number[]) => THREE.SkinnedMesh;
  /** Hangs an object on a bone, placed at `at` (model coordinates). */
  attach: (bone: string, obj: THREE.Object3D, at: THREE.Vector3) => void;
  /** Body profile: torso radius (x) at a height; its depth is DEPTH × that. */
  torsoR: (y: number) => number;
  /** A shell round the torso between two heights, `k` × the body, open at the front by `gap` radians. */
  shell: (y0: number, y1: number, k: number, gap?: number, segs?: number) => THREE.BufferGeometry;
}

export const DEPTH = 0.68;
const TORSO: [number, number][] = [[0.9, 0.172], [1.0, 0.176], [1.1, 0.182], [1.2, 0.19], [1.29, 0.196], [1.35, 0.19], [1.39, 0.172], [1.42, 0.135], [1.445, 0.075]];
const torsoR = (y: number) => {
  if (y <= TORSO[0]![0]) return TORSO[0]![1];
  for (let i = 1; i < TORSO.length; i++) {
    const [y0, r0] = TORSO[i - 1]!;
    const [y1, r1] = TORSO[i]!;
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return TORSO.at(-1)![1];
};

/**
 * Parts of the figure, by name. A look's `show` list picks them; in each category the
 * first one listed wins, else the category's default (see DEFAULTS). Parts outside the
 * categories (a sheath, a scar, a headband…) are shown when named.
 */
const CATEGORIES: Record<string, string[]> = {
  top: ["Gi", "Haori", "Gi_Short", "Vest", "Jacket", "Shirt_Collar", "Bodysuit", "Robe_Tattered", "Armor_Shredder", "Hoodie", "Top_None"],
  bottom: ["Hakama", "Pants_Baggy", "Pants_Short", "Pants_Ninja", "Bodysuit_Legs", "Bottom_None"],
  feet: ["Zori", "Boots_Martial", "Boots_White", "Boots_Black", "Sandals_Ninja", "Sandals_Wrapped", "Sneakers", "Feet_Paws"],
  hair: ["Hair_Kenshin", "Hair_Saito", "Hair_Goku", "Hair_Vegeta", "Hair_Spiky", "Hair_Sasuke", "Hair_Shishio", "Hair_None"],
  head: ["Head_Human", "Head_Rat", "Head_Squirrel", "Head_Teddy"],
  build: ["Build_Lean", "Build_Muscular", "Build_Plush"],
};
const DEFAULTS: Record<string, string> = { top: "Gi", bottom: "Hakama", feet: "Zori", hair: "Hair_Kenshin", head: "Head_Human", build: "Build_Lean" };

/** The parts a look shows. */
export function partsOf(show: string[]): Set<string> {
  const on = new Set(show);
  for (const [cat, names] of Object.entries(CATEGORIES)) {
    const pick = names.find((n) => on.has(n)) ?? DEFAULTS[cat]!;
    for (const n of names) on.delete(n);
    on.add(pick);
  }
  return on;
}

type PartBuilder = (c: Ctx) => void;
const PARTS = new Map<string, PartBuilder>();
/** Registers part builders (the clothing and creature modules add theirs). */
export function defineParts(parts: Record<string, PartBuilder>): void {
  for (const [k, v] of Object.entries(parts)) PARTS.set(k, v);
}

/**
 * The figure in T-pose, facing +Z, feet at y = 0, with every part built (hidden or
 * shown per instance). Bones are plain objects with the VRM humanoid names; each piece
 * hangs from the bone that moves it.
 */
export function buildSwordsmanRig(): THREE.Group {
  const M = materials();
  const rig = new THREE.Group();
  rig.name = "swordsman";
  const world = new Map<string, THREE.Vector3>();
  const bones = new Map<string, THREE.Bone>();
  for (const [name, parent, x, y, z] of SWORDSMAN_BONES) {
    const b = new THREE.Bone();
    b.name = name;
    const w = new THREE.Vector3(x, y, z);
    world.set(name, w);
    const pw = parent ? world.get(parent)! : new THREE.Vector3();
    b.position.copy(w.clone().sub(pw));
    (parent ? bones.get(parent)! : rig).add(b);
    bones.set(name, b);
  }
  const c: Ctx = {
    rig, M, world, bones, part: "", torsoR,
    put: (bone, geo, mat, name = "") => {
      const w = world.get(bone)!;
      geo.translate(-w.x, -w.y, -w.z);
      const m = new THREE.Mesh(geo, mat);
      m.name = name;
      m.castShadow = true;
      m.receiveShadow = true;
      if (c.part) m.userData.part = c.part;
      bones.get(bone)!.add(m);
      return m;
    },
    skinned: (geo, mat, name, names, weights) => {
      const pos = geo.attributes.position!;
      const index = new Uint16Array(pos.count * 4);
      const weight = new Float32Array(pos.count * 4);
      const p = new THREE.Vector3();
      for (let i = 0; i < pos.count; i++) {
        const w = weights(p.fromBufferAttribute(pos, i));
        const sum = w.reduce((a, b) => a + b, 0) || 1;
        w.slice(0, 4).forEach((v, k) => {
          index[i * 4 + k] = k;
          weight[i * 4 + k] = v / sum;
        });
      }
      geo.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(index, 4));
      geo.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weight, 4));
      const mesh = new THREE.SkinnedMesh(geo, mat);
      mesh.name = name;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (c.part) mesh.userData.part = c.part;
      rig.add(mesh);
      rig.updateMatrixWorld(true);
      mesh.bind(new THREE.Skeleton(names.map((n) => bones.get(n)!)));
      return mesh;
    },
    attach: (bone, obj, at) => {
      obj.position.copy(at).sub(world.get(bone)!);
      if (c.part) obj.userData.part = c.part;
      bones.get(bone)!.add(obj);
    },
    shell: (y0, y1, k, gap = 0, segs = 48) => {
      const pts: THREE.Vector2[] = [];
      const n = Math.max(2, Math.round((y1 - y0) / 0.02));
      for (let i = 0; i <= n; i++) {
        const y = y0 + ((y1 - y0) * i) / n;
        pts.push(new THREE.Vector2(torsoR(y) * k, y));
      }
      const g = new THREE.LatheGeometry(pts, segs, gap / 2, Math.PI * 2 - gap);
      g.scale(1, 1, DEPTH);
      return g;
    },
  };
  buildBody(c);
  for (const [name, build] of PARTS) {
    c.part = name;
    build(c);
  }
  c.part = "";
  // A touch big, so the face reads from the arena camera.
  bones.get("head")!.scale.setScalar(1.1);
  rig.updateMatrixWorld(true);
  return rig;
}

/** The body under the clothes: torso, neck, arms, hands, legs (always there). */
function buildBody(c: Ctx): void {
  const { M, put } = c;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  put("spine", c.shell(0.88, 1.17, 0.95), M.skin, "body");
  put("chest", c.shell(1.1, 1.445, 0.95), M.skin, "body");
  put("neck", limb(V(0, 1.4, 0.0), V(0, 1.52, 0.01), 0.047, 0.043), M.skin);
  for (const s of [1, -1]) {
    const side = s > 0 ? "left" : "right";
    const sx = (x: number) => s * x;
    // Fist: the palm, then four fingers curled in three joints (out from the knuckles,
    // down, back under the palm), a little shorter toward the little finger, the
    // knuckles standing out; the thumb across.
    const fist = new RoundedBoxGeometry(0.08, 0.072, 0.078, 3, 0.024);
    fist.translate(sx(0.698), 1.366, 0.004);
    put(`${side}Hand`, fist, M.skin, "hand");
    const bone = (len: number, r: number, axis: "x" | "y", x: number, y: number, z: number) => {
      const f = new THREE.CapsuleGeometry(r, len, 4, 10);
      if (axis === "x") f.rotateZ(Math.PI / 2);
      f.translate(sx(x), y, z);
      put(`${side}Hand`, f, M.skin, "hand");
    };
    for (let k = 0; k < 4; k++) {
      const z = 0.029 - k * 0.0195;
      const r = 0.0112 - k * 0.0007;
      const short = k * 0.002;
      bone(0.02 - short, r, "x", 0.744, 1.384, z); // proximal, the knuckle at its root
      bone(0.016 - short, r * 0.95, "y", 0.758, 1.362, z); // middle, turned down
      bone(0.012 - short, r * 0.9, "x", 0.746, 1.341, z); // tip, back under the palm
      put(`${side}Hand`, blob(0.011, 0.009, 0.0095).translate(sx(0.734), 1.392, z), M.skin, "hand"); // knuckle
    }
    const thumb = new THREE.CapsuleGeometry(0.014, 0.035, 4, 8);
    thumb.rotateZ(Math.PI / 2);
    thumb.translate(sx(0.705), 1.338, 0.045);
    put(`${side}Hand`, thumb, M.skin, "hand");
    // Legs (bare under the clothes).
    put(`${side}UpperLeg`, limb(V(sx(0.1), 0.86, 0), V(sx(0.1), 0.52, 0), 0.08, 0.06), M.skin, "leg");
    put(`${side}LowerLeg`, limb(V(sx(0.1), 0.5, 0), V(sx(0.1), 0.1, 0), 0.058, 0.042), M.skin, "leg");
  }
}

// ---------------------------------------------------------------------------
// The swordsman's own parts (the first of the collection).

defineParts({
  Build_Lean: (c) => {
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    for (const s of [1, -1]) {
      const side = s > 0 ? "left" : "right";
      c.put(`${side}UpperArm`, limb(V(s * 0.2, 1.37, 0), V(s * 0.44, 1.37, 0), 0.055, 0.045), c.M.skin, "arm");
      c.put(`${side}LowerArm`, limb(V(s * 0.45, 1.37, 0), V(s * 0.64, 1.37, 0), 0.045, 0.034), c.M.skin, "arm");
    }
  },
  Build_Muscular: (c) => {
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    for (const s of [1, -1]) {
      const side = s > 0 ? "left" : "right";
      const sx = (x: number) => s * x;
      c.put(`${side}UpperArm`, blob(0.085, 0.075, 0.08).translate(sx(0.2), 1.385, 0), c.M.skin, "arm"); // deltoid
      c.put(`${side}UpperArm`, limb(V(sx(0.2), 1.37, 0), V(sx(0.44), 1.37, 0), 0.068, 0.054), c.M.skin, "arm");
      c.put(`${side}UpperArm`, blob(0.06, 0.05, 0.05).translate(sx(0.33), 1.39, 0.02), c.M.skin, "arm"); // biceps
      c.put(`${side}LowerArm`, limb(V(sx(0.45), 1.37, 0), V(sx(0.64), 1.37, 0), 0.056, 0.04), c.M.skin, "arm");
      c.put(`${side}LowerArm`, blob(0.05, 0.048, 0.05).translate(sx(0.5), 1.375, 0.005), c.M.skin, "arm");
      // Pectorals, and the abdomen in relief (seen through open clothes).
      c.put("chest", blob(0.085, 0.06, 0.04).translate(sx(0.075), 1.33, 0.105), c.M.skin, "body").userData.relief = true;
    }
    for (let k = 0; k < 3; k++)
      for (const s of [-1, 1]) c.put("spine", blob(0.034, 0.028, 0.02).translate(s * 0.036, 1.16 - k * 0.07, 0.108), c.M.skin, "body").userData.relief = true;
  },
  Gi: (c) => {
    const { M, put } = c;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    put("spine", c.shell(0.9, 1.17, 1), M.cloth2, "gi");
    put("chest", c.shell(1.1, 1.445, 1), M.cloth2, "gi");
    for (const s of [-1, 1]) put("chest", blob(0.07, 0.055, 0.075).translate(s * 0.17, 1.375, 0), M.cloth2, "gi"); // shoulder seams
    collar(c, M.cloth2, 1.22, 1.12);
    for (const s of [1, -1]) skinnedSleeve(c, s, 0.15, 0.6, 0.085, 0.078, 0.075, M.cloth2, "gi");
    void V;
  },
  Hakama: (c) => {
    const { M, put } = c;
    put("hips", pleatedTube(1.0, 0.7, 0.215, 0.275, 9, 0.78), M.cloth1, "hakama");
    for (const s of [-1, 1]) {
      const side = s > 0 ? "left" : "right";
      // One tube from the hip to the hem, skinned: it follows the thigh, bends round the
      // knee and follows the shin, with no seam; its top eases into the hips.
      const leg = pleatedTube(0.9, 0.05, 0.15, 0.222, 7, 0.85, 28).translate(s * 0.115, 0, 0);
      c.skinned(leg, M.cloth1, "hakama", ["hips", `${side}UpperLeg`, `${side}LowerLeg`], legWeights);
    }
    const plate = new RoundedBoxGeometry(0.2, 0.12, 0.02, 2, 0.008);
    plate.rotateX(0.2);
    plate.translate(0, 0.985, -0.165);
    put("hips", plate, M.cloth1, "hakama");
    // Obi and the hakama ties over it.
    for (const [y, r, mat] of [[0.99, 0.034, M.cloth3], [0.955, 0.022, M.cloth1], [1.025, 0.014, M.cloth1]] as const) {
      const g = new THREE.TorusGeometry(1, r, 10, 48);
      g.rotateX(Math.PI / 2);
      g.scale(0.205, 1, 0.152);
      g.translate(0, y, 0);
      put("hips", g, mat, "hakama");
    }
    // The bow: two loops and two hanging ends.
    for (const s of [-1, 1]) {
      const loop = new THREE.TorusGeometry(0.035, 0.012, 8, 16);
      loop.scale(1.3, 0.75, 0.6);
      loop.translate(s * 0.042, 0.965, 0.17);
      put("hips", loop, M.cloth1, "hakama");
      const end = new RoundedBoxGeometry(0.03, 0.11, 0.01, 2, 0.004);
      end.rotateZ(s * 0.25);
      end.translate(s * 0.022, 0.9, 0.172);
      put("hips", end, M.cloth1, "hakama");
    }
    put("hips", blob(0.022, 0.02, 0.015).translate(0, 0.965, 0.175), M.cloth1, "hakama");
  },
  Zori: (c) => {
    const { M, put } = c;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    for (const s of [1, -1]) {
      const side = s > 0 ? "left" : "right";
      const sx = (x: number) => s * x;
      put(`${side}LowerLeg`, limb(V(sx(0.1), 0.17, 0), V(sx(0.1), 0.08, 0), 0.05, 0.045), M.tabi);
      const foot = `${side}Foot`;
      put(foot, blob(0.048, 0.045, 0.1).translate(sx(0.1), 0.055, 0.035), M.tabi);
      put(foot, blob(0.04, 0.03, 0.04).translate(sx(0.1) + s * 0.012, 0.045, 0.11), M.tabi); // split toe
      const sole = new RoundedBoxGeometry(0.1, 0.022, 0.26, 2, 0.008);
      sole.translate(sx(0.1), 0.011, 0.04);
      put(foot, sole, M.straw);
      for (const k of [-1, 1]) {
        const strap = new THREE.CapsuleGeometry(0.006, 0.07, 3, 6);
        strap.rotateZ(k * 1.0);
        strap.rotateX(-0.6);
        strap.translate(sx(0.1) + k * 0.026, 0.06, 0.085);
        put(foot, strap, M.thong);
      }
    }
  },
  // The sheath, through the belt on the left hip, pointing back and down.
  Saya: (c) => {
    const { M } = c;
    const saya = new THREE.Group();
    saya.name = "Saya";
    const len = 0.78;
    const body = new THREE.CylinderGeometry(0.019, 0.021, len, 12, 6);
    body.scale(1, 1, 1.45);
    body.translate(0, -len / 2, 0);
    saya.add(new THREE.Mesh(body, M.lacquer));
    const mouth = new THREE.CylinderGeometry(0.024, 0.024, 0.03, 12);
    mouth.scale(1, 1, 1.4);
    saya.add(new THREE.Mesh(mouth, M.lacquer));
    const tip = new THREE.CylinderGeometry(0.021, 0.019, 0.04, 12);
    tip.scale(1, 1, 1.45);
    tip.translate(0, -len + 0.02, 0);
    saya.add(new THREE.Mesh(tip, M.brass));
    const cord = new THREE.TorusGeometry(0.03, 0.006, 6, 16);
    cord.translate(0, -0.08, 0);
    saya.add(new THREE.Mesh(cord, M.cloth3));
    for (const m of saya.children) (m as THREE.Mesh).castShadow = true;
    saya.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0.12, -0.42, -1).normalize());
    c.attach("hips", saya, new THREE.Vector3(0.17, 1.0, 0.13));
  },
  Head_Human: (c) => {
    const { M, put } = c;
    const skull = put("head", sculptedHead(), M.skin, "skull");
    // Ears: a thin shell, wider at the top, set back and tilted like the jaw.
    for (const s of [-1, 1]) {
      const ear = blob(0.007, 0.022, 0.015, 24);
      const ep = ear.attributes.position!;
      for (let i = 0; i < ep.count; i++) {
        const y = ep.getY(i);
        ep.setZ(i, ep.getZ(i) * (0.75 + 0.45 * Math.max(0, y / 0.022)));
        if (ep.getX(i) * s < 0) ep.setX(i, ep.getX(i) * 0.4);
      }
      ear.computeVertexNormals();
      ear.rotateZ(s * 0.12);
      ear.rotateY(s * 0.3);
      ear.rotateX(-0.15);
      put("head", ear.translate(s * 0.084, 1.567, -0.012), M.skin);
    }
    // Face: the features are painted (see faceTexture) on a thin skin laid over the front
    // of the head, vertex by vertex, so they follow its curves exactly.
    c.rig.updateMatrixWorld(true);
    put("head", faceShell([skull]), M.face, "face");
  },
  Hair_Kenshin: (c) => buildKenshinHair(c),
});

/**
 * The head, sculpted rather than a squashed sphere: lofted through horizontal cross-
 * sections from the crown to the chin. Each section is a superellipse with its own
 * half-width, front and back depth (rounder at the cranium, flatter planes on the face,
 * a V of a jaw closing to a small chin), then the features are modelled on its front:
 * brow ridge, eye sockets, a nose with a bridge and a tip, cheekbones, lips, chin.
 */
function sculptedHead(): THREE.BufferGeometry {
  // y, half-width, front depth, back depth, centre z, squareness (2: ellipse).
  const KEYS: [number, number, number, number, number, number][] = [
    [1.455, 0.004, 0.004, 0.004, 0.052, 2],
    [1.462, 0.017, 0.012, 0.012, 0.05, 2.1],
    [1.474, 0.031, 0.027, 0.03, 0.036, 2.2],
    [1.49, 0.054, 0.052, 0.047, 0.018, 2.3],
    [1.51, 0.07, 0.074, 0.066, 0.006, 2.4],
    [1.53, 0.08, 0.087, 0.082, 0.0, 2.5],
    [1.555, 0.086, 0.091, 0.093, -0.004, 2.5],
    [1.58, 0.088, 0.09, 0.099, -0.006, 2.4],
    [1.605, 0.089, 0.091, 0.101, -0.007, 2.3],
    [1.635, 0.085, 0.084, 0.098, -0.008, 2.15],
    [1.665, 0.072, 0.066, 0.084, -0.009, 2.05],
    [1.688, 0.05, 0.042, 0.058, -0.01, 2],
    [1.702, 0.02, 0.016, 0.022, -0.01, 2],
    [1.706, 0.001, 0.001, 0.001, -0.01, 2],
  ];
  const at = (y: number): number[] => {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1]![0] < y) i++;
    const a = KEYS[Math.max(0, i - 1)]!, b = KEYS[i]!, c = KEYS[i + 1]!, d = KEYS[Math.min(KEYS.length - 1, i + 2)]!;
    const t = (y - b[0]) / (c[0] - b[0]);
    // Catmull-Rom through the keys: smooth, no kinks between sections.
    return b.map((_, k) => {
      const p0 = a[k]!, p1 = b[k]!, p2 = c[k]!, p3 = d[k]!;
      return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
    });
  };
  const G = (v: number, m: number, w: number) => Math.exp(-(((v - m) / w) ** 2));
  const rows = 72;
  const cols = 72;
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const y0 = KEYS[0]![0];
  const y1 = KEYS[KEYS.length - 1]![0];
  for (let i = 0; i <= rows; i++) {
    // Rows packed closer round the face, where the shape changes fastest.
    const u = i / rows;
    const y = y0 + (y1 - y0) * (u + 0.06 * Math.sin(u * Math.PI * 2));
    const [, W, F, B, cz, n] = at(y) as [number, number, number, number, number, number];
    for (let j = 0; j <= cols; j++) {
      const th = (j / cols) * Math.PI * 2; // 0: straight ahead (+z)
      const sn = Math.sin(th);
      const cs = Math.cos(th);
      const e = 2 / n;
      let x = W * Math.sign(sn) * Math.abs(sn) ** e;
      let z = (cs > 0 ? F : B) * Math.sign(cs) * Math.abs(cs) ** e;
      // Features, on the front only (cs > 0), pushed out along the section's normal.
      const front = Math.max(0, cs) ** 2;
      const a = Math.abs(th > Math.PI ? th - Math.PI * 2 : th); // angle off the middle
      let push = 0;
      push += 0.0045 * G(y, 1.606, 0.009) * G(a, 0, 0.75); // brow ridge
      push -= 0.0055 * G(y, 1.58, 0.012) * G(a, 0.4, 0.2); // eye sockets
      push += 0.0035 * G(y, 1.552, 0.012) * G(a, 0.72, 0.2); // cheekbones
      // Nose: a bridge from between the eyes growing to a tip, then turning under.
      const bridge = THREE.MathUtils.smoothstep(y, 1.598, 1.545) * (1 - THREE.MathUtils.smoothstep(y, 1.54, 1.528));
      push += 0.016 * bridge ** 1.4 * G(a, 0, 0.09 + 0.06 * (1.598 - y) / 0.06);
      push += 0.0035 * G(y, 1.538, 0.006) * G(a, 0.12, 0.06); // nostril wings
      push += 0.0025 * G(y, 1.508, 0.006) * G(a, 0, 0.22); // lips
      push -= 0.002 * G(y, 1.497, 0.004) * G(a, 0, 0.25); // under the lower lip
      push += 0.004 * G(y, 1.468, 0.008) * G(a, 0, 0.3); // chin
      push *= front;
      const r = Math.hypot(x, z) || 1;
      x += (x / r) * push;
      z += (z / r) * push;
      pos.push(x, y, z + cz);
      uv.push(j / cols, u);
    }
  }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j;
      const b = a + cols + 1;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Weights of a garment tube along a leg: the hips at the top, the thigh, the shin below the knee. */
export function legWeights(p: THREE.Vector3): number[] {
  const S = THREE.MathUtils.smoothstep;
  const hip = S(p.y, 0.8, 0.92) * 0.6;
  const shin = 1 - S(p.y, 0.38, 0.6);
  return [hip, Math.max(0, 1 - hip - shin), shin];
}

/**
 * Crossed collar (eri): a band round the back of the neck, down the front, left panel
 * over right, down to `yLeft` / `yRight`; between them the chest shows in a V.
 */
export function collar(c: Ctx, mat: THREE.Material, yCross: number, yEnd: number, k = 1, veeMat: THREE.Material = c.M.skin): void {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const front = (x: number, y: number, lift = 0.004) => V(x, y, torsoR(y) * k * DEPTH * Math.sqrt(Math.max(0, 1 - (x / (torsoR(y) * k)) ** 2)) + lift);
  const outward = (q: THREE.Vector3) => V(q.x, 0, q.z / DEPTH).normalize();
  const vee = new THREE.BufferGeometry();
  const a0 = front(-0.05, 1.43, 0.001);
  const a1 = front(0.05, 1.43, 0.001);
  const a2 = front(0.0, yCross + 0.03, 0.001);
  vee.setAttribute("position", new THREE.Float32BufferAttribute([a0.x, a0.y, a0.z, a1.x, a1.y, a1.z, a2.x, a2.y, a2.z], 3));
  vee.setIndex([0, 2, 1]);
  vee.computeVertexNormals();
  c.put("chest", vee, veeMat);
  const back = V(0, 1.452, -0.06);
  // Under panel (wearer's right), then the top one (wearer's left) crossing over it.
  const n = k * 1.0;
  c.put("chest", lock([back.clone().multiplyScalar(1).setZ(-0.06 * n), V(-0.058 * n, 1.445, -0.015), V(-0.066 * n, 1.43, 0.05 * n), front(-0.036, 1.34, 0.006), front(0.03, yCross, 0.006)], 0.019, 0.006, outward, 1, 1), mat);
  c.put("chest", lock([back.clone().setZ(-0.06 * n), V(0.058 * n, 1.445, -0.015), V(0.066 * n, 1.43, 0.05 * n), front(0.036, 1.34, 0.01), front(-0.03, yCross, 0.01), front(-0.08, yEnd, 0.01)], 0.02, 0.0065, outward, 1, 1), mat);
}

export { sleeve, pleatedTube, lock };

/** The scalp's shape, for hair: a point on it (lifted by `out`) at an azimuth and elevation. */
export const SCALP_C = new THREE.Vector3(0, 1.607, -0.008);
export const scalp = (az: number, el: number, out = 0) =>
  new THREE.Vector3((0.096 + out) * Math.cos(el) * Math.sin(az), (0.11 + out) * Math.sin(el), (0.104 + out) * Math.cos(el) * Math.cos(az)).add(SCALP_C);
export const fromHead = (q: THREE.Vector3) => q.clone().sub(SCALP_C).normalize();
/** A point on the scalp (lifted by `out`) in a direction from the head's centre. */
export const onScalp = (d: THREE.Vector3, out: number) =>
  d.clone().multiplyScalar(1 / Math.hypot(d.x / (0.096 + out), d.y / (0.11 + out), d.z / (0.104 + out))).add(SCALP_C);

/** The hair cap under the locks. */
export function hairCap(c: Ctx): void {
  const cap = new THREE.SphereGeometry(1, 48, 32, 0, Math.PI * 2, 0, 1.75);
  cap.rotateX(-0.42);
  cap.scale(0.096, 0.11, 0.104);
  cap.translate(0, 1.607, -0.008);
  c.put("head", cap, c.M.hair, "hair");
}

/** Locks swept from a point of the scalp to a tie at the back, along the scalp. */
export function lockToTie(az: number, el: number, tie: THREE.Vector3, r: () => number, width = 0.028): THREE.BufferGeometry {
  const a0 = scalp(az, el, -0.002);
  const d0 = fromHead(a0);
  const d1 = fromHead(tie);
  const over = new THREE.Vector3(0, 1, -0.35).normalize();
  // Along the scalp, arching over the crown (a quadratic blend through « up and back »).
  const pts = [a0];
  for (const k of [0.3, 0.6, 0.85]) {
    const d = d0.clone().multiplyScalar((1 - k) ** 2).addScaledVector(over, 2 * k * (1 - k)).addScaledVector(d1, k * k).normalize();
    pts.push(onScalp(d, 0.007 + 0.004 * k));
  }
  pts.push(tie.clone().add(new THREE.Vector3((r() - 0.5) * 0.016, (r() - 0.5) * 0.016, 0.006)));
  return lock(pts, width + r() * 0.008, 0.0055, fromHead, 0.35);
}

/** A ponytail of many locks from a tie (a pivot the animation swings, see animateSwordsman). */
export function ponytail(c: Ctx, tie: THREE.Vector3, length: number, r: () => number): void {
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const tail = new THREE.Group();
  tail.name = "ponytail";
  const strands: THREE.BufferGeometry[] = [];
  const axis = (q: THREE.Vector3) => V(q.x, 0, q.z + 0.03).normalize();
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + r() * 0.2;
    const rad = 0.008 + r() * 0.01;
    const len = length * (0.72 + r() * 0.44);
    const spread = 1 + r() * 1.5;
    const o = V(Math.cos(a) * rad, 0, Math.sin(a) * rad * 0.7);
    strands.push(
      lock([
        o.clone(),
        o.clone().multiplyScalar(1.6).add(V(0, -0.05, -0.045)),
        o.clone().multiplyScalar(2.2 * spread).add(V(0, -len * 0.4, -0.07)),
        o.clone().multiplyScalar(2.8 * spread).add(V((r() - 0.5) * 0.04, -len, -0.05 + (r() - 0.5) * 0.04)),
      ], 0.016 + r() * 0.008, 0.007, axis, 0.25),
    );
  }
  const m = new THREE.Mesh(mergeSimple(strands), c.M.hair);
  m.name = "hair";
  m.castShadow = true;
  tail.add(m);
  const band = new THREE.TorusGeometry(0.02, 0.006, 8, 18);
  band.rotateX(Math.PI / 2 - 0.5);
  band.translate(0, -0.012, -0.008);
  tail.add(new THREE.Mesh(band, c.M.cloth3));
  c.attach("head", tail, tie);
}

function buildKenshinHair(c: Ctx): void {
  hairCap(c);
  const r = seeded(21);
  const locks: THREE.BufferGeometry[] = [];
  // Bangs: two layers of pointed locks from the front of the crown down to the eyes,
  // the middle ones longest; a little disorder in every one.
  for (const [n, out, w0] of [[11, 0.006, 0.024], [8, 0.012, 0.02]] as const) {
    for (let i = 0; i < n; i++) {
      const az = -0.95 + (1.9 * (i + (out > 0.01 ? 0.5 : 0))) / n + (r() - 0.5) * 0.06;
      const centre = 1 - Math.min(1, Math.abs(az) / 0.95);
      const tipEl = -0.02 - 0.12 * centre - 0.08 * r();
      const swing = (r() - 0.5) * 0.25;
      locks.push(
        lock([scalp(az * 0.6, 1.15, out - 0.004), scalp(az * 0.9, 0.7, out + 0.01), scalp(az + swing * 0.4, 0.3, out + 0.016), scalp(az * 1.05 + swing, tipEl, out + 0.014)], w0 + r() * 0.006, 0.0085, fromHead),
      );
    }
  }
  // Long locks framing the face, down to the jaw.
  for (const s of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const az = s * (1.0 + i * 0.16);
      const tip = -0.55 - 0.25 * r() - (i === 0 ? 0.15 : 0);
      locks.push(lock([scalp(az * 0.7, 1.0, 0.002), scalp(az, 0.45, 0.014), scalp(az * 1.02, -0.1, 0.016), scalp(az * 0.97 - s * 0.05, tip, 0.012)], 0.022 + r() * 0.006, 0.009, fromHead));
    }
  // Crown and back: locks swept toward the tie, and up from the nape.
  const tie = new THREE.Vector3(0, 1.598, -0.112);
  for (const [el, n, span] of [[1.3, 7, 2.4], [0.95, 11, 2.7], [0.6, 11, 2.6], [0.2, 9, 2.0]] as const)
    for (let i = 0; i < n; i++) locks.push(lockToTie(Math.PI + (-span + (2 * span * i) / (n - 1)) + (r() - 0.5) * 0.12, el + (r() - 0.5) * 0.08, tie, r));
  for (let i = 0; i < 9; i++) locks.push(lockToTie(Math.PI + (-1.3 + (2.6 * i) / 8), -0.5 + (r() - 0.5) * 0.1, tie, r));
  // Over the ears: long locks falling from the temples, swept a little back.
  for (const s of [-1, 1])
    for (let i = 0; i < 5; i++) {
      const az = s * (1.25 + i * 0.17);
      const tip = -0.7 - 0.25 * r();
      locks.push(lock([scalp(az * 0.8, 0.95, -0.002), scalp(az, 0.45, 0.012), scalp(az * 1.04, -0.1, 0.018), scalp(az * 1.08, tip, 0.016)], 0.026 + r() * 0.006, 0.009, fromHead));
    }
  // Nape: short locks hanging below the tie line.
  for (let i = 0; i < 9; i++) {
    const az = Math.PI + (-1.2 + (2.4 * i) / 8) + (r() - 0.5) * 0.1;
    locks.push(lock([scalp(az, -0.05, -0.002), scalp(az, -0.45, 0.01), scalp(az * 1.0, -0.85 - r() * 0.15, 0.016)], 0.026, 0.0085, fromHead));
  }
  // A few strands escaping at the crown, as messy hair does.
  for (let i = 0; i < 4; i++) {
    const az = (r() - 0.5) * 2;
    const root = scalp(az, 1.25, 0.006);
    const d = fromHead(root);
    locks.push(lock([root, root.clone().addScaledVector(d, 0.012).add(new THREE.Vector3(Math.sin(az) * 0.01, 0, -0.025)), root.clone().addScaledVector(d, 0.014).add(new THREE.Vector3(Math.sin(az) * 0.035, -0.012, -0.06))], 0.011, 0.0035, fromHead));
  }
  c.put("head", mergeSimple(locks), c.M.hair, "hair");
  ponytail(c, tie, 0.5, r);
}

/**
 * Brings an instance's ponytail to life: each frame it turns toward where it would
 * hang (down, a little back), dragged behind the head's motion and settling with lag.
 * Purely visual.
 */
export function animateSwordsman(root: THREE.Object3D): void {
  root.traverse((tail) => {
    if (tail.name !== "ponytail" || !tail.visible) return;
    const anchor = tail.children.find((ch) => ch instanceof THREE.Mesh) as THREE.Mesh | undefined;
    if (!anchor) return;
    const hang = new THREE.Vector3(0, -1, 0);
    const lastPos = new THREE.Vector3();
    let last = 0;
    const wp = new THREE.Vector3();
    const back = new THREE.Vector3();
    const pq = new THREE.Quaternion();
    const want = new THREE.Vector3();
    anchor.onBeforeRender = () => {
      const now = performance.now() / 1000;
      if (last && now - last < 0.004) return;
      const dt = last ? Math.min(0.05, now - last) : 0;
      last = now;
      tail.parent!.updateWorldMatrix(true, false);
      tail.getWorldPosition(wp);
      tail.parent!.getWorldQuaternion(pq);
      back.set(0, 0, -1).applyQuaternion(pq);
      back.y = 0;
      back.normalize();
      const vel = dt > 0 && lastPos.lengthSq() > 0 ? wp.clone().sub(lastPos).divideScalar(dt) : new THREE.Vector3();
      lastPos.copy(wp);
      want.set(0, -1, 0).addScaledVector(back, 0.3).addScaledVector(vel, -0.12);
      // A gentle sway while still.
      want.x += Math.sin(now * 1.7) * 0.03;
      want.normalize();
      hang.lerp(want, dt > 0 ? 1 - Math.exp(-dt * 6) : 1).normalize();
      // Local rotation that points the tail (its −Y) along `hang` in world space.
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), hang);
      tail.quaternion.copy(pq.clone().invert().multiply(q));
    };
  });
}

/** Face details painted when the look's `show` list names them. */
const FACE_DETAILS = { scar: "Scar_Cross", whiskers: "Whiskers", bandaged: "Bandaged" } as const;

export interface HumanLook {
  show: string[];
  hair?: string;
  outfit?: string;
  accent?: string;
  trim?: string;
  skin?: string;
  eyes?: string;
  expression?: string;
  emblem?: string;
}

/** Hooks of the other part modules, run when an instance is dressed (textures by colour…). */
const dressers: ((root: THREE.Object3D, look: HumanLook, parts: Set<string>) => void)[] = [];
export function onDress(f: (root: THREE.Object3D, look: HumanLook, parts: Set<string>) => void): void {
  dressers.push(f);
}

/**
 * Dresses an instance (its materials are its own copies by then): the parts the look
 * shows, its colours, its face.
 */
/** Heads that make the figure an animal (creatureParts.ts): its whole skin is fur. */
export const ANIMAL_HEADS = ["Head_Rat", "Head_Squirrel", "Head_Teddy"];

/**
 * Anime hair shading on a hair material: darker at the roots, lighter at the tips (the
 * locks run along their texture's v), and a sharp band of light across the locks, the
 * "angel ring", from a strand highlight (Kajiya-Kay) computed along each lock, with a
 * second, tinted and softer one a little lower.
 */
export function hairShader(m: THREE.MeshPhysicalMaterial): void {
  if (m.userData.hairShader) return;
  m.userData.hairShader = true;
  m.clearcoat = 0;
  m.roughness = 0.62;
  m.customProgramCacheKey = () => "hair-kk";
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <map_fragment>",
        `#include <map_fragment>
        #ifdef USE_MAP
          diffuseColor.rgb *= mix(vec3(0.42, 0.3, 0.3), vec3(1.12, 1.1, 1.02), smoothstep(0.0, 0.8, vMapUv.y));
        #endif`,
      )
      .replace(
        "#include <opaque_fragment>",
        `#ifdef USE_MAP
        {
          // Direction of the lock on screen-space derivatives (along v).
          vec3 p = -vViewPosition;
          vec3 dp1 = dFdx(p);
          vec3 dp2 = dFdy(p);
          vec2 duv1 = dFdx(vMapUv);
          vec2 duv2 = dFdy(vMapUv);
          vec3 n = normalize(normal);
          vec3 strand = cross(dp2, n) * duv1.y + cross(n, dp1) * duv2.y;
          if (dot(strand, strand) > 1e-12) {
            strand = normalize(strand);
            vec3 V = normalize(vViewPosition);
            vec3 L = normalize((viewMatrix * vec4(0.35, 1.0, 0.45, 0.0)).xyz);
            vec3 H = normalize(L + V);
            float d1 = dot(normalize(strand + n * 0.12), H);
            float d2 = dot(normalize(strand - n * 0.25), H);
            float s1 = pow(sqrt(max(0.0, 1.0 - d1 * d1)), 48.0);
            float s2 = pow(sqrt(max(0.0, 1.0 - d2 * d2)), 22.0);
            float lit = 0.35 + 0.65 * clamp(dot(n, L) * 0.5 + 0.5, 0.0, 1.0);
            outgoingLight += (vec3(1.0, 0.95, 0.88) * s1 * 0.6 + diffuseColor.rgb * s2 * 0.4) * lit;
          }
        }
        #endif
        #include <opaque_fragment>`,
      );
  };
  m.needsUpdate = true;
}

/** Tops that leave the chest bare. */
const OPEN_TOPS = ["Vest", "Top_None"];

export function paintSwordsman(root: THREE.Object3D, look: HumanLook): void {
  const parts = partsOf(look.show);
  const brows = look.hair ? `#${new THREE.Color(look.hair).multiplyScalar(0.55).getHexString()}` : undefined;
  const mood = look.expression === "fierce" || look.expression === "wild" ? look.expression : "calm";
  const face: FaceStyle = {
    brows, mood, iris: look.eyes,
    scar: parts.has(FACE_DETAILS.scar), whiskers: parts.has(FACE_DETAILS.whiskers), bandaged: parts.has(FACE_DETAILS.bandaged),
  };
  // An animal: the skin is fur, its muzzle and belly a paler shade of it.
  const furry = ANIMAL_HEADS.some((h) => parts.has(h));
  const pale = look.skin ? `#${new THREE.Color(look.skin).lerp(new THREE.Color("#f4ead8"), 0.6).getHexString()}` : undefined;
  const colours: Record<string, string | undefined> = { hair: look.hair, cloth1: look.outfit, cloth2: look.accent, cloth3: look.trim, skin: look.skin, fur2: pale };
  root.traverse((o) => {
    const part = o.userData.part as string | undefined;
    if (part) o.visible = parts.has(part);
    // The muscles in relief only show where the chest is bare: they would poke through
    // a closed top.
    if (o.userData.relief) o.visible &&= OPEN_TOPS.some((t) => parts.has(t));
    if (!(o instanceof THREE.Mesh)) return;
    const mat = o.material as THREE.MeshPhysicalMaterial;
    const col = colours[mat.name];
    if (col) mat.color.set(col);
    if (mat.name === "face") mat.map = faceTexture(face);
    if (mat.name === "hair" && mat instanceof THREE.MeshPhysicalMaterial) hairShader(mat);
    if (mat.name === "skin" && furry) {
      mat.map = materials().fur.map;
      mat.bumpMap = materials().fur.bumpMap;
      mat.bumpScale = 3;
      mat.roughness = 0.95;
    }
    // Bandaged all over: the skin is wrapped.
    if (mat.name === "skin" && face.bandaged) {
      mat.map = materials().bandage.map;
      mat.color.set("#ffffff");
    }
  });
  for (const d of dressers) d(root, look, parts);
}
