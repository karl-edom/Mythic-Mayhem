// Character models, all built in code: a humanoid with a wardrobe of parts and a
// turtle. Their hand-keyed poses replace most clips; the few left (falls, cheers…)
// are KayKit's (CC0), retargeted onto their skeleton (see retarget.ts). Weapons are
// built in code too (weapons.ts). The first models (KayKit chibis, VRoid avatars)
// were retired with the first fighters (decision 0024).

import * as THREE from "three";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import type { Look, ModelId } from "../brawl/character.ts";
import { turtlePoses } from "./poses.ts";
import { fistPoses } from "./fistPoses.ts";
import { fistSignatures, signaturePoses } from "./signaturePoses.ts";
import { staffPoses, swordsmanPoses } from "./swordPoses.ts";
import { SWORDSMAN_HEIGHT, animateSwordsman, buildSwordsmanRig, paintSwordsman } from "./swordsman.ts";
import "./humanParts.ts";
import "./creatureParts.ts";
import { TURTLE_BONES, TURTLE_HEIGHT, animateTurtle, buildTurtleRig, paintTurtle } from "./turtle.ts";
import type { Archetype } from "../brawl/kit.ts";
import { KAYKIT_TO_HUMANOID, LOCOMOTION, LOCOMOTION_LEGS, Retargeter, amplifyClip, amplitudeFor, clenchFists } from "./retarget.ts";
import { noOutline, outlineOf } from "./toon.ts";
import { ANIME_WEAPONS, buildWeapon } from "./weapons.ts";

/** Fighters stand this tall on screen: about the simulation's fighter height. */
const ANIME_HEIGHT = 1.8;

interface AnimeTemplate {
  /** Faces +Z like the KayKit rig (VRM 0.x avatars face −Z). */
  rig: THREE.Group;
  height: number;
  /** Retargeted shared clips, then the full set per fighting style (see `poseStyle`). */
  base?: Map<string, THREE.AnimationClip>;
  clips?: Map<PoseStyle, Map<string, THREE.AnimationClip>>;
  /** Built in code with physically based materials: kept as they are (not cel-shaded). */
  procedural?: boolean;
  /** Hand-keyed clips that replace the retargeted ones of the same name (stances from a reference sheet). */
  poses?: (style: PoseStyle) => Map<string, THREE.AnimationClip>;
  /** Procedural models: colours, optional parts and secondary motion of an instance. */
  dress?: (rig: THREE.Object3D, look: Look) => void;
}

/** Reflections for procedural models (lacquer, steel, shell): set by the view once it has a renderer. */
export const proceduralEnv: { map: THREE.Texture | null } = { map: null };

/**
 * An outdoor sky photographed in the round (HDRI, Poly Haven "park", CC0, 512 px; see
 * public/assets/CREDITS.md): the light everything is lit and reflected with, once
 * turned into an environment map by the view. Null if it could not be loaded (the
 * view then falls back to a studio made in code).
 */
export const skyLight: { hdr: THREE.DataTexture | null } = { hdr: null };

