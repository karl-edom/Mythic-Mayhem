// Builds the anime fighters' 3D models from VRoid Studio sample avatars released
// under CC0 by pixiv (VRoid Studio beta presets, mirrored in github.com/madjin/vrm-samples).
// The CC0 licence is checked in each file's own VRM metadata before anything is written.
//
//   node tools/build-anime.ts
//
// For each avatar:
// - downloads the .vrm (a glTF file; cached in .cache/vrm/, git-ignored);
// - renames the humanoid bones to their VRM names ("hips", "leftUpperArm"…), so the
//   client can retarget the shared animations without knowing each rig;
// - keeps the anime shading hints (MToon shade colour, draw order, part kind) in each
//   material's extras, drops facial morph targets and the VRM extension;
// - shrinks textures (WebP, 1024 px max) and quantises geometry (no decoder needed).
// Output: public/models/anime/<id>.glb (committed) and CREDITS.txt.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { NodeIO, type Primitive } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP, KHRMeshQuantization } from "@gltf-transform/extensions";
import { dedup, joinPrimitives, prune, quantize, textureCompress } from "@gltf-transform/functions";
import sharp from "sharp";

const ROOT = new URL("../", import.meta.url).pathname;
const CACHE = join(ROOT, ".cache/vrm");
const OUT = join(ROOT, "public/models/anime");
const SOURCE = "https://raw.githubusercontent.com/madjin/vrm-samples/master/vroid/beta/";

/** Model id → source file. Only avatars whose metadata says CC0. */
export const AVATARS = {
  kaito: "HairSample_Male",
  fumiriya: "Sakurada_Fumiriya",
  shino: "Sendagaya_Shino",
  akane: "Darkness_Shibu",
  vita: "Vita",
  rubin: "Victoria_Rubin",
} as const;

/** Material name suffix (VRoid convention) → part kind used by the client's shading. */
function kindOf(material: string): string {
  const m = /_(SKIN|CLOTH|HAIR|FACE|EYE)$/.exec(material);
  return m ? m[1]!.toLowerCase() : "cloth";
}

async function source(file: string): Promise<Uint8Array> {
  mkdirSync(CACHE, { recursive: true });
  const path = join(CACHE, `${file}.vrm`);
  if (!existsSync(path)) {
    const res = await fetch(`${SOURCE}${file}.vrm`);
    if (!res.ok) throw new Error(`${file}.vrm : HTTP ${res.status}`);
    writeFileSync(path, new Uint8Array(await res.arrayBuffer()));
  }
  return readFileSync(path);
}

interface VrmJson {
  extensions: {
    VRM: {
      meta: { title?: string; author?: string; licenseName?: string };
      humanoid: { humanBones: { bone: string; node: number }[] };
      materialProperties: { name: string; renderQueue: number; vectorProperties: Record<string, number[]> }[];
    };
  };
}

/** The JSON chunk of a .glb/.vrm file. */
function gltfJson(bytes: Uint8Array): VrmJson {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const len = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + len)));
}

const io = new NodeIO().registerExtensions([...ALL_EXTENSIONS, KHRMeshQuantization, EXTTextureWebP]);
mkdirSync(OUT, { recursive: true });
const credits: string[] = [];

for (const [id, file] of Object.entries(AVATARS)) {
  const bytes = await source(file);
  const vrm = gltfJson(bytes).extensions.VRM;
  if (vrm.meta.licenseName !== "CC0") throw new Error(`${file} : licence ${vrm.meta.licenseName}, CC0 attendu`);
  const doc = await io.readBinary(bytes);
  const root = doc.getRoot();

  // Humanoid bones take their VRM names (node order is preserved by the reader).
  const nodes = root.listNodes();
  for (const b of vrm.humanoid.humanBones) nodes[b.node]!.setName(b.bone);

  // Anime shading hints, read by the client.
  const props = new Map(vrm.materialProperties.map((p) => [p.name, p]));
  for (const m of root.listMaterials()) {
    const p = props.get(m.getName());
    const shade = p?.vectorProperties._ShadeColor?.slice(0, 3) ?? [0.7, 0.7, 0.8];
    m.setExtras({ kind: kindOf(m.getName()), shade, queue: p?.renderQueue ?? 2000 });
  }

  // No facial expressions in the game for now: morph targets only cost size.
  for (const mesh of root.listMeshes()) {
    mesh.setWeights([]);
    for (const prim of mesh.listPrimitives()) for (const t of prim.listTargets()) prim.removeTarget(t), t.dispose();
  }

  // The client lights and shades every material itself: drop the "unlit" fallback flag
  // (otherwise the normals look unused and get pruned).
  for (const ext of root.listExtensionsUsed()) if (ext.extensionName === "VRM" || ext.extensionName === "KHR_materials_unlit") ext.dispose();
  root.listScenes()[0]!.setExtras({ source: `VRoid Studio — ${vrm.meta.title ?? file}`, license: "CC0-1.0", vrm: "0.x" });

  // VRoid splits hair into ~100 pieces: one draw call per material instead. (The stock
  // join() transform skips skinned meshes; within one mesh the skin is shared, so it is safe.)
  await doc.transform(dedup());
  for (const mesh of root.listMeshes()) {
    const groups = new Map<string, Primitive[]>();
    for (const prim of mesh.listPrimitives()) {
      const key = `${prim.getMaterial()?.getName()}|${prim.getMode()}|${prim.listSemantics().sort().join()}`;
      groups.set(key, [...(groups.get(key) ?? []), prim]);
    }
    for (const prims of groups.values()) {
      if (prims.length < 2) continue;
      mesh.addPrimitive(joinPrimitives(prims));
      for (const p of prims) mesh.removePrimitive(p), p.dispose();
    }
  }

  await doc.transform(
    dedup(),
    prune({ keepAttributes: true }),
    textureCompress({ encoder: sharp, targetFormat: "webp", resize: [1024, 1024], quality: 88 }),
    quantize(),
  );
  const out = await io.writeBinary(doc);
  writeFileSync(join(OUT, `${id}.glb`), out);
  credits.push(`${id}.glb — « ${vrm.meta.title ?? file} », VRoid Studio (pixiv Inc.), CC0 1.0. Source : ${SOURCE}${file}.vrm`);
  console.log(`${id}.glb (${file}) : ${(out.byteLength / 1024).toFixed(0)} Ko`);
}

writeFileSync(
  join(OUT, "CREDITS.txt"),
  [
    "Modèles 3D des combattants anime.",
    "Avatars d'exemple de VRoid Studio (version bêta), publiés par pixiv Inc. sous licence CC0 1.0",
    "(domaine public, https://creativecommons.org/publicdomain/zero/1.0/). La licence est vérifiée",
    "dans les métadonnées VRM de chaque fichier par tools/build-anime.ts.",
    "Modifications : os renommés, expressions faciales retirées, textures réduites, géométrie quantifiée.",
    "",
    ...credits,
    "",
  ].join("\n"),
);
