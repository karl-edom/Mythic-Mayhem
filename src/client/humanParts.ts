// Clothing, hair and headwear for the figure built in code (swordsman.ts): each part is
// a named piece of the template, shown per instance when the look's `show` list names
// it. Colours come from the look's channels (outfit, accent, trim, hair, skin), so one
// part dresses many characters. Generic pieces only: who wears what is a data pack.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { DEPTH, collar, defineParts, fromHead, hairCap, legWeights, lock, lockToTie, onDress, pleatedTube, ponytail, scalp, sleeve, type Ctx } from "./swordsman.ts";
import { TAIL_LENGTH, TAIL_ROWS, blob, canvas, limb, mergeSimple, seeded, texture } from "./turtle.ts";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const SIDES = [[1, "left"], [-1, "right"]] as const;

/** An open tube round a leg from a radius profile ([height, radius], top first), skinned to it. */
function legTube(c: Ctx, profile: [number, number][], mat: THREE.Material, s: number, side: string, name: string): void {
  const pts = [...profile].reverse().map(([y, r]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 36);
  g.scale(1, 1, 0.9);
  g.translate(s * 0.108, 0, 0);
  c.skinned(g, mat, name, ["hips", `${side}UpperLeg`, `${side}LowerLeg`], legWeights);
}

/** The seat of a pair of trousers, on the hips. */
function seat(c: Ctx, mat: THREE.Material, r = 0.2): void {
  const g = new THREE.CylinderGeometry(r * 0.98, r * 1.12, 0.28, 36, 2, true);
  g.scale(1, 1, 0.78);
  g.translate(0, 0.86, 0);
  c.put("hips", g, mat);
  const cap = new THREE.SphereGeometry(r * 1.1, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  cap.scale(1, 0.5, 0.78);
  cap.translate(0, 0.73, 0);
  c.put("hips", cap, mat);
}

/** A belt or sash round the waist. */
function sash(c: Ctx, mat: THREE.Material, y: number, r: number, k = 1): void {
  const g = new THREE.TorusGeometry(1, r, 10, 48);
  g.rotateX(Math.PI / 2);
  g.scale(0.2 * k, 1, 0.152 * k);
  g.translate(0, y, 0);
  c.put("hips", g, mat);
}

/** A fitted sleeve or leg covering along X (an arm), from x0 to x1. */
function armCover(c: Ctx, s: number, side: string, x0: number, x1: number, r0: number, r1: number, mat: THREE.Material, bone: "UpperArm" | "LowerArm"): void {
  c.put(`${side}${bone}`, limb(V(s * x0, 1.37, 0), V(s * x1, 1.37, 0), r0, r1), mat);
}

/** A boot or legging round the shin, from y0 to y1. */
function shin(c: Ctx, side: string, s: number, y0: number, y1: number, r0: number, r1: number, mat: THREE.Material): void {
  const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, 24, 2, false);
  g.scale(1, 1, 1.05);
  g.translate(s * 0.1, (y0 + y1) / 2, 0.005);
  c.put(`${side}LowerLeg`, g, mat);
}

/** A shoe: a rounded foot and a sole. */
function shoe(c: Ctx, side: string, s: number, mat: THREE.Material, soleMat: THREE.Material, toe?: THREE.Material): void {
  const foot = `${side}Foot`;
  c.put(foot, blob(0.055, 0.05, 0.12).translate(s * 0.1, 0.055, 0.04), mat);
  const sole = new RoundedBoxGeometry(0.105, 0.025, 0.27, 2, 0.01);
  sole.translate(s * 0.1, 0.012, 0.04);
  c.put(foot, sole, soleMat);
  if (toe) c.put(foot, blob(0.05, 0.035, 0.05).translate(s * 0.1, 0.05, 0.13), toe);
}

/** Band round the head at the forehead (tilted, lower in front), `out` off the scalp. */
function headBand(c: Ctx, mat: THREE.Material, width: number, out: number): void {
  const cols = 64;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= 1; j++)
    for (let i = 0; i <= cols; i++) {
      const az = (i / cols) * Math.PI * 2;
      const el = 0.42 + (j ? width : 0) - 0.12 * Math.cos(az);
      const p = scalp(az, el, out);
      pos.push(p.x, p.y, p.z);
    }
  for (let i = 0; i < cols; i++) idx.push(i, i + 1, i + cols + 1, i + 1, i + cols + 2, i + cols + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  c.put("head", g, mat);
  // Two tails from the knot at the back, cloth that hangs and flutters (animateTurtle).
  for (const s of [-1, 1]) {
    const tail = new THREE.PlaneGeometry(0.055, TAIL_LENGTH, 1, TAIL_ROWS);
    tail.translate(0, -TAIL_LENGTH / 2, 0);
    const knot = scalp(Math.PI, 0.5, out + 0.01);
    const m = c.put("head", tail.translate(knot.x + s * 0.016, knot.y, knot.z), mat, "maskTail");
    m.userData.tailSide = s;
  }
  c.put("head", blob(0.025, 0.022, 0.02).translate(0, scalp(Math.PI, 0.52, out).y, scalp(Math.PI, 0.52, out).z - 0.008), mat);
}

/** A spike of hair: from a root on the scalp out along a direction, curving, tapering. */
function spike(az: number, el: number, dir: THREE.Vector3, len: number, width: number, bend = 0.25): THREE.BufferGeometry {
  const root = scalp(az, el, -0.004);
  const out = fromHead(root);
  const d = dir.clone().normalize();
  const mid = root.clone().addScaledVector(out, len * 0.25).addScaledVector(d, len * 0.35);
  const tip = root.clone().addScaledVector(d, len).addScaledVector(V(0, -1, 0), len * bend * 0.3);
  return lock([root, mid, tip], width, width * 0.35, fromHead, 0, 0.85);
}

// ---------------------------------------------------------------------------
// Emblems: a sign on the clothes, drawn from the look's `emblem` (letters, or a spiral
// or a fan), in a white circle (Emblem) or large on the back (Emblem_Back).

const emblems = new Map<string, THREE.CanvasTexture>();
function emblemTexture(text: string, circle: boolean): THREE.CanvasTexture {
  const key = `${text}|${circle}`;
  const hit = emblems.get(key);
  if (hit) return hit;
  const [c, g] = canvas(256, 256);
  if (circle) {
    g.fillStyle = "#f6f2e8";
    g.beginPath();
    g.arc(128, 128, 120, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#1a1412";
    g.lineWidth = 6;
    g.stroke();
  }
  if (text === "spiral") {
    g.strokeStyle = "#c8281e";
    g.lineWidth = 18;
    g.lineCap = "round";
    g.beginPath();
    for (let t = 0; t < 4.2 * Math.PI; t += 0.05) {
      const r = 8 + t * 7.5;
      g[t ? "lineTo" : "moveTo"](128 + Math.cos(t) * r, 128 + Math.sin(t) * r);
    }
    g.stroke();
  } else if (text === "fan") {
    // A round paper fan: red above, white below, on a short handle.
    g.fillStyle = "#c81e1e";
    g.beginPath();
    g.ellipse(128, 100, 92, 74, 0, Math.PI, 0);
    g.fill();
    g.fillStyle = "#f4f0e6";
    g.beginPath();
    g.ellipse(128, 100, 92, 74, 0, 0, Math.PI);
    g.fill();
    g.fillRect(118, 170, 20, 70);
  } else {
    g.fillStyle = "#121012";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `900 ${circle ? 150 : 200}px "Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif`;
    if (!circle) {
      g.fillStyle = "#f2efe6";
      g.strokeStyle = "#1a1412";
      g.lineWidth = 10;
      g.strokeText(text, 128, 136);
    }
    g.fillText(text, 128, 136);
  }
  const t = texture(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  emblems.set(key, t);
  return t;
}
const emblemMat = (name: string) => new THREE.MeshStandardMaterial({ name, transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });

/** A decal plane facing `normal`, centred at `at`. */
function decal(c: Ctx, bone: string, at: THREE.Vector3, normal: THREE.Vector3, size: number, mat: THREE.Material): void {
  const g = new THREE.PlaneGeometry(size, size);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), normal.clone().normalize()));
  g.translate(at.x, at.y, at.z);
  c.put(bone, g, mat);
}