async function loadSkyLight(base: string): Promise<void> {
  try {
    const url = new URL(`../assets/hdri/park.${EXT === "glb" ? "exr" : "json"}`, base).href;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
    // Hosts that only serve common types get it wrapped in JSON, as the models.
    const buffer = EXT === "glb" ? await res.arrayBuffer() : Uint8Array.from(atob(((await res.json()) as { data: string }).data), (c) => c.charCodeAt(0)).buffer;
    const tex = new EXRLoader().parse(buffer) as unknown as { width: number; height: number; data: Uint16Array | Float32Array; type: THREE.TextureDataType };
    // Toned down for a painted world: 60 % less colour and a touch warmer, or the blue
    // of the sky floods every glossy surface (tiles, lacquer).
    const half = tex.type === THREE.HalfFloatType;
    const get = (i: number) => (half ? THREE.DataUtils.fromHalfFloat(tex.data[i]!) : tex.data[i]!);
    const set = (i: number, v: number) => (tex.data[i] = half ? THREE.DataUtils.toHalfFloat(v) : v);
    for (let i = 0; i < tex.data.length; i += 4) {
      const r = get(i), g = get(i + 1), b = get(i + 2);
      const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      set(i, (l + (r - l) * 0.4) * 1.04);
      set(i + 1, l + (g - l) * 0.4);
      set(i + 2, (l + (b - l) * 0.4) * 0.92);
    }
    const t = new THREE.DataTexture(tex.data, tex.width, tex.height, THREE.RGBAFormat, tex.type);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.LinearSRGBColorSpace;
    t.flipY = true;
    t.minFilter = t.magFilter = THREE.LinearFilter;
    t.needsUpdate = true;
    skyLight.hdr = t;
  } catch (e) {
    console.warn("Ciel HDRI indisponible, studio de repli :", e);
  }
}

export interface ModelLibrary {
  anime: Map<ModelId, AnimeTemplate>;
  /** KayKit clips, as authored. */
  clips: Map<string, THREE.AnimationClip>;
  /** The KayKit skeleton the clips were authored on (source of retargeting). */
  rig: THREE.Object3D;
}

/** Fallback look from the kit archetype, for packs that do not choose one. */
export function defaultLook(archetype: Archetype): Look {
  switch (archetype) {
    case "rushdown":
      return { model: "swordsman", show: ["Kunai", "Kunai_Offhand", "Jacket", "Pants_Ninja", "Sandals_Ninja", "Hair_Spiky"], tint: "#ffffff", outfit: "#3a4a6a" };
    case "heavy":
      return { model: "swordsman", show: ["2H_Odachi", "Build_Muscular", "Vest", "Pants_Baggy", "Boots_Martial", "Hair_Spiky"], tint: "#ffffff", outfit: "#7a3a2a" };
    case "zoner":
      return { model: "swordsman", show: ["Bo", "Robe_Tattered", "Pants_Baggy", "Sandals_Wrapped", "Hair_Saito"], tint: "#ffffff", outfit: "#2a5a5a" };
    default:
      return { model: "swordsman", show: ["1H_Katana", "Saya"], tint: "#ffffff" };
  }
}

export type WeaponStyle = "1h" | "2h" | "dual" | "unarmed";

/** How the fighter holds its weapons, from what the look shows. Picks the attack animations. */
export function weaponStyle(look: Look): WeaponStyle {
  const shown = look.show;
  if (shown.some((s) => s.startsWith("2H_"))) return "2h";
  if (shown.some((s) => s.endsWith("_Offhand"))) return "dual";
  if (shown.some((s) => /^1H_|^Knife$|^Kunai$/.test(s))) return "1h";
  return "unarmed";
}

/**
 * Model file extension. "json" is for hosts that serve neither .glb files nor fetches of
 * data:/blob: URLs (the published artifact): each file then holds {"glb": "<base64>"},
 * fetched as a plain same-origin file and parsed in memory.
 */
const EXT = (import.meta.env?.VITE_MODEL_EXT as string | undefined) ?? "glb";

type Gltf = Awaited<ReturnType<GLTFLoader["loadAsync"]>>;

