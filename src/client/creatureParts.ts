// Animal heads, tails and plush bodies for the figure built in code (swordsman.ts): a
// rat sensei, a squirrel, a teddy bear. Same skeleton and clothes as the humans; the fur
// is the skin channel (`look.skin`) painted with a fur texture, and its lighter muzzle
// and belly are derived from it (see paintSwordsman). Generic pieces: who wears what is
// a data pack.

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { defineParts, legWeights, sleeve, type Ctx } from "./swordsman.ts";
import { blob, limb, mergeSimple, seeded } from "./turtle.ts";

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const SIDES = [[1, "left"], [-1, "right"]] as const;

let pinkMat: THREE.MeshPhysicalMaterial | null = null;
/** Bare animal skin: nose, inner ears, a rat's tail. */
const pink = () => (pinkMat ??= new THREE.MeshPhysicalMaterial({ name: "pink", color: "#d99a94", roughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color("#ffe0e0") }));
let eyeMat: THREE.MeshPhysicalMaterial | null = null;
/** Glossy black eyes and buttons. */
const glossy = () => (eyeMat ??= new THREE.MeshPhysicalMaterial({ name: "eye", color: "#0c0a0e", roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }));

/** A head shaped from a sphere: radii, centre, and a function bending each point (unit sphere coordinates). */
function sculpt(r: THREE.Vector3, at: THREE.Vector3, shape: (p: THREE.Vector3) => THREE.Vector3 = (p) => p, seg = 48): THREE.BufferGeometry {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
  const p = g.attributes.position!;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    shape(v.fromBufferAttribute(p, i));
    p.setXYZ(i, v.x * r.x + at.x, v.y * r.y + at.y, v.z * r.z + at.z);
  }
  g.computeVertexNormals();
  return g;
}

/** A tube along a curve with a radius profile (t from 0 to 1), lumpy if `lumps`. */
function tube(pts: THREE.Vector3[], radius: (t: number) => number, lumps = 0, seg = 48): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts);
  const g = new THREE.TubeGeometry(curve, seg, 1, 14, false);
  const p = g.attributes.position!;
  const frames = curve.computeFrenetFrames(seg, false);
  const v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    const c = curve.getPointAt(t);
    for (let j = 0; j <= 14; j++) {
      const k = i * 15 + j;
      v.fromBufferAttribute(p, k).sub(c);
      const a = (j / 14) * Math.PI * 2;
      const bump = 1 + lumps * (0.5 * Math.sin(a * 5 + t * 23) + 0.5 * Math.sin(a * 3 - t * 17));
      v.multiplyScalar(radius(t) * bump);
      p.setXYZ(k, c.x + v.x, c.y + v.y, c.z + v.z);
    }
  }
  void frames;
  g.computeVertexNormals();
  // Close the end with a little cap.
  const end = curve.getPointAt(1);
  const cap = new THREE.SphereGeometry(Math.max(0.002, radius(1)), 12, 8);
  cap.translate(end.x, end.y, end.z);
  return mergeSimple([g, cap]);
}

/** Two eyes: glossy black, a white catchlight. */
function beadEyes(c: Ctx, x: number, y: number, z: number, r: number): void {
  for (const s of [-1, 1]) {
    c.put("head", blob(r, r * 1.15, r * 0.7).translate(s * x, y, z), glossy());
    c.put("head", blob(r * 0.28, r * 0.28, r * 0.2).translate(s * x + r * 0.3, y + r * 0.35, z + r * 0.55), c.M.white);
  }
}

