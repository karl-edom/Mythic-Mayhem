// Builds the shared animations from the KayKit "Adventurers" pack (Kay Lousberg,
// CC0 1.0 — public domain, see public/models/kaykit/LICENSE.txt).
//
//   node tools/build-models.ts
//
// - downloads the source .glb (cached in .cache/kaykit/, git-ignored);
// - writes animations.glb: the Knight's skeleton and only the clips the game uses,
//   retargeted at run time onto the models built in code. (The KayKit characters
//   themselves were retired with the first fighters, decision 0024.)
// Output: public/models/kaykit/animations.glb (committed).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeIO, type Document } from "@gltf-transform/core";
import { EXTMeshoptCompression, KHRMeshQuantization, ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { dedup, meshopt, prune, quantize, resample } from "@gltf-transform/functions";
import { MeshoptDecoder, MeshoptEncoder } from "meshoptimizer";

const ROOT = new URL("../", import.meta.url).pathname;
const CACHE = join(ROOT, ".cache/kaykit");
const OUT = join(ROOT, "public/models/kaykit");
const SOURCE =
  "https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/main/addons/kaykit_character_pack_adventures/Characters/gltf/";

/** Clips the client maps onto fighter states (see src/client/animations.ts). */
export const CLIPS = [
  "Idle", "2H_Melee_Idle", "Unarmed_Idle",
  "Running_A", "Running_B", "Running_Strafe_Left", "Running_Strafe_Right", "Walking_Backwards",
  "1H_Melee_Attack_Slice_Diagonal", "1H_Melee_Attack_Slice_Horizontal", "1H_Melee_Attack_Chop", "1H_Melee_Attack_Stab",
  "2H_Melee_Attack_Chop", "2H_Melee_Attack_Slice", "2H_Melee_Attack_Spin", "2H_Melee_Attack_Stab",
  "Dualwield_Melee_Attack_Stab", "Unarmed_Melee_Attack_Punch_A", "Unarmed_Melee_Attack_Punch_B", "Unarmed_Melee_Attack_Kick",
  "Spellcast_Shoot", "Spellcast_Long", "Spellcast_Raise", "Spellcasting", "1H_Ranged_Shoot",
  "Block", "Blocking", "Block_Hit", "Hit_A", "Hit_B",
  "Dodge_Backward", "Dodge_Forward", "Dodge_Left", "Dodge_Right",
  "Jump_Start", "Jump_Idle", "Jump_Land",
  "Death_A", "Death_B", "Lie_Idle", "Lie_StandUp",
  "PickUp", "Throw", "Cheer",
] as const;

async function source(name: string): Promise<Uint8Array> {
  mkdirSync(CACHE, { recursive: true });
  const file = join(CACHE, `${name}.glb`);
  if (!existsSync(file)) {
    const res = await fetch(`${SOURCE}${name}.glb`);
    if (!res.ok) throw new Error(`${name}.glb : HTTP ${res.status}`);
    writeFileSync(file, new Uint8Array(await res.arrayBuffer()));
  }
  return readFileSync(file);
}

/** Removes an animation with its channels and samplers; prune() then drops keyframe data nobody uses (inputs can be shared). */
function dropAnimation(a: ReturnType<Document["getRoot"]>["listAnimations"] extends () => (infer T)[] ? T : never): void {
  for (const c of a.listChannels()) c.dispose();
  for (const s of a.listSamplers()) s.dispose();
  a.dispose();
}

/**
 * Quantised geometry (KHR_mesh_quantization) needs no decoder in the browser, so the
 * models also load where WebAssembly is not allowed. MODELS_MESHOPT=1 builds smaller
 * meshopt-compressed files instead (needs the decoder).
 */
async function compress(doc: Document): Promise<void> {
  if (process.env.MODELS_MESHOPT === "1") await doc.transform(dedup(), prune(), meshopt({ encoder: MeshoptEncoder, level: "medium" }));
  else await doc.transform(dedup(), prune(), quantize());
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions([...ALL_EXTENSIONS, EXTMeshoptCompression, KHRMeshQuantization])
  .registerDependencies({ "meshopt.encoder": MeshoptEncoder, "meshopt.decoder": MeshoptDecoder });
mkdirSync(OUT, { recursive: true });

// Shared animations: the Knight's skeleton and the kept clips, no meshes or textures.
{
  const doc = await io.readBinary(await source("Knight"));
  const keep = new Set<string>(CLIPS);
  for (const a of doc.getRoot().listAnimations()) if (!keep.has(a.getName())) dropAnimation(a);
  const missing = CLIPS.filter((c) => !doc.getRoot().listAnimations().some((a) => a.getName() === c));
  if (missing.length) throw new Error(`clips absents : ${missing.join(", ")}`);
  for (const n of doc.getRoot().listNodes()) {
    n.setMesh(null);
    n.setSkin(null);
  }
  for (const m of doc.getRoot().listMeshes()) m.dispose();
  for (const s of doc.getRoot().listSkins()) s.dispose();
  for (const t of doc.getRoot().listTextures()) t.dispose();
  for (const m of doc.getRoot().listMaterials()) m.dispose();
  await doc.transform(resample());
  await compress(doc);
  const bytes = await io.writeBinary(doc);
  writeFileSync(join(OUT, "animations.glb"), bytes);
  console.log(`animations.glb : ${CLIPS.length} clips, ${(bytes.byteLength / 1024).toFixed(0)} Ko`);
}

const license = await fetch("https://raw.githubusercontent.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0/main/LICENSE.txt");
writeFileSync(join(OUT, "LICENSE.txt"), await license.text());