async function fetchModel(loader: GLTFLoader, url: string): Promise<Gltf> {
  if (EXT === "glb") return loader.loadAsync(url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
  const { glb } = (await res.json()) as { glb: string };
  const bytes = Uint8Array.from(atob(glb), (c) => c.charCodeAt(0));
  // Textures through <img> elements rather than fetch(blob:), which such hosts refuse.
  // The loader picks its image loader when the parse starts (synchronously).
  const g = globalThis as { createImageBitmap?: unknown };
  const saved = g.createImageBitmap;
  g.createImageBitmap = undefined;
  try {
    return loader.parseAsync(bytes.buffer, "");
  } finally {
    g.createImageBitmap = saved;
  }
}

export async function loadModels(base: string, onProgress?: (done: number, total: number) => void): Promise<ModelLibrary> {
  const loader = new GLTFLoader();
  // The shared clips and the skeleton they were authored on.
  const [shared] = await Promise.all([fetchModel(loader, new URL(`kaykit/animations.${EXT}`, base).href), loadSkyLight(base)]);
  onProgress?.(1, 1);
  const anime = new Map<ModelId, AnimeTemplate>();
  const turtle = buildTurtleRig();
  const hipsRest = turtle.getObjectByName("hips")!.position.clone();
  anime.set("turtle", {
    rig: turtle, height: TURTLE_HEIGHT, procedural: true, poses: (style) =>
      style === "sword" ? new Map([...swordsmanPoses(hipsRest, TURTLE_BONES), ...signaturePoses(hipsRest, TURTLE_BONES)])
      : style === "staff" ? staffPoses(hipsRest, TURTLE_BONES)
      : style === "club" ? swordsmanPoses(hipsRest, TURTLE_BONES, { oneHand: true })
      : style === "fist" ? new Map([...fistPoses(hipsRest, TURTLE_BONES), ...fistSignatures(hipsRest, TURTLE_BONES)])
      : turtlePoses(hipsRest),
    dress: (rig, look) => {
      paintTurtle(rig, look);
      animateTurtle(rig);
    },
  });
  const swordsman = buildSwordsmanRig();
  const swordsmanHips = swordsman.getObjectByName("hips")!.position.clone();
  anime.set("swordsman", {
    rig: swordsman, height: SWORDSMAN_HEIGHT, procedural: true, poses: (style) =>
      style === "staff" ? staffPoses(swordsmanHips)
      : style === "club" ? swordsmanPoses(swordsmanHips, undefined, { oneHand: true })
      : style === "fist" ? new Map([...fistPoses(swordsmanHips), ...fistSignatures(swordsmanHips)])
      : style === "dual" ? turtlePoses(swordsmanHips)
      : new Map([...swordsmanPoses(swordsmanHips), ...signaturePoses(swordsmanHips)]),
    dress: (rig, look) => {
      paintSwordsman(rig, look);
      animateSwordsman(rig);
      animateTurtle(rig);
    },
  });
  return {
    anime,
    clips: new Map(shared.animations.map((c) => [c.name, c] as const)),
    rig: shared.scene,
  };
}

/**
 * How a fighter moves, from the weapons it carries: a sword, a staff, a one-handed club,
 * a pair of short weapons, or bare fists.
 */
export type PoseStyle = "dual" | "sword" | "staff" | "club" | "fist";
const SWORDS = ["1H_Katana", "2H_Odachi", "Sakabato", "Mugenjin", "Chokuto"];
const STAFFS = ["Bo", "2H_Staff", "Staff_Gnarled"];
const CLUBS = ["Pan", "Bottle"];
export const poseStyle = (show: string[]): PoseStyle =>
  show.some((w) => SWORDS.includes(w)) ? "sword"
  : show.some((w) => STAFFS.includes(w)) ? "staff"
  : show.some((w) => CLUBS.includes(w)) ? "club"
  : show.some((w) => (ANIME_WEAPONS as readonly string[]).includes(w)) ? "dual"
  : "fist";

/**
 * The shared clips retargeted onto an anime avatar, then, for procedural models, the
 * hand-keyed set of the fighting style replacing them. Computed on first use.
 */
function animeClips(lib: ModelLibrary, t: AnimeTemplate, style: PoseStyle): Map<string, THREE.AnimationClip> {
  const done = t.clips?.get(style);
  if (done) return done;
  if (!t.base) {
    const r = new Retargeter({ source: lib.rig, target: t.rig, map: KAYKIT_TO_HUMANOID, armDrop: 0.5 });
    t.base = new Map(
      [...lib.clips].map(([name, clip]) => {
        const loco = LOCOMOTION.test(name);
        let out = amplifyClip(r.retarget(clip, 30, loco ? 0.3 : 0.6), amplitudeFor(name), loco ? "mean" : "first", loco ? LOCOMOTION_LEGS : undefined);
        if (loco) out = groundClip(t, out);
        if (loco) out.userData.naturalSpeed = naturalSpeed(t, out) * (ANIME_HEIGHT / t.height);
        return [name, out] as const;
      }),
    );
  }
  const clips = new Map(t.base);
  if (t.poses)
    for (const [name, clip] of t.poses(style)) {
      // Hand-keyed cycles get their stride speed measured like the retargeted ones.
      if (LOCOMOTION.test(name)) {
        const grounded = groundClip(t, clip);
        grounded.userData.naturalSpeed = naturalSpeed(t, grounded) * (ANIME_HEIGHT / t.height);
        clips.set(name, grounded);
      } else clips.set(name, clip);
    }
  (t.clips ??= new Map()).set(style, clips);
  return clips;
}

/**
 * Keeps a locomotion cycle on the ground: at each frame the hips go down (or up) by
 * how far the lower foot is from its rest height, so the supporting foot touches the
 * floor instead of the whole body floating above it on bent legs.
 */
function groundClip(t: AnimeTemplate, clip: THREE.AnimationClip): THREE.AnimationClip {
  const track = clip.tracks.find((k) => k.name === "hips.position") as THREE.VectorKeyframeTrack | undefined;
  if (!track) return clip;
  const rig = SkeletonUtils.clone(t.rig);
  rig.updateMatrixWorld(true);
  const feet = ["leftFoot", "rightFoot"].map((n) => rig.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o);
  const hips = rig.getObjectByName("hips");
  if (feet.length < 2 || !hips) return clip;
  const p = new THREE.Vector3();
  const restY = Math.min(...feet.map((f) => f.getWorldPosition(p).y));
  // Rig units per hips-parent unit, vertically.
  const scale = hips.parent!.getWorldScale(new THREE.Vector3()).y;
  const mixer = new THREE.AnimationMixer(rig);
  const action = mixer.clipAction(clip);
  action.play();
  const out = track.clone();
  for (let i = 0; i < out.times.length; i++) {
    mixer.setTime(Math.min(out.times[i]!, clip.duration * 0.999));
    rig.updateMatrixWorld(true);
    const low = Math.min(...feet.map((f) => f.getWorldPosition(p).y));
    out.values[i * 3 + 1]! -= (low - restY) / scale;
  }
  mixer.stopAllAction();
  return new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.map((k) => (k === track ? out : k)));
}