// ---------------------------------------------------------------------------
// The haori's hem: white sawteeth along the bottom of the body and of the sleeves.

const haoris = new Map<string, THREE.CanvasTexture[]>();
function haoriTextures(color: string): THREE.CanvasTexture[] {
  const hit = haoris.get(color);
  if (hit) return hit;
  const make = (bottom: boolean) => {
    const [c, g] = canvas(256, 256);
    g.fillStyle = color;
    g.fillRect(0, 0, 256, 256);
    g.fillStyle = "#f4f2ec";
    const base = bottom ? 236 : 20;
    g.fillRect(0, bottom ? base : 0, 256, 20);
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.moveTo(i * 32, base);
      g.lineTo(i * 32 + 16, bottom ? 150 : 106);
      g.lineTo(i * 32 + 32, base);
      g.fill();
    }
    const t = texture(c, true, [4, 1]);
    t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  };
  const out = [make(true), make(false)];
  haoris.set(color, out);
  return out;
}

const haoriBody = new THREE.MeshPhysicalMaterial({ name: "haori", color: "#ffffff", roughness: 0.9, sheen: 0.2, side: THREE.DoubleSide });
const haoriSleeve = new THREE.MeshPhysicalMaterial({ name: "haoriSleeve", color: "#ffffff", roughness: 0.9, sheen: 0.2, side: THREE.DoubleSide });

onDress((root, look) => {
  const [body, sleeveTex] = haoriTextures(look.trim ?? "#2f6fb8");
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o.material as THREE.MeshStandardMaterial;
    if (m.name === "haori") m.map = body!;
    if (m.name === "haoriSleeve") m.map = sleeveTex!;
    if (m.name === "emblemCircle" && look.emblem) m.map = emblemTexture(look.emblem, true);
    if (m.name === "emblemPlain" && look.emblem) m.map = emblemTexture(look.emblem, false);
    if ((m.name === "emblemCircle" || m.name === "emblemPlain") && !look.emblem) o.visible = false;
  });
});

// ---------------------------------------------------------------------------