defineParts({
  // ---- A rat: a long tapering snout, big round ears, beady eyes, whiskers; the beard
  // and brows in the hair colour (an old master's).
  Head_Rat: (c) => {
    const at = V(0, 1.6, -0.005);
    c.put("head", sculpt(V(0.092, 0.098, 0.1), at), c.M.skin, "skull");
    // Snout: forward and down, tapering to the nose.
    const snout = new THREE.LatheGeometry([0, 0.2, 0.4, 0.6, 0.8, 0.92, 1].map((t) => new THREE.Vector2(0.052 * (1 - 0.72 * t ** 1.3) * Math.sqrt(1 - t * t * 0.3), t * 0.13)), 24);
    snout.rotateX(Math.PI / 2 + 0.25);
    snout.translate(0, 1.575, 0.05);
    c.put("head", snout, c.M.skin);
    const tip = V(0, 1.575 - 0.13 * Math.sin(0.25), 0.05 + 0.13 * Math.cos(0.25));
    c.put("head", blob(0.016, 0.013, 0.013).translate(tip.x, tip.y + 0.004, tip.z + 0.004), pink());
    beadEyes(c, 0.04, 1.625, 0.075, 0.013);
    for (const [s] of SIDES) {
      // Ears: thin round discs, pink inside, standing up and out.
      const ear = new THREE.CylinderGeometry(0.052, 0.052, 0.01, 28);
      ear.rotateX(Math.PI / 2);
      ear.rotateZ(s * 0.35);
      ear.translate(s * 0.085, 1.7, -0.02);
      c.put("head", ear, c.M.skin);
      const inner = new THREE.CircleGeometry(0.04, 24);
      inner.rotateZ(s * 0.35);
      inner.translate(s * 0.085, 1.7, -0.0135);
      c.put("head", inner, pink());
      // Whiskers.
      for (let k = 0; k < 3; k++) {
        const a = V(s * 0.03, tip.y + 0.008 - k * 0.006, tip.z - 0.03);
        const b = V(s * 0.15, tip.y + 0.02 - k * 0.025, tip.z - 0.07 + k * 0.01);
        c.put("head", limb(a, b, 0.0012, 0.0006), c.M.dark);
      }
      // Bushy brows.
      c.put("head", blob(0.024, 0.008, 0.012).rotateZ(-s * 0.3).translate(s * 0.04, 1.648, 0.078), c.M.hair);
    }
    // The beard: a long pointed goatee and a drooping moustache.
    const beard = new THREE.ConeGeometry(0.022, 0.16, 12);
    beard.rotateX(Math.PI - 0.25);
    beard.translate(0, 1.47, 0.085);
    c.put("head", beard, c.M.hair, "hair");
    for (const [s] of SIDES)
      c.put("head", tube([V(s * 0.012, tip.y - 0.005, tip.z - 0.035), V(s * 0.05, tip.y - 0.03, tip.z - 0.05), V(s * 0.065, tip.y - 0.09, tip.z - 0.07)], (t) => 0.007 * (1 - t * 0.8)), c.M.hair, "hair");
  },

  // ---- A squirrel: a big round head, puffed cheeks and muzzle (lighter), big cartoon
  // eyes, two buck teeth, pointed tufted ears and a tuft on top.
  Head_Squirrel: (c) => {
    const at = V(0, 1.61, -0.005);
    c.put("head", sculpt(V(0.104, 0.104, 0.1), at), c.M.skin, "skull");
    // Cheeks and muzzle, cream.
    for (const [s] of SIDES) c.put("head", blob(0.045, 0.036, 0.04).translate(s * 0.045, 1.565, 0.06), c.M.fur2);
    c.put("head", blob(0.042, 0.032, 0.04).translate(0, 1.572, 0.082), c.M.fur2);
    c.put("head", blob(0.014, 0.01, 0.01).translate(0, 1.592, 0.12), glossy());
    for (const [s] of SIDES) {
      const tooth = new RoundedBoxGeometry(0.011, 0.016, 0.005, 2, 0.002);
      tooth.translate(s * 0.0065, 1.548, 0.115);
      c.put("head", tooth, c.M.white);
      // Big eyes: a white, a large dark iris, a catchlight.
      c.put("head", blob(0.03, 0.037, 0.016).translate(s * 0.038, 1.632, 0.084), c.M.white);
      c.put("head", blob(0.016, 0.021, 0.01).translate(s * 0.034, 1.628, 0.096), glossy());
      c.put("head", blob(0.005, 0.005, 0.004).translate(s * 0.03, 1.636, 0.105), c.M.white);
      c.put("head", blob(0.03, 0.006, 0.01).rotateZ(-s * 0.2).translate(s * 0.04, 1.676, 0.087), c.M.dark);
      // Ears: tall, pointed, lighter inside, a tuft at the tip.
      const ear = new THREE.ConeGeometry(0.032, 0.09, 16);
      ear.scale(1, 1, 0.45);
      ear.rotateZ(-s * 0.35);
      ear.translate(s * 0.07, 1.73, -0.01);
      c.put("head", ear, c.M.skin);
      const inner = new THREE.ConeGeometry(0.02, 0.065, 12);
      inner.scale(1, 1, 0.2);
      inner.rotateZ(-s * 0.35);
      inner.translate(s * 0.068, 1.725, 0.002);
      c.put("head", inner, c.M.fur2);
      const tuft = new THREE.ConeGeometry(0.012, 0.05, 8);
      tuft.rotateZ(-s * 0.55);
      tuft.translate(s * 0.095, 1.795, -0.01);
      c.put("head", tuft, c.M.skin);
    }
    // The tuft of hair on top, swept forward.
    const r = seeded(9);
    for (let i = 0; i < 4; i++) {
      const a = V((r() - 0.5) * 0.03, 1.705, 0.03 - i * 0.01);
      c.put("head", tube([a, a.clone().add(V((r() - 0.5) * 0.02, 0.04, 0.02)), a.clone().add(V((r() - 0.5) * 0.04, 0.05, 0.06))], (t) => 0.012 * (1 - t * 0.85)), c.M.skin);
    }
  },

  // ---- A teddy bear: round head, round ears, a lighter muzzle, a stitched mouth, black
  // button eyes and a seam down the middle.
  Head_Teddy: (c) => {
    const at = V(0, 1.6, -0.005);
    c.put("head", sculpt(V(0.11, 0.104, 0.1), at), c.M.skin, "skull");
    c.put("head", blob(0.052, 0.04, 0.035).translate(0, 1.565, 0.082), c.M.fur2);
    c.put("head", blob(0.018, 0.012, 0.012).translate(0, 1.585, 0.115), glossy());
    // The stitched mouth: a mean little zigzag.
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 8; i++) pts.push(V(-0.03 + i * 0.0075, 1.548 + (i % 2 ? -0.004 : 0.004) + 0.006 * Math.abs(i - 4) / 4, 0.112 - 0.012 * Math.abs(i - 4) / 4));
    c.put("head", new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, "catmullrom", 0), 32, 0.0018, 4), c.M.dark);
    for (const [s] of SIDES) {
      // Button eyes, with two thread holes.
      const button = new THREE.CylinderGeometry(0.016, 0.016, 0.006, 20);
      button.rotateX(Math.PI / 2);
      button.translate(s * 0.042, 1.625, 0.092);
      c.put("head", button, glossy());
      c.put("head", new THREE.TorusGeometry(0.016, 0.0025, 6, 20).translate(s * 0.042, 1.625, 0.095), c.M.dark);
      for (const dx of [-0.005, 0.005]) c.put("head", blob(0.0025, 0.0025, 0.002).translate(s * 0.042 + dx, 1.625, 0.096), c.M.fur2);
      // Angry stitched brows.
      c.put("head", limb(V(s * 0.022, 1.652, 0.097), V(s * 0.062, 1.664, 0.088), 0.003, 0.003), c.M.dark);
      // Round ears, lighter inside.
      c.put("head", blob(0.045, 0.045, 0.02).translate(s * 0.088, 1.695, -0.015), c.M.skin);
      c.put("head", blob(0.03, 0.03, 0.008).translate(s * 0.088, 1.695, -0.002), c.M.fur2);
    }
    // The seam from the forehead over the crown.
    for (let i = 0; i < 9; i++) {
      const el = 0.55 + i * 0.13;
      const p = V(0, 1.6 + 0.106 * Math.sin(el), -0.005 + 0.1 * Math.cos(el));
      c.put("head", new RoundedBoxGeometry(0.014, 0.004, 0.004, 1, 0.001).translate(p.x, p.y, p.z), c.M.dark);
    }
  },

  /** A rat's tail: long, bare, tapering, curling on the ground behind. */
  Tail_Rat: (c) => {
    const g = tube([V(0, 0.82, -0.13), V(0, 0.55, -0.38), V(0.08, 0.18, -0.55), V(0.3, 0.04, -0.62), V(0.55, 0.04, -0.42), V(0.6, 0.1, -0.25)], (t) => 0.026 * (1 - 0.8 * t));
    c.put("hips", g, pink(), "tail");
  },
  /** A squirrel's tail: huge, bushy, an S up the back, the tip curling forward. */
  Tail_Squirrel: (c) => {
    const g = tube(
      [V(0, 0.82, -0.13), V(0, 0.75, -0.42), V(0, 1.05, -0.62), V(0, 1.45, -0.6), V(0, 1.75, -0.42), V(0, 1.85, -0.2)],
      (t) => 0.05 + 0.13 * Math.sin(Math.min(1, t * 1.4) * Math.PI * 0.6) - 0.08 * Math.max(0, t - 0.75) * 4 * 0.5,
      0.08,
      64,
    );
    c.put("hips", g, c.M.skin, "tail");
  },
  /** A stubby bear's tail. */
  Tail_Teddy: (c) => {
    c.put("hips", blob(0.05, 0.05, 0.045).translate(0, 0.8, -0.16), c.M.skin, "tail");
  },

  // ---- Bodies.
  /** A plush body: a round belly (lighter), thick soft limbs. */
  Build_Plush: (c) => {
    c.put("spine", blob(0.2, 0.24, 0.17).translate(0, 1.05, 0.02), c.M.skin, "body");
    c.put("spine", blob(0.15, 0.17, 0.05).translate(0, 1.04, 0.15), c.M.fur2, "body");
    // No neck to speak of: the head sits on a soft roll.
    c.put("neck", blob(0.085, 0.07, 0.075).translate(0, 1.47, 0), c.M.skin, "body");
    for (const [s, side] of SIDES) {
      c.put(`${side}UpperArm`, limb(V(s * 0.2, 1.37, 0), V(s * 0.44, 1.37, 0), 0.07, 0.062), c.M.skin, "arm");
      c.put(`${side}LowerArm`, limb(V(s * 0.45, 1.37, 0), V(s * 0.64, 1.37, 0), 0.062, 0.055), c.M.skin, "arm");
      c.put(`${side}UpperLeg`, limb(V(s * 0.1, 0.86, 0), V(s * 0.1, 0.52, 0), 0.1, 0.08), c.M.skin, "leg");
      c.put(`${side}LowerLeg`, limb(V(s * 0.1, 0.5, 0), V(s * 0.1, 0.12, 0), 0.08, 0.07), c.M.skin, "leg");
    }
  },
  /** Patches sewn on: a square on the belly, another on an arm, coarse stitches round them. */
  Patches: (c) => {
    const patch = (bone: string, w: number, h: number, at: THREE.Vector3, rot: THREE.Euler, mat: THREE.Material) => {
      const g = new RoundedBoxGeometry(w, h, 0.006, 1, 0.002);
      g.rotateX(rot.x).rotateY(rot.y).rotateZ(rot.z);
      g.translate(at.x, at.y, at.z);
      c.put(bone, g, mat);
      for (let i = 0; i < 6; i++) {
        const st = new THREE.BoxGeometry(0.003, 0.012, 0.004);
        const a = (i / 6) * Math.PI * 2;
        st.rotateZ(a).rotateX(rot.x).rotateY(rot.y);
        st.translate(at.x + Math.cos(a) * w * 0.48, at.y + Math.sin(a) * h * 0.48, at.z + 0.004);
        c.put(bone, st, c.M.dark);
      }
    };
    patch("spine", 0.07, 0.06, V(-0.07, 1.12, 0.185), new THREE.Euler(0, -0.4, 0.2), c.M.cloth3);
    patch("leftUpperArm", 0.06, 0.05, V(0.32, 1.37, 0.07), new THREE.Euler(0, 0, -0.1), c.M.cloth2);
  },
  /** A zip down the back, its pull hanging. */
  Zipper: (c) => {
    for (let i = 0; i < 18; i++) {
      const y = 0.92 + i * 0.028;
      const z = -(c.torsoR(Math.min(1.4, y)) * 0.68 + 0.035);
      c.put("spine", new THREE.BoxGeometry(0.02, 0.008, 0.008).translate(i % 2 ? 0.004 : -0.004, y, z), c.M.metal);
    }
    c.put("chest", new RoundedBoxGeometry(0.018, 0.04, 0.006, 1, 0.002).translate(0, 1.36, -(c.torsoR(1.36) * 0.68 + 0.04)), c.M.metal);
  },

  // ---- Clothes and feet.
  /** A hooded sweatshirt (outfit colour): the hood bunched at the back, a front pocket, drawstrings. */
  Hoodie: (c) => {
    const { M, put } = c;
    put("spine", c.shell(0.84, 1.17, 1.12), M.cloth1, "hoodie");
    put("chest", c.shell(1.1, 1.45, 1.1), M.cloth1, "hoodie");
    const band = new THREE.CylinderGeometry(0.2, 0.19, 0.05, 36, 1, true);
    band.scale(1, 1, 0.75);
    band.translate(0, 0.86, 0);
    put("spine", band, M.cloth1);
    for (const [s, side] of SIDES) {
      put(`${side}UpperArm`, sleeve(s, 0.17, 0.45, 0.075, 0.07, 0.15, 1.375), M.cloth1, "hoodie");
      put(`${side}LowerArm`, sleeve(s, 0.43, 0.63, 0.07, 0.058, 0.15, 1.372), M.cloth1, "hoodie");
      put(`${side}LowerArm`, limb(V(s * 0.61, 1.37, 0), V(s * 0.645, 1.37, 0), 0.058, 0.055), M.cloth3);
      put("chest", limb(V(s * 0.03, 1.4, 0.13), V(s * 0.035, 1.27, 0.15), 0.004, 0.004), M.white);
    }
    // Hood, bunched round the back of the neck.
    const hood = new THREE.TorusGeometry(0.1, 0.045, 12, 28, Math.PI * 1.3);
    hood.rotateX(Math.PI / 2);
    hood.rotateY(Math.PI * 0.85);
    hood.translate(0, 1.45, -0.02);
    put("chest", hood, M.cloth1);
    put("chest", blob(0.11, 0.09, 0.06).translate(0, 1.4, -0.14), M.cloth1);
    // Kangaroo pocket.
    const pocket = new RoundedBoxGeometry(0.22, 0.11, 0.02, 2, 0.01);
    pocket.translate(0, 0.98, c.torsoR(0.98) * 0.68 * 1.12 + 0.005);
    put("spine", pocket, M.cloth1);
  },
  /** Chunky sneakers: trim colour, a white sole and toe cap, laces. */
  Sneakers: (c) => {
    for (const [s, side] of SIDES) {
      const foot = `${side}Foot`;
      c.put(foot, blob(0.064, 0.06, 0.135).translate(s * 0.1, 0.065, 0.045), c.M.cloth3);
      const sole = new RoundedBoxGeometry(0.13, 0.035, 0.3, 2, 0.014);
      sole.translate(s * 0.1, 0.017, 0.045);
      c.put(foot, sole, c.M.white);
      c.put(foot, blob(0.06, 0.04, 0.055).translate(s * 0.1, 0.05, 0.14), c.M.white);
      for (let k = 0; k < 3; k++) c.put(foot, new THREE.BoxGeometry(0.06, 0.006, 0.008).translate(s * 0.1, 0.105 - k * 0.006, 0.07 + k * 0.025).rotateX(0), c.M.white);
      c.put(`${side}LowerLeg`, limb(V(s * 0.1, 0.16, 0), V(s * 0.1, 0.1, 0), 0.06, 0.062), c.M.cloth3);
    }
  },
  /** Bare animal feet: long, furry, a lighter pad and four toes. */
  Feet_Paws: (c) => {
    for (const [s, side] of SIDES) {
      const foot = `${side}Foot`;
      c.put(foot, blob(0.058, 0.045, 0.14).translate(s * 0.1, 0.045, 0.05), c.M.skin);
      for (let k = 0; k < 4; k++) c.put(foot, blob(0.017, 0.016, 0.024).translate(s * (0.07 + k * 0.02), 0.022, 0.17), c.M.skin);
      c.put(foot, blob(0.04, 0.008, 0.09).translate(s * 0.1, 0.004, 0.05), c.M.fur2);
    }
  },
});

void legWeights;
