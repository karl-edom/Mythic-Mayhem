// The arena's surroundings: lights, the landscape beyond the walls, the floor,
// the boundary walls, grass, and the props (built in props3d.ts).

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Arena } from "../brawl/arena.ts";
import { buildLandscape } from "./landscape.ts";
import { buildProp, stonework, type Theme } from "./props3d.ts";
import {
  dirtTexture, grassTexture, noOutline, outlineOf, pavingTexture,
} from "./toon.ts";

export function themeOf(arena: Arena): Theme {
  const id = arena.def.id;
  if (/japan|sanctuaire|shrine|kyoto/.test(id)) return "japan";
  return id.includes("village") ? "village" : "meadow";
}

/** Seeded random so the scenery is the same every match on a map. */
function rand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, shadows = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = shadows;
  m.receiveShadow = true;
  return m;
}

export interface Environment {
  /** One object per arena prop, same order as arena.props. */
  props: THREE.Object3D[];
  sun: THREE.DirectionalLight;
}

export function buildEnvironment(scene: THREE.Scene, arena: Arena): Environment {
  const { halfW, halfD } = arena;
  const span = Math.max(halfW, halfD);
  const theme = themeOf(arena);
  const r = rand(theme === "village" ? 99 : 42);

  // Afternoon light: warm sun from high on one side, cool sky fill, warm bounce from the ground.
  scene.add(new THREE.HemisphereLight(0xd6e8ff, 0x7a6a48, 1.15));
  const sun = new THREE.DirectionalLight(0xffeccc, 2.9);
  sun.position.set(span * 0.7, span * 1.5, span * 0.5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0008;
  sun.shadow.normalBias = 0.06;
  Object.assign(sun.shadow.camera, { left: -span - 12, right: span + 12, top: span + 12, bottom: -span - 12, far: span * 5 });
  scene.add(sun);

  // Everything beyond the walls: hills, fields, river, woods, a town, sky and clouds.
  buildLandscape(scene, arena, sun.position.clone(), { theme, seed: theme === "village" ? 7 : 3 });

  // The arena floor inside the walls.
  const floorTex = theme === "village" ? pavingTexture() : theme === "japan" ? dirtTexture("#e6dcc6") : dirtTexture();
  floorTex.repeat.set(halfW / 3, halfD / 3);
  const floorMat = noOutline(new THREE.MeshStandardMaterial({ color: theme === "village" ? 0xffffff : 0xfff6e0, map: floorTex, roughness: 0.95 }));
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2 + 1.6, halfD * 2 + 1.6), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.01;
  floor.receiveShadow = true;
  scene.add(floor);
  if (theme === "meadow") {
    // Meadow arena: grass over most of the floor, a worn dirt ring in the middle.
    const inner = noOutline(new THREE.MeshStandardMaterial({ color: 0xffffff, map: grassTexture("#8fcb68"), roughness: 0.95 }));
    inner.map!.repeat.set(halfW / 2, halfD / 2);
    inner.transparent = true;
    inner.alphaMap = radialMask();
    const g = new THREE.Mesh(new THREE.PlaneGeometry(halfW * 2, halfD * 2), inner);
    g.rotation.x = -Math.PI / 2;
    g.position.y = 0.015;
    g.receiveShadow = true;
    scene.add(g);
  }

  // Boundary: coursed stone walls with merlons (white plaster and tiles in Japan).
  const wr = rand(5);
  const capMat = new THREE.MeshStandardMaterial({ color: theme === "japan" ? 0x4a505a : 0xd8cfba, roughness: 0.9 });
  const edge = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const wall = stonework(len, 1.2, 0.8, wr, theme === "japan" ? "#b9b2a4" : "#cfc6b2");
    wall.position.set((x0 + x1) / 2, 0, (z0 + z1) / 2);
    wall.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
    scene.add(wall);
    if (theme === "japan") {
      const cap = mesh(new THREE.BoxGeometry(len + 0.6, 0.18, 1.2), capMat);
      cap.position.set(wall.position.x, 1.29, wall.position.z);
      cap.rotation.y = wall.rotation.y;
      scene.add(cap);
      return;
    }
    const n = Math.floor(len / 1.6);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const c = mesh(new THREE.BoxGeometry(0.7, 0.4, 0.8), capMat);
      c.position.set(x0 + (x1 - x0) * t, 1.4, z0 + (z1 - z0) * t);
      c.rotation.y = wall.rotation.y;
      scene.add(c);
    }
  };
  const o = 0.4;
  edge(-halfW - o, -halfD - o, halfW + o, -halfD - o);
  edge(halfW + o, -halfD - o, halfW + o, halfD + o);
  edge(halfW + o, halfD + o, -halfW - o, halfD + o);
  edge(-halfW - o, halfD + o, -halfW - o, -halfD - o);

  // Grass tufts on the meadow floor away from props (instanced: cheap).
  {
    const blades = [-0.5, 0, 0.5].map((tilt, i) => {
      const b = new THREE.ConeGeometry(0.05, 0.38, 3);
      b.translate(0, 0.19, 0);
      b.rotateZ(tilt * 0.5);
      b.rotateY((i * Math.PI * 2) / 3);
      return b;
    });
    const tuft = mergeGeometries(blades);
    const n = 900;
    const inst = new THREE.InstancedMesh(tuft, noOutline(new THREE.MeshStandardMaterial({ color: 0x5f9e45, roughness: 0.9 })), n);
    const m4 = new THREE.Matrix4();
    let k = 0;
    for (let i = 0; i < n * 3 && k < n; i++) {
      const x = (r() * 2 - 1) * halfW;
      const z = (r() * 2 - 1) * halfD;
      const inside = true;
      if (inside && (theme === "village" || arena.props.some((p) => Math.abs(p.x - x) < p.halfW + 0.3 && Math.abs(p.z - z) < p.halfD + 0.3))) continue;
      if (inside && Math.hypot(x / halfW, z / halfD) < 0.75) continue;
      m4.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, r() * 6, (r() - 0.5) * 0.5)), new THREE.Vector3(1, 0.7 + r() * 0.8, 1));
      inst.setMatrixAt(k++, m4);
    }
    inst.count = k;
    inst.receiveShadow = true;
    scene.add(inst);
  }

  const props = arena.props.map((p) => {
    const obj = buildProp(p, theme);
    obj.position.set(p.x, 0, p.z);
    obj.userData.prop = p.id;
    scene.add(obj);
    return obj;
  });
  // Torii: in Japan, two vermilion posts side by side get their crossbeams. The beams
  // belong to the first post, so they go when it breaks.
  if (theme === "japan")
    arena.props.forEach((a, i) => {
      const b = arena.props.find((q) => q !== a && q.kind.look === "pillar" && Math.abs(q.z - a.z) < 0.1 && q.x - a.x > 2 && q.x - a.x < 5);
      if (a.kind.look !== "pillar" || !b) return;
      props[i]!.add(toriiBeams(b.x - a.x, a.height, a.halfW));
    });
  // Outlines on everything solid; props carry their own materials.
  for (const o of props)
    o.traverse((m) => {
      if (m instanceof THREE.Mesh) outlineOf(m.material as THREE.Material, 0.003);
    });
  return { props, sun };
}

