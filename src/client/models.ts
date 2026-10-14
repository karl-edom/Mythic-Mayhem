// Character models. Two families share one set of animations:
// - KayKit chibis (CC0): their own skeleton, the clips play as they are;
// - anime avatars from VRoid Studio (CC0): the clips are retargeted onto their
//   humanoid skeleton (see retarget.ts), weapons are built in code (weapons.ts).
// Every instance is cel-shaded and outlined.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { ANIME_MODELS, MODELS, isAnime, type Look, type ModelId } from "../brawl/character.ts";
import type { Archetype } from "../brawl/kit.ts";
import { KAYKIT_TO_HUMANOID, Retargeter, clenchFists } from "./retarget.ts";
import { noOutline, outlineOf, toToon } from "./toon.ts";
import { buildWeapon } from "./weapons.ts";

/** KayKit fighters stand this tall on screen (feet to top of head): chibis need the extra size. */
const MODEL_HEIGHT = 1.95;
/** Anime fighters: realistic proportions, about the simulation's fighter height. */
const ANIME_HEIGHT = 1.8;

/** Meshes that make the body itself; everything else is an accessory shown on request. */
const BODY_PART = /_(ArmLeft|ArmRight|Body|Head|Head_Hooded|LegLeft|LegRight)$/;

interface AnimeTemplate {
  /** Faces +Z like the KayKit rig (VRM 0.x avatars face −Z). */
  rig: THREE.Group;
  height: number;
  clips?: Map<string, THREE.AnimationClip>;
}

export interface ModelLibrary {
  templates: Map<ModelId, THREE.Object3D>;
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
      return { model: "shino", show: ["Kunai", "Kunai_Offhand"], tint: "#ffffff" };
    case "heavy":
      return { model: "akane", show: ["2H_Odachi"], tint: "#ffffff" };
    case "zoner":
      return { model: "vita", show: ["2H_Staff"], tint: "#ffffff" };
    default:
      return { model: "kaito", show: ["1H_Katana"], tint: "#ffffff" };
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

/** Model file extension: ".glb", or ".json" (self-contained glTF) where .glb files cannot be served. */
const EXT = (import.meta.env?.VITE_MODEL_EXT as string | undefined) ?? "glb";

export async function loadModels(base: string, onProgress?: (done: number, total: number) => void): Promise<ModelLibrary> {
  const loader = new GLTFLoader();
  const files = [
    ...MODELS.map((m) => `kaykit/${m}.${EXT}`),
    `kaykit/animations.${EXT}`,
    ...ANIME_MODELS.map((m) => `anime/${m}.${EXT}`),
  ];
  let done = 0;
  const load = async (f: string) => {
    const g = await loader.loadAsync(new URL(f, base).href);
    onProgress?.(++done, files.length);
    return g;
  };
  // A few files at a time: decoding dozens of textures at once makes some browsers drop images.
  const loaded: Awaited<ReturnType<typeof load>>[] = [];
  for (let i = 0; i < files.length; i += 3) loaded.push(...(await Promise.all(files.slice(i, i + 3).map(load))));
  const templates = new Map<ModelId, THREE.Object3D>();
  MODELS.forEach((m, i) => templates.set(m, loaded[i]!.scene));
  const shared = loaded[MODELS.length]!;
  const anime = new Map<ModelId, AnimeTemplate>();
  ANIME_MODELS.forEach((m, i) => {
    const scene = loaded[MODELS.length + 1 + i]!.scene;
    const facing = new THREE.Group();
    facing.rotation.y = Math.PI;
    facing.add(scene);
    const rig = new THREE.Group();
    rig.add(facing);
    rig.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig);
    anime.set(m, { rig, height: box.max.y - Math.min(0, box.min.y) });
  });
  return {
    templates,
    anime,
    clips: new Map(shared.animations.map((c) => [c.name, c] as const)),
    rig: shared.scene,
  };
}

/** The shared clips retargeted onto an anime avatar, computed on first use. */
function animeClips(lib: ModelLibrary, t: AnimeTemplate): Map<string, THREE.AnimationClip> {
  if (!t.clips) {
    const r = new Retargeter({ source: lib.rig, target: t.rig, map: KAYKIT_TO_HUMANOID, armDrop: 0.5 });
    t.clips = new Map([...lib.clips].map(([name, clip]) => [name, r.retarget(clip)] as const));
  }
  return t.clips;
}

export interface ModelInstance {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  /** Clips this model plays (retargeted for anime avatars). */
  clips: Map<string, THREE.AnimationClip>;
  /** Toon materials of the body, for hit flashes. */
  materials: THREE.MeshToonMaterial[];
}

export function instantiate(lib: ModelLibrary, look: Look): ModelInstance {
  return isAnime(look.model) ? instantiateAnime(lib, look) : instantiateKaykit(lib, look);
}

