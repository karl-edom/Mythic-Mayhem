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
import { blob, canvas, limb, seeded, texture } from "./turtle.ts";

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

/** Optional parts, shown only when the look's `show` list names them. */
const OPTIONAL = ["Scar_Cross"];

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
function pleatedTube(yTop: number, yBot: number, rTop: number, rBot: number, pleats: number, depth = 0.85): THREE.BufferGeometry {
  const h = yTop - yBot;
  const g = new THREE.CylinderGeometry(rTop, rBot, h, pleats * 6, 8, true);
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

// ---------------------------------------------------------------------------

interface SwordsmanMaterials {
  skin: THREE.MeshPhysicalMaterial;
  gi: THREE.MeshPhysicalMaterial;
  hakama: THREE.MeshPhysicalMaterial;
  obi: THREE.MeshPhysicalMaterial;
  hair: THREE.MeshPhysicalMaterial;
  tabi: THREE.MeshStandardMaterial;
  straw: THREE.MeshStandardMaterial;
  thong: THREE.MeshStandardMaterial;
  lacquer: THREE.MeshPhysicalMaterial;
  brass: THREE.MeshPhysicalMaterial;
  eyeWhite: THREE.MeshPhysicalMaterial;
  iris: THREE.MeshPhysicalMaterial;
  line: THREE.MeshStandardMaterial;
  scar: THREE.MeshStandardMaterial;
}

let shared: SwordsmanMaterials | null = null;

function materials(): SwordsmanMaterials {
  if (shared) return shared;
  const cloth = weave(5, 1);
  shared = {
    skin: new THREE.MeshPhysicalMaterial({
      name: "skin", color: "#efc29c", roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color("#ffd9c0"), sheenRoughness: 0.6, clearcoat: 0.05,
    }),
    gi: new THREE.MeshPhysicalMaterial({
      name: "gi", color: "#ebe5d6", map: cloth, roughness: 0.9, sheen: 0.4, sheenColor: new THREE.Color("#ffffff"), sheenRoughness: 0.8, side: THREE.DoubleSide,
    }),
    hakama: new THREE.MeshPhysicalMaterial({
      name: "hakama", color: "#8a8276", map: weave(7, 2), roughness: 0.95, sheen: 0.12, sheenColor: new THREE.Color("#d8c8c0"), sheenRoughness: 0.9, side: THREE.DoubleSide,
    }),
    obi: new THREE.MeshPhysicalMaterial({ name: "obi", color: "#8d867b", map: cloth, roughness: 0.85, sheen: 0.3, side: THREE.DoubleSide }),
    hair: new THREE.MeshPhysicalMaterial({
      name: "hair", color: "#1d1612", map: hairTexture(), roughness: 0.5, sheen: 0.35, sheenColor: new THREE.Color("#ffd0b0"), sheenRoughness: 0.4,
      clearcoat: 0.2, clearcoatRoughness: 0.4, side: THREE.DoubleSide,
    }),
    tabi: new THREE.MeshStandardMaterial({ name: "tabi", color: "#f1eee6", roughness: 0.9 }),
    straw: new THREE.MeshStandardMaterial({ name: "straw", color: "#ffffff", map: strawTexture(), roughness: 0.95 }),
    thong: new THREE.MeshStandardMaterial({ name: "thong", color: "#e9e2d0", roughness: 0.8 }),
    lacquer: new THREE.MeshPhysicalMaterial({ name: "lacquer", color: "#4a1d12", roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15 }),
    brass: new THREE.MeshPhysicalMaterial({ name: "brass", color: "#b08a3e", metalness: 0.85, roughness: 0.35 }),
    eyeWhite: new THREE.MeshPhysicalMaterial({ name: "eye", color: "#f6f3ec", roughness: 0.25, clearcoat: 1 }),
    iris: new THREE.MeshPhysicalMaterial({ name: "iris", color: "#5e3d78", roughness: 0.1, clearcoat: 1 }),
    line: new THREE.MeshStandardMaterial({ name: "line", color: "#2a1a14", roughness: 0.8 }),
    scar: new THREE.MeshStandardMaterial({ name: "scar", color: "#8e3f38", roughness: 0.7 }),
  };
  return shared;
}

/**
 * The swordsman in T-pose, facing +Z, feet at y = 0. Bones are plain objects with the
 * VRM humanoid names; each part hangs from the bone that moves it.
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
  /** Adds a mesh to a bone, the geometry given in model (T-pose world) coordinates. */
  const put = (bone: string, geo: THREE.BufferGeometry, mat: THREE.Material, name = "") => {
    const w = world.get(bone)!;
    geo.translate(-w.x, -w.y, -w.z);
    const m = new THREE.Mesh(geo, mat);
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    bones.get(bone)!.add(m);
    return m;
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // --- Gi: the jacket, tucked into the hakama. Lower body on the spine, upper on the chest.
  put("spine", new THREE.CylinderGeometry(0.175, 0.185, 0.24, 32, 2, true).scale(1, 1, 0.72).translate(0, 1.04, 0), M.gi, "gi");
  {
    const g = new THREE.CylinderGeometry(0.19, 0.178, 0.3, 32, 4, true);
    g.scale(1, 1, 0.7);
    g.translate(0, 1.27, 0);
    put("chest", g, M.gi, "gi");
    // Shoulders: soft caps where the sleeves join.
    for (const s of [-1, 1]) put("chest", blob(0.08, 0.06, 0.085).translate(s * 0.165, 1.385, 0), M.gi, "gi");
    // Top of the jacket round the neck.
    put("chest", blob(0.17, 0.05, 0.12).translate(0, 1.415, -0.005), M.gi, "gi");
  }
  // Open V of the collar: the chest shows between the lapels, left over right.
  {
    const tri = new THREE.BufferGeometry();
    tri.setAttribute("position", new THREE.Float32BufferAttribute([-0.06, 1.44, 0.128, 0.07, 1.44, 0.128, 0.01, 1.25, 0.136], 3));
    tri.setIndex([0, 2, 1]);
    tri.computeVertexNormals();
    put("chest", tri, M.skin);
    for (const [s, len, x, y] of [[1, 0.27, -0.03, 1.33], [-1, 0.25, 0.04, 1.34]] as const) {
      const lapel = new RoundedBoxGeometry(0.045, len, 0.02, 2, 0.008);
      lapel.rotateZ(s * 0.32);
      lapel.rotateX(-0.12);
      lapel.translate(x, y, 0.135);
      put("chest", lapel, M.gi, "gi");
    }
    // Collar band behind the neck.
    const back = new THREE.TorusGeometry(0.075, 0.016, 8, 24, Math.PI);
    back.rotateX(Math.PI / 2);
    back.rotateZ(Math.PI);
    back.translate(0, 1.44, 0.02);
    put("chest", back, M.gi, "gi");
  }

  // --- Hakama: a pleated skirt from the hips, each leg a wide flared tube (they move
  // with the legs). Ties wound round and bowed in front; the stiff back plate.
  put("hips", pleatedTube(1.0, 0.7, 0.215, 0.275, 9, 0.78), M.hakama, "hakama");
  for (const s of [-1, 1]) {
    const side = s > 0 ? "left" : "right";
    put(`${side}UpperLeg`, pleatedTube(0.86, 0.44, 0.15, 0.2, 6).translate(s * 0.115, 0, 0), M.hakama, "hakama");
    put(`${side}LowerLeg`, pleatedTube(0.56, 0.05, 0.175, 0.215, 7).translate(s * 0.115, 0, 0), M.hakama, "hakama");
  }
  {
    const plate = new RoundedBoxGeometry(0.2, 0.12, 0.02, 2, 0.008);
    plate.rotateX(0.2);
    plate.translate(0, 0.985, -0.165);
    put("hips", plate, M.hakama, "hakama");
    // Obi and the hakama ties over it.
    for (const [y, r, mat] of [[0.99, 0.034, M.obi], [0.955, 0.022, M.hakama], [1.025, 0.014, M.hakama]] as const) {
      const g = new THREE.TorusGeometry(1, r, 10, 48);
      g.rotateX(Math.PI / 2);
      g.scale(0.205, 1, 0.152);
      g.translate(0, y, 0);
      put("hips", g, mat, mat === M.hakama ? "hakama" : "obi");
    }
    // The bow: two loops and two hanging ends.
    for (const s of [-1, 1]) {
      const loop = new THREE.TorusGeometry(0.035, 0.012, 8, 16);
      loop.scale(1.3, 0.75, 0.6);
      loop.translate(s * 0.042, 0.965, 0.17);
      put("hips", loop, M.hakama, "hakama");
      const end = new RoundedBoxGeometry(0.03, 0.11, 0.01, 2, 0.004);
      end.rotateZ(s * 0.25);
      end.translate(s * 0.022, 0.9, 0.172);
      put("hips", end, M.hakama, "hakama");
    }
    put("hips", blob(0.022, 0.02, 0.015).translate(0, 0.965, 0.175), M.hakama, "hakama");
  }

  // --- The sheath, through the obi on the left hip, pointing back and down.
  {
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
    saya.add(new THREE.Mesh(cord, M.obi));
    for (const m of saya.children) (m as THREE.Mesh).castShadow = true;
    // Mouth in front of the left hip, body going back and down.
    saya.position.set(0.17, 1.0, 0.13).sub(world.get("hips")!);
    saya.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0.12, -0.42, -1).normalize());
    bones.get("hips")!.add(saya);
  }

  // --- Arms: sleeves wide at the cuff and hanging, forearms bare, closed fists.
  for (const s of [1, -1]) {
    const side = s > 0 ? "left" : "right";
    const sx = (x: number) => s * x;
    put(`${side}UpperArm`, sleeve(s, 0.17, 0.45, 0.085, 0.115, 0.5, 1.375), M.gi, "gi");
    put(`${side}LowerArm`, sleeve(s, 0.43, 0.56, 0.12, 0.13, 1.1, 1.372), M.gi, "gi");
    put(`${side}UpperArm`, limb(V(sx(0.2), 1.37, 0), V(sx(0.44), 1.37, 0), 0.055, 0.045), M.skin);
    put(`${side}LowerArm`, limb(V(sx(0.45), 1.37, 0), V(sx(0.64), 1.37, 0), 0.045, 0.034), M.skin);
    // Fist: palm, four curled fingers, the thumb across.
    const fist = new RoundedBoxGeometry(0.085, 0.075, 0.08, 3, 0.025);
    fist.translate(sx(0.7), 1.365, 0.004);
    put(`${side}Hand`, fist, M.skin);
    for (let k = 0; k < 4; k++) {
      const f = new THREE.CapsuleGeometry(0.0145, 0.035, 4, 8);
      f.rotateX(Math.PI / 2);
      f.translate(sx(0.738), 1.348, 0.03 - k * 0.02);
      put(`${side}Hand`, f, M.skin);
    }
    const thumb = new THREE.CapsuleGeometry(0.014, 0.035, 4, 8);
    thumb.rotateZ(Math.PI / 2);
    thumb.translate(sx(0.705), 1.338, 0.045);
    put(`${side}Hand`, thumb, M.skin);
  }

  // --- Legs: mostly inside the hakama; ankles, tabi socks and straw sandals.
  for (const s of [1, -1]) {
    const side = s > 0 ? "left" : "right";
    const sx = (x: number) => s * x;
    put(`${side}UpperLeg`, limb(V(sx(0.1), 0.86, 0), V(sx(0.1), 0.52, 0), 0.085, 0.065), M.hakama, "hakama");
    // Inside the hakama the shin is cloth-coloured (seen up the hem); the tabi start at the ankle.
    put(`${side}LowerLeg`, limb(V(sx(0.1), 0.5, 0), V(sx(0.1), 0.16, 0), 0.06, 0.05), M.hakama, "hakama");
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

  // --- Neck and head: a lean face, big anime eyes, spiky bangs and a long ponytail.
  put("neck", limb(V(0, 1.4, 0.0), V(0, 1.52, 0.01), 0.048, 0.044), M.skin);
  {
    put("head", blob(0.092, 0.105, 0.1, 40).translate(0, 1.6, 0.0), M.skin, "skull");
    put("head", blob(0.078, 0.07, 0.08, 40).translate(0, 1.545, 0.025), M.skin, "jaw");
    put("head", blob(0.03, 0.022, 0.03).translate(0, 1.5, 0.07), M.skin, "chin");
    const nose = new THREE.ConeGeometry(0.012, 0.035, 8);
    nose.rotateX(Math.PI / 2 + 0.5);
    nose.translate(0, 1.565, 0.105);
    put("head", nose, M.skin);
    for (const s of [-1, 1]) put("head", blob(0.016, 0.026, 0.014).translate(s * 0.092, 1.575, 0.0), M.skin); // ears
    // Mouth: a short calm line.
    const mouth = new RoundedBoxGeometry(0.03, 0.004, 0.006, 1, 0.002);
    mouth.translate(0, 1.523, 0.103);
    put("head", mouth, M.line);
    // Eyes: almond whites, large irises, a heavy upper lash line and the brows.
    for (const s of [-1, 1]) {
      const white = blob(0.024, 0.014, 0.01);
      white.rotateY(s * 0.38);
      put("head", white.translate(s * 0.036, 1.59, 0.093), M.eyeWhite);
      const iris = blob(0.011, 0.012, 0.005);
      iris.rotateY(s * 0.38);
      put("head", iris.translate(s * 0.034, 1.589, 0.1), M.iris);
      const lash = new RoundedBoxGeometry(0.05, 0.006, 0.008, 1, 0.003);
      lash.rotateZ(s * -0.12);
      lash.rotateY(s * 0.38);
      lash.translate(s * 0.036, 1.603, 0.099);
      put("head", lash, M.line);
      const brow = new RoundedBoxGeometry(0.045, 0.008, 0.01, 1, 0.004);
      brow.rotateZ(s * 0.18);
      brow.rotateY(s * 0.38);
      brow.translate(s * 0.038, 1.625, 0.097);
      put("head", brow, M.hair, "hair");
    }
    // Optional: a cross-shaped scar on the left cheek.
    {
      const scar = new THREE.Group();
      scar.name = "Scar_Cross";
      for (const [rot, len] of [[0.5, 0.036], [-0.75, 0.028]] as const) {
        const cut = new RoundedBoxGeometry(0.0035, len, 0.003, 1, 0.0015);
        cut.rotateZ(rot);
        const m = new THREE.Mesh(cut, M.scar);
        scar.add(m);
      }
      scar.position.set(0.05, 1.548, 0.089).sub(world.get("head")!);
      scar.rotation.y = 0.62;
      bones.get("head")!.add(scar);
    }

    // Hair: a cap over the top and back of the skull.
    const cap = new THREE.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, 1.25);
    cap.scale(0.102, 0.118, 0.11);
    cap.translate(0, 1.61, -0.005);
    put("head", cap, M.hair, "hair");
    const back = new THREE.SphereGeometry(1, 32, 24, Math.PI * 0.15, Math.PI * 0.7, 0.9, 1.25);
    back.rotateY(Math.PI);
    back.scale(0.104, 0.115, 0.112);
    back.translate(0, 1.6, -0.005);
    put("head", back, M.hair, "hair");
    // Spikes: bangs falling over the forehead and down the sides of the face, a few on top.
    const r = seeded(21);
    const spike = (root: THREE.Vector3, dir: THREE.Vector3, len: number, rad: number) => {
      const g = new THREE.ConeGeometry(rad, len, 6, 1);
      g.rotateX(Math.PI);
      g.translate(0, -len / 2, 0); // thick base at the root, tip along −Y
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir.clone().normalize()));
      g.translate(root.x, root.y, root.z);
      put("head", g, M.hair, "hair");
    };
    for (let i = 0; i < 9; i++) {
      const x = -0.075 + (i / 8) * 0.15;
      const len = 0.09 + r() * 0.06 + (Math.abs(x) > 0.05 ? 0.03 : 0);
      spike(V(x, 1.69, 0.07), V(x * 2.2 + (r() - 0.5) * 0.3, -1, 0.35), len, 0.022 + r() * 0.008);
    }
    for (const s of [-1, 1]) {
      spike(V(s * 0.085, 1.64, 0.05), V(s * 0.12, -1, 0.12), 0.16, 0.024); // side locks to the jaw
      spike(V(s * 0.095, 1.65, 0.0), V(s * 0.35, -1, -0.1), 0.12, 0.026);
    }
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      // Lying back over the crown, tips lifting a little: messy, not a crest.
      spike(V(Math.sin(a) * 0.06, 1.69, Math.cos(a) * 0.05 + 0.01), V(Math.sin(a) * 0.55, 0.12, -0.85), 0.09 + r() * 0.04, 0.032);
    }
    // Ponytail, tied high at the back: a pivot the animation swings (see animateSwordsman).
    const tail = new THREE.Group();
    tail.name = "ponytail";
    const tie = V(0, 1.6, -0.105);
    tail.position.copy(tie).sub(world.get("head")!);
    {
      const len = 0.5;
      const pts: THREE.Vector2[] = [];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        pts.push(new THREE.Vector2(0.028 + 0.03 * Math.sin(Math.PI * Math.min(1, t * 1.6)) * (1 - t) - 0.022 * t, -t * len));
      }
      const g = new THREE.LatheGeometry(pts, 12);
      g.scale(1, 1, 0.75);
      const m = new THREE.Mesh(g, M.hair);
      m.name = "hair";
      m.castShadow = true;
      tail.add(m);
      // A few loose strands splitting from the bundle near its end.
      for (let i = 0; i < 5; i++) {
        const s = new THREE.ConeGeometry(0.012, 0.18, 5);
        s.translate(0, -0.09, 0);
        s.rotateZ((r() - 0.5) * 0.5);
        s.rotateX((r() - 0.5) * 0.4);
        s.translate((r() - 0.5) * 0.03, -len * 0.62, (r() - 0.5) * 0.02);
        const sm = new THREE.Mesh(s, M.hair);
        sm.name = "hair";
        tail.add(sm);
      }
      const band = new THREE.TorusGeometry(0.026, 0.008, 6, 14);
      band.rotateX(Math.PI / 2);
      band.translate(0, -0.02, 0);
      tail.add(new THREE.Mesh(band, M.obi));
    }
    tail.userData.restDown = new THREE.Vector3(0, -1, -0.25).normalize();
    bones.get("head")!.add(tail);
  }
  // A touch big, so the face reads from the arena camera.
  bones.get("head")!.scale.setScalar(1.1);
  rig.updateMatrixWorld(true);
  return rig;
}

/**
 * Brings an instance's ponytail to life: each frame it turns toward where it would
 * hang (down, a little back), dragged behind the head's motion and settling with lag.
 * Purely visual.
 */
export function animateSwordsman(root: THREE.Object3D): void {
  const tail = root.getObjectByName("ponytail");
  const anchor = tail?.children.find((c) => c instanceof THREE.Mesh) as THREE.Mesh | undefined;
  if (!tail || !anchor) return;
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
}

/** Colours and optional parts of an instance (its materials are its own copies by then). */
export function paintSwordsman(root: THREE.Object3D, look: { show: string[]; hair?: string; outfit?: string }): void {
  root.traverse((o) => {
    if (OPTIONAL.includes(o.name)) o.visible = look.show.includes(o.name);
    if (!(o instanceof THREE.Mesh)) return;
    const name = (o.material as THREE.Material).name;
    if (name === "hair" && look.hair) (o.material as THREE.MeshPhysicalMaterial).color.set(look.hair);
    if (name === "hakama" && look.outfit) (o.material as THREE.MeshPhysicalMaterial).color.set(look.outfit);
  });
}
