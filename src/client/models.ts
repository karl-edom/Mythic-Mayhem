// Character models: loads the KayKit meshes and the shared animation file,
// then builds one cel-shaded, outlined instance per fighter.

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { MODELS, type Look, type ModelId } from "../brawl/character.ts";
import type { Archetype } from "../brawl/kit.ts";
import { outlineOf, toToon } from "./toon.ts";

/** Fighters stand this tall on screen (feet to top of head). */
const MODEL_HEIGHT = 1.95;

/** Meshes that make the body itself; everything else is an accessory shown on request. */
const BODY_PART = /_(ArmLeft|ArmRight|Body|Head|Head_Hooded|LegLeft|LegRight)$/;

export interface ModelLibrary {
  templates: Map<ModelId, THREE.Object3D>;
  clips: Map<string, THREE.AnimationClip>;
}

/** Fallback look from the kit archetype, for packs that do not choose one. */
export function defaultLook(archetype: Archetype): Look {
  switch (archetype) {
    case "rushdown":
      return { model: "rogue_hooded", show: ["Knife", "Knife_Offhand", "Rogue_Cape"], tint: "#ffffff" };
    case "heavy":
      return { model: "barbarian", show: ["2H_Axe", "Barbarian_Hat", "Barbarian_Cape"], tint: "#ffffff" };
    case "zoner":
      return { model: "mage", show: ["2H_Staff", "Mage_Hat", "Mage_Cape"], tint: "#ffffff" };
    default:
      return { model: "knight", show: ["1H_Sword", "Round_Shield", "Knight_Cape"], tint: "#ffffff" };
  }
}

export type WeaponStyle = "1h" | "2h" | "dual" | "unarmed";

/** How the fighter holds its weapons, from what the look shows. Picks the attack animations. */
export function weaponStyle(look: Look): WeaponStyle {
  const shown = look.show;
  if (shown.some((s) => s.startsWith("2H_"))) return "2h";
  if (shown.some((s) => s.endsWith("_Offhand"))) return "dual";
  if (shown.some((s) => /^1H_|^Knife$/.test(s))) return "1h";
  return "unarmed";
}

export async function loadModels(base: string, onProgress?: (done: number, total: number) => void): Promise<ModelLibrary> {
  const loader = new GLTFLoader();
  const files = [...MODELS.map((m) => `${m}.glb`), "animations.glb"];
  let done = 0;
  const loaded = await Promise.all(
    files.map(async (f) => {
      const g = await loader.loadAsync(new URL(f, base).href);
      onProgress?.(++done, files.length);
      return g;
    }),
  );
  const templates = new Map<ModelId, THREE.Object3D>();
  MODELS.forEach((m, i) => templates.set(m, loaded[i]!.scene));
  const clips = new Map(loaded.at(-1)!.animations.map((c) => [c.name, c] as const));
  return { templates, clips };
}

export interface ModelInstance {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  /** Toon materials of the body, for hit flashes. */
  materials: THREE.MeshToonMaterial[];
  /** Bone where the main weapon sits, for slash trails. */
  hand: THREE.Object3D | null;
}

export function instantiate(lib: ModelLibrary, look: Look): ModelInstance {
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
  const mixer = new THREE.AnimationMixer(model);
  return { root, mixer, materials, hand: model.getObjectByName("handslot.r") ?? null };
}