/**
 * Ground speed at which a locomotion cycle plays without foot sliding (rig units per
 * second): a foot sweeps its full range twice per cycle (one stride per leg).
 */
function naturalSpeed(t: AnimeTemplate, clip: THREE.AnimationClip): number {
  const rig = SkeletonUtils.clone(t.rig);
  const foot = rig.getObjectByName("leftFoot");
  if (!foot) return 0;
  const mixer = new THREE.AnimationMixer(rig);
  mixer.clipAction(clip).play();
  const p = new THREE.Vector3();
  let [minX, maxX, minZ, maxZ] = [Infinity, -Infinity, Infinity, -Infinity];
  for (let i = 0; i <= 24; i++) {
    mixer.setTime((i / 24) * clip.duration * 0.999);
    rig.updateMatrixWorld(true);
    foot.getWorldPosition(p);
    [minX, maxX, minZ, maxZ] = [Math.min(minX, p.x), Math.max(maxX, p.x), Math.min(minZ, p.z), Math.max(maxZ, p.z)];
  }
  const range = Math.max(maxX - minX, maxZ - minZ);
  return (2 * range) / clip.duration;
}

export interface ModelInstance {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  /** Clips this model plays (retargeted for anime avatars). */
  clips: Map<string, THREE.AnimationClip>;
  /** Toon materials of the body, for hit flashes. */
  materials: (THREE.MeshToonMaterial | THREE.MeshStandardMaterial)[];
  /** Two points along the main weapon (or the forearm) that a swing trail follows; null: none. */
  trail: { base: THREE.Object3D; tip: THREE.Object3D } | null;
}