defineParts({
  // ---- Tops.
  /** A haori over a kimono: long, open in front, wide sleeves, sawtooth hems (trim colour). */
  Haori: (c) => {
    const { M, put } = c;
    // The kimono under it (accent).
    put("spine", c.shell(0.9, 1.17, 1), M.cloth2);
    put("chest", c.shell(1.1, 1.445, 1), M.cloth2);
    collar(c, M.cloth2, 1.22, 1.12);
    // The haori: trim colour, open at the front, flaring down to the thighs.
    put("chest", c.shell(1.1, 1.455, 1.1, 0.55), M.cloth3);
    put("spine", c.shell(0.95, 1.17, 1.1, 0.55), M.cloth3);
    {
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 12; i++) {
        const y = 0.58 + (i / 12) * 0.4;
        pts.push(new THREE.Vector2(c.torsoR(Math.max(0.9, y)) * 1.1 + (0.98 - y) * 0.22, y));
      }
      const g = new THREE.LatheGeometry(pts, 48, 0.3, Math.PI * 2 - 0.6);
      g.scale(1, 1, DEPTH * 1.1);
      put("hips", g, haoriBody);
    }
    // Lapel bands down the opening.
    for (const s of [-1, 1]) {
      const a = 0.3 * s;
      const at = (y: number, k: number) => V(Math.sin(a) * c.torsoR(Math.max(0.9, y)) * k, y, Math.cos(a) * c.torsoR(Math.max(0.9, y)) * k * DEPTH + 0.004);
      const pts = [V(s * 0.06, 1.452, -0.02), at(1.4, 1.12), at(1.2, 1.12), at(0.95, 1.13), at(0.6, 1.4)];
      put("chest", lock(pts, 0.022, 0.006, (q) => V(q.x, 0, q.z).normalize(), 1, 1), M.cloth3);
    }
    for (const [s, side] of SIDES) {
      put(`${side}UpperArm`, sleeve(s, 0.17, 0.47, 0.095, 0.13, 0.55, 1.375), M.cloth3);
      put(`${side}LowerArm`, sleeve(s, 0.45, 0.6, 0.135, 0.15, 1.3, 1.372), haoriSleeve);
    }
  },
  /** Martial-arts gi with short sleeves over an undershirt (accent), a sash with long ends. */
  Gi_Short: (c) => {
    const { M, put } = c;
    put("spine", c.shell(0.95, 1.17, 0.99), M.cloth2);
    put("chest", c.shell(1.1, 1.445, 0.99), M.cloth2);
    for (const [s, side] of SIDES) put(`${side}UpperArm`, sleeve(s, 0.17, 0.37, 0.07, 0.066, 0, 1.372), M.cloth2);
    put("spine", c.shell(0.86, 1.17, 1.05), M.cloth1);
    put("chest", c.shell(1.1, 1.22, 1.05), M.cloth1);
    put("chest", c.shell(1.2, 1.455, 1.05, 0.75), M.cloth1);
    collar(c, M.cloth1, 1.2, 1.1, 1.05, M.cloth2);
    for (const [s, side] of SIDES) {
      put("chest", blob(0.075, 0.06, 0.08).translate(s * 0.17, 1.38, 0), M.cloth1);
      put(`${side}UpperArm`, sleeve(s, 0.17, 0.34, 0.095, 0.115, 0.3, 1.375), M.cloth1);
    }
    sash(c, M.cloth2, 0.97, 0.03, 1.08);
    put("hips", blob(0.035, 0.03, 0.025).translate(0.02, 0.97, 0.165), M.cloth2);
    for (const k of [-1, 1]) {
      const end = new RoundedBoxGeometry(0.045, 0.24, 0.012, 2, 0.005);
      end.rotateZ(k * 0.12);
      end.translate(0.02 + k * 0.025, 0.85, 0.17);
      put("hips", end, M.cloth2);
    }
  },
  Emblem: (c) => {
    const m = emblemMat("emblemCircle");
    const zf = c.torsoR(1.3) * 1.05 * DEPTH + 0.006;
    decal(c, "chest", V(0.085, 1.3, zf - 0.012), V(0.35, 0, 1), 0.085, m);
    decal(c, "chest", V(0, 1.27, -c.torsoR(1.27) * 1.05 * DEPTH - 0.008), V(0, 0, -1), 0.2, m);
  },
  Emblem_Back: (c) => {
    decal(c, "chest", V(0, 1.24, -c.torsoR(1.24) * 1.06 * DEPTH - 0.01), V(0, 0, -1), 0.24, emblemMat("emblemPlain"));
  },
  /** Sleeveless open gi (main colour), the chest bare, bandages round the belly. */
  Vest: (c) => {
    const { M, put } = c;
    put("spine", c.shell(0.84, 1.17, 1.06, 0.95), M.cloth1);
    put("chest", c.shell(1.1, 1.445, 1.06, 1.25), M.cloth1);
    for (const s of [-1, 1]) {
      const a = 0.62 * s;
      const at = (y: number) => V(Math.sin(a) * c.torsoR(y) * 1.07, y, Math.cos(a) * c.torsoR(y) * 1.07 * DEPTH + 0.004);
      put("chest", lock([V(s * 0.05, 1.452, -0.03), at(1.42), at(1.3), at(1.12)], 0.024, 0.007, (q) => V(q.x, 0, q.z).normalize(), 1, 1), M.cloth1);
    }
    put("spine", c.shell(0.9, 1.13, 0.99), M.bandage);
    sash(c, M.cloth3, 0.92, 0.028, 1.06);
  },
  /** High-collared zipped jacket: main colour below, accent above and on the sleeves. */
  Jacket: (c) => {
    const { M, put } = c;
    put("spine", c.shell(0.84, 1.17, 1.07), M.cloth1);
    put("chest", c.shell(1.1, 1.2, 1.07), M.cloth1);
    put("chest", c.shell(1.19, 1.445, 1.07), M.cloth2);
    const col = new THREE.CylinderGeometry(0.068, 0.085, 0.09, 28, 1, true);
    col.scale(1, 1, 0.92);
    col.translate(0, 1.47, 0.005);
    put("chest", col, M.cloth2);
    const zip = new RoundedBoxGeometry(0.008, 0.62, 0.008, 1, 0.003);
    zip.translate(0, 1.2, c.torsoR(1.2) * 1.07 * DEPTH + 0.003);
    put("chest", zip, M.metal);
    for (const [s, side] of SIDES) {
      put("chest", blob(0.07, 0.06, 0.08).translate(s * 0.17, 1.38, 0), M.cloth2);
      armCover(c, s, side, 0.19, 0.45, 0.074, 0.062, M.cloth2, "UpperArm");
      armCover(c, s, side, 0.45, 0.63, 0.06, 0.052, M.cloth2, "LowerArm");
    }
    sash(c, M.cloth2, 0.9, 0.02, 1.1);
  },
  /** Short-sleeved shirt (accent) with a high collar open in a deep V. */
  Shirt_Collar: (c) => {
    const { M, put } = c;
    put("spine", c.shell(0.95, 1.17, 1.04), M.cloth2);
    put("chest", c.shell(1.1, 1.445, 1.04, 0.6), M.cloth2);
    const pts = [new THREE.Vector2(0.085, 1.43), new THREE.Vector2(0.095, 1.49), new THREE.Vector2(0.11, 1.54)];
    const col = new THREE.LatheGeometry(pts, 32, 0.55, Math.PI * 2 - 1.1);
    col.scale(1, 1, 0.9);
    put("chest", col, M.cloth2);
    for (const [s, side] of SIDES) {
      put("chest", blob(0.07, 0.058, 0.078).translate(s * 0.17, 1.38, 0), M.cloth2);
      put(`${side}UpperArm`, sleeve(s, 0.17, 0.42, 0.078, 0.082, 0.05, 1.372), M.cloth2);
    }
  },
  /** A cloth round the hips to the knees (main colour) tied with a thick rope (trim). */
  Apron_Waist: (c) => {
    const { M, put } = c;
    put("hips", pleatedTube(1.0, 0.6, 0.212, 0.27, 6, 0.8), M.cloth1);
    // Twisted rope: two strands round each other, twice round the waist.
    const r = seeded(9);
    for (const y of [0.98, 1.02])
      for (const ph of [0, Math.PI]) {
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i <= 96; i++) {
          const a = (i / 96) * Math.PI * 2;
          const tw = a * 14 + ph;
          pts.push(V(Math.sin(a) * (0.215 + 0.01 * Math.cos(tw)), y + 0.01 * Math.sin(tw), Math.cos(a) * (0.165 + 0.01 * Math.cos(tw))));
        }
        put("hips", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 192, 0.011, 6, true), M.cloth3);
      }
    // The big knot and its hanging loops at the front left.
    put("hips", blob(0.05, 0.045, 0.035).translate(0.07, 0.99, 0.18), M.cloth3);
    for (let k = 0; k < 3; k++) {
      const loop = new THREE.TorusGeometry(0.045 + r() * 0.015, 0.012, 6, 18);
      loop.scale(0.8, 1.3, 0.5);
      loop.rotateZ(0.3 * (k - 1));
      loop.translate(0.07 + (k - 1) * 0.05, 0.9 - k * 0.02, 0.19);
      put("hips", loop, M.cloth3);
    }
  },
  /** Skin-tight suit (main colour) over the torso and arms, a high neck. */
  Bodysuit: (c) => {
    const { M, put } = c;
    put("spine", c.shell(0.86, 1.17, 0.975), M.cloth1);
    put("chest", c.shell(1.1, 1.445, 0.975), M.cloth1);
    const neck = new THREE.CylinderGeometry(0.052, 0.07, 0.1, 24, 1, true);
    neck.translate(0, 1.46, 0.005);
    put("chest", neck, M.cloth1);
    for (const [s, side] of SIDES) {
      put(`${side}UpperArm`, blob(0.089, 0.079, 0.084).translate(s * 0.2, 1.385, 0), M.cloth1);
      armCover(c, s, side, 0.2, 0.44, 0.071, 0.057, M.cloth1, "UpperArm");
      put(`${side}UpperArm`, blob(0.063, 0.053, 0.053).translate(s * 0.33, 1.39, 0.02), M.cloth1);
      armCover(c, s, side, 0.45, 0.62, 0.059, 0.044, M.cloth1, "LowerArm");
      put(`${side}LowerArm`, blob(0.053, 0.051, 0.053).translate(s * 0.5, 1.375, 0.005), M.cloth1);
    }
  },
  Bodysuit_Legs: (c) => {
    const { M, put } = c;
    put("hips", blob(0.2, 0.12, 0.15).translate(0, 0.86, 0), M.cloth1);
    for (const [s, side] of SIDES) {
      put(`${side}UpperLeg`, limb(V(s * 0.1, 0.86, 0), V(s * 0.1, 0.5, 0), 0.086, 0.066), M.cloth1);
      put(`${side}LowerLeg`, limb(V(s * 0.1, 0.5, 0), V(s * 0.1, 0.12, 0), 0.064, 0.047), M.cloth1);
    }
  },
  /** Battle armour: a white chest plate, golden belly bands and shoulder straps. */
  Armor_Saiyan: (c) => {
    const { M, put } = c;
    put("chest", c.shell(1.18, 1.43, 1.13), M.white);
    put("spine", c.shell(1.02, 1.19, 1.12), M.gold);
    for (const y of [1.06, 1.11, 1.16]) {
      const g = new THREE.TorusGeometry(1, 0.006, 6, 48);
      g.rotateX(Math.PI / 2);
      g.scale(c.torsoR(y) * 1.13, 1, c.torsoR(y) * 1.13 * DEPTH);
      g.translate(0, y, 0);
      put("spine", g, M.white);
    }
    for (const s of [-1, 1]) {
      const pad = blob(0.075, 0.028, 0.1);
      pad.rotateZ(-s * 0.35);
      put("chest", pad.translate(s * 0.15, 1.44, 0), M.gold);
    }
  },
  /** A long robe (main colour), open on the bandaged chest, torn at the hem and the cuffs. */
  Robe_Tattered: (c) => {
    const { M, put } = c;
    put("spine", c.shell(0.9, 1.17, 1.06), M.cloth1);
    put("chest", c.shell(1.1, 1.445, 1.06), M.cloth1);
    collar(c, M.cloth1, 1.15, 1.0, 1.06);
    const r = seeded(13);
    const skirt = pleatedTube(0.98, 0.22, 0.22, 0.34, 8, 0.82);
    const p = skirt.attributes.position!;
    // Torn hem: the lowest rows ragged.
    for (let i = 0; i < p.count; i++) if (p.getY(i) < 0.3) p.setY(i, p.getY(i) + r() * 0.16);
    skirt.computeVertexNormals();
    put("hips", skirt, M.cloth1);
    sash(c, M.cloth3, 0.97, 0.03, 1.08);
    for (const [s, side] of SIDES) {
      put(`${side}UpperArm`, sleeve(s, 0.17, 0.45, 0.09, 0.12, 0.6, 1.375), M.cloth1);
      const cuff = sleeve(s, 0.43, 0.54, 0.12, 0.135, 1.0, 1.372);
      const q = cuff.attributes.position!;
      for (let i = 0; i < q.count; i++) if (Math.abs(q.getX(i)) > 0.5) q.setX(i, q.getX(i) - s * r() * 0.05);
      put(`${side}LowerArm`, cuff, M.cloth1);
    }
  },
  /** Dark segmented armour: chest plates, spiked shoulder guards, a long sash flap. */
  Armor_Shredder: (c) => {
    const { M, put } = c;
    put("chest", c.shell(1.05, 1.45, 1.12), M.metal);
    put("spine", c.shell(0.9, 1.17, 1.06), M.leather);
    // Ridges across the chest plates.
    for (const y of [1.18, 1.26, 1.34]) {
      const g = new THREE.TorusGeometry(1, 0.007, 6, 48, Math.PI);
      g.rotateX(Math.PI / 2);
      g.rotateY(-Math.PI / 2);
      g.scale(c.torsoR(y) * 1.13, 1, c.torsoR(y) * 1.13 * DEPTH);
      g.translate(0, y, 0);
      put("chest", g, M.metal);
    }
    for (const s of [-1, 1]) {
      for (let k = 0; k < 3; k++) {
        const plate = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        plate.scale(0.11 - k * 0.012, 0.05, 0.12 - k * 0.01);
        plate.rotateZ(-s * (0.45 + k * 0.15));
        plate.translate(s * (0.19 + k * 0.035), 1.43 - k * 0.04, 0);
        put("chest", plate, M.metal);
      }
      for (let k = 0; k < 3; k++) {
        const spikeG = new THREE.ConeGeometry(0.014, 0.1, 6);
        spikeG.rotateZ(-s * 0.6);
        spikeG.translate(s * (0.17 + k * 0.035), 1.5 - k * 0.012, -0.03 + k * 0.03);
        put("chest", spikeG, M.metal);
      }
    }
    sash(c, M.cloth3, 0.96, 0.035, 1.1);
    for (const z of [1, -1]) {
      const flap = new THREE.PlaneGeometry(0.16, 0.38, 1, 4);
      const fp = flap.attributes.position!;
      for (let i = 0; i < fp.count; i++) if (fp.getY(i) < -0.18) fp.setX(i, fp.getX(i) * 0.15);
      flap.translate(0, 0.78, z * 0.17);
      put("hips", flap, M.cloth3);
    }
  },
  Top_None: () => {},

  // ---- Bottoms.
  /** Baggy trousers gathered at the ankles. */
  Pants_Baggy: (c) => {
    seat(c, c.M.cloth1, 0.205);
    for (const [s, side] of SIDES) legTube(c, [[0.94, 0.15], [0.7, 0.17], [0.45, 0.18], [0.3, 0.16], [0.17, 0.09], [0.12, 0.075]], c.M.cloth1, s, side, "pants");
  },
  /** Three-quarter trousers with a cuff, a white band round one thigh and a pouch. */
  Pants_Short: (c) => {
    seat(c, c.M.cloth1, 0.2);
    for (const [s, side] of SIDES) legTube(c, [[0.94, 0.15], [0.65, 0.15], [0.42, 0.125], [0.3, 0.115], [0.28, 0.118]], c.M.cloth1, s, side, "pants");
    const band = new THREE.CylinderGeometry(0.105, 0.105, 0.04, 24, 1, true);
    band.translate(-0.108, 0.62, 0);
    c.put("rightUpperLeg", band, c.M.white);
    const pouch = new RoundedBoxGeometry(0.06, 0.1, 0.05, 2, 0.01);
    pouch.translate(-0.2, 0.66, 0.0);
    c.put("rightUpperLeg", pouch, c.M.leather);
  },
  /** Close-fitting ninja trousers. */
  Pants_Ninja: (c) => {
    seat(c, c.M.cloth1, 0.2);
    for (const [s, side] of SIDES) legTube(c, [[0.94, 0.15], [0.6, 0.14], [0.4, 0.115], [0.28, 0.09]], c.M.cloth1, s, side, "pants");
  },
  Bottom_None: () => {},

  // ---- Footwear.
  /** Martial-arts boots (accent) with a coloured cord tied round the top. */
  Boots_Martial: (c) => {
    for (const [s, side] of SIDES) {
      shin(c, side, s, 0.08, 0.32, 0.06, 0.078, c.M.cloth2);
      shoe(c, side, s, c.M.cloth2, c.M.leather);
      const cord = new THREE.TorusGeometry(0.078, 0.008, 6, 24);
      cord.rotateX(Math.PI / 2);
      cord.translate(s * 0.1, 0.3, 0.005);
      c.put(`${side}LowerLeg`, cord, c.M.gold);
    }
  },
  /** Tall white boots with golden toe caps. */
  Boots_White: (c) => {
    for (const [s, side] of SIDES) {
      shin(c, side, s, 0.08, 0.42, 0.062, 0.08, c.M.white);
      shoe(c, side, s, c.M.white, c.M.white, c.M.gold);
    }
  },
  Boots_Black: (c) => {
    for (const [s, side] of SIDES) {
      shin(c, side, s, 0.08, 0.36, 0.06, 0.072, c.M.leather);
      shoe(c, side, s, c.M.leather, c.M.dark);
    }
  },
  /** Ninja sandals: a wrapped shin, an open toe. */
  Sandals_Ninja: (c) => {
    for (const [s, side] of SIDES) {
      shin(c, side, s, 0.1, 0.34, 0.058, 0.064, c.M.leather);
      const foot = `${side}Foot`;
      c.put(foot, blob(0.05, 0.042, 0.065).translate(s * 0.1, 0.06, 0.0), c.M.leather);
      c.put(foot, blob(0.045, 0.028, 0.06).translate(s * 0.1, 0.035, 0.1), c.M.skin);
      const sole = new RoundedBoxGeometry(0.1, 0.02, 0.26, 2, 0.008);
      sole.translate(s * 0.1, 0.01, 0.04);
      c.put(foot, sole, c.M.dark);
    }
  },
  /** Straw-soled sandals, the ankles bound with bandages. */
  Sandals_Wrapped: (c) => {
    for (const [s, side] of SIDES) {
      shin(c, side, s, 0.07, 0.2, 0.052, 0.058, c.M.bandage);
      const foot = `${side}Foot`;
      c.put(foot, blob(0.048, 0.04, 0.1).translate(s * 0.1, 0.045, 0.04), c.M.skin);
      const sole = new RoundedBoxGeometry(0.1, 0.02, 0.26, 2, 0.008);
      sole.translate(s * 0.1, 0.01, 0.04);
      c.put(foot, sole, c.M.dark);
      for (const k of [-1, 1]) {
        const strap = new THREE.CapsuleGeometry(0.006, 0.07, 3, 6);
        strap.rotateZ(k * 1.0);
        strap.rotateX(-0.6);
        strap.translate(s * 0.1 + k * 0.026, 0.055, 0.085);
        c.put(foot, strap, c.M.dark);
      }
    }
  },

  // ---- Arms and hands.
  Wristbands: (c) => {
    for (const [s, side] of SIDES) armCover(c, s, side, 0.56, 0.645, 0.058, 0.056, c.M.cloth2, "LowerArm");
  },
  Gloves_White: (c) => {
    for (const [s, side] of SIDES) {
      const fist = new RoundedBoxGeometry(0.095, 0.085, 0.09, 3, 0.03);
      fist.translate(s * 0.705, 1.363, 0.005);
      c.put(`${side}Hand`, fist, c.M.white);
      armCover(c, s, side, 0.56, 0.65, 0.062, 0.06, c.M.white, "LowerArm");
    }
  },
  Gloves_Black: (c) => {
    for (const [s, side] of SIDES) {
      const fist = new RoundedBoxGeometry(0.092, 0.082, 0.087, 3, 0.028);
      fist.translate(s * 0.703, 1.364, 0.005);
      c.put(`${side}Hand`, fist, c.M.leather);
      armCover(c, s, side, 0.58, 0.65, 0.05, 0.048, c.M.leather, "LowerArm");
    }
  },
  /** Bandaged hands and wrists, a red band at the wrist. */
  Hand_Wraps: (c) => {
    for (const [s, side] of SIDES) {
      armCover(c, s, side, 0.5, 0.645, 0.052, 0.05, c.M.bandage, "LowerArm");
      armCover(c, s, side, 0.6, 0.62, 0.054, 0.054, c.M.cloth3, "LowerArm");
      const fist = new RoundedBoxGeometry(0.09, 0.08, 0.085, 3, 0.027);
      fist.translate(s * 0.703, 1.364, 0.005);
      c.put(`${side}Hand`, fist, c.M.bandage);
    }
  },
  /** Black arm warmers over the forearms. */
  Bracers: (c) => {
    for (const [s, side] of SIDES) armCover(c, s, side, 0.52, 0.645, 0.054, 0.05, c.M.leather, "LowerArm");
  },
  /** Metal forearm guards with three blades raked back. */
  Gauntlets: (c) => {
    for (const [s, side] of SIDES) {
      armCover(c, s, side, 0.47, 0.64, 0.062, 0.058, c.M.metal, "LowerArm");
      for (let k = 0; k < 3; k++) {
        const fin = new THREE.ConeGeometry(0.012, 0.09, 4);
        fin.rotateZ(s * (Math.PI / 2 + 0.5));
        fin.translate(s * (0.5 + k * 0.045), 1.43, -0.01);
        c.put(`${side}LowerArm`, fin, c.M.metal);
      }
    }
  },
  /** Spiked shin guards. */
  Shin_Guards: (c) => {
    for (const [s, side] of SIDES) {
      const g = new THREE.CylinderGeometry(0.078, 0.07, 0.26, 20, 1, false, -1.2, 2.4);
      g.translate(s * 0.1, 0.3, 0.01);
      c.put(`${side}LowerLeg`, g, c.M.metal);
      const k = new THREE.ConeGeometry(0.018, 0.08, 5);
      k.rotateX(Math.PI / 2 - 0.6);
      k.translate(s * 0.1, 0.42, 0.08);
      c.put(`${side}LowerLeg`, k, c.M.metal);
    }
  },

  // ---- Hair.
  /** Black hair swept back, a few long forelocks in front, a long ponytail low at the nape. */
  Hair_Saito: (c) => {
    hairCap(c);
    const r = seeded(41);
    const locks: THREE.BufferGeometry[] = [];
    const tie = V(0, 1.57, -0.112);
    for (const [el, n, span] of [[1.3, 7, 2.6], [0.95, 13, 3.0], [0.6, 13, 2.9], [0.25, 11, 2.6]] as const)
      for (let i = 0; i < n; i++) locks.push(lockToTie(Math.PI + (-span + (2 * span * i) / (n - 1)) + (r() - 0.5) * 0.1, el, tie, r, 0.03));
    // Forelocks: three long thin strands falling over the brow, down to the cheek.
    for (const [az, len] of [[-0.12, 0.2], [0.05, 0.24], [0.2, 0.17]] as const)
      locks.push(lock([scalp(az, 1.0, 0.004), scalp(az * 1.2, 0.55, 0.018), scalp(az * 1.5 + 0.05, 0.1, 0.03), scalp(az * 1.6 + 0.08, 0.4 - len * 4, 0.035)], 0.014, 0.004, fromHead));
    for (const s of [-1, 1]) locks.push(lock([scalp(s * 1.1, 0.8, 0), scalp(s * 1.3, 0.2, 0.012), scalp(s * 1.35, -0.4, 0.014)], 0.022, 0.005, fromHead));
    c.put("head", mergeSimple(locks), c.M.hair, "hair");
    ponytail(c, tie, 0.62, r);
  },
  /** Big spikes in every direction, a fringe of spikes over the forehead. */
  Hair_Goku: (c) => {
    hairCap(c);
    const g: THREE.BufferGeometry[] = [];
    const big: [number, number, number, number, number, number][] = [
      // az, el, direction (x, y, z) by the spike's own frame, length, width
      [0, 1.35, 0, 1, -0.3, 0.2], [0.6, 1.2, 0.8, 1, -0.4, 0.2], [-0.6, 1.2, -0.8, 1, -0.4, 0.21],
      [1.2, 0.9, 1, 0.6, -0.4, 0.2], [-1.2, 0.9, -1, 0.6, -0.4, 0.19], [1.6, 0.4, 1, 0.1, -0.5, 0.17], [-1.6, 0.4, -1, 0.1, -0.5, 0.17],
      [2.4, 0.9, 0.6, 0.5, -1, 0.2], [-2.4, 0.9, -0.6, 0.5, -1, 0.2], [Math.PI, 1.0, 0, 0.6, -1, 0.21], [Math.PI, 0.4, 0, -0.2, -1, 0.16],
      [2.6, 0.2, 0.5, -0.3, -1, 0.14], [-2.6, 0.2, -0.5, -0.3, -1, 0.14],
    ];
    for (const [az, el, x, y, z, len] of big) g.push(spike(az, el, V(x, y, z), len, 0.055, 0.3));
    // Fringe: a few spikes falling forward over the brow.
    for (const [az, x, len] of [[-0.35, -0.4, 0.13], [-0.1, -0.1, 0.12], [0.15, 0.2, 0.14], [0.4, 0.5, 0.1]] as const)
      g.push(spike(az, 0.85, V(x, -0.7, 0.6), len, 0.04, 0.1));
    for (const s of [-1, 1]) g.push(spike(s * 0.95, 0.55, V(s * 0.3, -1, 0.3), 0.15, 0.035, 0));
    c.put("head", mergeSimple(g), c.M.hair, "hair");
  },
  /** A tall flame of spikes standing up and back, a sharp widow's peak. */
  Hair_Vegeta: (c) => {
    hairCap(c);
    const g: THREE.BufferGeometry[] = [];
    const r = seeded(51);
    // A tall flame: many narrow spikes rising from the crown and the sides, the outer
    // ones leaning out, the back ones back.
    for (let i = 0; i < 30; i++) {
      const az = (r() - 0.5) * 2 * 2.9;
      const el = 0.45 + r() * 0.85;
      const side = Math.sin(az);
      const back = -Math.cos(az);
      const dir = V(side * 0.75, 1, back * 0.5 - 0.12);
      g.push(spike(az, el, dir, 0.18 + r() * 0.16 + (el > 0.9 ? 0.06 : 0), 0.032 + r() * 0.012, -0.05));
    }
    // The widow's peak: the hairline dips to a point on the forehead.
    g.push(spike(0, 0.95, V(0, -0.5, 1), 0.07, 0.04, 0));
    for (const s of [-1, 1]) g.push(spike(s * 0.35, 0.95, V(s * 0.15, 1, 0.05), 0.2, 0.035, -0.05));
    c.put("head", mergeSimple(g), c.M.hair, "hair");
  },
  /** Messy medium spikes all round, a spiky fringe. */
  Hair_Spiky: (c) => {
    hairCap(c);
    const g: THREE.BufferGeometry[] = [];
    const r = seeded(61);
    for (let i = 0; i < 26; i++) {
      const az = (i / 26) * Math.PI * 2 + (r() - 0.5) * 0.2;
      const el = 0.35 + r() * 0.9;
      const out = fromHead(scalp(az, el));
      g.push(spike(az, el, out.add(V(0, 0.3, -0.2)), 0.09 + r() * 0.07, 0.04, 0.2));
    }
    for (let i = 0; i < 6; i++) {
      const az = -0.6 + i * 0.24;
      g.push(spike(az, 0.85, V(az * 0.6, -0.8, 0.5), 0.1 + r() * 0.04, 0.035, 0.1));
    }
    c.put("head", mergeSimple(g), c.M.hair, "hair");
  },
  /** Spikes swept up and back behind, long bangs framing the face. */
  Hair_Sasuke: (c) => {
    hairCap(c);
    const g: THREE.BufferGeometry[] = [];
    const r = seeded(71);
    for (let i = 0; i < 10; i++) {
      const az = Math.PI + (r() - 0.5) * 2.2;
      g.push(spike(az, 0.5 + r() * 0.7, V(Math.sin(az) * 0.4, 0.55, -1), 0.13 + r() * 0.07, 0.05, -0.2));
    }
    for (const s of [-1, 1]) {
      g.push(lock([scalp(s * 0.55, 1.0, 0), scalp(s * 0.8, 0.4, 0.016), scalp(s * 0.85, -0.3, 0.02), scalp(s * 0.8, -0.75, 0.014)], 0.03, 0.007, fromHead));
      g.push(lock([scalp(s * 0.25, 1.05, 0), scalp(s * 0.3, 0.55, 0.016), scalp(s * 0.32, 0.15, 0.022)], 0.026, 0.006, fromHead));
    }
    c.put("head", mergeSimple(g), c.M.hair, "hair");
  },
  /** A short tuft of black spikes on top of a bandaged head. */
  Hair_Shishio: (c) => {
    const g: THREE.BufferGeometry[] = [];
    const r = seeded(81);
    for (let i = 0; i < 14; i++) {
      const az = (r() - 0.5) * 2.6;
      const el = 1.05 + r() * 0.4;
      g.push(spike(az, el, V(Math.sin(az) * 0.4, 1, -0.1), 0.06 + r() * 0.05, 0.03, -0.1));
    }
    c.put("head", mergeSimple(g), c.M.hair, "hair");
  },
  Hair_None: () => {},

  // ---- Headwear.
  /** A cloth band tied round the head (trim colour), its long ends fluttering. */
  Headband: (c) => headBand(c, c.M.cloth3, 0.24, 0.022),
  /** A forehead protector: a cloth band and an engraved metal plate. */
  Headband_Plate: (c) => {
    headBand(c, c.M.cloth3, 0.26, 0.022);
    const g = new THREE.CylinderGeometry(0.118, 0.118, 0.045, 32, 1, true, -0.65, 1.3);
    g.scale(1, 1, 1.05);
    g.translate(0, 1.668, -0.01);
    c.put("head", g, c.M.metal);
    // The engraved sign: a spiral with a point (a leaf, simplified).
    const pts: THREE.Vector3[] = [];
    for (let t = 0; t < 3.6 * Math.PI; t += 0.1) {
      const rr = 0.0025 + t * 0.0013;
      pts.push(V(Math.cos(t) * rr, 1.668 + Math.sin(t) * rr, 0.121));
    }
    c.put("head", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.0018, 4), c.M.dark);
  },
  /** A war helmet: a dome, a crest of three blades, cheek guards; a cloth over the lower face. */
  Helmet_Spiked: (c) => {
    const dome = new THREE.SphereGeometry(1, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.62);
    dome.scale(0.112, 0.13, 0.12);
    dome.translate(0, 1.6, -0.005);
    c.put("head", dome, c.M.metal);
    for (const [x, h, tilt] of [[0, 0.16, 0], [-0.05, 0.12, 0.35], [0.05, 0.12, -0.35]] as const) {
      const b = new THREE.ConeGeometry(0.018, h, 4);
      b.scale(1, 1, 0.4);
      b.rotateZ(tilt);
      b.translate(x, 1.74 + h * 0.3, 0.08);
      c.put("head", b, c.M.metal);
    }
    for (const s of [-1, 1]) {
      const cheek = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI, 0, Math.PI);
      cheek.scale(0.012, 0.06, 0.07);
      cheek.rotateY(s * Math.PI / 2);
      cheek.translate(s * 0.1, 1.55, 0.0);
      c.put("head", cheek, c.M.metal);
    }
  },
  Mask_Lower: (c) => {
    const g = new THREE.SphereGeometry(1, 32, 16, -Math.PI / 2 - 0.1, Math.PI + 0.2, Math.PI * 0.52, Math.PI * 0.45);
    g.scale(0.095, 0.115, 0.108);
    g.translate(0, 1.59, 0.0);
    c.put("head", g, c.M.leather);
  },
});