/** Kasagi (black top beam, ends swept up) over a vermilion nuki, spanning two posts `gap` apart. */
function toriiBeams(gap: number, h: number, r: number): THREE.Group {
  const g = new THREE.Group();
  const len = gap + r * 4;
  const top = new THREE.BoxGeometry(len, 0.35, 0.6, 16, 1, 1);
  const pos = top.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getX(i) / (len / 2);
    pos.setY(i, pos.getY(i) + t * t * 0.35);
  }
  top.computeVertexNormals();
  const kasagi = mesh(top, new THREE.MeshStandardMaterial({ color: 0x1f1b1b, roughness: 0.4 }));
  kasagi.position.set(gap / 2, h + 0.35, 0);
  g.add(kasagi);
  const red = new THREE.MeshStandardMaterial({ color: 0xd2452f, roughness: 0.5 });
  const shimaki = mesh(new THREE.BoxGeometry(len - 0.4, 0.3, 0.5), red);
  shimaki.position.set(gap / 2, h + 0.05, 0);
  g.add(shimaki);
  const nuki = mesh(new THREE.BoxGeometry(gap + r * 2.6, 0.28, 0.32), red);
  nuki.position.set(gap / 2, h - 0.9, 0);
  g.add(nuki);
  const plaque = mesh(new THREE.BoxGeometry(0.5, 0.75, 0.12), new THREE.MeshStandardMaterial({ color: 0x1f1b1b, roughness: 0.4 }));
  plaque.position.set(gap / 2, h - 0.45, 0);
  g.add(plaque);
  return g;
}

/** Alpha mask: opaque at the edges, clear in a soft central circle (the worn fighting ground). */
function radialMask(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(128, 128, 30, 128, 128, 128);
  grad.addColorStop(0, "black");
  grad.addColorStop(0.45, "black");
  grad.addColorStop(0.75, "white");
  grad.addColorStop(1, "white");
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
}