export function instantiate(lib: ModelLibrary, look: Look): ModelInstance {
  return instantiateAnime(lib, look);
}

/** World rotation of a weapon held in each hand in the T-pose, as on the KayKit rig. */
const GRIP = {
  right: { bone: "rightHand", side: -1, quat: new THREE.Quaternion(0, Math.SQRT1_2, Math.SQRT1_2, 0).multiply(new THREE.Quaternion(0, 1, 0, 0)) },
  left: { bone: "leftHand", side: 1, quat: new THREE.Quaternion(0, Math.SQRT1_2, Math.SQRT1_2, 0) },
};
/** Where the closed fist holds the grip, from the hand bone (metres, T-pose). */
const GRIP_OFFSET = { out: 0.07, down: -0.025 };

/** Puts a weapon in the hand of an anime rig (by name; the left hand for "_Offhand"). */
export function attachWeapon(rig: THREE.Object3D, name: string): THREE.Group | null {
  const weapon = buildWeapon(name);
  if (!weapon) return null;
  const grip = name.endsWith("_Offhand") ? GRIP.left : GRIP.right;
  const hand = rig.getObjectByName(grip.bone);
  if (!hand) return null;
  weapon.userData.weapon = name;
  rig.updateMatrixWorld(true);
  const toRig = new THREE.Matrix4().copy(rig.matrixWorld).invert().multiply(hand.matrixWorld);
  const handPos = new THREE.Vector3();
  const handQuat = new THREE.Quaternion();
  toRig.decompose(handPos, handQuat, new THREE.Vector3());
  const at = handPos.add(new THREE.Vector3(grip.side * GRIP_OFFSET.out, GRIP_OFFSET.down, 0));
  weapon.position.copy(at.applyMatrix4(toRig.clone().invert()));
  weapon.quaternion.copy(handQuat.invert().multiply(grip.quat));
  hand.add(weapon);
  return weapon;
}

function instantiateAnime(lib: ModelLibrary, look: Look): ModelInstance {
  const t = lib.anime.get(look.model)!;
  const rig = SkeletonUtils.clone(t.rig) as THREE.Group;
  const materials: (THREE.MeshToonMaterial | THREE.MeshStandardMaterial)[] = [];
  rig.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    // Own copies (hit flashes, mask colour), reflections, a thin ink line for readability.
    const m = (o.material as THREE.MeshStandardMaterial).clone();
    m.envMap = proceduralEnv.map;
    m.envMapIntensity = 0.8;
    // Painted decals (a face) lie on the skin: no ink line round their edge.
    if (m.transparent) noOutline(m);
    else outlineOf(m, 0.0022);
    o.material = m;
    o.castShadow = true;
    o.frustumCulled = false;
    materials.push(m);
  });
  clenchFists(rig);
  t.dress?.(rig, look);
  for (const w of look.show) attachWeapon(rig, w);
  const root = new THREE.Group();
  root.add(rig);
  rig.scale.setScalar(ANIME_HEIGHT / t.height);
  // Swing trail along the main-hand weapon; bare hands: along the forearm.
  const main = rig.getObjectByName("rightHand");
  const base = main?.getObjectByName("trailBase") ?? rig.getObjectByName("trailBase") ?? rig.getObjectByName("rightLowerArm");
  const tip = main?.getObjectByName("trailTip") ?? rig.getObjectByName("trailTip") ?? main;
  const trail = base && tip ? { base, tip } : null;
  return { root, mixer: new THREE.AnimationMixer(rig), clips: animeClips(lib, t, poseStyle(look.show)), materials, trail };
}
