// VRM avatars (VRoid and the like) as fighter models. The file ships in the fighter's
// pack (packs/local/<id>/<file>.vrm, never committed); the look names it: { "model":
// "vrm", "file": "naruto.vrm" }. The avatar is turned to face +Z like the other rigs,
// and its bones take their humanoid names (hips, leftUpperArm…), the names every clip
// of the game is written for: the shared clips and the hand-keyed stances are carried
// over to it by retargeting (retarget.ts), as for the models built in code.
// @pixiv/three-vrm (MIT) reads the format: VRM 0.x and 1.0, materials (MToon).

import * as ThreeVrm from "@pixiv/three-vrm";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// The package's type declarations do not all resolve under this project's module
// settings (folders without an index extension): the few calls used are typed here.
interface VRM {
  scene: THREE.Group;
  humanoid: { humanBones: Record<string, { node: THREE.Object3D } | undefined>; autoUpdateHumanBones: boolean };
}
const { VRMLoaderPlugin } = ThreeVrm;
const VRMUtils = (ThreeVrm as unknown as {
  VRMUtils: { removeUnnecessaryVertices(root: THREE.Object3D): void; rotateVRM0(vrm: VRM): void };
}).VRMUtils;

/** "json" on hosts that serve no .glb/.vrm files (the published page): wrapped in JSON. */
const EXT = (import.meta.env?.VITE_MODEL_EXT as string | undefined) ?? "glb";

/**
 * Where a pack's VRM file is: in development, the file itself (packs/local/<id>/<file>);
 * on the published page, next to it as packs/<id>/<file>.json (see tools/artifact.ts).
 */
export function vrmUrl(packDir: string, file: string): string {
  const id = packDir.split("/").filter(Boolean).at(-1)!;
  return EXT === "glb" ? `${packDir}/${file}` : new URL(`packs/${id}/${file}.json`, document.baseURI).href;
}

/** The file's bytes, unwrapped from its JSON on the published page. */
async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} : HTTP ${res.status}`);
  if (EXT === "glb") return res.arrayBuffer();
  const { glb } = (await res.json()) as { glb: string };
  return Uint8Array.from(atob(glb), (c) => c.charCodeAt(0)).buffer;
}

export interface VrmRig {
  /** The avatar, facing +Z, its feet at y = 0, bones named after the humanoid bones. */
  rig: THREE.Group;
  /** Height from the soles to the top of the head (metres, as modelled). */
  height: number;
  vrm: VRM;
}

/** Loads a VRM file into a rig the game can animate. */
export async function loadVrm(url: string): Promise<VrmRig> {
  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  const bytes = await fetchBytes(url);
  // Textures through <img> elements rather than fetch(blob:), which such hosts refuse
  // (the loader picks its image loader when the parse starts, synchronously).
  const g = globalThis as { createImageBitmap?: unknown };
  const saved = g.createImageBitmap;
  g.createImageBitmap = undefined;
  let parsing: Promise<{ scene: THREE.Group; userData: Record<string, unknown> }>;
  try {
    parsing = loader.parseAsync(bytes, "");
  } finally {
    g.createImageBitmap = saved;
  }
  const gltf = await parsing;
  const vrm = gltf.userData.vrm as VRM;
  VRMUtils.removeUnnecessaryVertices(gltf.scene);
  // VRM 0.x avatars face −Z: a half turn, as VRM 1.0 ones (no-op for those).
  VRMUtils.rotateVRM0(vrm);
  // The bones under their humanoid names (VRM 1.0 names, three-vrm converts 0.x ones).
  for (const [name, bone] of Object.entries(vrm.humanoid.humanBones)) if (bone?.node) bone.node.name = name;
  // The normalized copy of the skeleton that three-vrm keeps is not used: the clips
  // move the bones themselves.
  vrm.humanoid.autoUpdateHumanBones = false;
  const rig = new THREE.Group();
  rig.name = "vrm";
  rig.add(vrm.scene);
  rig.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(vrm.scene);
  // Feet on the floor.
  vrm.scene.position.y -= box.min.y;
  rig.updateMatrixWorld(true);
  return { rig, height: box.max.y - box.min.y, vrm };
}