function instantiateKaykit(lib: ModelLibrary, look: Look): ModelInstance {
  const template = lib.templates.get(look.model)!;
  const model = SkeletonUtils.clone(template);
  const materials: THREE.MeshToonMaterial[] = [];
  const tint = new THREE.Color(look.tint);
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const isBody = BODY_PART.test(o.name);
    o.visible = isBody || look.show.includes(o.name);
    const m = toToon(o.material as THREE.Material);
    if (isBody) m.color.multiply(tint);
    outlineOf(m, 0.004);
    o.material = m;
    o.castShadow = true;
    o.receiveShadow = false;
    o.frustumCulled = false; // skinned bounds do not follow animations
    materials.push(m);
  });
  // Normalise height: feet on the ground, MODEL_HEIGHT tall.
  const root = new THREE.Group();
  root.add(model);
  model.scale.setScalar(MODEL_HEIGHT / 2.45);
  return { root, mixer: new THREE.AnimationMixer(model), clips: lib.clips, materials };
}

// ---------------------------------------------------------------------------
// Anime avatars.

/** Shading hints written by tools/build-anime.ts into each material's extras. */
interface AnimeHints {
  kind?: "skin" | "cloth" | "hair" | "face" | "eye";
  shade?: [number, number, number];
  queue?: number;
}

const gradients = new Map<string, THREE.DataTexture>();

/**
 * Two-step toon ramp whose dark step is the avatar's own shade colour (as in its
 * MToon material): pinkish shadows on skin, bluish on clothes. That is the anime look.
 */
function shadeRamp(shade: [number, number, number]): THREE.DataTexture {
  const key = shade.map((v) => v.toFixed(3)).join();
  let g = gradients.get(key);
  if (!g) {
    const c = new THREE.Color().setRGB(shade[0], shade[1], shade[2], THREE.SRGBColorSpace);
    const steps = new Uint8Array([c.r * 255, c.g * 255, c.b * 255, 255, 255, 255, 255, 255]);
    g = new THREE.DataTexture(steps, 2, 1, THREE.RGBAFormat);
    g.minFilter = g.magFilter = THREE.NearestFilter;
    g.generateMipmaps = false;
    g.needsUpdate = true;
    gradients.set(key, g);
  }
  return g;
}

function animeMaterial(src: THREE.MeshStandardMaterial, look: Look): THREE.MeshToonMaterial {
  const hints = src.userData as AnimeHints;
  const kind = hints.kind ?? "cloth";
  const m = new THREE.MeshToonMaterial({
    color: src.color,
    map: src.map,
    gradientMap: shadeRamp(hints.shade ?? [0.75, 0.75, 0.85]),
    transparent: src.transparent,
    alphaTest: src.alphaTest,
    side: src.side,
    depthWrite: src.depthWrite,
  });
  m.name = src.name;
  if (kind === "hair" && look.hair) m.color.multiply(new THREE.Color(look.hair));
  if (kind === "cloth" && look.outfit) m.color.multiply(new THREE.Color(look.outfit));
  if (kind === "skin" || kind === "cloth" || kind === "hair") outlineOf(m, 0.0028);
  else noOutline(m);
  return m;
}

/** World rotation of a weapon held in each hand in the T-pose, as on the KayKit rig. */
const GRIP = {
  right: { bone: "rightHand", side: -1, quat: new THREE.Quaternion(0, Math.SQRT1_2, Math.SQRT1_2, 0).multiply(new THREE.Quaternion(0, 1, 0, 0)) },
  left: { bone: "leftHand", side: 1, quat: new THREE.Quaternion(0, Math.SQRT1_2, Math.SQRT1_2, 0) },
};
/** Where the closed fist holds the grip, from the hand bone (metres, T-pose). */
const GRIP_OFFSET = { out: 0.07, down: -0.025 };

function attachWeapon(rig: THREE.Object3D, name: string): void {
  const weapon = buildWeapon(name);
  if (!weapon) return;
  const grip = name.endsWith("_Offhand") ? GRIP.left : GRIP.right;
  const hand = rig.getObjectByName(grip.bone);
  if (!hand) return;
  rig.updateMatrixWorld(true);
  const toRig = new THREE.Matrix4().copy(rig.matrixWorld).invert().multiply(hand.matrixWorld);
  const handPos = new THREE.Vector3();
  const handQuat = new THREE.Quaternion();
  toRig.decompose(handPos, handQuat, new THREE.Vector3());
  const at = handPos.add(new THREE.Vector3(grip.side * GRIP_OFFSET.out, GRIP_OFFSET.down, 0));
  weapon.position.copy(at.applyMatrix4(toRig.clone().invert()));
  weapon.quaternion.copy(handQuat.invert().multiply(grip.quat));
  hand.add(weapon);
}

function instantiateAnime(lib: ModelLibrary, look: Look): ModelInstance {
  const t = lib.anime.get(look.model)!;
  const rig = SkeletonUtils.clone(t.rig) as THREE.Group;
  const materials: THREE.MeshToonMaterial[] = [];
  rig.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const src = o.material as THREE.MeshStandardMaterial;
    // Draw order from the avatar (eyelashes and highlights over the face).
    o.renderOrder = ((src.userData as AnimeHints).queue ?? 2000) - 2000;
    const m = animeMaterial(src, look);
    o.material = m;
    o.castShadow = true;
    o.receiveShadow = false;
    o.frustumCulled = false;
    materials.push(m);
  });
  clenchFists(rig);
  for (const w of look.show) attachWeapon(rig, w);
  const root = new THREE.Group();
  root.add(rig);
  rig.scale.setScalar(ANIME_HEIGHT / t.height);
  return { root, mixer: new THREE.AnimationMixer(rig), clips: animeClips(lib, t), materials };
}
